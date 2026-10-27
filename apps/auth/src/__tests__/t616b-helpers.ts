/**
 * T-616b — shared helpers for the refresh-rotation tests. Not a test file (no .test.ts).
 * ioredis-mock evaluates TTLs against Date.now(), and jsonwebtoken checks exp against it too, so
 * moving Date.now() forward expires a grace record without waiting 30 real seconds.
 */
import crypto from 'crypto';

import { refreshSessionKey, sessionKey } from '@lawie/shared';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { hashToken } from '../services/session.service';

let offsetMs = 0;
let clockSpy: jest.SpyInstance | undefined;

/** Move the clock forward by `seconds` (cumulative). Undo with resetClock(). */
export function advanceClock(seconds: number): void {
  offsetMs += seconds * 1000;
  if (!clockSpy) {
    const real = Date.now.bind(Date);
    clockSpy = jest.spyOn(Date, 'now').mockImplementation(() => real() + offsetMs);
  }
}

export function resetClock(): void {
  offsetMs = 0;
  clockSpy?.mockRestore();
  clockSpy = undefined;
}

export const PASSWORD = 'Passw0rdOk';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export const refreshReq = (refreshToken: string) =>
  supertest(app).post('/refresh').send({ refreshToken });

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

export function tokensOf(body: { data?: Record<string, unknown> }): Tokens {
  const d = (body.data ?? {}) as Partial<Tokens> & { tokens?: Tokens };
  return (d.tokens ?? { accessToken: d.accessToken, refreshToken: d.refreshToken }) as Tokens;
}

export const accessKeyOf = (uid: string, token: string) => sessionKey(uid, hashToken(token));
export const refreshKeyOf = (uid: string, token: string) =>
  refreshSessionKey(uid, hashToken(token));

/** Keys of the form session:refresh:<uid>:* whose value is a grace record. */
export async function graceKeys(uid: string): Promise<string[]> {
  const keys = await redis.keys(`session:refresh:${uid}:*`);
  const out: string[] = [];
  for (const k of keys) {
    const v = await redis.get(k);
    if (v?.startsWith('{"g":1,')) out.push(k);
  }
  return out;
}

/** Keys session:refresh:<uid>:* that are live refresh records (not grace records). */
export async function liveRefreshKeys(uid: string): Promise<string[]> {
  const keys = await redis.keys(`session:refresh:${uid}:*`);
  const grace = new Set(await graceKeys(uid));
  return keys.filter((k) => !grace.has(k));
}

/** A fresh random secret-free string for a unique email local part. */
export const uniq = (): string => crypto.randomBytes(4).toString('hex');
