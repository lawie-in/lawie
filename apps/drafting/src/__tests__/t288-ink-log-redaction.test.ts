/**
 * T-288 AC4 — the three credits.service error logs print the error CLASS
 * (err.name) and the ids where one run is known, never err.message (a driver
 * message can carry personal data).
 *
 * 1. holdInk: the pre-hold sweep failure.
 * 2. releaseExpiredHolds: "could not close hold".
 * 3. startHoldSweep: the background sweep failure (class only, no run).
 */
import './setupDb';
import mongoose from 'mongoose';

import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import {
  holdInk,
  releaseExpiredHolds,
  startHoldSweep,
  stopHoldSweep,
} from '../services/credits.service';

const USER_ID = '507f1f77bcf86cd7994392c8';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MARKER = 'secret-driver-text';
const MESSAGE = `${MARKER} test@test.com Test Advocate`;

class DriverFault extends Error {
  constructor() {
    super(MESSAGE);
    this.name = 'DriverFault';
  }
}

const logged = (spy: jest.SpyInstance) => spy.mock.calls.flat().map(String).join(' ');
const quiet = () => jest.spyOn(console, 'error').mockImplementation(() => undefined);

function expectNoMessage(out: string) {
  expect(out).not.toContain(MARKER);
  expect(out).not.toContain('test@test.com');
  expect(out).not.toContain('Test Advocate');
}

async function seed() {
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 20,
  });
}

afterEach(() => {
  stopHoldSweep();
  jest.restoreAllMocks();
});

describe('T-288 AC4: credits.service logs the error class, not the message', () => {
  it('holdInk: a failing pre-hold sweep logs the class and the run ids, the hold still succeeds', async () => {
    await seed();
    const err = quiet();
    jest.spyOn(User.collection, 'find').mockImplementationOnce(() => {
      throw new DriverFault();
    });
    const r = await holdInk({ userId: USER_ID, costCredits: 1, runId: 'run-a', runSequence: 3 });
    expect(r.ok).toBe(true);
    const out = logged(err);
    expect(out).toContain('releaseExpiredHolds failed before a hold');
    expect(out).toContain('runId=run-a');
    expect(out).toContain('runSequence=3');
    expect(out).toContain('DriverFault');
    expectNoMessage(out);
  });

  it('releaseExpiredHolds: "could not close hold" logs the class and the hold ids', async () => {
    await seed();
    expect(
      (await holdInk({ userId: USER_ID, costCredits: 1, runId: 'run-b', runSequence: 2 })).ok,
    ).toBe(true);
    await User.collection.updateOne(
      { _id: OID },
      { $set: { 'inkHolds.$[h].expiresAt': new Date(Date.now() - 60_000) } },
      { arrayFilters: [{ 'h.runId': 'run-b' }] },
    );
    const err = quiet();
    jest.spyOn(Generation, 'findOne').mockImplementation((() => {
      throw new DriverFault();
    }) as never);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 0 });
    const out = logged(err);
    expect(out).toContain('could not close hold');
    expect(out).toContain('runId=run-b');
    expect(out).toContain('runSequence=2');
    expect(out).toContain('DriverFault');
    expectNoMessage(out);
  });

  it('startHoldSweep: a failing background sweep logs the class only', async () => {
    const err = quiet();
    jest.spyOn(User.collection, 'find').mockImplementation(() => {
      throw new DriverFault();
    });
    startHoldSweep(10);
    for (let i = 0; i < 200 && err.mock.calls.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    stopHoldSweep();
    const out = logged(err);
    expect(out).toContain('ink hold sweep failed');
    expect(out).toContain('DriverFault');
    expectNoMessage(out);
  });

  it('a non-Error throw logs "unknown", never its value', async () => {
    const err = quiet();
    jest.spyOn(User.collection, 'find').mockImplementation(() => {
      throw MESSAGE; // eslint-disable-line @typescript-eslint/only-throw-error
    });
    startHoldSweep(10);
    for (let i = 0; i < 200 && err.mock.calls.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    stopHoldSweep();
    const out = logged(err);
    expect(out).toContain('unknown');
    expectNoMessage(out);
  });
});
