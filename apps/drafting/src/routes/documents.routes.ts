import crypto from 'crypto';

import { DOC_TYPES, DocType } from '@lawie/shared';
import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate';
import { enforceCredits } from '../middleware/enforceCredits';
import { FREE_TIER_MONTHLY_LIMIT } from '../middleware/enforceFreeLimit';
import { spendCapCheck } from '../middleware/spendCap';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { Generation } from '../models/Generation.model';
import {
  GenerationFailedError,
  streamGenerateDocument,
  streamGenerateFromTemplate,
} from '../services/ai.service';
import { buildAnnexuresPack, estimateBodyParaCount } from '../services/annexures.service';
import { spendInk } from '../services/credits.service';
import { getModelRates, priceUsage, RateLookup } from '../services/llm-usage';
import { contentToHtml, renderPdf } from '../services/pdf-export.service';
import { preflightCheck } from '../services/preflight.service';
import {
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
        `[drafting] Duplicate Generation for runId=${input.runId} runSequence=${input.runSequence} — a concurrent request already recorded this attempt.`,
      );
    } else {
      console.error(
        `[drafting] Failed to record Generation (runId=${input.runId}, runSequence=${input.runSequence}):`,
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
 */
export async function resolveRun(
  userId: string,
  match: { templateId: string } | { docType: string },
  providedRunId: string | undefined,
): Promise<{ runId: string; runSequence: number }> {
  if (!providedRunId) {
    return { runId: crypto.randomUUID(), runSequence: 1 };
  }

  const attempts = await Generation.find({ runId: providedRunId, userId, ...match })
    .select('runSequence status')
    .lean();

  if (attempts.length === 0 || attempts.some((a) => a.status === 'completed')) {
    return { runId: crypto.randomUUID(), runSequence: 1 };
  }

  const maxSequence = Math.max(...attempts.map((a) => a.runSequence ?? 1));
  return { runId: providedRunId, runSequence: maxSequence + 1 };
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
    const { template_id, form_data, run_id } = parsed.data;

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
    const { runId, runSequence } = await resolveRun(
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
          aiModel: genErr.aiModel,
          transport: genErr.transport,
          usage: genErr.usage,
          paragraphCount: 0,
          durationMs: Date.now() - startedAt,
          runId,
          runSequence,
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
      console.error(`[drafting] generate-from-template threw (runId=${runId}):`, msg);
      await recordGeneration({
        userId: payload.sub,
        docType: TEMPLATE_TO_DOC_TYPE[template_id] || DOC_TYPES.PETITION,
        status: 'failed',
        templateId: template_id,
        usage: { inputTokens: 0, outputTokens: 0, llmCalls: 0, usageSource: 'provider' },
        paragraphCount: 0,
        durationMs: Date.now() - startedAt,
        runId,
        runSequence,
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
        documentId: doc._id,
        aiModel: result.aiModel,
        transport: result.transport,
        usage: result.usage,
        paragraphCount: result.bodyParaCount,
        durationMs: Date.now() - startedAt,
        runId,
        runSequence,
      });
      duplicateAttempt = duplicate;

      if (process.env.NODE_ENV !== 'test') {
        console.info(
          `[drafting] Generated template doc ${docId} for user ${payload.sub} (${template_id}, runId=${runId}, runSequence=${runSequence})`,
        );
      }
    } catch (dbErr) {
      console.error(
        `[drafting] DB save failed for template ${template_id} (runId=${runId}):`,
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
    const { runId, runSequence } = await resolveRun(
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
        { ...input, userId: payload.sub, runId, runSequence },
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
      console.error(`[drafting] legacy generate threw (runId=${runId}):`, msg);
      await recordGeneration({
        userId: payload.sub,
        docType: input.docType,
        status: 'failed',
        usage: { inputTokens: 0, outputTokens: 0, llmCalls: 0, usageSource: 'provider' },
        paragraphCount: 0,
        durationMs: Date.now() - startedAt,
        runId,
        runSequence,
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
      });
      duplicateAttempt = duplicate;

      if (process.env.NODE_ENV !== 'test') {
        console.info(
          `[drafting] Generated doc ${docId} for user ${payload.sub} (runId=${runId}, runSequence=${runSequence})`,
        );
      }
    } catch (dbErr) {
      console.error(
        `[drafting] DB save failed for legacy generate (runId=${runId}):`,
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

    const doc = await LawieDocument.findOneAndUpdate(
      { _id: req.params.id, userId: payload.sub, isDeleted: { $ne: true } },
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

    const html = contentToHtml(content, isFree);
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
