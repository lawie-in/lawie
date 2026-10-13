import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import mongoose from 'mongoose';
import * as Sentry from '@sentry/node';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';
import * as inkLedger from '../services/ink-ledger.service';
import * as subscriptionService from '../services/subscription.service';

// T-413 — the billing webhook acks only after the handler succeeds. Bad signature or body: 400
// before the handler. Handler error: 500 with a fixed body so Razorpay retries. A retry after a
// failed grant grants exactly once (T-399 paid_count claim + rollback). In-memory Mongo only.

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

// Sentry: keep the real module (app.ts wires its express handler) but fake the scope API so the
// test can see exactly what the route puts on it.
const mockScope = {
  setFingerprint: jest.fn(),
  setSDKProcessingMetadata: jest.fn(),
  addEventProcessor: jest.fn(),
  setTags: jest.fn(),
  setExtras: jest.fn(),
  setExtra: jest.fn(),
  setContext: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
};
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  withScope: jest.fn(),
  captureException: jest.fn(),
}));

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const SUB_ID = 'sub_t413';
const sign = (body: string) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
const post = (
  body: string,
  sig: string | null = sign(body),
  headers: Record<string, string> = {},
) => {
  const r = request(app).post('/webhook/razorpay').type('json');
  if (sig !== null) r.set('x-razorpay-signature', sig);
  for (const [k, v] of Object.entries(headers)) r.set(k, v);
  return r.send(body);
};

describe('T-413 webhook ack after the handler', () => {
  beforeEach(() => {
    for (const fn of Object.values(mockScope)) fn.mockReset();
    (Sentry.captureException as jest.Mock).mockReset();
    (Sentry.withScope as jest.Mock).mockReset().mockImplementation((cb) => cb(mockScope));
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('success', () => {
    it('returns 200 {status:ok} only after the handler has finished', async () => {
      let finished = false;
      const handler = jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 50));
          finished = true;
        });
      const body = JSON.stringify({ event: 'subscription.activated', payload: { a: 1 } });
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(finished).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('subscription.activated', { a: 1 });
    });
  });

  describe('handler error', () => {
    it('returns 500 with a fixed body and logs only event/errorName/errorCode', async () => {
      const errSpy = jest.spyOn(logger, 'error');
      const boom = Object.assign(new Error('dup key: ZZSECRETVALUE'), {
        name: 'MongoServerError',
        code: 11000,
      });
      const handler = jest.spyOn(subscriptionService, 'handleWebhookEvent').mockRejectedValue(boom);
      const body = JSON.stringify({ event: 'subscription.charged', payload: {} });
      const res = await post(body);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal Server Error' });
      expect(JSON.stringify(res.body)).not.toContain('ZZSECRETVALUE');
      expect(handler).toHaveBeenCalledTimes(1);
      const call = errSpy.mock.calls.find((c) => c[1] === 'Webhook handler error');
      expect(call).toBeDefined();
      expect(call![0]).toEqual({
        event: 'subscription.charged',
        errorName: 'MongoServerError',
        errorCode: 11000,
      });
      expect(JSON.stringify(errSpy.mock.calls)).not.toContain('ZZSECRETVALUE');
    });
  });

  describe('retry after a 500 (real handler, in-memory Mongo)', () => {
    it('grants exactly once across 500, 200 and a further redelivery', async () => {
      const user = await User.create({ email: 't413@example.com', plan: 'free' });
      await Subscription.create({
        userId: user._id,
        razorpaySubscriptionId: SUB_ID,
        status: 'created',
      });
      const start = Math.floor(new Date('2026-03-01T00:00:00Z').getTime() / 1000);
      const body = JSON.stringify({
        event: 'subscription.charged',
        payload: {
          subscription: {
            entity: {
              id: SUB_ID,
              notes: { planId: 'solo_monthly' },
              paid_count: 1,
              current_start: start,
              current_end: start + 30 * 86400,
              charge_at: start + 30 * 86400,
            },
          },
          payment: { entity: { id: 'pay_t413' } },
        },
      });

      const realGrant = inkLedger.grantSubscriptionInk;
      let succeededGrants = 0;
      const grant = jest
        .spyOn(inkLedger, 'grantSubscriptionInk')
        .mockRejectedValueOnce(new Error('db down'))
        .mockImplementation(async (input) => {
          const r = await realGrant(input);
          succeededGrants += 1;
          return r;
        });
      const ledgerRows = () =>
        mongoose.connection.db!.collection('inkledger').countDocuments({ userId: user._id });
      const succeeded = () => succeededGrants;

      const first = await post(body);
      expect(first.status).toBe(500);
      expect(first.body).toEqual({ error: 'Internal Server Error' });
      expect(succeeded()).toBe(0);
      expect((await User.findById(user._id).lean())!.inkSub ?? 0).toBe(0);

      const second = await post(body);
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ status: 'ok' });
      expect(grant).toHaveBeenCalledTimes(2);
      expect(succeeded()).toBe(1);
      const afterSecond = await User.findById(user._id).lean();
      expect(afterSecond!.inkSub).toBeGreaterThan(0);
      const rowsAfterSecond = await ledgerRows();

      const third = await post(body);
      expect(third.status).toBe(200);
      expect(grant).toHaveBeenCalledTimes(2);
      expect(succeeded()).toBe(1);
      expect(await ledgerRows()).toBe(rowsAfterSecond);
      expect((await User.findById(user._id).lean())!.inkSub).toBe(afterSecond!.inkSub);
      const sub = (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;
      expect(sub.lastGrantedPaidCount).toBe(1);
    });
  });

  describe('bad signature or body', () => {
    const body = JSON.stringify({ event: 'subscription.activated', payload: { a: 1 } });

    it.each([
      ['wrong signature', () => 'a'.repeat(64), 'Invalid signature'],
      ['malformed signature', () => 'abcd', 'Invalid signature'],
      ['missing header', () => null, 'Missing signature header'],
    ])('%s gets 400 and the handler is never called', async (_n, sig, error) => {
      const handler = jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockResolvedValue(undefined as never);
      const res = await post(body, sig());
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error });
      expect(handler).not.toHaveBeenCalled();
    });

    it('a correctly signed body with the wrong shape gets 400 before the handler', async () => {
      const handler = jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockResolvedValue(undefined as never);
      const res = await post(JSON.stringify({ nope: true }));
      expect(res.status).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Sentry on handler error (Arjun a)', () => {
    const SECRET_MSG = 'E11000 dup key ZZPIIVALUE jane@example.com';
    const body = JSON.stringify({
      event: 'subscription.charged',
      payload: { customer: { email: 'jane@example.com' }, note: 'ZZBODYVALUE' },
    });
    const failWith = () =>
      jest
        .spyOn(subscriptionService, 'handleWebhookEvent')
        .mockRejectedValue(
          Object.assign(new Error(SECRET_MSG), { name: 'MongoServerError', code: 11000 }),
        );

    it('captures exactly once, inside withScope, fingerprinted by the event-id header', async () => {
      failWith();
      const order: string[] = [];
      (Sentry.withScope as jest.Mock).mockImplementation((cb) => {
        order.push('withScope-start');
        cb(mockScope);
        order.push('withScope-end');
      });
      (Sentry.captureException as jest.Mock).mockImplementation(() => order.push('capture'));

      const res = await post(body, sign(body), { 'x-razorpay-event-id': 'evt_ABC123' });
      expect(res.status).toBe(500);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.withScope).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['withScope-start', 'capture', 'withScope-end']);
      expect(mockScope.setFingerprint).toHaveBeenCalledTimes(1);
      expect(mockScope.setFingerprint).toHaveBeenCalledWith(['razorpay-webhook', 'evt_ABC123']);
    });

    it('retries of one event share a fingerprint; a different event id gets its own', async () => {
      failWith();
      await post(body, sign(body), { 'x-razorpay-event-id': 'evt_1' });
      await post(body, sign(body), { 'x-razorpay-event-id': 'evt_1' });
      await post(body, sign(body), { 'x-razorpay-event-id': 'evt_2' });
      expect(mockScope.setFingerprint.mock.calls.map((c) => c[0])).toEqual([
        ['razorpay-webhook', 'evt_1'],
        ['razorpay-webhook', 'evt_1'],
        ['razorpay-webhook', 'evt_2'],
      ]);
    });

    it('falls back to the event name when the header is missing', async () => {
      failWith();
      const res = await post(body);
      expect(res.status).toBe(500);
      expect(mockScope.setFingerprint).toHaveBeenCalledWith([
        'razorpay-webhook',
        'subscription.charged',
      ]);
    });

    it('falls back to the event name when the header is empty', async () => {
      failWith();
      await post(body, sign(body), { 'x-razorpay-event-id': '' });
      expect(mockScope.setFingerprint).toHaveBeenCalledWith([
        'razorpay-webhook',
        'subscription.charged',
      ]);
    });

    it('captures a new Error with no original message, body or PII', async () => {
      failWith();
      await post(body, sign(body), { 'x-razorpay-event-id': 'evt_PII' });
      const captured = (Sentry.captureException as jest.Mock).mock.calls[0][0];
      expect(captured).toBeInstanceOf(Error);
      expect(captured.message).toBe('Razorpay webhook handler failed: MongoServerError (11000)');
      expect(captured.name).toBe('Error');
      for (const leak of ['ZZPIIVALUE', 'jane@example.com', 'ZZBODYVALUE', 'E11000']) {
        expect(captured.message).not.toContain(leak);
        expect(String(captured.stack)).not.toContain(leak);
        expect(JSON.stringify(mockScope.setTags.mock.calls)).not.toContain(leak);
      }
      expect((captured as { cause?: unknown }).cause).toBeUndefined();
    });

    it('message degrades cleanly for a non-Error rejection', async () => {
      jest.spyOn(subscriptionService, 'handleWebhookEvent').mockRejectedValue('plain string ZZ');
      const res = await post(body);
      expect(res.status).toBe(500);
      const captured = (Sentry.captureException as jest.Mock).mock.calls[0][0];
      expect(captured.message).toBe('Razorpay webhook handler failed: unknown');
      expect(mockScope.setTags).toHaveBeenCalledWith({
        event: 'subscription.charged',
        errorName: undefined,
        errorCode: undefined,
      });
    });

    it('scope carries only event/errorName/errorCode tags, no extras, user or context', async () => {
      failWith();
      await post(body, sign(body), { 'x-razorpay-event-id': 'evt_T' });
      expect(mockScope.setTags).toHaveBeenCalledTimes(1);
      expect(mockScope.setTags).toHaveBeenCalledWith({
        event: 'subscription.charged',
        errorName: 'MongoServerError',
        errorCode: 11000,
      });
      expect(mockScope.setExtras).not.toHaveBeenCalled();
      expect(mockScope.setExtra).not.toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockScope.setUser).not.toHaveBeenCalled();
      expect(mockScope.setTag).not.toHaveBeenCalled();
      // The event-id header appears only in the fingerprint.
      expect(JSON.stringify(mockScope.setTags.mock.calls)).not.toContain('evt_T');
    });

    it('strips the request: no normalizedRequest/ip metadata and an event processor deletes request/user', async () => {
      failWith();
      await post(body, sign(body), { 'x-razorpay-event-id': 'evt_R' });
      expect(mockScope.setSDKProcessingMetadata).toHaveBeenCalledWith({
        normalizedRequest: undefined,
        ipAddress: undefined,
      });
      expect(mockScope.addEventProcessor).toHaveBeenCalledTimes(1);
      const processor = mockScope.addEventProcessor.mock.calls[0][0];
      const event = {
        message: 'x',
        request: { data: 'ZZBODYVALUE', headers: { 'x-razorpay-signature': 'sig' } },
        user: { ip_address: '1.2.3.4' },
      };
      const out = processor(event);
      expect(out.request).toBeUndefined();
      expect(out.user).toBeUndefined();
      expect(JSON.stringify(out)).not.toContain('ZZBODYVALUE');
    });

    it('is not called on success or on a 400', async () => {
      jest.spyOn(subscriptionService, 'handleWebhookEvent').mockResolvedValue(undefined as never);
      expect((await post(body)).status).toBe(200);
      expect((await post(body, 'a'.repeat(64))).status).toBe(400);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.withScope).not.toHaveBeenCalled();
    });
  });
});
