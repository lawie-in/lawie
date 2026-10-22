/**
 * T-223 AC3 / Arjun condition 4 against a REAL loopback Redis, picked by t223-real-redis-env.ts:
 * REDIS_TEST_URL if set (loopback, must answer PING and accept a write, else it throws), otherwise
 * a private redis-server with persistence off, otherwise it throws. REDIS_URL is never read.
 * 1 verify mail per user per 2 min (T-522) and 5 per 24 h, through the real resend route. No ioredis-mock,
 * so SET NX / PTTL / INCR / PEXPIRE behave as in production. Keys are per-user, removed afterwards,
 * and flushall is never called. The test FAILS (does not skip) when Redis is not reachable.
 */

import './setupEnv';
import { stopPrivateRedis } from './t223-real-redis-env';

jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { User } from '../models/User.model';

const enqueueMock = enqueueEmail as unknown as jest.Mock;
const PASSWORD = 'Passw0rdOk';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const userIds: string[] = [];

beforeAll(async () => {
  expect(await redis.ping()).toBe('PONG');
});

beforeEach(() => {
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j', queue: 'email-high', deduped: false });
});

afterAll(async () => {
  for (const id of userIds) {
    await redis.del(`auth:verify-email:min:${id}`, `auth:verify-email:day:${id}`);
  }
  await redis.quit();
  stopPrivateRedis();
});

async function newUser(n: string) {
  const u = await User.create({
    email: `t223-real-${n}@example.com`,
    name: 'R',
    password: PASSWORD,
  });
  userIds.push(String(u._id));
  const res = await supertest(app).post('/login').send({ email: u.email, password: PASSWORD });
  expect(res.status).toBe(200);
  const d = res.body.data as { accessToken?: string; tokens?: { accessToken: string } };
  return { id: String(u._id), token: (d.tokens?.accessToken ?? d.accessToken) as string };
}

const resend = (t: string) => supertest(app).post('/verify-email/resend').set(bearer(t));

describe('T-223 resend cap against real Redis', () => {
  it('1 per 2 min: the second call is 429 with a retryAfter that matches the real key TTL', async () => {
    const { id, token } = await newUser('min');
    expect((await resend(token)).status).toBe(202);

    const pttl = await redis.pttl(`auth:verify-email:min:${id}`);
    expect(pttl).toBeGreaterThan(115_000);
    expect(pttl).toBeLessThanOrEqual(120_000);
    const dayTtl = await redis.pttl(`auth:verify-email:day:${id}`);
    expect(dayTtl).toBeGreaterThan(24 * 3600 * 1000 - 10_000);
    expect(await redis.get(`auth:verify-email:day:${id}`)).toBe('1');

    const res = await resend(token);
    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBeGreaterThan(60);
    expect(res.body.retryAfter).toBeLessThanOrEqual(120);
    expect(Number(res.headers['retry-after'])).toBe(res.body.retryAfter);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    // a refused call does not count against the day cap
    expect(await redis.get(`auth:verify-email:day:${id}`)).toBe('1');
  });

  it('5 per 24 h: five sends succeed (minute key expired between), the sixth is 429 with a ~24 h wait', async () => {
    const { id, token } = await newUser('day');
    for (let i = 0; i < 5; i += 1) {
      expect((await resend(token)).status).toBe(202);
      await redis.del(`auth:verify-email:min:${id}`); // stand in for 60 s passing
    }
    expect(await redis.get(`auth:verify-email:day:${id}`)).toBe('5');

    const res = await resend(token);
    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBeGreaterThan(24 * 3600 - 60);
    expect(res.body.retryAfter).toBeLessThanOrEqual(24 * 3600);
    expect(enqueueMock).toHaveBeenCalledTimes(5);
    expect(await redis.get(`auth:verify-email:day:${id}`)).toBe('5');
  });

  it('concurrent resends for one user: exactly one is queued', async () => {
    const { token } = await newUser('conc');
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => resend(token)));
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});
