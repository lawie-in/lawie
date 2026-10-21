import mongoose from 'mongoose';

import logger from '../config/logger';
import {
  ensureInkLedgerIndexes,
  INK_LEDGER_COLLECTION,
  INK_LEDGER_USER_CREATED_KEY,
  INK_LEDGER_USER_CREATED_NAME,
} from '../config/ink-ledger-indexes';

import './setupDb';

// T-519: inkledger { userId: 1, createdAt: -1 } index created at billing startup.

const outerMongoose = mongoose;

function replaceDb(value: unknown) {
  // `db` is a plain data property on the connection, so replace it (restored by restoreAllMocks).
  jest.replaceProperty(
    mongoose.connection,
    'db',
    value as unknown as typeof mongoose.connection.db,
  );
}

function mockDb(createIndex: jest.Mock) {
  const collection = jest.fn().mockReturnValue({ createIndex });
  replaceDb({ collection });
  return { collection };
}

describe('T-519 ensureInkLedgerIndexes (mocked driver)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exports the expected collection, key and name', () => {
    expect(INK_LEDGER_COLLECTION).toBe('inkledger');
    expect(INK_LEDGER_USER_CREATED_KEY).toEqual({ userId: 1, createdAt: -1 });
    expect(INK_LEDGER_USER_CREATED_NAME).toBe('userId_1_createdAt_-1');
  });

  it('AC1/AC3: calls createIndex exactly once on inkledger with the key and background:true', async () => {
    const createIndex = jest.fn().mockResolvedValue('userId_1_createdAt_-1');
    const { collection } = mockDb(createIndex);
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);

    await ensureInkLedgerIndexes();

    expect(collection).toHaveBeenCalledTimes(1);
    expect(collection).toHaveBeenCalledWith('inkledger');
    expect(createIndex).toHaveBeenCalledTimes(1);
    expect(createIndex).toHaveBeenCalledWith(
      { userId: 1, createdAt: -1 },
      expect.objectContaining({ background: true }),
    );
  });

  it('AC1: key order is userId ascending then createdAt descending', async () => {
    const createIndex = jest.fn().mockResolvedValue('x');
    mockDb(createIndex);
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);

    await ensureInkLedgerIndexes();

    const key = createIndex.mock.calls[0][0];
    expect(Object.entries(key)).toEqual([
      ['userId', 1],
      ['createdAt', -1],
    ]);
  });

  it('AC2: missing db handle warns, does not call createIndex, and resolves', async () => {
    replaceDb(undefined);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(ensureInkLedgerIndexes()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('AC2: createIndex rejection logs errName only (no message, no PII) and resolves', async () => {
    const secret = ['pii', Math.random().toString(36).slice(2)].join('-');
    const err = new Error(`E11000 failure for user ${secret}`);
    err.name = 'MongoServerError';
    const createIndex = jest.fn().mockRejectedValue(err);
    mockDb(createIndex);
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(ensureInkLedgerIndexes()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    const [obj, msg] = error.mock.calls[0] as unknown as [Record<string, unknown>, string];
    expect(obj).toEqual({ errName: 'MongoServerError' });
    expect(JSON.stringify([obj, msg])).not.toContain(secret);
  });

  it('AC2: a non-Error rejection is logged as errName "unknown" and does not throw', async () => {
    const createIndex = jest.fn().mockRejectedValue('boom');
    mockDb(createIndex);
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(ensureInkLedgerIndexes()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith({ errName: 'unknown' }, expect.any(String));
  });

  it('AC2: a synchronous throw from collection() is also swallowed', async () => {
    replaceDb({
      collection: () => {
        throw new TypeError('sync');
      },
    });
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(ensureInkLedgerIndexes()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith({ errName: 'TypeError' }, expect.any(String));
  });
});

describe('T-519 ensureInkLedgerIndexes (real in-memory MongoDB)', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('AC1: creates the index and it shows in collection indexes', async () => {
    await ensureInkLedgerIndexes();

    const indexes = await mongoose.connection.db!.collection('inkledger').indexes();
    const match = indexes.filter(
      (i) => JSON.stringify(i.key) === JSON.stringify({ userId: 1, createdAt: -1 }),
    );
    expect(match).toHaveLength(1);
    expect(match[0].name).toBe('userId_1_createdAt_-1');
  });

  it('AC1: idempotent, calling twice leaves one index and logs no error', async () => {
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    await ensureInkLedgerIndexes();
    await ensureInkLedgerIndexes();

    const indexes = await mongoose.connection.db!.collection('inkledger').indexes();
    const match = indexes.filter(
      (i) => JSON.stringify(i.key) === JSON.stringify({ userId: 1, createdAt: -1 }),
    );
    expect(match).toHaveLength(1);
    expect(indexes).toHaveLength(2); // _id_ plus ours
    expect(error).not.toHaveBeenCalled();
  });
});

describe('T-519 startup wiring (src/index.ts)', () => {
  let exitSpy: jest.SpyInstance;
  let onSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    // index.ts registers process-level handlers; do not leak them into the Jest worker.
    onSpy = jest.spyOn(process, 'on').mockImplementation((() => process) as never);
  });
  afterEach(() => {
    exitSpy.mockRestore();
    onSpy.mockRestore();
    // doMock registrations persist across tests; clear the ones the next test must see real.
    jest.dontMock('../config/ink-ledger-indexes');
    jest.dontMock('mongoose');
    jest.restoreAllMocks();
  });

  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

  function boot(opts: { ensure?: jest.Mock; connect?: jest.Mock }) {
    const order: string[] = [];
    const listen = jest.fn((_port: unknown, cb?: () => void) => {
      order.push('listen');
      cb?.();
    });
    const connectDatabase =
      opts.connect ??
      jest.fn(async () => {
        order.push('connect');
      });
    const ensure =
      opts.ensure ??
      jest.fn(async () => {
        order.push('ensure');
      });
    const startInvoiceSweep = jest.fn();
    const log = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
    };

    jest.isolateModules(() => {
      jest.doMock('../config/sentry', () => ({}));
      jest.doMock('@sentry/node', () => ({ captureException: jest.fn() }));
      jest.doMock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));
      jest.doMock('../app', () => ({ __esModule: true, default: { listen } }));
      jest.doMock('../config/database', () => ({ connectDatabase }));
      jest.doMock('../config/env', () => ({ env: { PORT: 0, NODE_ENV: 'test' } }));
      jest.doMock('../config/logger', () => ({ __esModule: true, default: log }));
      jest.doMock('../config/ink-ledger-indexes', () => ({ ensureInkLedgerIndexes: ensure }));
      jest.doMock('../services/invoice-sweep.service', () => ({ startInvoiceSweep }));
      jest.doMock('../services/subscription-reconcile-sweep.service', () => ({
        startReconcileSweep: jest.fn(),
      }));
      jest.requireActual('../index');
    });

    return { order, listen, connectDatabase, ensure, startInvoiceSweep, log };
  }

  it('AC3: startup calls ensureInkLedgerIndexes once, after connectDatabase and before listen', async () => {
    const { order, ensure, listen, startInvoiceSweep } = boot({});
    await flush();

    expect(ensure).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['connect', 'ensure', 'listen']);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(startInvoiceSweep).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('AC2: when createIndex fails (real function, mocked driver) billing still listens and does not exit', async () => {
    const createIndex = jest.fn().mockRejectedValue(new Error('index build failed'));
    const collection = jest.fn().mockReturnValue({ createIndex });
    replaceDb({ collection });

    const order: string[] = [];
    const listen = jest.fn((_p: unknown, cb?: () => void) => {
      order.push('listen');
      cb?.();
    });
    const startInvoiceSweep = jest.fn();
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() };

    jest.isolateModules(() => {
      jest.doMock('../config/sentry', () => ({}));
      jest.doMock('@sentry/node', () => ({ captureException: jest.fn() }));
      jest.doMock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));
      jest.doMock('../app', () => ({ __esModule: true, default: { listen } }));
      jest.doMock('../config/database', () => ({
        connectDatabase: jest.fn(async () => undefined),
      }));
      jest.doMock('../config/env', () => ({ env: { PORT: 0, NODE_ENV: 'test' } }));
      jest.doMock('../config/logger', () => ({ __esModule: true, default: log }));
      jest.doMock('../services/invoice-sweep.service', () => ({ startInvoiceSweep }));
      jest.doMock('../services/subscription-reconcile-sweep.service', () => ({
        startReconcileSweep: jest.fn(),
      }));
      // ink-ledger-indexes stays real; share the outer mongoose so the stubbed db is seen.
      jest.doMock('mongoose', () => outerMongoose);
      jest.requireActual('../index');
    });
    await flush();

    expect(createIndex).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      { errName: 'Error' },
      'ink-ledger: index create failed; continuing',
    );
    expect(listen).toHaveBeenCalledTimes(1);
    expect(startInvoiceSweep).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
