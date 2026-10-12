import crypto from 'crypto';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import * as subscriptionService from '../services/subscription.service';

// T-323 — billing webhook: wrong-length / non-hex signature gets 400 (not 500), and a correctly
// signed body that is valid JSON but the wrong shape gets 400 before the ack. The handler-error
// log carries exactly {event, errorName, errorCode}. No DB: the handler is stubbed.

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const MARKER = 'ZZMARKERSECRET';
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
const sign = (body: string) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
// No wall-clock sleeps. flush() drains the event loop a few turns so the post-ack async path has
// run; waitFor() polls a condition every 5 ms for at most 2 s, then fails with a clear message.
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};
const waitFor = async (cond: () => boolean, what: string) => {
  const deadline = Date.now() + 2000;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`Timed out after 2s waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
  await flush();
};

describe('T-323 billing webhook signature and body shape', () => {
  let loggerSpies: jest.SpyInstance[];
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let consoleSpies: jest.SpyInstance[];
  let unhandled: unknown[];
  const onUnhandled = (r: unknown) => unhandled.push(r);

  beforeEach(() => {
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
    loggerSpies = LEVELS.map((l) => jest.spyOn(logger, l));
    stderrSpy = jest.spyOn(process.stderr, 'write');
    stdoutSpy = jest.spyOn(process.stdout, 'write');
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m),
    );
  });
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    jest.restoreAllMocks();
  });

  const loggedText = (): string =>
    [
      ...loggerSpies.flatMap((s) => s.mock.calls),
      ...consoleSpies.flatMap((s) => s.mock.calls),
      ...stderrSpy.mock.calls,
      ...stdoutSpy.mock.calls,
    ]
      .map((c) => c.map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
      .join('\n');

  const post = (body: string, sig?: string) => {
    const r = request(app).post('/webhook/razorpay').type('json');
    if (sig !== undefined) r.set('x-razorpay-signature', sig);
    return r.send(body);
  };

  describe('signature header', () => {
    const body = JSON.stringify({ event: 'subscription.activated', payload: { a: 1 } });
    const good = () => sign(body);

    it.each([
      ['short header', () => 'abcd'],
      ['66 characters', () => good() + 'ab'],
      ['63 characters', () => good().slice(0, 63)],
      ['64 non-hex characters', () => 'z'.repeat(64)],
      ['64 chars, valid hex prefix then non-hex', () => 'a'.repeat(32) + 'z'.repeat(32)],
      ['wrong 64-char hex', () => (good()[0] === 'a' ? 'b' : 'a') + good().slice(1)],
    ])('%s gets 400 Invalid signature, handler not called', async (_n, make) => {
      const handler = jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockResolvedValue(undefined as never);
      const res = await post(body, make());
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid signature' });
      await flush();
      expect(handler).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]);
    });

    it('a correct signature in upper-case hex still gets 200', async () => {
      const handler = jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockResolvedValue(undefined as never);
      const res = await post(body, good().toUpperCase());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      await waitFor(() => handler.mock.calls.length > 0, 'handleWebhookEvent to be called');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('a missing header gets the existing 400 Missing signature header', async () => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing signature header' });
    });
  });

  describe('verifyWebhookSignature (unit)', () => {
    const raw = Buffer.from('{"event":"x","payload":{}}');
    const good = sign(raw.toString());

    it('returns true for the correct signature, upper or lower case', () => {
      expect(subscriptionService.verifyWebhookSignature(raw, good)).toBe(true);
      expect(subscriptionService.verifyWebhookSignature(raw, good.toUpperCase())).toBe(true);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['number', 5],
      ['array', ['a']],
      ['object', {}],
      ['empty string', ''],
      ['short string', 'abcd'],
      ['too long', 'a'.repeat(66)],
      ['64 non-hex', 'z'.repeat(64)],
      ['64 with whitespace', ' ' + 'a'.repeat(63)],
    ])('returns false without throwing for %s', (_n, sig) => {
      expect(() => subscriptionService.verifyWebhookSignature(raw, sig)).not.toThrow();
      expect(subscriptionService.verifyWebhookSignature(raw, sig)).toBe(false);
    });
  });

  describe('body shape (correctly signed)', () => {
    const cases: [string, string][] = [
      ['empty array', '[]'],
      ['array with marker', `["${MARKER}"]`],
      ['null', 'null'],
      ['number', '5'],
      ['string', `"${MARKER}"`],
      ['empty object', '{}'],
      ['object with marker, no event', `{"card":"${MARKER}"}`],
      ['event is a number', `{"event":5,"card":"${MARKER}"}`],
      ['event only, no payload', '{"event":"x"}'],
      ['event only with marker', `{"event":"x","card":"${MARKER}"}`],
      ['payload null', `{"event":"x","payload":null,"card":"${MARKER}"}`],
      ['payload array', `{"event":"x","payload":["${MARKER}"]}`],
      ['payload number', `{"event":"x","payload":7,"card":"${MARKER}"}`],
      ['payload string', `{"event":"x","payload":"${MARKER}"}`],
    ];

    it.each(cases)(
      '%s gets 400 Bad Request before the ack; no handler call, no throw, nothing logged',
      async (_n, body) => {
        const handler = jest
          .spyOn(subscriptionService, 'handleWebhookEvent')
          .mockResolvedValue(undefined as never);
        const res = await post(body, sign(body));
        expect(res.status).toBe(400);
        expect(res.text).toBe('{"error":"Bad Request"}');
        await flush();
        expect(handler).not.toHaveBeenCalled();
        expect(unhandled).toEqual([]);
        const lower = loggedText().toLowerCase();
        expect(lower).not.toContain(MARKER.toLowerCase());
        expect(lower).not.toContain(body.toLowerCase());
      },
    );
  });

  describe('handler-error log', () => {
    const body = JSON.stringify({ event: 'subscription.charged', payload: { x: 1 } });

    it('logs exactly {event, errorName, errorCode}; no message or stack anywhere', async () => {
      const secret = 'secret@x.com';
      const err = Object.assign(new Error(`E11000 dup key: { email: "${secret}" }`), {
        name: 'MongoServerError',
        code: 11000,
      });
      jest.spyOn(subscriptionService, 'handleWebhookEvent').mockRejectedValue(err);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      await waitFor(
        () =>
          (logger.error as unknown as jest.SpyInstance).mock.calls.some(
            (c) => c[1] === 'Webhook handler error',
          ),
        "logger.error('Webhook handler error')",
      );

      const calls = (logger.error as unknown as jest.SpyInstance).mock.calls;
      expect(calls).toHaveLength(1);
      const [obj, msg] = calls[0];
      expect(msg).toBe('Webhook handler error');
      expect(Object.keys(obj).sort()).toEqual(['errorCode', 'errorName', 'event']);
      expect(obj).toEqual({
        event: 'subscription.charged',
        errorName: 'MongoServerError',
        errorCode: 11000,
      });
      const text = loggedText().toLowerCase();
      expect(text).not.toContain(secret);
      expect(text).not.toContain('e11000');
      expect(text).not.toContain('dup key');
      expect(unhandled).toEqual([]);
    });

    it('a rejected non-Error value (string) logs errorName undefined and does not throw', async () => {
      jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockRejectedValue(`${MARKER} plain string`);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      await waitFor(
        () =>
          (logger.error as unknown as jest.SpyInstance).mock.calls.some(
            (c) => c[1] === 'Webhook handler error',
          ),
        "logger.error('Webhook handler error')",
      );
      const calls = (logger.error as unknown as jest.SpyInstance).mock.calls;
      expect(calls).toHaveLength(1);
      const [obj] = calls[0];
      expect(obj.event).toBe('subscription.charged');
      expect(obj.errorName).toBeUndefined();
      expect(obj.errorCode).toBeUndefined();
      expect(Object.keys(obj).sort()).toEqual(['errorCode', 'errorName', 'event']);
      expect(loggedText().toLowerCase()).not.toContain(MARKER.toLowerCase());
      expect(unhandled).toEqual([]);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
    ])('a handler rejecting with %s does not throw inside the catch', async (_n, val) => {
      jest.spyOn(subscriptionService, 'handleWebhookEvent').mockRejectedValue(val);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      await waitFor(
        () =>
          (logger.error as unknown as jest.SpyInstance).mock.calls.some(
            (c) => c[1] === 'Webhook handler error',
          ),
        "logger.error('Webhook handler error')",
      );
      expect((logger.error as unknown as jest.SpyInstance).mock.calls).toHaveLength(1);
      expect(unhandled).toEqual([]);
    });
  });

  describe('valid events', () => {
    it('an object payload gets 200 and handleWebhookEvent is called with (event, payload)', async () => {
      const handler = jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockResolvedValue(undefined as never);
      const payload = { subscription: { entity: { id: 'sub_1' } } };
      const body = JSON.stringify({ event: 'subscription.activated', payload });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      await waitFor(() => handler.mock.calls.length > 0, 'handleWebhookEvent to be called');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('subscription.activated', payload);
      expect(unhandled).toEqual([]);
    });

    it('an empty object payload is accepted', async () => {
      const handler = jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockResolvedValue(undefined as never);
      const body = '{"event":"x","payload":{}}';
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      await waitFor(() => handler.mock.calls.length > 0, 'handleWebhookEvent to be called');
      expect(handler).toHaveBeenCalledWith('x', {});
    });
  });
});
