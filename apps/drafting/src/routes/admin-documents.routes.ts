/**
 * Admin document analytics routes — feeds /admin/documents.
 *
 *   GET /admin/documents/analytics  Template usage + docType breakdown + AI cost
 *   GET /admin/documents/exports    Recent exports
 *
 * Admin-only.
 */
import { Router, Request, Response } from 'express';

import { catalogueCategoryDisplay, isCatalogueCategoryId } from '../config/catalogue';
import { authenticate } from '../middleware/authenticate';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { Template } from '../models/Template.model';
import { User } from '../models/User.model';
import { getUsdInrRate } from '../services/llm-usage';
import { NOT_FIXTURE, NOT_FIXTURE_GENERATION } from '../services/run-origin';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ── GET /admin/documents/analytics ────────────────────────────────────────

router.get(
  '/admin/documents/analytics',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalDocs,
      totalDocsThisMonth,
      finalisedDocs,
      docTypeAgg,
      templateAgg,
      aiCostAgg,
      usdInrRate,
    ] = await Promise.all([
      LawieDocument.countDocuments({ isDeleted: { $ne: true }, ...NOT_FIXTURE }),
      LawieDocument.countDocuments({
        createdAt: { $gte: startOfMonth },
        isDeleted: { $ne: true },
        ...NOT_FIXTURE,
      }),
      LawieDocument.countDocuments({
        status: { $in: ['finalised', 'exported'] },
        isDeleted: { $ne: true },
        ...NOT_FIXTURE,
      }),
      // DocType breakdown
      LawieDocument.aggregate([
        { $match: { isDeleted: { $ne: true }, ...NOT_FIXTURE } },
        { $group: { _id: '$docType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      // Template usage (T-331). Documents never carry a template id of their
      // own; the slug is on the completed Generation that produced them. One
      // row per (slug, document) pair, then keep live, non-fixture documents
      // only and count them per slug. The document lookup reads `status` only.
      Generation.aggregate([
        {
          $match: {
            status: 'completed',
            templateId: { $nin: [null, ''] },
            documentId: { $ne: null },
            ...NOT_FIXTURE_GENERATION,
          },
        },
        { $group: { _id: { templateId: '$templateId', documentId: '$documentId' } } },
        {
          $lookup: {
            from: LawieDocument.collection.collectionName,
            let: { docId: '$_id.documentId' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$docId'] },
                  isDeleted: { $ne: true },
                  ...NOT_FIXTURE,
                },
              },
              { $project: { _id: 0, status: 1 } },
            ],
            as: 'doc',
          },
        },
        { $unwind: '$doc' },
        {
          $group: {
            _id: '$_id.templateId',
            count: { $sum: 1 },
            finalised: {
              $sum: { $cond: [{ $in: ['$doc.status', ['finalised', 'exported']] }, 1, 0] },
            },
          },
        },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 20 },
      ]),
      // AI cost this month — cost sum includes failed rows (we paid for
      // them); the generation count excludes them (T-003 §3.7).
      Generation.aggregate([
        { $match: { createdAt: { $gte: startOfMonth }, ...NOT_FIXTURE_GENERATION } },
        {
          $group: {
            _id: null,
            totalTokens: { $sum: '$tokensUsed' },
            totalCostUsd: { $sum: '$costUsd' },
            count: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 0, 1] } },
          },
        },
      ]),
      getUsdInrRate(),
    ]);

    // Fetch template metadata for the top templates
    // Generation.templateId is the Template slug (Template.templateId). Brief
    // record ids that are not catalogue slugs find no Template and fall back
    // to the id below.
    const templateIds = templateAgg.map((t: { _id: string }) => t._id).filter(Boolean);
    const templates = await Template.find({ templateId: { $in: templateIds } })
      .select('templateId displayName category catalogueCategory planAccess')
      .lean();
    const tmplMap = new Map(templates.map((t) => [t.templateId, t]));

    const aiCost = (
      aiCostAgg as Array<{ totalTokens?: number; totalCostUsd?: number; count?: number }>
    )[0];
    const costUsd = aiCost?.totalCostUsd ?? 0;
    const costInr = Math.round(costUsd * usdInrRate);
    const genCount = aiCost?.count ?? 0;

    // Top 6 docTypes for the bar chart
    const topDocTypes = (docTypeAgg as Array<{ _id: string; count: number }>).slice(0, 6);
    const othersCount = (docTypeAgg as Array<{ count: number }>)
      .slice(6)
      .reduce((a, b) => a + b.count, 0);
    if (othersCount > 0) topDocTypes.push({ _id: 'other', count: othersCount });

    res.json({
      kpis: {
        totalDocs,
        totalDocsThisMonth,
        finalisedRate: totalDocs > 0 ? Math.round((finalisedDocs / totalDocs) * 100) : 0,
        aiCostInr: costInr,
        aiGenCount: genCount,
        avgCostPerGenInr: genCount > 0 ? Math.round(costInr / genCount) : 0,
      },
      docTypeBreakdown: topDocTypes,
      templateUsage: (templateAgg as Array<{ _id: string; count: number; finalised: number }>).map(
        (t) => {
          const meta = tmplMap.get(t._id);
          return {
            templateId: t._id,
            displayName: meta?.displayName ?? t._id,
            category: meta?.category ?? '—',
            // T-240: the library category and its name. Absent on a row the
            // seed has not rewritten yet; the page then shows `category`.
            catalogueCategory: meta?.catalogueCategory,
            catalogueCategoryName: isCatalogueCategoryId(meta?.catalogueCategory)
              ? catalogueCategoryDisplay(meta.catalogueCategory).name
              : undefined,
            planAccess: meta?.planAccess ?? 'free',
            count: t.count,
            finalisedRate: t.count > 0 ? Math.round((t.finalised / t.count) * 100) : 0,
          };
        },
      ),
    });
  },
);

// ── GET /admin/documents/exports ─────────────────────────────────────────

router.get(
  '/admin/documents/exports',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(Number(req.query['limit'] ?? 20), 50);

    const docs = await LawieDocument.find({
      status: 'exported',
      isDeleted: { $ne: true },
      ...NOT_FIXTURE,
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    // Decorate with user names
    const userIds = [...new Set(docs.map((d) => String(d.userId)))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    res.json({
      exports: docs.map((d) => {
        const u = userMap.get(String(d.userId)) as { name?: string } | undefined;
        return {
          _id: String(d._id),
          title: d.title,
          docType: d.docType,
          userName: u?.name ?? '—',
          exportedAs: (d as Record<string, unknown>)['exportedAs'] ?? [],
          exportedAt: d.updatedAt,
        };
      }),
    });
  },
);

// ── GET /admin/ai-usage ────────────────────────────────────────────────────

router.get(
  '/admin/ai-usage',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const monthParam = String(req.query['month'] ?? '');
    let start: Date;
    let end: Date;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [year, month] = monthParam.split('-').map(Number);
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 1);
    } else {
      start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    }

    const [agg, usdInrRate] = await Promise.all([
      Generation.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, ...NOT_FIXTURE_GENERATION } },
        {
          $group: {
            _id: null,
            totalTokens: { $sum: '$tokensUsed' },
            totalCostUsd: { $sum: '$costUsd' },
            count: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 0, 1] } },
          },
        },
      ]),
      getUsdInrRate(),
    ]);

    const row = (agg as Array<{ totalTokens?: number; totalCostUsd?: number; count?: number }>)[0];
    const costUsd = row?.totalCostUsd ?? 0;
    const costInr = Math.round(costUsd * usdInrRate);
    const count = row?.count ?? 0;

    res.json({
      month: monthParam || new Date().toISOString().slice(0, 7),
      totalTokens: row?.totalTokens ?? 0,
      totalCostUsd: costUsd,
      totalCostInr: costInr,
      generationCount: count,
      avgCostPerGenInr: count > 0 ? Math.round(costInr / count) : 0,
    });
  },
);

export default router;
