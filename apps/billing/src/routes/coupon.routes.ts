/**
 * Coupon code routes.
 *
 * Admin (auth-required):
 *   POST   /admin/coupons              Create coupon
 *   GET    /admin/coupons              List all coupons
 *   PATCH  /admin/coupons/:code        Edit label / expiresAt / razorpayOfferId
 *   PATCH  /admin/coupons/:code/disable Deactivate
 *
 * Public, optional auth (called from checkout):
 *   GET    /validate-coupon/:code?skuId=   Validate + quote (T-540: quoteTopup)
 */
import { INTERNAL_HEADERS } from '@lawie/shared';
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { authenticate } from '../middleware/authenticate';
import { CouponCode } from '../models/CouponCode.model';
import {
  QUOTE_REASONS,
  couponCanReachFree,
  normaliseCouponCode,
  paiseToInr,
  quoteTopup,
} from '../services/topup-quote.service';
import { internalSecretMatches } from '../utils/internal-secret';

/** A positive whole number, or null when the field was not given as one. */
function positiveInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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
    // T-540: fixed discounts are whole rupees, so quotes stay in integer paise.
    if (discountType === 'fixed' && !Number.isInteger(value)) {
      res.status(400).json({ error: 'fixed discountValue must be a whole number of rupees' });
      return;
    }
    // T-540 (Vikram rule 3): a coupon that can make a top-up free must carry
    // both limits, given explicitly and non-zero (no maxUsesPerUser default).
    if (couponCanReachFree(discountType, value)) {
      if (positiveInt(maxUses) === null || positiveInt(maxUsesPerUser) === null) {
        res.status(400).json({
          error:
            'A coupon that can make an item free needs maxUses and maxUsesPerUser, both whole numbers above 0',
        });
        return;
      }
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
// Called from checkout before creating the Razorpay order. T-540: the price
// comes from quoteTopup(), the same function /topup/order charges with, so the
// footer total equals the charge. Optional auth: a request the gateway signed
// with a user id gets the maxUsesPerUser check for that user; any other request
// is anonymous and answered with perUserChecked: false. The old userId query
// param is ignored (anyone could pass any id).

/** The gateway-verified user id, or null (anonymous). Never rejects the request. */
function optionalUserId(req: Request): string | null {
  if (!internalSecretMatches(req.headers[INTERNAL_HEADERS.SECRET], env.INTERNAL_SECRET)) {
    return null;
  }
  const id = req.headers[INTERNAL_HEADERS.USER_ID];
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) ? id : null;
}

router.get('/validate-coupon/:code', async (req: Request, res: Response): Promise<void> => {
  const code = normaliseCouponCode(req.params['code'] ?? '');
  const skuId = String(req.query['skuId'] ?? '');
  const userId = optionalUserId(req);

  const quote = await quoteTopup({ skuId, couponCode: code, userId, now: new Date() });
  if (!quote.ok) {
    res.json({ valid: false, reason: quote.reason });
    return;
  }
  if (!quote.coupon) {
    // Unreachable for a non-empty code; kept so the response shape never lies.
    res.json({ valid: false, reason: QUOTE_REASONS.notFound });
    return;
  }

  const { coupon, originalPaise, discountPaise, finalPaise } = quote;
  res.json({
    valid: true,
    code: coupon.code,
    label: coupon.label,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    razorpayOfferId: coupon.razorpayOfferId,
    originalPriceInr: originalPaise === null ? null : paiseToInr(originalPaise),
    discountInr: paiseToInr(discountPaise),
    finalPriceInr: finalPaise === null ? null : paiseToInr(finalPaise),
    originalPaise,
    discountPaise,
    finalPaise,
    // Same name as /topup/order's data.amountPaise, so the web compares like for like.
    amountPaise: finalPaise,
    perUserChecked: quote.perUserChecked,
  });
});

export default router;
