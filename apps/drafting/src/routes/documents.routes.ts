import crypto from 'crypto';

import { COURT_TYPES, DOC_TYPES, DocType, requireCurrentPrivacy } from '@lawie/shared';
import type { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';
import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { env } from '../config/env';
import logger from '../config/logger';
import redis from '../config/redis';
import { authenticate } from '../middleware/authenticate';
import { chargedCost, enforceCredits, insufficientInkBody } from '../middleware/enforceCredits';
import { FREE_TIER_MONTHLY_LIMIT } from '../middleware/enforceFreeLimit';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail';
import { spendCapCheck } from '../middleware/spendCap';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { effectiveRunType, Generation, RunType } from '../models/Generation.model';
import { User } from '../models/User.model';
import {
  GenerationFailedError,
  streamGenerateFromBrief,
  streamGenerateGuided,
  streamGenerateFromTemplate,
} from '../services/ai.service';
import {
  annexuresFilename,
  buildAnnexuresHtml,
  buildAnnexuresPack,
  estimateBodyParaCount,
} from '../services/annexures.service';
import { AvermentLists, loadAvermentLists } from '../services/averments';
import {
  briefText,
  clampTarget,
  missingFromRendered,
  STARTING_DRAFT_FOOTER,
  STARTING_DRAFT_LABEL,
} from '../services/brief-drafter';
import {
  applyPartyFields,
  flattenPartyValues,
  hasPartyInputs,
  mapPartyFields,
  PartyFieldsResult,
  pickPartyInputs,
  readStoredBrief,
  storesState,
} from '../services/brief-party-fields';
import {
  costForTemplate,
  extendInkHold,
  getCreditBalance,
  holdInk,
  inkFromUnits,
  INK_HOLD_HEARTBEAT_MS,
  INK_HOLD_MAX_HEARTBEAT_MS,
  releaseInk,
  settleInk,
  wasInkSettled,
} from '../services/credits.service';
import { eraseDocument } from '../services/document-erase.service';
import {
  factDiffRunType,
  FactDiffRunType,
  rulePackVersionOf,
  writeFactCheckLog,
} from '../services/fact-diff-log';
import { currentState, loadOwnLedger } from '../services/fact-ledger.service';
import { FACT_CHECK_DISCLAIMER } from '../services/fact-verifier';
import { bodyField, hiddenTemplateIds, templateGuard } from '../services/feature-switches';
import { isCourtDocument, namesSupremeCourt, buildChecklist } from '../services/intake-brief';
import type { BriefItem } from '../services/intake-brief';
import {
  INTAKE_LIMITS,
  isDescribeFirstEnabled,
  isFactLedgerEnabled,
  updateBrief,
} from '../services/intake.service';
import {
  CacheUsage,
  cacheCounts,
  effectiveCacheRates,
  getModelRates,
  priceCacheUsage,
  priceUsage,
  RateLookup,
  totalTokens,
} from '../services/llm-usage';
import {
  blanksInContent,
  contentToHtml,
  draftHeaderText,
  findBlanks,
  renderPdf,
} from '../services/pdf-export.service';
import { preflightCheck } from '../services/preflight.service';
import { applyFieldAliases, loadRulePack } from '../services/rule-pack.service';
import { NOT_FIXTURE, NOT_FIXTURE_GENERATION } from '../services/run-origin';
import { withS138DateChecks } from '../services/s138-date-checks';
import {
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
  listTemplateConfigs,
  validateFormData,
} from '../services/template-engine.service';
import {
  readFilingChecklist,
  readFormInputs,
  sealFilingChecklist,
  sealFormInputs,
} from '../utils/case-details';
import { decrypt, encrypt } from '../utils/encryption';
import { publicTemplateConfig, publicTemplateSummary } from '../utils/publicTemplateConfig';

/**
 * Map template_id → valid DOC_TYPE for DB persistence.
 * Template categories are broad ("criminal", "civil") but the DB stores specific doc types.
 */
const TEMPLATE_TO_DOC_TYPE: Record<string, DocType> = {
  bail_regular: DOC_TYPES.BAIL_APPLICATION,
  bail_anticipatory: DOC_TYPES.BAIL_APPLICATION,
  legal_notice_s80: DOC_TYPES.LEGAL_NOTICE,
  legal_notice_s138: DOC_TYPES.LEGAL_NOTICE,
  consumer_complaint: DOC_TYPES.COMPLAINT,
  rent_agreement: DOC_TYPES.RENT_AGREEMENT,
  writ_petition: DOC_TYPES.PETITION,
  criminal_complaint: DOC_TYPES.COMPLAINT,
  plaint_civil: DOC_TYPES.PLAINT,
};

/** Skip this route if :id is not a valid ObjectId (avoids catching /templates etc.) */
function validateObjectId(req: Request, _res: Response, next: NextFunction): void {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    next('route');
    return;
  }
  next();
}

const router = Router();

/**
 * T-357 AC3: log a template-config load failure once. Only the message is
 * logged: template-engine messages hold template ids, never file content,
 * request body or user content.
 */
function logTemplateConfigError(err: unknown): void {
  logger.error(
    { error: err instanceof Error ? err.message : 'UnknownError' },
    'T-357: template config could not be loaded',
  );
}

/**
 * T-311 (Arjun, 12 Oct 2026): the user's enrolment number from the profile, by
 * the JWT `sub`, read once per request that builds a draft. Read only. A
 * failed read counts as an empty profile: a warn with the user id only (never
 * the number), and the draft goes on.
 */
async function profileEnrollmentNumber(userId: string): Promise<string | undefined> {
  try {
    const user = await User.findById(userId).select('enrollmentNumber').maxTimeMS(5000).lean();
    const n = typeof user?.enrollmentNumber === 'string' ? user.enrollmentNumber.trim() : '';
    return n || undefined;
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.name : 'UnknownError' },
      'T-311: profile enrolment number lookup failed; treated as empty',
    );
    return undefined;
  }
}

/**
 * Price a generation's usage. getModelRates never throws — a missing/
 * malformed rate just means costStatus: 'rate_missing', costUsd: 0. Tokens
 * are still real either way (T-003 §3.6).
 */
async function priceGeneration(
  usage: { inputTokens: number; outputTokens: number } & CacheUsage,
  aiModel: string | undefined,
): Promise<{ costUsd: number; cacheWriteUsd: number; cacheReadUsd: number; rate: RateLookup }> {
  const none = { cacheWriteUsd: 0, cacheReadUsd: 0 };
  if (!aiModel) return { costUsd: 0, ...none, rate: { costStatus: 'rate_missing', rate: null } };
  const rate = await getModelRates(aiModel);
  if (rate.costStatus !== 'priced') return { costUsd: 0, ...none, rate };
  // T-437: costUsd includes the cache cost; the split is kept for the admin screen.
  const costUsd = priceUsage(usage, rate.rate, aiModel);
  return { costUsd, ...priceCacheUsage(usage, rate.rate, aiModel), rate };
}

export interface RecordGenerationInput {
  userId: string;
  docType: DocType;
  status: 'completed' | 'failed';
  templateId?: string;
  documentId?: mongoose.Types.ObjectId;
  aiModel?: string;
  transport?: 'direct';
  /** T-437: inputTokens is uncached input; cache counts are the optional CacheUsage fields. */
  usage: CacheUsage & {
    inputTokens: number;
    outputTokens: number;
    llmCalls: number;
    usageSource: 'provider' | 'estimated' | 'mixed';
    calls?: unknown[];
  };
  paragraphCount: number;
  durationMs: number;
  runId: string;
  runSequence: number;
  /** T-110 */
  runType: RunType;
  /** ADR-019 §3.7 */
  intakeId?: string;
  /** T-480: which drafting path ran (on = written from a fact ledger). */
  ledger?: 'on' | 'off';
  /** T-477: how many echoed [only when: ...] markers were stripped from the AI body (count only) */
  onlyWhenStrips?: number;
}

/**
 * Persist one Generation row (completed or failed) with cost derived from
 * the model's rate. Used by both routes, on both the success and failure
 * paths — one field list, one place to fix.
 *
 * Returns `duplicate: true` if the (runId, runSequence) unique index
 * rejected the insert — a concurrent request (e.g. a double-sent retry)
 * already recorded this exact attempt. The caller must not spend Ink again
 * for a duplicate: the winning request already accounts for this attempt.
 */
export async function recordGeneration(
  input: RecordGenerationInput,
): Promise<{ duplicate: boolean }> {
  const { costUsd, cacheWriteUsd, cacheReadUsd, rate } = await priceGeneration(
    input.usage,
    input.aiModel,
  );
  const cacheRates = rate.costStatus === 'priced' ? effectiveCacheRates(rate.rate) : undefined;
  try {
    await Generation.create({
      userId: input.userId,
      docType: input.docType,
      status: input.status,
      templateId: input.templateId,
      documentId: input.documentId,
      aiModel: input.aiModel,
      transport: input.transport,
      // T-437: tokensUsed counts every token processed, cache writes and reads included.
      tokensUsed: totalTokens(input.usage),
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      ...cacheCounts(input.usage),
      llmCalls: input.usage.llmCalls,
      usageSource: input.usage.usageSource,
      calls: input.usage.calls,
      paragraphCount: input.paragraphCount,
      durationMs: input.durationMs,
      runId: input.runId,
      runSequence: input.runSequence,
      runType: input.runType,
      intakeId: input.intakeId,
      ledger: input.ledger,
      onlyWhenStrips: input.onlyWhenStrips,
      costUsd,
      costStatus: rate.costStatus,
      rateInputUsdPerMTok: rate.costStatus === 'priced' ? rate.rate.inputUsdPerMTok : undefined,
      rateOutputUsdPerMTok: rate.costStatus === 'priced' ? rate.rate.outputUsdPerMTok : undefined,
      // T-437: present only when the generation used the cache, so a row without
      // cache activity is written exactly as before (the schema defaults the costs to 0).
      ...(cacheWriteUsd > 0 || cacheReadUsd > 0
        ? {
            cacheWriteCostUsd: cacheWriteUsd,
            cacheReadCostUsd: cacheReadUsd,
            rateCacheWriteUsdPerMTok: cacheRates?.cacheWriteUsdPerMTok,
            rateCacheReadUsdPerMTok: cacheRates?.cacheReadUsdPerMTok,
          }
        : {}),
    });
    return { duplicate: false };
  } catch (dbErr) {
    const isDuplicate =
      typeof dbErr === 'object' &&
      dbErr !== null &&
      'code' in dbErr &&
      (dbErr as { code?: number }).code === 11000;
    if (isDuplicate) {
      console.warn(
        `[drafting] Duplicate Generation for runId=${input.runId} runSequence=${input.runSequence} runType=${input.runType} — a concurrent request already recorded this attempt.`,
      );
    } else {
      console.error(
        `[drafting] Failed to record Generation (runId=${input.runId}, runSequence=${input.runSequence}, runType=${input.runType}):`,
        dbErr instanceof Error ? dbErr.message : dbErr,
      );
    }
    return { duplicate: isDuplicate };
  }
}

/**
 * Resolve the runId/runSequence for this attempt (T-003 §3.8).
 * - No run_id in the request → new run, sequence 1.
 * - A run_id that doesn't belong to this user+template, doesn't exist, or
 *   already has a completed attempt → quietly starts a new run at 1. Never
 *   errors on a bad run_id — the browser's retry must never be the thing
 *   that fails.
 * - A valid run_id → same runId, sequence = highest attempt so far + 1.
 *
 * T-110 — runType: a new run is 'initial'. A retry keeps the runType of the
 * attempt it retries (the latest one); pre-T-110 rows read as 'initial'.
 * Revisions (T-205) will add a revision request path here.
 */
export async function resolveRun(
  userId: string,
  match: { templateId: string } | { docType: string },
  providedRunId: string | undefined,
): Promise<{ runId: string; runSequence: number; runType: RunType }> {
  if (!providedRunId) {
    return { runId: crypto.randomUUID(), runSequence: 1, runType: 'initial' };
  }

  const attempts = await Generation.find({ runId: providedRunId, userId, ...match })
    .select('runSequence status runType')
    .lean();

  if (attempts.length === 0 || attempts.some((a) => a.status === 'completed')) {
    return { runId: crypto.randomUUID(), runSequence: 1, runType: 'initial' };
  }

  const latest = attempts.reduce((a, b) => ((b.runSequence ?? 1) > (a.runSequence ?? 1) ? b : a));
  return {
    runId: providedRunId,
    runSequence: (latest.runSequence ?? 1) + 1,
    runType: effectiveRunType(latest),
  };
}

/** What a generate handler gets from withInkHold to close its hold. */
export interface InkHoldHandle {
  /**
   * Return the Ink: every failed ending. Call before the response is ended,
   * so the balance is back by the time the client sees the error.
   */
  release(): Promise<void>;
  /**
   * Close the hold after a successful run, by the charge rule (Arjun): Ink is
   * kept only when the draft reached the user. Settle if the document was
   * saved OR the client is still connected; release if neither, and release
   * a duplicate attempt (never charge twice). A settle DB error is logged at
   * error level and the hold is left for the sweep (the Ink is already off
   * the balance, so nothing is free).
   *
   * Lost hold (Arjun, round 3): if the settle finds no hold (the sweep got
   * there first), the same cost is held once more and that hold is settled.
   * If that is refused, the error event goes out with the 402 text, the
   * response ends, and sendDone() then sends nothing: no unpaid `done`.
   * Every path calls this BEFORE sendDone(), so the rule holds on all three.
   */
  finish(outcome: { saved: boolean; duplicate: boolean; reference?: string }): Promise<void>;
  /**
   * Write the SSE `done` event and end the response. Sends nothing when
   * finish() withheld the draft (lost hold, re-hold refused). Adds
   * `inkDebited` (T-545) when finish() knows what was settled.
   */
  sendDone(data: Record<string, unknown>): void;
}

/**
 * T-226: hold the draft's cost before any model call, and make sure the hold
 * is closed however the run ends. The one wrapper for all three generate
 * paths (template, brief, legacy) so they cannot drift apart.
 *
 * Called right after resolveRun, before the pipeline: no header has been
 * sent, so a refusal can still be plain JSON.
 *   - not enough Ink → 402 with the same body as enforceCredits;
 *   - a hold for this (runId, runSequence) already exists → 409;
 *   - the hold (or the balance read for the 402) throws → 500 with
 *     `preStreamError`, the route's own pre-stream "Generation failed" body,
 *     so the web shows its existing generic error.
 * None of these calls the model.
 *
 * Disconnects: the pipeline takes no AbortSignal (ai.service.ts, which this
 * ticket does not touch), so a client that goes away does NOT abort the model
 * call. `res.on('close')` only records that the client left before `done`;
 * finish() then decides settle or release when the run ends.
 *
 * Heartbeat (Arjun, round 3): while the run is alive the hold's expiry is
 * pushed to now + TTL every INK_HOLD_HEARTBEAT_MS (extendInkHold), so the
 * sweep never expires a running request's hold. Beats stop
 * INK_HOLD_MAX_HEARTBEAT_MS after the hold was taken (the run is then treated
 * as dead). The timer is unref'd, and cleared on response close, before
 * settle or release, and in the finally. A failed beat is logged at warn
 * level and the next beat tries again.
 *
 * Safety net: if `run` returns or throws without closing the hold, it is
 * released here.
 */
/** T-372: the longest `done` waits for the balance read before it goes without it. */
const DONE_BALANCE_TIMEOUT_MS = 1000;

export async function withInkHold(
  req: Request,
  res: Response,
  key: { runId: string; runSequence: number },
  cost: number,
  preStreamError: Record<string, unknown>,
  run: (ink: InkHoldHandle) => Promise<void>,
): Promise<void> {
  const userId = req.jwtPayload!.sub;
  const { runId, runSequence } = key;

  // Express 4 does not catch a rejected async handler: a throw here would
  // leave the request hanging, so it is answered with the route's own 500.
  try {
    const held = await holdInk({ userId, costCredits: cost, runId, runSequence });
    if (!held.ok) {
      if (held.reason === 'duplicate') {
        res.status(409).json({ error: 'Draft already in progress', runId });
        return;
      }
      res.status(402).json(insufficientInkBody(cost, await getCreditBalance(userId)));
      return;
    }
  } catch (err) {
    // Ids and the error class only: no user data. If the hold was written
    // before the throw, the sweep releases it (no delivery, no Generation).
    console.error(
      `[drafting] ink hold failed (runId=${runId}, runSequence=${runSequence}):`,
      err instanceof Error ? err.name : 'unknown',
    );
    if (!res.headersSent) res.status(500).json(preStreamError);
    return;
  }

  let closed = false;
  let doneWritten = false;
  let clientGone = false;
  /** finish() lost the hold and could not re-take it: no `done` may be sent. */
  let withheld = false;
  /** T-372: the Ink balance after the settle, for `done`. Unset if the read failed. */
  let doneBalance: { totalInk: number } | undefined;
  /**
   * T-545: the Ink this run's settle kept, for `done`. Unset when there was
   * no settle we can vouch for (fixture, duplicate, released, settle unknown).
   */
  let doneInkDebited: number | undefined;
  /** T-545: the draft is delivered but its debit is unknown. Ids only. */
  const warnDebitUnknown = (path: string): void => {
    console.warn(`[drafting] ink_debit_unknown (runId=${runId}, path=${path})`);
  };

  /**
   * T-372: read the balance once the draft is paid, for the web's balance.
   * Best effort and capped, so `done` is never held up. Ids only in the log.
   */
  const readDoneBalance = async (): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const balance = await Promise.race([
        getCreditBalance(userId),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), DONE_BALANCE_TIMEOUT_MS);
          timer.unref();
        }),
      ]);
      if (balance && typeof balance.totalInk === 'number' && Number.isFinite(balance.totalInk)) {
        doneBalance = { totalInk: balance.totalInk };
      }
    } catch (err) {
      console.warn(
        `[drafting] balance read for done failed (runId=${runId}, runSequence=${runSequence}):`,
        err instanceof Error ? err.name : 'unknown',
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  // Heartbeat. Declared before the timer so the tick can stop itself.
  const heldAt = Date.now();
  let beatTimer: NodeJS.Timeout | null = null;
  let beatInFlight: Promise<void> | null = null;
  const stopBeats = async (): Promise<void> => {
    if (beatTimer) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
    // A beat already on its way finishes first, so a settle never races it.
    if (beatInFlight) await beatInFlight;
  };
  beatTimer = setInterval(() => {
    if (Date.now() - heldAt >= INK_HOLD_MAX_HEARTBEAT_MS) {
      void stopBeats();
      return;
    }
    if (beatInFlight) return;
    beatInFlight = extendInkHold(userId, runId, runSequence)
      .then(() => undefined)
      .catch(() => {
        // Ids only. The hold's own TTL still covers it; the next beat retries.
        console.warn(
          `[drafting] ink hold heartbeat failed (runId=${runId}, runSequence=${runSequence})`,
        );
      })
      .finally(() => {
        beatInFlight = null;
      });
  }, INK_HOLD_HEARTBEAT_MS);
  beatTimer.unref();

  res.on('close', () => {
    if (!doneWritten && !res.writableFinished) clientGone = true;
    void stopBeats();
  });

  const release = async (): Promise<void> => {
    await stopBeats();
    if (closed) return;
    closed = true;
    try {
      await releaseInk(userId, runId, runSequence);
    } catch (err) {
      // The hold stays; the sweep releases it (no completed Generation).
      console.error(
        `[drafting] releaseInk failed (runId=${runId}, runSequence=${runSequence}); left for the sweep:`,
        err instanceof Error ? err.name : 'unknown',
      );
    }
  };

  /** Lost hold, re-hold refused: the 402 text as an SSE error, then end. */
  const withholdDraft = async (): Promise<void> => {
    withheld = true;
    console.error(
      `[drafting] ink hold lost before settle and could not be re-taken; draft withheld (runId=${runId}, runSequence=${runSequence})`,
    );
    let reason = 'Insufficient Ink';
    try {
      reason = insufficientInkBody(cost, await getCreditBalance(userId)).message;
    } catch {
      // Keep the 402's own error title.
    }
    res.write(
      `event: error\ndata: ${JSON.stringify({
        reason,
        retryable: false,
        code: 'insufficient_ink',
        runId,
      })}\n\n`,
    );
    res.end();
  };

  const handle: InkHoldHandle = {
    release,
    async finish({ saved, duplicate, reference }) {
      await stopBeats();
      if (duplicate || (!saved && clientGone)) {
        await release();
        return;
      }
      if (closed) return;
      closed = true;
      let settled: Awaited<ReturnType<typeof settleInk>>;
      try {
        settled = await settleInk(userId, runId, runSequence, undefined, reference);
      } catch (err) {
        // The hold (marked delivered, if the mark landed) stays; the sweep
        // settles or releases it.
        console.error(
          `[drafting] settleInk failed (runId=${runId}, runSequence=${runSequence}); left for the sweep:`,
          err instanceof Error ? err.name : 'unknown',
        );
        warnDebitUnknown('settle_threw');
        return;
      }
      if (settled.settled) {
        // `units` is absent for a fixture run: no field on `done`.
        if (typeof settled.units === 'number') doneInkDebited = inkFromUnits(settled.units);
        await readDoneBalance();
        return;
      }
      if (settled.reason !== 'no_hold') return;

      // The hold is gone. If it was SETTLED (the sweep, e.g. after this
      // request marked it delivered, or from the completed Generation), the
      // draft is paid: re-holding would charge twice.
      try {
        if (await wasInkSettled(userId, runId, runSequence)) {
          // T-545: the settled record has no units. The sweep settles with no
          // actualUnits, so it kept the full hold: the held cost (already Ink).
          doneInkDebited = cost;
          await readDoneBalance();
          return;
        }
      } catch (err) {
        // Paid or not is unknown, and there is no hold left for the sweep.
        // The draft is delivered (T-288 scopes the withheld path to a run
        // known to be unpaid).
        console.error(
          `[drafting] lost ink hold: could not check whether it was settled; draft delivered (runId=${runId}, runSequence=${runSequence}):`,
          err instanceof Error ? err.name : 'unknown',
        );
        warnDebitUnknown('was_settled_threw');
        return;
      }

      // It was released (a stall past the TTL): the run is known unpaid. Do
      // not deliver unpaid: hold the same cost once more and settle that.
      // T-288: a re-hold or retried settle that THROWS is handled like a
      // refused re-hold: no `done`, the 402 text as an SSE error.
      let reheld = false;
      try {
        const again = await holdInk({ userId, costCredits: cost, runId, runSequence });
        if (!again.ok && again.reason !== 'duplicate') {
          await withholdDraft();
          return;
        }
        reheld = again.ok;
        const retried = await settleInk(userId, runId, runSequence, undefined, reference);
        if (retried.settled) {
          if (typeof retried.units === 'number') doneInkDebited = inkFromUnits(retried.units);
          await readDoneBalance();
        }
        if (!retried.settled && retried.reason === 'no_hold') {
          console.error(
            `[drafting] settleInk found no hold after a re-hold (runId=${runId}, runSequence=${runSequence})`,
          );
          warnDebitUnknown('rehold_no_hold');
        }
      } catch (err) {
        console.error(
          `[drafting] re-hold failed (runId=${runId}, runSequence=${runSequence}):`,
          err instanceof Error ? err.name : 'unknown',
        );
        // The draft is withheld, so a hold this request just re-took must not
        // be kept: return it (best effort; on failure the sweep releases it
        // unless it was marked delivered).
        if (reheld) {
          try {
            await releaseInk(userId, runId, runSequence);
          } catch (releaseErr) {
            console.error(
              `[drafting] releaseInk failed after a failed re-hold (runId=${runId}, runSequence=${runSequence}):`,
              releaseErr instanceof Error ? releaseErr.name : 'unknown',
            );
          }
        }
        await withholdDraft();
      }
    },
    // T-545 contract: `inkDebited` is Ink (units / 2, so .5 is possible), not units.
    // Absent means no settle we can vouch for (fixture, duplicate, released, unknown).
    // 0 means a real settle that kept 0 units; the web never shows a 0 chip.
    sendDone(data) {
      if (withheld) return;
      doneWritten = true;
      const payload: Record<string, unknown> = { ...data };
      if (doneInkDebited !== undefined) payload.inkDebited = doneInkDebited;
      if (doneBalance) payload.balance = doneBalance;
      res.write(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
      res.end();
    },
  };

  try {
    await run(handle);
  } finally {
    await stopBeats();
    await release();
  }
}

// GET /documents/usage — return this month's generation count + limit for the caller
router.get('/usage', authenticate, async (req: Request, res: Response): Promise<void> => {
  const payload = req.jwtPayload!;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // A failed generation shouldn't count against the caller's usage (T-003 §3.7).
  const used = await Generation.countDocuments({
    userId: payload.sub,
    createdAt: { $gte: startOfMonth },
    status: { $ne: 'failed' },
    ...NOT_FIXTURE_GENERATION,
  });

  if (payload.plan === 'pro') {
    res.json({ used, limit: null, remaining: null, plan: 'pro' });
    return;
  }

  res.json({
    used,
    limit: FREE_TIER_MONTHLY_LIMIT,
    remaining: Math.max(0, FREE_TIER_MONTHLY_LIMIT - used),
    plan: 'free',
  });
});

// GET /documents — list user's documents
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const payload = req.jwtPayload!;
  const docs = await LawieDocument.find({
    userId: payload.sub,
    isDeleted: { $ne: true },
    ...NOT_FIXTURE,
  })
    .select('title docType courtName status createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.json({ documents: docs });
});

// GET /documents/template-configs — list available template configs for the form builder
router.get(
  '/template-configs',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    let configs: ReturnType<typeof listTemplateConfigs>;
    try {
      configs = listTemplateConfigs();
    } catch (err) {
      // T-357 AC3: a broken override or catalogue gap throws; answer instead of hanging.
      logTemplateConfigError(err);
      res.status(500).json({ error: 'Template config unavailable' });
      return;
    }
    // T-375: a template hidden by its feature switch is not listed (this also covers search).
    const hidden = await hiddenTemplateIds(req.jwtPayload!.sub);
    configs = configs.filter((c) => !hidden.has(c.template_id));
    const guidedCost = costForTemplate(GUIDED_ID);
    res.json({
      templates: configs.map((config) => {
        // T-372: the price the charge uses (single source, T-227); omitted when unpriced.
        const creditsCost = costForTemplate(config.template_id);
        // T-385: allowlist projection; description is the signed card line (T-365 AC6), no metadata.
        return publicTemplateSummary({
          ...config,
          ...(creditsCost !== undefined ? { credits_cost: creditsCost } : {}),
        });
      }),
      // T-372: a brief with no rule pack is charged as the guided draft.
      ...(guidedCost !== undefined ? { guided_credits_cost: guidedCost } : {}),
    });
  },
);

// GET /documents/template-configs/:id — the public template config (T-385 allowlist: form_schema, no document_structure)
router.get(
  '/template-configs/:id',
  authenticate,
  templateGuard((req) => req.params.id), // T-375
  async (req: Request, res: Response): Promise<void> => {
    let config: ReturnType<typeof loadTemplateConfig>;
    try {
      config = loadTemplateConfig(req.params.id);
    } catch (err) {
      // T-357 AC3: a broken override or catalogue gap throws; answer instead of hanging.
      logTemplateConfigError(err);
      res.status(500).json({ error: 'Template config unavailable' });
      return;
    }
    if (!config) {
      res.status(404).json({ error: 'Template config not found' });
      return;
    }

    const plan = req.jwtPayload!.plan;
    if (config.plan_access === 'pro' && plan !== 'pro') {
      res.status(403).json({
        error: 'This template requires a Pro plan',
        upgradeUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/settings/billing`,
      });
      return;
    }

    // T-385: allowlist projection; no _source, document_structure, metadata etc.
    // description is the signed card line (T-365 AC6).
    res.json({ config: publicTemplateConfig(config) });
  },
);

const templateGenerateSchema = z.object({
  template_id: z.string().min(1).max(100),
  form_data: z.record(z.unknown()),
  language: z.enum(['en', 'hi', 'bilingual']).default('en'),
  // T-003 §3.8 — a retry resends this to keep the same run
  run_id: z.string().uuid().optional(),
  // ADR-019 §3.7 — the intake that led here, stored on the Generation row
  intake_id: z.string().uuid().optional(),
});

// POST /documents/preflight — pre-generation verification layer (SCRUM-69)
// Runs before /generate to catch input errors cheaply (~50ms rules + ~1.5s Haiku).
// FAIL-OPEN: if the verifier itself fails, returns { verdict: "pass" } so drafting is never blocked.
router.post(
  '/preflight',
  authenticate,
  requireVerifiedEmail, // T-522 — no model call for an unverified email account
  templateGuard(bodyField('template_id')), // T-375
  async (req: Request, res: Response): Promise<void> => {
    const { template_id, form_data } = req.body as {
      template_id?: string;
      form_data?: Record<string, unknown>;
    };

    if (!template_id || typeof template_id !== 'string') {
      res.status(400).json({ error: 'template_id is required' });
      return;
    }
    if (!form_data || typeof form_data !== 'object') {
      res.status(400).json({ error: 'form_data is required' });
      return;
    }

    // T-451 alias, remove in the post-v1 cleanup
    const aliasedFormData = applyFieldAliases(form_data, template_id);

    try {
      const userId = req.jwtPayload?.sub;
      const result = await preflightCheck(template_id, aliasedFormData, userId, {
        advocateName: req.jwtPayload?.name || undefined,
        enrollmentNumber:
          userId && template_id === 'vakalatnama'
            ? await profileEnrollmentNumber(userId)
            : undefined,
      });

      // Strip internal meta before sending to client
      const { _meta, ...clientResult } = result;
      void _meta; // suppress unused var warning

      res.json(clientResult);
    } catch {
      // FAIL-OPEN: verifier error never blocks generation
      res.json({ verdict: 'pass', questions: [] });
    }
  },
);

// POST /documents/generate-from-template — config-driven generation (SCRUM-43)
router.post(
  '/generate-from-template',
  authenticate,
  requireCurrentPrivacy, // T-343 — new drafts need the current privacy version
  requireVerifiedEmail, // T-522 — before templateGuard and enforceCredits (403 before 402)
  templateGuard(bodyField('template_id')), // T-375
  enforceCredits, // SCRUM-73 / SCRUM-59 — credit gate; replaces enforceFreeLimit
  spendCapCheck,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = templateGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const payload = req.jwtPayload!;
    const { template_id, form_data: postedFormData, run_id, intake_id } = parsed.data;
    // T-451 alias, remove in the post-v1 cleanup
    const form_data = applyFieldAliases(postedFormData, template_id);

    // Load template config
    let templateConfig: ReturnType<typeof loadTemplateConfig>;
    try {
      templateConfig = loadTemplateConfig(template_id);
    } catch (err) {
      // T-357 AC3: a broken override or catalogue gap throws; answer instead of hanging.
      logTemplateConfigError(err);
      res.status(500).json({ error: 'Template config unavailable' });
      return;
    }
    if (!templateConfig) {
      res.status(404).json({ error: `Template "${template_id}" not found` });
      return;
    }

    // Plan check
    if (templateConfig.plan_access === 'pro' && payload.plan !== 'pro') {
      res.status(403).json({ error: 'This template requires a Pro plan' });
      return;
    }

    // Validate form data against template schema
    const validationErrors = validateFormData(templateConfig, form_data);
    if (validationErrors.length > 0) {
      res.status(400).json({ error: 'Form validation failed', issues: validationErrors });
      return;
    }

    // T-003 §3.8 — resolve before streaming starts so X-Run-Id/X-Run-Sequence
    // can go out as response headers no matter how this attempt ends.
    const { runId, runSequence, runType } = await resolveRun(
      payload.sub,
      { templateId: template_id },
      run_id,
    );
    res.setHeader('X-Run-Id', runId);
    res.setHeader('X-Run-Sequence', String(runSequence));
    const startedAt = Date.now();

    // T-226: hold the cost before any model call (402/409 refusals as JSON;
    // no header has been sent yet). Every ending below closes the hold.
    // The pre-stream 500 body below: the error code only (Ajay, T-567), never a
    // message; the detail goes to the log.
    const holdError = { error: 'Generation failed' };
    const inkKey = { runId, runSequence };
    const inkCost = chargedCost(req); // T-227: no default price
    await withInkHold(req, res, inkKey, inkCost, holdError, async (ink) => {
      // Stream the AI response via config-driven pipeline
      let result;
      try {
        result = await streamGenerateFromTemplate(
          {
            templateConfig,
            formData: form_data,
            advocateName: payload.name || undefined,
            enrollmentNumber: await profileEnrollmentNumber(payload.sub),
            userId: payload.sub,
            runId,
            runSequence,
            runType,
          },
          res,
        );
      } catch (genErr) {
        // T-226: a failed run returns its hold, before the response ends.
        await ink.release();
        // GenerationFailedError = mid-stream LLM failure. SSE `event: error` was
        // already emitted and the response is closed. Still record what the
        // attempt actually used (T-003) — a failed generation isn't free. No
        // Ink is spent on a failed attempt.
        if (genErr instanceof GenerationFailedError) {
          await recordGeneration({
            userId: payload.sub,
            docType: TEMPLATE_TO_DOC_TYPE[template_id] || DOC_TYPES.PETITION,
            status: 'failed',
            templateId: template_id,
            intakeId: intake_id,
            aiModel: genErr.aiModel,
            transport: genErr.transport,
            usage: genErr.usage,
            paragraphCount: 0,
            durationMs: Date.now() - startedAt,
            runId,
            runSequence,
            runType,
          });
          // Ended only now — after the row exists — so a fast retry's
          // resolveRun query can never race the write that makes it findable.
          res.end();
          return;
        }

        // Anything else (template-config bug, prompt build error, etc.) — no
        // usage data from the pipeline for this kind of failure, but a runId
        // already exists and was already handed to the client, so it still
        // gets a failed row (T-003 §3.8: "every way the request can fail
        // returns it and saves a failed row").
        const msg = genErr instanceof Error ? genErr.message : 'Unknown generation error';
        console.error(
          `[drafting] generate-from-template threw (runId=${runId}, runType=${runType}):`,
          msg,
        );
        await recordGeneration({
          userId: payload.sub,
          docType: TEMPLATE_TO_DOC_TYPE[template_id] || DOC_TYPES.PETITION,
          status: 'failed',
          templateId: template_id,
          intakeId: intake_id,
          usage: { inputTokens: 0, outputTokens: 0, llmCalls: 0, usageSource: 'provider' },
          paragraphCount: 0,
          durationMs: Date.now() - startedAt,
          runId,
          runSequence,
          runType,
        });
        // T-567 item 41 (Arjun, Ajay): the detail above goes to the log only.
        if (!res.headersSent) {
          // The error code only (Ajay, T-567): no message, never the raw one.
          res.status(500).json({ error: 'Generation failed' });
        } else {
          // AJ-539-M2 text (DRAFT_DID_NOT_FINISH); no inkReleased (release() cannot confirm it).
          res.write(
            `event: error\ndata: ${JSON.stringify({
              reason: 'The draft did not finish.',
              retryable: true,
              code: 'unknown',
              runId,
            })}\n\n`,
          );
          res.end();
        }
        return;
      }

      // Save to DB — must not block the done event if DB is unavailable
      let docId: string | null = null;
      let duplicateAttempt = false;
      try {
        const encryptedContent = encrypt(result.fullText);
        const title =
          `${templateConfig.display_name} — ${String(form_data.court_name || form_data.state || '')}`.slice(
            0,
            300,
          );
        // Sequential, not Promise.all — Generation.documentId needs the Document's _id.
        const doc = await LawieDocument.create({
          userId: payload.sub,
          title,
          docType: TEMPLATE_TO_DOC_TYPE[template_id] || DOC_TYPES.PETITION,
          courtType: String(form_data.court_type || '') || undefined,
          courtName: String(form_data.court_name || ''),
          // T-115a: the case details are stored encrypted only.
          formInputsEnc: sealFormInputs({ ...form_data, template_id }),
          generatedContent: encryptedContent,
          sectionsCited: result.sectionsCited,
          filingChecklistEnc: sealFilingChecklist(result.filingChecklist),
          checklistState: result.filingChecklist.map(() => false),
          status: 'draft',
          runId,
          runSequence,
        });
        docId = String(doc._id);

        const { duplicate } = await recordGeneration({
          userId: payload.sub,
          docType: TEMPLATE_TO_DOC_TYPE[template_id] || DOC_TYPES.PETITION,
          status: 'completed',
          templateId: template_id,
          intakeId: intake_id,
          documentId: doc._id,
          aiModel: result.aiModel,
          transport: result.transport,
          usage: result.usage,
          paragraphCount: result.bodyParaCount,
          durationMs: Date.now() - startedAt,
          runId,
          runSequence,
          runType,
          onlyWhenStrips: result.onlyWhenStrips,
        });
        duplicateAttempt = duplicate;

        if (process.env.NODE_ENV !== 'test') {
          console.info(
            `[drafting] Generated template doc ${docId} for user ${payload.sub} (${template_id}, runId=${runId}, runSequence=${runSequence}, runType=${runType})`,
          );
        }
      } catch (dbErr) {
        console.error(
          `[drafting] DB save failed for template ${template_id} (runId=${runId}, runType=${runType}):`,
          dbErr instanceof Error ? dbErr.message : dbErr,
        );
      }

      // T-226: close the hold by the charge rule — settled when the draft
      // reached the user (saved, or the client is still here), else released.
      // A duplicate Generation (recordGeneration still says so) releases this
      // request's hold: one charge for one logical draft.
      await ink.finish({
        saved: docId !== null,
        duplicate: duplicateAttempt,
        reference: docId
          ? `${templateConfig.display_name} (${docId})`
          : templateConfig.display_name,
      });
      const creditsSpent: Array<{ bucket: string; amount: number }> = [];

      // Send done event — always fires, even if DB save failed
      ink.sendDone({
        complete: true,
        docId,
        runId,
        sectionsCited: result.sectionsCited,
        mandatoryClausesComplete: result.mandatoryClausesComplete,
        creditsSpent,
        // T-197: the signed disclaimer goes with every finished draft.
        disclaimer: FACT_CHECK_DISCLAIMER,
      });
    });
  },
);

// ── POST /documents/generate-from-brief (T-106, ADR-021 sections 3.5, 3.6) ──
//
// A confirmed brief becomes a draft. With a rule pack it is written under the
// pack's rules. With none (`kind: none`) the Drafter writes the whole document
// from the brief alone and the draft always carries the starting-draft label.
// Closed unless `feature.describe_first` is on for the user. The charge, the
// run and the usage record follow the same rules as generate-from-template.

/** What a draft with no rule pack is recorded under: the credit cost, the run and the usage row. */
const GUIDED_ID = 'guided';

const briefGenerateSchema = z.object({
  /** A rule-pack id, or `none` for a document with no rule pack. */
  kind: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'must be a document kind'),
  /** For `none`: the name shown for the document, and whether it is for a court. */
  kind_name: z.string().max(120).optional(),
  court_document: z.boolean().optional(),
  values: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        value: z.union([z.string().max(6000), z.array(z.string().max(500)).max(30)]),
        source: z.enum(['description', 'user']).default('user'),
        quote: z.string().max(1000).optional(),
        label: z.string().max(200).optional(),
      }),
    )
    .max(200)
    .default([]),
  court: z
    .object({
      state: z.string().max(200).nullish(),
      court_type: z.string().max(200).nullish(),
      court: z.string().max(200).nullish(),
    })
    .optional(),
  language: z.enum(['en', 'hi', 'bilingual']).default('en'),
  /** The number of numbered paragraphs wanted in the body. */
  paragraphs: z.number().int().min(1).max(100).optional(),
  run_id: z.string().uuid().optional(),
  intake_id: z.string().uuid().optional(),
  /**
   * T-136: the matter as the advocate typed it, word for word. It reaches the
   * Drafter of a document with a rule pack under "described". It is kept only
   * inside the encrypted brief of the document, and is never logged.
   */
  described: z.string().max(INTAKE_LIMITS.descriptionMax).optional(),
  /**
   * T-147c: the advocate's fact ledger for this brief. Read only when
   * `feature.fact_ledger` is on for the user and the document has a rule
   * pack; then the Drafter is given the ledger's facts and the pack's
   * skeleton only. A ledger that is not this user's, or not for this
   * document, is a 404, as in T-147b.
   */
  ledger_id: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'must be a ledger id')
    .optional(),
});

/** The credit gate reads `template_id`. For a brief the rule pack is the template. */
function kindAsTemplateId(req: Request, _res: Response, next: NextFunction): void {
  const body = req.body as { kind?: unknown; template_id?: unknown } | undefined;
  if (body && typeof body.kind === 'string') {
    body.template_id = body.kind === 'none' ? GUIDED_ID : body.kind;
  }
  next();
}

/**
 * T-423: the values the brief accepted, as [{key, value}] for pickPartyInputs.
 * Only items with a value, not answered "Not known" (asked_empty) and not
 * waiting for the advocate to confirm (unconfirmed). Never the raw request values.
 */
function acceptedBriefValues(items: BriefItem[]): Array<{ key: string; value: string | string[] }> {
  const out: Array<{ key: string; value: string | string[] }> = [];
  for (const item of items) {
    if (item.asked_empty || item.unconfirmed) continue;
    const v = item.value;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) ? v.length === 0 : v.trim() === '') continue;
    out.push({ key: item.key, value: v });
  }
  return out;
}

async function describeFirstOnly(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!(await isDescribeFirstEnabled(req.jwtPayload!.sub))) {
    res.status(404).json({ error: 'not_enabled' });
    return;
  }
  next();
}

router.post(
  '/generate-from-brief',
  authenticate,
  requireCurrentPrivacy, // T-343 — new drafts need the current privacy version
  requireVerifiedEmail, // T-522 — before templateGuard and enforceCredits (403 before 402)
  describeFirstOnly,
  templateGuard(bodyField('kind')), // T-375
  kindAsTemplateId,
  enforceCredits,
  spendCapCheck,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = briefGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      // Messages come from the schema only, never from the submitted text.
      res.status(400).json({
        error: 'Invalid request',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }
    const payload = req.jwtPayload!;
    const { kind, values, court, language, run_id, intake_id } = parsed.data;
    const guided = kind === 'none';
    // T-136: only a document with a rule pack is drafted from the description.
    // For any other it is not used and not kept.
    const described = guided ? '' : (parsed.data.described ?? '').trim();
    /** What the run, the charge and the usage row are recorded under. */
    const recordId = guided ? GUIDED_ID : kind;

    const pack = guided ? null : loadRulePack(kind);
    let templateConfig: ReturnType<typeof loadTemplateConfig>;
    try {
      templateConfig = pack ? loadTemplateConfig(kind) : null;
    } catch (err) {
      // T-357 AC3: a broken override or catalogue gap throws; answer instead of hanging.
      logTemplateConfigError(err);
      res.status(500).json({ error: 'Template config unavailable' });
      return;
    }
    if (!guided && (!pack || !templateConfig)) {
      res.status(404).json({ error: 'Document kind not found' });
      return;
    }
    if (templateConfig?.plan_access === 'pro' && payload.plan !== 'pro') {
      res.status(403).json({ error: 'This document requires a Pro plan' });
      return;
    }

    // T-147c: the ledger, when the switch is on. Without both, nothing below changes.
    let ledger: {
      id: string;
      version: number;
      facts: LedgerFact[];
      unresolved: LedgerUnresolvedFact[];
      runType: FactDiffRunType;
      lists: AvermentLists;
    } | null = null;
    if (
      !guided &&
      parsed.data.ledger_id !== undefined &&
      (await isFactLedgerEnabled(payload.sub))
    ) {
      const doc = await loadOwnLedger(parsed.data.ledger_id, payload.sub);
      if (!doc || doc.documentKind !== kind) {
        res.status(404).json({ error: 'Ledger not found' });
        return;
      }
      let lists: AvermentLists;
      try {
        lists = loadAvermentLists(kind);
      } catch (err) {
        // Ids only: never a fact value.
        console.error(
          `[drafting] averment list unreadable (kind=${kind}):`,
          err instanceof Error ? err.name : 'unknown',
        );
        res.status(503).json({ error: 'averments_unavailable' });
        return;
      }
      // T-115a: the ledger is encrypted; a wrong key or a damaged factsEnc
      // throws. Answer before any Ink is held (withInkHold is further down).
      let state: ReturnType<typeof currentState>;
      try {
        state = currentState(doc);
      } catch (err) {
        // Ids only: never a fact value.
        console.error(
          `[drafting] ledger unreadable (ledgerId=${String(doc.id)}):`,
          err instanceof Error ? err.name : 'unknown',
        );
        if (!res.headersSent) res.status(503).json({ error: 'ledger_unavailable' });
        return;
      }
      ledger = {
        id: String(doc.id),
        version: doc.currentVersion,
        // T-192: the s.138 date checks, worked out by code per request from the
        // stored user/asked facts. A computed fact is appended only on a pass
        // and is never stored; an unresolved input counts as missing. For any
        // other pack the facts are as stored.
        facts: withS138DateChecks(
          state.facts,
          kind,
          state.unresolved.map((u) => u.key),
        ),
        unresolved: state.unresolved,
        runType: factDiffRunType(doc.runType),
        lists,
      };
    }

    // The brief is worked out again here. What the browser says about it is not
    // trusted: for a document with no rule pack, a court signal in the user's
    // words makes it a court document whatever was sent (T-107, section 2).
    const briefRequest = {
      kind,
      kindName: parsed.data.kind_name,
      courtDocument: parsed.data.court_document,
      values,
      court: court ?? undefined,
    };
    const brief = updateBrief(briefRequest);
    // T-107, section 3: nothing for the Supreme Court is drafted without a rule pack.
    if (
      guided &&
      brief &&
      (namesSupremeCourt(`${brief.kind.name}\n${briefText(brief)}`) ||
        brief.court.court_type === COURT_TYPES.SUPREME_COURT)
    ) {
      res.status(400).json({ error: 'no_match' });
      return;
    }
    if (!brief) {
      res.status(404).json({ error: 'Document kind not found' });
      return;
    }
    // ADR-021 decision D2: a court document is not drafted without the court and the parties.
    // T-498: with this generation's ledger, a party name it holds does not block,
    // as on the brief. Only this check reads it: the brief the Drafter is given
    // is the one above, unchanged. Without a ledger this is the same brief.
    const confirmable = ledger
      ? (updateBrief({ ...briefRequest, ledger: { facts: ledger.facts } }) ?? brief)
      : brief;
    if (!confirmable.can_confirm) {
      res.status(400).json({
        error: 'brief_not_confirmed',
        message: confirmable.confirm_message,
        blockers: confirmable.confirm_blockers,
      });
      return;
    }

    // ADR-021 rule 3: the court comes from the courts list only.
    let courtData: CourtLookupData | undefined;
    if (brief.kind.court_document) {
      const found = await Court.findOne({ courtId: brief.court.court, isActive: true })
        .maxTimeMS(5000)
        .lean();
      if (!found) {
        res.status(400).json({
          error: 'court_not_found',
          message: 'Choose the court from the list to continue.',
        });
        return;
      }
      courtData = {
        designation: found.designation,
        city: found.city,
        caseNomenclature: found.caseNomenclature,
        formattingRulesRef: found.formattingRulesRef,
        courtType: found.courtType,
        state: found.state,
        courtRule: loadCourtRule(found.formattingRulesRef) ?? undefined,
      };
    }

    const docType = guided ? DOC_TYPES.GUIDED : TEMPLATE_TO_DOC_TYPE[kind] || DOC_TYPES.PETITION;
    const { runId, runSequence, runType } = await resolveRun(
      payload.sub,
      { templateId: recordId },
      run_id,
    );
    res.setHeader('X-Run-Id', runId);
    res.setHeader('X-Run-Sequence', String(runSequence));
    const startedAt = Date.now();

    // T-226: hold the cost before any model call (402/409 refusals as JSON;
    // no header has been sent yet). Every ending below closes the hold.
    // The pre-stream 500 body below.
    const holdError = { error: 'Generation failed' };
    const inkKey = { runId, runSequence };
    const inkCost = chargedCost(req); // T-227: no default price
    await withInkHold(req, res, inkKey, inkCost, holdError, async (ink) => {
      let result;
      try {
        const common = {
          brief,
          language,
          targetParagraphs: clampTarget(parsed.data.paragraphs),
          courtData,
          userId: payload.sub,
          runId,
          runSequence,
          runType,
        };
        result =
          pack && templateConfig
            ? await streamGenerateFromBrief(
                {
                  ...common,
                  pack,
                  templateConfig,
                  ...(described ? { described } : {}),
                  ...(ledger
                    ? {
                        ledger: {
                          facts: ledger.facts,
                          lists: ledger.lists,
                          unresolved: ledger.unresolved,
                        },
                      }
                    : {}),
                  advocateName: payload.name || undefined,
                  enrollmentNumber: await profileEnrollmentNumber(payload.sub),
                },
                res,
              )
            : await streamGenerateGuided(
                { ...common, advocateName: payload.name || undefined },
                res,
              );
      } catch (genErr) {
        // T-226: a failed run returns its hold, before the response ends.
        await ink.release();
        // A failed run is recorded with what it used and charges nothing (T-003).
        const failed = genErr instanceof GenerationFailedError ? genErr : null;
        if (!failed) {
          console.error(
            `[drafting] generate-from-brief threw (runId=${runId}, runType=${runType}):`,
            genErr instanceof Error ? genErr.name : 'unknown',
          );
        }
        await recordGeneration({
          userId: payload.sub,
          docType,
          status: 'failed',
          templateId: recordId,
          intakeId: intake_id,
          aiModel: failed?.aiModel,
          transport: failed?.transport,
          usage: failed?.usage ?? {
            inputTokens: 0,
            outputTokens: 0,
            llmCalls: 0,
            usageSource: 'provider',
          },
          paragraphCount: 0,
          durationMs: Date.now() - startedAt,
          runId,
          runSequence,
          runType,
          ledger: ledger ? 'on' : 'off',
        });
        if (failed) {
          // The error event was already sent. End only now, after the row exists.
          res.end();
        } else if (!res.headersSent) {
          res.status(500).json({ error: 'Generation failed' });
        } else {
          // T-567 item 41: AJ-539-M2 text (DRAFT_DID_NOT_FINISH); the error name is
          // logged above. No inkReleased (release() cannot confirm it).
          res.write(
            `event: error\ndata: ${JSON.stringify({
              reason: 'The draft did not finish.',
              retryable: true,
              code: 'unknown',
              runId,
            })}\n\n`,
          );
          res.end();
        }
        return;
      }

      // Save. A database failure must not stop the done event.
      let docId: string | null = null;
      let duplicateAttempt = false;
      try {
        const courtType = brief.court.court_type ?? '';
        const doc = await LawieDocument.create({
          userId: payload.sub,
          title: `${brief.kind.name} — ${courtData?.designation ?? ''}`
            .replace(/ — $/, '')
            .slice(0, 300),
          docType,
          courtType: (Object.values(COURT_TYPES) as string[]).includes(courtType)
            ? courtType
            : undefined,
          courtName: brief.court.court ?? '',
          // T-381: the party inputs the annexures pack needs (the pack's own role
          // fields, by last segment) and the court labels: court_type always,
          // state only on a State row (Ajay, Addendum 4). Case details, so sealed
          // like every other write (T-115a). The brief is encrypted below.
          // T-423: party inputs only from values the brief accepted, and the
          // State's display name from the Court row (never the picker id).
          formInputsEnc: sealFormInputs({
            ...pickPartyInputs(recordId, acceptedBriefValues(brief.items)),
            ...(brief.court.court_type ? { court_type: brief.court.court_type } : {}),
            ...(courtData?.state && storesState(recordId) ? { state: courtData.state } : {}),
            template_id: recordId,
            source: 'brief',
          }),
          generatedContent: encrypt(result.fullText),
          sectionsCited: result.sectionsCited,
          filingChecklistEnc: sealFilingChecklist(result.filingChecklist),
          checklistState: result.filingChecklist.map(() => false),
          status: 'draft',
          runId,
          runSequence,
          rulePackId: pack?.id,
          startingDraft: result.startingDraft,
          brief: encrypt(
            JSON.stringify({
              kind,
              ...(guided
                ? { kind_name: brief.kind.name, court_document: brief.kind.court_document }
                : {}),
              language,
              court: brief.court,
              values,
              // T-136: the description is kept here and nowhere else: with the
              // brief it belongs to, under the same encryption, for as long.
              ...(described ? { described } : {}),
              // T-147c: which ledger version the draft was written from. Ids only.
              ...(ledger ? { ledger_id: ledger.id, ledger_version: ledger.version } : {}),
            }),
          ),
        });
        docId = String(doc._id);

        const { duplicate } = await recordGeneration({
          userId: payload.sub,
          docType,
          status: 'completed',
          templateId: recordId,
          intakeId: intake_id,
          documentId: doc._id,
          aiModel: result.aiModel,
          transport: result.transport,
          usage: result.usage,
          paragraphCount: result.bodyParaCount,
          durationMs: Date.now() - startedAt,
          runId,
          runSequence,
          runType,
          ledger: ledger ? 'on' : 'off',
        });
        duplicateAttempt = duplicate;

        if (process.env.NODE_ENV !== 'test') {
          console.info(
            `[drafting] Drafted from a brief: doc ${docId} for user ${payload.sub} (${kind}, runId=${runId}, runSequence=${runSequence}, repaired=${result.repaired}, missingClauses=${result.missingClauses.length}, findings=${result.warnings.length}, startingDraft=${result.startingDraft})`,
          );
        }
      } catch (dbErr) {
        console.error(
          `[drafting] DB save failed for a draft from a brief (${kind}, runId=${runId}):`,
          dbErr instanceof Error ? dbErr.name : 'unknown',
        );
      }

      // T-147d: the fact-diff log and the placeholder rate, for a ledger draft.
      // Its own try: a failure here never stops the draft. Ids only in the log line.
      // T-373 (Arjun B): on D1 the read-only findings come in factDiff, tagged d1.
      const factOutcome = result.factCheck ?? result.factDiff?.outcome;
      if (ledger && pack && factOutcome && !duplicateAttempt) {
        try {
          await writeFactCheckLog({
            outcome: factOutcome,
            path: result.factDiff?.path ?? 'legacy',
            runId,
            documentId: docId,
            userId: payload.sub,
            ledgerId: ledger.id,
            rulePack: pack.id,
            rulePackVersion: rulePackVersionOf(pack),
            runType: ledger.runType,
            requiredFactCount: buildChecklist(pack).filter((i) => i.required).length,
            deliveredText: result.fullText,
          });
        } catch (logErr) {
          console.error(
            `[drafting] fact-diff log write failed (kind=${kind}, runId=${runId}):`,
            logErr instanceof Error ? logErr.name : 'unknown',
          );
        }
      }

      // A demand signal for every draft with no rule pack: which documents to
      // write rules for next. It carries no user text, not even the name.
      if (guided && !duplicateAttempt) {
        try {
          await Event.create({
            userId: payload.sub,
            type: 'demand.guided_draft',
            ...(docId ? { docId } : {}),
            metadata: {
              intakeId: intake_id ?? null,
              runId,
              isCourtDocument: brief.kind.court_document,
            },
          });
        } catch (eventErr) {
          console.error(
            `[drafting] failed to record demand.guided_draft (runId=${runId}):`,
            eventErr instanceof Error ? eventErr.name : 'unknown',
          );
        }
      }

      // Charged once, after a successful draft. The repair pass is not charged:
      // the charge is the document's fixed cost (held up front), whatever the
      // run used. T-226: settled when the draft reached the user, else released;
      // a duplicate attempt releases this request's hold.
      await ink.finish({
        saved: docId !== null,
        duplicate: duplicateAttempt,
        // No user text in the ledger: a draft with no rule pack has a name the user may have typed.
        reference: `${pack ? pack.name : 'Starting draft'}${docId ? ` (${docId})` : ''}`,
      });

      ink.sendDone({
        complete: true,
        docId,
        runId,
        sectionsCited: result.sectionsCited,
        /** False when the document has no rule pack: the label is always on and no clause was checked. */
        rulePack: !guided,
        mandatoryClausesComplete: guided ? null : result.mandatoryClausesComplete,
        // T-373: on a D1 pack the missing clauses are read off the renderer's rendered[].
        missingClauses: (result.rendered
          ? missingFromRendered(result.rendered)
          : result.missingClauses
        ).map((m) => ({ id: m.id, title: m.title })),
        repaired: result.repaired,
        // T-480: which drafting path ran (on = written from a fact ledger).
        ledger: ledger ? 'on' : 'off',
        startingDraft: result.startingDraft,
        startingDraftLabel: result.startingDraft ? STARTING_DRAFT_LABEL : null,
        labelReason: result.labelReason,
        creditsSpent: [],
        // T-197: the signed disclaimer goes with every finished draft, banner or not.
        disclaimer: FACT_CHECK_DISCLAIMER,
        // T-147d: what the fact verifier needs the advocate to check. Ledger path only.
        // T-373 (Arjun B): never on D1; the panel there is rendered[] only.
        ...(!result.rendered && 'factCheck' in result && result.factCheck
          ? { factCheck: { banner: result.factCheck.banner } }
          : {}),
        // T-373 (ADR-025 renderer rule 5): the clauses the renderer printed, for the
        // checks panel. Ids, statuses, blank labels and reasons only; D1 packs only.
        ...(result.rendered ? { rendered: result.rendered } : {}),
      });
    });
  },
);

// POST /documents/generate — retired (T-443, Arjun 15 Oct 2026). Nothing in web
// or the gateway calls it, and its legacy prompt could produce a wrong-law draft.
// Answers 410 before any auth, privacy, template, Ink or validation step, and
// does nothing else: no hold, no Generation row, no model call, no document.
router.post('/generate', (_req: Request, res: Response): void => {
  res.status(410).json({
    error: 'Gone',
    message: 'This endpoint has been retired. Use the document flow in the app.',
  });
});

const patchSchema = z.object({
  finalContent: z.string().min(1).max(200_000).optional(),
  status: z.enum(['draft', 'finalised']).optional(),
  checklistState: z.array(z.boolean()).optional(),
});

// GET /documents/:id — fetch a single document for the editor
router.get(
  '/:id',
  validateObjectId,
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const payload = req.jwtPayload!;
    const doc = await LawieDocument.findOne({
      _id: req.params.id,
      userId: payload.sub,
      isDeleted: { $ne: true },
    }).lean();

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // A wrong key or a damaged value throws (T-115a); answer 500 rather than
    // leave the request hanging. Only the id and the error name are logged.
    let content: string;
    let filingChecklist: string[];
    try {
      content = doc.finalContent ? decrypt(doc.finalContent) : decrypt(doc.generatedContent);
      filingChecklist = readFilingChecklist(doc);
    } catch (err) {
      console.error(
        `[drafting] Get document: could not read document ${String(doc._id)}:`,
        err instanceof Error ? err.name : 'UnknownError',
      );
      if (!res.headersSent) res.status(500).json({ error: 'Could not read this document' });
      return;
    }

    // T-381: whether the page offers the annexures pack. A court document (not
    // one of the not_court_documents) with a client or opposite-party name by
    // the signed mapping. An unreadable value only hides the card; only the id
    // and the error name are logged.
    let courtDocument = false;
    let hasParty = false;
    try {
      const { packId, mapped, briefCourtDocument } = partyMappingOf(doc, readFormInputs(doc) ?? {});
      courtDocument =
        packId === GUIDED_ID
          ? briefCourtDocument === true
          : packId !== '' && isCourtDocument(packId);
      hasParty = mapped.clientName !== '' || mapped.counterpartName !== '';
    } catch (err) {
      console.error(
        `[drafting] Get document: could not read the parties of document ${String(doc._id)}:`,
        err instanceof Error ? err.name : 'UnknownError',
      );
    }

    res.json({
      _id: doc._id,
      title: doc.title,
      docType: doc.docType,
      courtType: doc.courtType,
      courtName: doc.courtName,
      content,
      status: doc.status,
      sectionsCited: doc.sectionsCited,
      filingChecklist,
      checklistState: doc.checklistState ?? [],
      exportedAs: doc.exportedAs,
      version: doc.version,
      // T-106 — the label is the server's. The editor shows it and cannot remove it.
      rulePackId: doc.rulePackId ?? null,
      startingDraft: doc.startingDraft === true,
      startingDraftLabel: doc.startingDraft === true ? STARTING_DRAFT_LABEL : null,
      // The DOCX is made in the browser, so the footer text is sent with the document (T-125).
      startingDraftFooter: doc.startingDraft === true ? STARTING_DRAFT_FOOTER : null,
      // T-197: the signed disclaimer the document page shows on every draft.
      disclaimer: FACT_CHECK_DISCLAIMER,
      // T-381: the annexures card shows when both are true.
      courtDocument,
      hasParty,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  },
);

// PATCH /documents/:id — auto-save user edits from the editor
router.patch(
  '/:id',
  validateObjectId,
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const payload = req.jwtPayload!;
    const ownDoc = { _id: req.params.id, userId: payload.sub, isDeleted: { $ne: true } };
    const setFields: Record<string, unknown> = {};
    if (parsed.data.finalContent) {
      setFields.finalContent = encrypt(parsed.data.finalContent);
    }
    if (parsed.data.status) {
      setFields.status = parsed.data.status;
    }
    if (parsed.data.checklistState) {
      setFields.checklistState = parsed.data.checklistState;
    }

    if (Object.keys(setFields).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    // T-152: saving the text the document already has is not an edit, so it makes no new
    // version. Only the text is compared; a status or checklist change still saves as before.
    if (setFields.finalContent !== undefined) {
      const current = await LawieDocument.findOne(ownDoc)
        .select('finalContent generatedContent version status updatedAt')
        .lean();
      if (!current) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      const currentContent = current.finalContent
        ? decrypt(current.finalContent)
        : decrypt(current.generatedContent);
      if (currentContent === parsed.data.finalContent) {
        delete setFields.finalContent;
        if (Object.keys(setFields).length === 0) {
          res.json({
            version: current.version,
            status: current.status,
            updatedAt: current.updatedAt,
          });
          return;
        }
      }
    }

    const doc = await LawieDocument.findOneAndUpdate(
      ownDoc,
      { $set: setFields, $inc: { version: 1 } },
      { new: true, select: 'version status updatedAt' },
    );

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json({ version: doc.version, status: doc.status, updatedAt: doc.updatedAt });
  },
);

// DELETE /documents/:id — T-115b: hard delete, owner only (Arjun, T-115 decision 11).
// Marks and hides the document first, then erases it (services/document-erase.service.ts).
// 200 only once every step is done; 202 { status: 'pending' } when a step failed (the
// document is already hidden and the sweep finishes it). Another user's id, an unknown
// id or a finished erase is 404. Logs ids and the error name only.
router.delete(
  '/:id',
  validateObjectId,
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const payload = req.jwtPayload!;
    const own = { _id: req.params.id, userId: payload.sub };
    let found: unknown;
    try {
      found = await LawieDocument.findOneAndUpdate(
        { ...own, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, 'deletion.requestedAt': new Date() } },
        { new: true, projection: { _id: 1 } },
      ).lean();
      // A repeat while an erase is still pending re-runs it.
      if (!found) {
        found = await LawieDocument.findOne({ ...own, 'deletion.requestedAt': { $exists: true } })
          .select('_id')
          .lean();
      }
    } catch (err) {
      logger.error(
        {
          documentId: req.params.id,
          collection: 'documents',
          errName: err instanceof Error ? err.name : 'UnknownError',
        },
        'Delete document: could not mark the document',
      );
      res.status(500).json({ error: 'Could not delete this document' });
      return;
    }
    if (!found) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const result = await eraseDocument(req.params.id);
    if (!result.done) {
      res.status(202).json({ status: 'pending' });
      return;
    }
    res.status(200).json({ status: 'deleted' });
  },
);

// POST /documents/:id/export/pdf — server-side PDF export
router.post(
  '/:id/export/pdf',
  validateObjectId,
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const payload = req.jwtPayload!;
    const doc = await LawieDocument.findOne({
      _id: req.params.id,
      userId: payload.sub,
      isDeleted: { $ne: true },
    }).lean();

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const content = doc.finalContent ? decrypt(doc.finalContent) : decrypt(doc.generatedContent);
    const isFree = payload.plan !== 'pro';

    // T-194: count the blanks of the saved draft this PDF is built from (Priya
    // decision 2). Each prints bold and highlighted, and a draft with any carries
    // "DRAFT — N items to be confirmed" on every page. None: as before.
    const blankCount = blanksInContent(content, findBlanks).length;
    const html = contentToHtml(content, isFree, doc.startingDraft === true, { findBlanks });
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderPdf(html, {
        headerText: blankCount > 0 ? draftHeaderText(blankCount) : undefined,
      });
    } catch (pdfErr) {
      console.error(
        '[drafting] Puppeteer PDF render failed:',
        pdfErr instanceof Error ? pdfErr.message : pdfErr,
      );
      res.status(500).json({ error: 'PDF rendering failed' });
      return;
    }

    // Track export in exportedAs
    await LawieDocument.updateOne(
      { _id: req.params.id },
      { $addToSet: { exportedAs: 'pdf' }, $set: { status: 'exported' } },
    );

    // Activation telemetry — fire activation_first_export once per user
    const existingActivation = await Event.findOne({
      userId: payload.sub,
      type: 'activation_first_export',
    }).lean();

    if (!existingActivation) {
      await Event.create({
        userId: payload.sub,
        type: 'activation_first_export',
        docId: doc._id,
        metadata: { format: 'pdf', docType: doc.docType },
      });
    }

    // Always log the export event
    await Event.create({
      userId: payload.sub,
      type: 'draft.exported',
      docId: doc._id,
      metadata: { format: 'pdf', docType: doc.docType },
    });

    const filename = `${doc.title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  },
);

// POST /documents/:id/export/docx — track DOCX export (client-side generation, server tracks event)
router.post(
  '/:id/export/docx',
  validateObjectId,
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const payload = req.jwtPayload!;
    const doc = await LawieDocument.findOne({
      _id: req.params.id,
      userId: payload.sub,
      isDeleted: { $ne: true },
    }).lean();

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Track export
    await LawieDocument.updateOne(
      { _id: req.params.id },
      { $addToSet: { exportedAs: 'docx' }, $set: { status: 'exported' } },
    );

    // Activation telemetry
    const existingActivation = await Event.findOne({
      userId: payload.sub,
      type: 'activation_first_export',
    }).lean();

    if (!existingActivation) {
      await Event.create({
        userId: payload.sub,
        type: 'activation_first_export',
        docId: doc._id,
        metadata: { format: 'docx', docType: doc.docType },
      });
    }

    await Event.create({
      userId: payload.sub,
      type: 'draft.exported',
      docId: doc._id,
      metadata: { format: 'docx', docType: doc.docType },
    });

    res.json({ success: true });
  },
);

/**
 * T-381: a document's pack id and its party mapping (brief-party-fields.ts).
 * The pack id is the brief's rule pack, else the form's template_id. A brief
 * draft made before T-381 sealed no party inputs, so its encrypted brief is
 * read instead; a guided brief is read for whether it is a court document.
 * Throws when the stored brief cannot be decrypted or parsed. Logs nothing.
 */
function partyMappingOf(
  doc: { rulePackId?: string | null; brief?: string | null },
  formData: Record<string, unknown>,
): { packId: string; mapped: PartyFieldsResult; briefCourtDocument?: boolean } {
  const packId =
    doc.rulePackId || (typeof formData.template_id === 'string' ? formData.template_id.trim() : '');
  const fromBrief =
    formData.source === 'brief' && typeof doc.brief === 'string' && doc.brief !== '';
  const sealed = hasPartyInputs(packId, formData);
  if (fromBrief && (packId === GUIDED_ID || !sealed)) {
    const stored = readStoredBrief(decrypt(doc.brief as string));
    return {
      packId,
      mapped: mapPartyFields(packId, sealed ? formData : flattenPartyValues(stored.values)),
      ...(stored.courtDocument !== undefined ? { briefCourtDocument: stored.courtDocument } : {}),
    };
  }
  return { packId, mapped: mapPartyFields(packId, formData) };
}

// ── T-579: annexures pack rate limit (Arjun): 10 per hour per user, both formats ──

/** The signed T-221 limit line and its variants (as the gateway's RATE_LIMIT_MESSAGES). */
const ANNEXURES_LIMIT_MESSAGES = {
  minutes: 'Too many requests. Please wait {n} minutes, then try again.',
  oneMinute: 'Too many requests. Please wait 1 minute, then try again.',
  unknown: 'Too many requests. Please wait a few minutes, then try again.',
} as const;

function annexuresLimitMessage(retryAfterSeconds: number): string {
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    return ANNEXURES_LIMIT_MESSAGES.unknown;
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  if (minutes === 1) return ANNEXURES_LIMIT_MESSAGES.oneMinute;
  return ANNEXURES_LIMIT_MESSAGES.minutes.replace('{n}', String(minutes));
}

export const ANNEXURES_RATE_LIMIT = { max: 10, windowSeconds: 3600 } as const;

/**
 * T-579: per-user limiter for POST /:id/annexures-pack, counted in Redis by
 * user id (`rl:annexures:<sub>`), so it holds across instances. Every
 * authenticated request counts, PDF or HTML. Over the limit: 429 with
 * Retry-After (seconds) and `{ error: <signed T-221 line> }`, the gateway's
 * body. A Redis failure lets the request through (fail open: no Ink and no
 * model call sit behind this route); only the error name is logged.
 */
export function createAnnexuresRateLimiter(
  opts: { max?: number; windowSeconds?: number; skip?: boolean } = {},
) {
  const max = opts.max ?? ANNEXURES_RATE_LIMIT.max;
  const windowSeconds = opts.windowSeconds ?? ANNEXURES_RATE_LIMIT.windowSeconds;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (opts.skip) return next();
    const sub = req.jwtPayload?.sub;
    if (!sub) return next();
    const key = `rl:annexures:${sub}`;
    let count: number;
    let ttl: number;
    try {
      count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      ttl = await redis.ttl(key);
      // A key left without an expiry would block the user for good.
      if (ttl < 0) {
        await redis.expire(key, windowSeconds);
        ttl = windowSeconds;
      }
    } catch (err) {
      console.error(
        '[drafting] Annexures rate limit check failed:',
        err instanceof Error ? err.name : 'UnknownError',
      );
      return next();
    }
    if (count > max) {
      res.setHeader('Retry-After', String(ttl));
      res.status(429).json({ error: annexuresLimitMessage(ttl) });
      return;
    }
    next();
  };
}

// Skipped under Jest: existing route suites make more than 10 calls as one user.
const annexuresRateLimiter = createAnnexuresRateLimiter({ skip: env.NODE_ENV === 'test' });

// POST /documents/:id/annexures-pack — SCRUM-65: generate 7 mandatory annexures as a multi-page PDF
// Court-rule aware: designation, verification language, party labels from court_rules JSON.
// Returns: application/pdf — single PDF with each annexure on a fresh page.
// T-579: `?format=html` returns application/json `{ title, filename, html }` instead
// (the same annexures HTML the PDF is rendered from, for the web's Word export):
// same lookup, errors and export mark, no Chromium, no Ink.
router.post(
  '/:id/annexures-pack',
  validateObjectId,
  authenticate,
  annexuresRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const asHtml = req.query.format === 'html';
    const payload = req.jwtPayload!;
    const doc = await LawieDocument.findOne({
      _id: req.params.id,
      userId: payload.sub,
      isDeleted: { $ne: true },
    }).lean();

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Decrypt content for paragraph count estimation, and read form_data (stored
    // on the document, encrypted (T-115a) or legacy plain). A wrong key or a
    // damaged value throws; answer 500 rather than leave the request hanging.
    // Only the id and the error name are logged, never a message or content.
    let bodyParaCount: number;
    let formData: Record<string, unknown>;
    let party: PartyFieldsResult;
    try {
      const content = doc.finalContent ? decrypt(doc.finalContent) : decrypt(doc.generatedContent);
      bodyParaCount = estimateBodyParaCount(content);
      formData = readFormInputs(doc) ?? {};
      // T-381: the client and the opposite party by Ajay's signed rule. An
      // older brief draft is mapped from its encrypted brief.
      party = partyMappingOf(doc, formData).mapped;
    } catch (err) {
      console.error(
        `[drafting] Annexures pack: could not read document ${String(doc._id)}:`,
        err instanceof Error ? err.name : 'UnknownError',
      );
      if (!res.headersSent) res.status(500).json({ error: 'Annexures pack generation failed' });
      return;
    }

    // T-381 (Ajay, Addendum 2): a party name never prints as a blank line. A
    // missing client or opposite-party name is refused before anything is
    // rendered, recorded or charged.
    if (party.missing.length > 0) {
      res.status(422).json({ error: 'party_details_missing', missing: party.missing });
      return;
    }
    formData = applyPartyFields(formData, party);

    // T-156: the chosen court, looked up the same way the draft paths do. The
    // brief path saves its court id only in doc.courtName (its formInputs hold
    // only the party inputs and court labels, T-381); the template path saves it in both. No court found means
    // no courtData, and the pack keeps its court-rules designation.
    let courtData: CourtLookupData | undefined;
    const courtId = String(doc.courtName || formData.court_name || '').trim();
    if (courtId) {
      try {
        const found = await Court.findOne({ courtId, isActive: true }).maxTimeMS(5000).lean();
        if (found) {
          courtData = {
            designation: found.designation,
            city: found.city,
            caseNomenclature: found.caseNomenclature,
            formattingRulesRef: found.formattingRulesRef,
            courtType: found.courtType,
            state: found.state,
            courtRule: loadCourtRule(found.formattingRulesRef) ?? undefined,
          };
        }
      } catch (dbErr) {
        console.warn(
          `[drafting] Annexures court lookup failed for "${courtId}", using court rules:`,
          dbErr instanceof Error ? dbErr.message : dbErr,
        );
      }
    }

    let pdfBuffer: Buffer | undefined;
    let html: string | undefined;
    try {
      const packInput = {
        formData,
        bodyParaCount,
        advocateName: payload.name || undefined,
        enrollmentNumber: await profileEnrollmentNumber(payload.sub),
        courtData,
      };
      if (asHtml) html = buildAnnexuresHtml(packInput).html;
      else pdfBuffer = await buildAnnexuresPack(packInput);
    } catch (err) {
      console.error(
        '[drafting] Annexures pack render failed:',
        err instanceof Error ? err.message : err,
      );
      res.status(500).json({ error: 'Annexures pack generation failed' });
      return;
    }

    // Track export
    await LawieDocument.updateOne(
      { _id: req.params.id },
      { $addToSet: { exportedAs: 'annexures' } },
    );

    await Event.create({
      userId: payload.sub,
      type: 'draft.exported',
      docId: doc._id,
      metadata: { format: asHtml ? 'annexures_docx' : 'annexures_pdf', docType: doc.docType },
    });

    if (html !== undefined) {
      res.json({ title: doc.title, filename: annexuresFilename(doc.title, 'docx'), html });
      return;
    }

    const filename = annexuresFilename(doc.title, 'pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer!.length);
    res.send(pdfBuffer);
  },
);

export default router;
