/**
 * Review pipeline routes — SCRUM-74
 *
 * Jharkhand advocate-panel review pipeline.
 *
 * Admin (founder) routes — gated on role === 'Admin':
 *   POST   /admin/review-tokens         — generate a review token for a document
 *   GET    /admin/review-tokens         — list all review tokens with feedback status
 *   PATCH  /admin/review-tokens/:token/disable — revoke a token
 *   GET    /admin/panel-review          — aggregation matrix (advocate × document × verdict)
 *
 * Public routes (no auth — token IS the auth):
 *   GET    /review/:token               — fetch document + form schema
 *   POST   /review/:token/feedback      — submit structured feedback
 */
import crypto from 'crypto';

import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { authenticate } from '../middleware/authenticate';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { ReviewFeedback, REVIEW_VERDICTS, ReviewVerdict } from '../models/ReviewFeedback.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { decrypt } from '../utils/encryption';

const router = Router();

// ── Founder gate ──────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ── Token generator (32-char URL-safe) ────────────────────────────────────────

function generateToken(): string {
  // 24 bytes → 32 base64url chars; URL-safe
  return crypto.randomBytes(24).toString('base64url');
}

// ── Form schema (returned to public review page) ──────────────────────────────

const FORM_SCHEMA = {
  yes_no_items: [
    { id: 'causeTitleCorrect', label: 'Cause-title correct?' },
    { id: 'sectionsCorrect', label: 'Sections (BNS / BNSS / BSA) correctly cited?' },
    { id: 'factsAccurate', label: 'Facts narrative accurate and consistent?' },
    { id: 'prayerCorrect', label: 'Prayer clause appropriate for the document type?' },
    { id: 'citationsCorrect', label: 'Case-law / statutory citations correct?' },
    { id: 'annexuresSufficient', label: 'Annexures pack sufficient for filing?' },
    { id: 'formattingCorrect', label: 'Formatting follows court conventions?' },
    { id: 'wouldFileAfterEdits', label: 'Would you file this after one round of edits?' },
  ],
  verdicts: REVIEW_VERDICTS.map((v) => ({
    id: v,
    label: {
      ready_to_file: 'Ready to file as-is',
      minor_edits: 'Minor edits — typos, formatting',
      major_edits: 'Major edits — facts/sections/prayer need rework',
      reject: 'Reject — would not file under any circumstance',
    }[v],
  })),
};

// ── POST /admin/review-tokens ─────────────────────────────────────────────────

router.post(
  '/admin/review-tokens',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { documentId, assignedTo, assignedEmail, expiresInDays } = req.body as {
      documentId?: string;
      assignedTo?: string;
      assignedEmail?: string;
      expiresInDays?: number;
    };

    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      res.status(400).json({ error: 'valid documentId is required' });
      return;
    }
    if (!assignedTo || typeof assignedTo !== 'string' || !assignedTo.trim()) {
      res.status(400).json({ error: 'assignedTo is required' });
      return;
    }

    const doc = await LawieDocument.findById(documentId).lean();
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const days = typeof expiresInDays === 'number' && expiresInDays > 0 ? expiresInDays : 14;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const created = await ReviewToken.create({
      token: generateToken(),
      documentId,
      assignedTo: assignedTo.trim(),
      assignedEmail: assignedEmail?.trim().toLowerCase(),
      expiresAt,
      createdBy: new mongoose.Types.ObjectId(req.jwtPayload!.sub),
    });

    res.status(201).json({
      token: created.token,
      documentId: created.documentId,
      assignedTo: created.assignedTo,
      assignedEmail: created.assignedEmail,
      expiresAt: created.expiresAt,
      isActive: created.isActive,
      isUsed: created.isUsed,
      createdAt: created.createdAt,
    });
  },
);

// ── GET /admin/review-tokens ──────────────────────────────────────────────────

router.get(
  '/admin/review-tokens',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const tokens = await ReviewToken.find().sort({ createdAt: -1 }).lean();

    // Join with documents (title only) for the list view
    const docIds = [...new Set(tokens.map((t) => String(t.documentId)))];
    const docs = await LawieDocument.find({ _id: { $in: docIds } })
      .select('title docType')
      .lean();
    const docMap = new Map(docs.map((d) => [String(d._id), d]));

    res.json({
      tokens: tokens.map((t) => ({
        token: t.token,
        documentId: t.documentId,
        documentTitle: docMap.get(String(t.documentId))?.title ?? '(deleted)',
        documentType: docMap.get(String(t.documentId))?.docType ?? null,
        assignedTo: t.assignedTo,
        assignedEmail: t.assignedEmail,
        expiresAt: t.expiresAt,
        isActive: t.isActive,
        isUsed: t.isUsed,
        createdAt: t.createdAt,
      })),
    });
  },
);

// ── PATCH /admin/review-tokens/:token/disable ────────────────────────────────

router.patch(
  '/admin/review-tokens/:token/disable',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const updated = await ReviewToken.findOneAndUpdate(
      { token: req.params.token },
      { $set: { isActive: false } },
      { new: true },
    );
    if (!updated) {
      res.status(404).json({ error: 'Review token not found' });
      return;
    }
    res.json({ token: updated.token, isActive: updated.isActive });
  },
);

// ── GET /admin/panel-review — aggregation ─────────────────────────────────────

router.get(
  '/admin/panel-review',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const tokens = await ReviewToken.find().sort({ createdAt: -1 }).lean();
    const tokenIds = tokens.map((t) => t._id);

    const feedbacks = await ReviewFeedback.find({ reviewTokenId: { $in: tokenIds } }).lean();
    const feedbackMap = new Map(feedbacks.map((f) => [String(f.reviewTokenId), f]));

    const docIds = [...new Set(tokens.map((t) => String(t.documentId)))];
    const docs = await LawieDocument.find({ _id: { $in: docIds } })
      .select('title docType')
      .lean();
    const docMap = new Map(docs.map((d) => [String(d._id), d]));

    const matrix = tokens.map((t) => {
      const fb = feedbackMap.get(String(t._id));
      const docMeta = docMap.get(String(t.documentId));
      return {
        token: t.token,
        assignedTo: t.assignedTo,
        documentId: t.documentId,
        documentTitle: docMeta?.title ?? '(deleted)',
        documentType: docMeta?.docType ?? null,
        status: fb ? 'submitted' : (t.isActive && t.expiresAt > new Date() ? 'pending' : 'expired'),
        verdict: fb?.overallVerdict ?? null,
        submittedAt: fb?.submittedAt ?? null,
        comments: fb?.comments ?? null,
        checklist: fb
          ? {
              causeTitleCorrect: fb.causeTitleCorrect,
              sectionsCorrect: fb.sectionsCorrect,
              factsAccurate: fb.factsAccurate,
              prayerCorrect: fb.prayerCorrect,
              citationsCorrect: fb.citationsCorrect,
              annexuresSufficient: fb.annexuresSufficient,
              formattingCorrect: fb.formattingCorrect,
              wouldFileAfterEdits: fb.wouldFileAfterEdits,
            }
          : null,
      };
    });

    // Summary counts
    const counts = {
      total: matrix.length,
      submitted: matrix.filter((r) => r.status === 'submitted').length,
      pending: matrix.filter((r) => r.status === 'pending').length,
      expired: matrix.filter((r) => r.status === 'expired').length,
      verdicts: {
        ready_to_file: matrix.filter((r) => r.verdict === 'ready_to_file').length,
        minor_edits: matrix.filter((r) => r.verdict === 'minor_edits').length,
        major_edits: matrix.filter((r) => r.verdict === 'major_edits').length,
        reject: matrix.filter((r) => r.verdict === 'reject').length,
      },
    };

    res.json({ matrix, counts });
  },
);

// ── GET /review/:token — public ───────────────────────────────────────────────

router.get('/review/:token', async (req: Request, res: Response): Promise<void> => {
  const rt = await ReviewToken.findOne({ token: req.params.token }).lean();
  if (!rt) {
    res.status(404).json({ error: 'Invalid review link' });
    return;
  }
  if (!rt.isActive) {
    res.status(403).json({ error: 'This review link has been revoked' });
    return;
  }
  if (new Date() > rt.expiresAt) {
    res.status(410).json({ error: 'This review link has expired' });
    return;
  }
  if (rt.isUsed) {
    res.status(409).json({ error: 'Feedback for this link has already been submitted' });
    return;
  }

  const doc = await LawieDocument.findById(rt.documentId).lean();
  if (!doc) {
    res.status(404).json({ error: 'Document no longer available' });
    return;
  }

  const content = doc.finalContent ? decrypt(doc.finalContent) : decrypt(doc.generatedContent);

  res.json({
    document: {
      title: doc.title,
      docType: doc.docType,
      courtName: doc.courtName,
      content,
      sectionsCited: doc.sectionsCited,
    },
    review: {
      assignedTo: rt.assignedTo,
      expiresAt: rt.expiresAt,
    },
    formSchema: FORM_SCHEMA,
  });
});

// ── POST /review/:token/feedback — public ────────────────────────────────────

router.post('/review/:token/feedback', async (req: Request, res: Response): Promise<void> => {
  const rt = await ReviewToken.findOne({ token: req.params.token });
  if (!rt) {
    res.status(404).json({ error: 'Invalid review link' });
    return;
  }
  if (!rt.isActive) {
    res.status(403).json({ error: 'This review link has been revoked' });
    return;
  }
  if (new Date() > rt.expiresAt) {
    res.status(410).json({ error: 'This review link has expired' });
    return;
  }
  if (rt.isUsed) {
    res.status(409).json({ error: 'Feedback already submitted for this link' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const checklistKeys = [
    'causeTitleCorrect',
    'sectionsCorrect',
    'factsAccurate',
    'prayerCorrect',
    'citationsCorrect',
    'annexuresSufficient',
    'formattingCorrect',
    'wouldFileAfterEdits',
  ] as const;

  for (const k of checklistKeys) {
    if (typeof body[k] !== 'boolean') {
      res.status(400).json({ error: `${k} must be true or false` });
      return;
    }
  }
  if (!REVIEW_VERDICTS.includes(body.overallVerdict as ReviewVerdict)) {
    res.status(400).json({ error: 'overallVerdict is invalid' });
    return;
  }
  if (body.comments !== undefined && typeof body.comments !== 'string') {
    res.status(400).json({ error: 'comments must be a string' });
    return;
  }

  const feedback = await ReviewFeedback.create({
    reviewTokenId: rt._id,
    documentId: rt.documentId,
    assignedTo: rt.assignedTo,
    causeTitleCorrect: body.causeTitleCorrect,
    sectionsCorrect: body.sectionsCorrect,
    factsAccurate: body.factsAccurate,
    prayerCorrect: body.prayerCorrect,
    citationsCorrect: body.citationsCorrect,
    annexuresSufficient: body.annexuresSufficient,
    formattingCorrect: body.formattingCorrect,
    wouldFileAfterEdits: body.wouldFileAfterEdits,
    overallVerdict: body.overallVerdict,
    comments: typeof body.comments === 'string' ? body.comments.slice(0, 10_000) : undefined,
  });

  // Mark token used (single-shot)
  await ReviewToken.updateOne({ _id: rt._id }, { $set: { isUsed: true } });

  // Founder notification — log to Event collection (real email deferred)
  try {
    await Event.create({
      userId: rt.createdBy,
      type: 'panel_review_submitted',
      docId: rt.documentId,
      metadata: {
        token: rt.token,
        assignedTo: rt.assignedTo,
        verdict: body.overallVerdict,
      },
    });
  } catch {
    // Telemetry is best-effort
  }

  res.status(201).json({
    submittedAt: feedback.submittedAt,
    overallVerdict: feedback.overallVerdict,
  });
});

export default router;
