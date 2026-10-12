import crypto from 'crypto';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import * as subscriptionService from '../services/subscription.service';

// T-320 — billing: a correctly signed webhook whose body is not valid JSON gets a plain 400 and
// nothing from the body or the SyntaxError is logged. No DB: the handler is stubbed for the
// valid-body case.

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const BAD = '{"event": "subscription.activated", "card": "4111-SECRETCARD" oops}';
const SECRETS = ['SECRETCARD', '4111', 'Unexpected token', 'SyntaxError', 'oops'];
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
const sign = (body: string) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

describe('T-320 billing webhook with malformed JSON', () => {
  let loggerSpies: jest.SpyInstance[];
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let consoleSpies: jest.SpyInstance[];

  beforeEach(() => {
    loggerSpies = LEVELS.map((l) => jest.spyOn(logger, l));
    stderrSpy = jest.spyOn(process.stderr, 'write');
    stdoutSpy = jest.spyOn(process.stdout, 'write');
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  const loggedText = (): string =>
    [
      ...loggerSpies.flatMap((s) => s.mock.calls),
      ...consoleSpies.flatMap((s) => s.mock.calls),
      ...stderrSpy.mock.calls,
      ...stdoutSpy.mock.calls,
    ]
      .map((c) => c.map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
      .join('\n');

  const expectNoEcho = (text: string) => {
    const lower = text.toLowerCase();
    for (const s of SECRETS) expect(lower).not.toContain(s.toLowerCase());
  };

  it.each(['production', 'development'])(
    'signed malformed body gets 400 {error: Bad Request}, nothing logged (env %s)',
    async (e) => {
      app.set('env', e);
      const handler = jest.spyOn(subscriptionService, 'handleWebhookEvent');
      const res = await request(app)
        .post('/webhook/razorpay')
        .type('json')
        .set('x-razorpay-signature', sign(BAD))
        .send(BAD);
      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.text).toBe('{"error":"Bad Request"}');
      expectNoEcho(res.text);
      expectNoEcho(loggedText());
      // The only thing logged is the fixed warn line, with no error object or body.
      const warnCalls = loggerSpies.flatMap((sp) => sp.mock.calls);
      expect(warnCalls).toEqual([['Webhook body is not valid JSON']]);
      expect(stderrSpy.mock.calls.join('')).not.toMatch(/SyntaxError|JSON/);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('a malformed body with a bad signature still gets the existing Invalid signature 400', async () => {
    const res = await request(app)
      .post('/webhook/razorpay')
      .type('json')
      .set(
        'x-razorpay-signature',
        crypto.createHmac('sha256', 'wrong-secret').update(BAD).digest('hex'),
      )
      .send(BAD);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid signature' });
    expectNoEcho(loggedText());
  });

  it('a signed valid body still gets 200 {status: ok} and reaches the handler', async () => {
    const handler = jest
      .spyOn(subscriptionService, 'handleWebhookEvent')
      .mockResolvedValue(undefined as never);
    const body = JSON.stringify({ event: 'subscription.activated', payload: {} });
    const res = await request(app)
      .post('/webhook/razorpay')
      .type('json')
      .set('x-razorpay-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    await new Promise((r) => setTimeout(r, 20));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
