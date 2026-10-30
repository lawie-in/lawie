/**
 * T-685: the v3 run document API (Arjun, T-685 answers §1-§3, §5, §7, §10).
 *
 * Only this module reads or writes `v3_runs` (run.model.ts). It holds state
 * only: no model calls, no Ink, no SSE (the orchestrator, part 2, does those).
 *
 * Writes:
 *  - rev-guarded (step, attempt, cap, status): the filter carries the `rev`
 *    the caller read and the caller's `leaseOwner`; the write `$inc`s `rev`.
 *    A miss is RunVersionRaceError (re-read and try again), RunLeaseLostError
 *    (another owner took the lease) or RunNotFoundError;
 *  - atomic counters (cost, Extractor calls): a `$inc` by intakeId + userId,
 *    not rev-guarded and not fenced by the lease, so intake turns (which may
 *    hold no lease) still count, and a counter never makes a step write race;
 *  - the lease: a conditional update on `leaseUntil`/`leaseOwner` only.
 * Every data write sets `expiresAt` = now + 30 days until a Document is saved
 * from the run; then `expiresAt` stays unset (T-187).
 *
 * Privacy: logs carry ids, step ids, counts, reason codes and paise only.
 * Step payloads are sealed (T-115a helper and key); nothing else is text.
 */
import crypto from 'crypto';

import mongoose from 'mongoose';

import logger from '../../config/logger';
import { decrypt, encrypt } from '../../utils/encryption';
import { APP_SETTING_KEYS, AppSettingMissingError, getAppSetting } from '../app-settings.service';

import { LEDGER_V3_MAX_DOC_SEALED_BYTES, LEDGER_V3_MAX_SEALED_BYTES } from './ledger.service';
import {
  REASON_CODE_RE,
  stepIdOfKey,
  stepKey,
  V3_RUN_MAX_ATTEMPTS,
  V3_RUN_STAGES,
  V3_RUN_TTL_MS,
  V3RunModel,
  type IV3RunAttempt,
  type IV3StepOutput,
  type IV3StepUsage,
  type V3AttemptOutcome,
  type V3RunStage,
  type V3RunStatus,
} from './run.model';
import { isStepId, parseStepId, stepPolicy, type StepId } from './stages';

// ── Constants ───────────────────────────────────────────────────────────────

/** Answers §5: a lease is 60 s from when it is taken or renewed. */
export const V3_RUN_LEASE_MS = 60_000;
/** Answers §7 / ADR §4 (Vikram, signed): the code default of ai.cost_cap_paise_per_ink. */
export const COST_CAP_PAISE_PER_INK_DEFAULT = 900;
/** An upper bound on a configured per-Ink cap (₹10,000), so a typo cannot lift the cap off. */
const COST_CAP_PAISE_PER_INK_MAX = 1_000_000;

// ── Errors (fixed messages, no content) ─────────────────────────────────────

/** Another write came first (rev changed); re-read and try again. */
export class RunVersionRaceError extends Error {
  constructor() {
    super('run changed while this write was made');
    this.name = 'RunVersionRaceError';
  }
}

export class RunNotFoundError extends Error {
  constructor() {
    super('v3 run not found');
    this.name = 'RunNotFoundError';
  }
}

/** The intake already has a run of another user. */
export class RunTakenError extends Error {
  constructor() {
    super('the intake has a run of another user');
    this.name = 'RunTakenError';
  }
}

/** A live lease is held by another owner: the route answers 409 (answers §5). */
export class RunLeaseHeldError extends Error {
  readonly status = 409;
  constructor() {
    super('Draft already in progress');
    this.name = 'RunLeaseHeldError';
  }
}

/** The caller's lease was taken by another owner; stop writing. */
export class RunLeaseLostError extends Error {
  constructor() {
    super('run lease lost');
    this.name = 'RunLeaseLostError';
  }
}

/** completeStep / failStep on a step that is not running. */
export class RunStepStateError extends Error {
  constructor() {
    super('step is not running');
    this.name = 'RunStepStateError';
  }
}

/** A sealed step payload that does not decrypt. Fixed message, no content. */
export class RunSealedUnreadableError extends Error {
  constructor() {
    super('sealed run output is unreadable');
    this.name = 'RunSealedUnreadableError';
  }
}

export class RunAttemptsFullError extends Error {
  constructor() {
    super('run has too many attempts');
    this.name = 'RunAttemptsFullError';
  }
}

/** A malformed argument (ids, step id, numbers). Fixed message, never the value. */
export class RunInputError extends Error {
  constructor(what: string) {
    super(`invalid run input: ${what}`);
    this.name = 'RunInputError';
  }
}

// ── Snapshot ────────────────────────────────────────────────────────────────

export type V3StepOutput = IV3StepOutput & { stepId: StepId };

/** A plain, read-only view of a run document. */
export interface V3RunSnapshot {
  id: string;
  schemaVersion: number;
  intakeId: string;
  userId: string;
  runType: 'user' | 'fixture';
  stage: V3RunStage;
  ledgerStore: 'v3' | 'v2';
  ledgerId: string;
  rev: number;
  step?: string;
  ledgerVersion: number;
  outputs: Readonly<Partial<Record<StepId, V3StepOutput>>>;
  attempts: readonly IV3RunAttempt[];
  costPaiseSoFar: number;
  capPaise?: number;
  capBasePaise: number;
  inkQuoted?: number;
  extractorCalls: number;
  extractorDegraded: boolean;
  round: number;
  status: V3RunStatus;
  settled: boolean;
  documentId?: string;
  leaseOwner?: string;
  leaseUntil?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type LeanRun = Omit<V3RunSnapshot, 'id' | 'userId' | 'outputs'> & {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  outputs?: Record<string, IV3StepOutput> | Map<string, IV3StepOutput>;
};

function toSnapshot(doc: LeanRun): V3RunSnapshot {
  const raw = doc.outputs instanceof Map ? Object.fromEntries(doc.outputs) : (doc.outputs ?? {});
  const outputs: Partial<Record<StepId, V3StepOutput>> = {};
  for (const [key, o] of Object.entries(raw)) {
    const id = stepIdOfKey(key);
    if (isStepId(id)) outputs[id] = { ...o, stepId: id };
  }
  const { _id, userId, outputs: _o, ...rest } = doc;
  void _o;
  return { ...rest, id: String(_id), userId: String(userId), outputs };
}

// ── Small helpers ───────────────────────────────────────────────────────────

function assertIds(intakeId: unknown, userId: unknown): asserts intakeId is string {
  if (typeof intakeId !== 'string' || intakeId === '' || intakeId.length > 100) {
    throw new RunInputError('intakeId');
  }
  if (typeof userId !== 'string' || !mongoose.isValidObjectId(userId)) {
    throw new RunInputError('userId');
  }
}

function assertStep(id: unknown): asserts id is StepId {
  if (!isStepId(id)) throw new RunInputError('stepId');
}

function assertOwner(owner: unknown): asserts owner is string {
  if (typeof owner !== 'string' || owner === '' || owner.length > 100) {
    throw new RunInputError('owner');
  }
}

function wholeNumber(n: unknown, min: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min;
}

function paise(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function expiry(now: Date): Date {
  return new Date(now.getTime() + V3_RUN_TTL_MS);
}

/** The attempt now running: the last one. */
function currentAttempt(run: V3RunSnapshot): IV3RunAttempt | undefined {
  return run.attempts[run.attempts.length - 1];
}

function sameAttempt(o: IV3StepOutput, a: IV3RunAttempt | undefined): boolean {
  return (
    (o.runId ?? null) === (a?.runId ?? null) && (o.runSequence ?? null) === (a?.runSequence ?? null)
  );
}

function sealedBytes(o: IV3StepOutput | undefined): number {
  return o?.sealed ? Buffer.byteLength(o.sealed, 'utf8') : 0;
}

/** Why a rev-guarded write matched nothing. */
async function missReason(run: V3RunSnapshot, owner: string): Promise<Error> {
  const now = await V3RunModel.findOne({ _id: run.id, userId: run.userId })
    .select({ rev: 1, leaseOwner: 1 })
    .lean();
  if (!now) return new RunNotFoundError();
  if (now.leaseOwner !== owner) return new RunLeaseLostError();
  return new RunVersionRaceError();
}

/**
 * One rev-guarded write: matches only while `rev` is the caller's and the
 * caller holds the lease (`extraFilter` may pin more fields); `$inc`s rev and
 * refreshes `expiresAt` unless a Document has been saved.
 */
async function guardedWrite(
  run: V3RunSnapshot,
  owner: string,
  update: { $set?: Record<string, unknown>; $unset?: Record<string, ''> },
  extraFilter: Record<string, unknown> = {},
  now: Date = new Date(),
): Promise<V3RunSnapshot> {
  assertOwner(owner);
  const $set: Record<string, unknown> = { ...(update.$set ?? {}) };
  const $unset: Record<string, ''> = { ...(update.$unset ?? {}) };
  const docSaved = run.documentId !== undefined || $set.documentId !== undefined;
  if (docSaved) {
    $unset.expiresAt = '';
  } else {
    $set.expiresAt = expiry(now);
  }
  const updated = await V3RunModel.findOneAndUpdate(
    { _id: run.id, userId: run.userId, rev: run.rev, leaseOwner: owner, ...extraFilter },
    {
      ...(Object.keys($set).length > 0 ? { $set } : {}),
      ...(Object.keys($unset).length > 0 ? { $unset } : {}),
      $inc: { rev: 1 },
    },
    { new: true, runValidators: true },
  ).lean<LeanRun>();
  if (!updated) throw await missReason(run, owner);
  return toSnapshot(updated);
}

/**
 * An atomic `$inc` by intakeId + userId (not rev-guarded, not lease-fenced),
 * with `expiresAt` refreshed unless a Document has been saved. Null when the
 * intake has no run.
 */
async function incCounters(
  intakeId: string,
  userId: string,
  inc: Record<string, number>,
  set: Record<string, unknown> = {},
  now: Date = new Date(),
): Promise<V3RunSnapshot | null> {
  const base = { intakeId, userId };
  const live = await V3RunModel.findOneAndUpdate(
    { ...base, documentId: { $exists: false } },
    { $inc: inc, $set: { ...set, expiresAt: expiry(now) } },
    { new: true },
  ).lean<LeanRun>();
  if (live) return toSnapshot(live);
  const saved = await V3RunModel.findOneAndUpdate(
    { ...base, documentId: { $exists: true } },
    { $inc: inc, ...(Object.keys(set).length > 0 ? { $set: set } : {}) },
    { new: true },
  ).lean<LeanRun>();
  return saved ? toSnapshot(saved) : null;
}

// ── Open ────────────────────────────────────────────────────────────────────

/** A process-unique lease owner: process id + random. */
export function newLeaseOwner(): string {
  return `${process.pid}:${crypto.randomBytes(8).toString('hex')}`;
}

/** The intake's run of this user, or null. */
export async function findRun(intakeId: string, userId: string): Promise<V3RunSnapshot | null> {
  if (typeof intakeId !== 'string' || intakeId === '' || !mongoose.isValidObjectId(userId)) {
    return null;
  }
  const doc = await V3RunModel.findOne({ intakeId, userId }).lean<LeanRun>();
  return doc ? toSnapshot(doc) : null;
}

/** A run doc found by a generate attempt's runId (the Ink hold key), of this user, or null. */
export async function findRunByAttempt(
  runId: string,
  userId: string,
): Promise<V3RunSnapshot | null> {
  if (typeof runId !== 'string' || runId === '' || !mongoose.isValidObjectId(userId)) return null;
  const doc = await V3RunModel.findOne({ 'attempts.runId': runId, userId }).lean<LeanRun>();
  return doc ? toSnapshot(doc) : null;
}

/**
 * The intake's run, created once (answers §1). A second call for the same
 * intake and user returns the existing run unchanged: `stage`, `ledgerStore`
 * and `ledgerId` are fixed by the first call (T-682 condition 7). An intake
 * held by another user throws RunTakenError.
 */
export async function openRun(args: {
  intakeId: string;
  userId: string;
  stage: V3RunStage;
  ledgerStore: 'v3' | 'v2';
  ledgerId: string;
  now?: Date;
}): Promise<{ run: V3RunSnapshot; created: boolean }> {
  assertIds(args.intakeId, args.userId);
  if (!(V3_RUN_STAGES as readonly number[]).includes(args.stage)) throw new RunInputError('stage');
  if (args.ledgerStore !== 'v3' && args.ledgerStore !== 'v2') {
    throw new RunInputError('ledgerStore');
  }
  if (typeof args.ledgerId !== 'string' || !mongoose.isValidObjectId(args.ledgerId)) {
    throw new RunInputError('ledgerId');
  }
  const existing = await V3RunModel.findOne({ intakeId: args.intakeId }).lean<LeanRun>();
  if (existing) {
    if (String(existing.userId) !== args.userId) throw new RunTakenError();
    return { run: toSnapshot(existing), created: false };
  }
  const now = args.now ?? new Date();
  try {
    const doc = await V3RunModel.create({
      intakeId: args.intakeId,
      userId: args.userId,
      stage: args.stage,
      ledgerStore: args.ledgerStore,
      ledgerId: args.ledgerId,
      expiresAt: expiry(now),
    });
    logger.info(
      { runDocId: String(doc._id), intakeId: args.intakeId, stage: args.stage },
      'T-685: v3 run opened',
    );
    return { run: toSnapshot(doc.toObject() as unknown as LeanRun), created: true };
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    // Two opens at once: the other one won.
    const won = await V3RunModel.findOne({ intakeId: args.intakeId }).lean<LeanRun>();
    if (!won || String(won.userId) !== args.userId) throw new RunTakenError();
    return { run: toSnapshot(won), created: false };
  }
}

// ── Lease (answers §5) ──────────────────────────────────────────────────────

/**
 * Take the run's lease for `owner`: only when no lease is live or `owner`
 * already holds it. A live lease of another owner throws RunLeaseHeldError
 * (409 "Draft already in progress"). Does not change `rev`.
 */
export async function takeLease(
  intakeId: string,
  userId: string,
  owner: string,
  now: Date = new Date(),
): Promise<V3RunSnapshot> {
  assertIds(intakeId, userId);
  assertOwner(owner);
  const doc = await V3RunModel.findOneAndUpdate(
    {
      intakeId,
      userId,
      $or: [
        { leaseUntil: { $exists: false } },
        { leaseUntil: null },
        { leaseUntil: { $lt: now } },
        { leaseOwner: owner },
      ],
    },
    { $set: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + V3_RUN_LEASE_MS) } },
    { new: true },
  ).lean<LeanRun>();
  if (doc) return toSnapshot(doc);
  const exists = await V3RunModel.exists({ intakeId, userId });
  throw exists ? new RunLeaseHeldError() : new RunNotFoundError();
}

/** Push the lease to now + 60 s while `owner` holds it. False when it no longer does. */
export async function renewLease(
  intakeId: string,
  userId: string,
  owner: string,
  now: Date = new Date(),
): Promise<boolean> {
  assertIds(intakeId, userId);
  assertOwner(owner);
  const res = await V3RunModel.updateOne(
    { intakeId, userId, leaseOwner: owner },
    { $set: { leaseUntil: new Date(now.getTime() + V3_RUN_LEASE_MS) } },
  );
  return res.matchedCount === 1;
}

/** Give the lease up, only if `owner` holds it. */
export async function releaseLease(intakeId: string, userId: string, owner: string): Promise<void> {
  assertIds(intakeId, userId);
  assertOwner(owner);
  await V3RunModel.updateOne(
    { intakeId, userId, leaseOwner: owner },
    { $unset: { leaseOwner: '', leaseUntil: '' } },
  );
}

// ── Attempts (answers §1, §5) ───────────────────────────────────────────────

/** The generate steps a new runId starts afresh (everything but the intake turns). */
function generateOutputKeys(run: V3RunSnapshot): string[] {
  return (Object.keys(run.outputs) as StepId[])
    .filter((id) => parseStepId(id)?.kind !== 'intake.turn')
    .map(stepKey);
}

/**
 * Record a generate attempt (resolveRun's runId/runSequence). Idempotent for
 * the attempt already last. An earlier attempt still `running` becomes
 * `abandoned`. A runId new to this run (resolveRun's "completed → new run")
 * is a new run for budget and replay (answers §8): its generate step outputs
 * are cleared and its cap is unset until `fixCap`; `round` → 0,
 * `settled` → false. The same runId with a new runSequence is a resume: the
 * outputs and the cap stay (no fresh budget).
 */
export async function startAttempt(
  run: V3RunSnapshot,
  owner: string,
  attempt: { runId: string; runSequence: number },
  now: Date = new Date(),
): Promise<V3RunSnapshot> {
  if (typeof attempt.runId !== 'string' || attempt.runId === '' || attempt.runId.length > 100) {
    throw new RunInputError('runId');
  }
  if (!wholeNumber(attempt.runSequence, 1)) throw new RunInputError('runSequence');
  const last = currentAttempt(run);
  if (last && last.runId === attempt.runId && last.runSequence === attempt.runSequence) return run;
  if (run.attempts.length >= V3_RUN_MAX_ATTEMPTS) throw new RunAttemptsFullError();
  const attempts: IV3RunAttempt[] = [
    ...run.attempts.map((a) =>
      a.outcome === 'running' ? { ...a, outcome: 'abandoned' as const, endedAt: now } : { ...a },
    ),
    {
      runId: attempt.runId,
      runSequence: attempt.runSequence,
      startedAt: now,
      outcome: 'running',
    },
  ];
  const newRun = !last || last.runId !== attempt.runId;
  const $unset: Record<string, ''> = {};
  const $set: Record<string, unknown> = { attempts };
  if (newRun) {
    for (const k of generateOutputKeys(run)) $unset[`outputs.${k}`] = '';
    $unset.capPaise = '';
    $unset.inkQuoted = '';
    $set.capBasePaise = run.costPaiseSoFar;
    $set.round = 0;
    $set.settled = false;
  }
  const next = await guardedWrite(run, owner, { $set, $unset }, {}, now);
  logger.info(
    {
      runDocId: run.id,
      runId: attempt.runId,
      runSequence: attempt.runSequence,
      attempts: attempts.length,
      newRun,
    },
    'T-685: v3 run attempt started',
  );
  return next;
}

// ── Cost and cap (answers §7, §8) ───────────────────────────────────────────

/**
 * ai.cost_cap_paise_per_ink (optional AppSetting): a whole number of paise,
 * 1..1,000,000. Missing, invalid or unreadable: the code default 900 (not
 * fail-closed; Vikram's signed number). An invalid value logs the key only.
 */
export async function getCostCapPaisePerInk(): Promise<number> {
  const key = APP_SETTING_KEYS.COST_CAP_PAISE_PER_INK;
  let raw: string;
  try {
    raw = (await getAppSetting(key)).trim();
  } catch (err) {
    if (!(err instanceof AppSettingMissingError)) {
      logger.warn({ setting: key }, 'T-685: cost cap setting unreadable; using default');
    }
    return COST_CAP_PAISE_PER_INK_DEFAULT;
  }
  const n = /^\d{1,7}$/.test(raw) ? Number(raw) : NaN;
  if (Number.isInteger(n) && n >= 1 && n <= COST_CAP_PAISE_PER_INK_MAX) return n;
  logger.warn(
    { setting: key },
    'T-685: cost cap setting is not a whole number of paise; using default',
  );
  return COST_CAP_PAISE_PER_INK_DEFAULT;
}

/**
 * Fix the cap when the hold is taken: capPaise = per-Ink cap × inkQuoted,
 * capBasePaise = the cost so far (intake cost does not count against the
 * cap). Once fixed for this runId it is never changed by a resume (no fresh
 * budget): the run is returned unchanged. Races with a concurrent cost add
 * (RunVersionRaceError), so the base is exact.
 */
export async function fixCap(
  run: V3RunSnapshot,
  owner: string,
  inkQuoted: number,
  now: Date = new Date(),
): Promise<V3RunSnapshot> {
  if (!wholeNumber(inkQuoted, 1)) throw new RunInputError('inkQuoted');
  if (run.capPaise !== undefined) return run;
  const perInk = await getCostCapPaisePerInk();
  const capPaise = perInk * inkQuoted;
  const next = await guardedWrite(
    run,
    owner,
    { $set: { capPaise, capBasePaise: run.costPaiseSoFar, inkQuoted } },
    { costPaiseSoFar: run.costPaiseSoFar },
    now,
  );
  logger.info({ runDocId: run.id, inkQuoted, capPaise }, 'T-685: v3 run cost cap fixed');
  return next;
}

/** Add a model call's cost (paise) to the run, atomically. Null when the intake has no run. */
export async function addCost(
  intakeId: string,
  userId: string,
  costPaise: number,
  now: Date = new Date(),
): Promise<V3RunSnapshot | null> {
  assertIds(intakeId, userId);
  if (!paise(costPaise)) throw new RunInputError('costPaise');
  if (costPaise === 0) return findRun(intakeId, userId);
  return incCounters(intakeId, userId, { costPaiseSoFar: costPaise }, {}, now);
}

/** Paise spent against the cap: everything since the cap was fixed. */
export function capSpentPaise(run: Pick<V3RunSnapshot, 'costPaiseSoFar' | 'capBasePaise'>): number {
  return Math.max(0, run.costPaiseSoFar - run.capBasePaise);
}

/**
 * Before a model call (answers §7): true when spent + projected > cap. False
 * while no cap is fixed (intake: the Extractor's own caps guard it).
 */
export function wouldExceedCap(
  run: Pick<V3RunSnapshot, 'costPaiseSoFar' | 'capBasePaise' | 'capPaise'>,
  projectedPaise: number,
): boolean {
  if (run.capPaise === undefined) return false;
  if (!paise(projectedPaise)) throw new RunInputError('projectedPaise');
  return capSpentPaise(run) + projectedPaise > run.capPaise;
}

/** After a model call (answers §7): true when spent >= cap. False while no cap is fixed. */
export function capReached(
  run: Pick<V3RunSnapshot, 'costPaiseSoFar' | 'capBasePaise' | 'capPaise'>,
): boolean {
  if (run.capPaise === undefined) return false;
  return capSpentPaise(run) >= run.capPaise;
}

// ── Extractor counters (answers §10) ────────────────────────────────────────

/** The run's persisted Extractor call count, or null when the intake has no run. */
export async function getExtractorCalls(
  intakeId: string,
  userId: string,
): Promise<{ calls: number; degraded: boolean } | null> {
  const run = await findRun(intakeId, userId);
  return run ? { calls: run.extractorCalls, degraded: run.extractorDegraded } : null;
}

/**
 * Count one Extractor call (atomic `$inc`); `degraded: true` marks the run
 * degraded (it is never cleared here). Null when the intake has no run.
 */
export async function recordExtractorCall(
  intakeId: string,
  userId: string,
  opts: { degraded?: boolean } = {},
  now: Date = new Date(),
): Promise<{ calls: number; degraded: boolean } | null> {
  assertIds(intakeId, userId);
  const run = await incCounters(
    intakeId,
    userId,
    { extractorCalls: 1 },
    opts.degraded === true ? { extractorDegraded: true } : {},
    now,
  );
  return run ? { calls: run.extractorCalls, degraded: run.extractorDegraded } : null;
}

// ── Status ──────────────────────────────────────────────────────────────────

/** Move a run between the open statuses (intake → confirmed → generating). */
export async function setRunStatus(
  run: V3RunSnapshot,
  owner: string,
  status: Extract<V3RunStatus, 'intake' | 'confirmed' | 'generating'>,
  now: Date = new Date(),
): Promise<V3RunSnapshot> {
  if (status !== 'intake' && status !== 'confirmed' && status !== 'generating') {
    throw new RunInputError('status');
  }
  if (run.status === status) return run;
  return guardedWrite(run, owner, { $set: { status } }, {}, now);
}

/**
 * End the run's current attempt: `delivered` (with the saved Document's id,
 * which unsets `expiresAt`, and `settled`), `failed` or `capped` (Ink is
 * released by the caller; `deliver` never runs). The last attempt's outcome
 * and `endedAt` are set to match.
 */
export async function finishRun(
  run: V3RunSnapshot,
  owner: string,
  end:
    | { status: 'delivered'; documentId: string; settled: boolean }
    | { status: 'failed' | 'capped' },
  now: Date = new Date(),
): Promise<V3RunSnapshot> {
  const $set: Record<string, unknown> = { status: end.status };
  if (end.status === 'delivered') {
    if (typeof end.documentId !== 'string' || !mongoose.isValidObjectId(end.documentId)) {
      throw new RunInputError('documentId');
    }
    $set.documentId = end.documentId;
    $set.settled = end.settled === true;
  } else if (end.status !== 'failed' && end.status !== 'capped') {
    throw new RunInputError('status');
  }
  if (run.attempts.length > 0) {
    const outcome: V3AttemptOutcome = end.status;
    $set.attempts = run.attempts.map((a, i) =>
      i === run.attempts.length - 1 ? { ...a, outcome, endedAt: now } : { ...a },
    );
  }
  const next = await guardedWrite(run, owner, { $set }, {}, now);
  logger.info(
    { runDocId: run.id, status: end.status, step: run.step, costPaiseSoFar: run.costPaiseSoFar },
    'T-685: v3 run finished',
  );
  return next;
}

// ── Steps (answers §3) ──────────────────────────────────────────────────────

export type BeginDecision =
  /** Run the step now. `rerun`: a crashed (`running`) or failed step run again, at our cost. */
  | { action: 'run'; run: V3RunSnapshot; rerun: boolean; previous?: V3StepOutput }
  /** Replay the stored output (readStepPayload / `ref`); nothing was written. */
  | { action: 'replay'; run: V3RunSnapshot; output: V3StepOutput }
  /** An intake turn already done: the ledger version is its state; nothing to do. */
  | { action: 'skip'; run: V3RunSnapshot; output: V3StepOutput }
  /**
   * Fail the run safe (release Ink, `event: error` run_failed, one Sentry
   * event): the step was found running a second time, failed in this
   * attempt, or failed again after its one retry. The step is stored failed.
   */
  | {
      action: 'fail_safe';
      run: V3RunSnapshot;
      reason: 'rerun_exhausted' | 'failed_terminal' | 'retry_exhausted';
    };

/**
 * Begin a step by the answers §3 rules (stages.ts stepPolicy):
 * - not begun: stored `running`, run it;
 * - `done`: replay (`replay`), skip (`ledger`), replay at the same ledger
 *   version else re-run (`replay_same_version`), replay within the same
 *   attempt else run afresh (`per_attempt`), or re-run keeping `ref` (`rerun`).
 *   A done step whose payload was too large to seal and has no `ref` runs again;
 * - `running` (a crash): re-run once (`reruns` 0 → 1); found running again
 *   (`reruns >= 1`): fail safe. A `per_attempt` step running in an earlier
 *   attempt runs afresh;
 * - `failed`: terminal in the attempt it failed in; a new attempt may re-run
 *   it once (`retries` 0 → 1), then fail safe.
 * Writes are rev-guarded and need the lease.
 */
export async function beginStep(
  run: V3RunSnapshot,
  owner: string,
  stepId: StepId,
  opts: { ledgerVersion: number; now?: Date },
): Promise<BeginDecision> {
  assertStep(stepId);
  if (!wholeNumber(opts.ledgerVersion, 0)) throw new RunInputError('ledgerVersion');
  const now = opts.now ?? new Date();
  const policy = stepPolicy(stepId);
  const existing = run.outputs[stepId];
  const attempt = currentAttempt(run);

  const start = async (
    counters: { reruns: number; retries: number },
    keepRef?: string,
  ): Promise<V3RunSnapshot> => {
    const output: IV3StepOutput = {
      status: 'running',
      ledgerVersion: opts.ledgerVersion,
      startedAt: now,
      ...(attempt ? { runId: attempt.runId, runSequence: attempt.runSequence } : {}),
      reruns: counters.reruns,
      retries: counters.retries,
      ...(keepRef ? { ref: keepRef } : {}),
    };
    const parsed = parseStepId(stepId);
    return guardedWrite(
      run,
      owner,
      {
        $set: {
          [`outputs.${stepKey(stepId)}`]: output,
          step: stepId,
          ledgerVersion: opts.ledgerVersion,
          ...(parsed?.kind === 'repair' ? { round: parsed.n } : {}),
        },
      },
      {},
      now,
    );
  };
  const failSafe = async (
    reason: 'rerun_exhausted' | 'failed_terminal' | 'retry_exhausted',
  ): Promise<BeginDecision> => {
    const prev = existing as V3StepOutput;
    let next = run;
    if (prev.status !== 'failed' || prev.reason !== reason) {
      const { stepId: _s, ...stored } = prev;
      void _s;
      next = await guardedWrite(
        run,
        owner,
        {
          $set: {
            [`outputs.${stepKey(stepId)}`]: { ...stored, status: 'failed', endedAt: now, reason },
          },
        },
        {},
        now,
      );
    }
    logger.warn({ runDocId: run.id, step: stepId, reason }, 'T-685: v3 run step fails safe');
    return { action: 'fail_safe', run: next, reason };
  };

  if (!existing) {
    return { action: 'run', run: await start({ reruns: 0, retries: 0 }), rerun: false };
  }

  if (existing.status === 'done') {
    const fresh = { reruns: 0, retries: 0 };
    switch (policy) {
      case 'ledger':
        return { action: 'skip', run, output: existing };
      case 'rerun':
        return {
          action: 'run',
          run: await start(fresh, existing.ref),
          rerun: false,
          previous: existing,
        };
      case 'replay_same_version':
        if (existing.ledgerVersion !== opts.ledgerVersion) {
          return { action: 'run', run: await start(fresh), rerun: false, previous: existing };
        }
        break;
      case 'per_attempt':
        if (!sameAttempt(existing, attempt)) {
          return { action: 'run', run: await start(fresh), rerun: false, previous: existing };
        }
        break;
      default:
        break;
    }
    // Too large to seal and nothing saved to replay from: run it again.
    if (existing.sealedOmitted && !existing.ref) {
      return { action: 'run', run: await start(fresh), rerun: false, previous: existing };
    }
    return { action: 'replay', run, output: existing };
  }

  if (existing.status === 'running') {
    if (policy === 'per_attempt' && !sameAttempt(existing, attempt)) {
      return {
        action: 'run',
        run: await start({ reruns: 0, retries: 0 }),
        rerun: false,
        previous: existing,
      };
    }
    if (existing.reruns >= 1) return failSafe('rerun_exhausted');
    logger.info({ runDocId: run.id, step: stepId }, 'T-685: v3 run step re-run after a crash');
    return {
      action: 'run',
      run: await start({ reruns: existing.reruns + 1, retries: existing.retries }, existing.ref),
      rerun: true,
      previous: existing,
    };
  }

  // failed
  if (sameAttempt(existing, attempt)) return failSafe('failed_terminal');
  if (policy === 'per_attempt') {
    return {
      action: 'run',
      run: await start({ reruns: 0, retries: 0 }),
      rerun: false,
      previous: existing,
    };
  }
  if (existing.retries >= 1) return failSafe('retry_exhausted');
  return {
    action: 'run',
    run: await start({ reruns: 0, retries: existing.retries + 1 }, existing.ref),
    rerun: true,
    previous: existing,
  };
}

function cleanUsage(u: IV3StepUsage | undefined): IV3StepUsage | undefined {
  if (!u) return undefined;
  const n = (v: unknown): number | undefined => (wholeNumber(v, 0) ? v : undefined);
  const inputTokens = n(u.inputTokens);
  const outputTokens = n(u.outputTokens);
  if (inputTokens === undefined || outputTokens === undefined) throw new RunInputError('usage');
  const out: IV3StepUsage = { inputTokens, outputTokens };
  const cc = n(u.cacheCreationInputTokens);
  const cr = n(u.cacheReadInputTokens);
  const calls = n(u.llmCalls);
  if (cc !== undefined) out.cacheCreationInputTokens = cc;
  if (cr !== undefined) out.cacheReadInputTokens = cr;
  if (calls !== undefined) out.llmCalls = calls;
  return out;
}

/**
 * Complete a running step. `payload` (any JSON: draft text, findings, a
 * preflight result) is sealed with the T-115a helper and key, never stored
 * plain. Over 2 MB for this output, or 12 MB for the document's sealed
 * outputs together, nothing is sealed (`sealedOmitted: 'too_large'`): the
 * step replays from `ref` once a Document is saved, else runs again.
 * `costPaise` is this step's own record; the run's sum is added by `addCost`
 * after each model call, never here.
 */
export async function completeStep(
  run: V3RunSnapshot,
  owner: string,
  stepId: StepId,
  result: {
    ledgerVersion: number;
    payload?: unknown;
    ref?: string;
    hash?: string;
    usage?: IV3StepUsage;
    costPaise?: number;
  },
  now: Date = new Date(),
): Promise<V3RunSnapshot> {
  assertStep(stepId);
  const existing = run.outputs[stepId];
  if (!existing || existing.status !== 'running') throw new RunStepStateError();
  if (!wholeNumber(result.ledgerVersion, 0)) throw new RunInputError('ledgerVersion');
  if (result.ref !== undefined && !mongoose.isValidObjectId(result.ref)) {
    throw new RunInputError('ref');
  }
  if (result.hash !== undefined && !/^[a-f0-9]{64}$/.test(result.hash)) {
    throw new RunInputError('hash');
  }
  if (result.costPaise !== undefined && !paise(result.costPaise)) {
    throw new RunInputError('costPaise');
  }
  const usage = cleanUsage(result.usage);

  let sealed: string | undefined;
  let sealedOmitted: 'too_large' | undefined;
  if (result.payload !== undefined) {
    const s = encrypt(JSON.stringify(result.payload));
    const bytes = Buffer.byteLength(s, 'utf8');
    const others = (Object.values(run.outputs) as V3StepOutput[])
      .filter((o) => o.stepId !== stepId)
      .reduce((n, o) => n + sealedBytes(o), 0);
    if (bytes > LEDGER_V3_MAX_SEALED_BYTES || others + bytes > LEDGER_V3_MAX_DOC_SEALED_BYTES) {
      sealedOmitted = 'too_large';
      logger.warn(
        { runDocId: run.id, step: stepId, bytes },
        'T-685: v3 run output too large to seal',
      );
    } else {
      sealed = s;
    }
  }

  const { stepId: _s, reason: _r, sealed: _old, sealedOmitted: _oldOmit, ...kept } = existing;
  void _s;
  void _r;
  void _old;
  void _oldOmit;
  const ref = result.ref ?? kept.ref;
  const output: IV3StepOutput = {
    ...kept,
    status: 'done',
    ledgerVersion: result.ledgerVersion,
    endedAt: now,
    ...(usage ? { usage } : {}),
    ...(result.costPaise !== undefined ? { costPaise: result.costPaise } : {}),
    ...(ref ? { ref } : {}),
    ...(result.hash ? { hash: result.hash } : {}),
    ...(sealed ? { sealed } : {}),
    ...(sealedOmitted ? { sealedOmitted } : {}),
  };
  return guardedWrite(
    run,
    owner,
    { $set: { [`outputs.${stepKey(stepId)}`]: output, ledgerVersion: result.ledgerVersion } },
    {},
    now,
  );
}

/** Fail a running step with a reason code (lower-case code only, never text). */
export async function failStep(
  run: V3RunSnapshot,
  owner: string,
  stepId: StepId,
  reason: string,
  now: Date = new Date(),
): Promise<V3RunSnapshot> {
  assertStep(stepId);
  if (typeof reason !== 'string' || !REASON_CODE_RE.test(reason)) throw new RunInputError('reason');
  const existing = run.outputs[stepId];
  if (!existing || existing.status !== 'running') throw new RunStepStateError();
  const { stepId: _s, ...stored } = existing;
  void _s;
  const next = await guardedWrite(
    run,
    owner,
    {
      $set: {
        [`outputs.${stepKey(stepId)}`]: { ...stored, status: 'failed', endedAt: now, reason },
      },
    },
    {},
    now,
  );
  logger.info({ runDocId: run.id, step: stepId, reason }, 'T-685: v3 run step failed');
  return next;
}

/** A step's sealed payload, opened; undefined when it has none. */
export function readStepPayload(output: Pick<IV3StepOutput, 'sealed'> | undefined): unknown {
  if (!output?.sealed) return undefined;
  try {
    return JSON.parse(decrypt(output.sealed)) as unknown;
  } catch {
    // Fixed text only: a parse error message could carry a snippet of the plaintext.
    throw new RunSealedUnreadableError();
  }
}
