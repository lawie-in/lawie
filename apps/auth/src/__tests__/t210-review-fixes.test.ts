/**
 * T-210 review round 1 fixes: header allowlist (JWT leak), beforeSendTransaction wiring,
 * linear-time maskEmails, and serializeErr on cross-realm / error-like objects.
 */

import './setupEnv';

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureException: jest.fn(),
  init: jest.fn(),
  httpIntegration: jest.fn(() => 'http-integration'),
}));

import vm from 'vm';

import type * as Sentry from '@sentry/node';
import pino from 'pino';

import { loggerOptions, maskEmails, serializeErr } from '../config/logger';
import { beforeSend, beforeSendTransaction } from '../config/sentry';
import { signAccessToken } from '../services/jwt.service';

const EMAIL = 'review.victim@example.com';
const NAME = 'Review Victim Name';

function makeEvent(): { event: Record<string, any>; jwt: string } {
  const jwt = signAccessToken({
    sub: 'u1',
    email: EMAIL,
    name: NAME,
    role: 'Lawyer',
    plan: 'free',
  } as Parameters<typeof signAccessToken>[0]);
  return {
    jwt,
    event: {
      message: 'oops',
      request: {
        url: 'http://localhost/auth/me',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Cookie: `rt=${jwt}`,
          'set-cookie': 'rt=abc',
          'x-forwarded-for': '1.2.3.4',
          Host: 'localhost:4001',
          'User-Agent': `Mozilla/5.0 (${EMAIL})`,
          accept: 'application/json',
        },
      },
    },
  };
}

function assertScrubbed(out: Record<string, any>, jwt: string): void {
  const headers = out.request.headers as Record<string, string>;
  expect(Object.keys(headers).sort()).toEqual(['Host', 'User-Agent', 'accept']);
  expect(headers.Host).toBe('localhost:4001');
  expect(headers.accept).toBe('application/json');
  expect(headers['User-Agent']).toContain('[email]');
  const text = JSON.stringify(out);
  expect(text).not.toContain(jwt);
  expect(text).not.toContain(EMAIL);
  expect(text).not.toContain(NAME);
  expect(text).not.toMatch(/bearer/i);
  expect(text).not.toContain('1.2.3.4');
}

describe('T-210 review fixes: Sentry header allowlist', () => {
  it('the signed JWT really carries email and name (test premise)', () => {
    const { jwt } = makeEvent();
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    expect(payload.email).toBe(EMAIL);
    expect(payload.name).toBe(NAME);
  });

  it('beforeSend keeps only allowlisted headers and leaks no JWT/email/name', () => {
    const { event, jwt } = makeEvent();
    assertScrubbed(beforeSend(event as unknown as Sentry.ErrorEvent) as Record<string, any>, jwt);
  });

  it('beforeSendTransaction scrubs the same way', () => {
    const { event, jwt } = makeEvent();
    event.type = 'transaction';
    assertScrubbed(
      beforeSendTransaction(event as Parameters<typeof beforeSendTransaction>[0]) as Record<
        string,
        any
      >,
      jwt,
    );
  });

  it('non-string header values are dropped, not passed through', () => {
    const ev = { request: { headers: { host: ['a@b.com'], accept: 'x' } } } as any;
    const out = beforeSend(ev) as any;
    expect(out.request.headers).toEqual({ accept: 'x' });
  });

  it('wires beforeSendTransaction into Sentry.init', () => {
    const prevDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://public@o0.ingest.sentry.io/0';
    let mocked: { init: jest.Mock } | undefined;
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mocked = require('@sentry/node');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../config/sentry');
      });
    } finally {
      if (prevDsn === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = prevDsn;
    }
    expect(mocked!.init).toHaveBeenCalledTimes(1);
    const opts = mocked!.init.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof opts.beforeSendTransaction).toBe('function');
    expect(typeof opts.beforeSend).toBe('function');
    // Behaves as a scrubber, not a no-op.
    const out = (opts.beforeSendTransaction as (e: unknown) => any)({
      request: { headers: { authorization: 'Bearer x', host: 'h' } },
    });
    expect(out.request.headers).toEqual({ host: 'h' });
  });
});

describe('T-210 review fixes: maskEmails performance and behaviour', () => {
  function time(fn: () => void): number {
    const t = process.hrtime.bigint();
    fn();
    return Number(process.hrtime.bigint() - t) / 1e6;
  }

  it('16 KB of "a" then "@" is fast', () => {
    const s = 'a'.repeat(16 * 1024) + '@';
    let out = '';
    expect(time(() => (out = maskEmails(s)))).toBeLessThan(50);
    expect(out).toBe(s);
  });

  it('"a@" then 16 KB of "a" is fast', () => {
    const s = 'a@' + 'a'.repeat(16 * 1024);
    let out = '';
    expect(time(() => (out = maskEmails(s)))).toBeLessThan(50);
    expect(out).toBe(s);
  });

  it('still masks two emails in one string', () => {
    expect(maskEmails('from a.b+c@x.co to d_e@y.example.org done')).toBe(
      'from [email] to [email] done',
    );
  });

  it('still masks a quoted email and leaves surrounding text', () => {
    expect(maskEmails('dup key { email: "q.u@example.com" }')).toBe('dup key { email: "[email]" }');
    expect(maskEmails("'q@example.com'")).toBe("'[email]'");
  });

  it('returns strings without "@" unchanged', () => {
    expect(maskEmails('no at sign here')).toBe('no at sign here');
  });
});

describe('T-210 review fixes: serializeErr on error-like objects', () => {
  it('keeps masked message, stack and name for a plain error-like object', () => {
    const out = serializeErr({
      name: 'Error',
      message: 'bad a@b.com',
      stack: 'Error: bad a@b.com\n    at f (x.js:1:1)',
    }) as Record<string, any>;
    expect(out.message).toBe('bad [email]');
    expect(out.stack).toContain('at f (x.js:1:1)');
    expect(out.stack).not.toContain('a@b.com');
    expect(out.name).toBe('Error');
    expect(out.type).toBeDefined();
  });

  it('handles a cross-realm (vm) Error that is not instanceof Error', () => {
    const foreign = vm.runInNewContext('new TypeError("boom a@b.com")') as Error;
    expect(foreign instanceof Error).toBe(false);
    const out = serializeErr(foreign) as Record<string, any>;
    expect(out.message).toBe('boom [email]');
    expect(out.name).toBe('TypeError');
    expect(typeof out.stack).toBe('string');
    expect(out.stack).not.toContain('a@b.com');
  });

  it('tolerates a non-string name without throwing and still masks the message', () => {
    const out = serializeErr({ name: 42, message: 'm a@b.com', stack: 's' }) as Record<string, any>;
    expect(out.message).toBe('m [email]');
    expect(out.stack).toBe('s');
  });

  it('non-error-like values fall through to scrubPii', () => {
    expect(serializeErr('x a@b.com')).toBe('x [email]');
    expect(serializeErr(null)).toBeNull();
  });

  it('through a real pino line, cross-realm error message is masked and stack kept', () => {
    const lines: string[] = [];
    const log = pino({ ...loggerOptions, level: 'trace' }, { write: (s: string) => lines.push(s) });
    const foreign = vm.runInNewContext('new Error("bad a@b.com")') as Error;
    log.error({ err: foreign }, 'failed');
    const line = JSON.parse(lines[0]);
    expect(lines[0]).not.toContain('a@b.com');
    expect(line.err.message).toBe('bad [email]');
    expect(typeof line.err.stack).toBe('string');
  });
});
