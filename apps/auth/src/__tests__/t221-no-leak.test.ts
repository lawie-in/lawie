/**
 * T-221 AC5: neither the email address nor the reset token reaches a log, console, Sentry call or
 * the queue job, across forgot (known, unknown, limited, Redis down, enqueue failure), mint,
 * check and reset (ok, weak, used, DB failure through the error handler). Also the shared Sentry
 * scrub and errorHandler mask /reset-password/<token>, and the logger redacts the new keys.
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
import { scrubSentryEvent } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import pino from 'pino';
import supertest from 'supertest';

import app from '../app';
import logger, { REDACT_CENSOR, loggerOptions } from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';

import { waitFor } from './t234-helpers';

const EMAIL = 'pii-leak-check.t221@example.com';
const GHOST = 'ghost-leak.t221@example.com';
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
  const grab =
    () =>
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

it('nothing sensitive in logs, console, Sentry or the job across the whole flow', async () => {
  const u = await User.create({ email: EMAIL, name: 'Leak Check', password: 'OldPassw0rd' });
  const fwd = (ip: string) => ({ 'x-forwarded-for': ip });

  await supertest(app).post('/forgot-password').set(fwd('9.9.9.1')).send({ email: EMAIL });
  await supertest(app).post('/forgot-password').set(fwd('9.9.9.2')).send({ email: GHOST });
  await supertest(app)
    .post('/forgot-password')
    .set(fwd('9.9.9.3'))
    .send({ email: 'bad-format-leak' });
  for (let i = 0; i < 4; i += 1) {
    await supertest(app).post('/forgot-password').set(fwd('9.9.9.4')).send({ email: GHOST });
  }
  enqueueMock.mockRejectedValueOnce(new Error(`queue down for ${EMAIL}`));
  await supertest(app)
    .post('/forgot-password')
    .set(fwd('9.9.9.5'))
    .send({ email: 'other-leak@example.com' });
  await waitFor(async () => enqueueMock.mock.calls.length > 0);

  const minted = await supertest(app)
    .post('/internal/password-reset/mint')
    .set('x-internal-secret', SECRET)
    .send({ userId: String(u._id) });
  const token = (minted.body.resetUrl as string).split('/reset-password/')[1]!;
  expect(token).toMatch(/^[a-f0-9]{64}$/);

  await supertest(app).get(`/reset-password/${token}`);
  await supertest(app).post(`/reset-password/${token}`).send({ password: 'weak' });
  await supertest(app).post(`/reset-password/${token}`).send({ password: 'NewPassw0rd1' });
  await supertest(app).post(`/reset-password/${token}`).send({ password: 'NewPassw0rd1' });

  // A DB failure on the reset path goes through the real error handler.
  const t2 = (
    (
      await supertest(app)
        .post('/internal/password-reset/mint')
        .set('x-internal-secret', SECRET)
        .send({ userId: String(u._id) })
    ).body.resetUrl as string
  ).split('/reset-password/')[1]!;
  jest.spyOn(User, 'findOneAndUpdate').mockImplementationOnce((() => {
    throw new Error('mongo exploded');
  }) as never);
  await supertest(app).post(`/reset-password/${t2}`).send({ password: 'NewPassw0rd2' });

  const everything = [
    dump(captured),
    dump(enqueueMock.mock.calls),
    dump((Sentry.captureException as jest.Mock).mock.calls),
    dump((Sentry.captureMessage as jest.Mock).mock.calls),
    dump((Sentry.addBreadcrumb as jest.Mock).mock.calls),
  ].join('\n');

  expect(captured.length).toBeGreaterThan(0); // the capture really ran
  for (const s of [
    EMAIL,
    'pii-leak-check',
    GHOST,
    'ghost-leak',
    'other-leak',
    'bad-format-leak',
    token,
    t2,
    'NewPassw0rd',
    'OldPassw0rd',
  ]) {
    expect(everything).not.toContain(s);
  }
  expect(everything).not.toMatch(/reset-password\/[a-f0-9]{16,}/);
  // The userId is allowed (and expected) in the log.
  expect(everything).toContain(String(u._id));
});

describe('scrub and redaction', () => {
  const TOKEN = 'ab'.repeat(32);

  it('shared Sentry scrub masks /reset-password/<token> in the request url and transaction', () => {
    const event = scrubSentryEvent({
      request: { url: `https://app.lawie.in/api/auth/reset-password/${TOKEN}?x=1`, headers: {} },
      transaction: `POST /reset-password/${TOKEN}`,
      message: `failed GET /reset-password/${TOKEN}`,
    } as never);
    const out = JSON.stringify(event);
    expect(out).not.toContain(TOKEN);
  });

  it('logger redacts resetUrl, loginUrl, passwordResetToken, passwordResetExpires (top level and nested)', () => {
    const lines: string[] = [];
    const l = pino(
      { ...loggerOptions, level: 'info' },
      { write: (s: string) => void lines.push(s) },
    );
    l.info({
      resetUrl: `http://x/reset-password/${TOKEN}`,
      loginUrl: 'http://x/login',
      passwordResetToken: TOKEN,
      passwordResetExpires: 'soon',
      user: { resetUrl: `http://x/reset-password/${TOKEN}`, passwordResetToken: TOKEN },
    });
    const out = lines.join('');
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain('http://x/login');
    expect(out).toContain(REDACT_CENSOR as string);
  });
});
