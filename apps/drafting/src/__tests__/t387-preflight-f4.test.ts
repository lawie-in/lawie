/**
 * T-387 - preflight F4 (vakalatnama) checks the enrolment number the draft will print, by the
 * same steps as buildPlaceholderContext (T-311): typed number wins; else the profile number only
 * when the printed name is from the profile; else blank (hard F4). The route passes the JWT
 * name, and reads the profile number only for vakalatnama.
 */
import './setupEnv';
import './setupDb';

import request from 'supertest';

import app from '../app';
import { seedVerifiedUsers } from './verifiedUser';
import { User } from '../models/User.model';
import { preflightCheck, type PreflightProfile } from '../services/preflight.service';

jest.setTimeout(60_000);

const MSG = 'Bar enrolment number is missing';
const PROFILE = { advocateName: 'Adv. Profile', enrollmentNumber: 'PROF/9/2000' };
const BASE = { applicant_name: 'Ramesh Kumar' };

type Res = Awaited<ReturnType<typeof preflightCheck>>;
const run = (formData: Record<string, unknown>, profile?: PreflightProfile, id = 'vakalatnama') =>
  preflightCheck(id, { ...BASE, ...formData }, undefined, profile);
const expectHardF4 = (r: Res) => {
  expect(r._meta?.rule_hits).toContain('F4');
  expect(r.verdict).toBe('hard');
  expect(r.hardBlockReason).toContain(MSG);
};
const expectNoF4 = (r: Res) => {
  expect(r._meta?.rule_hits).not.toContain('F4');
  expect(r.hardBlockReason ?? '').not.toContain(MSG);
};

describe('T-387 preflight F4 resolver', () => {
  it('profile name and number only (nothing typed): no F4', async () => {
    expectNoF4(await run({}, PROFILE));
  });
  it('typed number only, no profile: no F4', async () => {
    expectNoF4(await run({ advocate_enrollment: 'BIH/4321/2012' }));
  });
  it('typed number only, with a profile: no F4', async () => {
    expectNoF4(await run({ advocate_enrollment: 'BIH/4321/2012' }, PROFILE));
  });
  it('both empty (no typed value, no profile): hard F4', async () => {
    expectHardF4(await run({}));
  });
  it('empty typed number and a profile with no number: hard F4', async () => {
    expectHardF4(await run({ advocate_enrollment: '  ' }, { advocateName: 'Adv. Profile' }));
  });
  it('typed name + profile number, no typed number: hard F4 (another advocate)', async () => {
    expectHardF4(await run({ advocate_name: 'Adv. Someone Else' }, PROFILE));
  });
  it('typed name + typed number: no F4', async () => {
    expectNoF4(
      await run({ advocate_name: 'Adv. Someone Else', advocate_enrollment: 'BIH/1/2001' }, PROFILE),
    );
  });
  it('profile number but no profile name: hard F4 (name is not from the profile)', async () => {
    expectHardF4(await run({}, { enrollmentNumber: 'PROF/9/2000' }));
  });
  it('a non-vakalatnama template is unaffected (no F4 even with nothing)', async () => {
    const r = await preflightCheck('affidavit_identity', { applicant_name: 'R' });
    expect(r._meta?.rule_hits).not.toContain('F4');
    expect(r.hardBlockReason ?? '').not.toContain(MSG);
  });
});

describe('T-387 POST /preflight route', () => {
  const headers = (name = 'Adv. Profile') => ({
    'x-internal-secret': process.env.INTERNAL_SECRET ?? '',
    'x-user-id': '507f1f77bcf86cd799439387',
    'x-user-email': 'test@test.com',
    'x-user-name': name,
    'x-user-plan': 'pro',
    'x-user-role': 'Client',
  });
  // The profile read (no projection argument) is stubbed. The T-522 fence read (it passes a
  // projection) goes to the real model, so the seeded verified user lets the request through and
  // the spy counts only the profile read.
  const stubUser = (number: string | null) => {
    const real = User.findById.bind(User);
    return jest.spyOn(User, 'findById').mockImplementation(((id: unknown, projection?: unknown) =>
      projection
        ? real(id as never, projection as never)
        : {
            select: () => ({
              maxTimeMS: () => ({ lean: () => Promise.resolve({ enrollmentNumber: number }) }),
            }),
          }) as never);
  };

  // Profile reads only: the T-522 fence read passes a projection as a second argument.
  const profileReads = (spy: jest.SpyInstance) =>
    spy.mock.calls.filter((c: unknown[]) => c.length === 1).length;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('vakalatnama: reads the profile number, and the profile name+number clears F4', async () => {
    const spy = stubUser('PROF/9/2000');
    const res = await request(app)
      .post('/preflight')
      .set(headers())
      .send({ template_id: 'vakalatnama', form_data: BASE });
    expect(res.status).toBe(200);
    expect(profileReads(spy)).toBe(1);
    expect(res.body.hardBlockReason ?? '').not.toContain(MSG);
  });

  it('vakalatnama: profile without a number and nothing typed is a hard F4', async () => {
    stubUser(null);
    const res = await request(app)
      .post('/preflight')
      .set(headers())
      .send({ template_id: 'vakalatnama', form_data: BASE });
    expect(res.body.verdict).toBe('hard');
    expect(res.body.hardBlockReason).toContain(MSG);
  });

  it('vakalatnama: a typed name makes the profile number not count', async () => {
    stubUser('PROF/9/2000');
    const res = await request(app)
      .post('/preflight')
      .set(headers())
      .send({ template_id: 'vakalatnama', form_data: { ...BASE, advocate_name: 'Adv. Other' } });
    expect(res.body.verdict).toBe('hard');
    expect(res.body.hardBlockReason).toContain(MSG);
  });

  it('another template: the profile number is not read', async () => {
    const spy = stubUser('PROF/9/2000');
    const res = await request(app)
      .post('/preflight')
      .set(headers())
      .send({ template_id: 'affidavit_identity', form_data: BASE });
    expect(res.status).toBe(200);
    expect(profileReads(spy)).toBe(0);
  });
});

seedVerifiedUsers('507f1f77bcf86cd799439387');
