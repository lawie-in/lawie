/**
 * T-299 (Arjun rulings 2 and the refresh must-fix):
 *  - login gives no signal about whether an account exists (status, body, dummy bcrypt compare);
 *  - the deactivated 403 is only given to a caller who proved the password;
 *  - refresh needs a live Redis session and a refresh token works once.
 * Real app, real Mongo (in-memory), ioredis-mock.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import bcrypt from 'bcryptjs';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { User } from '../models/User.model';
import { DUMMY_PASSWORD_HASH } from '../services/auth.service';
import { deleteAllUserSessions, hashToken, validateSession } from '../services/session.service';

const PASSWORD = 'Passw0rdOk';
const WRONG = 'Wr0ngPassword';

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

const login = (email: string, password: string) =>
  supertest(app).post('/login').send({ email, password });

const refresh = (refreshToken: string) => supertest(app).post('/refresh').send({ refreshToken });

async function signedIn(email: string) {
  await User.create({ email, name: 'Login Person', password: PASSWORD });
  const res = await login(email, PASSWORD);
  expect(res.status).toBe(200);
  const data = res.body.data as {
    tokens?: { accessToken: string; refreshToken: string };
    accessToken?: string;
    refreshToken?: string;
    user?: { id: string };
  };
  const tokens = data.tokens ?? {
    accessToken: data.accessToken!,
    refreshToken: data.refreshToken!,
  };
  const user = (await User.findOne({ email }).lean())!;
  return { userId: String(user._id), ...tokens };
}

describe('T-299 ruling 2 — login does not reveal an account', () => {
  async function fixtures() {
    await User.create({ email: 'known@example.com', name: 'K', password: PASSWORD });
    await User.create({ email: 'googleonly@example.com', name: 'G', googleId: 'g-only' });
    await User.create({
      email: 'deact-wrong@example.com',
      name: 'D',
      password: PASSWORD,
      isActive: false,
    });
  }

  it('unknown email, wrong password, Google-only and deactivated-with-wrong-password: byte-identical', async () => {
    await fixtures();
    const attempts = [
      await login('nobody@example.com', WRONG),
      await login('known@example.com', WRONG),
      await login('googleonly@example.com', WRONG),
      await login('deact-wrong@example.com', WRONG),
    ];
    for (const r of attempts) {
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Invalid email or password');
    }
    const [first, ...rest] = attempts;
    for (const r of rest) {
      expect(r.status).toBe(first.status);
      expect(r.text).toBe(first.text);
      expect(r.headers['content-length']).toBe(first.headers['content-length']);
      expect(r.headers['content-type']).toBe(first.headers['content-type']);
    }
  });

  it('a Google-only account with the password the caller guessed is still the same 401', async () => {
    await fixtures();
    const a = await login('googleonly@example.com', PASSWORD);
    const b = await login('nobody@example.com', PASSWORD);
    expect(a.status).toBe(401);
    expect(a.text).toBe(b.text);
  });

  it('runs the dummy compare on the unknown-email path (once, at cost 12)', async () => {
    const spy = jest.spyOn(bcrypt, 'compare');
    const res = await login('nobody@example.com', WRONG);
    expect(res.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(WRONG);
    expect(spy.mock.calls[0][1]).toBe(DUMMY_PASSWORD_HASH);
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(12);
  });

  it('runs the dummy compare on the no-password path and never throws a 500', async () => {
    await fixtures();
    const spy = jest.spyOn(bcrypt, 'compare');
    const res = await login('googleonly@example.com', WRONG);
    expect(res.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toBe(DUMMY_PASSWORD_HASH);
  });

  it('a known account with a password compares against its own hash, not the dummy', async () => {
    await fixtures();
    const spy = jest.spyOn(bcrypt, 'compare');
    await login('known@example.com', WRONG);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).not.toBe(DUMMY_PASSWORD_HASH);
  });

  it('the dummy hash can never match a password a caller sends', async () => {
    expect(await bcrypt.compare(PASSWORD, DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await bcrypt.compare('', DUMMY_PASSWORD_HASH)).toBe(false);
  });

  it('deactivated with the correct password: 403 and the exact text', async () => {
    await User.create({
      email: 'deact@example.com',
      name: 'D',
      password: PASSWORD,
      isActive: false,
    });
    const res = await login('deact@example.com', PASSWORD);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Your account has been deactivated. Contact support.');
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken/);
  });

  it('deactivated with the correct password creates no session', async () => {
    const u = await User.create({
      email: 'deact2@example.com',
      name: 'D',
      password: PASSWORD,
      isActive: false,
    });
    await login('deact2@example.com', PASSWORD);
    expect(await redis.keys(`session:*${String(u._id)}*`)).toEqual([]);
  });

  it('an active account with the right password still signs in', async () => {
    await fixtures();
    expect((await login('known@example.com', PASSWORD)).status).toBe(200);
  });
});

describe('T-299 refresh needs a live session', () => {
  it('works with a live session and rotates both tokens', async () => {
    const s = await signedIn('rf-ok@example.com');
    const res = await refresh(s.refreshToken);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).toContain('accessToken');
    expect(body).not.toContain(s.refreshToken);
    // old access session is gone, the new one is live
    expect(await validateSession(s.userId, hashToken(s.accessToken))).toBeNull();
    // the old refresh token is spent
    expect((await refresh(s.refreshToken)).status).toBe(401);
  });

  it('the rotated refresh token works in turn', async () => {
    const s = await signedIn('rf-chain@example.com');
    const first = await refresh(s.refreshToken);
    const next = (first.body.data.tokens ?? first.body.data) as { refreshToken: string };
    expect((await refresh(next.refreshToken)).status).toBe(200);
  });

  it('401 after deleteAllUserSessions, with the same text as a bad JWT, and issues nothing', async () => {
    const s = await signedIn('rf-revoked@example.com');
    await deleteAllUserSessions(s.userId);
    const res = await refresh(s.refreshToken);
    const bad = await refresh('not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired refresh token');
    expect(res.text).toBe(bad.text);
    expect(await redis.keys(`session:${s.userId}:*`)).toEqual([]);
    expect(await redis.keys(`session:refresh:${s.userId}:*`)).toEqual([]);
  });

  it('401 after logout', async () => {
    const s = await signedIn('rf-logout@example.com');
    const out = await supertest(app)
      .post('/logout')
      .set('Authorization', `Bearer ${s.accessToken}`);
    expect(out.status).toBe(200);
    const res = await refresh(s.refreshToken);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired refresh token');
  });

  it('two concurrent refreshes with one token: exactly one 200', async () => {
    const s = await signedIn('rf-race@example.com');
    const results = await Promise.all([
      refresh(s.refreshToken),
      refresh(s.refreshToken),
      refresh(s.refreshToken),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401, 401]);
    // only one new session pair exists
    expect(await redis.keys(`session:refresh:${s.userId}:*`)).toHaveLength(1);
  });

  it('a deactivated user cannot refresh, and the spent refresh key is not reusable', async () => {
    const s = await signedIn('rf-deact@example.com');
    await User.updateOne({ email: 'rf-deact@example.com' }, { isActive: false });
    expect((await refresh(s.refreshToken)).status).toBe(401);
  });

  it('an expired Redis refresh key is a 401, not a new session', async () => {
    const s = await signedIn('rf-expired@example.com');
    await redis.del(`session:refresh:${s.userId}:${hashToken(s.refreshToken)}`);
    expect((await refresh(s.refreshToken)).status).toBe(401);
  });

  it('a corrupt refresh record issues nothing', async () => {
    const s = await signedIn('rf-corrupt@example.com');
    await redis.set(`session:refresh:${s.userId}:${hashToken(s.refreshToken)}`, 'not json');
    expect((await refresh(s.refreshToken)).status).toBe(401);
  });
});
