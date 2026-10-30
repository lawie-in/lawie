import crypto from 'crypto';

import { COURT_TYPES, DOC_TYPES, DocType, requireCurrentPrivacy } from '@lawie/shared';
import type { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';
import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import logger from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import {
  chargedCost,
  enforceCredits,
  enforceCreditsForBrief,
  insufficientInkBody,
} from '../middleware/enforceCredits';
import { FREE_TIER_MONTHLY_LIMIT } from '../middleware/enforceFreeLimit';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail';
import { spendCapCheck } from '../middleware/spendCap';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { effectiveRunType, Generation, RunType } from '../models/Generation.model';
import { User } from '../models/User.model';
import {
  formGateFiles,
  GenerationFailedError,
  GenerationFailure,
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
import { AvermentLists, factEntriesByKey, loadAvermentLists } from '../services/averments';
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
  displayTitle,
  resolveCourtLabel,
  resolveCourtLabels,
} from '../services/court-label.service';
import { courtUnavailableBody, resolveFormCourt } from '../services/court-resolve.service';
import {
  costForTemplate,
  DraftQuote,
  extendInkHold,
  getCreditBalance,
  holdInk,
  inkFromUnits,
  INK_HOLD_HEARTBEAT_MS,
  INK_HOLD_MAX_HEARTBEAT_MS,
  installParagraphConfigSource,
  ParagraphQuote,
  paragraphFactsFor,
  quoteDraft,
  quoteInRange,
  releaseInk,
  skeletonParagraphSource,
  setHoldSettleUnits,
  settleInk,
  settleInkForDelivered,
  unitsFromInk,
  wasInkSettled,
} from '../services/credits.service';
import { docTypeLabelFor } from '../services/doc-type-label';
import { eraseDocument } from '../services/document-erase.service';
import { packOptionIds, skeletonValueLists, skeletonWhenHolds } from '../services/draft-renderer';
import {
  factDiffRunType,
  FactDiffRunType,
  rulePackVersionOf,
  writeFactCheckLog,
} from '../services/fact-diff-log';
import { currentState, loadOwnLedger } from '../services/fact-ledger.service';
import { FACT_CHECK_DISCLAIMER } from '../services/fact-verifier';
import { bodyField, hiddenTemplateIds, templateGuard } from '../services/feature-switches';
import {
  briefLedgerValues,
  buildInMemoryLedger,
  formRequiredFieldBlock,
} from '../services/form-ledger';
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
import { applyFieldAliases, loadRulePack, loadSkeleton } from '../services/rule-pack.service';
import { runWithRunContext } from '../services/run-context';
import { NOT_FIXTURE, NOT_FIXTURE_GENERATION } from '../services/run-origin';
import { withS138DateChecks } from '../services/s138-date-checks';
import {
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
  listTemplateConfigs,
  validateFormData,
} from '../services/template-engine.service';
import { prepareV3Generate } from '../services/v3/orchestrator';
import {
  readFilingChecklist,
  readFormInputs,
  sealFilingChecklist,
  sealFormInputs,
} from '../utils/case-details';
import { decrypt, encrypt } from '../utils/encryption';
import { missingAsBlanks } from '../utils/missingAsBlanks';
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
  temporary_injunction_o39: DOC_TYPES.INJUNCTION,
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
 * T-577 (AJ-577-M5, M7): every pack's paragraph block comes from its signed
 * skeleton (`bodyParagraphs`); a pack without one does not ask. The mandatory
 * count reads each required clause's `when` with the renderer's own
 * skeletonWhenHolds, given the pack's option ids and the skeleton's value
 * lists exactly as ai.service builds them for renderDraft.
 */
installParagraphConfigSource(
  skeletonParagraphSource(loadSkeleton, (packId, skeleton) => {
    const pack = loadRulePack(packId);
    const optionIds = pack ? packOptionIds(pack.facts) : {};
    let lists: Pick<AvermentLists, 'banned' | 'allowed'>;
    try {
      lists = loadAvermentLists(packId);
    } catch {
      // A list name that cannot be resolved fails closed, as in the renderer.
      lists = { banned: [], allowed: [] };
    }
    const valueLists = skeletonValueLists(skeleton, lists);
    return (when, facts) =>
      skeletonWhenHolds(when, { held: factEntriesByKey(facts), optionIds, valueLists });
  }),
);

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
  /** T-577: the quoted paragraph count and Ink, only when the pack asked for a count. */
  paragraphsRequested?: number;
  inkQuoted?: number;
  /** T-678: the gate's codes on a withheld draft (codes and keys only, no user text). */
  failure?: GenerationFailure;
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
      // T-577: present only when the pack asked for a count, so every other row is written as before.
      ...(input.paragraphsRequested !== undefined
        ? { paragraphsRequested: input.paragraphsRequested }
        : {}),
      ...(input.inkQuoted !== undefined ? { inkQuoted: input.inkQuoted } : {}),
      // T-678: present only on a draft the gate withheld, so every other row is written as before.
      ...(input.failure !== undefined ? { failure: input.failure } : {}),
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
  /**
   * T-577: the draft's delivered body paragraph count (countBodyParagraphs).
   * For a paragraph-count quote it fixes the settle at min(quote, delivered
   * band), stores it on the hold (so the sweep and a lost-hold path keep the
   * same figure) and returns that Ink. Call it once the result is in, before
   * the Generation row is written. Without such a quote it does nothing and
   * returns undefined (the full hold is settled, as before).
   */
  delivered(count: number): Promise<number | undefined>;
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
  /**
   * T-577: `quote` is the paragraph-count quote `cost` came from. Only an
   * asking quote changes anything (quote stored on the hold, settle at the
   * delivered band).
   */
  key: { runId: string; runSequence: number; quote?: DraftQuote; templateId?: string },
  cost: number,
  preStreamError: Record<string, unknown>,
  run: (ink: InkHoldHandle) => Promise<void>,
): Promise<void> {
  const userId = req.jwtPayload!.sub;
  const { runId, runSequence, quote } = key;
  const paragraphQuote: ParagraphQuote | undefined = quote?.asks ? quote : undefined;
  /** T-577: the hold's quote flag, only for an asking quote (holds are written as before otherwise). */
  const holdExtra = paragraphQuote ? { quoted: true } : {};
  /** T-577: the settle amount for the delivered count (Ink and units); unset → the full hold. */
  let deliveredInk: number | undefined;
  let deliveredUnits: number | undefined;
  /**
   * T-577: true only once the delivered band is known to be on the hold as
   * settleUnits (setHoldSettleUnits {set:true}, or settleInk's mark landed):
   * what a sweep then keeps.
   */
  let deliveredStored = false;

  // Express 4 does not catch a rejected async handler: a throw here would
  // leave the request hanging, so it is answered with the route's own 500.
  try {
    const held = await holdInk({ userId, costCredits: cost, runId, runSequence, ...holdExtra });
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
        // T-577: deliveredUnits is unset unless the pack asked for a count.
        // A mark that lands carries it as the hold's settleUnits, which a
        // sweep then keeps (even if this call loses the pull or throws).
        settled = await settleInk(
          userId,
          runId,
          runSequence,
          deliveredUnits,
          reference,
          deliveredUnits !== undefined
            ? () => {
                deliveredStored = true;
              }
            : undefined,
        );
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
          // T-577: unless the delivered band was stored on the hold
          // (delivered()), which the sweep keeps instead.
          // Only a band known to be on the hold counts (setHoldSettleUnits
          // {set:true}, or settleInk's mark with it landed): otherwise the
          // sweep kept the full hold, so done shows `cost`.
          doneInkDebited = deliveredStored && deliveredInk !== undefined ? deliveredInk : cost;
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
        const again = await holdInk({
          userId,
          costCredits: cost,
          runId,
          runSequence,
          ...holdExtra,
        });
        if (!again.ok && again.reason !== 'duplicate') {
          await withholdDraft();
          return;
        }
        reheld = again.ok;
        const retried = await settleInk(userId, runId, runSequence, deliveredUnits, reference);
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
    async delivered(count) {
      if (!paragraphQuote) return undefined;
      deliveredInk = settleInkForDelivered(paragraphQuote, count);
      deliveredUnits = unitsFromInk(deliveredInk);
      try {
        const stored = await setHoldSettleUnits(userId, runId, runSequence, deliveredUnits);
        if (stored.set) deliveredStored = true;
      } catch (err) {
        // finish() still passes the figure to settleInk; only a sweep that
        // beats it would keep the full hold. Ids only.
        console.warn(
          `[drafting] could not store the delivered band on the hold (runId=${runId}, runSequence=${runSequence}):`,
          err instanceof Error ? err.name : 'unknown',
        );
      }
      return deliveredInk;
    },
  };

  try {
    // T-681a: every model call of the run logs its run id (ids only).
    await runWithRunContext({ runId, runSequence, templateId: key.templateId }, () => run(handle));
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

  // T-674 AC3 (R4): courtName may hold a court id; the screen gets courtLabel.
  const labels = await resolveCourtLabels(docs.map((d) => d.courtName));
  res.json({
    documents: docs.map((d) => {
      const courtLabel = labels.get(String(d.courtName ?? '')) ?? '';
      return { ...d, title: displayTitle(d.title, d.courtName, courtLabel), courtLabel };
    }),
  });
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
    // T-577: the price comes from quoteDraft (T-388 single source). For a pack
    // that does not ask (every pack today) it is costForTemplate, unchanged;
    // for one that asks it is the default count's quote.
    const quotes = await Promise.all(configs.map((c) => quoteDraft(c.template_id)));
    res.json({
      templates: configs.map((config, i) => {
        // T-372: the price the charge uses (single source, T-227); omitted when unpriced.
        // T-577: an asking pack shows its quote; any other pack's quote IS
        // costForTemplate (quoteDraft's flat branch), read here directly.
        const q = quotes[i];
        const creditsCost = q?.asks ? q.ink : costForTemplate(config.template_id);
        // T-385: allowlist projection; description is the signed card line (T-365 AC6), no metadata.
        return {
          ...publicTemplateSummary({
            ...config,
            ...(creditsCost !== undefined ? { credits_cost: creditsCost } : {}),
          }),
          // T-577: does this pack ask for a paragraph count (false for every pack today)?
          asks_paragraphs: quotes[i]?.asks === true,
        };
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

    // T-629 AC8 / Ajay FR-1(b), FR-5: on temporary_injunction_o39 an empty or
    // non-answer main_suit_relief / restraint_sought is refused with the signed
    // (g) lines. Runs before validateFormData, so an empty field gets those
    // lines and not the generic error, and before the gate, run and Ink hold.
    const requiredFieldBlock = formRequiredFieldBlock(template_id, form_data);
    if (requiredFieldBlock !== null) {
      res.status(400).json(requiredFieldBlock);
      return;
    }

    // Validate form data against template schema
    const validationErrors = validateFormData(templateConfig, form_data);
    if (validationErrors.length > 0) {
      res.status(400).json({ error: 'Form validation failed', issues: validationErrors });
      return;
    }

    // T-637: the T-611 delivery gate's rule pack and averment lists, read before
    // any run or Ink hold, so a missing or broken file answers as JSON and no
    // draft goes out ungated. Ids only in the log.
    let gate: ReturnType<typeof formGateFiles>;
    try {
      gate = formGateFiles(template_id);
    } catch (err) {
      console.error(
        `[drafting] delivery gate files unreadable (kind=${template_id}):`,
        err instanceof Error ? err.name : 'unknown',
      );
      res.status(500).json({ error: 'Template config unavailable' });
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

    // T-686: a picked court id that does not resolve (inactive, not found, or
    // the lookup timed out twice) stops the run here: before the Ink hold and
    // any model call, so no raw id reaches a draft and no Ink is taken. A typed
    // court name or an empty court goes on as before. Ids only in the log.
    const formCourt = await resolveFormCourt(form_data.court_name);
    if (formCourt.status === 'unavailable') {
      console.error(
        `[drafting] court unavailable (courtId=${String(form_data.court_name)}, reason=${formCourt.reason}, kind=${template_id}, runId=${runId})`,
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
      res.status(503).json(courtUnavailableBody(runId));
      return;
    }

    // T-226: hold the cost before any model call (402/409 refusals as JSON;
    // no header has been sent yet). Every ending below closes the hold.
    // The pre-stream 500 body below: the error code only (Ajay, T-567), never a
    // message; the detail goes to the log.
    const holdError = { error: 'Generation failed' };
    const inkKey = { runId, runSequence, templateId: template_id };
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
            gate,
            // T-686: the court is looked up once, above.
            ...(formCourt.status === 'resolved' ? { resolvedCourt: formCourt.court } : {}),
          },
          res,
        );
      } catch (genErr) {
        // T-226: a failed run returns its hold, before the response ends.
        await ink.release();
        // GenerationFailedError = mid-stream LLM failure, or (T-611 / T-637) a
        // draft the delivery gate withheld with its one question. SSE `event: error` was
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
            failure: genErr.failure,
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
        // T-674 AC3 (R4): the title carries the court's label, never its id; an
        // unknown id leaves just the pack name. A typed court name stays as typed.
        const titleCourt = form_data.court_name
          ? await resolveCourtLabel(String(form_data.court_name))
          : String(form_data.state || '');
        const title = (
          titleCourt
            ? `${templateConfig.display_name} — ${titleCourt}`
            : templateConfig.display_name
        ).slice(0, 300);
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
        // T-637: the body no longer streams as text, so the web reads the
        // paragraph count here: the same count as the brief route's.
        paragraphCount: countBodyParagraphs(result),
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
  /**
   * T-577: the Ink the advocate was shown (the quote). When sent and not the
   * server's quote, the draft is refused with 409 price_changed before any hold.
   */
  expected_ink: z.number().nonnegative().max(1000).multipleOf(0.5).optional(),
});

/**
 * T-577: POST /documents/paragraph-quote body. The facts the minimum depends
 * on come from `values` (and the ledger, when one is given and the switch is
 * on), as in generate-from-brief.
 */
const paragraphQuoteSchema = z.object({
  kind: briefGenerateSchema.shape.kind,
  values: briefGenerateSchema.shape.values,
  ledger_id: briefGenerateSchema.shape.ledger_id,
  paragraphs: briefGenerateSchema.shape.paragraphs,
  language: z.enum(['en', 'hi', 'bilingual']).default('en'),
});

/**
 * AJ-577-M4 (signed), EN; the HI line is web-side. `{min}` is the pack's
 * mandatory count from the server. The signed line has the cap as the
 * literal 25 (Vikram's cap), so only `{min}` is substituted.
 */
const PARAGRAPH_RANGE_LINE = 'Choose between {min} and 25 paragraphs.';

/** T-577: the 400 for a count outside [min, max]. */
function paragraphRangeError(quote: ParagraphQuote): Record<string, unknown> {
  return {
    error: 'paragraph_count_out_of_range',
    min: quote.min,
    max: quote.max,
    paragraphs: quote.paragraphs,
    message: PARAGRAPH_RANGE_LINE.replace('{min}', String(quote.min)),
  };
}

/** T-577: the public quote (no internal fields). `{asks:false, ink}` for a pack that does not ask. */
function publicQuote(quote: DraftQuote): Record<string, unknown> {
  if (!quote.asks) return { asks: false, ink: quote.ink };
  return {
    asks: true,
    ink: quote.ink,
    min: quote.min,
    max: quote.max,
    default: quote.default,
    paragraphs: quote.paragraphs,
    bands: quote.bands,
    ceiling: quote.ceiling,
  };
}

/**
 * T-577: does this run draft through the D1 skeleton/ledger path? The same
 * rule as ai.service's d1SkeletonFor: a rule pack, a fact ledger in use, the
 * English draft, and a signed skeleton with clauses. On that path the count
 * is a ceiling ("up to N"): the skeleton is filled, never split or padded.
 */
function draftsViaSkeleton(kind: string, ledgerInUse: boolean, language: string): boolean {
  if (kind === 'none' || !ledgerInUse || language !== 'en') return false;
  try {
    const skeleton = loadSkeleton(kind);
    return !!skeleton && skeleton.clauses.length > 0;
  } catch {
    return false;
  }
}

/**
 * T-577: the delivered body paragraph count, the one count used for the
 * settle and the done payload. Today it is the pipeline's own count
 * (`bodyParaCount`: assembleDocument's numbered body paragraphs on the legacy
 * path, the numbered paragraphs of the rendered text on D1), the figure
 * already stored as Generation.paragraphCount.
 */
export function countBodyParagraphs(result: { bodyParaCount: number }): number {
  return result.bodyParaCount;
}

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

// POST /documents/paragraph-quote (T-577): the price of a draft for a
// paragraph count, from quoteDraft (the one quote function). Cheap: no model
// call, no hold, no run. Same gates as generate-from-brief up to the credit
// gate. 200 {asks:false, ink} for a pack that does not ask (every pack today);
// else {asks:true, ink, min, max, default, paragraphs, bands, ceiling}; a
// count outside [min, max] is the same 400 as generate-from-brief's.
router.post(
  '/paragraph-quote',
  authenticate,
  requireCurrentPrivacy,
  requireVerifiedEmail,
  describeFirstOnly,
  templateGuard(bodyField('kind')),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = paragraphQuoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }
    const payload = req.jwtPayload!;
    const { kind, values, ledger_id, paragraphs, language } = parsed.data;
    const guided = kind === 'none';
    let ledgerFacts: LedgerFact[] | undefined;
    if (!guided && ledger_id !== undefined && (await isFactLedgerEnabled(payload.sub))) {
      const doc = await loadOwnLedger(ledger_id, payload.sub);
      if (!doc || doc.documentKind !== kind) {
        res.status(404).json({ error: 'Ledger not found' });
        return;
      }
      try {
        // Stored facts only: withS138DateChecks stays on generate-from-brief,
        // after Confirm (T-363, ruling b). It adds computed keys only for the
        // s.138 pack, which does not ask, so the minimum is the same.
        ledgerFacts = currentState(doc).facts;
      } catch (err) {
        // Ids only: never a fact value.
        console.error(
          `[drafting] ledger unreadable for a quote (ledgerId=${String(doc.id)}):`,
          err instanceof Error ? err.name : 'unknown',
        );
        res.status(503).json({ error: 'ledger_unavailable' });
        return;
      }
    }
    try {
      const quote = await quoteDraft(guided ? GUIDED_ID : kind, {
        paragraphs,
        facts: paragraphFactsFor(values, ledgerFacts),
        ceiling: draftsViaSkeleton(kind, ledgerFacts !== undefined, language),
      });
      if (!quote) {
        res.status(400).json({ error: 'Unknown document type' });
        return;
      }
      if (quote.asks && !quoteInRange(quote)) {
        res.status(400).json(paragraphRangeError(quote));
        return;
      }
      res.json(publicQuote(quote));
    } catch (err) {
      console.error(
        '[drafting] paragraph quote failed:',
        err instanceof Error ? err.name : 'unknown',
      );
      res.status(500).json({ error: 'quote_failed' });
    }
  },
);

router.post(
  '/generate-from-brief',
  authenticate,
  requireCurrentPrivacy, // T-343 — new drafts need the current privacy version
  requireVerifiedEmail, // T-522 — before templateGuard and enforceCredits (403 before 402)
  describeFirstOnly,
  templateGuard(bodyField('kind')), // T-375
  kindAsTemplateId,
  enforceCreditsForBrief, // T-577: enforceCredits priced by quoteDraft (same as enforceCredits when the pack does not ask)
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

    // T-685: at feature.drafting_v3_stage ≥ 2 the v3 orchestrator runs this
    // generate (a pack, an intake and a ledger for it). Null: nothing below changes.
    const v3 =
      pack && templateConfig && intake_id
        ? await prepareV3Generate({ userId: payload.sub, intakeId: intake_id, kind })
        : null;
    // T-685 (Arjun §13 Q5): with a v3 ledger, generation reads its facts; s.138 as above.
    const v3Facts = ledger && v3 ? v3.ledgerFacts() : null;
    if (ledger && v3Facts) {
      ledger = {
        ...ledger,
        id: v3Facts.id,
        version: v3Facts.version,
        facts: withS138DateChecks(
          v3Facts.facts,
          kind,
          v3Facts.unresolved.map((u) => u.key),
        ),
        unresolved: v3Facts.unresolved,
        runType: factDiffRunType(v3Facts.runType),
      };
    }

    // T-577: the one quote (after the ledger, which can change the minimum;
    // before any hold or model call). For a pack that does not ask it is
    // costForTemplate, the price enforceCredits checked, and nothing below
    // changes; `paragraphs` still only feeds clampTarget, as before.
    let quote = await quoteDraft(recordId, {
      paragraphs: parsed.data.paragraphs,
      facts: paragraphFactsFor(values, ledger?.facts),
      ceiling: draftsViaSkeleton(kind, ledger !== null, language),
    });
    if (!quote) {
      // enforceCredits already refused an unpriced id; kept for the type.
      res.status(400).json({ error: 'Unknown document type' });
      return;
    }
    if (quote.asks && !quoteInRange(quote)) {
      res.status(400).json(paragraphRangeError(quote));
      return;
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

    // T-637 (Arjun option B, gate only): with no persisted ledger (none sent,
    // or feature.fact_ledger off), an in-memory ledger is built from the
    // confirmed brief for this request: description values as `user`, typed or
    // edited answers as `asked`, as overlayBrief would write them. It is used
    // ONLY by the held-blank gate (fill, one repair, fact_needed); the Drafter,
    // its prompt, the verifier, FactDiff and the ledger flag see no ledger, as
    // before. Never stored; no intake id. Before any hold; ids only in the log.
    let gateLedger: {
      facts: LedgerFact[];
      unresolved: LedgerUnresolvedFact[];
      lists: AvermentLists;
    } | null = null;
    if (ledger === null && pack) {
      let lists: AvermentLists;
      try {
        lists = loadAvermentLists(kind);
      } catch (err) {
        console.error(
          `[drafting] averment list unreadable (kind=${kind}):`,
          err instanceof Error ? err.name : 'unknown',
        );
        res.status(503).json({ error: 'averments_unavailable' });
        return;
      }
      const state = buildInMemoryLedger(pack, briefLedgerValues(brief));
      gateLedger = {
        // T-192 / T-363 (b): the s.138 date checks, after Confirm, as for a stored ledger.
        facts: withS138DateChecks(
          state.facts,
          kind,
          state.unresolved.map((u) => u.key),
        ),
        unresolved: state.unresolved,
        lists,
      };
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

    // T-577: a retry or resume of a run that was quoted for a count re-quotes
    // the same: the stored count stands when none is sent, and a different
    // count or Ink is a 409 price_changed. Only for a pack that asks.
    /**
     * T-577: the count the model is asked for: the one sent, or on a retry
     * with none sent the run's stored count (what is quoted and held). A first
     * run with no count stays undefined, so clampTarget gives its 15 (ruling 2).
     */
    let requestedParagraphs = parsed.data.paragraphs;
    if (quote.asks && runSequence > 1) {
      let prior: { paragraphsRequested?: number | null; inkQuoted?: number | null } | null;
      try {
        prior = await Generation.findOne({ runId, userId: payload.sub, templateId: recordId })
          .sort({ runSequence: -1 })
          .select('paragraphsRequested inkQuoted')
          .lean();
      } catch (err) {
        // No hold has been taken yet. Ids only.
        console.error(
          `[drafting] could not read the run's quoted count (runId=${runId}, runSequence=${runSequence}):`,
          err instanceof Error ? err.name : 'unknown',
        );
        res.status(503).json({ error: 'try_again' });
        return;
      }
      if (prior?.paragraphsRequested !== undefined && prior.paragraphsRequested !== null) {
        if (parsed.data.paragraphs === undefined) {
          requestedParagraphs = prior.paragraphsRequested;
          const again = await quoteDraft(recordId, {
            paragraphs: prior.paragraphsRequested,
            facts: paragraphFactsFor(values, ledger?.facts),
            ceiling: quote.ceiling,
          });
          if (again) quote = again;
        }
        if (quote.asks && !quoteInRange(quote)) {
          res.status(400).json(paragraphRangeError(quote));
          return;
        }
        if (
          !quote.asks ||
          quote.paragraphs !== prior.paragraphsRequested ||
          (prior.inkQuoted !== undefined &&
            prior.inkQuoted !== null &&
            prior.inkQuoted !== quote.ink)
        ) {
          res.status(409).json({ error: 'price_changed', ink: quote.ink });
          return;
        }
      }
    }
    // T-577 (T-388, AJ-577-M6): the shown figure is checked against the quote
    // that is held and charged, so after the retry re-quote above (a retry
    // with no count is priced at its stored count). Still before any hold or
    // model call.
    if (parsed.data.expected_ink !== undefined && parsed.data.expected_ink !== quote.ink) {
      res.status(409).json({ error: 'price_changed', ink: quote.ink });
      return;
    }
    const runQuote = quote;
    /** T-577: stored on the run's Generation rows, only when the pack asked for a count. */
    const quoteRecord = runQuote.asks
      ? { paragraphsRequested: runQuote.paragraphs, inkQuoted: runQuote.ink }
      : {};
    const startedAt = Date.now();

    // T-226: hold the cost before any model call (402/409 refusals as JSON;
    // no header has been sent yet). Every ending below closes the hold.
    // The pre-stream 500 body below.
    const holdError = { error: 'Generation failed' };
    // T-577: the quote rides with the key; only an asking quote changes the hold.
    const inkKey = { runId, runSequence, quote: runQuote, templateId: recordId };
    const gateCost = chargedCost(req); // T-227: no default price (throws if enforceCredits did not run)
    // T-577: the hold is the route's quote (T-388). For a pack that does not
    // ask it is the same figure enforceCredits stashed.
    const inkCost = runQuote.asks ? runQuote.ink : gateCost;
    // T-685 (§5): the run doc, its lease and this attempt, before the hold; the
    // previous attempt's hold is released first. A live lease elsewhere is a 409.
    if (v3) {
      const opened = await v3.open({ runId, runSequence, inkCost });
      if (!opened.ok) {
        res.status(opened.status).json(opened.body);
        return;
      }
    }
    await withInkHold(req, res, inkKey, inkCost, holdError, async (ink) => {
      let result;
      try {
        const common = {
          brief,
          language,
          targetParagraphs: clampTarget(requestedParagraphs),
          courtData,
          userId: payload.sub,
          runId,
          runSequence,
          runType,
        };
        result =
          pack && templateConfig
            ? await (v3 ? v3.generate : streamGenerateFromBrief)(
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
                  // T-637: with no persisted ledger, the held-blank gate's ledger only.
                  ...(gateLedger ? { gateLedger } : {}),
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
          ...quoteRecord,
          failure: failed?.failure,
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

      // T-577: the delivered count fixes the settle (min(quote, delivered
      // band)) and is stored on the hold before the Generation row exists, so
      // a sweep keeps the same figure. Nothing for a pack that does not ask.
      const paragraphsDelivered = countBodyParagraphs(result);
      await ink.delivered(paragraphsDelivered);

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
          ...quoteRecord,
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
      // T-685: the run delivered (deliver step, ref = the Document). Never throws.
      if (v3) await v3.delivered(docId, docId !== null && !duplicateAttempt);

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
        // T-577: only when the pack asked for a count. inkDebited (T-545,
        // added by sendDone) is the settled figure, at most inkQuoted.
        ...(runQuote.asks ? { inkQuoted: runQuote.ink, paragraphsDelivered } : {}),
        // T-690c: the soft findings of the brief this draft was written from (the
        // one rebuilt above from the sent values). A warning only. Absent when none.
        ...(brief.soft_findings && brief.soft_findings.length > 0
          ? { soft_findings: brief.soft_findings }
          : {}),
      });
      // T-685: every ending (done, error, cap, a refused hold) stops the lease timer and returns the lease.
    }).finally(() => v3?.end());
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
      // T-611 (AC 1, 5): no client is sent a raw `{{MISSING: label}}` token; it
      // goes out as the signed blank `[To be confirmed: label]`, as the PDF and
      // the review link print it. Only what is served changes: the stored text
      // and the generation-time placeholder count (fact-diff-log) are untouched.
      content = missingAsBlanks(
        doc.finalContent ? decrypt(doc.finalContent) : decrypt(doc.generatedContent),
      );
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

    // T-674 AC3 (R4): the screen gets a label, never the stored court id.
    const courtLabel = await resolveCourtLabel(doc.courtName);

    // T-689: the pack's own name for the document type; the stored docType is a
    // coarse enum. No pack, the guided id (its kind name sits in the encrypted
    // brief, which is not read for this) or an unreadable pack gives null and the
    // page falls back to the humanised docType. Never fails the request.
    let docTypeLabel: string | null = null;
    if (
      typeof doc.rulePackId === 'string' &&
      doc.rulePackId !== '' &&
      doc.rulePackId !== GUIDED_ID
    ) {
      try {
        docTypeLabel = docTypeLabelFor(loadRulePack(doc.rulePackId));
      } catch (err) {
        console.error(
          `[drafting] Get document: could not read the rule pack of document ${String(doc._id)}:`,
          err instanceof Error ? err.name : 'UnknownError',
        );
      }
    }

    res.json({
      _id: doc._id,
      title: displayTitle(doc.title, doc.courtName, courtLabel),
      docType: doc.docType,
      docTypeLabel,
      courtType: doc.courtType,
      courtName: doc.courtName,
      courtLabel,
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

    // T-674 AC3 (R4): the file name never carries a court id.
    const shownTitle = displayTitle(
      doc.title,
      doc.courtName,
      await resolveCourtLabel(doc.courtName),
    );
    const filename = `${shownTitle.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}.pdf`;
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
    // T-686: an id-shaped court that does not resolve (inactive, not found, or
    // the lookup timed out twice) fails closed, as the form route does: no raw
    // id is printed. A typed court name is looked up as before; no court keeps
    // the court rules.
    let courtData: CourtLookupData | undefined;
    const courtId = String(doc.courtName || formData.court_name || '').trim();
    const packCourt = await resolveFormCourt(courtId);
    if (packCourt.status === 'unavailable') {
      const kind = String(formData.template_id || doc.docType || '');
      const docRunId = doc.runId ? String(doc.runId) : null;
      console.error(
        `[drafting] court unavailable (courtId=${courtId}, reason=${packCourt.reason}, kind=${kind}, runId=${docRunId ?? 'none'})`,
      );
      res.status(503).json(courtUnavailableBody(docRunId));
      return;
    }
    if (packCourt.status === 'resolved') courtData = packCourt.court;
    if (packCourt.status === 'typed') {
      // Not id-shaped: looked up as before (an active row is used; none, or a
      // lookup error, keeps the court rules).
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

    // T-674 AC3 (R4): the title and file name never carry a court id.
    const shownTitle = displayTitle(
      doc.title,
      doc.courtName,
      await resolveCourtLabel(doc.courtName),
    );
    if (html !== undefined) {
      res.json({ title: shownTitle, filename: annexuresFilename(shownTitle, 'docx'), html });
      return;
    }

    const filename = annexuresFilename(shownTitle, 'pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer!.length);
    res.send(pdfBuffer);
  },
);

export default router;
