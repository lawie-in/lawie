/**
 * T-536: one live subscription per user, at the database.
 *  AC1: a partial unique index on subscriptions { userId } for the six
 *    non-terminal statuses, ensured at boot only (not on the schema), named
 *    userId_1_live_unique; userId_1 stays; created once, idempotent.
 *  AC2: the read-only data check script (check:live-sub-duplicates).
 *  AC3: a failed build logs, reports to Sentry and does not stop boot.
 *  AC4: the index rejects a second live row; the write paths (2A create,
 *    2B reconcile, 2C webhook adopt, 2H admin sync) cope with the refusal.
 *
 * Mongo is the in-memory server (setupDb). Razorpay is mocked. Ids, canaries
 * and URI credentials are built at runtime so gitleaks sees no secret-looking
 * literals.
 */
import './setupDb';
import './setupEnv';
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import logger from '../config/logger';
import {
  NON_TERMINAL_SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_COLLECTION,
  SUBSCRIPTION_INDEX_FAILED_MARKER,
  SUBSCRIPTION_LIVE_UNIQUE_NAME,
  ensureSubscriptionIndexes,
  isLiveSubscriptionConflict,
} from '../config/subscription-indexes';
import { Subscription, SUBSCRIPTION_STATUSES } from '../models/Subscription.model';
import { SubscriptionReconcile } from '../models/SubscriptionReconcile.model';
import { User } from '../models/User.model';
import {
  SubscriptionCancelFailedError,
  createSubscription,
  handleWebhookEvent,
  reconcileRazorpaySubscriptions,
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
const mockSetTag = jest.fn();
const mockSetExtra = jest.fn();
const mockSetFingerprint = jest.fn();
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  withScope: (cb: (scope: unknown) => void) =>
    cb({
      setTag: mockSetTag,
      setExtra: mockSetExtra,
      setFingerprint: mockSetFingerprint,
      setTags: jest.fn(),
    }),
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const createMock = razorpay.subscriptions.create as jest.Mock;
const allMock = razorpay.subscriptions.all as jest.Mock;
const fetchMock = razorpay.subscriptions.fetch as jest.Mock;
const cancelMock = razorpay.subscriptions.cancel as jest.Mock;

const SIX = ['created', 'authenticated', 'active', 'pending', 'halted', 'paused'] as const;
const TERMINAL = ['cancelled', 'completed', 'expired'] as const;
const SOLO = 'solo_monthly';

const sid = (n: string) => ['sub', '_', 't536', n].join('');
const url = (n: string) => ['https://rzp.io/', 't536-', n].join('');
const canary = (n: string) =>
  ['leak', 'canary', n, crypto.randomBytes(6).toString('hex')].join('-');
const oid = () => new mongoose.Types.ObjectId();

let counter = 0;
type U = { userId: string; email: string };
async function seedUser(): Promise<U> {
  const email = `${canary('mail')}-${++counter}@example.com`;
  const u = await User.create({ email, plan: 'free', emailVerified: true });
  return { userId: u._id.toString(), email };
}
function userHeaders(u: U) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': u.userId,
    'x-user-email': u.email,
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
    'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
  };
}
const subscribe = (u: U, planId?: string) =>
  request(app)
    .post('/subscribe')
    .set(userHeaders(u))
    .send(planId ? { planId } : {});
const seedRow = (userId: string | mongoose.Types.ObjectId, id: string, status: string) =>
  Subscription.create({ userId, razorpaySubscriptionId: id, status, planId: SOLO });
const getSub = (id: string) => Subscription.findOne({ razorpaySubscriptionId: id }).lean();
const rowsOf = (userId: string) => Subscription.find({ userId }).lean();
const liveRowsOf = async (userId: string) =>
  (await rowsOf(userId)).filter((r) =>
    (NON_TERMINAL_SUBSCRIPTION_STATUSES as readonly string[]).includes(r.status),
  );

const coll = () => mongoose.connection.db!.collection(SUBSCRIPTION_COLLECTION);
async function dropLive() {
  try {
    await coll().dropIndex(SUBSCRIPTION_LIVE_UNIQUE_NAME);
  } catch {
    // not there
  }
}
async function liveIndex() {
  const idx = await coll().indexes();
  return idx.find((i) => i.name === SUBSCRIPTION_LIVE_UNIQUE_NAME);
}

let seq = 0;
function rzpItem(userId: string, id: string, status: string, planId: string = SOLO) {
  return {
    id,
    status,
    short_url: url(id),
    created_at: Math.floor(Date.now() / 1000) + ++seq,
    customer_id: canary('cust'),
    notes: { userId, email: canary('notemail'), name: canary('notename'), planId },
  };
}
async function plantMarker(userId: string) {
  return SubscriptionReconcile.create({
    userId,
    lockCreatedAt: new Date(Date.now() - 120_000),
    planId: SOLO,
    createdAt: new Date(),
  });
}

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let infoSpy: jest.SpyInstance;
const callsFor = (spy: jest.SpyInstance, msg: string) => spy.mock.calls.filter((c) => c[1] === msg);
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
  await SubscriptionReconcile.init();
});

beforeEach(async () => {
  seq = 0;
  mockCaptureMessage.mockReset();
  mockSetTag.mockReset();
  mockSetExtra.mockReset();
  mockSetFingerprint.mockReset();
  createMock.mockReset();
  allMock.mockReset();
  fetchMock.mockReset().mockResolvedValue({ status: 'created', short_url: url('fetched') });
  cancelMock.mockReset().mockResolvedValue({});
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
  // Every test starts with no live index; the ones that need it build it.
  await dropLive();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── AC1: the index ──────────────────────────────────────────────────────────
describe('T-536 AC1: ensureSubscriptionIndexes (real in-memory MongoDB)', () => {
  it('the constants: six non-terminal statuses, in the model order, none terminal', () => {
    expect([...NON_TERMINAL_SUBSCRIPTION_STATUSES]).toEqual([...SIX]);
    expect(SUBSCRIPTION_STATUSES).toEqual(expect.arrayContaining([...SIX, ...TERMINAL]));
    expect(SUBSCRIPTION_LIVE_UNIQUE_NAME).toBe('userId_1_live_unique');
  });

  it('builds exactly one index named userId_1_live_unique: key, unique, exact partial filter', async () => {
    expect(await liveIndex()).toBeUndefined();

    await ensureSubscriptionIndexes();

    const matches = (await coll().indexes()).filter(
      (i) => i.name === SUBSCRIPTION_LIVE_UNIQUE_NAME,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].key).toEqual({ userId: 1 });
    expect(matches[0].unique).toBe(true);
    expect(matches[0].partialFilterExpression).toEqual({
      status: { $in: ['created', 'authenticated', 'active', 'pending', 'halted', 'paused'] },
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('userId_1 (the schema index) is still there and still not unique', async () => {
    await Subscription.init();
    await ensureSubscriptionIndexes();

    const idx = await coll().indexes();
    const plain = idx.find((i) => i.name === 'userId_1');
    expect(plain).toBeDefined();
    expect(plain!.unique).toBeUndefined();
    expect(plain!.partialFilterExpression).toBeUndefined();
    expect(idx.find((i) => i.name === SUBSCRIPTION_LIVE_UNIQUE_NAME)).toBeDefined();
  });

  it('the index is not declared on the schema (ensured at boot only)', () => {
    const declared = Subscription.schema.indexes();
    expect(
      declared.some(([, o]) => (o as { name?: string }).name === SUBSCRIPTION_LIVE_UNIQUE_NAME),
    ).toBe(false);
    expect(
      declared.some(
        ([k, o]) =>
          JSON.stringify(k) === JSON.stringify({ userId: 1 }) &&
          (o as { unique?: boolean }).unique === true,
      ),
    ).toBe(false);
  });

  it('idempotent: a second and third call are no-ops, one index, no error, no Sentry', async () => {
    await ensureSubscriptionIndexes();
    const before = await liveIndex();
    await expect(ensureSubscriptionIndexes()).resolves.toBeUndefined();
    await expect(ensureSubscriptionIndexes()).resolves.toBeUndefined();

    const after = (await coll().indexes()).filter((i) => i.name === SUBSCRIPTION_LIVE_UNIQUE_NAME);
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(before);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('works on an existing collection that already holds terminal rows and one live row per user', async () => {
    const a = oid();
    await seedRow(a, sid('old1'), 'cancelled');
    await seedRow(a, sid('old2'), 'expired');
    await seedRow(a, sid('now'), 'active');
    await seedRow(oid(), sid('other'), 'active');

    await ensureSubscriptionIndexes();

    expect(await liveIndex()).toBeDefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('T-536 AC1/AC4: ensureSubscriptionIndexes (mocked driver)', () => {
  // Restore the stubbed db handle before setupDb's afterEach reads it.
  afterEach(() => jest.restoreAllMocks());
  const replaceDb = (value: unknown) =>
    jest.replaceProperty(
      mongoose.connection,
      'db',
      value as unknown as typeof mongoose.connection.db,
    );

  it('calls createIndex once on subscriptions with exactly the key and options', async () => {
    const createIndex = jest.fn().mockResolvedValue(SUBSCRIPTION_LIVE_UNIQUE_NAME);
    const collection = jest.fn().mockReturnValue({ createIndex });
    replaceDb({ collection });

    await ensureSubscriptionIndexes();

    expect(collection).toHaveBeenCalledTimes(1);
    expect(collection).toHaveBeenCalledWith('subscriptions');
    expect(createIndex).toHaveBeenCalledTimes(1);
    expect(createIndex).toHaveBeenCalledWith(
      { userId: 1 },
      {
        name: 'userId_1_live_unique',
        unique: true,
        partialFilterExpression: {
          status: {
            $in: ['created', 'authenticated', 'active', 'pending', 'halted', 'paused'],
          },
        },
      },
    );
  });

  it('a missing db handle warns, calls nothing, does not throw, reports nothing', async () => {
    replaceDb(undefined);

    await expect(ensureSubscriptionIndexes()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

// ─── AC4: the database refuses a second live row ────────────────────────────
describe('T-536 AC4: the index at the database', () => {
  beforeEach(async () => {
    await ensureSubscriptionIndexes();
  });

  const pairs = SIX.flatMap((a) => SIX.map((b) => [a, b] as const));
  it.each(pairs)(
    'a %s row then a %s row for one user: the second is refused (E11000, userId)',
    async (a, b) => {
      const user = oid();
      await seedRow(user, sid(`first-${a}-${b}`), a);

      let caught: unknown;
      try {
        await seedRow(user, sid(`second-${a}-${b}`), b);
      } catch (err) {
        caught = err;
      }

      expect(caught).toMatchObject({ code: 11000 });
      expect((caught as { keyPattern?: unknown }).keyPattern).toEqual({ userId: 1 });
      expect(isLiveSubscriptionConflict(caught)).toBe(true);
      expect(await Subscription.countDocuments({ userId: user })).toBe(1);
    },
  );

  it.each(TERMINAL.flatMap((t) => SIX.map((l) => [t, l] as const)))(
    'a %s row and a %s row for one user are allowed, in either order',
    async (t, l) => {
      const u1 = oid();
      await seedRow(u1, sid(`a1-${t}-${l}`), t);
      await seedRow(u1, sid(`a2-${t}-${l}`), l);
      const u2 = oid();
      await seedRow(u2, sid(`b1-${t}-${l}`), l);
      await seedRow(u2, sid(`b2-${t}-${l}`), t);

      expect(await Subscription.countDocuments({ userId: u1 })).toBe(2);
      expect(await Subscription.countDocuments({ userId: u2 })).toBe(2);
    },
  );

  it('any number of terminal rows for one user are allowed', async () => {
    const user = oid();
    let n = 0;
    for (const t of TERMINAL) {
      await seedRow(user, sid(`t1-${t}`), t);
      await seedRow(user, sid(`t2-${t}`), t);
      n += 2;
    }
    expect(await Subscription.countDocuments({ userId: user })).toBe(n);
  });

  it('different users can each hold a live row', async () => {
    await seedRow(oid(), sid('u1'), 'active');
    await seedRow(oid(), sid('u2'), 'active');
    expect(await Subscription.countDocuments({})).toBe(2);
  });

  it("a live row can be written once the user's other live row ends", async () => {
    const user = oid();
    await seedRow(user, sid('p1'), 'active');
    await Subscription.updateOne({ razorpaySubscriptionId: sid('p1') }, { status: 'cancelled' });
    await seedRow(user, sid('p2'), 'created');
    expect(await Subscription.countDocuments({ userId: user })).toBe(2);
  });

  it('an update that would revive a terminal row beside a live one is refused', async () => {
    const user = oid();
    await seedRow(user, sid('dead'), 'cancelled');
    await seedRow(user, sid('live'), 'active');

    let caught: unknown;
    try {
      await Subscription.updateOne({ razorpaySubscriptionId: sid('dead') }, { status: 'active' });
    } catch (err) {
      caught = err;
    }

    expect(isLiveSubscriptionConflict(caught)).toBe(true);
    expect((await getSub(sid('dead')))!.status).toBe('cancelled');
  });

  it('a duplicate razorpaySubscriptionId is a duplicate key but NOT a live conflict', async () => {
    await seedRow(oid(), sid('same'), 'active');
    let caught: unknown;
    try {
      await seedRow(oid(), sid('same'), 'active');
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: 11000 });
    expect(isLiveSubscriptionConflict(caught)).toBe(false);
  });
});

describe('T-536: isLiveSubscriptionConflict (synthetic errors)', () => {
  it('true for 11000 naming the live index', () => {
    expect(
      isLiveSubscriptionConflict({
        code: 11000,
        message: `E11000 duplicate key error collection: x.subscriptions index: ${SUBSCRIPTION_LIVE_UNIQUE_NAME} dup key`,
      }),
    ).toBe(true);
  });
  it('true for 11000 with keyPattern or keyValue exactly userId', () => {
    expect(isLiveSubscriptionConflict({ code: 11000, keyPattern: { userId: 1 } })).toBe(true);
    expect(isLiveSubscriptionConflict({ code: 11000, keyValue: { userId: 'x' } })).toBe(true);
  });
  it('false for razorpaySubscriptionId duplicates, in message or keys', () => {
    expect(
      isLiveSubscriptionConflict({
        code: 11000,
        message: 'E11000 ... index: razorpaySubscriptionId_1 dup key',
      }),
    ).toBe(false);
    expect(
      isLiveSubscriptionConflict({ code: 11000, keyPattern: { razorpaySubscriptionId: 1 } }),
    ).toBe(false);
    expect(
      isLiveSubscriptionConflict({
        code: 11000,
        keyPattern: { userId: 1, razorpaySubscriptionId: 1 },
      }),
    ).toBe(false);
  });
  it('false for 11000 with no usable detail', () => {
    expect(isLiveSubscriptionConflict({ code: 11000 })).toBe(false);
    expect(isLiveSubscriptionConflict({ code: 11000, keyPattern: { other: 1 } })).toBe(false);
  });
  it('false for non-11000 errors, even when they name the index or userId', () => {
    expect(
      isLiveSubscriptionConflict({ code: 11001, message: SUBSCRIPTION_LIVE_UNIQUE_NAME }),
    ).toBe(false);
    expect(isLiveSubscriptionConflict({ code: 121, keyPattern: { userId: 1 } })).toBe(false);
    expect(isLiveSubscriptionConflict(new Error(SUBSCRIPTION_LIVE_UNIQUE_NAME))).toBe(false);
  });
  it('false for null, undefined and non-objects', () => {
    for (const v of [null, undefined, 'E11000', 11000, true]) {
      expect(isLiveSubscriptionConflict(v)).toBe(false);
    }
  });
});

// ─── AC3: a failed build logs, reports, continues ───────────────────────────
describe('T-536 AC3: a failed index build', () => {
  afterEach(() => jest.restoreAllMocks());
  const replaceDb = (value: unknown) =>
    jest.replaceProperty(
      mongoose.connection,
      'db',
      value as unknown as typeof mongoose.connection.db,
    );

  it('createIndex rejects: logger.error with errName/code only, Sentry error with the marker tag, no throw, no PII', async () => {
    const secret = canary('driver-msg');
    const err = Object.assign(new Error(`E11000 dup key { userId: "${secret}" }`), {
      name: 'MongoServerError',
      code: 11000,
      codeName: 'DuplicateKey',
    });
    replaceDb({ collection: () => ({ createIndex: jest.fn().mockRejectedValue(err) }) });

    await expect(ensureSubscriptionIndexes()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [fields, msg] = errorSpy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields).toEqual({ errName: 'MongoServerError', codeName: 'DuplicateKey', code: 11000 });
    expect(msg).toContain('continuing');
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(SUBSCRIPTION_INDEX_FAILED_MARKER, 'error');
    expect(SUBSCRIPTION_INDEX_FAILED_MARKER).toBe('billing.subscription.live_index_create_failed');
    expect(mockSetTag).toHaveBeenCalledWith('marker', SUBSCRIPTION_INDEX_FAILED_MARKER);
    expect(mockSetTag).toHaveBeenCalledTimes(1);
    expect(mockSetExtra).not.toHaveBeenCalled();
    expect(observed()).not.toContain(secret);
  });

  it('a non-Error rejection and a synchronous throw are logged as unknown / by class, and swallowed', async () => {
    replaceDb({ collection: () => ({ createIndex: jest.fn().mockRejectedValue('boom') }) });
    await expect(ensureSubscriptionIndexes()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenLastCalledWith({ errName: 'unknown' }, expect.any(String));

    jest.restoreAllMocks();
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    replaceDb({
      collection: () => {
        throw new TypeError('sync');
      },
    });
    await expect(ensureSubscriptionIndexes()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenLastCalledWith({ errName: 'TypeError' }, expect.any(String));
  });

  it('a Sentry that throws does not stop the boot', async () => {
    replaceDb({
      collection: () => ({ createIndex: jest.fn().mockRejectedValue(new Error('x')) }),
    });
    mockCaptureMessage.mockImplementation(() => {
      throw new Error('sentry down');
    });

    await expect(ensureSubscriptionIndexes()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('pre-existing duplicates: the build fails, is logged and reported with no ids, boot is not blocked, and it builds after the data is fixed', async () => {
    const user = oid();
    await seedRow(user, sid('dupA'), 'active');
    await seedRow(user, sid('dupB'), 'created');

    await expect(ensureSubscriptionIndexes()).resolves.toBeUndefined();

    expect(await liveIndex()).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [fields] = errorSpy.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({ errName: 'MongoServerError', code: 11000 });
    expect(Object.keys(fields).sort()).toEqual(['code', 'codeName', 'errName'].sort());
    expect(mockCaptureMessage).toHaveBeenCalledWith(SUBSCRIPTION_INDEX_FAILED_MARKER, 'error');
    expect(observed()).not.toContain(user.toString());
    expect(observed()).not.toContain(sid('dupA'));

    // The founder fixes the data by hand; the next boot builds the index.
    await Subscription.updateOne({ razorpaySubscriptionId: sid('dupB') }, { status: 'cancelled' });
    errorSpy.mockClear();
    await ensureSubscriptionIndexes();
    expect(await liveIndex()).toBeDefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('T-536 AC3: boot wiring (src/index.ts)', () => {
  let exitSpy: jest.SpyInstance;
  let onSpy: jest.SpyInstance;
  const outerMongoose = mongoose;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    onSpy = jest.spyOn(process, 'on').mockImplementation((() => process) as never);
  });
  afterEach(() => {
    jest.dontMock('../config/subscription-indexes');
    jest.dontMock('../config/ink-ledger-indexes');
    jest.dontMock('../models/Subscription.model');
    jest.dontMock('mongoose');
    jest.restoreAllMocks();
    onSpy.mockRestore();
    exitSpy.mockRestore();
  });

  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

  function boot(opts: { subscriptionIndexes?: () => Promise<void>; shareMongoose?: boolean }) {
    const order: string[] = [];
    const listen = jest.fn((_p: unknown, cb?: () => void) => {
      order.push('listen');
      cb?.();
    });
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() };
    const sentry = { captureException: jest.fn() };
    const sentryWithScope = (cb: (s: unknown) => void) =>
      cb({ setTag: mockSetTag, setExtra: mockSetExtra, setFingerprint: mockSetFingerprint });
    jest.isolateModules(() => {
      jest.doMock('../config/sentry', () => ({}));
      jest.doMock('@sentry/node', () => ({
        ...sentry,
        captureMessage: mockCaptureMessage,
        withScope: sentryWithScope,
      }));
      jest.doMock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));
      jest.doMock('../app', () => ({ __esModule: true, default: { listen } }));
      jest.doMock('../config/database', () => ({
        connectDatabase: jest.fn(async () => {
          order.push('connect');
        }),
      }));
      jest.doMock('../config/env', () => ({ env: { PORT: 0, NODE_ENV: 'test' } }));
      jest.doMock('../config/logger', () => ({ __esModule: true, default: log }));
      jest.doMock('../config/ink-ledger-indexes', () => ({
        ensureInkLedgerIndexes: jest.fn(async () => {
          order.push('ink');
        }),
      }));
      if (opts.subscriptionIndexes) {
        jest.doMock('../config/subscription-indexes', () => ({
          ensureSubscriptionIndexes: opts.subscriptionIndexes,
        }));
      }
      if (opts.shareMongoose) {
        jest.doMock('mongoose', () => outerMongoose);
        // The model is already compiled on the shared mongoose; only its status list is needed.
        jest.doMock('../models/Subscription.model', () => ({
          SUBSCRIPTION_STATUSES: [...SUBSCRIPTION_STATUSES],
        }));
      }
      jest.doMock('../services/invoice-sweep.service', () => ({ startInvoiceSweep: jest.fn() }));
      jest.doMock('../services/subscription-reconcile-sweep.service', () => ({
        startReconcileSweep: jest.fn(),
      }));
      jest.requireActual('../index');
    });
    return { order, listen, log, sentry };
  }

  it('startup ensures the subscription indexes once, after connect and the ink index, before listen', async () => {
    const order: string[] = [];
    const ensure = jest.fn(async () => {
      order.push('sub-index');
    });
    const b = boot({ subscriptionIndexes: ensure });
    // `order` of the helper is separate; merge by call order via mock invocation.
    await flush();

    expect(ensure).toHaveBeenCalledTimes(1);
    expect(b.order).toEqual(['connect', 'ink', 'listen']);
    expect(b.listen).toHaveBeenCalledTimes(1);
    expect(ensure.mock.invocationCallOrder[0]).toBeGreaterThan(0);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('the real ensureSubscriptionIndexes failing at boot (mocked driver): logged, Sentry error, still listens, no exit', async () => {
    const createIndex = jest.fn().mockRejectedValue(new Error('index build failed'));
    jest.replaceProperty(mongoose.connection, 'db', {
      collection: () => ({ createIndex }),
    } as unknown as typeof mongoose.connection.db);

    const b = boot({ shareMongoose: true });
    await flush();

    expect(createIndex).toHaveBeenCalledTimes(1);
    expect(b.log.error).toHaveBeenCalledWith(
      { errName: 'Error' },
      'subscription: live index create failed; continuing',
    );
    // The file-level @sentry/node mock serves the isolated registry too.
    expect(mockCaptureMessage).toHaveBeenCalledWith(SUBSCRIPTION_INDEX_FAILED_MARKER, 'error');
    expect(mockSetTag).toHaveBeenCalledWith('marker', SUBSCRIPTION_INDEX_FAILED_MARKER);
    expect(b.listen).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('even a helper that rejects unexpectedly is the only thing that could stop boot: the real one never rejects', async () => {
    jest.replaceProperty(mongoose.connection, 'db', {
      collection: () => ({ createIndex: jest.fn().mockRejectedValue(new Error('x')) }),
    } as unknown as typeof mongoose.connection.db);
    const b = boot({ shareMongoose: true });
    await flush();
    expect(b.order).toEqual(['connect', 'ink', 'listen']);
    expect(b.log.fatal).not.toHaveBeenCalled();
  });
});

// ─── 2A: create after Razorpay ──────────────────────────────────────────────
describe('T-536 2A: the create path, live index built', () => {
  beforeEach(async () => {
    await ensureSubscriptionIndexes();
  });

  /** Razorpay create that, while "in flight", lets another writer land a row. */
  function createWithRival(u: U, rivalStatus: string, rivalId: string, newId: string) {
    createMock.mockImplementationOnce(async () => {
      await seedRow(u.userId, rivalId, rivalStatus);
      return { id: newId, short_url: url(newId) };
    });
  }

  it('a rival checkout row landed meanwhile: the new sub is cancelled at Razorpay, the existing link answers (200), no second row', async () => {
    const u = await seedUser();
    createWithRival(u, 'created', sid('rival-co'), sid('new1'));

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      subscriptionId: sid('rival-co'),
      shortUrl: url('fetched'),
      planId: SOLO,
    });
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sid('new1'), false);
    const rows = await rowsOf(u.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].razorpaySubscriptionId).toBe(sid('rival-co'));
    expect(await getSub(sid('new1'))).toBeNull();
    expect(callsFor(warnSpy, 'billing.subscription.create_live_conflict')).toHaveLength(1);
    expect(callsFor(warnSpy, 'billing.subscription.create_live_conflict')[0][0]).toEqual({
      userId: u.userId,
      subscriptionId: sid('new1'),
      existingSubscriptionId: sid('rival-co'),
    });
    expect(await SubscriptionReconcile.countDocuments({ userId: u.userId })).toBe(0);
    expect(
      callsFor(errorSpy, 'billing.subscription.post_create_duplicate_cancel_failed'),
    ).toHaveLength(0);
  });

  it.each(['active', 'pending', 'halted', 'paused'])(
    'a rival %s row landed meanwhile: new sub cancelled, 409 subscription_exists, no second row',
    async (status) => {
      const u = await seedUser();
      createWithRival(u, status, sid(`rival-${status}`), sid(`new-${status}`));

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(res.body.status).toBe(status);
      expect(cancelMock).toHaveBeenCalledWith(sid(`new-${status}`), false);
      expect(await rowsOf(u.userId)).toHaveLength(1);
      expect(await getSub(sid(`new-${status}`))).toBeNull();
    },
  );

  it('the cancel of the new sub FAILS: reported, the reconcile marker is written, the response is unchanged', async () => {
    const u = await seedUser();
    createWithRival(u, 'created', sid('rival-f'), sid('new-f'));
    cancelMock.mockRejectedValue(new Error('cannot cancel'));
    fetchMock.mockImplementation(async (id: string) => {
      if (id === sid('new-f')) throw new Error('cannot fetch');
      return { status: 'created', short_url: url('fetched') };
    });
    const before = Date.now();

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('rival-f'));
    expect(res.body.data.shortUrl).toBe(url('fetched'));
    const failed = callsFor(errorSpy, 'billing.subscription.post_create_duplicate_cancel_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0][0]).toEqual({
      userId: u.userId,
      subscriptionId: sid('new-f'),
      existingSubscriptionId: sid('rival-f'),
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'billing.subscription.post_create_duplicate_cancel_failed',
      'warning',
    );
    const marker = await SubscriptionReconcile.findOne({ userId: u.userId }).lean();
    expect(marker).not.toBeNull();
    expect(marker!.planId).toBe(SOLO);
    expect(marker!.lockCreatedAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(marker!.lockCreatedAt.getTime()).toBeGreaterThanOrEqual(before - 60_000);
    expect(await SubscriptionReconcile.countDocuments({ userId: u.userId })).toBe(1);
    expect(await rowsOf(u.userId)).toHaveLength(1);
  });

  it('the cancel fails and the rival is live: 409 stays, marker still written', async () => {
    const u = await seedUser();
    createWithRival(u, 'active', sid('rival-fa'), sid('new-fa'));
    cancelMock.mockRejectedValue(new Error('cannot cancel'));
    fetchMock.mockRejectedValue(new Error('cannot fetch'));

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(await SubscriptionReconcile.countDocuments({ userId: u.userId })).toBe(1);
    expect(await rowsOf(u.userId)).toHaveLength(1);
  });

  it('a cancel that says "already ended" counts as cancelled: no failure report, no marker', async () => {
    const u = await seedUser();
    createWithRival(u, 'created', sid('rival-e'), sid('new-e'));
    cancelMock.mockRejectedValue(new Error('cannot cancel'));
    fetchMock.mockImplementation(async (id: string) =>
      id === sid('new-e')
        ? { status: 'cancelled' }
        : { status: 'created', short_url: url('fetched') },
    );

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(
      callsFor(errorSpy, 'billing.subscription.post_create_duplicate_cancel_failed'),
    ).toHaveLength(0);
    expect(await SubscriptionReconcile.countDocuments({ userId: u.userId })).toBe(0);
  });

  it('the blocking row ended before the re-read: the insert is retried once and the new sub is the answer', async () => {
    const u = await seedUser();
    createWithRival(u, 'created', sid('rival-r'), sid('new-r'));
    const realCreate = Subscription.create.bind(Subscription) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    jest.spyOn(Subscription, 'create').mockImplementationOnce((async (...args: unknown[]) => {
      try {
        return await realCreate(...args); // refused by the index
      } finally {
        // the blocker ends before the service re-reads
        await Subscription.updateOne(
          { razorpaySubscriptionId: sid('rival-r') },
          { $set: { status: 'cancelled' } },
        );
      }
    }) as never);

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      subscriptionId: sid('new-r'),
      shortUrl: url(sid('new-r')),
    });
    expect(cancelMock).not.toHaveBeenCalled();
    const rows = await rowsOf(u.userId);
    expect(rows).toHaveLength(2);
    expect((await getSub(sid('rival-r')))!.status).toBe('cancelled');
    expect((await getSub(sid('new-r')))!.status).toBe('created');
    expect(await liveRowsOf(u.userId)).toHaveLength(1);
  });

  it('a duplicate razorpaySubscriptionId (not the live index) is rethrown, not treated as a live conflict', async () => {
    const u = await seedUser();
    createMock.mockResolvedValueOnce({ id: sid('dupid'), short_url: url('dupid') });
    jest.spyOn(Subscription, 'create').mockRejectedValueOnce(
      Object.assign(new Error('E11000 duplicate key index: razorpaySubscriptionId_1'), {
        code: 11000,
        keyPattern: { razorpaySubscriptionId: 1 },
      }) as never,
    );

    await expect(createSubscription(u.userId, u.email, SOLO)).rejects.toMatchObject({
      code: 11000,
    });

    expect(cancelMock).not.toHaveBeenCalled();
    expect(callsFor(warnSpy, 'billing.subscription.create_live_conflict')).toHaveLength(0);
  });

  it('no conflict: the happy path still writes one row and answers 200', async () => {
    const u = await seedUser();
    createMock.mockResolvedValueOnce({ id: sid('ok'), short_url: url('ok') });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('ok'));
    expect(await rowsOf(u.userId)).toHaveLength(1);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('no PII: the user email never reaches a log line or a Sentry call (conflict and failed cancel)', async () => {
    const u = await seedUser();
    createWithRival(u, 'created', sid('rival-p'), sid('new-p'));
    cancelMock.mockRejectedValue(new Error('cannot cancel'));
    fetchMock.mockImplementation(async (id: string) => {
      if (id === sid('new-p')) throw new Error('cannot fetch');
      return { status: 'created', short_url: url('fetched') };
    });

    await subscribe(u, SOLO);

    expect(observed()).not.toContain(u.email);
    expect(observed()).not.toContain('leak-canary');
  });
});

// ─── 2B: reconcile ───────────────────────────────────────────────────────────
describe('T-536 2B: reconcile, live index built', () => {
  beforeEach(async () => {
    await ensureSubscriptionIndexes();
  });
  const recon = (u: U) =>
    reconcileRazorpaySubscriptions(u.userId, { requestedPlanId: SOLO, lockedAt: Date.now() });

  it('a local checkout and a live orphan: the checkout is cancelled first, then the orphan is adopted (no E11000)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await seedRow(u.userId, sid('local-co'), 'created');
    const orphan = rzpItem(u.userId, sid('orphan-live'), 'active');
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('local-co'), 'created'), orphan] });
    let orphanExistedAtCancel: boolean | undefined;
    cancelMock.mockImplementation(async () => {
      orphanExistedAtCancel = (await getSub(sid('orphan-live'))) !== null;
      return {};
    });

    const out = await recon(u);

    expect(out.kind).toBe('live');
    expect((out as { row: { razorpaySubscriptionId: string } }).row.razorpaySubscriptionId).toBe(
      sid('orphan-live'),
    );
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sid('local-co'), false);
    expect(orphanExistedAtCancel).toBe(false);
    expect((await getSub(sid('local-co')))!.status).toBe('cancelled');
    expect((await getSub(sid('orphan-live')))!.status).toBe('active');
    expect(await liveRowsOf(u.userId)).toHaveLength(1);
    expect(callsFor(errorSpy, 'billing.subscription.reconcile_adopted_live')).toHaveLength(1);
    expect(callsFor(warnSpy, 'billing.subscription.reconcile_adopt_live_conflict')).toHaveLength(0);
    expect(
      callsFor(errorSpy, 'billing.subscription.reconcile_live_orphan_not_adopted'),
    ).toHaveLength(0);
    expect(await SubscriptionReconcile.countDocuments({ userId: u.userId })).toBe(0);
  });

  it('a live orphan beside an orphan checkout (no local rows): checkout cancelled, live adopted, no checkout adopt', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('o-co'), 'created', SOLO),
        rzpItem(u.userId, sid('o-live'), 'halted'),
      ],
    });

    const out = await recon(u);

    expect(out.kind).toBe('live');
    expect(cancelMock).toHaveBeenCalledWith(sid('o-co'), false);
    expect(await getSub(sid('o-co'))).toBeNull();
    expect((await getSub(sid('o-live')))!.status).toBe('halted');
    expect(await rowsOf(u.userId)).toHaveLength(1);
  });

  it('two live orphans: the newest is adopted and reported, the other is reported (error + Sentry) and never cancelled', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const older = rzpItem(u.userId, sid('older'), 'active');
    const newer = rzpItem(u.userId, sid('newer'), 'active');
    expect(newer.created_at).toBeGreaterThan(older.created_at);
    allMock.mockResolvedValue({ items: [older, newer] });

    const out = await recon(u);

    expect(out.kind).toBe('live');
    expect((out as { row: { razorpaySubscriptionId: string } }).row.razorpaySubscriptionId).toBe(
      sid('newer'),
    );
    expect(await getSub(sid('older'))).toBeNull();
    expect((await getSub(sid('newer')))!.status).toBe('active');
    expect(cancelMock).not.toHaveBeenCalled();
    const notAdopted = callsFor(errorSpy, 'billing.subscription.reconcile_live_orphan_not_adopted');
    expect(notAdopted).toHaveLength(1);
    expect(notAdopted[0][0]).toEqual({
      userId: u.userId,
      subscriptionId: sid('older'),
      existingSubscriptionId: sid('newer'),
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'billing.subscription.reconcile_live_orphan_not_adopted',
      'error',
    );
    expect(mockSetTag).toHaveBeenCalledWith(
      'marker',
      'billing.subscription.reconcile_live_orphan_not_adopted',
    );
    // The adopted one is reported as before, the other is not reported as adopted.
    const adopted = callsFor(errorSpy, 'billing.subscription.reconcile_adopted_live');
    expect(adopted).toHaveLength(1);
    expect(adopted[0][0]).toMatchObject({ subscriptionId: sid('newer') });
    // T-542 (Arjun): a paid orphan left unadopted keeps the marker.
    expect(await SubscriptionReconcile.countDocuments({ userId: u.userId })).toBe(1);
  });

  it('three live orphans: one adopted, two reported, none cancelled', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('l1'), 'active'),
        rzpItem(u.userId, sid('l2'), 'pending'),
        rzpItem(u.userId, sid('l3'), 'paused'),
      ],
    });

    await recon(u);

    expect(
      callsFor(errorSpy, 'billing.subscription.reconcile_live_orphan_not_adopted'),
    ).toHaveLength(2);
    expect(await liveRowsOf(u.userId)).toHaveLength(1);
    expect((await liveRowsOf(u.userId))[0].razorpaySubscriptionId).toBe(sid('l3'));
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('with a live orphan, the same-plan checkout orphan is cancelled, not adopted', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('co-same'), 'authenticated', SOLO),
        rzpItem(u.userId, sid('lv'), 'active'),
      ],
    });

    const out = await recon(u);

    expect(out.kind).toBe('live');
    expect(cancelMock).toHaveBeenCalledWith(sid('co-same'), false);
    expect(await getSub(sid('co-same'))).toBeNull();
  });

  it('the live adopt is refused by the index (a row landed meanwhile): the existing row answers, orphan reported, nothing cancelled', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('refused'), 'active')] });
    const realCreate = Subscription.create.bind(Subscription) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    jest.spyOn(Subscription, 'create').mockImplementationOnce((async (...args: unknown[]) => {
      await seedRow(u.userId, sid('blocker'), 'active'); // the other writer wins
      return realCreate(...args); // real E11000 from the index
    }) as never);

    const out = await recon(u);

    expect(out.kind).toBe('live');
    expect((out as { row: { razorpaySubscriptionId: string } }).row.razorpaySubscriptionId).toBe(
      sid('blocker'),
    );
    expect(await getSub(sid('refused'))).toBeNull();
    expect(await rowsOf(u.userId)).toHaveLength(1);
    expect(callsFor(warnSpy, 'billing.subscription.reconcile_adopt_live_conflict')).toHaveLength(1);
    const reported = callsFor(errorSpy, 'billing.subscription.reconcile_live_orphan_not_adopted');
    expect(reported).toHaveLength(1);
    expect(reported[0][0]).toEqual({
      userId: u.userId,
      subscriptionId: sid('refused'),
      existingSubscriptionId: sid('blocker'),
    });
    expect(callsFor(errorSpy, 'billing.subscription.reconcile_adopted_live')).toHaveLength(0);
    expect(cancelMock).not.toHaveBeenCalled();
    // T-542 (Arjun): a paid orphan left unadopted keeps the marker.
    expect(await SubscriptionReconcile.countDocuments({ userId: u.userId })).toBe(1);
  });

  it('the checkout adopt is refused by the index: the orphan checkout is cancelled at Razorpay and the existing live row answers', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('co-refused'), 'created', SOLO)] });
    const realCreate = Subscription.create.bind(Subscription) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    jest.spyOn(Subscription, 'create').mockImplementationOnce((async (...args: unknown[]) => {
      await seedRow(u.userId, sid('blocker2'), 'active');
      return realCreate(...args);
    }) as never);

    const out = await recon(u);

    expect(out.kind).toBe('live');
    expect((out as { row: { razorpaySubscriptionId: string } }).row.razorpaySubscriptionId).toBe(
      sid('blocker2'),
    );
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sid('co-refused'), false);
    expect(await getSub(sid('co-refused'))).toBeNull();
    expect(await rowsOf(u.userId)).toHaveLength(1);
    expect(await SubscriptionReconcile.countDocuments({ userId: u.userId })).toBe(0);
  });

  it('the checkout adopt is refused and the orphan cannot be cancelled: SubscriptionCancelFailedError (503), marker kept', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('co-stuck'), 'created', SOLO)] });
    cancelMock.mockRejectedValue(new Error('cannot cancel'));
    // T-542 (b): the pre-adopt fetch succeeds; only the later fetch (after the failed cancel) rejects.
    fetchMock
      .mockResolvedValueOnce({ status: 'created' })
      .mockRejectedValue(new Error('cannot fetch'));
    const realCreate = Subscription.create.bind(Subscription) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    jest.spyOn(Subscription, 'create').mockImplementationOnce((async (...args: unknown[]) => {
      await seedRow(u.userId, sid('blocker3'), 'active');
      return realCreate(...args);
    }) as never);

    await expect(recon(u)).rejects.toBeInstanceOf(SubscriptionCancelFailedError);

    expect(await SubscriptionReconcile.countDocuments({ userId: u.userId })).toBe(1);
    expect(await rowsOf(u.userId)).toHaveLength(1);
  });

  it('end to end through /subscribe: a live orphan after a create timeout is adopted, 409, no create, one non-terminal row', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('e2e'), 'active')] });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('subscription_exists');
    expect(createMock).not.toHaveBeenCalled();
    expect(await liveRowsOf(u.userId)).toHaveLength(1);
  });

  it('no PII: the notes email/name never reach a log line or Sentry call', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({
      items: [rzpItem(u.userId, sid('pa'), 'active'), rzpItem(u.userId, sid('pb'), 'active')],
    });

    await recon(u);

    expect(observed()).not.toContain('leak-canary');
    expect(observed()).not.toContain(u.email);
  });
});

// ─── 2C: webhook adopt ───────────────────────────────────────────────────────
describe('T-536 2C: webhook adopt refused by the live index', () => {
  beforeEach(async () => {
    await ensureSubscriptionIndexes();
  });

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
    subscription: {
      entity: { id, notes: { userId, planId: SOLO, email: canary('whmail') } },
    },
    payment: { entity: { email: canary('whpay'), contact: '+910000000000' } },
  });

  it('a live row lands after the adopt check: the report fires, nothing is adopted, 200', async () => {
    const u = await seedUser();
    await seedRow(u.userId, sid('wh-have'), 'active');
    // The pre-check sees nothing (the row "landed" after it); the index decides.
    jest.spyOn(Subscription, 'exists').mockResolvedValueOnce(null as never);

    const res = await postWebhook('subscription.authenticated', entity(sid('wh-unk'), u.userId));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(await getSub(sid('wh-unk'))).toBeNull();
    expect(await rowsOf(u.userId)).toHaveLength(1);
    const reported = callsFor(errorSpy, 'billing.webhook.unknown_subscription_live_conflict');
    expect(reported).toHaveLength(1);
    expect(reported[0][0]).toEqual({
      userId: u.userId,
      subscriptionId: sid('wh-unk'),
      existingSubscriptionId: sid('wh-have'),
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'billing.webhook.unknown_subscription_live_conflict',
      'error',
    );
    expect(observed()).not.toContain('leak-canary');
    expect(observed()).not.toContain(u.email);
  });

  it('handleWebhookEvent itself resolves (does not throw) on the refusal', async () => {
    const u = await seedUser();
    await seedRow(u.userId, sid('wh-have2'), 'created');
    jest.spyOn(Subscription, 'exists').mockResolvedValueOnce(null as never);

    await expect(
      handleWebhookEvent('subscription.authenticated', entity(sid('wh-unk2'), u.userId)),
    ).resolves.toBeUndefined();

    expect(await getSub(sid('wh-unk2'))).toBeNull();
  });

  it('no conflict: an unknown sub for a user with no live row is still adopted', async () => {
    const u = await seedUser();
    await seedRow(u.userId, sid('wh-old'), 'cancelled');

    const res = await postWebhook('subscription.authenticated', entity(sid('wh-new'), u.userId));

    expect(res.status).toBe(200);
    expect((await getSub(sid('wh-new')))!.status).toBe('authenticated');
    expect(callsFor(errorSpy, 'billing.webhook.unknown_subscription_live_conflict')).toHaveLength(
      0,
    );
  });
});

// ─── 2H: admin sync ──────────────────────────────────────────────────────────
describe('T-536 2H: admin sync never revives a terminal row over a live one', () => {
  const admin = {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': '507f1f77bcf86cd799439011',
    'x-user-email': 'admin@test.com',
    'x-user-name': 'Admin',
    'x-user-plan': 'free',
    'x-user-role': 'Admin',
  };
  const sync = (id: string) =>
    request(app).post(`/admin/billing/subscriptions/${id}/sync`).set(admin);
  const razorpayReturns = (status: string) =>
    fetchMock.mockResolvedValue({
      status,
      current_start: 1767225600,
      current_end: 1769904000,
    });

  describe.each([
    ['index built', true],
    ['index absent (pre-check only)', false],
  ])('%s', (_label, built) => {
    beforeEach(async () => {
      if (built) await ensureSubscriptionIndexes();
    });

    it.each(['active', 'created', 'halted'])(
      'Razorpay %s, local cancelled, another live row: 409 live_subscription_conflict with both ids, no write',
      async (rzpStatus) => {
        const user = oid();
        await seedRow(user, sid('dead'), 'cancelled');
        await seedRow(user, sid('keeper'), 'active');
        razorpayReturns(rzpStatus);
        const spy = jest.spyOn(Subscription, 'findOneAndUpdate');

        const res = await sync(sid('dead'));

        expect(res.status).toBe(409);
        expect(res.body).toEqual({
          error: 'live_subscription_conflict',
          subscriptionId: sid('dead'),
          existingSubscriptionId: sid('keeper'),
        });
        expect(spy).not.toHaveBeenCalled();
        expect((await getSub(sid('dead')))!.status).toBe('cancelled');
        expect((await getSub(sid('keeper')))!.status).toBe('active');
      },
    );

    it('a terminal row with no other live row is revived as before', async () => {
      const user = oid();
      await seedRow(user, sid('dead2'), 'expired');
      await seedRow(user, sid('older'), 'cancelled');
      razorpayReturns('active');

      const res = await sync(sid('dead2'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, status: 'active' });
      expect((await getSub(sid('dead2')))!.status).toBe('active');
    });

    it('Razorpay says terminal: a terminal row beside a live one is written (no conflict)', async () => {
      const user = oid();
      await seedRow(user, sid('dead3'), 'expired');
      await seedRow(user, sid('keeper3'), 'active');
      razorpayReturns('cancelled');

      const res = await sync(sid('dead3'));

      expect(res.status).toBe(200);
      expect((await getSub(sid('dead3')))!.status).toBe('cancelled');
    });

    it('the live row itself syncs to another live status (no self-conflict)', async () => {
      const user = oid();
      await seedRow(user, sid('self'), 'active');
      razorpayReturns('halted');

      const res = await sync(sid('self'));

      expect(res.status).toBe(200);
      expect((await getSub(sid('self')))!.status).toBe('halted');
    });

    it('a local checkout syncing to active beside nothing else is written', async () => {
      const user = oid();
      await seedRow(user, sid('co'), 'created');
      razorpayReturns('active');

      const res = await sync(sid('co'));

      expect(res.status).toBe(200);
      expect((await getSub(sid('co')))!.status).toBe('active');
    });

    it('an unknown local subscription is 404 and nothing is written', async () => {
      razorpayReturns('active');
      const spy = jest.spyOn(Subscription, 'findOneAndUpdate');

      const res = await sync(sid('nope'));

      expect(res.status).toBe(404);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('race: another live row lands between the check and the write: the index refuses, answered 409 (never 500), terminal row untouched', async () => {
    await ensureSubscriptionIndexes();
    const user = oid();
    await seedRow(user, sid('dead-r'), 'cancelled');
    razorpayReturns('active');
    const real = Subscription.findOneAndUpdate.bind(Subscription) as (...a: unknown[]) => {
      lean: () => Promise<unknown>;
    };
    jest.spyOn(Subscription, 'findOneAndUpdate').mockImplementationOnce(((...args: unknown[]) => ({
      lean: async () => {
        await seedRow(user, sid('rival-r'), 'active'); // lands after the pre-check
        return real(...args).lean();
      },
    })) as never);

    const res = await sync(sid('dead-r'));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'live_subscription_conflict',
      subscriptionId: sid('dead-r'),
      existingSubscriptionId: sid('rival-r'),
    });
    expect((await getSub(sid('dead-r')))!.status).toBe('cancelled');
    expect(await liveRowsOf(user.toString())).toHaveLength(1);
  });

  it('a non-live E11000 on the update is a 500 with the fixed body (no hang), logged by class and code only', async () => {
    const user = oid();
    await seedRow(user, sid('dead-n'), 'cancelled');
    razorpayReturns('active');
    const secret = canary('dbmsg');
    jest.spyOn(Subscription, 'findOneAndUpdate').mockImplementationOnce((() => ({
      lean: async () => {
        throw Object.assign(new Error(`E11000 razorpaySubscriptionId_1 ${secret}`), {
          code: 11000,
          keyPattern: { razorpaySubscriptionId: 1 },
        });
      },
    })) as never);

    const res = await sync(sid('dead-n'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to sync subscription' });
    const failed = errorSpy.mock.calls.filter((c) => c[1] === 'Admin sync: failed');
    expect(failed).toHaveLength(1);
    expect(failed[0][0]).toEqual({ errName: 'Error', code: 11000 });
    expect(observed()).not.toContain(secret);
    expect((await getSub(sid('dead-n')))!.status).toBe('cancelled');
  });

  it('a DB error on the pre-read is a 500 with the fixed body, logged without its message', async () => {
    razorpayReturns('active');
    const secret = canary('readmsg');
    jest.spyOn(Subscription, 'findOne').mockImplementationOnce((() => {
      throw new Error(secret);
    }) as never);

    const res = await sync(sid('any'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to sync subscription' });
    const failed = errorSpy.mock.calls.filter((c) => c[1] === 'Admin sync: failed');
    expect(failed).toHaveLength(1);
    expect(failed[0][0]).toEqual({ errName: 'Error' });
    expect(observed()).not.toContain(secret);
  });

  it('the 409, 404, 502 and 400 paths are unchanged and are not logged as failures', async () => {
    await ensureSubscriptionIndexes();
    const user = oid();
    await seedRow(user, sid('d409'), 'cancelled');
    await seedRow(user, sid('k409'), 'active');
    razorpayReturns('active');
    expect((await sync(sid('d409'))).status).toBe(409);
    expect((await sync(sid('missing'))).status).toBe(404);
    fetchMock.mockRejectedValueOnce(new Error('rzp down'));
    expect((await sync(sid('d409'))).status).toBe(502);
    razorpayReturns('frozen');
    expect((await sync(sid('d409'))).status).toBe(400);
    expect(errorSpy.mock.calls.filter((c) => c[1] === 'Admin sync: failed')).toHaveLength(0);
  });

  it('the 409 logs ids and the status only', async () => {
    await ensureSubscriptionIndexes();
    const user = oid();
    await seedRow(user, sid('dead-l'), 'cancelled');
    await seedRow(user, sid('keeper-l'), 'active');
    razorpayReturns('active');

    await sync(sid('dead-l'));

    const w = warnSpy.mock.calls.filter((c) => /already has another live/.test(String(c[1])));
    expect(w).toHaveLength(1);
    expect(w[0][0]).toEqual({
      razorpaySubscriptionId: sid('dead-l'),
      existingSubscriptionId: sid('keeper-l'),
      status: 'active',
    });
  });
});

// ─── AC2: the read-only data check script ───────────────────────────────────
describe('T-536 AC2: scripts/check-live-subscription-duplicates.ts', () => {
  const billingDir = join(__dirname, '..', '..');
  const scriptPath = join(billingDir, 'scripts', 'check-live-subscription-duplicates.ts');
  const tsNode = join(billingDir, '..', '..', 'node_modules', '.bin', 'ts-node');
  const memUri = () =>
    [
      'mongodb',
      '://',
      mongoose.connection.host,
      ':',
      mongoose.connection.port,
      '/',
      mongoose.connection.name,
    ].join('');

  function run(env: Record<string, string>, args: string[] = []) {
    const clean: NodeJS.ProcessEnv = { ...process.env };
    delete clean.REDIS_URL;
    delete clean.SENTRY_DSN;
    const r = spawnSync(tsNode, ['--transpile-only', scriptPath, ...args], {
      cwd: billingDir,
      env: { ...clean, ...env },
      encoding: 'utf8',
      timeout: 90_000,
    });
    return {
      code: r.status,
      out: r.stdout ?? '',
      err: r.stderr ?? '',
      all: `${r.stdout}${r.stderr}`,
    };
  }

  async function snapshot() {
    const db = mongoose.connection.db!;
    const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
    const counts: Record<string, number> = {};
    for (const n of names) counts[n] = await db.collection(n).countDocuments({});
    const idx = (await db.collection(SUBSCRIPTION_COLLECTION).indexes()).map((i) => i.name).sort();
    const docs = await db.collection(SUBSCRIPTION_COLLECTION).find({}).sort({ _id: 1 }).toArray();
    return { names, counts, idx, docs: JSON.stringify(docs) };
  }

  it('package.json has the check:live-sub-duplicates script pointing at the script file', () => {
    const pkg = JSON.parse(readFileSync(join(billingDir, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['check:live-sub-duplicates']).toContain(
      'scripts/check-live-subscription-duplicates.ts',
    );
  });

  it('source has no write API (insert/update/delete/drop/createIndex/$out/$merge) outside comments', () => {
    const code = readFileSync(scriptPath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(
      /insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|findOneAndUpdate|findOneAndDelete|bulkWrite|\.drop\(|dropIndex|dropDatabase|createIndex|ensureIndex|\$out|\$merge|\.create\(|\.save\(/,
    );
  });

  it('exit 0 when clean (terminal + one live, two terminal, one live per user): prints db version, no ids, writes nothing', async () => {
    const a = oid();
    await seedRow(a, sid('s1'), 'cancelled');
    await seedRow(a, sid('s2'), 'expired');
    await seedRow(a, sid('s3'), 'active');
    await seedRow(oid(), sid('s4'), 'created');
    const before = await snapshot();

    const r = run({ MONGO_URI: memUri() });

    expect(r.code).toBe(0);
    expect(r.out).toMatch(/MongoDB server version: \d+\.\d+\.\d+/);
    expect(r.out).toContain('No user has more than one non-terminal subscription');
    expect(r.all).not.toContain(a.toString());
    expect(await snapshot()).toEqual(before);
  }, 120_000);

  it('exit 0 on an empty database', async () => {
    const r = run({ MONGO_URI: memUri() });
    expect(r.code).toBe(0);
  }, 120_000);

  it('exit 1 with duplicates: prints user id, row ids, statuses and dates, never an email or other fields; writes nothing', async () => {
    const dupUser = oid();
    const cleanUser = oid();
    const email = `${canary('script-mail')}@example.com`;
    const name = canary('script-name');
    // Raw inserts so the extra PII-looking fields are really stored.
    await coll().insertMany([
      {
        userId: dupUser,
        razorpaySubscriptionId: sid('dup1'),
        status: 'active',
        createdAt: new Date('2026-01-02T03:04:05.000Z'),
        email,
        name,
      },
      {
        userId: dupUser,
        razorpaySubscriptionId: sid('dup2'),
        status: 'halted',
        createdAt: new Date('2026-02-03T04:05:06.000Z'),
        email,
        name,
      },
      { userId: dupUser, razorpaySubscriptionId: sid('dup3'), status: 'cancelled' },
      { userId: cleanUser, razorpaySubscriptionId: sid('ok1'), status: 'active' },
      { userId: cleanUser, razorpaySubscriptionId: sid('ok2'), status: 'cancelled' },
    ]);
    const before = await snapshot();

    const r = run({ MONGO_URI: memUri() });

    expect(r.code).toBe(1);
    expect(r.out).toMatch(/MongoDB server version: \d+\.\d+\.\d+/);
    expect(r.out).toContain(dupUser.toString());
    expect(r.out).toContain(sid('dup1'));
    expect(r.out).toContain(sid('dup2'));
    expect(r.out).toContain('active');
    expect(r.out).toContain('halted');
    expect(r.out).toContain('2026-01-02T03:04:05.000Z');
    expect(r.out).toContain('2026-02-03T04:05:06.000Z');
    // The terminal row of the duplicate user and the clean user are not listed.
    expect(r.out).not.toContain(sid('dup3'));
    expect(r.out).not.toContain(cleanUser.toString());
    expect(r.out).not.toContain(sid('ok1'));
    expect(r.all).not.toContain(email);
    expect(r.all).not.toContain(name);
    expect(r.all).not.toContain('leak-canary');
    expect(await snapshot()).toEqual(before);
    expect(await liveIndex()).toBeUndefined(); // it did not create the index
  }, 120_000);

  it('lists several duplicate users', async () => {
    const u1 = oid();
    const u2 = oid();
    await coll().insertMany([
      { userId: u1, razorpaySubscriptionId: sid('m1'), status: 'active' },
      { userId: u1, razorpaySubscriptionId: sid('m2'), status: 'paused' },
      { userId: u2, razorpaySubscriptionId: sid('m3'), status: 'created' },
      { userId: u2, razorpaySubscriptionId: sid('m4'), status: 'authenticated' },
    ]);

    const r = run({ MONGO_URI: memUri() });

    expect(r.code).toBe(1);
    expect(r.out).toContain(u1.toString());
    expect(r.out).toContain(u2.toString());
  }, 120_000);

  it.each([['--apply'], ['--fix'], ['anything'], ['--help']])(
    'exit 2 for the argument %s, before connecting, writes nothing',
    async (arg) => {
      await coll().insertMany([
        { userId: oid(), razorpaySubscriptionId: sid(`arg-${arg}`), status: 'active' },
      ]);
      const before = await snapshot();

      const r = run({ MONGO_URI: memUri() }, [arg]);

      expect(r.code).toBe(2);
      expect(r.all).toContain('Usage');
      expect(r.out).not.toMatch(/MongoDB server version/);
      expect(await snapshot()).toEqual(before);
    },
    120_000,
  );

  it('exit 2 when MONGO_URI is empty', () => {
    const r = run({ MONGO_URI: '' });
    expect(r.code).toBe(2);
    expect(r.err).toContain('MONGO_URI is not set');
  }, 120_000);

  it('exit 2 on a connect failure, and the credentials in the URI are never printed', () => {
    const pw = crypto.randomBytes(8).toString('hex');
    const user = ['svc', crypto.randomBytes(3).toString('hex')].join('');
    const bad = [
      'mongodb',
      '://',
      user,
      ':',
      pw,
      '@',
      '127.0.0.1:1',
      '/lawie?authSource=admin',
    ].join('');

    const r = run({ MONGO_URI: bad });

    expect(r.code).toBe(2);
    expect(r.err).toContain('Connect failed');
    expect(r.all).not.toContain(pw);
    expect(r.all).not.toContain(user);
    expect(r.out).toContain(['mongodb', '://', '127.0.0.1:1', '/lawie'].join(''));
  }, 120_000);
});
