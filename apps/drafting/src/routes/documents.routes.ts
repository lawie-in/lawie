import { DOC_TYPES, DocType } from '@lawie/shared';
import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate';
import { enforceFreeLimit, FREE_TIER_MONTHLY_LIMIT } from '../middleware/enforceFreeLimit';
import { spendCapCheck } from '../middleware/spendCap';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { Generation } from '../models/Generation.model';
import { streamGenerateDocument, streamGenerateFromTemplate } from '../services/ai.service';
import { contentToHtml, renderPdf } from '../services/pdf-export.service';
import {
  loadTemplateConfig,
  listTemplateConfigs,
  validateFormData,
} from '../services/template-engine.service';
import { decrypt, encrypt } from '../utils/encryption';

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

// GET /documents/template-configs — list available template configs for the form builder
router.get(
  '/template-configs',
  authenticate,
  async (_req: Request, res: Response): Promise<void> => {
    const configs = listTemplateConfigs();
    res.json({ templates: configs });
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

    res.json({ config });
  },
);

const templateGenerateSchema = z.object({
  template_id: z.string().min(1).max(100),
  form_data: z.record(z.unknown()),
  language: z.enum(['en', 'hi', 'bilingual']).default('en'),
});

// POST /documents/generate-from-template — config-driven generation (SCRUM-43)
router.post(
  '/generate-from-template',
  authenticate,
  enforceFreeLimit,
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
    const { template_id, form_data } = parsed.data;

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

    // Stream the AI response via config-driven pipeline
    const result = await streamGenerateFromTemplate(
      {
        templateConfig,
        formData: form_data,
        advocateName: payload.name || undefined,
        enrollmentNumber: undefined,
        userId: payload.sub,
      },
      res,
    );

    // Save to DB — must not block the done event if DB is unavailable
    let docId: string | null = null;
    try {
      const encryptedContent = encrypt(result.fullText);
      const title =
        `${templateConfig.display_name} — ${String(form_data.court_name || form_data.state || '')}`.slice(
          0,
          300,
        );
      const [doc] = await Promise.all([
        LawieDocument.create({
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
        }),
        Generation.create({
          userId: payload.sub,
          docType: TEMPLATE_TO_DOC_TYPE[template_id] || DOC_TYPES.PETITION,
          tokensUsed: 0,
        }),
      ]);
      docId = String(doc._id);

      if (process.env.NODE_ENV !== 'test') {
        console.info(
          `[drafting] Generated template doc ${docId} for user ${payload.sub} (${template_id})`,
        );
      }
    } catch (dbErr) {
      console.error(
        `[drafting] DB save failed for template ${template_id}:`,
        dbErr instanceof Error ? dbErr.message : dbErr,
      );
    }

    // Send done event — always fires, even if DB save failed
    res.write(
      `event: done\ndata: ${JSON.stringify({
        complete: true,
        docId,
        sectionsCited: result.sectionsCited,
        mandatoryClausesComplete: result.mandatoryClausesComplete,
      })}\n\n`,
    );
    res.end();
  },
);

// POST /documents/generate — legacy generation (free-tier gated)
router.post(
  '/generate',
  authenticate,
  enforceFreeLimit,
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

    // Stream the AI response via three-layer pipeline
    const result = await streamGenerateDocument({ ...input, userId: payload.sub }, res);

    // Save to DB — must happen before done event so we can include docId
    const encryptedContent = encrypt(result.fullText);
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
        sectionsCited: result.sectionsCited,
        filingChecklist: result.filingChecklist,
        checklistState: result.filingChecklist.map(() => false),
        status: 'draft',
      }),
      Generation.create({
        userId: payload.sub,
        docType: input.docType,
        tokensUsed: 0,
      }),
    ]);

    // Send done event with docId so frontend can redirect to editor
    res.write(
      `event: done\ndata: ${JSON.stringify({
        complete: true,
        docId: doc._id,
        sectionsCited: result.sectionsCited,
        mandatoryClausesComplete: result.mandatoryClausesComplete,
      })}\n\n`,
    );
    res.end();

    if (process.env.NODE_ENV !== 'test') {
      console.info(`[drafting] Generated doc ${doc._id} for user ${payload.sub}`);
    }
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
    const pdfBuffer = await renderPdf(html);

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

export default router;
