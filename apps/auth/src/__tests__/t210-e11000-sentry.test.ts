/**
 * T-210 (Arjun point 4) - a real E11000 on register and on Google sign-up must reach neither
 * the Pino line nor the Sentry event with the email, while code and keyPattern survive.
 * Also checks the Sentry.init options (no default PII, no request bodies).
 */

import './setupEnv';

// T-587: a Google sign-up / link queues the welcome email; stub the client so nothing reaches Redis.
jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ jobId: 'j' }),
}));

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

// passport.ts only registers the Google strategy when env.GOOGLE_CLIENT_ID/SECRET are set, and CI
// has neither. Supply them here (real env kept for everything else) so the shell does not matter.
jest.mock('../config/env', () => {
  const actual = jest.requireActual('../config/env');
  return {
    ...actual,
    env: {
      ...actual.env,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:4001/google/callback',
    },
  };
});

type Verify = (
  req: unknown,
  at: string,
  rt: string,
  profile: Record<string, unknown>,
  done: (err: unknown, user?: unknown) => void,
) => Promise<void>;

let verify: Verify;

jest.mock('passport-google-oauth20', () => ({
  Strategy: class {
    constructor(_opts: unknown, cb: Verify) {
      verify = cb;
    }
  },
}));

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureException: jest.fn(),
  init: jest.fn(),
  httpIntegration: jest.fn(() => 'http-integration'),
}));

jest.mock('passport', () => ({
  __esModule: true,
  default: {
    use: jest.fn(),
    initialize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    authenticate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
}));

import './setupDb';

import * as Sentry from '@sentry/node';
import pino from 'pino';
import supertest from 'supertest';

import app from '../app';
import logger, { loggerOptions } from '../config/logger';
import { initPassport } from '../config/passport';
import { beforeSend, scrubEvent } from '../config/sentry';
import { User } from '../models/User.model';

const EMAIL = 'e11000.victim@example.com';
const PASSWORD = 'Passw0rdOk!';

/** Serialise a logger.error call's args exactly as the real logger would. */
function render(args: unknown[]): { text: string; line: Record<string, any> } {
  const lines: string[] = [];
  const log = pino({ ...loggerOptions, level: 'trace' }, { write: (s: string) => lines.push(s) });
  (log.error as (...a: unknown[]) => void)(...args);
  return { text: lines.join('\n'), line: JSON.parse(lines[0]) };
}

/** What the Sentry node SDK would build from a captured exception + request. */
function sentryEventFor(err: Error & { keyValue?: unknown }): Sentry.ErrorEvent {
  return {
    type: undefined,
    message: err.message,
    exception: { values: [{ type: err.name, value: err.message }] },
    extra: { keyValue: err.keyValue, nested: { cause: err.message } },
    request: {
      url: 'http://localhost/auth/register',
      data: { email: EMAIL, password: PASSWORD },
      cookies: { rt: 'abc' },
    },
  } as unknown as Sentry.ErrorEvent;
}

function expectScrubbed(event: Sentry.ErrorEvent) {
  const out = beforeSend(event);
  const s = JSON.stringify(out);
  expect(s).not.toContain(EMAIL);
  expect(s).not.toContain(PASSWORD);
  expect(out.request?.data).toBeUndefined();
  expect(out.request?.cookies).toBeUndefined();
  expect(s).not.toContain('keyValue');
  expect(out.exception?.values?.[0].type).toBe('MongoServerError');
  expect(out.exception?.values?.[0].value).toContain('E11000');
}

describe('T-210 Arjun 4 / T-522 - register E11000 (through POST /register)', () => {
  it('T-522: a lost create race is the existing-address outcome: 202, no Sentry event, no error log with the email', async () => {
    await User.init();
    await User.create({ email: EMAIL, name: 'First', password: PASSWORD });

    // Make the service's pre-check miss once, so User.create hits the unique index (E11000).
    jest.spyOn(User, 'findOne').mockReturnValueOnce({ lean: () => Promise.resolve(null) } as never);
    const errSpy = jest.spyOn(logger, 'error').mockImplementation((() => undefined) as never);
    const allSpies = [
      jest.spyOn(logger, 'warn').mockImplementation((() => undefined) as never),
      jest.spyOn(logger, 'info').mockImplementation((() => undefined) as never),
    ];

    const res = await supertest(app)
      .post('/register')
      .send({ email: EMAIL, password: PASSWORD, name: 'Second' });
    const logged = JSON.stringify([errSpy, ...allSpies].map((sp) => sp.mock.calls));
    jest.restoreAllMocks();

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'success', data: { status: 'check_email' } });
    expect(JSON.stringify(res.body)).not.toContain(EMAIL);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(errSpy.mock.calls.find((c) => c[1] === 'Request failed')).toBeUndefined();
    expect(logged).not.toContain(EMAIL);
  });

  it('the Sentry scrubber still masks a REAL duplicate-key error from the email index', async () => {
    await User.init();
    await User.create({ email: EMAIL, name: 'First', password: PASSWORD });
    let err: (Error & { keyValue?: unknown }) | undefined;
    try {
      await User.create({ email: EMAIL, name: 'Second', password: PASSWORD });
    } catch (e) {
      err = e as Error & { keyValue?: unknown };
    }
    expect(err).toBeDefined();
    // the leak is real upstream
    expect(err!.message).toContain(EMAIL);
    expect(JSON.stringify(err!.keyValue)).toContain(EMAIL);
    expectScrubbed(sentryEventFor(err!));
  });
});

describe('T-210 Arjun 4 - Google sign-up E11000 (passport.ts catch)', () => {
  it('log line and Sentry event hold no email; code and keyPattern remain', async () => {
    initPassport();
    await User.init();
    await User.create({ email: EMAIL, name: 'First', password: PASSWORD });

    // googleId lookup and email lookup both miss -> User.create hits the unique index.
    jest.spyOn(User, 'findOne').mockResolvedValue(null as never);
    const logSpy = jest.spyOn(logger, 'error').mockImplementation((() => undefined) as never);

    const done = jest.fn();
    await verify(
      { query: {} },
      'at',
      'rt',
      { id: 'g-dup', displayName: 'Dup Person', emails: [{ value: EMAIL }] },
      done,
    );
    const calls = logSpy.mock.calls.slice();
    jest.restoreAllMocks();
    (Sentry.captureException as jest.Mock).mockReset();

    expect(done).toHaveBeenCalledTimes(1);
    const err = done.mock.calls[0][0] as Error & { code?: number; keyValue?: unknown };
    expect(err.code).toBe(11000);
    expect(JSON.stringify(err.keyValue)).toContain(EMAIL);

    const call = calls.find((c) => c[1] === 'Google OAuth strategy error');
    expect(call).toBeDefined();
    const { text, line } = render(call as unknown[]);
    expect(text).not.toContain(EMAIL);
    expect(line.err.code).toBe(11000);
    expect(line.err.keyPattern).toEqual({ email: 1 });
    expect(line.err.keyValue).toBeUndefined();
    expect(line.msg).toBe('Google OAuth strategy error');

    expectScrubbed(sentryEventFor(err));
  });
});

describe('T-210 scrubEvent - other event shapes', () => {
  it('masks breadcrumbs, url, query_string, deep extra/contexts; survives cycles', () => {
    const cyc: Record<string, unknown> = { note: `hi ${EMAIL}` };
    cyc['self'] = cyc;
    const event = {
      message: `fail for ${EMAIL}`,
      breadcrumbs: [{ message: `GET /u?e=${EMAIL}` }],
      request: { url: `http://x/y?e=${EMAIL}`, query_string: `e=${EMAIL}` },
      extra: { a: { b: { keyValue: { email: EMAIL }, c: cyc } } },
      contexts: { custom: { keyValue: { email: EMAIL }, s: EMAIL } },
    } as unknown as Sentry.ErrorEvent;
    const out = scrubEvent(event);
    expect(JSON.stringify(out)).not.toContain(EMAIL);
    expect(JSON.stringify(out)).not.toContain('keyValue');
  });
});

describe('T-210 shared (non-cyclic) references are not treated as cycles', () => {
  const shared = { email: 1 };

  it('logger keeps a keyPattern object shared between err and err.errorResponse', () => {
    const e = new Error('E11000 dup') as Error & Record<string, unknown>;
    e.name = 'MongoServerError';
    e.code = 11000;
    e.keyPattern = shared;
    e.errorResponse = { code: 11000, keyPattern: shared };
    const { line } = render([{ err: e }, 'x']);
    expect(line.err.keyPattern).toEqual({ email: 1 });
    expect(line.err.errorResponse.keyPattern).toEqual({ email: 1 });
  });

  it('scrubEvent keeps the same object referenced twice under extra', () => {
    const out = scrubEvent({ extra: { a: shared, b: shared } } as unknown as Sentry.ErrorEvent);
    expect(out.extra).toEqual({ a: { email: 1 }, b: { email: 1 } });
  });
});

describe('T-210 Sentry.init options', () => {
  it('inits with sendDefaultPii false, body capture off, and a beforeSend', () => {
    const prevDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://public@o0.ingest.sentry.io/0';
    let mocked: { init: jest.Mock; httpIntegration: jest.Mock } | undefined;
    try {
      jest.isolateModules(() => {
        // Same (mocked) module instance that config/sentry receives inside this registry.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mocked = require('@sentry/node');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../config/sentry');
      });
    } finally {
      if (prevDsn === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = prevDsn;
    }
    const { init, httpIntegration } = mocked!;
    expect(init).toHaveBeenCalledTimes(1);
    const opts = init.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.sendDefaultPii).toBe(false);
    expect(typeof opts.beforeSend).toBe('function');
    expect(httpIntegration).toHaveBeenCalledWith({ maxIncomingRequestBodySize: 'none' });
    expect(opts.integrations).toEqual(['http-integration']);
    expect(opts.enabled).toBe(false); // NODE_ENV=test
  });
});
