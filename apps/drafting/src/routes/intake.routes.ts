/**
 * Describe-first intake routes — ADR-019 §3.3. Ticket T-101 (and T-102 for
 * /intake/answers). Mounted at '/', reached through the gateway as
 * /documents/intake, which already applies login, session check and the
 * per-user request limit. No gateway change.
 *
 * Intake spends no Ink or drops (ADR §3.8). No description text is logged.
 */
import { Request, Response, Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate';
import {
  applyAnswers,
  INTAKE_LIMITS,
  IntakeLimitError,
  isDescribeFirstEnabled,
  runBriefIntake,
  runIntake,
  updateBrief,
} from '../services/intake.service';

const router = Router();

const intakeSchema = z.object({
  description: z
    .string()
    .trim()
    .min(
      INTAKE_LIMITS.descriptionMin,
      `Please describe the matter in at least ${INTAKE_LIMITS.descriptionMin} characters.`,
    )
    .max(
      INTAKE_LIMITS.descriptionMax,
      `Please keep the description under ${INTAKE_LIMITS.descriptionMax} characters.`,
    ),
  language: z.enum(['en', 'hi', 'bilingual']).optional(),
  /** After needs_choice: the template the user picked, with the same intake_id. */
  template_id: z.string().min(1).max(100).optional(),
  intake_id: z.string().uuid().optional(),
});

// GET /documents/intake/enabled — ADR-019 §3.11. Off means New document
// opens the gallery exactly as today.
router.get('/intake/enabled', authenticate, async (req: Request, res: Response): Promise<void> => {
  res.json({ enabled: await isDescribeFirstEnabled(req.jwtPayload!.sub) });
});

router.post('/intake', authenticate, async (req: Request, res: Response): Promise<void> => {
  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    // Messages come from the schema only, never from the submitted text.
    res.status(400).json({
      error: 'Invalid request',
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }
  const payload = req.jwtPayload!;
  try {
    const result = await runIntake({
      userId: payload.sub,
      plan: payload.plan,
      description: parsed.data.description,
      language: parsed.data.language,
      templateId: parsed.data.template_id,
      intakeId: parsed.data.intake_id,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof IntakeLimitError) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
      res.status(429).json({
        error: 'intake_limit',
        message:
          err.scope === 'daily'
            ? "You have used today's quota for describing. Browse templates still works."
            : 'You have described several matters in a short time. Please wait a few minutes. Browse templates still works.',
        retry_after_seconds: err.retryAfterSeconds,
      });
      return;
    }
    console.error('[intake] unexpected error:', err instanceof Error ? err.name : 'unknown');
    res.json({ outcome: 'unavailable' });
  }
});

const answersSchema = z.object({
  intake_id: z.string().uuid(),
  template_id: z.string().min(1).max(100),
  fields: z.record(z.unknown()).default({}),
  answers: z.record(z.unknown()).default({}),
  round: z.number().int().min(1).max(10),
});

// POST /documents/intake/answers — T-102. No model call, no quota, no cost.
router.post('/intake/answers', authenticate, (req: Request, res: Response): void => {
  const parsed = answersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request',
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }
  const result = applyAnswers({
    intakeId: parsed.data.intake_id,
    templateId: parsed.data.template_id,
    fields: parsed.data.fields,
    answers: parsed.data.answers,
    round: parsed.data.round,
  });
  if (!result) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(result);
});

// ── The brief (T-105, ADR-021 sections 3.2 to 3.4) ──────────────────────────
//
// POST /documents/intake/brief          describe, and get a brief with questions
// POST /documents/intake/brief/update   work the brief out again; no model call
//
// Both are closed unless `feature.describe_first` is on for the user. Nothing
// the user sends is stored or logged, and error messages never repeat it.

const KIND = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_]+$/, 'must be a document kind');

const valueSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.union([z.string().max(6000), z.array(z.string().max(500)).max(30)]),
  source: z.enum(['description', 'user']).default('user'),
  quote: z.string().max(1000).optional(),
  label: z.string().max(200).optional(),
  // T-150: a typed name marked "Please check" keeps its mark across updates.
  // A request can only add a mark, never a value.
  please_check: z.boolean().optional(),
});

const courtSchema = z
  .object({
    state: z.string().max(200).nullish(),
    court_type: z.string().max(200).nullish(),
    court: z.string().max(200).nullish(),
  })
  .optional();

const briefSchema = z
  .object({
    description: intakeSchema.shape.description,
    language: z.enum(['en', 'hi', 'bilingual']).optional(),
    /** A rule-pack id, or `none`. Sent when the user picked or changed the kind. */
    kind: KIND.optional(),
    intake_id: z.string().uuid().optional(),
    keep: z.array(valueSchema).max(100).optional(),
    court: courtSchema,
    /** A document with no rule pack only: 2 or 3, with the answers so far. */
    round: z.number().int().min(1).max(3).optional(),
    answers: z
      .array(
        z.object({
          question: z.string().min(1).max(300),
          answer: z.string().max(INTAKE_LIMITS.answerMax),
        }),
      )
      .max(10)
      .optional(),
  })
  .refine((b) => (b.round ?? 1) === 1 || b.intake_id !== undefined, {
    message: 'intake_id is required after round 1',
    path: ['intake_id'],
  });

function invalid(res: Response, error: z.ZodError): void {
  // Messages come from the schema only, never from the submitted text.
  res.status(400).json({
    error: 'Invalid request',
    issues: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  });
}

router.post('/intake/brief', authenticate, async (req: Request, res: Response): Promise<void> => {
  const payload = req.jwtPayload!;
  if (!(await isDescribeFirstEnabled(payload.sub))) {
    res.status(404).json({ error: 'not_enabled' });
    return;
  }
  const parsed = briefSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error);
    return;
  }
  try {
    const result = await runBriefIntake({
      userId: payload.sub,
      plan: payload.plan,
      description: parsed.data.description,
      language: parsed.data.language,
      kind: parsed.data.kind,
      intakeId: parsed.data.intake_id,
      keep: parsed.data.keep,
      court: parsed.data.court ?? undefined,
      round: parsed.data.round,
      answers: parsed.data.answers,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof IntakeLimitError) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
      res.status(429).json({
        error: 'intake_limit',
        message:
          err.scope === 'daily'
            ? "You have used today's quota for describing. Browse document types still works."
            : 'You have described several matters in a short time. Please wait a few minutes.',
        retry_after_seconds: err.retryAfterSeconds,
      });
      return;
    }
    console.error('[intake] unexpected error:', err instanceof Error ? err.name : 'unknown');
    res.json({ outcome: 'unavailable' });
  }
});

const briefUpdateSchema = z.object({
  kind: KIND,
  kind_name: z.string().max(120).optional(),
  court_document: z.boolean().optional(),
  values: z.array(valueSchema).max(200).default([]),
  court: courtSchema,
  description: z
    .string()
    .max(INTAKE_LIMITS.descriptionMax + 10 * INTAKE_LIMITS.answerMax)
    .optional(),
});

router.post(
  '/intake/brief/update',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    if (!(await isDescribeFirstEnabled(req.jwtPayload!.sub))) {
      res.status(404).json({ error: 'not_enabled' });
      return;
    }
    const parsed = briefUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      invalid(res, parsed.error);
      return;
    }
    const brief = updateBrief({
      kind: parsed.data.kind,
      kindName: parsed.data.kind_name,
      courtDocument: parsed.data.court_document,
      values: parsed.data.values,
      court: parsed.data.court ?? undefined,
      description: parsed.data.description,
    });
    if (!brief) {
      res.status(404).json({ error: 'Document kind not found' });
      return;
    }
    res.json({ brief });
  },
);

export default router;
