import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate';
import { enforceFreeLimit, FREE_TIER_MONTHLY_LIMIT } from '../middleware/enforceFreeLimit';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { streamGenerateDocument } from '../services/ai.service';
import { encrypt } from '../utils/encryption';

const router = Router();

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
  ]),
  courtName: z.string().min(1).max(200),
  courtType: z.enum([
    'district_court',
    'high_court',
    'supreme_court',
    'tribunal',
    'consumer_forum',
    'family_court',
  ]),
  partyDetails: z.record(z.string()).default({}),
  keyFacts: z.string().min(10).max(5000),
  reliefPrayer: z.string().min(5).max(2000),
  advocateName: z.string().optional(),
  advocateEnrollment: z.string().optional(),
});

// GET /documents/usage — return this month's generation count + limit for the caller
router.get('/usage', authenticate, async (req: Request, res: Response): Promise<void> => {
  const payload = req.jwtPayload!;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const used = await Generation.countDocuments({
    userId: payload.sub,
    createdAt: { $gte: startOfMonth },
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

// POST /documents/generate — generate a new document (free-tier gated)
router.post(
  '/generate',
  authenticate,
  enforceFreeLimit,
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

    // Stream the AI response back to the client
    const fullText = await streamGenerateDocument(input, res);

    // Save to DB after streaming completes (non-blocking for the response — already sent)
    const encryptedContent = encrypt(fullText);
    const title = `${input.docType.replace(/_/g, ' ')} — ${input.courtName}`.slice(0, 300);
    const [doc] = await Promise.all([
      LawieDocument.create({
        userId: payload.sub,
        title,
        docType: input.docType,
        courtType: input.courtType,
        courtName: input.courtName,
        formInputs: input,
        generatedContent: encryptedContent,
        status: 'draft',
      }),
      Generation.create({
        userId: payload.sub,
        docType: input.docType,
        tokensUsed: 0,
      }),
    ]);

    // Log document ID for debugging
    if (process.env.NODE_ENV !== 'test') {
      console.info(`[drafting] Generated doc ${doc._id} for user ${payload.sub}`);
    }
  },
);

export default router;
