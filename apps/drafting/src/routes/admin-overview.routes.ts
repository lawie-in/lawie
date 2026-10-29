/**
 * Admin overview routes — feeds the /admin home page.
 *
 *   GET /admin/overview/kpis      — 4 KPI tiles + monthly revenue
 *   GET /admin/overview/activity  — recent activity feed (signups, drafts, reviews, redemptions)
 *   GET /admin/overview/ai-runtime — current ai.drafting_model + ai.preflight_model values
 *
 * All Admin-only (role === 'Admin'). KPIs are stitched from existing
 * collections — no new persistence needed.
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { authenticate } from '../middleware/authenticate';
import { CreditLedger } from '../models/CreditLedger.model';
import { LawieDocument } from '../models/Document.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { User } from '../models/User.model';
import { getAppSetting, AppSettingMissingError } from '../services/app-settings.service';
import { NOT_FIXTURE } from '../services/run-origin';

/** T-563 — test accounts (develop-only bypass) are left out of every user count and feed. */
const NOT_TEST_ACCOUNT = { isTestAccount: { $ne: true } };

/** Raw collection the auth service's grantReferralInk writes its 'referral_bonus' row to. */
const INK_LEDGER_COLLECTION = 'inkledger';

interface ReferralInkRow {
  userId: mongoose.Types.ObjectId;
  reference?: string;
  metadata?: { referralCode?: string; bonusInk?: number };
  createdAt: Date;
}

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ── GET /admin/overview/kpis ───────────────────────────────────────────────

router.get(
  '/admin/overview/kpis',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const startOfThisWeek = new Date();
    startOfThisWeek.setDate(startOfThisWeek.getDate() - 7);
    startOfThisWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    const startOfThisMonth = new Date();
    startOfThisMonth.setDate(1);
    startOfThisMonth.setHours(0, 0, 0, 0);

    const [
      activeAdvocatesTotal,
      activeAdvocatesNewThisWeek,
      draftsTotal,
      draftsThisWeek,
      draftsLastWeek,
      panelPending,
      panelOverdue,
      freeToPaidPaid,
      freeToPaidTotal,
      paidUsersThisMonth,
      monthlyRevenueAgg,
      newAdvocatesThisMonth,
      churnedThisMonth,
      inkCirculationAgg,
    ] = await Promise.all([
      User.countDocuments({ ...NOT_TEST_ACCOUNT }),
      User.countDocuments({ createdAt: { $gte: startOfThisWeek }, ...NOT_TEST_ACCOUNT }),
      LawieDocument.countDocuments({ isDeleted: { $ne: true }, ...NOT_FIXTURE }),
      LawieDocument.countDocuments({
        createdAt: { $gte: startOfThisWeek },
        isDeleted: { $ne: true },
        ...NOT_FIXTURE,
      }),
      LawieDocument.countDocuments({
        createdAt: { $gte: startOfLastWeek, $lt: startOfThisWeek },
        isDeleted: { $ne: true },
        ...NOT_FIXTURE,
      }),
      ReviewToken.countDocuments({ isUsed: false, isActive: true, expiresAt: { $gt: new Date() } }),
      ReviewToken.countDocuments({
        isUsed: false,
        isActive: true,
        expiresAt: { $lt: new Date(Date.now() - 72 * 3600 * 1000) },
      }),
      User.countDocuments({
        planTier: { $in: ['practice', 'firm', 'solo', 'pro'] },
        ...NOT_TEST_ACCOUNT,
      }),
      User.countDocuments({ ...NOT_TEST_ACCOUNT }),
      User.countDocuments({
        planTier: { $in: ['practice', 'firm', 'solo', 'pro'] },
        updatedAt: { $gte: startOfThisMonth },
        ...NOT_TEST_ACCOUNT,
      }),
      // Sum of plan_renewal + topup_purchase amountInr from ledger this month
      CreditLedger.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfThisMonth },
            source: { $in: ['plan_renewal', 'topup_purchase'] },
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$metadata.amountInr', 0] } } } },
      ]),
      User.countDocuments({ createdAt: { $gte: startOfThisMonth }, ...NOT_TEST_ACCOUNT }),
      // Approximation — users whose planTier dropped back to 'free' this month
      Promise.resolve(0),
      // Total ink units in circulation across all buckets (ledger units, not display units)
      mongoose.connection.db
        ? mongoose.connection.db
            .collection('users')
            .aggregate([
              { $match: NOT_TEST_ACCOUNT },
              {
                $group: {
                  _id: null,
                  total: {
                    $sum: {
                      $add: [
                        { $ifNull: ['$inkSub', 0] },
                        { $ifNull: ['$inkAnnualCarry', 0] },
                        { $ifNull: ['$inkTopup', 0] },
                      ],
                    },
                  },
                },
              },
            ])
            .toArray()
        : Promise.resolve([]),
    ]);

    const conversionPct =
      freeToPaidTotal > 0 ? Math.round((freeToPaidPaid / freeToPaidTotal) * 1000) / 10 : 0;

    res.json({
      activeAdvocates: {
        value: activeAdvocatesTotal,
        deltaWeek: activeAdvocatesNewThisWeek,
      },
      draftsGenerated: {
        value: draftsTotal,
        deltaPct:
          draftsLastWeek > 0
            ? Math.round(((draftsThisWeek - draftsLastWeek) / draftsLastWeek) * 100)
            : 0,
      },
      panelReviewsPending: {
        value: panelPending,
        overdue: panelOverdue,
      },
      conversion: {
        valuePct: conversionPct,
        deltaPct: 0, // historical comparison TBD when we log churn
      },
      monthlyRevenue: {
        inr: monthlyRevenueAgg[0]?.total ?? 0,
        paid: paidUsersThisMonth,
        newPaid: newAdvocatesThisMonth,
        churn: churnedThisMonth,
      },
      inkCirculation: (inkCirculationAgg as Array<{ total?: number }>)[0]?.total ?? 0,
    });
  },
);

// ── GET /admin/overview/activity ───────────────────────────────────────────

router.get(
  '/admin/overview/activity',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    // Pull recent signups (User), drafts (Document), reviews (ReviewToken — submitted),
    // redemptions and top-ups. Cap to 30 most recent overall.
    // T-652: a referral redemption is read from the inkledger 'referral_bonus' row that auth's
    // grantReferralInk writes (once per user, fenced by referralInkGrantedAt). Signup stopped
    // writing the creditledger 'signup_bonus' row in T-652; old rows are still read for history.
    const db = mongoose.connection.db;
    const [
      recentSignups,
      recentDrafts,
      recentReviews,
      legacyRedemptions,
      referralInkRows,
      recentTopups,
    ] = await Promise.all([
      User.find({ createdAt: { $gte: since }, ...NOT_TEST_ACCOUNT })
        .select('name email createdAt referredVia')
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      LawieDocument.find({ createdAt: { $gte: since }, isDeleted: { $ne: true }, ...NOT_FIXTURE })
        .select('title userId createdAt docType')
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      ReviewToken.find({ isUsed: true, updatedAt: { $gte: since } })
        .select('assignedTo documentId updatedAt reviewerErased')
        .sort({ updatedAt: -1 })
        .limit(15)
        .lean(),
      CreditLedger.find({ createdAt: { $gte: since }, source: 'signup_bonus' })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      db
        ? db
            .collection<ReferralInkRow>(INK_LEDGER_COLLECTION)
            .find({ createdAt: { $gte: since }, reason: 'referral_bonus' })
            .sort({ createdAt: -1 })
            .limit(15)
            .toArray()
        : Promise.resolve([] as ReferralInkRow[]),
      CreditLedger.find({
        createdAt: { $gte: since },
        source: 'topup_purchase',
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    // Decorate userIds with names for the feed
    const allUserIds = new Set<string>([
      ...recentDrafts.map((d) => String(d.userId)),
      ...recentReviews.map((r) => String(r.documentId)),
      ...legacyRedemptions.map((r) => String(r.userId)),
      ...referralInkRows.map((r) => String(r.userId)),
      ...recentTopups.map((t) => String(t.userId)),
    ]);
    const users = await User.find({ _id: { $in: [...allUserIds] } })
      .select('name email')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const items: Array<{
      type: 'signup' | 'draft' | 'review' | 'redemption' | 'topup';
      label: string;
      detail: string;
      at: Date;
    }> = [];

    for (const u of recentSignups) {
      if (!u.createdAt) continue;
      items.push({
        type: 'signup',
        label: `${u.name ?? '(unknown)'} signed up`,
        detail: u.referredVia ? 'via referral' : 'organic',
        at: u.createdAt,
      });
    }
    for (const d of recentDrafts) {
      const owner =
        (userMap.get(String(d.userId)) as { name?: string } | undefined)?.name ?? '(advocate)';
      items.push({
        type: 'draft',
        label: `${owner} generated ${d.docType.replace(/_/g, ' ')}`,
        detail: d.title.slice(0, 60),
        at: d.createdAt,
      });
    }
    for (const r of recentReviews) {
      items.push({
        type: 'review',
        label: `${r.reviewerErased ? 'reviewer: erased' : r.assignedTo} submitted review`,
        detail: 'Ready to file',
        at: r.updatedAt,
      });
    }
    // T-652: one redemption per user. A user with an inkledger referral row is shown from it,
    // so a pre-T-652 signup_bonus row for the same user is not listed a second time.
    const referralInkUsers = new Set(referralInkRows.map((r) => String(r.userId)));
    for (const r of referralInkRows) {
      const owner =
        (userMap.get(String(r.userId)) as { name?: string } | undefined)?.name ?? '(advocate)';
      const code = r.metadata?.referralCode ?? r.reference;
      const bonusInk = r.metadata?.bonusInk;
      items.push({
        type: 'redemption',
        label: `${owner} redeemed referral`,
        detail: [bonusInk !== undefined ? `${bonusInk} Ink` : '', code ?? '']
          .filter(Boolean)
          .join(' · '),
        at: r.createdAt,
      });
    }
    for (const r of legacyRedemptions) {
      if (referralInkUsers.has(String(r.userId))) continue;
      const owner =
        (userMap.get(String(r.userId)) as { name?: string } | undefined)?.name ?? '(advocate)';
      items.push({
        type: 'redemption',
        label: `${owner} redeemed referral`,
        detail: r.reference ?? '',
        at: r.createdAt,
      });
    }
    for (const t of recentTopups) {
      const owner =
        (userMap.get(String(t.userId)) as { name?: string } | undefined)?.name ?? '(advocate)';
      const amount = (t.metadata as Record<string, unknown> | undefined)?.amountInr ?? 0;
      items.push({
        type: 'topup',
        label: `${owner} purchased top-up`,
        detail: `${t.amount} credits · ₹${amount}`,
        at: t.createdAt,
      });
    }

    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    const topItems = items.slice(0, 30);

    if (_req.query['format'] === 'csv') {
      const rows = [
        ['type', 'label', 'detail', 'at'],
        ...topItems.map((it) => [
          it.type,
          `"${it.label.replace(/"/g, '""')}"`,
          `"${it.detail.replace(/"/g, '""')}"`,
          it.at.toISOString(),
        ]),
      ];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="lawie-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(rows.map((r) => r.join(',')).join('\n'));
      return;
    }

    res.json({ items: topItems });
  },
);

// ── GET /admin/overview/ai-runtime ─────────────────────────────────────────

router.get(
  '/admin/overview/ai-runtime',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const get = async (key: string) => {
      try {
        return await getAppSetting(key);
      } catch (err) {
        if (err instanceof AppSettingMissingError) return null;
        throw err;
      }
    };
    const [draftingModel, preflightModel] = await Promise.all([
      get('ai.drafting_model'),
      get('ai.preflight_model'),
    ]);
    res.json({
      drafting_model: draftingModel,
      preflight_model: preflightModel,
    });
  },
);

export default router;
