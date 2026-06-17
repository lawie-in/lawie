/**
 * Coupon code routes.
 *
 * Admin (auth-required):
 *   POST   /admin/coupons              Create coupon
 *   GET    /admin/coupons              List all coupons
 *   PATCH  /admin/coupons/:code        Edit label / expiresAt / razorpayOfferId
 *   PATCH  /admin/coupons/:code/disable Deactivate
 *
 * Public (no auth — called from checkout):
 *   GET    /validate-coupon/:code?skuId=   Validate + compute discount
 */
import { Router, Request, Response } from 'express';

import { TOPUP_SKUS, SUBSCRIPTION_PLANS } from '../config/credit-skus';
import { authenticate } from '../middleware/authenticate';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

function randomCode(len = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// ── POST /admin/coupons ───────────────────────────────────────────────────────

router.post(
  '/admin/coupons',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const {
      code,
      label,
      discountType,
      discountValue,
      applicablePlans,
      maxUses,
      maxUsesPerUser,
      expiresAt,
      razorpayOfferId,
    } = req.body as Record<string, unknown>;

    if (!label || typeof label !== 'string') {
      res.status(400).json({ error: 'label is required' });
      return;
    }
    if (discountType !== 'percent' && discountType !== 'fixed') {
      res.status(400).json({ error: 'discountType must be percent or fixed' });
      return;
    }
    const value = Number(discountValue);
    if (!value || value < 1) {
      res.status(400).json({ error: 'discountValue must be >= 1' });
      return;
    }
    if (discountType === 'percent' && value > 100) {
      res.status(400).json({ error: 'percent discount cannot exceed 100' });
      return;
    }

    const finalCode =
      typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : randomCode();

    try {
      const coupon = await CouponCode.create({
        code: finalCode,
        label: (label as string).trim(),
        discountType,
        discountValue: value,
        applicablePlans: Array.isArray(applicablePlans) ? applicablePlans : [],
        maxUses: maxUses !== null && maxUses !== undefined ? Number(maxUses) : null,
        maxUsesPerUser: maxUsesPerUser ? Number(maxUsesPerUser) : 1,
        expiresAt: expiresAt ? new Date(expiresAt as string) : null,
        razorpayOfferId: razorpayOfferId ? String(razorpayOfferId) : null,
      });
      res.status(201).json(coupon);
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        res.status(409).json({ error: `Code "${finalCode}" already exists.` });
        return;
      }
      throw err;
    }
  },
);

// ── GET /admin/coupons ────────────────────────────────────────────────────────

router.get(
  '/admin/coupons',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const coupons = await CouponCode.find().sort({ createdAt: -1 }).lean();
    res.json({ coupons });
  },
);

// ── PATCH /admin/coupons/:code ────────────────────────────────────────────────

router.patch(
  '/admin/coupons/:code',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { label, expiresAt, razorpayOfferId } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (label !== undefined) update['label'] = String(label).trim();
    if (expiresAt !== undefined)
      update['expiresAt'] = expiresAt ? new Date(expiresAt as string) : null;
    if (razorpayOfferId !== undefined)
      update['razorpayOfferId'] = razorpayOfferId ? String(razorpayOfferId) : null;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'Nothing to update.' });
      return;
    }

    const coupon = await CouponCode.findOneAndUpdate(
      { code: req.params['code']?.toUpperCase() },
      { $set: update },
      { new: true },
    ).lean();

    if (!coupon) {
      res.status(404).json({ error: 'Coupon not found.' });
      return;
    }
    res.json(coupon);
  },
);

// ── PATCH /admin/coupons/:code/disable ───────────────────────────────────────

router.patch(
  '/admin/coupons/:code/disable',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const coupon = await CouponCode.findOneAndUpdate(
      { code: req.params['code']?.toUpperCase() },
      { $set: { isActive: false } },
      { new: true },
    ).lean();
    if (!coupon) {
      res.status(404).json({ error: 'Coupon not found.' });
      return;
    }
    res.json(coupon);
  },
);

// ── GET /validate-coupon/:code ────────────────────────────────────────────────
// Public — no auth. Called from checkout before creating Razorpay order.

router.get('/validate-coupon/:code', async (req: Request, res: Response): Promise<void> => {
  const code = (req.params['code'] ?? '').toUpperCase();
  const skuId = String(req.query['skuId'] ?? '');
  const userId = String(req.query['userId'] ?? '');

  const coupon = await CouponCode.findOne({ code }).lean();
  if (!coupon || !coupon.isActive) {
    res.json({ valid: false, reason: 'Coupon not found or inactive.' });
    return;
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    res.json({ valid: false, reason: 'Coupon has expired.' });
    return;
  }
  if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.uses >= coupon.maxUses) {
    res.json({ valid: false, reason: 'Coupon has reached its usage limit.' });
    return;
  }

  // Per-user limit check (only if userId provided)
  if (userId && coupon.maxUsesPerUser) {
    const userUses = await CouponUsage.countDocuments({
      couponId: coupon._id,
      userId,
    });
    if (userUses >= coupon.maxUsesPerUser) {
      res.json({ valid: false, reason: 'You have already used this coupon.' });
      return;
    }
  }

  // Resolve original price from skuId
  const topupSku = TOPUP_SKUS.find((s) => s.id === skuId);
  const subPlan = SUBSCRIPTION_PLANS.find((p) => p.id === skuId);
  const originalPriceInr = topupSku?.priceInr ?? subPlan?.priceInr ?? null;

  // Plan applicability
  if (coupon.applicablePlans.length > 0 && skuId) {
    const applies =
      coupon.applicablePlans.includes(skuId) || coupon.applicablePlans.includes('all');
    if (!applies) {
      res.json({ valid: false, reason: 'This coupon does not apply to the selected item.' });
      return;
    }
  }

  let discountInr = 0;
  if (originalPriceInr !== null && originalPriceInr !== undefined) {
    discountInr =
      coupon.discountType === 'percent'
        ? Math.round((originalPriceInr * coupon.discountValue) / 100)
        : Math.min(coupon.discountValue, originalPriceInr);
  }
  const finalPriceInr =
    originalPriceInr !== null && originalPriceInr !== undefined
      ? Math.max(0, originalPriceInr - discountInr)
      : null;

  res.json({
    valid: true,
    code: coupon.code,
    label: coupon.label,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    razorpayOfferId: coupon.razorpayOfferId,
    originalPriceInr,
    discountInr,
    finalPriceInr,
  });
});

export default router;
