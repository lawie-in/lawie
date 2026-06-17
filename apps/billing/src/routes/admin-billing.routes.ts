/**
 * Admin billing routes — feeds /admin/subscriptions and /admin/revenue.
 *
 *   GET  /admin/billing/subscriptions        List all subscriptions (search + filter)
 *   GET  /admin/billing/subscriptions/:id    Single subscription detail + payment history
 *   POST /admin/billing/subscriptions/:id/sync  Re-fetch live status from Razorpay
 *   GET  /admin/billing/revenue              Revenue KPIs + 6-month trend + plan mix
 *
 * All Admin-only (role === 'Admin').
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { SUBSCRIPTION_PLANS } from '../config/credit-skus';
import { razorpay } from '../config/razorpay';
import { authenticate } from '../middleware/authenticate';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

function normalizePlan(razorpayPlanId: string | undefined): string {
  const plan = SUBSCRIPTION_PLANS.find(
    (p) => process.env[p.razorpayPlanIdEnvKey] === razorpayPlanId,
  );
  return plan ? `${plan.tier} / ${plan.cycle}` : (razorpayPlanId ?? 'unknown');
}

// ── GET /admin/billing/subscriptions ─────────────────────────────────────────

router.get(
  '/admin/billing/subscriptions',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const q = String(req.query['q'] ?? '').trim();
    const status = String(req.query['status'] ?? '').trim();
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    const skip = Number(req.query['skip'] ?? 0);

    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;

    let subs = await Subscription.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Subscription.countDocuments(filter);

    // Decorate with user info
    const userIds = subs.map((s) => s.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    if (q) {
      subs = subs.filter((s) => {
        const u = userMap.get(String(s.userId));
        const name = String((u as Record<string, unknown> | undefined)?.['name'] ?? '');
        const email = String((u as Record<string, unknown> | undefined)?.['email'] ?? '');
        const razId = s.razorpaySubscriptionId ?? '';
        const lq = q.toLowerCase();
        return (
          name.toLowerCase().includes(lq) ||
          email.toLowerCase().includes(lq) ||
          razId.toLowerCase().includes(lq)
        );
      });
    }

    res.json({
      subscriptions: subs.map((s) => {
        const u = userMap.get(String(s.userId)) as { name?: string; email?: string } | undefined;
        return {
          _id: String(s._id),
          userId: String(s.userId),
          userName: u?.name ?? '',
          userEmail: u?.email ?? '',
          razorpaySubscriptionId: s.razorpaySubscriptionId,
          planLabel: normalizePlan(s.razorpayPlanId),
          planType: s.planType,
          amount: s.amount,
          amountInr: Math.round(s.amount / 100),
          currency: s.currency,
          status: s.status,
          currentPeriodStart: s.currentPeriodStart ?? null,
          currentPeriodEnd: s.currentPeriodEnd ?? null,
          cancelledAt: s.cancelledAt ?? null,
          createdAt: s.createdAt,
        };
      }),
      total,
      limit,
      skip,
    });
  },
);

// ── GET /admin/billing/subscriptions/:id ────────────────────────────────────

router.get(
  '/admin/billing/subscriptions/:id',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const sub = await Subscription.findOne({
      razorpaySubscriptionId: req.params.id,
    }).lean();

    if (!sub) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }

    const user = await User.findById(sub.userId).select('name email').lean();

    res.json({
      _id: String(sub._id),
      userId: String(sub.userId),
      userName: (user as { name?: string } | null)?.name ?? '',
      userEmail: (user as { email?: string } | null)?.email ?? '',
      razorpaySubscriptionId: sub.razorpaySubscriptionId,
      razorpayPlanId: sub.razorpayPlanId,
      planLabel: normalizePlan(sub.razorpayPlanId),
      planType: sub.planType,
      amount: sub.amount,
      amountInr: Math.round(sub.amount / 100),
      currency: sub.currency,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart ?? null,
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
      cancelledAt: sub.cancelledAt ?? null,
      createdAt: sub.createdAt,
      paymentHistory: (sub.paymentHistory ?? [])
        .slice(-10)
        .reverse()
        .map((p) => ({
          paymentId: p.paymentId,
          amount: Math.round(p.amount / 100),
          status: p.status,
          paidAt: p.paidAt,
        })),
    });
  },
);

// ── POST /admin/billing/subscriptions/:id/sync ───────────────────────────────

router.post(
  '/admin/billing/subscriptions/:id/sync',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const razId = req.params.id;

    let razSub: Record<string, unknown>;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      razSub = (await (razorpay.subscriptions.fetch as any)(razId)) as Record<string, unknown>;
    } catch {
      res.status(502).json({ error: 'Failed to fetch from Razorpay' });
      return;
    }

    const updated = await Subscription.findOneAndUpdate(
      { razorpaySubscriptionId: razId },
      {
        $set: {
          status: razSub['status'],
          currentPeriodStart: razSub['current_start']
            ? new Date(Number(razSub['current_start']) * 1000)
            : undefined,
          currentPeriodEnd: razSub['current_end']
            ? new Date(Number(razSub['current_end']) * 1000)
            : undefined,
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      res.status(404).json({ error: 'Subscription not found locally' });
      return;
    }

    res.json({ ok: true, status: updated.status });
  },
);

// ── GET /admin/billing/revenue ────────────────────────────────────────────────

router.get(
  '/admin/billing/revenue',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Active subscriptions
    const activeSubs = await Subscription.find({ status: 'active' }).lean();

    // MRR calculation: monthly subs at face value; annuals amortized (÷12)
    let mrrPaise = 0;
    const planMixMap: Record<string, number> = {};
    for (const s of activeSubs) {
      const plan = SUBSCRIPTION_PLANS.find(
        (p) => process.env[p.razorpayPlanIdEnvKey] === s.razorpayPlanId,
      );
      const label = plan ? `${plan.tier}_${plan.cycle}` : 'unknown';
      planMixMap[label] = (planMixMap[label] ?? 0) + 1;
      if (s.planType === 'monthly') {
        mrrPaise += s.amount;
      } else {
        mrrPaise += Math.round(s.amount / 12);
      }
    }

    // Topup revenue this month from inkledger collection
    const db = mongoose.connection.db;
    let topupRevenueInr = 0;
    if (db) {
      const topupAgg = await db
        .collection('inkledger')
        .aggregate([
          {
            $match: {
              reason: 'topup_purchase',
              createdAt: { $gte: startOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ['$metadata.amountInr', 0] } },
            },
          },
        ])
        .toArray();
      topupRevenueInr = (topupAgg[0] as { total?: number } | undefined)?.total ?? 0;
    }

    const mrrInr = Math.round(mrrPaise / 100);
    const activeCount = activeSubs.length;
    const paidUserIds = [...new Set(activeSubs.map((s) => String(s.userId)))];
    const arpuInr = paidUserIds.length > 0 ? Math.round(mrrInr / paidUserIds.length) : 0;

    // 6-month trend
    const trend: Array<{ month: string; subInr: number; topupInr: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthLabel = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

      // Count active subs that had a payment this month as a proxy for revenue
      const monthSubs = await Subscription.find({
        'paymentHistory.paidAt': { $gte: d, $lt: monthEnd },
        'paymentHistory.status': 'captured',
      }).lean();

      let monthSubPaise = 0;
      for (const s of monthSubs) {
        const pays = (s.paymentHistory ?? []).filter(
          (p) => p.paidAt >= d && p.paidAt < monthEnd && p.status === 'captured',
        );
        for (const p of pays) monthSubPaise += p.amount;
      }

      let monthTopupInr = 0;
      if (db) {
        const topupAgg = await db
          .collection('inkledger')
          .aggregate([
            {
              $match: {
                reason: 'topup_purchase',
                createdAt: { $gte: d, $lt: monthEnd },
              },
            },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$metadata.amountInr', 0] } } } },
          ])
          .toArray();
        monthTopupInr = (topupAgg[0] as { total?: number } | undefined)?.total ?? 0;
      }

      trend.push({
        month: monthLabel,
        subInr: Math.round(monthSubPaise / 100),
        topupInr: monthTopupInr,
      });
    }

    res.json({
      mrr: mrrInr,
      arr: mrrInr * 12,
      activeCount,
      topupRevenueThisMonth: topupRevenueInr,
      arpu: arpuInr,
      planMix: planMixMap,
      trend,
    });
  },
);

export default router;
