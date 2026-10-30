/**
 * T-685: the v3 run's stage names and step ids (Arjun, T-685 answers §3 and §9).
 *
 * Not the same thing as `stage.ts`: that file reads `feature.drafting_v3_stage`
 * (the rollout number 0-3). This file is the closed list of SSE stage names a
 * v3 run emits and the step ids its run document is keyed by.
 *
 * The stage names live here, not in packages/shared: root config is one lead
 * at a time and T-538 will move them (answers §9).
 *
 * Step ids are fixed strings in a fixed order per run; `intake.turn.N` and
 * `repair.N` repeat. Every step has one replay policy (answers §3), read by
 * run.service.ts `beginStep`.
 */

// ── SSE stage names (answers §9) ────────────────────────────────────────────

/** The closed list of `event: stage` names. `round` is sent only with `repair`. */
export const V3_STAGE_NAMES = [
  'intake',
  'preflight',
  'draft',
  'verify',
  'repair',
  'render',
  'done',
] as const;

export type V3StageName = (typeof V3_STAGE_NAMES)[number];

export function isV3StageName(v: unknown): v is V3StageName {
  return (V3_STAGE_NAMES as readonly unknown[]).includes(v);
}

// ── Step ids (answers §3) ───────────────────────────────────────────────────

/** Repair rounds per attempt: N = 1, 2. */
export const MAX_REPAIR_ROUNDS = 2;
/** The highest intake turn number a step id may carry (a sanity bound, not a product rule). */
export const MAX_INTAKE_TURN = 999;

export const STEP = {
  CONFIRM: 'confirm',
  DERIVE: 'derive',
  HOLD: 'hold',
  PREFLIGHT: 'preflight',
  DRAFT: 'draft',
  VERIFY: 'verify',
  RENDER: 'render',
  DELIVER: 'deliver',
} as const;

export type FixedStepId = (typeof STEP)[keyof typeof STEP];
export type IntakeTurnStepId = `intake.turn.${number}`;
export type RepairStepId = `repair.${number}`;
export type StepId = FixedStepId | IntakeTurnStepId | RepairStepId;

const FIXED: readonly string[] = Object.values(STEP);
const INTAKE_TURN_RE = /^intake\.turn\.([1-9]\d{0,2})$/;
const REPAIR_RE = /^repair\.([1-9]\d?)$/;

/** `intake.turn.N`, N a whole number 1..MAX_INTAKE_TURN. */
export function intakeTurnStep(n: number): IntakeTurnStepId {
  if (!Number.isInteger(n) || n < 1 || n > MAX_INTAKE_TURN) {
    throw new RangeError('intake turn out of range');
  }
  return `intake.turn.${n}`;
}

/** `repair.N`, N a whole number 1..MAX_REPAIR_ROUNDS. */
export function repairStep(n: number): RepairStepId {
  if (!Number.isInteger(n) || n < 1 || n > MAX_REPAIR_ROUNDS) {
    throw new RangeError('repair round out of range');
  }
  return `repair.${n}`;
}

export type ParsedStep =
  | { kind: FixedStepId }
  | { kind: 'intake.turn'; n: number }
  | { kind: 'repair'; n: number };

/** The step id's kind and number, or null when it is not a Phase 1 step id. */
export function parseStepId(id: unknown): ParsedStep | null {
  if (typeof id !== 'string') return null;
  if (FIXED.includes(id)) return { kind: id as FixedStepId };
  const t = INTAKE_TURN_RE.exec(id);
  if (t) {
    const n = Number(t[1]);
    return n <= MAX_INTAKE_TURN ? { kind: 'intake.turn', n } : null;
  }
  const r = REPAIR_RE.exec(id);
  if (r) {
    const n = Number(r[1]);
    return n <= MAX_REPAIR_ROUNDS ? { kind: 'repair', n } : null;
  }
  return null;
}

export function isStepId(id: unknown): id is StepId {
  return parseStepId(id) !== null;
}

/** The generate steps in their fixed order (intake turns come before; `repair.N` as needed). */
export const GENERATE_STEP_ORDER: readonly StepId[] = [
  STEP.CONFIRM,
  STEP.DERIVE,
  STEP.HOLD,
  STEP.PREFLIGHT,
  STEP.DRAFT,
  STEP.VERIFY,
  ...Array.from({ length: MAX_REPAIR_ROUNDS }, (_, i) => repairStep(i + 1)),
  STEP.RENDER,
  STEP.DELIVER,
];

// ── Replay policy (answers §3 table) ────────────────────────────────────────

/**
 * What a step found `done` does on resume:
 * - `ledger`: never replayed; the ledger version is the state (intake turns).
 *   A done turn is skipped.
 * - `replay`: replay the stored output (confirm, preflight, draft, verify,
 *   repair.N, render). Text outputs replay from `sealed`.
 * - `replay_same_version`: replay when done at the same ledger version, else
 *   re-run (derive: free, code).
 * - `per_attempt`: never replayed across attempts; each attempt takes its own
 *   (hold). Within one attempt a done hold replays, so one attempt never takes
 *   two holds.
 * - `rerun`: re-run, idempotent on `ref` (deliver).
 */
export type StepPolicy = 'ledger' | 'replay' | 'replay_same_version' | 'per_attempt' | 'rerun';

export function stepPolicy(id: StepId): StepPolicy {
  const p = parseStepId(id);
  if (!p) throw new RangeError('not a step id');
  switch (p.kind) {
    case 'intake.turn':
      return 'ledger';
    case STEP.DERIVE:
      return 'replay_same_version';
    case STEP.HOLD:
      return 'per_attempt';
    case STEP.DELIVER:
      return 'rerun';
    default:
      return 'replay';
  }
}

/** Steps whose output is draft text: stored sealed so a resume does not pay for it again. */
export function isTextStep(id: StepId): boolean {
  const p = parseStepId(id);
  return p !== null && (p.kind === STEP.DRAFT || p.kind === 'repair' || p.kind === STEP.RENDER);
}

/**
 * The SSE stage a step reports, or null for steps with no stage event of
 * their own (confirm, derive, hold). `round` is the repair round, else absent.
 */
export function stageForStep(id: StepId): { stage: V3StageName; round?: number } | null {
  const p = parseStepId(id);
  if (!p) return null;
  switch (p.kind) {
    case 'intake.turn':
      return { stage: 'intake' };
    case STEP.PREFLIGHT:
      return { stage: 'preflight' };
    case STEP.DRAFT:
      return { stage: 'draft' };
    case STEP.VERIFY:
      return { stage: 'verify' };
    case 'repair':
      return { stage: 'repair', round: p.n };
    case STEP.RENDER:
      return { stage: 'render' };
    case STEP.DELIVER:
      return { stage: 'done' };
    default:
      return null;
  }
}
