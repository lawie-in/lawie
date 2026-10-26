/**
 * T-583: the POST /subscribe 'Failed to create subscription' log carries
 * Razorpay's statusCode (rzpStatus) and error.code (rzpCode) when the thrown
 * value has them with the right types, and never the description or any other
 * field. The response stays 500 with the fixed body.
 */
import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import logger from '../config/logger';
import { User } from '../models/User.model';

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: {
      create: jest.fn(),
      all: jest.fn(),
      fetch: jest.fn(),
      cancel: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const createMock = razorpay.subscriptions.create as jest.Mock;
const LOG_MSG = 'Failed to create subscription';
const GENERIC_500 = { error: 'Failed to create subscription' };

// Runtime-built canaries so they never look like a secret literal.
const canary = (n: string) =>
  ['leak', 'canary', n, crypto.randomBytes(6).toString('hex')].join('-');

let errorSpy: jest.SpyInstance;
let counter = 0;

async function subscribeAsNewUser() {
  const email = `t583-${++counter}@example.com`;
  const u = await User.create({ email, plan: 'free', emailVerified: true });
  return request(app)
    .post('/subscribe')
    .set({
      'x-internal-secret': INTERNAL_SECRET,
      'x-user-id': u._id.toString(),
      'x-user-email': email,
      'x-user-name': 'Test',
      'x-user-plan': 'free',
      'x-user-role': 'Client',
      'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
    })
    .send({});
}

/** The single log object for the create failure. */
function loggedObject(): Record<string, unknown> {
  const calls = errorSpy.mock.calls.filter((c) => c[1] === LOG_MSG);
  expect(calls).toHaveLength(1);
  return calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  createMock.mockReset();
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  jest.spyOn(logger, 'info').mockImplementation(() => logger);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-583 AC3: subscribe create failure log', () => {
  it('SDK plain-object rejection -> rzpStatus and rzpCode logged, no description or field text', async () => {
    const description = canary('description');
    const field = canary('field');
    createMock.mockRejectedValue({
      statusCode: 400,
      error: { code: 'BAD_REQUEST_ERROR', description, field },
    });

    const res = await subscribeAsNewUser();

    expect(res.status).toBe(500);
    expect(res.body).toEqual(GENERIC_500);
    const logged = loggedObject();
    expect(logged.rzpStatus).toBe(400);
    expect(logged.rzpCode).toBe('BAD_REQUEST_ERROR');
    expect(logged.errName).toBe('unknown');
    const everything = JSON.stringify(errorSpy.mock.calls);
    expect(everything).not.toContain(description);
    expect(everything).not.toContain(field);
    expect(res.text).not.toContain(description);
  });

  it('plain Error -> no rzpStatus/rzpCode keys, errName is the Error name', async () => {
    const msg = canary('msg');
    createMock.mockRejectedValue(new TypeError(msg));

    const res = await subscribeAsNewUser();

    expect(res.status).toBe(500);
    expect(res.body).toEqual(GENERIC_500);
    const logged = loggedObject();
    expect(logged).not.toHaveProperty('rzpStatus');
    expect(logged).not.toHaveProperty('rzpCode');
    expect(logged.errName).toBe('TypeError');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(msg);
  });

  it.each([
    ['statusCode as a string and code as a number', { statusCode: '400', error: { code: 42 } }],
    ['error as a string', { statusCode: 'x', error: 'BAD_REQUEST_ERROR' }],
    ['error null', { error: null }],
    ['no fields at all', { foo: 'bar' }],
  ])('object with %s -> no rzp keys, errName unknown', async (_label, thrown) => {
    createMock.mockRejectedValue(thrown);

    const res = await subscribeAsNewUser();

    expect(res.status).toBe(500);
    expect(res.body).toEqual(GENERIC_500);
    const logged = loggedObject();
    expect(logged).not.toHaveProperty('rzpStatus');
    expect(logged).not.toHaveProperty('rzpCode');
    expect(logged.errName).toBe('unknown');
  });

  it('Error carrying SDK-shaped fields -> rzp keys logged, errName is the Error name', async () => {
    const description = canary('desc2');
    createMock.mockRejectedValue(
      Object.assign(new Error('boom'), {
        statusCode: 502,
        error: { code: 'SERVER_ERROR', description },
      }),
    );

    const res = await subscribeAsNewUser();

    expect(res.status).toBe(500);
    const logged = loggedObject();
    expect(logged.rzpStatus).toBe(502);
    expect(logged.rzpCode).toBe('SERVER_ERROR');
    expect(logged.errName).toBe('Error');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(description);
  });
});
