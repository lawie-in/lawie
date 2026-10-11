/**
 * T-210 - auth logs carry no email, name or phone (DPDP Act 2023).
 *   AC1  no log line holds an email/name/phone (passport, error serializer)
 *   AC2  the error handler logs no request body / headers / query values
 *   AC3  no `email` key in any logger.* call object in apps/auth/src (source scan)
 *   AC4  pino redact covers email, password, phone (+ one level down)
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('../config/env', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:4001/google/callback',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}));

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

jest.mock('passport', () => ({ __esModule: true, default: { use: jest.fn() } }));

import './setupDb';

import fs from 'fs';
import path from 'path';

import { Request, Response } from 'express';
import pino from 'pino';

import logger, {
  EMAIL_MASK,
  REDACT_CENSOR,
  loggerOptions,
  maskEmails,
  serializeErr,
} from '../config/logger';
import { initPassport } from '../config/passport';
import { AppError, errorHandler } from '../middleware/errorHandler';
import { User } from '../models/User.model';

const EMAIL = 'a@b.com';

function capture() {
  const lines: string[] = [];
  const log = pino({ ...loggerOptions, level: 'trace' }, { write: (s: string) => lines.push(s) });
  return { log, lines, text: () => lines.join('\n') };
}

describe('T-210 AC4 - pino redact', () => {
  it('censors email, password, phone at top level and one level down', () => {
    const { log, lines, text } = capture();
    log.info({
      email: 'top@x.com',
      password: 'topsecret',
      phone: '+919999900000',
      user: { email: 'nested@x.com', password: 'nestedsecret', phone: '+918888800000' },
    });
    const out = JSON.parse(lines[0]);
    for (const k of ['email', 'password', 'phone']) expect(out[k]).toBe(REDACT_CENSOR);
    for (const k of ['email', 'password', 'phone']) expect(out.user[k]).toBe(REDACT_CENSOR);
    for (const raw of ['top@x.com', 'topsecret', '+919999900000', 'nested@x.com', 'nestedsecret'])
      expect(text()).not.toContain(raw);
  });
});

describe('T-210 AC1 - err serializer', () => {
  function fakeDupKey() {
    const e = new Error(
      `E11000 duplicate key error collection: x.users index: email_1 dup key: { email: "${EMAIL}" }`,
    ) as Error & Record<string, unknown>;
    e.name = 'MongoServerError';
    e.code = 11000;
    e.keyPattern = { email: 1 };
    e.keyValue = { email: EMAIL };
    e.errorResponse = {
      code: 11000,
      keyValue: { email: EMAIL },
      errmsg: `E11000 dup key: { email: "${EMAIL}" }`,
    };
    return e;
  }

  it('scrubs a MongoServerError E11000 under `err`', () => {
    const { log, lines, text } = capture();
    log.error({ err: fakeDupKey() }, 'boom');
    expect(text()).not.toContain(EMAIL);
    const out = JSON.parse(lines[0]);
    expect(out.err.keyValue).toBeUndefined();
    expect(out.err.errorResponse.keyValue).toBeUndefined();
    expect(out.err.message).toContain(EMAIL_MASK);
    expect(out.err.errorResponse.errmsg).toContain(EMAIL_MASK);
    expect(out.err.keyPattern).toEqual({ email: 1 });
    expect(out.err.code).toBe(11000);
  });

  it('scrubs the same error under the `error` key', () => {
    const { log, lines, text } = capture();
    log.error({ error: fakeDupKey() }, 'boom');
    expect(text()).not.toContain(EMAIL);
    expect(JSON.parse(lines[0]).error.keyValue).toBeUndefined();
  });

  it('survives circular references and non-Error values', () => {
    const e = fakeDupKey();
    e.self = e;
    expect(() => serializeErr(e)).not.toThrow();
    expect(serializeErr('plain x@y.com')).toBe(`plain ${EMAIL_MASK}`);
    expect(serializeErr(undefined)).toBeUndefined();
  });

  it('maskEmails masks every email in a string', () => {
    expect(maskEmails('x a@b.com y c.d+e@f.co.in')).toBe(`x ${EMAIL_MASK} y ${EMAIL_MASK}`);
  });

  it('scrubs a real Mongoose ValidationError: drops value, keeps path/kind/message', async () => {
    const err = await new User({ email: 'bad person@x.com', name: 'N', password: 'Passw0rd!x' })
      .validate()
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).not.toBeNull();
    // sanity: the raw error does hold the value
    expect(JSON.stringify((err as { errors: unknown }).errors)).toContain('person@x.com');

    const { log, lines, text } = capture();
    log.error({ err }, 'validation');
    expect(text()).not.toContain('person@x.com');
    const out = JSON.parse(lines[0]);
    expect(out.err.errors.email.value).toBeUndefined();
    expect(out.err.errors.email.path).toBe('email');
    expect(out.err.errors.email.kind).toBe('regexp');
    expect(out.err.errors.email.message).toBe('Invalid email format');
  });

  it('scrubs a REAL duplicate-key error from Mongo (through the serializer)', async () => {
    await User.init();
    const mk = () =>
      User.create({ email: 'dup.user@example.com', name: 'Dup', password: 'Passw0rd!x' });
    await mk();
    const err = await mk().then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as { code?: number }).code).toBe(11000);
    expect(JSON.stringify(err)).toContain('dup.user@example.com'); // the leak exists upstream

    const { log, text } = capture();
    log.error({ err }, 'dup');
    expect(text()).not.toContain('dup.user@example.com');
    expect(text()).not.toContain('"keyValue"');
  });
});

describe('T-210 AC2 - errorHandler logs', () => {
  function run(err: Error, req: Partial<Request>) {
    const spy = jest.spyOn(logger, 'error').mockImplementation((() => undefined) as never);
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    errorHandler(err, req as Request, res, jest.fn());
    const arg = spy.mock.calls[0][0] as unknown as Record<string, unknown>;
    spy.mockRestore();
    return { arg, res };
  }

  const req = {
    method: 'POST',
    url: '/auth/register?email=q%40x.com&ref=me@x.com',
    ip: '1.2.3.4',
    body: { email: 'body@x.com', password: 'pw-secret', name: 'Jane' },
    headers: { authorization: 'Bearer tok', cookie: 'rt=abc' },
    query: { email: 'q@x.com' },
    cookies: { rt: 'abc' },
  } as unknown as Partial<Request>;

  it('logs only err, req{method,url,ip}, statusCode - no body/headers/cookies/query', () => {
    const { arg } = run(new AppError(409, 'Email taken'), req);
    expect(Object.keys(arg).sort()).toEqual(['err', 'req', 'statusCode']);
    expect(Object.keys(arg.req as object).sort()).toEqual(['ip', 'method', 'url']);
    expect(arg.statusCode).toBe(409);
    const s = JSON.stringify({ ...arg, err: undefined });
    for (const raw of ['body@x.com', 'pw-secret', 'Jane', 'Bearer tok', 'rt=abc'])
      expect(s).not.toContain(raw);
  });

  it('masks an email in the url', () => {
    const { arg } = run(new Error('x'), req);
    expect((arg.req as { url: string }).url).toBe(
      `/auth/register?email=q%40x.com&ref=${EMAIL_MASK}`,
    );
    expect(JSON.stringify(arg)).not.toContain('me@x.com');
  });

  it('real serialized output of the logged object has no PII, still responds normally', () => {
    const { arg, res } = run(
      Object.assign(new Error(`dup key: { email: "${EMAIL}" }`), { keyValue: { email: EMAIL } }),
      req,
    );
    const { log, text } = capture();
    log.error(arg);
    expect(text()).not.toContain(EMAIL);
    expect(text()).not.toContain('body@x.com');
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('T-210 AC1 - passport new-user log', () => {
  beforeAll(() => {
    initPassport();
  });

  it('logs { userId } only for a new Google user', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation((() => undefined) as never);
    const user = await new Promise<Record<string, unknown>>((resolve) => {
      void verify(
        { query: {} },
        'at',
        'rt',
        { id: 'g-1', displayName: 'Jane Doe', emails: [{ value: 'jane@example.com' }] },
        (_e, u) => resolve(u as Record<string, unknown>),
      );
    });
    const call = info.mock.calls.find((c) => c[1] === 'New user created via Google OAuth');
    info.mockRestore();
    expect(call).toBeDefined();
    expect(Object.keys(call![0] as unknown as object)).toEqual(['userId']);
    expect((call![0] as unknown as { userId: string }).userId).toBe(String(user['id']));
    expect(JSON.stringify(call)).not.toMatch(/jane|example\.com/i);
  });
});

describe('T-210 AC3 - source scan', () => {
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) return d.name === '__tests__' ? [] : walk(p);
      return p.endsWith('.ts') ? [p] : [];
    });
  }

  const files = walk(path.resolve(__dirname, '..'));

  // Capture each `logger.<level>(` call up to its matching close paren.
  function calls(src: string): string[] {
    const out: string[] = [];
    const re = /\blogger\.(trace|debug|info|warn|error|fatal)\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      let depth = 1;
      let i = re.lastIndex;
      while (i < src.length && depth > 0) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') depth--;
        i++;
      }
      out.push(src.slice(m.index, i));
    }
    return out;
  }

  it('finds logger calls (guards against a vacuous scan)', () => {
    const total = files.reduce((n, f) => n + calls(fs.readFileSync(f, 'utf8')).length, 0);
    expect(total).toBeGreaterThan(5);
  });

  it('no logger.* call has an email key, or logs req.body / .email / .name / .phone', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const c of calls(fs.readFileSync(f, 'utf8'))) {
        const args = c.replace(/^logger\.\w+\(/, '');
        if (
          /(^|[\s{,])['"]?email['"]?\s*[:,}]/.test(args) ||
          /\.email\b|req\.body|\.phone\b|\.name\b|displayName/.test(c)
        )
          offenders.push(`${path.relative(process.cwd(), f)}: ${c.split('\n')[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
