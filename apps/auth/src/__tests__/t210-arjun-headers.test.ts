/**
 * T-210 Arjun round 2, item 3: an error event and a transaction event carrying sensitive
 * request headers keep only the five allowlisted headers after the Sentry scrub.
 */

import './setupEnv';

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureException: jest.fn(),
  init: jest.fn(),
  httpIntegration: jest.fn(() => 'http-integration'),
}));

import type * as Sentry from '@sentry/node';

import { beforeSend, beforeSendTransaction } from '../config/sentry';
import { signAccessToken } from '../services/jwt.service';

const EMAIL = 'arjun.victim@example.com';
const NAME = 'Arjun Victim Name';
const INTERNAL_SECRET = 'internal-secret-value-9f3a7c1d';

function build(): { headers: Record<string, string>; jwt: string } {
  const jwt = signAccessToken({
    sub: 'u-arjun',
    email: EMAIL,
    name: NAME,
    role: 'Lawyer',
    plan: 'free',
  } as Parameters<typeof signAccessToken>[0]);
  return {
    jwt,
    headers: {
      authorization: `Bearer ${jwt}`,
      Cookie: `rt=${jwt}; sid=abc123`,
      'X-Internal-Secret': INTERNAL_SECRET,
      'x-user-email': EMAIL,
      'X-User-Name': NAME,
      Host: 'localhost:4001',
      'User-Agent': 'jest-agent/1.0',
      'content-type': 'application/json',
      'Content-Length': '42',
      Accept: 'application/json',
    },
  };
}

const EXPECTED_KEYS = ['Accept', 'Content-Length', 'Host', 'User-Agent', 'content-type'];

function assertScrubbed(out: Record<string, any>, jwt: string): void {
  const headers = out.request.headers as Record<string, string>;
  expect(Object.keys(headers).sort()).toEqual(EXPECTED_KEYS);
  expect(headers.Host).toBe('localhost:4001');
  expect(headers['User-Agent']).toBe('jest-agent/1.0');
  expect(headers['content-type']).toBe('application/json');
  expect(headers['Content-Length']).toBe('42');
  expect(headers.Accept).toBe('application/json');

  const text = JSON.stringify(out);
  expect(text).not.toContain(EMAIL);
  expect(text).not.toContain(NAME);
  expect(text).not.toContain(jwt);
  expect(text).not.toContain(INTERNAL_SECRET);
}

describe('T-210 Arjun item 3: sensitive headers are dropped from Sentry events', () => {
  it('test premise: the JWT is real and carries the email and name', () => {
    const { jwt } = build();
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    expect(payload.email).toBe(EMAIL);
    expect(payload.name).toBe(NAME);
  });

  it('error event through beforeSend keeps only the five allowlisted headers', () => {
    const { headers, jwt } = build();
    const event = {
      message: 'boom',
      request: { url: 'http://localhost/auth/me', headers },
    } as unknown as Sentry.ErrorEvent;

    assertScrubbed(beforeSend(event) as Record<string, any>, jwt);
  });

  it('transaction event through beforeSendTransaction keeps only the five allowlisted headers', () => {
    const { headers, jwt } = build();
    const event = {
      type: 'transaction',
      transaction: 'GET /auth/me',
      request: { url: 'http://localhost/auth/me', headers },
    } as unknown as Parameters<typeof beforeSendTransaction>[0];

    const out = beforeSendTransaction(event) as Record<string, any>;
    expect(out.type).toBe('transaction');
    assertScrubbed(out, jwt);
  });

  it('allowlist matching is case-insensitive for all-lowercase and all-uppercase names', () => {
    const { headers, jwt } = build();
    const mixed: Record<string, string> = {
      AUTHORIZATION: headers.authorization,
      COOKIE: headers.Cookie,
      'X-USER-EMAIL': EMAIL,
      HOST: 'localhost:4001',
      'user-agent': 'jest-agent/1.0',
    };
    const out = beforeSend({
      request: { headers: mixed },
    } as unknown as Sentry.ErrorEvent) as Record<string, any>;

    expect(Object.keys(out.request.headers).sort()).toEqual(['HOST', 'user-agent']);
    const text = JSON.stringify(out);
    expect(text).not.toContain(jwt);
    expect(text).not.toContain(EMAIL);
  });
});
