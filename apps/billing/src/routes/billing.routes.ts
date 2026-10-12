import { requireCurrentPrivacy } from '@lawie/shared';
import { Router, Request, Response } from 'express';

import {
  SUBSCRIPTION_PLANS,
  TOPUP_SKUS,
  findSubscriptionPlan,
  findTopupSku,
} from '../config/credit-skus';
import logger from '../config/logger';
import { razorpay } from '../config/razorpay';
import { authenticate } from '../middleware/authenticate';
import { CouponCode } from '../models/CouponCode.model';
import {
  createSubscription,
  getSubscriptionStatus,
  handleWebhookEvent,
  verifyWebhookSignature,
} from '../services/subscription.service';

const router = Router();

// ── GET /plans — public catalog for /pricing page ─────────────────────────────
//
// No auth — the marketing page needs to render before login.
router.get('/plans', (_req: Request, res: Response) => {
  res.json({
    subscriptions: SUBSCRIPTION_PLANS.map((p) => ({
      id: p.id,
      tier: p.tier,
      cycle: p.cycle,
      priceInr: p.priceInr,
      inkPerCycle: p.inkPerCycle,
    })),
    topups: TOPUP_SKUS.map((t) => ({
      id: t.id,
      ink: t.ink,
      priceInr: t.priceInr,
      badge: t.badge,
      pricePerInkInr: t.pricePerInkInr,
    })),
  });
});

// ── POST /subscribe — create a Razorpay subscription for a specific plan ─────
//
// Body: { planId: 'practice_monthly' | 'practice_yearly' | 'firm_monthly' | 'firm_yearly' }
// T-343 — user-started payment: needs the current privacy version (not the webhook).
router.post(
  '/subscribe',
  authenticate,
  requireCurrentPrivacy,
  async (req: Request, res: Response) => {
    try {
      const { sub: userId, email } = req.jwtPayload!;
      const { planId } = req.body as { planId?: string };
      const result = await createSubscription(userId, email, planId);
      res.json({ status: 'success', data: result });
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : err },
        'Failed to create subscription',
      );
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to create subscription',
      });
    }
  },
);

// ── POST /topup/order — create a one-off Razorpay order for a top-up SKU ─────
//
// Body: { skuId: 'topup_mini' | 'topup_mid' | 'topup_max' }
// Response: { orderId, amountInr, ink, razorpayKeyId } so the frontend can
// hand the orderId to Razorpay Checkout SDK.
// T-343 — user-started payment: needs the current privacy version (not the webhook).
router.post(
  '/topup/order',
  authenticate,
  requireCurrentPrivacy,
  async (req: Request, res: Response) => {
    const { sub: userId } = req.jwtPayload!;
    const { skuId, couponCode } = req.body as { skuId?: string; couponCode?: string };

    const sku = findTopupSku(String(skuId ?? ''));
    if (!sku) {
      res.status(400).json({ error: 'Unknown top-up SKU' });
      return;
    }

    let finalPriceInr = sku.priceInr;
    let appliedCouponCode: string | null = null;

    if (couponCode) {
      const code = couponCode.trim().toUpperCase();
      const coupon = await CouponCode.findOne({ code, isActive: true }).lean();
      if (coupon && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
        if (
          coupon.maxUses === null ||
          coupon.maxUses === undefined ||
          coupon.uses < coupon.maxUses
        ) {
          const discountInr =
            coupon.discountType === 'percent'
              ? Math.round((sku.priceInr * coupon.discountValue) / 100)
              : Math.min(coupon.discountValue, sku.priceInr);
          finalPriceInr = Math.max(1, sku.priceInr - discountInr);
          appliedCouponCode = code;
        }
      }
    }

    try {
      const notes: Record<string, string | number> = {
        sku_id: sku.id,
        user_id: userId,
        ink: sku.ink,
      };
      if (appliedCouponCode) notes['coupon_code'] = appliedCouponCode;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const order = await (razorpay.orders.create as any)({
        amount: finalPriceInr * 100, // paise
        currency: 'INR',
        receipt: `topup_${sku.id}_${userId.slice(-8)}_${Date.now().toString().slice(-8)}`,
        notes,
      });

      res.json({
        status: 'success',
        data: {
          orderId: order.id,
          amountInr: finalPriceInr,
          originalAmountInr: sku.priceInr,
          ink: sku.ink,
          skuId: sku.id,
          couponApplied: appliedCouponCode,
          razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        },
      });
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : err },
        'Failed to create top-up order',
      );
      res.status(500).json({ error: 'Failed to create top-up order' });
    }
  },
);

// ── GET /plan/:id — fetch one plan's details (for paywall modal) ────────────
router.get('/plan/:id', (req: Request, res: Response) => {
  const plan = findSubscriptionPlan(req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }
  res.json({
    id: plan.id,
    tier: plan.tier,
    cycle: plan.cycle,
    priceInr: plan.priceInr,
    inkPerCycle: plan.inkPerCycle,
  });
});

// GET /status — return the user's current plan and subscription state
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { sub: userId } = req.jwtPayload!;
    const result = await getSubscriptionStatus(userId);
    res.json({ status: 'success', data: result });
  } catch (err) {
    logger.error({ err }, 'Failed to get subscription status');
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// POST /webhook/razorpay — receive Razorpay webhook events
// Raw body required for HMAC signature verification — mounted before express.json()
router.post('/webhook/razorpay', (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string;

  if (!signature) {
    res.status(400).json({ error: 'Missing signature header' });
    return;
  }

  if (!verifyWebhookSignature(req.body as Buffer, signature)) {
    logger.warn('Webhook signature verification failed');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  // T-320: a correctly signed but malformed body must not throw. A SyntaxError here
  // would reach Express's default handler, which prints err.message (with a body
  // slice) to stderr. Plain 400, same shape as T-315; nothing from the body or the
  // error is logged.
  let parsed: unknown;
  try {
    parsed = JSON.parse((req.body as Buffer).toString());
  } catch {
    logger.warn('Webhook body is not valid JSON');
    res.status(400).json({ error: 'Bad Request' });
    return;
  }

  // T-323: valid JSON that is not a plain object (null, array, string, number) or has
  // no string `event` would throw a TypeError in the async handler after the ack.
  // Reject it here, before the ack. Fixed messages only; nothing from the body is logged.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    logger.warn('Webhook body is not an object');
    res.status(400).json({ error: 'Bad Request' });
    return;
  }
  if (typeof (parsed as { event?: unknown }).event !== 'string') {
    logger.warn('Webhook body has no event');
    res.status(400).json({ error: 'Bad Request' });
    return;
  }
  const inner = (parsed as { payload?: unknown }).payload;
  if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) {
    logger.warn('Webhook body has no payload');
    res.status(400).json({ error: 'Bad Request' });
    return;
  }
  const payload = parsed as { event: string; payload: Record<string, unknown> };

  // Acknowledge immediately — process async so Razorpay doesn't retry
  res.json({ status: 'ok' });

  handleWebhookEvent(payload.event, payload.payload).catch((err: unknown) => {
    // T-323: no err.message or stack (a duplicate-key message carries the duplicate value).
    const e = err as { name?: unknown; code?: unknown } | null | undefined;
    logger.error(
      { event: payload.event, errorName: e?.name, errorCode: e?.code },
      'Webhook handler error',
    );
  });
});

export default router;
