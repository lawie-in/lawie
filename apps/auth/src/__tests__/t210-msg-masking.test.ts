/**
 * T-210 round 2 - pino's top-level `msg` must never carry a raw email.
 *   AC1  no log line holds an email (msg, printf params, err.message)
 *   AC2  errorHandler logs the constant message 'Request failed'
 * Captures real pino output through pino(loggerOptions, sink).
 */

import './setupEnv';

import { Request, Response } from 'express';
import pino from 'pino';

import logger, { loggerOptions } from '../config/logger';
import { AppError, errorHandler } from '../middleware/errorHandler';

const EMAIL = 'jane.doe+x@example.com';

function capture() {
  const lines: string[] = [];
  const sink = { write: (s: string) => void lines.push(s) };
  const log = pino({ ...loggerOptions, level: 'trace' }, sink);
  const last = () => JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
  return { log, lines, last };
}

describe('T-210 AC1 - msg masking (round 2)', () => {
  it('logger.error({ err }) with an email in err.message: msg masked, no raw email anywhere', () => {
    const { log, lines, last } = capture();
    log.error({ err: new Error(`dup key for ${EMAIL}`) });
    expect(last().msg).toBe('dup key for [email]');
    expect(lines.join('')).not.toContain(EMAIL);
    expect(lines.join('')).not.toContain('example.com');
  });

  it('logger.error(err) with a bare Error: msg masked, no raw email anywhere', () => {
    const { log, lines, last } = capture();
    log.error(new Error(`bad user ${EMAIL}`));
    expect(last().msg).toBe('bad user [email]');
    expect(lines.join('')).not.toContain(EMAIL);
  });

  it('masks an email passed through %s interpolation', () => {
    const { log, lines, last } = capture();
    log.info('user %s failed', EMAIL);
    expect(last().msg).toBe('user [email] failed');
    expect(lines.join('')).not.toContain(EMAIL);
  });

  it('masks an email in an explicit message string, with and without an object', () => {
    const { log, lines, last } = capture();
    log.warn(`lookup ${EMAIL}`);
    expect(last().msg).toBe('lookup [email]');
    log.warn({ userId: 'u1' }, `lookup ${EMAIL}`);
    expect(last().msg).toBe('lookup [email]');
    expect(lines.join('')).not.toContain(EMAIL);
  });

  it('keeps an explicit msg when {err} is also given, and still masks err.message', () => {
    const { log, lines, last } = capture();
    log.error({ err: new Error(`x ${EMAIL}`) }, 'Request failed');
    expect(last().msg).toBe('Request failed');
    expect(lines.join('')).not.toContain(EMAIL);
  });

  it('leaves non-PII logs unchanged: verbatim message, userId kept', () => {
    const { log, last } = capture();
    log.info('Redis connected');
    expect(last().msg).toBe('Redis connected');
    log.info({ userId: 'abc123' }, 'New user created via Google');
    expect(last()).toEqual(
      expect.objectContaining({ userId: 'abc123', msg: 'New user created via Google' }),
    );
    log.error({ err: new Error('plain failure') });
    expect(last().msg).toBe('plain failure');
  });
});

describe('T-210 AC2 - errorHandler line (round 2)', () => {
  it('emits msg "Request failed" and no raw email, even when err.message holds one', () => {
    const { log, lines, last } = capture();
    const spy = jest
      .spyOn(logger, 'error')
      .mockImplementation(((...a: unknown[]) =>
        (log.error as (...x: unknown[]) => void)(...a)) as never);
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    const req = {
      method: 'POST',
      url: `/auth/register?email=${EMAIL}`,
      ip: '1.2.3.4',
      body: { email: EMAIL, password: 'pw-secret' },
    } as unknown as Request;

    errorHandler(new AppError(409, `Email ${EMAIL} taken`), req, res, jest.fn());
    spy.mockRestore();

    const line = last();
    expect(line.msg).toBe('Request failed');
    expect(line.statusCode).toBe(409);
    const raw = lines.join('');
    expect(raw).not.toContain(EMAIL);
    expect(raw).not.toContain('pw-secret');
  });
});
