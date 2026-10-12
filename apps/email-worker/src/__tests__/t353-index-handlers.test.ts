/**
 * T-353 AC1: index.ts boot-failure, unhandledRejection and uncaughtException
 * handlers log and report through safeErrorFields / toSentrySafeError.
 *
 * Method: index.ts is imported in-process (jest.isolateModules) with ./app and
 * ./worker mocked, Sentry mocked, pino real but writing into an in-memory sink,
 * and process.exit spied. The handlers are driven with process.emit(...) using
 * an error whose message carries an address; the boot-failure path is driven by
 * making the mocked startWorkers throw.
 */
import * as Sentry from '@sentry/node';

import { LEAK_ADDRESS, allLogText, dump, parsedLogs, resetSink } from './helpers/t220-capture';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  flush: jest.fn(),
}));
jest.mock('../app', () => ({
  createApp: jest.fn(() => ({ listen: jest.fn() })),
}));
jest.mock('../worker', () => ({
  startWorkers: jest.fn(),
  stopWorkers: jest.fn(async () => undefined),
}));

const flush = Sentry.flush as jest.Mock;
const capture = Sentry.captureException as jest.Mock;

function leakyError(): Error {
  const e = new Error(`send to ${LEAK_ADDRESS} failed`);
  e.name = 'TypeError';
  return e;
}

let exitSpy: jest.SpyInstance;
let events: string[];
type Listener = (...args: never[]) => void;
const EVENTS = ['unhandledRejection', 'uncaughtException', 'SIGTERM', 'SIGINT'];
let before: Record<string, Listener[]>;

function snapshotListeners(): Record<string, Listener[]> {
  return Object.fromEntries(
    EVENTS.map((n) => [n, process.listeners(n as 'SIGTERM') as unknown as Listener[]]),
  );
}

function loadIndex() {
  jest.isolateModules(() => {
    require('../index');
  });
}

const tick = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
  events = [];
  before = snapshotListeners();
  flush.mockImplementation(async () => {
    events.push('flush');
    return true;
  });
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    events.push(`exit:${code}`);
    return undefined as never;
  }) as never);
});

afterEach(() => {
  exitSpy.mockRestore();
  for (const name of EVENTS) {
    for (const l of process.listeners(name as 'SIGTERM')) {
      if (!before[name].includes(l as unknown as Listener)) {
        process.removeListener(name as 'SIGTERM', l);
      }
    }
  }
});

function expectClean() {
  expect(allLogText()).not.toContain('leak@');
  expect(allLogText()).not.toContain('example.com');
  expect(dump(capture.mock.calls)).not.toContain('leak@');
  expect(dump(capture.mock.calls)).not.toContain('example.com');
}

describe('T-353 AC1 index.ts handlers', () => {
  it('uncaughtException: safe log, message-free Sentry error, flush before exit(1)', async () => {
    loadIndex();
    process.emit('uncaughtException', leakyError());
    await tick();
    await tick();

    const line = parsedLogs().find((l) => l.msg === 'Uncaught exception — exiting');
    expect(line).toMatchObject({ err: { name: 'TypeError' } });
    expect(Object.keys(line!.err as object).sort()).toEqual(['name']);
    expect(capture).toHaveBeenCalledTimes(1);
    const sent = capture.mock.calls[0][0] as Error;
    expect(sent).toBeInstanceOf(Error);
    expect(sent.name).toBe('TypeError');
    expect(sent.message).toBe('TypeError in email send');
    expect(flush).toHaveBeenCalledWith(2000);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(events).toEqual(['flush', 'exit:1']);
    expectClean();
  });

  it('unhandledRejection: safe log, safe Sentry error, does not exit', async () => {
    loadIndex();
    process.emit('unhandledRejection', leakyError(), Promise.resolve());
    await tick();

    const line = parsedLogs().find((l) => l.msg === 'Unhandled rejection');
    expect(line).toMatchObject({ err: { name: 'TypeError' } });
    expect(capture).toHaveBeenCalledTimes(1);
    expect((capture.mock.calls[0][0] as Error).message).toBe('TypeError in email send');
    expect(exitSpy).not.toHaveBeenCalled();
    expectClean();
  });

  it('unhandledRejection with a non-Error reason (a string with an address) leaks nothing', async () => {
    loadIndex();
    process.emit('unhandledRejection', `boom ${LEAK_ADDRESS}`, Promise.resolve());
    await tick();
    expect(capture).toHaveBeenCalledTimes(1);
    expectClean();
  });

  it('boot failure: fatal log is safe, Sentry gets a safe error, flush then exit(1)', async () => {
    const worker = jest.requireMock('../worker') as { startWorkers: jest.Mock };
    worker.startWorkers.mockImplementationOnce(() => {
      throw leakyError();
    });
    loadIndex();
    await tick();
    await tick();

    const line = parsedLogs().find((l) => l.msg === 'Email worker failed to boot');
    expect(line).toMatchObject({ level: 60, err: { name: 'TypeError' } });
    expect(Object.keys(line!.err as object).sort()).toEqual(['name']);
    expect(capture).toHaveBeenCalledTimes(1);
    expect((capture.mock.calls[0][0] as Error).message).toBe('TypeError in email send');
    expect(flush).toHaveBeenCalledWith(2000);
    expect(events).toEqual(['flush', 'exit:1']);
    expectClean();
  });
});
