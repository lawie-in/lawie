/**
 * T-685 part 1 (the foundations): the v3 run document and its state layer
 * (Arjun, T-685 answers). Covers the step state machine and replay rules (§3),
 * the lease (§5), attempts (§1, §5), the cost cap (§7, §8), the TTL, the byte
 * caps, T-682 condition 5 (no plaintext outside `sealed`), the stage names
 * (§9), the boot line, and the single stage reader.
 * In-memory Mongo. Fictional parties and data only.
 */
import '../setupDb';
import mongoose from 'mongoose';

import logger from '../../config/logger';
import { AppSetting } from '../../models/AppSetting.model';
import {
  _clearAppSettingsCache,
  APP_SETTING_KEYS,
  getConfigWarnings,
  primeConfigWarnings,
} from '../../services/app-settings.service';
import { encrypt } from '../../utils/encryption';
import * as L from '../../services/v3/ledger.service';
import {
  stepIdOfKey,
  stepKey,
  V3_RUN_MAX_ATTEMPTS,
  V3_RUN_TTL_MS,
  V3RunModel,
} from '../../services/v3/run.model';
import * as R from '../../services/v3/run.service';
import {
  _clearV3StageCache,
  DRAFTING_V3_STAGE_SETTING,
  setFixtureV3Stage,
} from '../../services/v3/stage';
import {
  GENERATE_STEP_ORDER,
  intakeTurnStep,
  isStepId,
  isV3StageName,
  MAX_REPAIR_ROUNDS,
  parseStepId,
  repairStep,
  stageForStep,
  stepPolicy,
  V3_STAGE_NAMES,
  type StepId,
} from '../../services/v3/stages';
import { GOLDEN_SET_USER_ID } from '../../services/run-origin';

// ── helpers ─────────────────────────────────────────────────────────────────

const { LEDGER_V3_MAX_DOC_SEALED_BYTES, LEDGER_V3_MAX_SEALED_BYTES } = L;
const oid = (): string => new mongoose.Types.ObjectId().toString();
let counter = 0;

type Run = R.V3RunSnapshot;

interface Fresh {
  userId: string;
  intakeId: string;
  owner: string;
  run: Run;
}

/** A run with the lease held and generate attempt gen-1 / 1 started. */
async function fresh(over: { userId?: string; attempt?: boolean } = {}): Promise<Fresh> {
  const userId = over.userId ?? oid();
  const intakeId = `t685-intake-${Date.now()}-${(counter += 1)}`;
  const { run } = await R.openRun({
    intakeId,
    userId,
    stage: 2,
    ledgerStore: 'v3',
    ledgerId: oid(),
  });
  const owner = R.newLeaseOwner();
  let r = await R.takeLease(intakeId, userId, owner);
  if (over.attempt !== false) {
    r = await R.startAttempt(r, owner, { runId: 'gen-1', runSequence: 1 });
  }
  void run;
  return { userId, intakeId, owner, run: r };
}

function runOf(d: R.BeginDecision): Run {
  return d.run;
}

function mustRun(d: R.BeginDecision): Run {
  if (d.action !== 'run') throw new Error(`expected run, got ${d.action}`);
  return d.run;
}

/** begin (expecting a run) then complete. */
async function doStep(
  run: Run,
  owner: string,
  id: StepId,
  version: number,
  extra: Partial<Parameters<typeof R.completeStep>[3]> = {},
): Promise<Run> {
  const started = mustRun(await R.beginStep(run, owner, id, { ledgerVersion: version }));
  return R.completeStep(started, owner, id, { ledgerVersion: version, ...extra });
}

async function rawRun(intakeId: string): Promise<Record<string, unknown> | null> {
  return (await V3RunModel.collection.findOne({ intakeId })) as Record<string, unknown> | null;
}

async function setSetting(key: string, value: string | null): Promise<void> {
  await AppSetting.deleteMany({ key });
  if (value !== null) await AppSetting.create({ key, value });
  _clearAppSettingsCache();
  _clearV3StageCache();
}

const loggerSpies: jest.SpyInstance[] = [];
function spyLogger(): jest.SpyInstance[] {
  const s = (['info', 'warn', 'error', 'debug'] as const).map((l) => jest.spyOn(logger, l));
  loggerSpies.push(...s);
  return s;
}

beforeAll(async () => {
  await V3RunModel.init();
  await V3RunModel.syncIndexes();
});

beforeEach(() => {
  _clearAppSettingsCache();
  _clearV3StageCache();
  setFixtureV3Stage(null);
});

afterEach(() => {
  while (loggerSpies.length) loggerSpies.pop()!.mockRestore();
  setFixtureV3Stage(null);
});

// ── AC1: a run document ─────────────────────────────────────────────────────

describe('AC1 run document: open is idempotent', () => {
  it('creates one run: status intake, rev 0, no step, no outputs, cost 0', async () => {
    const userId = oid();
    const ledgerId = oid();
    const { run, created } = await R.openRun({
      intakeId: 'ac1-a',
      userId,
      stage: 2,
      ledgerStore: 'v3',
      ledgerId,
    });
    expect(created).toBe(true);
    expect(run).toMatchObject({
      intakeId: 'ac1-a',
      userId,
      stage: 2,
      ledgerStore: 'v3',
      ledgerId,
      status: 'intake',
      rev: 0,
      ledgerVersion: 0,
      costPaiseSoFar: 0,
      capBasePaise: 0,
      round: 0,
      settled: false,
      extractorCalls: 0,
      extractorDegraded: false,
      runType: 'user',
      schemaVersion: 1,
    });
    expect(run.step).toBeUndefined();
    expect(run.outputs).toEqual({});
    expect(run.attempts).toEqual([]);
  });

  it('a second open for the same intake and user returns the same run; stage, store and ledger are fixed by the first', async () => {
    const userId = oid();
    const ledgerId = oid();
    const a = await R.openRun({ intakeId: 'ac1-b', userId, stage: 2, ledgerStore: 'v3', ledgerId });
    const b = await R.openRun({
      intakeId: 'ac1-b',
      userId,
      stage: 3,
      ledgerStore: 'v2',
      ledgerId: oid(),
    });
    expect(b.created).toBe(false);
    expect(b.run.id).toBe(a.run.id);
    expect(b.run).toMatchObject({ stage: 2, ledgerStore: 'v3', ledgerId });
    expect(await V3RunModel.countDocuments({ intakeId: 'ac1-b' })).toBe(1);
  });

  it('two opens at the same moment leave one run and both callers get it', async () => {
    const userId = oid();
    const args = {
      intakeId: 'ac1-c',
      userId,
      stage: 2 as const,
      ledgerStore: 'v3' as const,
      ledgerId: oid(),
    };
    const [a, b] = await Promise.all([R.openRun(args), R.openRun(args)]);
    expect(a.run.id).toBe(b.run.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    expect(await V3RunModel.countDocuments({ intakeId: 'ac1-c' })).toBe(1);
  });

  it("an intake held by another user is RunTakenError, and the first user's run is untouched", async () => {
    const userId = oid();
    const a = await R.openRun({
      intakeId: 'ac1-d',
      userId,
      stage: 2,
      ledgerStore: 'v3',
      ledgerId: oid(),
    });
    await expect(
      R.openRun({ intakeId: 'ac1-d', userId: oid(), stage: 2, ledgerStore: 'v3', ledgerId: oid() }),
    ).rejects.toBeInstanceOf(R.RunTakenError);
    expect((await R.findRun('ac1-d', userId))!.id).toBe(a.run.id);
  });

  it('findRun is scoped to the user: another user sees nothing', async () => {
    const userId = oid();
    await R.openRun({ intakeId: 'ac1-e', userId, stage: 2, ledgerStore: 'v3', ledgerId: oid() });
    expect(await R.findRun('ac1-e', oid())).toBeNull();
    expect(await R.findRun('ac1-e', 'not-an-id')).toBeNull();
    expect(await R.findRun('', userId)).toBeNull();
  });

  it.each([
    ['empty intakeId', { intakeId: '' }],
    ['intakeId over 100', { intakeId: 'x'.repeat(101) }],
    ['bad userId', { userId: 'nope' }],
    ['stage 1', { stage: 1 }],
    ['bad ledgerStore', { ledgerStore: 'v4' }],
    ['bad ledgerId', { ledgerId: 'nope' }],
  ])('rejects %s with RunInputError', async (_n, over) => {
    const args = {
      intakeId: 'ac1-f',
      userId: oid(),
      stage: 2,
      ledgerStore: 'v3',
      ledgerId: oid(),
      ...over,
    } as unknown as Parameters<typeof R.openRun>[0];
    await expect(R.openRun(args)).rejects.toBeInstanceOf(R.RunInputError);
  });
});

describe('AC1 run document: every step is idempotent and persisted', () => {
  it('begin persists a running output, the step and the ledger version; complete persists done', async () => {
    const f = await fresh();
    const started = mustRun(
      await R.beginStep(f.run, f.owner, 'intake.turn.1', { ledgerVersion: 3 }),
    );
    const stored = (await R.findRun(f.intakeId, f.userId))!;
    expect(stored.step).toBe('intake.turn.1');
    expect(stored.ledgerVersion).toBe(3);
    expect(stored.outputs['intake.turn.1']).toMatchObject({
      status: 'running',
      ledgerVersion: 3,
      runId: 'gen-1',
      runSequence: 1,
      reruns: 0,
      retries: 0,
    });
    expect(started.rev).toBe(f.run.rev + 1);

    const done = await R.completeStep(started, f.owner, 'intake.turn.1', { ledgerVersion: 4 });
    const after = (await R.findRun(f.intakeId, f.userId))!;
    expect(after.rev).toBe(done.rev);
    expect(after.ledgerVersion).toBe(4);
    expect(after.outputs['intake.turn.1']).toMatchObject({ status: 'done', ledgerVersion: 4 });
    expect(after.outputs['intake.turn.1']!.endedAt).toBeInstanceOf(Date);
  });

  it('outputs are keyed by step id, each with its own ledger version', async () => {
    const f = await fresh();
    let run = await doStep(f.run, f.owner, 'intake.turn.1', 2);
    run = await doStep(run, f.owner, 'confirm', 5);
    run = await doStep(run, f.owner, 'preflight', 5);
    await doStep(run, f.owner, 'repair.1', 6);
    const stored = (await R.findRun(f.intakeId, f.userId))!;
    expect(Object.keys(stored.outputs).sort()).toEqual(
      ['confirm', 'intake.turn.1', 'preflight', 'repair.1'].sort(),
    );
    expect(stored.outputs['intake.turn.1']!.ledgerVersion).toBe(2);
    expect(stored.outputs.confirm!.ledgerVersion).toBe(5);
    expect(stored.outputs['repair.1']!.ledgerVersion).toBe(6);
    expect(stored.outputs.confirm!.stepId).toBe('confirm');
  });

  it('every guarded write bumps rev by one; a lease op does not', async () => {
    const f = await fresh();
    const r0 = f.run.rev;
    const a = mustRun(await R.beginStep(f.run, f.owner, 'confirm', { ledgerVersion: 1 }));
    expect(a.rev).toBe(r0 + 1);
    const b = await R.completeStep(a, f.owner, 'confirm', { ledgerVersion: 1 });
    expect(b.rev).toBe(r0 + 2);
    await R.renewLease(f.intakeId, f.userId, f.owner);
    expect((await R.findRun(f.intakeId, f.userId))!.rev).toBe(r0 + 2);
  });

  it('usage keeps token counts only; costPaise, hash and ref are stored', async () => {
    const f = await fresh();
    const ref = oid();
    const hash = 'a'.repeat(64);
    const run = await doStep(f.run, f.owner, 'draft', 2, {
      usage: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 10, llmCalls: 1 },
      costPaise: 42,
      ref,
      hash,
    });
    expect(run.outputs.draft).toMatchObject({
      usage: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 10, llmCalls: 1 },
      costPaise: 42,
      ref,
      hash,
    });
  });

  it('complete or fail on a step that is not running is RunStepStateError', async () => {
    const f = await fresh();
    await expect(
      R.completeStep(f.run, f.owner, 'draft', { ledgerVersion: 1 }),
    ).rejects.toBeInstanceOf(R.RunStepStateError);
    await expect(R.failStep(f.run, f.owner, 'draft', 'x')).rejects.toBeInstanceOf(
      R.RunStepStateError,
    );
    const done = await doStep(f.run, f.owner, 'draft', 1);
    await expect(
      R.completeStep(done, f.owner, 'draft', { ledgerVersion: 1 }),
    ).rejects.toBeInstanceOf(R.RunStepStateError);
  });

  it('bad inputs are RunInputError: step id, ledger version, hash, ref, usage, reason, cost', async () => {
    const f = await fresh();
    await expect(
      R.beginStep(f.run, f.owner, 'repair.3' as StepId, { ledgerVersion: 1 }),
    ).rejects.toBeInstanceOf(R.RunInputError);
    await expect(
      R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: -1 }),
    ).rejects.toBeInstanceOf(R.RunInputError);
    const started = mustRun(await R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1 }));
    const bad: Array<Partial<Parameters<typeof R.completeStep>[3]>> = [
      { hash: 'short' },
      { hash: 'A'.repeat(64) },
      { ref: 'nope' },
      { costPaise: -1 },
      { usage: { inputTokens: 1 } as never },
    ];
    for (const b of bad) {
      await expect(
        R.completeStep(started, f.owner, 'draft', { ledgerVersion: 1, ...b }),
      ).rejects.toBeInstanceOf(R.RunInputError);
    }
    for (const reason of ['Has Spaces', 'UPPER', '', 'x'.repeat(65), 'free text here.']) {
      await expect(R.failStep(started, f.owner, 'draft', reason)).rejects.toBeInstanceOf(
        R.RunInputError,
      );
    }
  });

  it('the indexes: unique intakeId, userId+createdAt, attempts.runId, TTL on expiresAt', async () => {
    const idx = await V3RunModel.collection.indexes();
    expect(idx.some((i) => i.key.intakeId === 1 && i.unique === true)).toBe(true);
    expect(idx.some((i) => i.key.userId === 1 && i.key.createdAt === -1)).toBe(true);
    expect(idx.some((i) => i.key['attempts.runId'] === 1)).toBe(true);
    expect(idx.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)).toBe(true);
    expect(V3RunModel.collection.name).toBe('v3_runs');
  });

  it('findRunByAttempt finds the run by a generate attempt runId, for that user only', async () => {
    const f = await fresh();
    expect((await R.findRunByAttempt('gen-1', f.userId))!.intakeId).toBe(f.intakeId);
    expect(await R.findRunByAttempt('gen-1', oid())).toBeNull();
    expect(await R.findRunByAttempt('nope', f.userId)).toBeNull();
  });
});

// ── §3 replay rules, one test each ──────────────────────────────────────────

describe('replay rule: not begun is stored running and run', () => {
  it.each([
    'confirm',
    'derive',
    'hold',
    'preflight',
    'draft',
    'verify',
    'repair.1',
    'render',
    'deliver',
  ] as StepId[])('%s', async (id) => {
    const f = await fresh();
    const d = await R.beginStep(f.run, f.owner, id, { ledgerVersion: 1 });
    expect(d.action).toBe('run');
    if (d.action !== 'run') return;
    expect(d.rerun).toBe(false);
    expect(d.previous).toBeUndefined();
    expect(d.run.outputs[id]).toMatchObject({ status: 'running', reruns: 0, retries: 0 });
  });
});

describe('replay rule: intake.turn.N done is skipped', () => {
  it('skips and writes nothing', async () => {
    const f = await fresh();
    const done = await doStep(f.run, f.owner, 'intake.turn.2', 4);
    const d = await R.beginStep(done, f.owner, 'intake.turn.2', { ledgerVersion: 9 });
    expect(d.action).toBe('skip');
    expect(runOf(d).rev).toBe(done.rev);
    expect((await R.findRun(f.intakeId, f.userId))!.rev).toBe(done.rev);
  });
});

describe('replay rule: confirm, preflight, draft, verify, repair.N and render done are replayed', () => {
  it.each([
    'confirm',
    'preflight',
    'draft',
    'verify',
    'repair.1',
    'repair.2',
    'render',
  ] as StepId[])(
    '%s replays the stored output, even at another ledger version, and writes nothing',
    async (id) => {
      const f = await fresh();
      const payload = { v: id };
      const done = await doStep(f.run, f.owner, id, 3, { payload });
      const d = await R.beginStep(done, f.owner, id, { ledgerVersion: 7 });
      expect(d.action).toBe('replay');
      if (d.action !== 'replay') return;
      expect(R.readStepPayload(d.output)).toEqual(payload);
      expect(d.run.rev).toBe(done.rev);
      expect((await R.findRun(f.intakeId, f.userId))!.rev).toBe(done.rev);
    },
  );
});

describe('replay rule: derive replays at the same ledger version, else runs', () => {
  it('same version: replay', async () => {
    const f = await fresh();
    const done = await doStep(f.run, f.owner, 'derive', 5, { payload: { d: 1 } });
    const d = await R.beginStep(done, f.owner, 'derive', { ledgerVersion: 5 });
    expect(d.action).toBe('replay');
    expect(runOf(d).rev).toBe(done.rev);
  });

  it('a different ledger version: run again, recording the new version and the previous output', async () => {
    const f = await fresh();
    const done = await doStep(f.run, f.owner, 'derive', 5);
    const d = await R.beginStep(done, f.owner, 'derive', { ledgerVersion: 6 });
    expect(d.action).toBe('run');
    if (d.action !== 'run') return;
    expect(d.rerun).toBe(false);
    expect(d.previous!.ledgerVersion).toBe(5);
    expect(d.run.outputs.derive).toMatchObject({ status: 'running', ledgerVersion: 6 });
  });
});

describe('replay rule: hold replays within the same attempt, else runs fresh', () => {
  it('same attempt: replay (one attempt never takes two holds)', async () => {
    const f = await fresh();
    const done = await doStep(f.run, f.owner, 'hold', 2);
    const d = await R.beginStep(done, f.owner, 'hold', { ledgerVersion: 2 });
    expect(d.action).toBe('replay');
    expect(runOf(d).rev).toBe(done.rev);
  });

  it('a later attempt of the same runId (a resume): run fresh, with its own attempt ids', async () => {
    const f = await fresh();
    const done = await doStep(f.run, f.owner, 'hold', 2);
    const resumed = await R.startAttempt(done, f.owner, { runId: 'gen-1', runSequence: 2 });
    expect(resumed.outputs.hold).toBeDefined();
    const d = await R.beginStep(resumed, f.owner, 'hold', { ledgerVersion: 2 });
    expect(d.action).toBe('run');
    if (d.action !== 'run') return;
    expect(d.rerun).toBe(false);
    expect(d.run.outputs.hold).toMatchObject({
      status: 'running',
      runId: 'gen-1',
      runSequence: 2,
      reruns: 0,
      retries: 0,
    });
  });

  it('a hold left running by an earlier attempt runs fresh, not as a crash re-run', async () => {
    const f = await fresh();
    const started = mustRun(await R.beginStep(f.run, f.owner, 'hold', { ledgerVersion: 2 }));
    const resumed = await R.startAttempt(started, f.owner, { runId: 'gen-1', runSequence: 2 });
    const d = await R.beginStep(resumed, f.owner, 'hold', { ledgerVersion: 2 });
    expect(d.action).toBe('run');
    if (d.action !== 'run') return;
    expect(d.rerun).toBe(false);
    expect(d.run.outputs.hold).toMatchObject({ reruns: 0, runSequence: 2 });
  });
});

describe('replay rule: deliver runs again, keeping ref', () => {
  it('a done deliver is not replayed: it runs again and the ref is kept', async () => {
    const f = await fresh();
    const ref = oid();
    const done = await doStep(f.run, f.owner, 'deliver', 9, { ref });
    const d = await R.beginStep(done, f.owner, 'deliver', { ledgerVersion: 9 });
    expect(d.action).toBe('run');
    if (d.action !== 'run') return;
    expect(d.rerun).toBe(false);
    expect(d.previous!.ref).toBe(ref);
    expect(d.run.outputs.deliver).toMatchObject({ status: 'running', ref });
  });
});

describe('replay rule: beginning repair.N sets round = N', () => {
  it.each([1, 2])('repair.%i', async (n) => {
    const f = await fresh();
    expect(f.run.round).toBe(0);
    const run = mustRun(await R.beginStep(f.run, f.owner, repairStep(n), { ledgerVersion: 1 }));
    expect(run.round).toBe(n);
    expect((await R.findRun(f.intakeId, f.userId))!.round).toBe(n);
  });

  it('a step that is not a repair leaves round alone', async () => {
    const f = await fresh();
    const r1 = mustRun(await R.beginStep(f.run, f.owner, 'repair.2', { ledgerVersion: 1 }));
    const r2 = mustRun(await R.beginStep(r1, f.owner, 'render', { ledgerVersion: 1 }));
    expect(r2.round).toBe(2);
  });
});

describe('rerun_exhausted: a step found running twice fails safe', () => {
  it('first crash: re-run once (reruns 0 to 1); found running again: fail_safe, stored failed', async () => {
    const f = await fresh();
    const first = mustRun(await R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1 }));
    // crash: no complete. The next process finds it running.
    const d1 = await R.beginStep(first, f.owner, 'draft', { ledgerVersion: 1 });
    expect(d1.action).toBe('run');
    if (d1.action !== 'run') return;
    expect(d1.rerun).toBe(true);
    expect(d1.run.outputs.draft).toMatchObject({ status: 'running', reruns: 1 });
    // crash again
    const d2 = await R.beginStep(d1.run, f.owner, 'draft', { ledgerVersion: 1 });
    expect(d2.action).toBe('fail_safe');
    if (d2.action !== 'fail_safe') return;
    expect(d2.reason).toBe('rerun_exhausted');
    expect(d2.run.outputs.draft).toMatchObject({ status: 'failed', reason: 'rerun_exhausted' });
    const stored = (await R.findRun(f.intakeId, f.userId))!;
    expect(stored.outputs.draft).toMatchObject({ status: 'failed', reason: 'rerun_exhausted' });
    // asking again does not write again
    const d3 = await R.beginStep(d2.run, f.owner, 'draft', { ledgerVersion: 1 });
    expect(d3.action).toBe('fail_safe');
  });
});

describe('failed_terminal: a step failed in this attempt is not re-run', () => {
  it('fail_safe failed_terminal in the same attempt', async () => {
    const f = await fresh();
    const started = mustRun(await R.beginStep(f.run, f.owner, 'verify', { ledgerVersion: 1 }));
    const failed = await R.failStep(started, f.owner, 'verify', 'model_error');
    expect(failed.outputs.verify).toMatchObject({ status: 'failed', reason: 'model_error' });
    const d = await R.beginStep(failed, f.owner, 'verify', { ledgerVersion: 1 });
    expect(d.action).toBe('fail_safe');
    if (d.action !== 'fail_safe') return;
    expect(d.reason).toBe('failed_terminal');
    expect((await R.findRun(f.intakeId, f.userId))!.outputs.verify).toMatchObject({
      status: 'failed',
      reason: 'failed_terminal',
    });
  });
});

describe('retry_exhausted: a new attempt may retry a failed step once', () => {
  it('retries 0 to 1 in the next attempt, then retry_exhausted in the one after', async () => {
    const f = await fresh();
    const started = mustRun(await R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1 }));
    const failed1 = await R.failStep(started, f.owner, 'draft', 'model_error');

    const a2 = await R.startAttempt(failed1, f.owner, { runId: 'gen-1', runSequence: 2 });
    const retry = await R.beginStep(a2, f.owner, 'draft', { ledgerVersion: 1 });
    expect(retry.action).toBe('run');
    if (retry.action !== 'run') return;
    expect(retry.rerun).toBe(true);
    expect(retry.run.outputs.draft).toMatchObject({
      status: 'running',
      retries: 1,
      reruns: 0,
      runSequence: 2,
    });
    const failed2 = await R.failStep(retry.run, f.owner, 'draft', 'model_error');

    const a3 = await R.startAttempt(failed2, f.owner, { runId: 'gen-1', runSequence: 3 });
    const d = await R.beginStep(a3, f.owner, 'draft', { ledgerVersion: 1 });
    expect(d.action).toBe('fail_safe');
    if (d.action !== 'fail_safe') return;
    expect(d.reason).toBe('retry_exhausted');
    expect(d.run.outputs.draft).toMatchObject({ status: 'failed', reason: 'retry_exhausted' });
  });
});

describe('a done step with no sealed payload and no ref runs again; with a ref it replays', () => {
  it('too large and no ref: run again', async () => {
    const f = await fresh();
    const big = 'q'.repeat(LEDGER_V3_MAX_SEALED_BYTES + 10);
    const done = await doStep(f.run, f.owner, 'draft', 1, { payload: { big } });
    expect(done.outputs.draft!.sealed).toBeUndefined();
    expect(done.outputs.draft!.sealedOmitted).toBe('too_large');
    const d = await R.beginStep(done, f.owner, 'draft', { ledgerVersion: 1 });
    expect(d.action).toBe('run');
  });

  it('too large with a ref: replay from ref', async () => {
    const f = await fresh();
    const big = 'q'.repeat(LEDGER_V3_MAX_SEALED_BYTES + 10);
    const done = await doStep(f.run, f.owner, 'draft', 1, { payload: { big }, ref: oid() });
    const d = await R.beginStep(done, f.owner, 'draft', { ledgerVersion: 1 });
    expect(d.action).toBe('replay');
  });
});

// ── AC2: a crash resumes from the last step, no double charge ───────────────

describe('AC2 crash and resume', () => {
  it('a crash after draft: the new owner replays draft from sealed, adds no cost, and runs the next step', async () => {
    const f = await fresh();
    const draftText = { text: 'Resumable draft body for the fictional matter Rao v Mehta.' };
    let run = await doStep(f.run, f.owner, 'draft', 4, { payload: draftText, costPaise: 120 });
    await R.addCost(f.intakeId, f.userId, 120);
    const costBefore = (await R.findRun(f.intakeId, f.userId))!.costPaiseSoFar;
    expect(costBefore).toBe(120);

    // The process dies. The lease runs out; a new process takes over.
    const t = new Date(Date.now() + 2 * 60_000);
    const owner2 = R.newLeaseOwner();
    run = await R.takeLease(f.intakeId, f.userId, owner2, t);
    expect(run.leaseOwner).toBe(owner2);
    run = await R.startAttempt(run, owner2, { runId: 'gen-1', runSequence: 2 });

    const d = await R.beginStep(run, owner2, 'draft', { ledgerVersion: 4 });
    expect(d.action).toBe('replay');
    if (d.action !== 'replay') return;
    expect(R.readStepPayload(d.output)).toEqual(draftText);
    // Replay charges nothing and writes nothing.
    expect((await R.findRun(f.intakeId, f.userId))!.costPaiseSoFar).toBe(costBefore);
    expect(d.run.rev).toBe(run.rev);

    const next = await R.beginStep(d.run, owner2, 'verify', { ledgerVersion: 4 });
    expect(next.action).toBe('run');
    expect(runOf(next).step).toBe('verify');
  });

  it('the old owner, after losing the lease, cannot write (no double work)', async () => {
    const f = await fresh();
    const t = new Date(Date.now() + 2 * 60_000);
    await R.takeLease(f.intakeId, f.userId, R.newLeaseOwner(), t);
    await expect(R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1 })).rejects.toBeInstanceOf(
      R.RunLeaseLostError,
    );
    expect((await R.findRun(f.intakeId, f.userId))!.outputs.draft).toBeUndefined();
  });

  it('two writers on the same snapshot: exactly one wins, the other is RunVersionRaceError', async () => {
    const f = await fresh();
    const results = await Promise.allSettled([
      R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1 }),
      R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(R.RunVersionRaceError);
  });

  it('a resume (same runId, new sequence) keeps the outputs, the cap and the base; the cost stays summed', async () => {
    const f = await fresh();
    await setSetting(APP_SETTING_KEYS.COST_CAP_PAISE_PER_INK, '100');
    await R.addCost(f.intakeId, f.userId, 30);
    let run = (await R.findRun(f.intakeId, f.userId))!;
    run = await R.fixCap(run, f.owner, 4);
    run = await doStep(run, f.owner, 'draft', 2, { payload: { a: 1 } });
    await R.addCost(f.intakeId, f.userId, 55);
    run = (await R.findRun(f.intakeId, f.userId))!;
    const resumed = await R.startAttempt(run, f.owner, { runId: 'gen-1', runSequence: 2 });
    expect(resumed.outputs.draft).toMatchObject({ status: 'done' });
    expect(resumed.capPaise).toBe(400);
    expect(resumed.inkQuoted).toBe(4);
    expect(resumed.capBasePaise).toBe(30);
    expect(resumed.costPaiseSoFar).toBe(85);
    expect(resumed.attempts).toHaveLength(2);
    expect(resumed.attempts[0]!.outcome).toBe('abandoned');
    expect(resumed.attempts[1]).toMatchObject({
      runId: 'gen-1',
      runSequence: 2,
      outcome: 'running',
    });
    // A resume gets no fresh budget: fixCap is a no-op.
    const again = await R.fixCap(resumed, f.owner, 99);
    expect(again).toBe(resumed);
  });
});

// ── §5 lease ────────────────────────────────────────────────────────────────

describe('lease', () => {
  it('a live lease of another owner is RunLeaseHeldError, status 409, with the fixed message', async () => {
    const f = await fresh({ attempt: false });
    const err = await R.takeLease(f.intakeId, f.userId, R.newLeaseOwner()).catch((e) => e);
    expect(err).toBeInstanceOf(R.RunLeaseHeldError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('Draft already in progress');
    expect((await R.findRun(f.intakeId, f.userId))!.leaseOwner).toBe(f.owner);
  });

  it('the same owner may take it again (it is a renewal)', async () => {
    const f = await fresh({ attempt: false });
    const t = new Date(Date.now() + 30_000);
    const again = await R.takeLease(f.intakeId, f.userId, f.owner, t);
    expect(again.leaseOwner).toBe(f.owner);
    expect(again.leaseUntil!.getTime()).toBe(t.getTime() + R.V3_RUN_LEASE_MS);
  });

  it('is 60 s from when it is taken; just before expiry it is still held, just after it is taken', async () => {
    const userId = oid();
    const { run } = await R.openRun({
      intakeId: 'lease-a',
      userId,
      stage: 2,
      ledgerStore: 'v3',
      ledgerId: oid(),
    });
    void run;
    const t0 = new Date('2026-10-30T10:00:00.000Z');
    const o1 = R.newLeaseOwner();
    const o2 = R.newLeaseOwner();
    const first = await R.takeLease('lease-a', userId, o1, t0);
    expect(first.leaseUntil!.getTime()).toBe(t0.getTime() + 60_000);
    await expect(
      R.takeLease('lease-a', userId, o2, new Date(t0.getTime() + 59_999)),
    ).rejects.toBeInstanceOf(R.RunLeaseHeldError);
    const taken = await R.takeLease('lease-a', userId, o2, new Date(t0.getTime() + 60_001));
    expect(taken.leaseOwner).toBe(o2);
  });

  it('renew pushes the lease to now + 60 s while held, and is false once another owner holds it', async () => {
    const userId = oid();
    await R.openRun({
      intakeId: 'lease-b',
      userId,
      stage: 2,
      ledgerStore: 'v3',
      ledgerId: oid(),
    });
    const t0 = new Date('2026-10-30T10:00:00.000Z');
    const o1 = R.newLeaseOwner();
    const o2 = R.newLeaseOwner();
    await R.takeLease('lease-b', userId, o1, t0);
    const t1 = new Date(t0.getTime() + 50_000);
    expect(await R.renewLease('lease-b', userId, o1, t1)).toBe(true);
    expect((await R.findRun('lease-b', userId))!.leaseUntil!.getTime()).toBe(t1.getTime() + 60_000);
    await R.takeLease('lease-b', userId, o2, new Date(t1.getTime() + 61_000));
    expect(await R.renewLease('lease-b', userId, o1)).toBe(false);
    expect(await R.renewLease('lease-b', userId, o2)).toBe(true);
    expect(await R.renewLease('lease-b', oid(), o2)).toBe(false);
  });

  it('release gives the lease up only for its holder; then anyone may take it', async () => {
    const f = await fresh({ attempt: false });
    await R.releaseLease(f.intakeId, f.userId, R.newLeaseOwner());
    expect((await R.findRun(f.intakeId, f.userId))!.leaseOwner).toBe(f.owner);
    await R.releaseLease(f.intakeId, f.userId, f.owner);
    const after = (await R.findRun(f.intakeId, f.userId))!;
    expect(after.leaseOwner).toBeUndefined();
    expect(after.leaseUntil).toBeUndefined();
    const o2 = R.newLeaseOwner();
    expect((await R.takeLease(f.intakeId, f.userId, o2)).leaseOwner).toBe(o2);
  });

  it('takeLease on an intake with no run is RunNotFoundError; another user is not found either', async () => {
    await expect(R.takeLease('nope-intake', oid(), R.newLeaseOwner())).rejects.toBeInstanceOf(
      R.RunNotFoundError,
    );
    const f = await fresh({ attempt: false });
    await expect(R.takeLease(f.intakeId, oid(), R.newLeaseOwner())).rejects.toBeInstanceOf(
      R.RunNotFoundError,
    );
  });

  it('lease operations do not change rev', async () => {
    const f = await fresh({ attempt: false });
    const rev = f.run.rev;
    await R.renewLease(f.intakeId, f.userId, f.owner);
    await R.takeLease(f.intakeId, f.userId, f.owner);
    expect((await R.findRun(f.intakeId, f.userId))!.rev).toBe(rev);
  });

  it('a rev race is RunVersionRaceError (same owner, stale snapshot)', async () => {
    const f = await fresh();
    mustRun(await R.beginStep(f.run, f.owner, 'confirm', { ledgerVersion: 1 }));
    await expect(
      R.beginStep(f.run, f.owner, 'preflight', { ledgerVersion: 1 }),
    ).rejects.toBeInstanceOf(R.RunVersionRaceError);
  });

  it('a lost lease is RunLeaseLostError, for begin, complete, fail, status and finish alike', async () => {
    const f = await fresh();
    const started = mustRun(await R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1 }));
    const thief = R.newLeaseOwner();
    await R.takeLease(f.intakeId, f.userId, thief, new Date(Date.now() + 120_000));
    await expect(
      R.completeStep(started, f.owner, 'draft', { ledgerVersion: 1 }),
    ).rejects.toBeInstanceOf(R.RunLeaseLostError);
    await expect(R.failStep(started, f.owner, 'draft', 'x')).rejects.toBeInstanceOf(
      R.RunLeaseLostError,
    );
    await expect(R.setRunStatus(started, f.owner, 'generating')).rejects.toBeInstanceOf(
      R.RunLeaseLostError,
    );
    await expect(R.finishRun(started, f.owner, { status: 'failed' })).rejects.toBeInstanceOf(
      R.RunLeaseLostError,
    );
    await expect(
      R.startAttempt(started, f.owner, { runId: 'z', runSequence: 1 }),
    ).rejects.toBeInstanceOf(R.RunLeaseLostError);
  });

  it('a write on a run that is gone is RunNotFoundError', async () => {
    const f = await fresh();
    await V3RunModel.deleteOne({ intakeId: f.intakeId });
    await expect(R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1 })).rejects.toBeInstanceOf(
      R.RunNotFoundError,
    );
  });

  it('a write is fenced by user too: another user id cannot write the run', async () => {
    const f = await fresh();
    await expect(
      R.beginStep({ ...f.run, userId: oid() }, f.owner, 'draft', { ledgerVersion: 1 }),
    ).rejects.toBeInstanceOf(R.RunNotFoundError);
  });
});

// ── attempts ────────────────────────────────────────────────────────────────

describe('attempts', () => {
  it('startAttempt is idempotent for the attempt already last', async () => {
    const f = await fresh();
    const again = await R.startAttempt(f.run, f.owner, { runId: 'gen-1', runSequence: 1 });
    expect(again).toBe(f.run);
    const stored = (await R.findRun(f.intakeId, f.userId))!;
    expect(stored.attempts).toHaveLength(1);
    expect(stored.rev).toBe(f.run.rev);
  });

  it('an earlier running attempt becomes abandoned, with endedAt; the new one is running', async () => {
    const f = await fresh();
    const t = new Date('2026-10-30T12:00:00.000Z');
    const next = await R.startAttempt(f.run, f.owner, { runId: 'gen-1', runSequence: 2 }, t);
    expect(next.attempts[0]).toMatchObject({ runSequence: 1, outcome: 'abandoned' });
    expect(next.attempts[0]!.endedAt!.getTime()).toBe(t.getTime());
    expect(next.attempts[1]).toMatchObject({ runSequence: 2, outcome: 'running' });
    expect(next.attempts[1]!.endedAt).toBeUndefined();
  });

  it('an attempt that already ended keeps its outcome when the next one starts', async () => {
    const f = await fresh();
    const failed = await R.finishRun(f.run, f.owner, { status: 'failed' });
    expect(failed.attempts[0]!.outcome).toBe('failed');
    const next = await R.startAttempt(failed, f.owner, { runId: 'gen-1', runSequence: 2 });
    expect(next.attempts[0]!.outcome).toBe('failed');
    expect(next.attempts[1]!.outcome).toBe('running');
  });

  it('a new runId clears every non-intake-turn output, unsets the cap, resets base, round and settled', async () => {
    const f = await fresh();
    await setSetting(APP_SETTING_KEYS.COST_CAP_PAISE_PER_INK, '100');
    let run = await doStep(f.run, f.owner, 'intake.turn.1', 2, { payload: { q: 1 } });
    run = await doStep(run, f.owner, 'intake.turn.2', 3);
    await R.addCost(f.intakeId, f.userId, 25);
    run = (await R.findRun(f.intakeId, f.userId))!;
    run = await R.fixCap(run, f.owner, 2);
    run = await doStep(run, f.owner, 'confirm', 3);
    run = await doStep(run, f.owner, 'draft', 3, { payload: { d: 1 } });
    run = mustRun(await R.beginStep(run, f.owner, 'repair.2', { ledgerVersion: 3 }));
    expect(run.round).toBe(2);
    await R.addCost(f.intakeId, f.userId, 60);
    run = (await R.findRun(f.intakeId, f.userId))!;
    run = await R.finishRun(run, f.owner, {
      status: 'delivered',
      documentId: oid(),
      settled: true,
    });
    expect(run.settled).toBe(true);
    const spent = run.costPaiseSoFar;
    expect(spent).toBe(85);

    const second = await R.startAttempt(run, f.owner, { runId: 'gen-2', runSequence: 1 });
    expect(Object.keys(second.outputs).sort()).toEqual(['intake.turn.1', 'intake.turn.2']);
    expect(second.outputs['intake.turn.1']!.status).toBe('done');
    expect(second.capPaise).toBeUndefined();
    expect(second.inkQuoted).toBeUndefined();
    expect(second.capBasePaise).toBe(spent);
    expect(second.costPaiseSoFar).toBe(spent);
    expect(second.round).toBe(0);
    expect(second.settled).toBe(false);
    expect(second.attempts).toHaveLength(2);
    const raw = (await rawRun(f.intakeId))!;
    expect(raw.capPaise).toBeUndefined();
    expect(raw.inkQuoted).toBeUndefined();
    // The new run has a fresh budget on its own cap.
    const capped = await R.fixCap(second, f.owner, 3);
    expect(capped.capPaise).toBe(300);
    expect(R.capSpentPaise(capped)).toBe(0);
  });

  it('at most 50 attempts: the 51st is RunAttemptsFullError', async () => {
    const f = await fresh();
    let run = f.run;
    for (let seq = 2; seq <= V3_RUN_MAX_ATTEMPTS; seq += 1) {
      run = await R.startAttempt(run, f.owner, { runId: 'gen-1', runSequence: seq });
    }
    expect(run.attempts).toHaveLength(V3_RUN_MAX_ATTEMPTS);
    await expect(
      R.startAttempt(run, f.owner, { runId: 'gen-1', runSequence: V3_RUN_MAX_ATTEMPTS + 1 }),
    ).rejects.toBeInstanceOf(R.RunAttemptsFullError);
    expect((await R.findRun(f.intakeId, f.userId))!.attempts).toHaveLength(V3_RUN_MAX_ATTEMPTS);
    // the last one is still idempotent at the limit
    expect(
      await R.startAttempt(run, f.owner, { runId: 'gen-1', runSequence: V3_RUN_MAX_ATTEMPTS }),
    ).toBe(run);
  }, 60_000);

  it.each([
    ['empty runId', { runId: '', runSequence: 1 }],
    ['runId over 100', { runId: 'r'.repeat(101), runSequence: 1 }],
    ['sequence 0', { runId: 'r', runSequence: 0 }],
    ['sequence 1.5', { runId: 'r', runSequence: 1.5 }],
  ])('rejects %s with RunInputError', async (_n, attempt) => {
    const f = await fresh();
    await expect(R.startAttempt(f.run, f.owner, attempt)).rejects.toBeInstanceOf(R.RunInputError);
  });

  it('finishRun sets the last attempt outcome to match; capped and failed end it', async () => {
    const f = await fresh();
    const capped = await R.finishRun(f.run, f.owner, { status: 'capped' });
    expect(capped.status).toBe('capped');
    expect(capped.attempts[0]).toMatchObject({ outcome: 'capped' });
    expect(capped.attempts[0]!.endedAt).toBeInstanceOf(Date);
    await expect(
      R.finishRun(capped, f.owner, { status: 'delivered', documentId: 'nope', settled: true }),
    ).rejects.toBeInstanceOf(R.RunInputError);
  });
});

// ── cost cap ────────────────────────────────────────────────────────────────

describe('cost cap: ai.cost_cap_paise_per_ink', () => {
  const KEY = APP_SETTING_KEYS.COST_CAP_PAISE_PER_INK;

  it('the key is ai.cost_cap_paise_per_ink', () => {
    expect(KEY).toBe('ai.cost_cap_paise_per_ink');
  });

  it('unset: the default 900', async () => {
    await setSetting(KEY, null);
    expect(await R.getCostCapPaisePerInk()).toBe(900);
    expect(R.COST_CAP_PAISE_PER_INK_DEFAULT).toBe(900);
  });

  it.each([
    ['1', 1],
    ['500', 500],
    [' 250 ', 250],
    ['1000000', 1_000_000],
  ])('a valid value %j is used', async (v, n) => {
    await setSetting(KEY, v);
    expect(await R.getCostCapPaisePerInk()).toBe(n);
  });

  it.each(['0', '-5', '1.5', '1000001', 'abc', '1e3', '12x', '0x10', '+5', '99999999'])(
    'an invalid or out of range value %j gives 900',
    async (v) => {
      await setSetting(KEY, v);
      expect(await R.getCostCapPaisePerInk()).toBe(900);
    },
  );

  it('an invalid value logs the key only, never the value', async () => {
    const spies = spyLogger();
    await setSetting(KEY, 'junk-value-9137');
    expect(await R.getCostCapPaisePerInk()).toBe(900);
    const warns = spies[1]!.mock.calls;
    expect(warns.length).toBeGreaterThan(0);
    const all = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(all).toContain(KEY);
    expect(all).not.toContain('junk-value-9137');
  });

  it('an unreadable setting (a read error) gives 900 and does not throw', async () => {
    await setSetting(KEY, '400');
    const spy = jest.spyOn(AppSetting, 'findOne').mockImplementation((() => {
      throw new Error('db down');
    }) as never);
    try {
      _clearAppSettingsCache();
      expect(await R.getCostCapPaisePerInk()).toBe(900);
    } finally {
      spy.mockRestore();
    }
  });

  it('fixCap: capPaise = per-Ink cap x inkQuoted; the base is the cost so far', async () => {
    const f = await fresh();
    await setSetting(KEY, '120');
    await R.addCost(f.intakeId, f.userId, 75);
    const run = (await R.findRun(f.intakeId, f.userId))!;
    const capped = await R.fixCap(run, f.owner, 5);
    expect(capped.capPaise).toBe(600);
    expect(capped.capBasePaise).toBe(75);
    expect(capped.inkQuoted).toBe(5);
    const stored = (await R.findRun(f.intakeId, f.userId))!;
    expect(stored).toMatchObject({ capPaise: 600, capBasePaise: 75, inkQuoted: 5 });
  });

  it('fixCap with the setting unset uses 900 x inkQuoted', async () => {
    const f = await fresh();
    await setSetting(KEY, null);
    const capped = await R.fixCap(f.run, f.owner, 3);
    expect(capped.capPaise).toBe(2700);
  });

  it('fixCap is a no-op once set: no write, the first cap and base stand, even if the setting changed', async () => {
    const f = await fresh();
    await setSetting(KEY, '100');
    const capped = await R.fixCap(f.run, f.owner, 2);
    await setSetting(KEY, '777');
    await R.addCost(f.intakeId, f.userId, 10);
    const again = await R.fixCap(capped, f.owner, 8);
    expect(again).toBe(capped);
    const stored = (await R.findRun(f.intakeId, f.userId))!;
    expect(stored).toMatchObject({ capPaise: 200, capBasePaise: 0, inkQuoted: 2, rev: capped.rev });
  });

  it.each([0, -1, 1.5, Number.NaN])('fixCap rejects inkQuoted %p', async (n) => {
    const f = await fresh();
    await expect(R.fixCap(f.run, f.owner, n)).rejects.toBeInstanceOf(R.RunInputError);
  });

  it('fixCap against a stale cost (a model call landed after the read) is RunVersionRaceError, so the base is exact', async () => {
    const f = await fresh();
    await setSetting(KEY, '100');
    await R.addCost(f.intakeId, f.userId, 10);
    const stale = (await R.findRun(f.intakeId, f.userId))!;
    await R.addCost(f.intakeId, f.userId, 5);
    await expect(R.fixCap(stale, f.owner, 2)).rejects.toBeInstanceOf(R.RunVersionRaceError);
    const fresher = (await R.findRun(f.intakeId, f.userId))!;
    expect((await R.fixCap(fresher, f.owner, 2)).capBasePaise).toBe(15);
  });

  it('spent excludes the intake cost; wouldExceedCap and capReached at the boundaries', async () => {
    const f = await fresh();
    await setSetting(KEY, '900');
    await R.addCost(f.intakeId, f.userId, 700); // intake cost
    let run = (await R.findRun(f.intakeId, f.userId))!;
    run = await R.fixCap(run, f.owner, 2); // cap 1800
    expect(run.capPaise).toBe(1800);
    expect(R.capSpentPaise(run)).toBe(0);
    expect(R.capReached(run)).toBe(false);
    expect(R.wouldExceedCap(run, 1800)).toBe(false); // spent + projected == cap: not over
    expect(R.wouldExceedCap(run, 1801)).toBe(true);

    run = (await R.addCost(f.intakeId, f.userId, 1799))!;
    expect(run.costPaiseSoFar).toBe(2499);
    expect(R.capSpentPaise(run)).toBe(1799);
    expect(R.capReached(run)).toBe(false); // 1799 < 1800
    expect(R.wouldExceedCap(run, 1)).toBe(false); // 1799 + 1 == 1800
    expect(R.wouldExceedCap(run, 2)).toBe(true);

    run = (await R.addCost(f.intakeId, f.userId, 1))!;
    expect(R.capSpentPaise(run)).toBe(1800);
    expect(R.capReached(run)).toBe(true); // spent >= cap
    expect(R.wouldExceedCap(run, 0)).toBe(false);
    expect(R.wouldExceedCap(run, 1)).toBe(true);

    run = (await R.addCost(f.intakeId, f.userId, 50))!;
    expect(R.capReached(run)).toBe(true);
  });

  it('without a cap, wouldExceedCap and capReached are false whatever the cost', async () => {
    const f = await fresh();
    await R.addCost(f.intakeId, f.userId, 5_000_000);
    const run = (await R.findRun(f.intakeId, f.userId))!;
    expect(run.capPaise).toBeUndefined();
    expect(R.wouldExceedCap(run, 9_999_999)).toBe(false);
    expect(R.capReached(run)).toBe(false);
  });

  it('wouldExceedCap rejects a negative or non-finite projection', () => {
    const run = { costPaiseSoFar: 0, capBasePaise: 0, capPaise: 10 };
    expect(() => R.wouldExceedCap(run, -1)).toThrow(R.RunInputError);
    expect(() => R.wouldExceedCap(run, Number.NaN)).toThrow(R.RunInputError);
  });

  it('addCost is atomic: concurrent adds are all counted', async () => {
    const f = await fresh();
    await Promise.all(Array.from({ length: 25 }, () => R.addCost(f.intakeId, f.userId, 7)));
    expect((await R.findRun(f.intakeId, f.userId))!.costPaiseSoFar).toBe(175);
  });

  it('addCost does not bump rev and does not need the lease (an intake turn may hold none)', async () => {
    const f = await fresh();
    await R.releaseLease(f.intakeId, f.userId, f.owner);
    const out = await R.addCost(f.intakeId, f.userId, 12);
    expect(out!.costPaiseSoFar).toBe(12);
    expect(out!.rev).toBe(f.run.rev);
  });

  it('addCost: zero is a read; no run or another user gives null; bad numbers are RunInputError', async () => {
    const f = await fresh();
    expect((await R.addCost(f.intakeId, f.userId, 0))!.costPaiseSoFar).toBe(0);
    expect(await R.addCost('no-such-intake', f.userId, 5)).toBeNull();
    expect(await R.addCost(f.intakeId, oid(), 5)).toBeNull();
    expect((await R.findRun(f.intakeId, f.userId))!.costPaiseSoFar).toBe(0);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, '5' as unknown as number]) {
      await expect(R.addCost(f.intakeId, f.userId, bad)).rejects.toBeInstanceOf(R.RunInputError);
    }
  });

  it('Extractor counters are atomic and degraded is never cleared', async () => {
    const f = await fresh();
    await Promise.all(
      Array.from({ length: 10 }, () => R.recordExtractorCall(f.intakeId, f.userId)),
    );
    expect(await R.getExtractorCalls(f.intakeId, f.userId)).toEqual({ calls: 10, degraded: false });
    expect(await R.recordExtractorCall(f.intakeId, f.userId, { degraded: true })).toEqual({
      calls: 11,
      degraded: true,
    });
    expect(await R.recordExtractorCall(f.intakeId, f.userId)).toEqual({
      calls: 12,
      degraded: true,
    });
    expect(await R.recordExtractorCall('nope', f.userId)).toBeNull();
  });
});

// ── TTL ─────────────────────────────────────────────────────────────────────

describe('TTL (T-187)', () => {
  it('open sets expiresAt = now + 30 days', async () => {
    const now = new Date('2026-10-30T09:00:00.000Z');
    const { run } = await R.openRun({
      intakeId: 'ttl-a',
      userId: oid(),
      stage: 2,
      ledgerStore: 'v3',
      ledgerId: oid(),
      now,
    });
    expect(V3_RUN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(run.expiresAt!.getTime()).toBe(now.getTime() + V3_RUN_TTL_MS);
  });

  it('every data write refreshes expiresAt to now + 30 days', async () => {
    const f = await fresh();
    const t1 = new Date('2026-11-01T00:00:00.000Z');
    const t2 = new Date('2026-11-05T00:00:00.000Z');
    const t3 = new Date('2026-11-09T00:00:00.000Z');
    const t4 = new Date('2026-11-12T00:00:00.000Z');
    const t5 = new Date('2026-11-15T00:00:00.000Z');
    const exp = async (): Promise<number> =>
      ((await rawRun(f.intakeId))!.expiresAt as Date).getTime();
    const started = mustRun(
      await R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1, now: t1 }),
    );
    expect(await exp()).toBe(t1.getTime() + V3_RUN_TTL_MS);
    const done = await R.completeStep(started, f.owner, 'draft', { ledgerVersion: 1 }, t2);
    expect(await exp()).toBe(t2.getTime() + V3_RUN_TTL_MS);
    await R.addCost(f.intakeId, f.userId, 3, t3);
    expect(await exp()).toBe(t3.getTime() + V3_RUN_TTL_MS);
    await R.recordExtractorCall(f.intakeId, f.userId, {}, t4);
    expect(await exp()).toBe(t4.getTime() + V3_RUN_TTL_MS);
    const cur = (await R.findRun(f.intakeId, f.userId))!;
    await R.setRunStatus(cur, f.owner, 'generating', t5);
    expect(await exp()).toBe(t5.getTime() + V3_RUN_TTL_MS);
    void done;
  });

  it('a delivered run (finishRun with a Document) unsets expiresAt, and later writes keep it unset', async () => {
    const f = await fresh();
    const done = await doStep(f.run, f.owner, 'draft', 1);
    const delivered = await R.finishRun(done, f.owner, {
      status: 'delivered',
      documentId: oid(),
      settled: true,
    });
    expect(delivered.expiresAt).toBeUndefined();
    expect(delivered.documentId).toBeDefined();
    expect((await rawRun(f.intakeId))!.expiresAt).toBeUndefined();

    await R.addCost(f.intakeId, f.userId, 5);
    expect((await rawRun(f.intakeId))!.expiresAt).toBeUndefined();
    await R.recordExtractorCall(f.intakeId, f.userId);
    expect((await rawRun(f.intakeId))!.expiresAt).toBeUndefined();
    const again = await R.startAttempt(delivered, f.owner, { runId: 'gen-2', runSequence: 1 });
    expect(again.expiresAt).toBeUndefined();
    expect((await rawRun(f.intakeId))!.expiresAt).toBeUndefined();
    const b = mustRun(await R.beginStep(again, f.owner, 'confirm', { ledgerVersion: 1 }));
    expect(b.expiresAt).toBeUndefined();
    expect((await rawRun(f.intakeId))!.expiresAt).toBeUndefined();
  });

  it('a failed or capped run keeps its TTL', async () => {
    const f = await fresh();
    const failed = await R.finishRun(f.run, f.owner, { status: 'failed' });
    expect(failed.expiresAt).toBeInstanceOf(Date);
  });

  it('a fixture run is marked fixture and has the same TTL', async () => {
    const f = await fresh({ userId: GOLDEN_SET_USER_ID });
    expect(f.run.runType).toBe('fixture');
    expect(f.run.expiresAt).toBeInstanceOf(Date);
    const started = mustRun(await R.beginStep(f.run, f.owner, 'draft', { ledgerVersion: 1 }));
    expect(started.expiresAt).toBeInstanceOf(Date);
    expect((await rawRun(f.intakeId))!.runType).toBe('fixture');
  });
});

// ── byte caps ───────────────────────────────────────────────────────────────

describe('byte caps', () => {
  it('uses the T-682 limits: 2 MB an output, 12 MB a document', () => {
    expect(LEDGER_V3_MAX_SEALED_BYTES).toBe(2 * 1024 * 1024);
    expect(LEDGER_V3_MAX_DOC_SEALED_BYTES).toBe(12 * 1024 * 1024);
  });

  it('one output over 2 MB: no sealed, sealedOmitted too_large; the step is still done', async () => {
    const f = await fresh();
    const run = await doStep(f.run, f.owner, 'draft', 1, {
      payload: { big: 'z'.repeat(LEDGER_V3_MAX_SEALED_BYTES + 1) },
    });
    expect(run.outputs.draft).toMatchObject({ status: 'done', sealedOmitted: 'too_large' });
    expect(run.outputs.draft!.sealed).toBeUndefined();
    const raw = (await rawRun(f.intakeId))!;
    expect((raw.outputs as Record<string, Record<string, unknown>>).draft!.sealed).toBeUndefined();
    expect(R.readStepPayload(run.outputs.draft)).toBeUndefined();
  });

  it('an output just under 2 MB sealed is kept', async () => {
    const f = await fresh();
    const probe = Buffer.byteLength(encrypt(JSON.stringify({ t: 'a'.repeat(10_000) })), 'utf8');
    const ratio = probe / 10_000;
    const n = Math.floor((LEDGER_V3_MAX_SEALED_BYTES * 0.95) / ratio);
    const run = await doStep(f.run, f.owner, 'draft', 1, { payload: { t: 'a'.repeat(n) } });
    expect(run.outputs.draft!.sealedOmitted).toBeUndefined();
    expect(Buffer.byteLength(run.outputs.draft!.sealed!, 'utf8')).toBeLessThanOrEqual(
      LEDGER_V3_MAX_SEALED_BYTES,
    );
    expect((R.readStepPayload(run.outputs.draft) as { t: string }).t).toHaveLength(n);
  }, 60_000);

  it('the document total over 12 MB: the output that would pass it is omitted, the total never exceeds 12 MB', async () => {
    const f = await fresh();
    const probe = Buffer.byteLength(encrypt(JSON.stringify({ t: 'a'.repeat(10_000) })), 'utf8');
    const ratio = probe / 10_000;
    const n = Math.floor((LEDGER_V3_MAX_SEALED_BYTES * 0.9) / ratio); // ~1.8 MB sealed each
    let run = f.run;
    let omittedAt = -1;
    for (let i = 1; i <= 9; i += 1) {
      const id = intakeTurnStep(i);
      run = await doStep(run, f.owner, id, i, { payload: { t: 'b'.repeat(n) } });
      if (run.outputs[id]!.sealedOmitted === 'too_large') {
        omittedAt = i;
        break;
      }
    }
    expect(omittedAt).toBeGreaterThan(1);
    const total = Object.values(run.outputs).reduce(
      (s, o) => s + (o!.sealed ? Buffer.byteLength(o!.sealed, 'utf8') : 0),
      0,
    );
    expect(total).toBeLessThanOrEqual(LEDGER_V3_MAX_DOC_SEALED_BYTES);
    expect(total + Math.floor(LEDGER_V3_MAX_SEALED_BYTES * 0.9)).toBeGreaterThan(
      LEDGER_V3_MAX_DOC_SEALED_BYTES,
    );
    expect(run.outputs[intakeTurnStep(omittedAt)]!.sealed).toBeUndefined();
    expect(run.outputs[intakeTurnStep(omittedAt)]!.status).toBe('done');
    // A small output still fits after an omit if there is room (the cap is on bytes, not count).
    const small = await doStep(run, f.owner, 'confirm', 1, { payload: { ok: true } });
    expect(small.outputs.confirm!.sealed === undefined).toBe(
      total + Buffer.byteLength(encrypt(JSON.stringify({ ok: true })), 'utf8') >
        LEDGER_V3_MAX_DOC_SEALED_BYTES,
    );
  }, 120_000);

  it('re-sealing the same step replaces its bytes (the step is not counted against itself)', async () => {
    const f = await fresh();
    const probe = Buffer.byteLength(encrypt(JSON.stringify({ t: 'a'.repeat(10_000) })), 'utf8');
    const n = Math.floor((LEDGER_V3_MAX_SEALED_BYTES * 0.9) / (probe / 10_000));
    let run = await doStep(f.run, f.owner, 'derive', 1, { payload: { t: 'c'.repeat(n) } });
    for (let i = 1; i <= 5; i += 1) {
      run = await doStep(run, f.owner, intakeTurnStep(i), 1, { payload: { t: 'd'.repeat(n) } });
    }
    // derive at a new version runs again; its old bytes must not count against the new ones
    run = await doStep(run, f.owner, 'derive', 2, { payload: { t: 'e'.repeat(n) } });
    expect(run.outputs.derive!.sealedOmitted).toBeUndefined();
    expect(run.outputs.derive!.sealed).toBeDefined();
  }, 120_000);
});

// ── T-682 condition 5: no plaintext outside sealed ──────────────────────────

describe('condition 5: serialise and search, no payload text outside sealed', () => {
  const MARKERS = [
    'ZEBRA-QUOKKA-7741 Priya Nair of Flat 12B Lotus Court',
    'Respondent Mehta Constructions alleges forged cheque 55-AX-901',
    'Section 138 notice served on 14 March, repair text verbatim',
    'render body: IN THE COURT OF THE FICTIONAL MAGISTRATE',
    'verify finding: paragraph 4 contradicts Annexure C',
    'preflight: missing verification clause for MARKER-PF-3302',
    'confirm: client address 221B Baker Lane Fictionville',
  ];

  it('payload text is only in sealed; the raw doc, the snapshot and every log line are clean', async () => {
    const spies = spyLogger();
    const f = await fresh();
    let run = await doStep(f.run, f.owner, 'intake.turn.1', 2, { payload: { a: MARKERS[0] } });
    run = await doStep(run, f.owner, 'confirm', 2, { payload: { a: MARKERS[6] } });
    run = await doStep(run, f.owner, 'preflight', 2, { payload: { a: MARKERS[5] } });
    run = await doStep(run, f.owner, 'draft', 2, {
      payload: { text: MARKERS[1] },
      usage: { inputTokens: 10, outputTokens: 20 },
      costPaise: 5,
      hash: 'f'.repeat(64),
      ref: oid(),
    });
    run = await doStep(run, f.owner, 'verify', 2, { payload: { findings: [MARKERS[4]] } });
    run = await doStep(run, f.owner, 'repair.1', 2, { payload: { text: MARKERS[2] } });
    run = await doStep(run, f.owner, 'render', 2, { payload: { text: MARKERS[3] } });
    // a failure with a reason code, and a rejected free-text reason
    const failing = mustRun(await R.beginStep(run, f.owner, 'deliver', { ledgerVersion: 2 }));
    await expect(R.failStep(failing, f.owner, 'deliver', MARKERS[1])).rejects.toBeInstanceOf(
      R.RunInputError,
    );
    run = await R.failStep(failing, f.owner, 'deliver', 'save_failed');
    await R.addCost(f.intakeId, f.userId, 9);
    await R.recordExtractorCall(f.intakeId, f.userId, { degraded: true });
    // replay path
    const rp = await R.beginStep(run, f.owner, 'draft', { ledgerVersion: 2 });
    expect(rp.action).toBe('replay');

    const raw = (await rawRun(f.intakeId))!;
    const rawOutputs = raw.outputs as Record<string, Record<string, unknown>>;
    for (const [key, out] of Object.entries(rawOutputs)) {
      expect(key).not.toContain('.');
      void out;
    }
    // Every sealed payload is present and opaque.
    const sealedCount = Object.values(rawOutputs).filter(
      (o) => typeof o.sealed === 'string',
    ).length;
    expect(sealedCount).toBe(7);

    const strip = (o: Record<string, Record<string, unknown>>) =>
      Object.fromEntries(
        Object.entries(o).map(([k, v]) => {
          const { sealed: _s, ...rest } = v;
          void _s;
          return [k, rest];
        }),
      );
    const rawNoSealed = JSON.stringify({ ...raw, outputs: strip(rawOutputs) });
    const snap = (await R.findRun(f.intakeId, f.userId))!;
    const snapNoSealed = JSON.stringify({
      ...snap,
      outputs: Object.fromEntries(
        Object.entries(snap.outputs).map(([k, v]) => {
          const { sealed: _s, ...rest } = v!;
          void _s;
          return [k, rest];
        }),
      ),
    });
    const logs = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    const everywhereSealed = JSON.stringify(rawOutputs);
    for (const m of MARKERS) {
      expect(rawNoSealed).not.toContain(m);
      expect(snapNoSealed).not.toContain(m);
      expect(logs).not.toContain(m);
      // and not in sealed either: it is encrypted, not merely wrapped
      expect(everywhereSealed).not.toContain(m);
      // single distinctive words, in case a serialiser split the text
      for (const w of m.split(/\s+/).filter((x) => x.length > 7)) {
        expect(rawNoSealed).not.toContain(w);
        expect(logs).not.toContain(w);
      }
    }
    // the fixed reason code is stored; the free-text reason never was
    expect(rawOutputs.deliver!.reason).toBe('save_failed');
    // round trip through the one reader
    expect(R.readStepPayload(snap.outputs.draft)).toEqual({ text: MARKERS[1] });
    expect(R.readStepPayload(snap.outputs['intake.turn.1'])).toEqual({ a: MARKERS[0] });
  });

  it('each stored output has only whitelisted fields (ids, counts, times, paise, codes, sealed)', async () => {
    const f = await fresh();
    let run = await doStep(f.run, f.owner, 'draft', 2, {
      payload: { text: 'whitelist body text' },
      usage: { inputTokens: 1, outputTokens: 2 },
      costPaise: 1,
      ref: oid(),
      hash: 'c'.repeat(64),
    });
    run = mustRun(await R.beginStep(run, f.owner, 'verify', { ledgerVersion: 2 }));
    await R.failStep(run, f.owner, 'verify', 'timeout');
    const raw = (await rawRun(f.intakeId))!;
    const allowed = new Set([
      'status',
      'ledgerVersion',
      'startedAt',
      'endedAt',
      'runId',
      'runSequence',
      'reruns',
      'retries',
      'usage',
      'costPaise',
      'ref',
      'hash',
      'sealed',
      'sealedOmitted',
      'reason',
    ]);
    for (const out of Object.values(raw.outputs as Record<string, Record<string, unknown>>)) {
      for (const k of Object.keys(out)) expect(allowed.has(k)).toBe(true);
    }
    const topAllowed = new Set([
      '_id',
      '__v',
      'schemaVersion',
      'intakeId',
      'userId',
      'runType',
      'stage',
      'ledgerStore',
      'ledgerId',
      'rev',
      'step',
      'ledgerVersion',
      'outputs',
      'attempts',
      'costPaiseSoFar',
      'capPaise',
      'capBasePaise',
      'inkQuoted',
      'extractorCalls',
      'extractorDegraded',
      'round',
      'status',
      'settled',
      'documentId',
      'leaseOwner',
      'leaseUntil',
      'expiresAt',
      'createdAt',
      'updatedAt',
    ]);
    for (const k of Object.keys(raw)) expect(topAllowed.has(k)).toBe(true);
  });

  it('a sealed payload that does not decrypt is RunSealedUnreadableError with a fixed message', () => {
    expect(() => R.readStepPayload({ sealed: 'not-a-sealed-value' })).toThrow(
      R.RunSealedUnreadableError,
    );
    expect(R.readStepPayload(undefined)).toBeUndefined();
    expect(R.readStepPayload({})).toBeUndefined();
  });

  it('payloads of any JSON shape round-trip through seal and open', async () => {
    const f = await fresh();
    const payloads: unknown[] = [{ a: [1, 2, { b: null }] }, 'plain string', 42, [], false];
    let run = f.run;
    const ids: StepId[] = ['confirm', 'preflight', 'draft', 'verify', 'render'];
    for (let i = 0; i < ids.length; i += 1) {
      run = await doStep(run, f.owner, ids[i]!, 1, { payload: payloads[i] });
    }
    for (let i = 0; i < ids.length; i += 1) {
      expect(R.readStepPayload(run.outputs[ids[i]!])).toEqual(payloads[i]);
    }
  });
});

// ── step id mapping ─────────────────────────────────────────────────────────

describe("'.' step ids are stored with ':' and callers see the real ids", () => {
  it('stepKey and stepIdOfKey round-trip every step id', () => {
    const ids: StepId[] = [
      ...GENERATE_STEP_ORDER,
      intakeTurnStep(1),
      intakeTurnStep(12),
      intakeTurnStep(999),
    ];
    for (const id of ids) {
      expect(stepKey(id)).not.toContain('.');
      expect(stepIdOfKey(stepKey(id))).toBe(id);
    }
    expect(stepKey('intake.turn.3')).toBe('intake:turn:3');
    expect(stepKey('repair.2')).toBe('repair:2');
    expect(stepKey('draft')).toBe('draft');
  });

  it('the stored keys use a colon; findRun, snapshots and decisions use the dotted ids', async () => {
    const f = await fresh();
    let run = await doStep(f.run, f.owner, 'intake.turn.1', 1);
    run = await doStep(run, f.owner, 'repair.1', 1);
    const raw = (await rawRun(f.intakeId))!;
    expect(Object.keys(raw.outputs as object).sort()).toEqual(['intake:turn:1', 'repair:1']);
    const stored = (await R.findRun(f.intakeId, f.userId))!;
    expect(Object.keys(stored.outputs).sort()).toEqual(['intake.turn.1', 'repair.1']);
    expect(Object.keys(run.outputs).sort()).toEqual(['intake.turn.1', 'repair.1']);
    expect(stored.outputs['repair.1']!.stepId).toBe('repair.1');
    // a step begun through the dotted id is found through it: replay works
    const d = await R.beginStep(run, f.owner, 'repair.1', { ledgerVersion: 1 });
    expect(d.action).toBe('replay');
  });

  it('parseStepId and isStepId accept the closed set only', () => {
    for (const ok of [
      'confirm',
      'derive',
      'hold',
      'preflight',
      'draft',
      'verify',
      'render',
      'deliver',
      'intake.turn.1',
      'intake.turn.999',
      'repair.1',
      'repair.2',
    ]) {
      expect(isStepId(ok)).toBe(true);
    }
    for (const bad of [
      'repair.0',
      'repair.3',
      'repair.01',
      'repair.1.2',
      'intake.turn.0',
      'intake.turn.1000',
      'intake.turn.01',
      'intake.turn',
      'intake:turn:1',
      'x',
      '',
      null,
      undefined,
      5,
      {},
    ]) {
      expect(isStepId(bad)).toBe(false);
      expect(parseStepId(bad)).toBeNull();
    }
    expect(parseStepId('repair.2')).toEqual({ kind: 'repair', n: 2 });
    expect(parseStepId('intake.turn.7')).toEqual({ kind: 'intake.turn', n: 7 });
    expect(() => intakeTurnStep(0)).toThrow(RangeError);
    expect(() => repairStep(MAX_REPAIR_ROUNDS + 1)).toThrow(RangeError);
  });

  it('stepPolicy per step id (answers §3 table)', () => {
    expect(stepPolicy('intake.turn.1')).toBe('ledger');
    expect(stepPolicy('derive')).toBe('replay_same_version');
    expect(stepPolicy('hold')).toBe('per_attempt');
    expect(stepPolicy('deliver')).toBe('rerun');
    for (const id of [
      'confirm',
      'preflight',
      'draft',
      'verify',
      'repair.1',
      'repair.2',
      'render',
    ] as StepId[]) {
      expect(stepPolicy(id)).toBe('replay');
    }
    expect(() => stepPolicy('nope' as StepId)).toThrow(RangeError);
  });
});

// ── AC3: stage names and round ──────────────────────────────────────────────

describe('AC3 SSE stage names', () => {
  it('the closed list of names', () => {
    expect([...V3_STAGE_NAMES]).toEqual([
      'intake',
      'preflight',
      'draft',
      'verify',
      'repair',
      'render',
      'done',
    ]);
    for (const n of V3_STAGE_NAMES) expect(isV3StageName(n)).toBe(true);
    for (const n of ['hold', 'confirm', 'deliver', '', null, 'Draft', 5]) {
      expect(isV3StageName(n)).toBe(false);
    }
  });

  it.each([
    ['intake.turn.1', { stage: 'intake' }],
    ['intake.turn.40', { stage: 'intake' }],
    ['confirm', null],
    ['derive', null],
    ['hold', null],
    ['preflight', { stage: 'preflight' }],
    ['draft', { stage: 'draft' }],
    ['verify', { stage: 'verify' }],
    ['repair.1', { stage: 'repair', round: 1 }],
    ['repair.2', { stage: 'repair', round: 2 }],
    ['render', { stage: 'render' }],
    ['deliver', { stage: 'done' }],
  ] as Array<[StepId, { stage: string; round?: number } | null]>)(
    'stageForStep(%s)',
    (id, expected) => {
      expect(stageForStep(id)).toStrictEqual(expected);
    },
  );

  it('every step id maps to a known stage name or null; only repair carries a round', () => {
    const ids: StepId[] = [...GENERATE_STEP_ORDER, intakeTurnStep(1), intakeTurnStep(5)];
    for (const id of ids) {
      const s = stageForStep(id);
      if (s === null) continue;
      expect(isV3StageName(s.stage)).toBe(true);
      if (s.stage === 'repair') expect(typeof s.round).toBe('number');
      else expect('round' in s).toBe(false);
    }
    expect(stageForStep('nope' as StepId)).toBeNull();
  });

  it('the generate order is fixed: confirm, derive, hold, preflight, draft, verify, repair.1, repair.2, render, deliver', () => {
    expect([...GENERATE_STEP_ORDER]).toEqual([
      'confirm',
      'derive',
      'hold',
      'preflight',
      'draft',
      'verify',
      'repair.1',
      'repair.2',
      'render',
      'deliver',
    ]);
  });
});

// ── boot line ───────────────────────────────────────────────────────────────

describe('boot: the optional cost cap setting', () => {
  const KEY = APP_SETTING_KEYS.COST_CAP_PAISE_PER_INK;
  const LINE = 'Optional AppSetting is not configured; using default 900';

  it('with the key unset, primeConfigWarnings logs one info line naming the key, and it is never a config warning', async () => {
    const spies = spyLogger();
    await setSetting(KEY, null);
    const warnings = await primeConfigWarnings();
    const lines = spies[0]!.mock.calls.filter((c) => c[1] === LINE);
    expect(lines).toHaveLength(1);
    expect(lines[0]![0]).toEqual({ setting: KEY });
    expect(warnings).not.toContain(KEY);
    expect(getConfigWarnings()).not.toContain(KEY);
    expect(JSON.stringify([...warnings, ...getConfigWarnings()])).not.toContain('cost_cap');
  });

  it('with the key set, there is no such line and still no warning', async () => {
    const spies = spyLogger();
    await setSetting(KEY, '500');
    const warnings = await primeConfigWarnings();
    expect(spies[0]!.mock.calls.filter((c) => c[1] === LINE)).toHaveLength(0);
    expect(warnings).not.toContain(KEY);
  });

  it('with an invalid value there is no unset line (it is set) and no warning', async () => {
    const spies = spyLogger();
    await setSetting(KEY, 'abc');
    const warnings = await primeConfigWarnings();
    expect(spies[0]!.mock.calls.filter((c) => c[1] === LINE)).toHaveLength(0);
    expect(warnings).not.toContain(KEY);
  });
});

// ── AC4: the single stage reader ────────────────────────────────────────────

describe('AC4 isLedgerV3On(userId) = stage >= 1, with the fixture override', () => {
  it('the setting key is feature.drafting_v3_stage, re-exported from ledger.service', () => {
    expect(DRAFTING_V3_STAGE_SETTING).toBe('feature.drafting_v3_stage');
    expect(L.DRAFTING_V3_STAGE_SETTING).toBe(DRAFTING_V3_STAGE_SETTING);
    expect(L.v3Stage).toBeDefined();
    expect((L as Record<string, unknown>).draftingV3Stage).toBeUndefined();
  });

  it.each([
    [null, 0, false],
    ['0', 0, false],
    ['1', 1, true],
    ['2', 2, true],
    ['3', 3, true],
    ['4', 0, false],
    ['-1', 0, false],
    ['abc', 0, false],
  ] as Array<[string | null, number, boolean]>)(
    'setting %j: stage %i, on %p',
    async (value, stage, on) => {
      await setSetting(DRAFTING_V3_STAGE_SETTING, value);
      const user = oid();
      expect(await L.v3Stage(user)).toBe(stage);
      expect(await L.isLedgerV3On(user)).toBe(on);
      expect(await L.isLedgerV3On(undefined)).toBe(on);
    },
  );

  it('the fixture user is off unless the golden-set runner sets a stage; no other user is affected', async () => {
    await setSetting(DRAFTING_V3_STAGE_SETTING, '3');
    expect(await L.isLedgerV3On(GOLDEN_SET_USER_ID)).toBe(false);
    setFixtureV3Stage(2);
    expect(await L.v3Stage(GOLDEN_SET_USER_ID)).toBe(2);
    expect(await L.isLedgerV3On(GOLDEN_SET_USER_ID)).toBe(true);
    setFixtureV3Stage(0);
    expect(await L.isLedgerV3On(GOLDEN_SET_USER_ID)).toBe(false);

    await setSetting(DRAFTING_V3_STAGE_SETTING, '0');
    setFixtureV3Stage(3);
    expect(await L.isLedgerV3On(oid())).toBe(false);
    expect(await L.isLedgerV3On(GOLDEN_SET_USER_ID)).toBe(true);
    setFixtureV3Stage(null);
    expect(await L.isLedgerV3On(GOLDEN_SET_USER_ID)).toBe(false);
  });

  it('never throws, even when the setting read fails', async () => {
    const spy = jest.spyOn(AppSetting, 'findOne').mockImplementation((() => {
      throw new Error('db down');
    }) as never);
    try {
      _clearAppSettingsCache();
      _clearV3StageCache();
      await expect(L.isLedgerV3On(oid())).resolves.toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
