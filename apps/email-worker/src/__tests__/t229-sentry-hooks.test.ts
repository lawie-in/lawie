/**
 * T-229 AC3 (email-worker): initSentry(env) wires beforeSend and beforeSendTransaction to the
 * shared scrub, and does nothing without a DSN.
 */
import * as Sentry from '@sentry/node';

import { initSentry } from '../config/sentry';

jest.mock('@sentry/node', () => ({ init: jest.fn() }));

type Hook = (event: any) => any;
const init = Sentry.init as jest.Mock;
const SECRET = 'shh-internal-secret-value-123';
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

const request = () => ({
  url: `http://worker/api/auth/reset-password/${TOKEN}?x=1`,
  data: { a: 1 },
  cookies: { sid: 'c' },
  headers: {
    host: 'w',
    'user-agent': 'jest',
    authorization: 'Bearer jwt-secret',
    cookie: 'sid=c',
    'x-internal-secret': SECRET,
    'x-user-email': 'priya@example.com',
    'x-user-name': 'Priya Sharma',
  },
});

describe('T-229 email-worker initSentry', () => {
  beforeEach(() => init.mockClear());

  it('does nothing without a DSN', () => {
    initSentry({ NODE_ENV: 'test' });
    initSentry({ NODE_ENV: 'test', SENTRY_DSN: '' });
    expect(init).not.toHaveBeenCalled();
  });

  it('wires both hooks and scrubs error and transaction events', () => {
    initSentry({ NODE_ENV: 'test', SENTRY_DSN: 'https://key@example.invalid/1' });
    expect(init).toHaveBeenCalledTimes(1);
    const o = init.mock.calls[0][0] as {
      sendDefaultPii: boolean;
      beforeSend: Hook;
      beforeSendTransaction: Hook;
    };
    expect(o.sendDefaultPii).toBe(false);
    for (const hook of [o.beforeSend, o.beforeSendTransaction]) {
      const out = hook({
        transaction: `GET /api/auth/reset-password/${TOKEN}?x=1`,
        request: request(),
        breadcrumbs: [{ message: `GET /api/auth/reset-password/${TOKEN}` }],
      });
      expect(Object.keys(out.request.headers).sort()).toEqual(['host', 'user-agent']);
      expect(out.request).not.toHaveProperty('data');
      expect(out.request).not.toHaveProperty('cookies');
      expect(out.request.url).toBe('http://worker/api/auth/reset-password/[token]');
      const json = JSON.stringify(out);
      for (const s of [SECRET, 'priya@example.com', 'Priya Sharma', 'jwt-secret', TOKEN]) {
        expect(json).not.toContain(s);
      }
    }
  });
});
