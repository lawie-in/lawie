/**
 * T-223 AC8 (auth side): logs, Sentry and the queue job never carry the address, the token or
 * the link. Runs the mint route, verify, resend (queued, limited, Redis down, enqueue failure)
 * and a DB failure through the error handler, capturing every logger call, console call and
 * Sentry call, then searches the lot for the sensitive values.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  init: jest.fn(),
  httpIntegration: jest.fn(() => 'http-integration'),
}));

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';
import * as Sentry from '@sentry/node';
import type Redis from 'ioredis';
import pino from 'pino';
import supertest from 'supertest';

import app from '../app';
import logger, { REDACT_CENSOR, loggerOptions } from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import { requestVerifyEmail, verifyEmailToken } from '../services/verify-email.service';

import { rawUsers } from './t234-helpers';

const EMAIL = 'pii-leak-check.t223@example.com';
const NAME = 'Quentin Leakcheck Zorbatron';
const SECRET = process.env.INTERNAL_SECRET as string;
const enqueueMock = enqueueEmail as unknown as jest.Mock;

let captured: unknown[];
const dump = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val instanceof Error
      ? { name: val.name, message: val.message, stack: val.stack, ...(val as object) }
      : val,
  );

beforeEach(async () => {
  await redis.flushall();
  captured = [];
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j1' });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  const grab =
    (..._a: unknown[]) =>
    (...args: unknown[]) => {
      captured.push(args);
    };
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) {
    jest.spyOn(logger, level).mockImplementation(grab() as never);
  }
  for (const m of ['log', 'info', 'warn', 'error'] as const) {
    jest.spyOn(console, m).mockImplementation(grab() as never);
  }
  (Sentry.captureException as jest.Mock).mockClear();
  (Sentry.captureMessage as jest.Mock).mockClear();
  (Sentry.addBreadcrumb as jest.Mock).mockClear();
});
afterEach(() => jest.restoreAllMocks());

function sentryCalls(): unknown[] {
  return [
    ...(Sentry.captureException as jest.Mock).mock.calls,
    ...(Sentry.captureMessage as jest.Mock).mock.calls,
    ...(Sentry.addBreadcrumb as jest.Mock).mock.calls,
  ];
}

function expectClean(needles: string[]) {
  const out = dump(captured);
  const sentry = dump(sentryCalls());
  const jobs = dump(enqueueMock.mock.calls);
  for (const needle of needles) {
    expect(needle.length).toBeGreaterThan(5);
    expect(out).not.toContain(needle);
    expect(sentry).not.toContain(needle);
    expect(jobs).not.toContain(needle);
  }
  expect(jobs).not.toMatch(/@/);
}

async function mint(userId: string) {
  return supertest(app)
    .post('/internal/verify-email/mint')
    .set('x-internal-secret', SECRET)
    .send({ userId });
}

describe('T-223 AC8 auth: no address, token or link anywhere', () => {
  it('mint -> verify -> replay -> resend (all outcomes) leaves no trace', async () => {
    const u = await User.create({ email: EMAIL, name: NAME, password: 'Passw0rdOk' });
    const id = String(u._id);

    const res = await mint(id);
    expect(res.status).toBe(200);
    const link: string = res.body.link;
    const token = new URL(link).searchParams.get('token') as string;
    const hash = (await rawUsers().findOne({ _id: u._id }))!.emailVerifyTokenHash as string;

    // resend: queued, then limited, then Redis down, then enqueue failing with a nosy message
    await requestVerifyEmail(id);
    await requestVerifyEmail(id);
    await requestVerifyEmail(id, {
      get: jest.fn().mockRejectedValue(new Error(`redis down for ${EMAIL} ${token}`)),
    } as unknown as Redis);
    await redis.flushall();
    enqueueMock.mockRejectedValueOnce(new Error(`queue refused ${EMAIL} ${link}`));
    await requestVerifyEmail(id);
    await new Promise((r) => setImmediate(r));

    await verifyEmailToken(token);
    await verifyEmailToken(token);
    await verifyEmailToken('f'.repeat(64));
    // 409 / 404 / 401 / 400 on the route
    expect((await mint(id)).status).toBe(409);
    expect((await mint('000000000000000000000000')).status).toBe(404);
    expect(
      (await supertest(app).post('/internal/verify-email/mint').send({ userId: id })).status,
    ).toBe(401);

    expect(captured.length).toBeGreaterThan(0); // the capture is wired (userId-only lines)
    expect(dump(captured)).toContain(id);
    expectClean([EMAIL, NAME, token, link, hash, 'verify-email?token', 'Quentin']);
  });

  it('a DB failure on the mint route goes through the error handler with no address, token or link', async () => {
    const u = await User.create({ email: EMAIL, name: NAME, password: 'Passw0rdOk' });
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((() => {
      throw new Error('db down');
    }) as never);
    const res = await mint(String(u._id));
    expect(res.status).toBe(500);
    expect(dump(res.body)).not.toContain(EMAIL);
    expectClean([EMAIL, NAME]);
  });

  it('the enqueue call carries {template, userId} and nothing else', async () => {
    const u = await User.create({ email: EMAIL, name: NAME, password: 'Passw0rdOk' });
    await requestVerifyEmail(String(u._id));
    expect(enqueueMock.mock.calls).toEqual([
      [{ template: 'auth.verifyEmail', userId: String(u._id) }],
    ]);
  });
});

describe('T-223 AC8 auth: logger redaction paths', () => {
  function capture() {
    const lines: string[] = [];
    const log = pino({ ...loggerOptions, level: 'trace' }, { write: (s: string) => lines.push(s) });
    return { log, lines };
  }

  it('token, link, verifyUrl, emailVerifyTokenHash and emailVerifyExpires are censored, top level and one level down', () => {
    const { log, lines } = capture();
    const secretish = 'a1'.repeat(32);
    log.info({
      token: secretish,
      link: `http://x/verify-email?token=${secretish}`,
      verifyUrl: `http://x/verify-email?token=${secretish}`,
      emailVerifyTokenHash: secretish,
      emailVerifyExpires: '2026-10-13T00:00:00Z',
      user: {
        token: secretish,
        link: 'http://x/verify-email?token=zz',
        verifyUrl: 'http://x/v',
        emailVerifyTokenHash: secretish,
        emailVerifyExpires: 'later',
      },
    });
    const out = JSON.parse(lines[0]);
    for (const k of ['token', 'link', 'verifyUrl', 'emailVerifyTokenHash', 'emailVerifyExpires']) {
      expect(out[k]).toBe(REDACT_CENSOR);
      expect(out.user[k]).toBe(REDACT_CENSOR);
    }
    expect(lines[0]).not.toContain(secretish);
    expect(lines[0]).not.toContain('verify-email?token');
  });

  it('a top-level url is censored; the path in req.url (error handler) is kept', () => {
    const { log, lines } = capture();
    log.info({ url: 'http://x/verify-email?token=abc', req: { url: '/me' } });
    const out = JSON.parse(lines[0]);
    expect(out.url).toBe(REDACT_CENSOR);
    expect(out.req.url).toBe('/me');
  });
});
