/**
 * Credits routes — user-facing balance endpoint, plus founder-side ledger / KPI
 * endpoints used by /admin pages.
 *
 *   GET  /credits/balance              — current user's bucket breakdown
 *   GET  /admin/credits/ledger         — founder: paginated audit trail (Admin-only)
 *   GET  /admin/credits/kpis           — founder: rolled-up KPIs for the home + ledger pages
 *
 * T-652 (Ajay AJ-646-M9b, 28 Oct 2026): POST /credits/rate/:docId (+1 earnedCredits per rated
 * draft, source `rating_bonus`) is removed; users were never offered it. It now 404s. Historic
 * signup_bonus / login_bonus / rating_bonus rows stay readable through the admin ledger and KPI endpoints.
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { authenticate } from '../middleware/authenticate';
import { CreditLedger, CreditSource } from '../models/CreditLedger.model';
import { User } from '../models/User.model';
import { getCreditBalance } from '../services/credits.service';

const router = Router();

/**
 * T-652: every source the ledger filter accepts. `?source=` takes one value or a comma-separated
 * list (the admin 'Granted' tab sends every grant source, historic ones included). Values are
 * matched against this allow-list and queried with $in, so nothing from the query string reaches
 * Mongo except a known literal. An unknown value matches nothing, as the old exact match did.
 */
const LEDGER_SOURCES: readonly CreditSource[] = [
  'signup_bonus',
  'login_bonus',
  'rating_bonus',
  'plan_renewal',
  'topup_purchase',
  'admin_grant',
  'draft_spent',
  'plan_lapsed',
  'admin_revoke',
];

function parseSourceFilter(raw: unknown): CreditSource[] {
  const values = (Array.isArray(raw) ? raw : [raw])
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim());
  return LEDGER_SOURCES.filter((s) => values.includes(s));
}

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ── GET /credits/balance ────────────────────────────────────────────────────

router.get('/credits/balance', authenticate, async (req, res): Promise<void> => {
  const balance = await getCreditBalance(req.jwtPayload!.sub);
  res.json(balance);
});

// ── GET /admin/credits/ledger — paginated audit trail ───────────────────────

router.get(
  '/admin/credits/ledger',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    const skip = parseInt(String(req.query.skip ?? '0'), 10) || 0;
    const filter: Record<string, unknown> = {};
    if (req.query.source) filter.source = { $in: parseSourceFilter(req.query.source) };
    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      filter.userId = new mongoose.Types.ObjectId(String(req.query.userId));
    }

    const [entries, total] = await Promise.all([
      CreditLedger.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CreditLedger.countDocuments(filter),
    ]);

    // Decorate with user labels — single batched lookup
    const userIds = [...new Set(entries.map((e) => String(e.userId)))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email planTier')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    res.json({
      total,
      entries: entries.map((e) => ({
        _id: e._id,
        userId: e.userId,
        userName:
          (userMap.get(String(e.userId)) as { name?: string } | undefined)?.name ?? '(unknown)',
        userTier:
          (userMap.get(String(e.userId)) as { planTier?: string } | undefined)?.planTier ?? 'free',
        source: e.source,
        bucket: e.bucket,
        amount: e.amount,
        balanceAfter: e.balanceAfter,
        reference: e.reference,
        templateId: e.templateId,
        createdAt: e.createdAt,
      })),
    });
  },
);

// ── GET /admin/credits/kpis — founder dashboard tiles ──────────────────────

router.get(
  '/admin/credits/kpis',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [circulatingAgg, grantedAgg, spentAgg, topupRevenueAgg, activeAdvocates, paidAdvocates] =
      await Promise.all([
        // Credits in circulation = total of all 3 buckets across all users
        User.aggregate([
          {
            $group: {
              _id: null,
              sub: { $sum: '$subscriptionCredits' },
              earned: { $sum: '$earnedCredits' },
              topup: { $sum: '$topupCredits' },
            },
          },
        ]),
        // Granted this month
        CreditLedger.aggregate([
          {
            $match: {
              createdAt: { $gte: startOfMonth },
              source: {
                $in: [
                  'signup_bonus',
                  'login_bonus',
                  'rating_bonus',
                  'plan_renewal',
                  'topup_purchase',
                  'admin_grant',
                ],
              },
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        // Spent this month (amounts are negative)
        CreditLedger.aggregate([
          {
            $match: {
              createdAt: { $gte: startOfMonth },
              source: 'draft_spent',
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        // Top-up revenue this month (rupees, from metadata.amountInr)
        CreditLedger.aggregate([
          {
            $match: {
              createdAt: { $gte: startOfMonth },
              source: 'topup_purchase',
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ['$metadata.amountInr', 0] } },
              count: { $sum: 1 },
            },
          },
        ]),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ planTier: { $in: ['practice', 'firm'] } }),
      ]);

    const circulating = circulatingAgg[0]
      ? (circulatingAgg[0].sub ?? 0) +
        (circulatingAgg[0].earned ?? 0) +
        (circulatingAgg[0].topup ?? 0)
      : 0;

    res.json({
      creditsInCirculation: circulating,
      bucketSums: {
        subscriptionCredits: circulatingAgg[0]?.sub ?? 0,
        earnedCredits: circulatingAgg[0]?.earned ?? 0,
        topupCredits: circulatingAgg[0]?.topup ?? 0,
      },
      grantedThisMonth: grantedAgg[0]?.total ?? 0,
      spentThisMonth: Math.abs(spentAgg[0]?.total ?? 0),
      topupRevenueInr: topupRevenueAgg[0]?.total ?? 0,
      topupPacksSold: topupRevenueAgg[0]?.count ?? 0,
      activeAdvocates,
      paidAdvocates,
    });
  },
);

export default router;
