/**
 * T-208 — validation errors return 422 with their message, not 500, and are not sent to Sentry.
 *
 * AC1/AC4: register (invalid email, short password, missing fields) and login (missing password) -> 422 + message.
 * AC2: Sentry.captureException is not called for these.
 * AC5: valid register / login unchanged.
 * Sanity: a genuinely unexpected error is still 500 and still reported.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));
jest.mock('@sentry/node', () => {
  const actual = jest.requireActual('@sentry/node');
  return { ...actual, captureException: jest.fn() };
});

import './setupDb';

import * as Sentry from '@sentry/node';
import supertest from 'supertest';

import app from '../app';
import { User } from '../models/User.model';
import * as authService from '../services/auth.service';

const PASSWORD = 'Passw0rdOk';
// AJ-522-S7 / S10, byte for byte from the signed rulings file.
const S7 = 'Use at least 8 characters, with an upper-case letter, a lower-case letter and a digit.';
const captureException = Sentry.captureException as jest.Mock;

function expect422(res: supertest.Response, ...fragments: string[]) {
  expect(res.status).toBe(422);
  expect(res.body.statusCode).toBe(422);
  expect(res.body.status).toBe('error');
  for (const f of fragments) {
    expect(res.body.message).toContain(f);
  }
  expect(res.body.message).not.toBe('Internal Server Error');
}

beforeEach(() => {
  captureException.mockClear();
});

describe('T-208 AC4 — POST /register validation', () => {
  it('invalid email -> 422 "Invalid email format"', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 'not-an-email', password: PASSWORD, name: 'Test' });
    expect422(res, 'Invalid email format');
  });

  it('short password -> 422 with length message', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 't208-short@example.com', password: 'Ab1', name: 'Test' });
    expect422(res, S7);
    expect(res.body.message).toBe(S7);
    expect(await User.findOne({ email: 't208-short@example.com' })).toBeNull();
  });

  it('password without uppercase / number -> 422 with those messages', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 't208-weak@example.com', password: 'alllowercase', name: 'Test' });
    // S10: one signed line, once, however many rules failed; the per-rule texts are gone.
    expect422(res, S7);
    expect(res.body.message).toBe(S7);
    expect(res.body.message).not.toContain('uppercase');
  });

  it('missing name -> 422 "Name is required"', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 't208-noname@example.com', password: PASSWORD });
    expect422(res, 'Name is required');
  });

  it('empty name -> 422 "Name is required"', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 't208-emptyname@example.com', password: PASSWORD, name: '' });
    expect422(res, 'Name is required');
  });

  it('missing email -> 422 "Email is required"', async () => {
    const res = await supertest(app).post('/register').send({ password: PASSWORD, name: 'Test' });
    expect422(res, 'Email is required');
  });

  it('missing password -> 422 "Password is required"', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 't208-nopw@example.com', name: 'Test' });
    expect422(res, 'Password is required');
  });

  it('empty body -> 422 listing every missing field', async () => {
    const res = await supertest(app).post('/register').send({});
    expect422(res, 'Email is required', 'Password is required', 'Name is required');
  });

  it('several problems at once are all reported in message', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 'bad', password: 'short', name: '' });
    expect422(res, 'Invalid email format', S7, 'Name is required');
    expect(res.body.message).toBe(`Invalid email format; ${S7}; Name is required`);
  });
});

describe('T-208 AC4 — POST /login validation', () => {
  it('missing password -> 422 "Password is required"', async () => {
    const res = await supertest(app).post('/login').send({ email: 'a@example.com' });
    expect422(res, 'Password is required');
  });

  it('empty password -> 422 "Password is required"', async () => {
    const res = await supertest(app).post('/login').send({ email: 'a@example.com', password: '' });
    expect422(res, 'Password is required');
  });

  it('missing email -> 422 "Email is required"', async () => {
    const res = await supertest(app).post('/login').send({ password: PASSWORD });
    expect422(res, 'Email is required');
  });

  it('invalid email -> 422 "Invalid email format"', async () => {
    const res = await supertest(app).post('/login').send({ email: 'nope', password: PASSWORD });
    expect422(res, 'Invalid email format');
  });
});

describe('T-208 AC2 — validation errors are not reported to Sentry', () => {
  it('register validation failures never call captureException', async () => {
    await supertest(app).post('/register').send({});
    await supertest(app).post('/register').send({ email: 'bad', password: 'x', name: '' });
    await supertest(app)
      .post('/register')
      .send({ email: 'nope', password: PASSWORD, name: 'Test' });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('login validation failures never call captureException', async () => {
    await supertest(app).post('/login').send({ email: 'a@example.com' });
    await supertest(app).post('/login').send({});
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('T-208 AC5 — valid requests unchanged', () => {
  it('valid register -> 202 neutral (no tokens), valid login -> 200 with tokens, no Sentry', async () => {
    const email = 't208-ok@example.com';
    const reg = await supertest(app)
      .post('/register')
      .send({ email, password: PASSWORD, name: 'Test Person' });
    expect(reg.status).toBe(202);
    expect(reg.body).toEqual({ status: 'success', data: { status: 'check_email' } });
    expect(reg.body.data.accessToken).toBeUndefined();

    const login = await supertest(app).post('/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toEqual(expect.any(String));

    expect(captureException).not.toHaveBeenCalled();
  });

  it('wrong password on login is still a 4xx auth failure, not 422/500', async () => {
    const email = 't208-wrongpw@example.com';
    await supertest(app).post('/register').send({ email, password: PASSWORD, name: 'Test' });
    const res = await supertest(app).post('/login').send({ email, password: 'Wrong1234' });
    expect(res.status).toBe(401);
  });

  it('duplicate register is the neutral 202 (T-522: no 409)', async () => {
    const email = 't208-dup@example.com';
    const body = { email, password: PASSWORD, name: 'Test' };
    const first = await supertest(app).post('/register').send(body);
    const res = await supertest(app).post('/register').send(body);
    expect(first.status).toBe(202);
    expect(res.status).toBe(202);
    expect(res.body).toEqual(first.body);
  });
});

describe('T-208 sanity — unexpected errors still 500 and still reported', () => {
  it('non-AppError thrown by the service -> 500 generic message and captureException', async () => {
    const spy = jest.spyOn(authService, 'registerUser').mockRejectedValueOnce(new Error('boom'));
    const res = await supertest(app)
      .post('/register')
      .send({ email: 't208-boom@example.com', password: PASSWORD, name: 'Test' });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal Server Error');
    expect(captureException).toHaveBeenCalled();
  });
});
