/**
 * T-196 — Registration can never grant Admin.
 *
 * AC1: POST /register always creates role 'Client', whatever `role` the body carries.
 * AC3: existing Admin accounts keep their role through login and refresh.
 * Regression: validation errors and referralCode still pass through.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import supertest from 'supertest';

import app from '../app';
import { User } from '../models/User.model';
import { verifyAccessToken, verifyRefreshToken } from '../services/jwt.service';
import { registerUser } from '../services/auth.service';
import { validateRegister } from '../validators/auth.validator';

const PASSWORD = 'Passw0rdOk';

function body(email: string, extra: Record<string, unknown> = {}) {
  return { email, password: PASSWORD, name: 'Test Person', ...extra };
}

describe('T-196 AC1 — POST /register ignores any client-sent role', () => {
  const roleValues: Array<[string, unknown]> = [
    ['Admin', 'Admin'],
    ['admin', 'admin'],
    ['ADMIN', 'ADMIN'],
    ['Lawyer', 'Lawyer'],
    ['superuser', 'superuser'],
    ['object', { $ne: 'Client' }],
    ['object with Admin', { role: 'Admin' }],
    ['array', ['Admin']],
    ['null', null],
    ['empty string', ''],
  ];

  it.each(roleValues)('role=%s -> 201, stored and returned Client', async (_label, role) => {
    const email = `r-${Math.random().toString(36).slice(2)}@example.com`;
    const res = await supertest(app).post('/register').send(body(email, { role }));

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('Client');
    expect(verifyAccessToken(res.body.data.accessToken).role).toBe('Client');
    expect(verifyRefreshToken(res.body.data.refreshToken).role).toBe('Client');

    const stored = await User.findOne({ email }).lean();
    expect(stored!.role).toBe('Client');
  });

  it('no role in body -> Client', async () => {
    const res = await supertest(app).post('/register').send(body('norole@example.com'));
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('Client');
  });

  it('other privilege-like fields do not leak into the user either', async () => {
    const res = await supertest(app)
      .post('/register')
      .send(body('extras@example.com', { role: 'Admin', isActive: false, plan: 'pro', isAdmin: true }));
    expect(res.status).toBe(201);
    const stored = await User.findOne({ email: 'extras@example.com' }).lean();
    expect(stored!.role).toBe('Client');
    expect((stored as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it('service level: registerUser hard-sets Client even if a role is smuggled in', async () => {
    const smuggled = { ...body('svc@example.com'), role: 'Admin' } as unknown as Parameters<
      typeof registerUser
    >[0];
    const { user, tokens } = await registerUser(smuggled);
    expect(user.role).toBe('Client');
    expect(verifyAccessToken(tokens.accessToken).role).toBe('Client');
    expect((await User.findOne({ email: 'svc@example.com' }).lean())!.role).toBe('Client');
  });

  it('validator strips role from the parsed payload', () => {
    const parsed = validateRegister(body('v@example.com', { role: 'Admin' }));
    expect((parsed as unknown as Record<string, unknown>).role).toBeUndefined();
  });
});

describe('T-196 regression — normal register still works', () => {
  it('rejects a weak password (no user created)', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 'weak@example.com', password: 'short', name: 'X', role: 'Admin' });
    // NOTE: errorHandler currently turns validator errors into 500 (pre-existing, reported).
    expect(res.status).not.toBe(201);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await User.findOne({ email: 'weak@example.com' })).toBeNull();
  });

  it('rejects an invalid email', async () => {
    const res = await supertest(app).post('/register').send(body('not-an-email'));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(201);
  });

  it('rejects a missing name', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 'noname@example.com', password: PASSWORD });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(201);
  });

  it('duplicate email still returns 409, and a role cannot upgrade the existing account', async () => {
    await supertest(app).post('/register').send(body('dup@example.com'));
    const res = await supertest(app)
      .post('/register')
      .send(body('dup@example.com', { role: 'Admin' }));
    expect(res.status).toBe(409);
    expect((await User.findOne({ email: 'dup@example.com' }).lean())!.role).toBe('Client');
  });

  it('referralCode passes through the validator', () => {
    const parsed = validateRegister(body('ref@example.com', { referralCode: 'ABC123' }));
    expect((parsed as unknown as Record<string, unknown>).referralCode).toBe('ABC123');
  });

  it('referralCode is accepted at the route and registration succeeds as Client', async () => {
    const res = await supertest(app)
      .post('/register')
      .send(body('refroute@example.com', { referralCode: 'NOSUCH', role: 'Admin' }));
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('Client');
  });

  it('email is lowercased and password is not returned', async () => {
    const res = await supertest(app).post('/register').send(body('MiXed@Example.com'));
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('mixed@example.com');
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });
});

describe('T-196 AC3 — existing Admin keeps Admin through login and refresh', () => {
  async function seedAdmin(email: string) {
    // Seeded directly in the DB, as ops would do. Not through any API.
    return User.create({ email, name: 'Founder', password: PASSWORD, role: 'Admin' });
  }

  it('login returns Admin in body and in both tokens', async () => {
    await seedAdmin('founder@example.com');
    const res = await supertest(app)
      .post('/login')
      .send({ email: 'founder@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('Admin');
    expect(verifyAccessToken(res.body.data.accessToken).role).toBe('Admin');
    expect(verifyRefreshToken(res.body.data.refreshToken).role).toBe('Admin');
  });

  it('refresh keeps Admin', async () => {
    await seedAdmin('founder2@example.com');
    const login = await supertest(app)
      .post('/login')
      .send({ email: 'founder2@example.com', password: PASSWORD });
    const res = await supertest(app)
      .post('/refresh')
      .send({ refreshToken: login.body.data.refreshToken });
    expect(res.status).toBe(200);
    expect(verifyAccessToken(res.body.data.accessToken).role).toBe('Admin');
    expect(verifyRefreshToken(res.body.data.refreshToken).role).toBe('Admin');
  });

  it('a role sent on login does not change the stored role of a Client', async () => {
    await User.create({ email: 'plain@example.com', name: 'Plain', password: PASSWORD });
    const res = await supertest(app)
      .post('/login')
      .send({ email: 'plain@example.com', password: PASSWORD, role: 'Admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('Client');
    expect((await User.findOne({ email: 'plain@example.com' }).lean())!.role).toBe('Client');
  });

  it('register with an existing Admin email does not touch that Admin', async () => {
    await seedAdmin('founder3@example.com');
    const res = await supertest(app)
      .post('/register')
      .send(body('founder3@example.com', { role: 'Client' }));
    expect(res.status).toBe(409);
    expect((await User.findOne({ email: 'founder3@example.com' }).lean())!.role).toBe('Admin');
  });
});
