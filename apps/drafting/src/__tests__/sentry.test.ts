/**
 * T-136, condition 6 (part 2): what a user sent is never written to an error
 * report. `withoutRequestBody` takes the request body off every event.
 * No DSN is set in tests, so importing the module must not start Sentry.
 */
import * as Sentry from '@sentry/node';

import { withoutRequestBody } from '../config/sentry';

describe('withoutRequestBody', () => {
  it('does not start Sentry when there is no DSN', () => {
    expect(process.env.SENTRY_DSN).toBeUndefined();
    expect(Sentry.getClient()).toBeUndefined();
  });

  it('removes the request body and keeps the rest of the event', () => {
    const event = {
      message: 'boom',
      level: 'error',
      request: {
        url: 'http://x/api',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        data: { described: 'My client Ramesh Mahto was arrested on 12.09.2026' },
      },
      tags: { service: 'x' },
    };
    const out = withoutRequestBody(event);
    expect(out.request).not.toHaveProperty('data');
    expect(JSON.stringify(out)).not.toContain('Ramesh');
    expect(out.request.url).toBe('http://x/api');
    expect(out.request.method).toBe('POST');
    expect(out.request.headers).toEqual({ 'content-type': 'application/json' });
    expect(out.message).toBe('boom');
    expect(out.tags).toEqual({ service: 'x' });
  });

  it('removes a body given as a string', () => {
    const out = withoutRequestBody<{ request: { data?: unknown; url: string } }>({
      request: { data: '{"described":"secret"}', url: 'u' },
    });
    expect(out.request).toEqual({ url: 'u' });
  });

  it('passes an event with no request through unchanged', () => {
    const event: { message: string; request?: { data?: unknown } } = { message: 'no request' };
    expect(withoutRequestBody(event)).toEqual({ message: 'no request' });
  });

  it('passes a request with no body through unchanged', () => {
    const event: { request: { url: string; method: string; data?: unknown } } = {
      request: { url: 'u', method: 'GET' },
    };
    expect(withoutRequestBody(event)).toEqual({ request: { url: 'u', method: 'GET' } });
  });
});

describe('Sentry.init with a DSN set (T-136, part 2 condition 6)', () => {
  const saved = process.env.SENTRY_DSN;
  afterEach(() => {
    if (saved === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = saved;
    jest.dontMock('@sentry/node');
    jest.resetModules();
  });

  it('starts Sentry with beforeSend and beforeSendTransaction that take request.data off', () => {
    jest.resetModules();
    const init = jest.fn();
    jest.doMock('@sentry/node', () => ({ init }));
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    jest.isolateModules(() => {
      require('../config/sentry');
    });

    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0] as {
      beforeSend: (e: unknown) => { request?: Record<string, unknown> };
      beforeSendTransaction: (e: unknown) => { request?: Record<string, unknown> };
    };
    expect(typeof options.beforeSend).toBe('function');
    expect(typeof options.beforeSendTransaction).toBe('function');

    for (const hook of [options.beforeSend, options.beforeSendTransaction]) {
      const out = hook({
        message: 'boom',
        request: { url: 'http://x/api', data: { described: 'My client Ramesh Mahto' } },
      });
      expect(out.request).not.toHaveProperty('data');
      expect(JSON.stringify(out)).not.toContain('Ramesh');
      expect(out.request?.url).toBe('http://x/api');
    }
  });
});
