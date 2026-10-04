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
  runIntake,
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

export default router;
