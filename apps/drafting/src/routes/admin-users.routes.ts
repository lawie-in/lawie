/**
 * Admin user-management routes — feeds /admin/users.
 *
 *   GET  /admin/users                    List all users (search + tier filter)
 *   GET  /admin/users/:userId            User detail + recent ink ledger + draft count
 *   POST /admin/users/:userId/grant-ink  Admin ink grant into inkTopup
 *
 * All Admin-only (role === 'Admin').
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { authenticate } from '../middleware/authenticate';
import { LawieDocument } from '../models/Document.model';
import { User } from '../models/User.model';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

function normalizeTier(raw: string | undefined): 'free' | 'solo' | 'pro' {
  if (raw === 'practice' || raw === 'solo') return 'solo';
  if (raw === 'firm' || raw === 'pro') return 'pro';
  return 'free';
}

// ── GET /admin/users ───────────────────────────────────────────────────────

router.get(
  '/admin/users',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const q = String(req.query['q'] ?? '').trim();
    const tier = String(req.query['tier'] ?? '').trim();
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    const skip = Number(req.query['skip'] ?? 0);

    const filter: Record<string, unknown> = {};
    if (q) {
      filter['$or'] = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }
    if (tier === 'free') {
      filter['planTier'] = { $in: ['free', null, undefined] };
    } else if (tier === 'solo') {
      filter['planTier'] = { $in: ['solo', 'practice'] };
    } else if (tier === 'pro') {
      filter['planTier'] = { $in: ['pro', 'firm'] };
    } else if (tier === 'inactive') {
      filter['isActive'] = false;
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    const total = await User.countDocuments(filter);

    res.json({
      users: users.map((u) => {
        const raw = u as Record<string, unknown>;
        return {
          _id: String(u._id),
          name: u.name ?? '',
          email: u.email ?? '',
          planTier: normalizeTier(u.planTier),
          billingCycle: u.billingCycle ?? 'none',
          planRenewsAt: raw['planRenewsAt'] ?? null,
          isActive: raw['isActive'] !== false,
          createdAt: u.createdAt,
          lastLoginAt: raw['lastLoginAt'] ?? null,
          inkSub: Math.floor((u.inkSub ?? 0) / 2),
          inkAnnualCarry: Math.floor((u.inkAnnualCarry ?? 0) / 2),
          inkTopup: Math.floor((u.inkTopup ?? 0) / 2),
          totalInk: Math.floor(((u.inkSub ?? 0) + (u.inkAnnualCarry ?? 0) + (u.inkTopup ?? 0)) / 2),
        };
      }),
      total,
      limit,
      skip,
    });
  },
);

// ── GET /admin/users/:userId ───────────────────────────────────────────────

router.get(
  '/admin/users/:userId',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }

    const [user, draftCount, recentInkLedger] = await Promise.all([
      User.findById(userId).lean(),
      LawieDocument.countDocuments({ userId, isDeleted: { $ne: true } }),
      mongoose.connection.db
        ? mongoose.connection.db
            .collection('inkledger')
            .find({ userId: new mongoose.Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray()
        : Promise.resolve([]),
    ]);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      _id: String(user._id),
      name: user.name ?? '',
      email: user.email ?? '',
      phone: (user as Record<string, unknown>)['phone'] ?? null,
      barCouncilId: (user as Record<string, unknown>)['barCouncilId'] ?? null,
      state: (user as Record<string, unknown>)['state'] ?? null,
      practiceAreas: (user as Record<string, unknown>)['practiceAreas'] ?? [],
      planTier: normalizeTier(user.planTier),
      billingCycle: user.billingCycle ?? 'none',
      planRenewsAt: (user as Record<string, unknown>)['planRenewsAt'] ?? null,
      isActive: (user as Record<string, unknown>)['isActive'] !== false,
      createdAt: user.createdAt,
      lastLoginAt: (user as Record<string, unknown>)['lastLoginAt'] ?? null,
      referredVia: (user as Record<string, unknown>)['referredVia'] ?? null,
      inkSub: Math.floor((user.inkSub ?? 0) / 2),
      inkAnnualCarry: Math.floor((user.inkAnnualCarry ?? 0) / 2),
      inkTopup: Math.floor((user.inkTopup ?? 0) / 2),
      totalInk: Math.floor(
        ((user.inkSub ?? 0) + (user.inkAnnualCarry ?? 0) + (user.inkTopup ?? 0)) / 2,
      ),
      draftCount,
      recentInkLedger: recentInkLedger.map((row) => ({
        delta: row['delta'],
        reason: row['reason'],
        sourceBucket: row['sourceBucket'],
        reference: row['reference'],
        createdAt: row['createdAt'],
      })),
    });
  },
);

// ── POST /admin/users/:userId/grant-ink ───────────────────────────────────

router.post(
  '/admin/users/:userId/grant-ink',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { inkUnits, reason, note } = req.body as {
      inkUnits?: unknown;
      reason?: unknown;
      note?: unknown;
    };

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }
    const units = Number(inkUnits);
    if (!Number.isInteger(units) || units < 2 || units > 2000) {
      res.status(400).json({ error: 'inkUnits must be an even integer between 2 and 2000' });
      return;
    }
    const allowedReasons = ['support_grant', 'compensation', 'event_bonus'];
    if (!allowedReasons.includes(String(reason ?? ''))) {
      res.status(400).json({ error: `reason must be one of: ${allowedReasons.join(', ')}` });
      return;
    }

    const updated = await User.findByIdAndUpdate(
      new mongoose.Types.ObjectId(userId),
      { $inc: { inkTopup: units } },
      { new: true },
    ).lean();

    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const adminId = req.jwtPayload?.sub ?? 'unknown';
    if (mongoose.connection.db) {
      await mongoose.connection.db.collection('inkledger').insertOne({
        userId: new mongoose.Types.ObjectId(userId),
        delta: units,
        reason: 'admin_grant',
        sourceBucket: 'topup',
        balanceAfter: updated.inkTopup ?? units,
        reference: String(reason),
        metadata: { grantedBy: adminId, note: note ?? null, reason },
        createdAt: new Date(),
      });
    }

    res.json({
      ok: true,
      inkTopupNew: Math.floor((updated.inkTopup ?? 0) / 2),
      inkUnitsGranted: units,
    });
  },
);

export default router;
