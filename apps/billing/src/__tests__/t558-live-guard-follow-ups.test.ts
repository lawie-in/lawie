/**
 * T-558 live-subscription guard follow-ups (Arjun's rulings, 22 Oct 2026).
 *  AC2  the webhook adopt holds SubscriptionCreateLock through the event write;
 *       known subs are unchanged (no lock).
 *  AC5  a busy webhook adopt (SubscriptionAdoptBusyError): warn + 500, no
 *       Sentry; one Sentry event when the same sub id is busy on 5 consecutive
 *       deliveries (per process; reset on success or any other error).
 *  (AC6/AC7 are in t527-key-mode.test.ts.)
 *
 * Mongo is the in-memory server (setupDb); Razorpay is mocked. Ids and canaries
 * are built at runtime so gitleaks sees no secret-looking literals.
 */
import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
import { User } from '../models/User.model';
import {
  ADOPT_BUSY_MAX_TRACKED,
  ADOPT_BUSY_REPEAT_THRESHOLD,
  handleWebhookEvent,
  recordWebhookAdoptBusy,
  resetWebhookAdoptBusyCounts,
} from '../services/subscription.service';

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

const mockCaptureMessage = jest.fn();
const mockCaptureException = jest.fn();
const mockSetTag = jest.fn();
const mockSetExtra = jest.fn();
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  captureException: (...a: unknown[]) => mockCaptureException(...a),
  withScope: (cb: (scope: unknown) => void) =>
    cb({
      setTag: mockSetTag,
      setExtra: mockSetExtra,
      setTags: jest.fn(),
      setFingerprint: jest.fn(),
      setSDKProcessingMetadata: jest.fn(),
      addEventProcessor: jest.fn(),
    }),
}));

import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const SOLO = 'solo_monthly';
const REPEATED = 'billing.webhook.adopt_busy_repeated';
const BUSY_WARN = 'Webhook subscription adopt busy (create lock held); asking Razorpay to retry';

const sid = (n: string) => ['sub', '_', 't558', n].join('');
const canary = (n: string) =>
  ['leak', 'canary', n, crypto.randomBytes(6).toString('hex')].join('-');

let counter = 0;
type U = { userId: string; email: string };
async function seedUser(): Promise<U> {
  const email = `${canary('mail')}-${++counter}@example.com`;
  const u = await User.create({ email, plan: 'free', emailVerified: true });
  return { userId: u._id.toString(), email };
}
const subscribe = (u: U) =>
  request(app)
    .post('/subscribe')
    .set({
      'x-internal-secret': INTERNAL_SECRET,
      'x-user-id': u.userId,
      'x-user-email': u.email,
      'x-user-name': 'Test',
      'x-user-plan': 'free',
      'x-user-role': 'Client',
      'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
    })
    .send({});
const getSub = (id: string) => Subscription.findOne({ razorpaySubscriptionId: id }).lean();
const lockCount = (userId: string) => SubscriptionCreateLock.countDocuments({ userId });
const holdLock = (userId: string) =>
  SubscriptionCreateLock.create({ userId, createdAt: new Date() });
const releaseLock = (userId: string) => SubscriptionCreateLock.deleteMany({ userId });

async function postWebhook(event: string, payload: unknown) {
  const body = JSON.stringify({ event, payload });
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  return request(app)
    .post('/webhook/razorpay')
    .type('json')
    .set('x-razorpay-signature', sig)
    .send(body);
}
const entity = (id: string, userId: string) => ({
  subscription: { entity: { id, notes: { userId, planId: SOLO, email: canary('whmail') } } },
  payment: { entity: { email: canary('whpay'), contact: '+910000000000' } },
});

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let infoSpy: jest.SpyInstance;
const callsFor = (spy: jest.SpyInstance, msg: string) => spy.mock.calls.filter((c) => c[1] === msg);
const repeatedEvents = () => mockCaptureMessage.mock.calls.filter((c) => c[0] === REPEATED);
const observed = (): string =>
  JSON.stringify([
    warnSpy.mock.calls,
    errorSpy.mock.calls,
    infoSpy.mock.calls,
    mockCaptureMessage.mock.calls,
    mockSetTag.mock.calls,
    mockSetExtra.mock.calls,
  ]);

beforeAll(async () => {
  await Subscription.init();
  await SubscriptionCreateLock.init();
});

beforeEach(() => {
  resetWebhookAdoptBusyCounts();
  mockCaptureMessage.mockReset();
  mockCaptureException.mockReset();
  mockSetTag.mockReset();
  mockSetExtra.mockReset();
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── AC2: the adopt holds the lock through the event write ───────────────────
describe('T-558 AC2: the webhook adopt holds the create lock while the event is written', () => {
  /** Records the user's lock count at every Subscription.updateOne (the event write). */
  function watchEventWrites(userId: string, during?: () => Promise<void>) {
    const seen: number[] = [];
    const realUpdate = Subscription.updateOne.bind(Subscription) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    let inside = false;
    jest.spyOn(Subscription, 'updateOne').mockImplementation(((...args: unknown[]) => {
      return (async () => {
        seen.push(await lockCount(userId));
        if (during && !inside) {
          inside = true;
          try {
            await during();
          } finally {
            inside = false;
          }
        }
        return realUpdate(...args);
      })();
    }) as never);
    return seen;
  }

  it('adopted sub: the lock is held when the event moves the row, and released after', async () => {
    const u = await seedUser();
    const id = sid('adopt-lock');
    const seen = watchEventWrites(u.userId);

    const res = await postWebhook('subscription.authenticated', entity(id, u.userId));

    expect(res.status).toBe(200);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((n) => n === 1)).toBe(true);
    expect((await getSub(id))!.status).toBe('authenticated');
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('a subscribe during the event write is refused by the lock (409 in-progress), not interleaved', async () => {
    const u = await seedUser();
    const id = sid('adopt-sub');
    let subscribeStatus: number | undefined;
    watchEventWrites(u.userId, async () => {
      subscribeStatus = (await subscribe(u)).status;
    });

    const res = await postWebhook('subscription.authenticated', entity(id, u.userId));

    expect(res.status).toBe(200);
    expect(subscribeStatus).toBe(409);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('an event write that fails still releases the lock; the webhook is a 500', async () => {
    const u = await seedUser();
    const id = sid('adopt-fail');
    jest.spyOn(Subscription, 'updateOne').mockImplementation((() => {
      throw new Error(canary('dbfail'));
    }) as never);

    const res = await postWebhook('subscription.authenticated', entity(id, u.userId));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    expect(await lockCount(u.userId)).toBe(0);
    expect(observed()).not.toContain('leak-canary');
  });

  it('handleWebhookEvent: the lock is not held after it resolves, the row is adopted and moved', async () => {
    const u = await seedUser();
    const id = sid('adopt-svc');

    await expect(
      handleWebhookEvent('subscription.authenticated', entity(id, u.userId)),
    ).resolves.toBeUndefined();

    expect(await lockCount(u.userId)).toBe(0);
    expect((await getSub(id))!.status).toBe('authenticated');
  });

  it('known sub: unchanged, no lock is taken for the event write', async () => {
    const u = await seedUser();
    const id = sid('known');
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: id,
      status: 'created',
      planId: SOLO,
    });
    const createLockSpy = jest.spyOn(SubscriptionCreateLock, 'create');
    const seen = watchEventWrites(u.userId);

    const res = await postWebhook('subscription.authenticated', entity(id, u.userId));

    expect(res.status).toBe(200);
    expect(createLockSpy).not.toHaveBeenCalled();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((n) => n === 0)).toBe(true);
    expect((await getSub(id))!.status).toBe('authenticated');
  });

  it('known sub while a subscribe holds the lock: still handled (200), never busy', async () => {
    const u = await seedUser();
    const id = sid('known2');
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: id,
      status: 'created',
      planId: SOLO,
    });
    await holdLock(u.userId);

    const res = await postWebhook('subscription.authenticated', entity(id, u.userId));

    expect(res.status).toBe(200);
    expect((await getSub(id))!.status).toBe('authenticated');
    expect(await lockCount(u.userId)).toBe(1); // another caller's lock is untouched
  });

  it('adopt while the lock is held by someone else: busy, nothing adopted, their lock untouched', async () => {
    const u = await seedUser();
    const id = sid('adopt-busy');
    await holdLock(u.userId);

    const res = await postWebhook('subscription.authenticated', entity(id, u.userId));

    expect(res.status).toBe(500);
    expect(await getSub(id)).toBeNull();
    expect(await lockCount(u.userId)).toBe(1);
  });
});

// ─── AC5: busy webhook ───────────────────────────────────────────────────────
describe('T-558 AC5: a busy webhook adopt', () => {
  it('constants: threshold 5, a bounded tracker', () => {
    expect(ADOPT_BUSY_REPEAT_THRESHOLD).toBe(5);
    expect(ADOPT_BUSY_MAX_TRACKED).toBeGreaterThanOrEqual(100);
  });

  it('one busy delivery: warn + fixed 500, no Sentry exception, no "Webhook handler error", no repeat event', async () => {
    const u = await seedUser();
    const id = sid('busy1');
    await holdLock(u.userId);

    const res = await postWebhook('subscription.authenticated', entity(id, u.userId));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    const warned = callsFor(warnSpy, BUSY_WARN);
    expect(warned).toHaveLength(1);
    expect(warned[0][0]).toMatchObject({
      event: 'subscription.authenticated',
      subId: id,
      errorName: 'SubscriptionAdoptBusyError',
    });
    expect(callsFor(errorSpy, 'Webhook handler error')).toHaveLength(0);
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(repeatedEvents()).toHaveLength(0);
    expect(callsFor(errorSpy, REPEATED)).toHaveLength(0);
    expect(observed()).not.toContain('leak-canary');
    expect(observed()).not.toContain(u.email);
  });

  it('the same sub id busy on 5 consecutive deliveries: exactly one Sentry event at the 5th, none before, none after', async () => {
    const u = await seedUser();
    const id = sid('busy5');
    await holdLock(u.userId);

    for (let i = 1; i <= 4; i += 1) {
      expect((await postWebhook('subscription.authenticated', entity(id, u.userId))).status).toBe(
        500,
      );
      expect(repeatedEvents()).toHaveLength(0);
    }
    expect((await postWebhook('subscription.authenticated', entity(id, u.userId))).status).toBe(
      500,
    );
    expect(repeatedEvents()).toEqual([[REPEATED, 'error']]);
    const logged = callsFor(errorSpy, REPEATED);
    expect(logged).toHaveLength(1);
    expect(mockSetTag).toHaveBeenCalledWith('razorpaySubscriptionId', id);

    for (let i = 0; i < 3; i += 1) {
      expect((await postWebhook('subscription.authenticated', entity(id, u.userId))).status).toBe(
        500,
      );
    }
    expect(repeatedEvents()).toHaveLength(1);
    expect(callsFor(errorSpy, REPEATED)).toHaveLength(1);
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(observed()).not.toContain('leak-canary');
    expect(observed()).not.toContain(u.email);
  });

  it('different sub ids do not add up (3 + 2 busy deliveries: no event)', async () => {
    const u = await seedUser();
    await holdLock(u.userId);
    for (let i = 0; i < 3; i += 1) {
      await postWebhook('subscription.authenticated', entity(sid('multi-a'), u.userId));
    }
    for (let i = 0; i < 2; i += 1) {
      await postWebhook('subscription.authenticated', entity(sid('multi-b'), u.userId));
    }
    expect(repeatedEvents()).toHaveLength(0);
  });

  it('a successful delivery resets the count', async () => {
    const u = await seedUser();
    const id = sid('reset-ok');
    await holdLock(u.userId);
    for (let i = 0; i < 4; i += 1) {
      await postWebhook('subscription.authenticated', entity(id, u.userId));
    }
    await releaseLock(u.userId);
    expect((await postWebhook('subscription.authenticated', entity(id, u.userId))).status).toBe(
      200,
    );
    // Make the same id unknown again, and busy again.
    await Subscription.deleteOne({ razorpaySubscriptionId: id });
    await holdLock(u.userId);

    for (let i = 0; i < 4; i += 1) {
      await postWebhook('subscription.authenticated', entity(id, u.userId));
    }
    expect(repeatedEvents()).toHaveLength(0);
    await postWebhook('subscription.authenticated', entity(id, u.userId));
    expect(repeatedEvents()).toHaveLength(1);
  });

  it('any other error resets the count', async () => {
    const u = await seedUser();
    const id = sid('reset-err');
    await holdLock(u.userId);
    for (let i = 0; i < 4; i += 1) {
      await postWebhook('subscription.authenticated', entity(id, u.userId));
    }
    jest.spyOn(Subscription, 'findOne').mockRejectedValueOnce(new Error(canary('other')) as never);
    const other = await postWebhook('subscription.authenticated', entity(id, u.userId));
    expect(other.status).toBe(500);
    expect(callsFor(errorSpy, 'Webhook handler error')).toHaveLength(1); // the generic path

    for (let i = 0; i < 4; i += 1) {
      await postWebhook('subscription.authenticated', entity(id, u.userId));
    }
    expect(repeatedEvents()).toHaveLength(0);
    await postWebhook('subscription.authenticated', entity(id, u.userId));
    expect(repeatedEvents()).toHaveLength(1);
  });

  it('a non-busy failure is unchanged: error log + Sentry exception (not the quiet branch)', async () => {
    const u = await seedUser();
    jest.spyOn(Subscription, 'findOne').mockRejectedValueOnce(new Error(canary('other2')) as never);

    const res = await postWebhook('subscription.authenticated', entity(sid('plain-err'), u.userId));

    expect(res.status).toBe(500);
    expect(callsFor(warnSpy, BUSY_WARN)).toHaveLength(0);
    expect(callsFor(errorSpy, 'Webhook handler error')).toHaveLength(1);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  describe('recordWebhookAdoptBusy (service)', () => {
    it('fires once at the threshold; not again above it', () => {
      for (let i = 1; i < ADOPT_BUSY_REPEAT_THRESHOLD; i += 1) {
        recordWebhookAdoptBusy(sid('svc1'), true);
      }
      expect(repeatedEvents()).toHaveLength(0);
      recordWebhookAdoptBusy(sid('svc1'), true);
      expect(repeatedEvents()).toHaveLength(1);
      recordWebhookAdoptBusy(sid('svc1'), true);
      recordWebhookAdoptBusy(sid('svc1'), true);
      expect(repeatedEvents()).toHaveLength(1);
    });

    it('a reset (busy=false) restarts the count', () => {
      for (let i = 0; i < 4; i += 1) recordWebhookAdoptBusy(sid('svc2'), true);
      recordWebhookAdoptBusy(sid('svc2'), false);
      for (let i = 0; i < 4; i += 1) recordWebhookAdoptBusy(sid('svc2'), true);
      expect(repeatedEvents()).toHaveLength(0);
      recordWebhookAdoptBusy(sid('svc2'), true);
      expect(repeatedEvents()).toHaveLength(1);
    });

    it('resetWebhookAdoptBusyCounts clears every count', () => {
      for (let i = 0; i < 4; i += 1) recordWebhookAdoptBusy(sid('svc3'), true);
      resetWebhookAdoptBusyCounts();
      recordWebhookAdoptBusy(sid('svc3'), true);
      expect(repeatedEvents()).toHaveLength(0);
    });

    it('no sub id: nothing tracked, nothing reported', () => {
      for (let i = 0; i < 10; i += 1) recordWebhookAdoptBusy(undefined, true);
      expect(repeatedEvents()).toHaveLength(0);
    });

    it('the tracker is bounded: the least recently updated id is evicted and starts again', () => {
      for (let i = 0; i < 4; i += 1) recordWebhookAdoptBusy(sid('evict-first'), true);
      for (let i = 0; i < ADOPT_BUSY_MAX_TRACKED; i += 1) {
        recordWebhookAdoptBusy(sid(`filler-${i}`), true);
      }
      recordWebhookAdoptBusy(sid('evict-first'), true); // would be the 5th if still tracked
      expect(repeatedEvents()).toHaveLength(0);
    });

    it('the event and log carry the sub id only', () => {
      for (let i = 0; i < ADOPT_BUSY_REPEAT_THRESHOLD; i += 1) {
        recordWebhookAdoptBusy(sid('svc-ids'), true);
      }
      const logged = callsFor(errorSpy, REPEATED);
      expect(logged).toHaveLength(1);
      expect(Object.keys(logged[0][0] as object).sort()).toEqual(['count', 'subId']);
    });
  });
});
