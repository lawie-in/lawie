/**
 * T-685: the v3 run document, `V3Run` in `v3_runs` (Arjun, T-685 answers §2).
 *
 * One document per intake (key `intakeId`, answers §1). The orchestrator
 * (ADR role A) owns it; only `run.service.ts` reads or writes it.
 *
 * Encryption (T-115a helper and key, as the T-682 ledger): every step's
 * output payload is in `outputs[step].sealed` = encrypt(JSON.stringify(payload)).
 * Draft text (`draft`, `repair.N`, `render`) and any other step content is
 * only ever there. Plaintext fields are ids, keys, reasons, counts,
 * timestamps and paise only (T-682 condition 5).
 * KEY ROTATION: a rotation of the encryption key must re-seal this collection
 * too (with `factledgers` and `factledgers_v3`).
 *
 * Size: one output's sealed payload at most LEDGER_V3_MAX_SEALED_BYTES (2 MB),
 * one document's sealed payloads together at most LEDGER_V3_MAX_DOC_SEALED_BYTES
 * (12 MB). Over either cap the step keeps no `sealed` (`sealedOmitted`) and is
 * replayed from `ref` (the Document id, once saved) or re-run.
 *
 * Retention (T-187 Addendum 5, same data class as the ledger): `expiresAt` =
 * last update + 30 days, TTL index; unset when a Document is saved from the
 * run (`documentId`). Fixture rows (golden-set user) are synthetic data and
 * have the same TTL.
 *
 * Step ids contain dots (`intake.turn.N`, `repair.N`), which a Mongo field
 * name cannot; `outputs` map keys are stored with ':' for '.' (stepKey /
 * stepIdOfKey). Callers only ever see step ids.
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

import { fixtureOriginPlugin } from '../run-origin';

import type { StepId } from './stages';

export const V3_RUN_SCHEMA_VERSION = 1;
/** T-187 Addendum 5: an intake never drafted is kept 30 days after its last update. */
export const V3_RUN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Attempts per run (a sanity bound, so `attempts[]` cannot grow without limit). */
export const V3_RUN_MAX_ATTEMPTS = 50;

export const V3_RUN_STATUSES = [
  'intake',
  'confirmed',
  'generating',
  'delivered',
  'failed',
  'capped',
] as const;
export type V3RunStatus = (typeof V3_RUN_STATUSES)[number];

export const V3_STEP_STATUSES = ['done', 'running', 'failed'] as const;
export type V3StepStatus = (typeof V3_STEP_STATUSES)[number];

export const V3_ATTEMPT_OUTCOMES = [
  'running',
  'delivered',
  'failed',
  'capped',
  'abandoned',
] as const;
export type V3AttemptOutcome = (typeof V3_ATTEMPT_OUTCOMES)[number];

/** The v3 stages a run doc can start at (answers §4: the orchestrator owns generate from 2). */
export const V3_RUN_STAGES = [2, 3] as const;
export type V3RunStage = (typeof V3_RUN_STAGES)[number];

/** A reason code: lower-case word characters only, so no free text can be stored as one. */
export const REASON_CODE_RE = /^[a-z0-9_.:-]{1,64}$/;

/** Token counts of a step (numbers only). */
export interface IV3StepUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  llmCalls?: number;
}

export interface IV3StepOutput {
  status: V3StepStatus;
  /** The ledger version the step ran at. */
  ledgerVersion: number;
  startedAt: Date;
  endedAt?: Date;
  /** The attempt the step last began in (runId/runSequence of attempts[]). Ids only. */
  runId?: string;
  runSequence?: number;
  /** Times a step found `running` (a crash) was re-run (answers §3: at most 1). */
  reruns: number;
  /** Times a step found `failed` was re-run by a new attempt (answers §3: at most 1). */
  retries: number;
  usage?: IV3StepUsage;
  /** This step's own model cost, for the record. The run's sum is `costPaiseSoFar`. */
  costPaise?: number;
  /** The saved Document's id, when there is one. */
  ref?: string;
  /** A hex sha256 digest the caller supplies (e.g. of a ledger state), never of short text. */
  hash?: string;
  /** encrypt(JSON.stringify(payload)). */
  sealed?: string;
  /** Why `sealed` is absent although the step produced a payload. */
  sealedOmitted?: 'too_large';
  /** A failed step's reason code. */
  reason?: string;
}

export interface IV3RunAttempt {
  runId: string;
  runSequence: number;
  startedAt: Date;
  endedAt?: Date;
  outcome: V3AttemptOutcome;
}

export interface IV3Run extends Document {
  schemaVersion: number;
  intakeId: string;
  userId: Types.ObjectId;
  runType: 'user' | 'fixture';
  /** The v3 stage the run started at; never changes. */
  stage: V3RunStage;
  /** T-682 condition 7: the ledger store and id the run started on; never change. */
  ledgerStore: 'v3' | 'v2';
  ledgerId: string;
  /** Optimistic version of this document: every rev-guarded write is `rev: expected` → `$inc`. */
  rev: number;
  /** The step last begun. */
  step?: string;
  /** The ledger version of the last step begun or completed. */
  ledgerVersion: number;
  /** Keyed by stepKey(stepId). */
  outputs: Map<string, IV3StepOutput>;
  attempts: IV3RunAttempt[];
  /** All model cost of the run in paise, intake included, summed across resumes. */
  costPaiseSoFar: number;
  /** The cap for the current runId: cost_cap_paise_per_ink × inkQuoted; unset before the hold. */
  capPaise?: number;
  /** costPaiseSoFar when capPaise was fixed: cost before the hold does not count against the cap. */
  capBasePaise: number;
  inkQuoted?: number;
  /** §14.1: optional and unset in T-685 (the Extractor's counts are not copied). */
  extractorCalls?: number;
  extractorDegraded?: boolean;
  /** The current repair round (0 = none). */
  round: number;
  status: V3RunStatus;
  /** Ink settled for the delivered attempt. */
  settled: boolean;
  /** The Document saved from the run. Set once; unsets `expiresAt`. */
  documentId?: string;
  leaseOwner?: string;
  leaseUntil?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** The storage key of a step id ('.' is not allowed in a Mongo field name). */
export function stepKey(id: StepId): string {
  return id.replace(/\./g, ':');
}

/** The step id of a storage key. */
export function stepIdOfKey(key: string): string {
  return key.replace(/:/g, '.');
}

const UsageSchema = new Schema<IV3StepUsage>(
  {
    inputTokens: { type: Number, required: true, min: 0 },
    outputTokens: { type: Number, required: true, min: 0 },
    cacheCreationInputTokens: { type: Number, min: 0 },
    cacheReadInputTokens: { type: Number, min: 0 },
    llmCalls: { type: Number, min: 0 },
  },
  { _id: false },
);

const StepOutputSchema = new Schema<IV3StepOutput>(
  {
    status: { type: String, enum: V3_STEP_STATUSES, required: true },
    ledgerVersion: { type: Number, required: true, min: 0 },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    runId: { type: String, maxlength: 100 },
    runSequence: { type: Number, min: 1 },
    reruns: { type: Number, required: true, min: 0, default: 0 },
    retries: { type: Number, required: true, min: 0, default: 0 },
    usage: { type: UsageSchema },
    costPaise: { type: Number, min: 0 },
    ref: { type: String, maxlength: 100 },
    hash: { type: String, match: /^[a-f0-9]{64}$/ },
    sealed: { type: String },
    sealedOmitted: { type: String, enum: ['too_large'] },
    reason: { type: String, match: REASON_CODE_RE },
  },
  { _id: false },
);

const AttemptSchema = new Schema<IV3RunAttempt>(
  {
    runId: { type: String, required: true, maxlength: 100 },
    runSequence: { type: Number, required: true, min: 1 },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    outcome: { type: String, enum: V3_ATTEMPT_OUTCOMES, required: true },
  },
  { _id: false },
);

const V3RunSchema = new Schema<IV3Run>(
  {
    schemaVersion: { type: Number, required: true, default: V3_RUN_SCHEMA_VERSION },
    intakeId: { type: String, required: true, maxlength: 100 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    runType: { type: String, enum: ['user', 'fixture'], required: true, default: 'user' },
    stage: { type: Number, enum: V3_RUN_STAGES, required: true },
    ledgerStore: { type: String, enum: ['v3', 'v2'], required: true },
    ledgerId: { type: String, required: true, maxlength: 100 },
    rev: { type: Number, required: true, min: 0, default: 0 },
    step: { type: String, maxlength: 32 },
    ledgerVersion: { type: Number, required: true, min: 0, default: 0 },
    outputs: { type: Map, of: StepOutputSchema, default: () => new Map() },
    attempts: { type: [AttemptSchema], default: [] },
    costPaiseSoFar: { type: Number, required: true, min: 0, default: 0 },
    capPaise: { type: Number, min: 0 },
    capBasePaise: { type: Number, required: true, min: 0, default: 0 },
    inkQuoted: { type: Number, min: 1 },
    extractorCalls: { type: Number, min: 0 },
    extractorDegraded: { type: Boolean },
    round: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, enum: V3_RUN_STATUSES, required: true, default: 'intake' },
    settled: { type: Boolean, required: true, default: false },
    documentId: { type: String, maxlength: 100 },
    leaseOwner: { type: String, maxlength: 100 },
    leaseUntil: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

// T-147e: a run written for the golden-set user is always 'fixture'.
V3RunSchema.plugin(fixtureOriginPlugin('runType'));

// One run per intake (answers §1); the lookup is always intakeId + userId.
V3RunSchema.index({ intakeId: 1 }, { unique: true });
// The user's own runs: account export and erase.
V3RunSchema.index({ userId: 1, createdAt: -1 });
// A generate attempt's run, by the Ink hold key.
V3RunSchema.index({ 'attempts.runId': 1 });
// T-187: TTL on expiresAt (unset once a Document is saved).
V3RunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const V3RunModel = mongoose.model<IV3Run>('V3Run', V3RunSchema, 'v3_runs');
