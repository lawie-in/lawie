import crypto from 'crypto';

import { COURT_TYPES, DOC_TYPES, DocType } from '@lawie/shared';
import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate';
import { enforceCredits } from '../middleware/enforceCredits';
import { FREE_TIER_MONTHLY_LIMIT } from '../middleware/enforceFreeLimit';
import { spendCapCheck } from '../middleware/spendCap';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { effectiveRunType, Generation, RunType } from '../models/Generation.model';
import {
  GenerationFailedError,
  streamGenerateDocument,
  streamGenerateFromBrief,
  streamGenerateGuided,
  streamGenerateFromTemplate,
} from '../services/ai.service';
import { buildAnnexuresPack, estimateBodyParaCount } from '../services/annexures.service';
import {
  briefText,
  clampTarget,
  STARTING_DRAFT_FOOTER,
  STARTING_DRAFT_LABEL,
} from '../services/brief-drafter';
import { spendInk } from '../services/credits.service';
import { namesSupremeCourt } from '../services/intake-brief';
import { INTAKE_LIMITS, isDescribeFirstEnabled, updateBrief } from '../services/intake.service';
import { getModelRates, priceUsage, RateLookup } from '../services/llm-usage';
import { contentToHtml, renderPdf } from '../services/pdf-export.service';
import { preflightCheck } from '../services/preflight.service';
import { loadRulePack } from '../services/rule-pack.service';
import {
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
  listTemplateConfigs,
  validateFormData,
} from '../services/template-engine.service';
import { decrypt, encrypt } from '../utils/encryption';
import { presentDescription } from '../utils/presentDescription';

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
 * Price a generation's usage. getModelRates never throws — a missing/
 * malformed rate just means costStatus: 'rate_missing', costUsd: 0. Tokens
 * are still real either way (T-003 §3.6).
 */
async function priceGeneration(
  usage: { inputTokens: number; outputTokens: number },
  aiModel: string | undefined,
): Promise<{ costUsd: number; rate: RateLookup }> {
  if (!aiModel) return { costUsd: 0, rate: { costStatus: 'rate_missing', rate: null } };
  const rate = await getModelRates(aiModel);
  const costUsd = rate.costStatus === 'priced' ? priceUsage(usage, rate.rate) : 0;
  return { costUsd, rate };
}

export interface RecordGenerationInput {
  userId: string;
  docType: DocType;
  status: 'completed' | 'failed';
  templateId?: string;
  documentId?: mongoose.Types.ObjectId;
  aiModel?: string;
  transport?: 'direct' | 'helicone';
  usage: {
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
  const { costUsd, rate } = await priceGeneration(input.usage, input.aiModel);
  try {
    await Generation.create({
      userId: input.userId,
      docType: input.docType,
      status: input.status,
      templateId: input.templateId,
      documentId: input.documentId,
      aiModel: input.aiModel,
      transport: input.transport,
      tokensUsed: input.usage.inputTokens + input.usage.outputTokens,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      llmCalls: input.usage.llmCalls,
      usageSource: input.usage.usageSource,
      calls: input.usage.calls,
      paragraphCount: input.paragraphCount,
      durationMs: input.durationMs,
      runId: input.runId,
      runSequence: input.runSequence,
      runType: input.runType,
      intakeId: input.intakeId,
      costUsd,
      costStatus: rate.costStatus,
      rateInputUsdPerMTok: rate.costStatus === 'priced' ? rate.rate.inputUsdPerMTok : undefined,
      rateOutputUsdPerMTok: rate.costStatus === 'priced' ? rate.rate.outputUsdPerMTok : undefined,
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

const generateSchema = z.object({
  docType: z.enum([
    'bail_application',
    'petition',
    'legal_notice',
    'affidavit',
    'vakalatnama',
    'plaint',
    'written_statement',
    'injunction',
    'reply',
    'complaint',
    'rent_agreement',
  ]),
  courtName: z.string().min(1).max(200),
  courtType: z.enum([
    'district_court',
    'high_court',
    'supreme_court',
    'tribunal',
    'consumer_forum',
    'family_court',
    'sessions',
    'cjm',
    'jmfc',
    'civil_court',
  ]),
  partyDetails: z.record(z.string()).default({}),
  keyFacts: z.string().min(10).max(5000),
  reliefPrayer: z.string().min(5).max(2000),
  advocateName: z.string().optional(),
  advocateEnrollment: z.string().optional(),
  // Bail-specific fields (CLO fix #1, #2)
  firNumber: z.string().optional(),
  firDate: z.string().optional(),
  policeStation: z.string().optional(),
  district: z.string().optional(),
  fatherName: z.string().optional(),
  // CLO fix #9 — mediation willingness
  mediationWilling: z.boolean().optional(),
  // T-003 §3.8 — a retry resends this to keep the same run
  run_id: z.string().uuid().optional(),
});

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
  const docs = await LawieDocument.find({ userId: payload.sub, isDeleted: { $ne: true } })
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
  async (_req: Request, res: Response): Promise<void> => {
    const configs = listTemplateConfigs();
    res.json({
      templates: configs.map((config) => ({
        ...config,
        description: presentDescription(config.description),
      })),
    });
  },
);

// GET /documents/template-configs/:id — get full template config (form_schema + document_structure)
router.get(
  '/template-configs/:id',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const config = loadTemplateConfig(req.params.id);
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

    res.json({ config: { ...config, description: presentDescription(config.description) } });
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
router.post('/preflight', authenticate, async (req: Request, res: Response): Promise<void> => {
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

  try {
    const userId = req.jwtPayload?.sub;
    const result = await preflightCheck(template_id, form_data, userId);

    // Strip internal meta before sending to client
    const { _meta, ...clientResult } = result;
    void _meta; // suppress unused var warning

    res.json(clientResult);
  } catch {
    // FAIL-OPEN: verifier error never blocks generation
    res.json({ verdict: 'pass', questions: [] });
  }
});

// POST /documents/generate-from-template — config-driven generation (SCRUM-43)
router.post(
  '/generate-from-template',
  authenticate,
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
    const { template_id, form_data, run_id, intake_id } = parsed.data;

    // Load template config
    const templateConfig = loadTemplateConfig(template_id);
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

    // Stream the AI response via config-driven pipeline
    let result;
    try {
      result = await streamGenerateFromTemplate(
        {
          templateConfig,
          formData: form_data,
          advocateName: payload.name || undefined,
          enrollmentNumber: undefined,
          userId: payload.sub,
          runId,
          runSequence,
          runType,
        },
        res,
      );
    } catch (genErr) {
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
      if (!res.headersSent) {
        res.status(500).json({ error: 'Generation failed', message: msg });
      } else {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            reason:
              'The drafting service hit an unexpected error. Please try again — your inputs are saved.',
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
        formInputs: { template_id, ...form_data },
        generatedContent: encryptedContent,
        sectionsCited: result.sectionsCited,
        filingChecklist: result.filingChecklist,
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

    // Deduct ink AFTER successful generation. Failed streams don't take ink
    // (the SSE error event already fired before reaching this point). A
    // duplicate Generation means a concurrent request (e.g. a double-sent
    // retry) already recorded and paid for this exact attempt — spending
    // again here would charge Ink twice for one logical draft.
    const cost = (req as Request & { creditCost?: number }).creditCost ?? 1;
    if (!duplicateAttempt) {
      const inkResult = await spendInk({
        userId: payload.sub,
        costCredits: cost,
        reason: 'generate',
        reference: docId
          ? `${templateConfig.display_name} (${docId})`
          : templateConfig.display_name,
        runId,
        runSequence,
      });
      if (!inkResult.success) {
        console.error('[drafting] spendInk failed after generation:', inkResult.reason);
      }
    }
    const creditsSpent: Array<{ bucket: string; amount: number }> = [];

    // Send done event — always fires, even if DB save failed
    res.write(
      `event: done\ndata: ${JSON.stringify({
        complete: true,
        docId,
        runId,
        sectionsCited: result.sectionsCited,
        mandatoryClausesComplete: result.mandatoryClausesComplete,
        creditsSpent,
      })}\n\n`,
    );
    res.end();
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
});

/** The credit gate reads `template_id`. For a brief the rule pack is the template. */
function kindAsTemplateId(req: Request, _res: Response, next: NextFunction): void {
  const body = req.body as { kind?: unknown; template_id?: unknown } | undefined;
  if (body && typeof body.kind === 'string') {
    body.template_id = body.kind === 'none' ? GUIDED_ID : body.kind;
  }
  next();
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
  describeFirstOnly,
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
    const templateConfig = pack ? loadTemplateConfig(kind) : null;
    if (!guided && (!pack || !templateConfig)) {
      res.status(404).json({ error: 'Document kind not found' });
      return;
    }
    if (templateConfig?.plan_access === 'pro' && payload.plan !== 'pro') {
      res.status(403).json({ error: 'This document requires a Pro plan' });
      return;
    }

    // The brief is worked out again here. What the browser says about it is not
    // trusted: for a document with no rule pack, a court signal in the user's
    // words makes it a court document whatever was sent (T-107, section 2).
    const brief = updateBrief({
      kind,
      kindName: parsed.data.kind_name,
      courtDocument: parsed.data.court_document,
      values,
      court: court ?? undefined,
    });
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
    if (!brief.can_confirm) {
      res.status(400).json({
        error: 'brief_not_confirmed',
        message: brief.confirm_message,
        blockers: brief.confirm_blockers,
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
                advocateName: payload.name || undefined,
                enrollmentNumber: undefined,
              },
              res,
            )
          : await streamGenerateGuided(common, res);
    } catch (genErr) {
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
      });
      if (failed) {
        // The error event was already sent. End only now, after the row exists.
        res.end();
      } else if (!res.headersSent) {
        res.status(500).json({ error: 'Generation failed' });
      } else {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            reason:
              'The drafting service hit an unexpected error. Please try again — your brief is kept.',
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
        // No case details here: this field is not encrypted. The brief is, below.
        formInputs: { template_id: recordId, source: 'brief' },
        generatedContent: encrypt(result.fullText),
        sectionsCited: result.sectionsCited,
        filingChecklist: result.filingChecklist,
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
    // the charge is the document's fixed cost, whatever the run used.
    const cost = (req as Request & { creditCost?: number }).creditCost ?? 1;
    if (!duplicateAttempt) {
      const inkResult = await spendInk({
        userId: payload.sub,
        costCredits: cost,
        reason: 'generate',
        // No user text in the ledger: a draft with no rule pack has a name the user may have typed.
        reference: `${pack ? pack.name : 'Starting draft'}${docId ? ` (${docId})` : ''}`,
        runId,
        runSequence,
      });
      if (!inkResult.success) {
        console.error('[drafting] spendInk failed after generation:', inkResult.reason);
      }
    }

    res.write(
      `event: done\ndata: ${JSON.stringify({
        complete: true,
        docId,
        runId,
        sectionsCited: result.sectionsCited,
        /** False when the document has no rule pack: the label is always on and no clause was checked. */
        rulePack: !guided,
        mandatoryClausesComplete: guided ? null : result.mandatoryClausesComplete,
        missingClauses: result.missingClauses.map((m) => ({ id: m.id, title: m.title })),
        repaired: result.repaired,
        startingDraft: result.startingDraft,
        startingDraftLabel: result.startingDraft ? STARTING_DRAFT_LABEL : null,
        labelReason: result.labelReason,
        creditsSpent: [],
      })}\n\n`,
    );
    res.end();
  },
);

// POST /documents/generate — legacy generation (ink-gated)
router.post(
  '/generate',
  authenticate,
  enforceCredits,
  spendCapCheck,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const payload = req.jwtPayload!;
    const input = parsed.data;

    // Use advocate name from user profile if not provided in request
    if (!input.advocateName && payload.name) {
      input.advocateName = payload.name;
    }

    // Inject bail-specific fields into partyDetails so post-processor can use them (CLO fixes)
    if (input.fatherName) {
      input.partyDetails.fatherName = input.fatherName;
    }
    if (input.firNumber) {
      input.partyDetails.firNumber = input.firNumber;
    }

    // T-003 §3.8 — legacy pipeline has no template_id, so docType is the
    // equivalent "same kind of request" match key for a retry.
    const { runId, runSequence, runType } = await resolveRun(
      payload.sub,
      { docType: input.docType },
      input.run_id,
    );
    res.setHeader('X-Run-Id', runId);
    res.setHeader('X-Run-Sequence', String(runSequence));
    const startedAt = Date.now();

    // Stream the AI response via three-layer pipeline
    let result;
    try {
      result = await streamGenerateDocument(
        { ...input, userId: payload.sub, runId, runSequence, runType },
        res,
      );
    } catch (genErr) {
      // GenerationFailedError = mid-stream LLM failure. SSE `event: error` was
      // already emitted and the response is closed. Still record what the
      // attempt actually used (T-003) — a failed generation isn't free.
      if (genErr instanceof GenerationFailedError) {
        await recordGeneration({
          userId: payload.sub,
          docType: input.docType,
          status: 'failed',
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

      // No usage data from the pipeline for this kind of failure, but a
      // runId already exists and was already handed to the client, so it
      // still gets a failed row (T-003 §3.8).
      const msg = genErr instanceof Error ? genErr.message : 'Unknown generation error';
      console.error(`[drafting] legacy generate threw (runId=${runId}, runType=${runType}):`, msg);
      await recordGeneration({
        userId: payload.sub,
        docType: input.docType,
        status: 'failed',
        usage: { inputTokens: 0, outputTokens: 0, llmCalls: 0, usageSource: 'provider' },
        paragraphCount: 0,
        durationMs: Date.now() - startedAt,
        runId,
        runSequence,
        runType,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Generation failed', message: msg });
      } else {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            reason:
              'The drafting service hit an unexpected error. Please try again — your inputs are saved.',
            retryable: true,
            code: 'unknown',
            runId,
          })}\n\n`,
        );
        res.end();
      }
      return;
    }

    // Save to DB — must not block the done event if DB is unavailable (mirrors
    // the template route; a DB hiccup shouldn't strand the advocate's draft).
    let docId: string | null = null;
    let duplicateAttempt = false;
    const paragraphCount = estimateBodyParaCount(result.fullText);
    try {
      const encryptedContent = encrypt(result.fullText);
      const title = `${input.docType.replace(/_/g, ' ')} — ${input.courtName}`.slice(0, 300);
      // Sequential, not Promise.all — Generation.documentId needs the Document's _id.
      const doc = await LawieDocument.create({
        userId: payload.sub,
        title,
        docType: input.docType,
        courtType: input.courtType,
        courtName: input.courtName,
        formInputs: input,
        generatedContent: encryptedContent,
        sectionsCited: result.sectionsCited,
        filingChecklist: result.filingChecklist,
        checklistState: result.filingChecklist.map(() => false),
        status: 'draft',
        runId,
        runSequence,
      });
      docId = String(doc._id);

      const { duplicate } = await recordGeneration({
        userId: payload.sub,
        docType: input.docType,
        status: 'completed',
        documentId: doc._id,
        aiModel: result.aiModel,
        transport: result.transport,
        usage: result.usage,
        paragraphCount,
        durationMs: Date.now() - startedAt,
        runId,
        runSequence,
        runType,
      });
      duplicateAttempt = duplicate;

      if (process.env.NODE_ENV !== 'test') {
        console.info(
          `[drafting] Generated doc ${docId} for user ${payload.sub} (runId=${runId}, runSequence=${runSequence}, runType=${runType})`,
        );
      }
    } catch (dbErr) {
      console.error(
        `[drafting] DB save failed for legacy generate (runId=${runId}, runType=${runType}):`,
        dbErr instanceof Error ? dbErr.message : dbErr,
      );
    }

    // Deduct ink after successful generation — skipped for a duplicate
    // attempt (a concurrent request already recorded and paid for it).
    const legacyCost = (req as Request & { creditCost?: number }).creditCost ?? 1;
    if (!duplicateAttempt) {
      const legacyInkResult = await spendInk({
        userId: payload.sub,
        costCredits: legacyCost,
        reason: 'generate',
        reference: docId ?? undefined,
        runId,
        runSequence,
      });
      if (!legacyInkResult.success) {
        console.error(
          '[drafting] spendInk failed after legacy generation:',
          legacyInkResult.reason,
        );
      }
    }

    // Send done event with docId so frontend can redirect to editor
    res.write(
      `event: done\ndata: ${JSON.stringify({
        complete: true,
        docId,
        runId,
        sectionsCited: result.sectionsCited,
        mandatoryClausesComplete: result.mandatoryClausesComplete,
      })}\n\n`,
    );
    res.end();
  },
);

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

    const content = doc.finalContent ? decrypt(doc.finalContent) : decrypt(doc.generatedContent);

    res.json({
      _id: doc._id,
      title: doc.title,
      docType: doc.docType,
      courtType: doc.courtType,
      courtName: doc.courtName,
      content,
      status: doc.status,
      sectionsCited: doc.sectionsCited,
      filingChecklist: doc.filingChecklist ?? [],
      checklistState: doc.checklistState ?? [],
      exportedAs: doc.exportedAs,
      version: doc.version,
      // T-106 — the label is the server's. The editor shows it and cannot remove it.
      rulePackId: doc.rulePackId ?? null,
      startingDraft: doc.startingDraft === true,
      startingDraftLabel: doc.startingDraft === true ? STARTING_DRAFT_LABEL : null,
      // The DOCX is made in the browser, so the footer text is sent with the document (T-125).
      startingDraftFooter: doc.startingDraft === true ? STARTING_DRAFT_FOOTER : null,
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

    const html = contentToHtml(content, isFree, doc.startingDraft === true);
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderPdf(html);
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

// POST /documents/:id/annexures-pack — SCRUM-65: generate 7 mandatory annexures as a multi-page PDF
// Court-rule aware: designation, verification language, party labels from court_rules JSON.
// Returns: application/pdf — single PDF with each annexure on a fresh page.
router.post(
  '/:id/annexures-pack',
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

    // Decrypt content for paragraph count estimation
    const content = doc.finalContent ? decrypt(doc.finalContent) : decrypt(doc.generatedContent);
    const bodyParaCount = estimateBodyParaCount(content);

    // form_data is stored as formInputs on the document
    const formData = (doc.formInputs ?? {}) as Record<string, unknown>;

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await buildAnnexuresPack({
        formData,
        bodyParaCount,
        advocateName: payload.name || undefined,
      });
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
      metadata: { format: 'annexures_pdf', docType: doc.docType },
    });

    const filename = `${doc.title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}_annexures.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  },
);

export default router;
