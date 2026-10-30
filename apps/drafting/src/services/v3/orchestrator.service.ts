/**
 * T-685: the v3 orchestrator (ADR-drafting-v3 role A) for /generate-from-brief
 * at feature.drafting_v3_stage ≥ 2 (Arjun, T-685 answers §3-§9, §11-§13).
 *
 * The route calls it at four points and nowhere else:
 *  1. prepareV3Generate, after the ledger is read: null at stage < 2 (or no
 *     pack, intake or ledger), and then the route runs exactly as before;
 *     else the run's ledger store is fixed, and with a v3 ledger generation
 *     reads factsForGeneration (§13 Q5);
 *  2. open, before the Ink hold: the run doc (opened at the first hold, §13
 *     Q4), its lease (409 when another owner holds it live), the previous
 *     attempt's hold released, this attempt recorded (§5);
 *  3. generate, in place of streamGenerateFromBrief: the confirm and hold
 *     steps, the cost cap fixed, then streamGenerateFromBrief with the
 *     RunHooks (step replay, cost per call, the cap both ways, stage events);
 *  4. delivered, after the hold is settled; end, at every ending (the lease
 *     timer stopped, the lease given back).
 *
 * Steps in the stream (§13 Q1, mapped to call sites in ai.service.ts): draft,
 * repair.1, repair.2, verify. A replay gives back the stored model output
 * only; every check after the call runs again on it (Ajay's condition).
 *
 * The cost of each call is summed here from what the call returns (§11):
 * paise = USD (priceUsage, the ai.rates.* table) × getUsdInrRate() × 100.
 *
 * Privacy: logs and Sentry carry ids, step ids, reason codes and paise only.
 */
import crypto from 'crypto';

import * as Sentry from '@sentry/node';
import type { Response } from 'express';

import logger from '../../config/logger';
import {
  type BriefGenerateInput,
  type BriefGenerateResult,
  DRAFT_DID_NOT_FINISH,
  GenerationFailedError,
  type RunHooks,
  type StepReplay,
  streamGenerateFromBrief,
  writeSseError,
} from '../ai.service';
import { listAppSettings } from '../app-settings.service';
import { INK_HOLD_MAX_HEARTBEAT_MS, releaseInk } from '../credits.service';
import {
  type CallUsage,
  getModelRates,
  getUsdInrRate,
  type ModelRate,
  priceUsage,
  type UsageTotals,
} from '../llm-usage';

import { factsForGeneration, openLedger, openLedgerForRun } from './ledger.service';
import type { LedgerSnapshot } from './ledger.types';
import type { V3RunStage } from './run.model';
import * as R from './run.service';
import { v3Stage } from './stage';
import { STEP, type StepId, type V3StageName } from './stages';

/** §12.1: the lease (60 s) is renewed every ~20 s while the request runs. */
export const V3_LEASE_RENEW_MS = 20_000;

/** §8: the server's plain English fallback; the web owns the shown string. */
export const COST_CAP_MESSAGE =
  'This draft needed more work than its Ink covers. Nothing was charged. Please shorten the description or try again later.';

/** The GenerationFailedError codes of a draft the delivery gate withheld: the run stays open. */
const WITHHELD_CODES: ReadonlySet<string> = new Set([
  'party_details_missing',
  'fact_needed',
  'fact_conflict',
  'past_date_in_prayer',
]);

// ── Errors: they end the stream through the route's GenerationFailedError path ─

/** §8: the run's cost cap tripped. Its SSE error is already written. */
export class CostCapError extends GenerationFailedError {
  constructor(usage: UsageTotals, aiModel?: string) {
    super('v3 run cost cap', 'unknown', usage, aiModel, 'direct', {
      code: 'cost_cap',
      rule: 'v3.cost_cap',
    });
    this.name = 'CostCapError';
  }
}

/** §3: the run failed safe (a step found running twice, a failed step, the 60-min limit). */
export class RunFailedError extends GenerationFailedError {
  constructor(reason: string, usage: UsageTotals, aiModel?: string) {
    super('v3 run failed safe', 'unknown', usage, aiModel, 'direct', {
      code: 'run_failed',
      rule: reason,
    });
    this.name = 'RunFailedError';
  }
}

// ── SSE ─────────────────────────────────────────────────────────────────────

/**
 * §9: the one writer of `event: stage`, so T-538 has one place to extend.
 * `round` only on `repair`. No pct, eta, label, id or replay buffer.
 */
export function emitStage(res: Response, runId: string, stage: V3StageName, round?: number): void {
  const data = { stage, ...(stage === 'repair' && round !== undefined ? { round } : {}), runId };
  res.write(`event: stage\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Cost ────────────────────────────────────────────────────────────────────

/** The provider-side codes of classifyLlmError (429, 529/5xx, timeout/reset): §14.2 (i). */
const PROVIDER_CODES: ReadonlySet<string> = new Set([
  'rate_limited',
  'provider_unavailable',
  'network',
]);

const RATES_PREFIX = 'ai.rates.';

/**
 * §14.4: the highest rate in the configured `ai.rates.*` table, field by
 * field, read through getModelRates (each key's slug is its own slug). Null
 * when the table has no usable rate: the cap cannot be enforced, so v3 does
 * not run.
 */
async function highestConfiguredRate(): Promise<ModelRate | null> {
  const keys = (await listAppSettings())
    .map((s) => s.key)
    .filter((k) => k.startsWith(RATES_PREFIX) && k.length > RATES_PREFIX.length);
  const rates: ModelRate[] = [];
  for (const k of keys) {
    const r = await getModelRates(k.slice(RATES_PREFIX.length));
    if (r.costStatus === 'priced') rates.push(r.rate);
  }
  if (rates.length === 0) return null;
  const max = (f: (r: ModelRate) => number | undefined): number | undefined => {
    const v = rates.map(f).filter((n): n is number => typeof n === 'number');
    return v.length > 0 ? Math.max(...v) : undefined;
  };
  return {
    inputUsdPerMTok: max((r) => r.inputUsdPerMTok) as number,
    outputUsdPerMTok: max((r) => r.outputUsdPerMTok) as number,
    cacheWriteUsdPerMTok: max((r) => r.cacheWriteUsdPerMTok),
    cacheReadUsdPerMTok: max((r) => r.cacheReadUsdPerMTok),
  };
}

/** A run doc's input fingerprint: the generation input without the attempt's ids. */
function fingerprintOf(input: BriefGenerateInput, ledgerVersion: number): string {
  const { runId: _r, runSequence: _s, runType: _t, ...stable } = input;
  void _r;
  void _s;
  void _t;
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ ledgerVersion, input: stable }))
    .digest('hex');
}

// ── The orchestrator ────────────────────────────────────────────────────────

export interface V3LedgerFacts {
  id: string;
  version: number;
  facts: ReturnType<typeof factsForGeneration>['facts'];
  unresolved: ReturnType<typeof factsForGeneration>['unresolved'];
  runType: LedgerSnapshot['runType'];
}

export type V3OpenResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

export class V3Generate {
  private run: R.V3RunSnapshot | null = null;
  private readonly owner = R.newLeaseOwner();
  private renewTimer: NodeJS.Timeout | null = null;
  private res: Response | null = null;
  private attempt: { runId: string; runSequence: number } | null = null;
  private inkQuoted = 1;
  /** Steps begun in this request (a second call of one, the D1 retry, goes live). */
  private readonly begun = new Set<StepId>();
  private readonly replayed = new Set<StepId>();
  /** This request's live calls, for a failed Generation row's usage. */
  private readonly calls: CallUsage[] = [];
  private model: string | undefined;
  /** Steps whose call failed on the provider's side in this request (§14.2 (i)). */
  private readonly providerFailed = new Set<StepId>();
  /** One warn per request for a model priced at the fallback rate. */
  private unpricedWarned = false;
  private sentrySent = false;
  private ended = false;

  constructor(
    private readonly userId: string,
    private readonly intakeId: string,
    private readonly stage: V3RunStage,
    private readonly ledger: LedgerSnapshot,
    /** §14.4: the price of a model with no rate of its own: the table's highest. */
    private readonly fallbackRate: ModelRate,
  ) {}

  /** The ledger version the steps run at. */
  get ledgerVersion(): number {
    return this.ledger.version;
  }

  /**
   * §13 Q5: with a v3 ledger, what generation reads (factsForGeneration,
   * derived: false, the T-682 condition 6 shape); null on a v2 ledger (v2
   * currentState as today).
   */
  ledgerFacts(): V3LedgerFacts | null {
    if (this.ledger.store !== 'v3') return null;
    const g = factsForGeneration(this.ledger, { derived: false });
    return {
      id: this.ledger.ledgerId,
      version: this.ledger.version,
      facts: g.facts,
      unresolved: g.unresolved,
      runType: this.ledger.runType,
    };
  }

  /**
   * §5, before the hold (no header sent; refusals are JSON): open the run,
   * take the lease and start its renew timer, release the previous attempt's
   * hold where it delivered nothing, and record this attempt.
   */
  async open(attempt: {
    runId: string;
    runSequence: number;
    inkCost: number;
  }): Promise<V3OpenResult> {
    this.attempt = { runId: attempt.runId, runSequence: attempt.runSequence };
    // §14.4: the cap's Ink is the held cost, rounded up, at least 1.
    this.inkQuoted = Math.max(1, Math.ceil(attempt.inkCost));
    try {
      await R.openRun({
        intakeId: this.intakeId,
        userId: this.userId,
        stage: this.stage,
        ledgerStore: this.ledger.store,
        ledgerId: this.ledger.ledgerId,
      });
      try {
        this.run = await R.takeLease(this.intakeId, this.userId, this.owner);
      } catch (err) {
        if (err instanceof R.RunLeaseHeldError) {
          return { ok: false, status: 409, body: { error: err.message, runId: attempt.runId } };
        }
        throw err;
      }
      this.startRenew();
      const prev = this.run.attempts[this.run.attempts.length - 1];
      const same = prev && prev.runId === attempt.runId && prev.runSequence === attempt.runSequence;
      const deliver = this.run.outputs[STEP.DELIVER];
      const prevDelivered =
        deliver?.status === 'done' &&
        deliver.runId === prev?.runId &&
        deliver.runSequence === prev?.runSequence;
      if (prev && !same && !prevDelivered) {
        // §5: one live hold per run. A no-op on a hold that is gone (the sweep, a settle).
        try {
          await releaseInk(this.userId, prev.runId, prev.runSequence);
        } catch (err) {
          logger.warn(
            { runDocId: this.run.id, runId: prev.runId, runSequence: prev.runSequence },
            `T-685: previous hold release failed (${err instanceof Error ? err.name : 'unknown'})`,
          );
        }
      }
      this.run = await R.startAttempt(this.run, this.owner, this.attempt);
      return { ok: true };
    } catch (err) {
      logger.error(
        { intakeId: this.intakeId, runId: attempt.runId },
        `T-685: v3 run open failed (${err instanceof Error ? err.name : 'unknown'})`,
      );
      await this.end();
      return { ok: false, status: 503, body: { error: 'try_again' } };
    }
  }

  /**
   * In place of streamGenerateFromBrief(input, res), inside the Ink hold: the
   * confirm step (a changed input resets the steps), the hold step, the cap
   * fixed on the quote, then the stream with the hooks.
   */
  readonly generate = async (
    input: BriefGenerateInput,
    res: Response,
  ): Promise<BriefGenerateResult> => {
    this.res = res;
    const run = await this.beforeStream(input);
    this.run = run;
    try {
      const result = await streamGenerateFromBrief(input, res, this.hooks());
      emitStage(res, this.runId(), 'done');
      await this.closeOpenSteps('no_output');
      return result;
    } catch (err) {
      if (!(err instanceof CostCapError) && !(err instanceof RunFailedError)) {
        await this.closeOpenSteps(err instanceof GenerationFailedError ? err.code : 'error');
        if (!(err instanceof GenerationFailedError) || !WITHHELD_CODES.has(err.code)) {
          await this.finish({ status: 'failed' });
        }
      }
      throw err;
    }
  };

  /**
   * After the hold is closed: the deliver step (ref = the Document) and the
   * run delivered. Never throws. `settled` is DERIVED by the route ("doc saved
   * and not a duplicate", §14.4), not the settle result: withInkHold does not
   * expose that.
   */
  async delivered(docId: string | null, settled: boolean): Promise<void> {
    if (!this.run || docId === null) return;
    try {
      const d = await R.beginStep(this.run, this.owner, STEP.DELIVER, {
        ledgerVersion: this.ledgerVersion,
      });
      this.run = d.run;
      if (d.action === 'run') {
        this.run = await R.completeStep(this.run, this.owner, STEP.DELIVER, {
          ledgerVersion: this.ledgerVersion,
          ref: docId,
        });
      }
      await this.finish({ status: 'delivered', documentId: docId, settled });
    } catch (err) {
      logger.error(
        { runDocId: this.run.id, step: STEP.DELIVER },
        `T-685: v3 run deliver not recorded (${err instanceof Error ? err.name : 'unknown'})`,
      );
    }
  }

  /** Every ending: the renew timer stopped and the lease given back. Never throws. */
  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
    try {
      await R.releaseLease(this.intakeId, this.userId, this.owner);
    } catch (err) {
      logger.warn(
        { intakeId: this.intakeId },
        `T-685: lease release failed; it expires in 60 s (${err instanceof Error ? err.name : 'unknown'})`,
      );
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private runId(): string {
    return this.attempt?.runId ?? '';
  }

  private startRenew(): void {
    this.renewTimer = setInterval(() => {
      R.renewLease(this.intakeId, this.userId, this.owner)
        .then((held) => {
          if (held) return;
          logger.warn({ intakeId: this.intakeId }, 'T-685: v3 run lease lost');
          if (this.renewTimer) clearInterval(this.renewTimer);
          this.renewTimer = null;
        })
        .catch(() => {
          // Ids only. The lease has 60 s; the next tick tries again.
          logger.warn({ intakeId: this.intakeId }, 'T-685: v3 run lease renew failed');
        });
    }, V3_LEASE_RENEW_MS);
    this.renewTimer.unref();
  }

  private current(): R.V3RunSnapshot {
    if (!this.run) throw new Error('v3 run not open');
    return this.run;
  }

  /** The confirm and hold steps, the cap and the status, before the stream. Throws plain errors (500 before any header). */
  private async beforeStream(input: BriefGenerateInput): Promise<R.V3RunSnapshot> {
    let run = this.current();
    const ledgerVersion = this.ledgerVersion;
    const fp = fingerprintOf(input, ledgerVersion);
    let d = await R.beginStep(run, this.owner, STEP.CONFIRM, { ledgerVersion });
    if (d.action === 'replay' && d.output.hash !== fp) {
      // The confirmed input changed under this runId: nothing may replay.
      run = await R.resetSteps(d.run, this.owner);
      d = await R.beginStep(run, this.owner, STEP.CONFIRM, { ledgerVersion });
    }
    if (d.action === 'fail_safe') throw new Error('v3 confirm step failed safe');
    run = d.run;
    if (d.action === 'run') {
      run = await R.completeStep(run, this.owner, STEP.CONFIRM, { ledgerVersion, hash: fp });
    }
    const h = await R.beginStep(run, this.owner, STEP.HOLD, { ledgerVersion });
    if (h.action === 'fail_safe') throw new Error('v3 hold step failed safe');
    run = h.run;
    if (h.action === 'run')
      run = await R.completeStep(run, this.owner, STEP.HOLD, { ledgerVersion });
    run = await R.fixCap(run, this.owner, this.inkQuoted);
    run = await R.setRunStatus(run, this.owner, 'generating');
    return run;
  }

  private hooks(): RunHooks {
    return {
      before: (step, projected) => this.before(step, projected),
      after: (step, usage, output, failure) => this.after(step, usage, output, failure),
      stage: (stage, round) => {
        if (this.res) emitStage(this.res, this.runId(), stage, round);
      },
    };
  }

  private async before(
    step: StepId,
    projected: { inputTokens: number; maxOutputTokens: number; model: string },
  ): Promise<StepReplay | undefined> {
    this.model = projected.model || this.model;
    // §6: a run older than 60 min from its first hold (this runId's first attempt) fails safe.
    const first = this.current().attempts.find((a) => a.runId === this.runId());
    if (first && Date.now() - new Date(first.startedAt).getTime() >= INK_HOLD_MAX_HEARTBEAT_MS) {
      throw await this.failSafe(step, 'run_expired');
    }
    if (!this.begun.has(step) && !this.replayed.has(step)) {
      const d = await R.beginStep(this.current(), this.owner, step, {
        ledgerVersion: this.ledgerVersion,
      });
      this.run = d.run;
      if (d.action === 'fail_safe') throw await this.failSafe(step, d.reason);
      if (d.action === 'replay' || d.action === 'skip') {
        const payload = R.readStepPayload(d.output) as { text?: unknown } | undefined;
        if (payload && typeof payload.text === 'string') {
          this.replayed.add(step);
          return { text: payload.text };
        }
        // A done step with nothing to replay: the call is made; its cost is still counted.
      } else {
        this.begun.add(step);
      }
    }
    const paise = await this.pricePaise(projected.model, {
      inputTokens: projected.inputTokens,
      outputTokens: projected.maxOutputTokens,
    });
    if (R.wouldExceedCap(this.current(), paise)) throw await this.capTrip(step);
    return undefined;
  }

  private async after(
    step: StepId,
    usage: CallUsage,
    output?: string,
    failure?: { code: string },
  ): Promise<void> {
    if (output === undefined) {
      // §14.2 (i): a provider-side failure is not counted as a re-run when the step is closed.
      if (failure && PROVIDER_CODES.has(failure.code)) this.providerFailed.add(step);
      // A failed (or empty) call: its cost only. Never throws, so the step's own error path runs.
      try {
        this.calls.push(usage);
        await this.addCost(await this.pricePaise(this.model, usage));
      } catch (err) {
        logger.warn(
          { runDocId: this.run?.id, step },
          `T-685: cost of a failed call not recorded (${err instanceof Error ? err.name : 'unknown'})`,
        );
      }
      return;
    }
    this.calls.push(usage);
    const paise = await this.pricePaise(this.model, usage);
    await this.addCost(paise);
    const run = this.current();
    if (this.begun.has(step) && run.outputs[step]?.status === 'running') {
      this.run = await R.completeStep(run, this.owner, step, {
        ledgerVersion: this.ledgerVersion,
        payload: { text: output },
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          ...(usage.cacheCreationInputTokens !== undefined
            ? { cacheCreationInputTokens: usage.cacheCreationInputTokens }
            : {}),
          ...(usage.cacheReadInputTokens !== undefined
            ? { cacheReadInputTokens: usage.cacheReadInputTokens }
            : {}),
          llmCalls: 1,
        },
        costPaise: paise,
      });
      this.begun.delete(step);
    }
    // §7: actual after the call; ≥ cap trips before the next step.
    if (R.capReached(this.current())) throw await this.capTrip(step);
  }

  /** The paise of a call on `model`: its own rate, else (§14.4) the table's highest, never 0. */
  private async pricePaise(
    model: string | undefined,
    usage: Pick<CallUsage, 'inputTokens' | 'outputTokens'> &
      Partial<Pick<CallUsage, 'cacheCreationInputTokens' | 'cacheReadInputTokens'>>,
  ): Promise<number> {
    const own = model ? await getModelRates(model) : null;
    let rate: ModelRate;
    if (own?.costStatus === 'priced') {
      rate = own.rate;
    } else {
      rate = this.fallbackRate;
      if (!this.unpricedWarned) {
        this.unpricedWarned = true;
        logger.warn(
          { runId: this.runId(), intakeId: this.intakeId, model: model ?? null },
          'T-685: no rate for the model; priced at the highest configured rate',
        );
      }
    }
    return priceUsage(usage, rate, model) * (await getUsdInrRate()) * 100;
  }

  private async addCost(paise: number): Promise<void> {
    if (paise <= 0) return;
    const next = await R.addCost(this.intakeId, this.userId, paise);
    if (next) this.run = next;
  }

  /**
   * Steps begun in this request and still running: failed, so a new attempt
   * may retry once (§3). §14.2 (i): a step whose call failed on the
   * provider's side (or a run ended by a provider code) is failed as
   * `provider_failed`, which never counts toward the re-runs.
   */
  private async closeOpenSteps(reason: string): Promise<void> {
    const code = PROVIDER_CODES.has(reason)
      ? R.PROVIDER_FAILED_REASON
      : /^[a-z0-9_.:-]{1,64}$/.test(reason)
        ? reason
        : 'error';
    for (const step of [...this.begun]) {
      try {
        const run = this.current();
        if (run.outputs[step]?.status !== 'running') continue;
        const stepCode = this.providerFailed.has(step) ? R.PROVIDER_FAILED_REASON : code;
        this.run = await R.failStep(run, this.owner, step, stepCode);
      } catch (err) {
        logger.warn(
          { runDocId: this.run?.id, step },
          `T-685: open step not closed (${err instanceof Error ? err.name : 'unknown'})`,
        );
      }
    }
    this.begun.clear();
  }

  private async finish(
    end:
      | { status: 'delivered'; documentId: string; settled: boolean }
      | { status: 'failed' | 'capped' },
  ): Promise<void> {
    if (!this.run) return;
    try {
      this.run = await R.finishRun(this.run, this.owner, end);
    } catch (err) {
      logger.error(
        { runDocId: this.run.id, status: end.status },
        `T-685: v3 run finish not recorded (${err instanceof Error ? err.name : 'unknown'})`,
      );
    }
  }

  /**
   * The failed Generation row's usage on a cap or fail-safe ending: this
   * request's own calls, summed here, so `usageSource: 'estimated'` (§14.6).
   */
  private usageTotals(): UsageTotals {
    return {
      inputTokens: this.calls.reduce((n, c) => n + c.inputTokens, 0),
      outputTokens: this.calls.reduce((n, c) => n + c.outputTokens, 0),
      llmCalls: this.calls.length,
      usageSource: 'estimated',
      calls: [...this.calls],
    };
  }

  /** One Sentry event per run ending: ids and paise only, never text. */
  private sentry(message: string, step: StepId, extra: Record<string, string | number> = {}): void {
    if (this.sentrySent) return;
    this.sentrySent = true;
    const run = this.run;
    Sentry.captureMessage(message, {
      level: 'warning',
      tags: {
        runId: this.runId(),
        intakeId: this.intakeId,
        step,
        capPaise: String(run?.capPaise ?? ''),
        costPaiseSoFar: String(Math.round(run?.costPaiseSoFar ?? 0)),
        ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
      },
    });
  }

  /** §8: the cap tripped: the error event, the run capped, one Sentry event. Ink is released by the route. */
  private async capTrip(step: StepId): Promise<CostCapError> {
    if (this.res) {
      writeSseError(this.res, {
        reason: COST_CAP_MESSAGE,
        retryable: false,
        code: 'cost_cap',
        runId: this.runId(),
      });
    }
    await this.closeOpenSteps('cost_cap');
    await this.finish({ status: 'capped' });
    this.sentry('T-685: v3 run cost cap', step);
    logger.warn(
      {
        runDocId: this.run?.id,
        step,
        capPaise: this.run?.capPaise,
        costPaiseSoFar: this.run?.costPaiseSoFar,
      },
      'T-685: v3 run cost cap tripped',
    );
    return new CostCapError(this.usageTotals(), this.model);
  }

  /** §3: fail safe: the error event (run_failed), the run failed, one Sentry event. Ink is released by the route. */
  private async failSafe(step: StepId, reason: string): Promise<RunFailedError> {
    if (this.res) {
      writeSseError(this.res, {
        reason: DRAFT_DID_NOT_FINISH,
        retryable: false,
        code: 'run_failed',
        runId: this.runId(),
      });
    }
    await this.closeOpenSteps(reason);
    await this.finish({ status: 'failed' });
    this.sentry('T-685: v3 run failed safe', step, { reason });
    return new RunFailedError(reason, this.usageTotals(), this.model);
  }
}

/**
 * The v3 orchestrator for this generate, or null, and then the route runs v2
 * exactly as before, with no run doc opened and nothing recorded:
 *  - stage < 2;
 *  - no v3 ledger for the intake (§14.3), including a run fixed on a v2 store;
 *  - a ledger of another kind;
 *  - no usable rate in the ai.rates.* table (§14.4: the cap cannot be enforced);
 *  - an unreadable run, ledger or table (logged, ids only). Never throws.
 */
export async function prepareV3Generate(args: {
  userId: string;
  intakeId: string;
  kind: string;
}): Promise<V3Generate | null> {
  const stage = await v3Stage(args.userId);
  if (stage < 2) return null;
  try {
    const existing = await R.findRun(args.intakeId, args.userId);
    const ledger = existing
      ? await openLedger(existing.ledgerId, args.userId)
      : await openLedgerForRun(args.intakeId, args.userId);
    if (!ledger || ledger.store !== 'v3' || ledger.packId !== args.kind) return null;
    const fallbackRate = await highestConfiguredRate();
    if (!fallbackRate) {
      logger.warn({ intakeId: args.intakeId }, 'T-685: no ai.rates.* rate configured; v2 runs');
      return null;
    }
    return new V3Generate(args.userId, args.intakeId, stage as V3RunStage, ledger, fallbackRate);
  } catch (err) {
    logger.warn(
      { intakeId: args.intakeId },
      `T-685: v3 run unavailable; v2 runs (${err instanceof Error ? err.name : 'unknown'})`,
    );
    return null;
  }
}
