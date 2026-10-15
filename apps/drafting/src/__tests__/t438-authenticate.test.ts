/**
 * T-438 (b): authenticate refuses a wrong, short, long, prefix, repeated
 * (array), empty or missing secret with 401 { error: 'Unauthorized' }, and
 * lets the right one through.
 */
import crypto from 'crypto';

import { INTERNAL_HEADERS } from '@lawie/shared';
import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env';
import { authenticate } from '../middleware/authenticate';

const SECRET = env.INTERNAL_SECRET;

function run(headers: Record<string, unknown>) {
  const req = { headers } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn() as unknown as NextFunction & jest.Mock;
  authenticate(req, res as unknown as Response, next);
  return { req, res, next };
}

const withUser = { [INTERNAL_HEADERS.USER_ID]: '507f1f77bcf86cd799439011' };

describe('authenticate - internal secret', () => {
  it('lets the right secret through and sets the user', () => {
    const { req, res, next } = run({ [INTERNAL_HEADERS.SECRET]: SECRET, ...withUser });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.jwtPayload?.sub).toBe('507f1f77bcf86cd799439011');
  });

  it.each([
    ['wrong, same length', 'x'.repeat(SECRET.length)],
    ['shorter', SECRET.slice(0, 4)],
    ['longer', SECRET + 'extra'],
    ['prefix of the right one', SECRET.slice(0, -1)],
    ['empty string', ''],
    ['array (repeated header)', [SECRET, SECRET]],
    ['array of the right value', [SECRET]],
    ['missing', undefined],
  ] as Array<[string, unknown]>)('401 Unauthorized for %s', (_n, value) => {
    const { res, next } = run({ [INTERNAL_HEADERS.SECRET]: value, ...withUser });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('401 Unauthorized when the configured secret is missing or empty, even with an empty header', () => {
    const original = env.INTERNAL_SECRET;
    try {
      for (const configured of [undefined, '']) {
        (env as { INTERNAL_SECRET: unknown }).INTERNAL_SECRET = configured;
        for (const sent of [configured, '', 'anything']) {
          const { res, next } = run({ [INTERNAL_HEADERS.SECRET]: sent, ...withUser });
          expect(res.status).toHaveBeenCalledWith(401);
          expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
          expect(next).not.toHaveBeenCalled();
        }
      }
    } finally {
      (env as { INTERNAL_SECRET: unknown }).INTERNAL_SECRET = original;
    }
  });

  it('right secret but no user id keeps the old, separate answer', () => {
    const { res, next } = run({ [INTERNAL_HEADERS.SECRET]: SECRET });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing user context' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('caller uses crypto.timingSafeEqual (constant-time compare at the call site)', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['right secret', SECRET],
    ['wrong secret, same length', 'x'.repeat(SECRET.length)],
    ['wrong secret, shorter', 'abc'],
    ['wrong secret, much longer', 'y'.repeat(SECRET.length * 5 + 7)],
  ])('compares two 32-byte buffers for %s', (_n, value) => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    run({ [INTERNAL_HEADERS.SECRET]: value, ...withUser });
    expect(spy).toHaveBeenCalledTimes(1);
    const [a, b] = spy.mock.calls[0] as unknown as [Buffer, Buffer];
    expect(a.length).toBe(32);
    expect(b.length).toBe(32);
  });

  it('mutation check: the allow/deny decision follows timingSafeEqual, not an inline !==', () => {
    // Stub the primitive to "equal": a WRONG secret must now be let through.
    // An inline `secret !== env.INTERNAL_SECRET` would still reject it.
    jest.spyOn(crypto, 'timingSafeEqual').mockReturnValue(true);
    const allowed = run({ [INTERNAL_HEADERS.SECRET]: 'not-the-secret', ...withUser });
    expect(allowed.next).toHaveBeenCalledTimes(1);
    expect(allowed.res.status).not.toHaveBeenCalled();
    jest.restoreAllMocks();
    // Stub it to "not equal": the RIGHT secret must now be refused.
    jest.spyOn(crypto, 'timingSafeEqual').mockReturnValue(false);
    const denied = run({ [INTERNAL_HEADERS.SECRET]: SECRET, ...withUser });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(401);
    expect(denied.res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});
