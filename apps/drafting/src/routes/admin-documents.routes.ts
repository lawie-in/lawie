/**
 * Admin document analytics routes — feeds /admin/documents.
 *
 *   GET /admin/documents/analytics  Template usage + docType breakdown + AI cost
 *   GET /admin/documents/exports    Recent exports
 *
 * Admin-only.
 */
import { Router, Request, Response } from 'express';

import { authenticate } from '../middleware/authenticate';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { Template } from '../models/Template.model';
import { User } from '../models/User.model';

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

    const [totalDocs, totalDocsThisMonth, finalisedDocs, docTypeAgg, templateAgg, aiCostAgg] =
      await Promise.all([
        LawieDocument.countDocuments({ isDeleted: { $ne: true } }),
        LawieDocument.countDocuments({
          createdAt: { $gte: startOfMonth },
          isDeleted: { $ne: true },
        }),
        LawieDocument.countDocuments({
          status: { $in: ['finalised', 'exported'] },
          isDeleted: { $ne: true },
        }),
        // DocType breakdown
        LawieDocument.aggregate([
          { $match: { isDeleted: { $ne: true } } },
          { $group: { _id: '$docType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        // Template usage — group by templateId
        LawieDocument.aggregate([
          { $match: { isDeleted: { $ne: true }, templateId: { $ne: null } } },
          {
            $group: {
              _id: '$templateId',
              count: { $sum: 1 },
              finalised: {
                $sum: { $cond: [{ $in: ['$status', ['finalised', 'exported']] }, 1, 0] },
              },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ]),
        // AI cost this month
        Generation.aggregate([
          { $match: { createdAt: { $gte: startOfMonth } } },
          {
            $group: {
              _id: null,
              totalTokens: { $sum: '$tokensUsed' },
              totalCostUsd: { $sum: '$costUsd' },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

    // Fetch template metadata for the top templates
    const templateIds = templateAgg.map((t: { _id: string }) => t._id).filter(Boolean);
    const templates = await Template.find({ templateId: { $in: templateIds } })
      .select('templateId displayName category planAccess creditsCost')
      .lean();
    const tmplMap = new Map(templates.map((t) => [t.templateId, t]));

    const aiCost = (
      aiCostAgg as Array<{ totalTokens?: number; totalCostUsd?: number; count?: number }>
    )[0];
    const costUsd = aiCost?.totalCostUsd ?? 0;
    // Approximate INR at 85 per USD (adjust via AppSetting in the future)
    const costInr = Math.round(costUsd * 85);
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

    const agg = await Generation.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$tokensUsed' },
          totalCostUsd: { $sum: '$costUsd' },
          count: { $sum: 1 },
        },
      },
    ]);

    const row = (agg as Array<{ totalTokens?: number; totalCostUsd?: number; count?: number }>)[0];
    const costUsd = row?.totalCostUsd ?? 0;
    const costInr = Math.round(costUsd * 85);
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
