/**
 * T-438 (b): POST /send handler refuses a bad internal secret with
 * 401 { error: 'Unauthorized' } before touching the body, and lets the right
 * one on to body validation. Nothing is sent: the body is deliberately invalid.
 */
import crypto from 'crypto';

import { INTERNAL_HEADERS } from '@lawie/shared';
import type { Request, Response } from 'express';

import { env } from '../config/env';
import { sendHandler } from '../routes/send';

const SECRET = env.INTERNAL_SECRET;

async function call(headers: Record<string, unknown>) {
  const req = { headers, body: {} } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  await sendHandler(req, res as unknown as Response);
  return res;
}

describe('sendHandler - internal secret', () => {
  it.each([
    ['wrong, same length', 'x'.repeat(SECRET.length)],
    ['shorter', SECRET.slice(0, 4)],
    ['longer', SECRET + 'extra'],
    ['prefix of the right one', SECRET.slice(0, -1)],
    ['empty string', ''],
    ['array (repeated header)', [SECRET, SECRET]],
    ['array of the right value', [SECRET]],
    ['missing', undefined],
  ] as Array<[string, unknown]>)('401 Unauthorized for %s', async (_n, value) => {
    const res = await call({ [INTERNAL_HEADERS.SECRET]: value });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(res.status).toHaveBeenCalledTimes(1);
  });

  it('401 Unauthorized when the configured secret is missing or empty', async () => {
    const original = env.INTERNAL_SECRET;
    try {
      for (const configured of [undefined, '']) {
        (env as { INTERNAL_SECRET: unknown }).INTERNAL_SECRET = configured;
        for (const sent of [configured, '', 'anything']) {
          const res = await call({ [INTERNAL_HEADERS.SECRET]: sent });
          expect(res.status).toHaveBeenCalledWith(401);
          expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
        }
      }
    } finally {
      (env as { INTERNAL_SECRET: unknown }).INTERNAL_SECRET = original;
    }
  });

  it('the right secret gets past auth (to body validation: 400, not 401)', async () => {
    const res = await call({ [INTERNAL_HEADERS.SECRET]: SECRET });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(401);
  });
});

describe('caller uses crypto.timingSafeEqual (constant-time compare at the call site)', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['right secret', SECRET],
    ['wrong secret, same length', 'x'.repeat(SECRET.length)],
    ['wrong secret, shorter', 'abc'],
    ['wrong secret, much longer', 'y'.repeat(SECRET.length * 5 + 7)],
  ])('compares two 32-byte buffers for %s', async (_n, value) => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    await call({ [INTERNAL_HEADERS.SECRET]: value });
    expect(spy).toHaveBeenCalledTimes(1);
    const [a, b] = spy.mock.calls[0] as unknown as [Buffer, Buffer];
    expect(a.length).toBe(32);
    expect(b.length).toBe(32);
  });

  it('mutation check: the allow/deny decision follows timingSafeEqual, not an inline !==', async () => {
    // Stub the primitive to "equal": a WRONG secret must now be let through.
    // An inline `secret !== env.INTERNAL_SECRET` would still reject it.
    jest.spyOn(crypto, 'timingSafeEqual').mockReturnValue(true);
    const allowed = await call({ [INTERNAL_HEADERS.SECRET]: 'not-the-secret' });
    expect(allowed.status).not.toHaveBeenCalledWith(401);
    expect(allowed.status).toHaveBeenCalledWith(400);
    jest.restoreAllMocks();
    // Stub it to "not equal": the RIGHT secret must now be refused.
    jest.spyOn(crypto, 'timingSafeEqual').mockReturnValue(false);
    const denied = await call({ [INTERNAL_HEADERS.SECRET]: SECRET });
    expect(denied.status).toHaveBeenCalledWith(401);
    expect(denied.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});
