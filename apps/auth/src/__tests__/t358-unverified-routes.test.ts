/**
 * T-358 (Arjun rulings 2-3) — POST /internal/unverified-notice/prepare and /outcome, the two
 * calls the email worker makes. Secret check (constant time), 400/401/404/409/200 shapes, and the
 * stamp: only once, only for an unverified account, 'bounced' counts as sent.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import crypto from 'crypto';

import { Types } from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { User } from '../models/User.model';
import { GOLDEN_SET_USER_ID } from '../services/account-erase.service';
import { verifyEmailToken } from '../services/verify-email.service';

const SECRET = process.env.INTERNAL_SECRET as string;
const PREPARE = '/internal/unverified-notice/prepare';
const OUTCOME = '/internal/unverified-notice/outcome';
const H = 'x-internal-secret';
const DAY = 24 * 60 * 60 * 1000;
const EMAIL = 'route.person@example.com';
const NAME = 'Route Person';

const rawOne = (id: string) => User.collection.findOne({ _id: new Types.ObjectId(id) });
async function seed(
  ageDays: number,
  extra: Record<string, unknown> = {},
  _id: Types.ObjectId = new Types.ObjectId(),
): Promise<string> {
  const createdAt = new Date(Date.now() - ageDays * DAY);
  await User.collection.insertOne({
    _id,
    email: EMAIL.replace('@', `${String(_id)}@`),
    name: NAME,
    authProvider: 'email',
    emailVerified: false,
    isActive: true,
    role: 'Advocate',
    createdAt,
    updatedAt: createdAt,
    ...extra,
  });
  return String(_id);
}
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const post = (path: string, body: unknown, secret: string | null = SECRET) => {
  const r = supertest(app).post(path);
  if (secret !== null) r.set(H, secret);
  return r.send(body as object);
};

let infoSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
beforeEach(() => {
  // verifyEmailToken signals drafting for the signup bonus; no network in tests.
  global.fetch = jest.fn(async () => ({ status: 200, json: async () => ({}) })) as never;
  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe.each([PREPARE, OUTCOME])('%s: secret', (path) => {
  it('no header -> 401, nothing written', async () => {
    const id = await seed(25);
    const res = await post(path, { userId: id, mail: 'verify', outcome: 'sent' }, null);
    expect(res.status).toBe(401);
    const u = await rawOne(id);
    expect(u!.emailVerifyTokenHash).toBeUndefined();
    expect(u!.unverifiedNoticeSentAt).toBeUndefined();
    expect(u!.firstVerifySentAt).toBeUndefined();
  });

  it.each([
    ['same length, last char differs', `${SECRET.slice(0, -1)}${SECRET.endsWith('x') ? 'y' : 'x'}`],
    ['shorter', 'short'],
    ['longer', `${SECRET}-and-more`],
    ['a prefix', SECRET.slice(0, 10)],
    ['empty', ''],
    ['upper-cased', SECRET.toUpperCase()],
  ])('wrong secret (%s) -> 401', async (_l, wrong) => {
    const id = await seed(25);
    const res = await post(path, { userId: id, mail: 'verify', outcome: 'sent' }, wrong);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    const u = await rawOne(id);
    expect(u!.emailVerifyTokenHash).toBeUndefined();
    expect(u!.unverifiedNoticeSentAt).toBeUndefined();
  });

  it('401 comes before body validation', async () => {
    expect((await post(path, {}, 'wrong-wrong-wrong-wrong')).status).toBe(401);
  });

  it('the compare is constant-time: timingSafeEqual on equal-length digests', async () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    await post(path, {}, 'short');
    await post(path, {}, `${SECRET.slice(0, -1)}!`);
    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of spy.mock.calls) {
      expect((call[0] as Buffer).length).toBe(32);
      expect((call[1] as Buffer).length).toBe(32);
    }
  });

  it('a missing userId -> 400', async () => {
    expect((await post(path, { mail: 'verify', outcome: 'sent' })).status).toBe(400);
    expect((await post(path, { userId: '', mail: 'verify', outcome: 'sent' })).status).toBe(400);
    expect((await post(path, { userId: 123, mail: 'verify', outcome: 'sent' })).status).toBe(400);
  });

  it('sets Cache-Control: no-store', async () => {
    const res = await post(path, {});
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('prepare', () => {
  it('200 first notice, variant A: notice, variant, email, name, link, deletionDate; token stored for exactly that link', async () => {
    const id = await seed(25);
    const res = await post(PREPARE, { userId: id });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual([
      'deletionDate',
      'email',
      'link',
      'name',
      'notice',
      'variant',
    ]);
    expect(res.body.notice).toBe('first');
    expect(res.body.variant).toBe('A');
    expect(res.body.email).toBe(EMAIL.replace('@', `${id}@`));
    expect(res.body.name).toBe(NAME);
    expect(res.body.deletionDate).toMatch(/^\d{1,2} [A-Z][a-z]+ 20\d{2}$/);
    const token = new URL(res.body.link).searchParams.get('token') as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const u = await rawOne(id);
    expect(u!.emailVerifyTokenHash).toBeDefined();
    expect(JSON.stringify(u)).not.toContain(token);
    expect(u!.emailVerifyKind).toBe('verify');
    // The T-358 notice link is verify-only (T-522): it never signs anyone in.
    expect(await verifyEmailToken(token)).toEqual({
      kind: 'verified',
      userId: id,
      linkKind: 'verify',
    });
    expect((await rawOne(id))!.emailVerifyKind).toBeUndefined();
  });

  it('the first notice link lasts 7 days', async () => {
    const id = await seed(25);
    await post(PREPARE, { userId: id });
    const exp = (await rawOne(id))!.emailVerifyExpires as Date;
    expect(Math.abs(exp.getTime() - (Date.now() + 7 * DAY))).toBeLessThan(60_000);
  });

  it('first notice date is 30 days ahead (IST); warning date is the later of F+30d and now+7d', async () => {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
    const first = await seed(25);
    const warn = await seed(80, { firstVerifySentAt: daysAgo(25), firstVerifySentVia: 'verify' });
    const a = await post(PREPARE, { userId: first });
    const b = await post(PREPARE, { userId: warn });
    const ok = (got: string, offset: number) =>
      [
        fmt.format(new Date(Date.now() + offset)),
        fmt.format(new Date(Date.now() + offset + 60_000)),
        fmt.format(new Date(Date.now() + offset - 60_000)),
      ].includes(got);
    expect(ok(a.body.deletionDate, 30 * DAY)).toBe(true);
    expect(b.body.notice).toBe('warning');
    expect(ok(b.body.deletionDate, 7 * DAY)).toBe(true);
  });

  it('prepare does not stamp: only the outcome does', async () => {
    const id = await seed(25);
    await post(PREPARE, { userId: id });
    const u = await rawOne(id);
    expect(u!.firstVerifySentAt).toBeUndefined();
    expect(u!.unverifiedNoticeSentAt).toBeUndefined();
  });

  it('warning (F 25 days ago): 200, notice "warning", variant A with a link', async () => {
    const id = await seed(80, { firstVerifySentAt: daysAgo(25) });
    const res = await post(PREPARE, { userId: id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ notice: 'warning', variant: 'A' });
    expect(res.body.link).toBeDefined();
  });

  it('variant B (isActive:false): 200 with no link key, nothing minted', async () => {
    const first = await seed(25, { isActive: false });
    const warn = await seed(80, { isActive: false, firstVerifySentAt: daysAgo(25) });
    for (const [id, notice] of [
      [first, 'first'],
      [warn, 'warning'],
    ] as const) {
      const res = await post(PREPARE, { userId: id });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ notice, variant: 'B', name: NAME });
      expect(Object.keys(res.body).sort()).toEqual([
        'deletionDate',
        'email',
        'name',
        'notice',
        'variant',
      ]);
      expect(res.body.link).toBeUndefined();
      const u = await rawOne(id);
      expect(u!.emailVerifyTokenHash).toBeUndefined();
      expect(u!.emailVerifyExpires).toBeUndefined();
    }
  });

  it('a second prepare mints a fresh link; the first stops working', async () => {
    const id = await seed(25);
    const a = await post(PREPARE, { userId: id });
    const b = await post(PREPARE, { userId: id });
    expect(a.body.link).not.toBe(b.body.link);
    const ta = new URL(a.body.link).searchParams.get('token') as string;
    const tb = new URL(b.body.link).searchParams.get('token') as string;
    expect(await verifyEmailToken(ta)).toEqual({ kind: 'expired_or_invalid' });
    expect(await verifyEmailToken(tb)).toEqual({
      kind: 'verified',
      userId: id,
      linkKind: 'verify',
    });
  });

  it('404 for an unknown user, and for a value that is not an ObjectId', async () => {
    const r1 = await post(PREPARE, { userId: String(new Types.ObjectId()) });
    expect(r1.status).toBe(404);
    expect(r1.body).toEqual({ error: 'not_found' });
    expect((await post(PREPARE, { userId: 'not-an-object-id' })).status).toBe(404);
  });

  it.each([
    ['younger than 24 h with no F', () => seed(0.5)],
    ['F only 10 days ago', () => seed(80, { firstVerifySentAt: daysAgo(10) })],
    [
      'warning already confirmed',
      () => seed(80, { firstVerifySentAt: daysAgo(25), unverifiedNoticeSentAt: new Date() }),
    ],
    ['verified', () => seed(25, { emailVerified: true })],
    ['Google provider', () => seed(25, { authProvider: 'google' })],
    ['has a googleId', () => seed(25, { googleId: 'g-1' })],
    ['Admin', () => seed(25, { role: 'Admin' })],
    ['golden-set user', () => seed(25, {}, new Types.ObjectId(GOLDEN_SET_USER_ID))],
    [
      'being erased',
      () => seed(25, { erasure: { requestedAt: new Date(), stage: 'locked' }, isActive: false }),
    ],
  ])('409 not_eligible, nothing minted: %s', async (_l, make) => {
    const id = await make();
    const res = await post(PREPARE, { userId: id });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_eligible' });
    expect((await rawOne(id))!.emailVerifyTokenHash).toBeUndefined();
  });

  it('a service error is a 500 with no body detail', async () => {
    const id = await seed(25);
    jest.spyOn(User, 'findOne').mockImplementation((() => {
      throw new Error(`db down for ${EMAIL}`);
    }) as never);
    const res = await post(PREPARE, { userId: id });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(EMAIL);
  });

  it('logs nothing with the address, name or link', async () => {
    const id = await seed(25);
    const res = await post(PREPARE, { userId: id });
    const text = JSON.stringify([infoSpy.mock.calls, warnSpy.mock.calls, errorSpy.mock.calls]);
    expect(text).not.toContain('@');
    expect(text).not.toContain(NAME);
    expect(text).not.toContain(res.body.link);
    expect(text).not.toContain('token');
  });
});

describe('outcome: { userId, mail, outcome }', () => {
  it.each(['sent', 'bounced'])(
    'verify %s: stamps F once via "verify" -> { firstStamped:true, warningStamped:false }',
    async (outcome) => {
      const id = await seed(25);
      const before = Date.now();
      const res = await post(OUTCOME, { userId: id, mail: 'verify', outcome });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ firstStamped: true, warningStamped: false });
      const u = await rawOne(id);
      const f = u!.firstVerifySentAt as Date;
      expect(f.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(f.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      expect(u!.firstVerifySentVia).toBe('verify');
      expect(u!.unverifiedNoticeSentAt).toBeUndefined();
    },
  );

  it('notice_first stamps F via "notice" and never the warning', async () => {
    const id = await seed(25);
    const res = await post(OUTCOME, { userId: id, mail: 'notice_first', outcome: 'sent' });
    expect(res.body).toEqual({ firstStamped: true, warningStamped: false });
    const u = await rawOne(id);
    expect(u!.firstVerifySentVia).toBe('notice');
    expect(u!.unverifiedNoticeSentAt).toBeUndefined();
  });

  it('notice_warning with F set stamps the warning only; F unchanged', async () => {
    const F = daysAgo(25);
    const id = await seed(80, { firstVerifySentAt: F, firstVerifySentVia: 'verify' });
    const res = await post(OUTCOME, { userId: id, mail: 'notice_warning', outcome: 'sent' });
    expect(res.body).toEqual({ firstStamped: false, warningStamped: true });
    const u = await rawOne(id);
    expect(u!.unverifiedNoticeSentAt).toBeInstanceOf(Date);
    expect((u!.firstVerifySentAt as Date).getTime()).toBe(F.getTime());
  });

  it('notice_warning with F null sets F only: the F-setting call never also stamps the warning', async () => {
    const id = await seed(25);
    const res = await post(OUTCOME, { userId: id, mail: 'notice_warning', outcome: 'sent' });
    expect(res.body).toEqual({ firstStamped: true, warningStamped: false });
    expect((await rawOne(id))!.unverifiedNoticeSentAt).toBeUndefined();
  });

  it('a repeat, or a verify email after the notice, does not move F -> both false', async () => {
    const id = await seed(25);
    await post(OUTCOME, { userId: id, mail: 'notice_first', outcome: 'sent' });
    const f1 = (await rawOne(id))!.firstVerifySentAt as Date;
    await new Promise((r) => setTimeout(r, 15));
    const res = await post(OUTCOME, { userId: id, mail: 'verify', outcome: 'sent' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ firstStamped: false, warningStamped: false });
    const u = await rawOne(id);
    expect((u!.firstVerifySentAt as Date).getTime()).toBe(f1.getTime());
    expect(u!.firstVerifySentVia).toBe('notice');
  });

  it('a bounced warning counts as sent', async () => {
    const id = await seed(80, { firstVerifySentAt: daysAgo(25) });
    const res = await post(OUTCOME, { userId: id, mail: 'notice_warning', outcome: 'bounced' });
    expect(res.body).toEqual({ firstStamped: false, warningStamped: true });
  });

  it.each([
    ['verified in the meantime', { emailVerified: true }],
    ['Google provider', { authProvider: 'google' }],
    ['has a googleId', { googleId: 'g-2' }],
    ['Admin', { role: 'Admin' }],
    ['being erased', { erasure: { requestedAt: new Date(), stage: 'locked' } }],
  ])('nothing stamped when the account is %s -> 200, both false', async (_l, extra) => {
    const id = await seed(25, extra);
    const res = await post(OUTCOME, { userId: id, mail: 'verify', outcome: 'sent' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ firstStamped: false, warningStamped: false });
    expect((await rawOne(id))!.firstVerifySentAt).toBeUndefined();
  });

  it('400 for a mail or outcome that is not in the list; nothing stamped', async () => {
    const id = await seed(25);
    for (const mail of ['notice', 'VERIFY', '', undefined, 1, null]) {
      expect((await post(OUTCOME, { userId: id, mail, outcome: 'sent' })).status).toBe(400);
    }
    for (const outcome of ['failed', 'SENT', '', undefined, 1, null]) {
      expect((await post(OUTCOME, { userId: id, mail: 'verify', outcome })).status).toBe(400);
    }
    // the round-1 body (no mail) is refused
    expect((await post(OUTCOME, { userId: id, outcome: 'sent' })).status).toBe(400);
    expect((await rawOne(id))!.firstVerifySentAt).toBeUndefined();
  });

  it('404 for an unknown user or a non-ObjectId', async () => {
    const res = await post(OUTCOME, {
      userId: String(new Types.ObjectId()),
      mail: 'verify',
      outcome: 'sent',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect((await post(OUTCOME, { userId: 'nope', mail: 'verify', outcome: 'sent' })).status).toBe(
      404,
    );
  });

  it('logs the userId, mail and outcome only', async () => {
    const id = await seed(25);
    await post(OUTCOME, { userId: id, mail: 'verify', outcome: 'bounced' });
    const text = JSON.stringify([infoSpy.mock.calls, warnSpy.mock.calls, errorSpy.mock.calls]);
    expect(text).toContain(id);
    expect(text).not.toContain('@');
    expect(text).not.toContain(NAME);
  });
});
