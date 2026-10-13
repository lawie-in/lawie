import { requireCurrentPrivacy } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

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
import { User } from '../models/User.model';
import { GrantClaimBusyError } from '../services/ink-ledger.service';
import {
  createSubscription,
  getSubscriptionStatus,
  handleWebhookEvent,
  verifyWebhookSignature,
} from '../services/subscription.service';

const router = Router();

/** T-223 AC5 — error code the web app turns into the verify-your-email prompt at checkout. */
export const EMAIL_VERIFICATION_REQUIRED = 'email_verification_required';

/**
 * T-223 AC5 (Arjun, condition 4) — refuses a user-started payment for an email user whose
 * address is not verified. "Verified" is the T-351 rule (VERIFIED_FOR_BONUS in
 * apps/auth/src/services/credit-bonus.service.ts): emailVerified true, OR authProvider 'google',
 * OR a non-empty googleId. Reads the shared users collection only, never writes it.
 * Fails closed: an unknown user gets the same 403. Mount after authenticate and
 * requireCurrentPrivacy, only on POST /subscribe and POST /topup/order (never the webhook, so
 * auto-renewals are untouched). Logs the userId only.
 */
export async function requireVerifiedEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.jwtPayload?.sub;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(403).json({ error: EMAIL_VERIFICATION_REQUIRED });
    return;
  }
  let user;
  try {
    user = await User.findById(userId, { emailVerified: 1, authProvider: 1, googleId: 1 }).lean();
  } catch {
    logger.error({ userId }, 'Email verification check failed');
    res.status(503).json({ error: 'Service unavailable' });
    return;
  }
  const verified =
    !!user &&
    (user.emailVerified === true ||
      user.authProvider === 'google' ||
      (typeof user.googleId === 'string' && user.googleId.length > 0));
  if (!verified) {
    res.status(403).json({ error: EMAIL_VERIFICATION_REQUIRED });
    return;
  }
  next();
}

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
// T-223 — and a verified email (or Google account).
router.post(
  '/subscribe',
  authenticate,
  requireCurrentPrivacy,
  requireVerifiedEmail,
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
// T-223 — and a verified email (or Google account).
router.post(
  '/topup/order',
  authenticate,
  requireCurrentPrivacy,
  requireVerifiedEmail,
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
router.post('/webhook/razorpay', async (req: Request, res: Response) => {
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

  // T-413: ack only after the handler succeeds. A thrown error (e.g. a failed Ink
  // grant) returns 500 so Razorpay retries; T-399's per-cycle claim, rolled back on a
  // failed grant, makes that retry grant exactly once. Fixed 500 body, nothing from err.
  try {
    await handleWebhookEvent(payload.event, payload.payload);
  } catch (err: unknown) {
    // T-323: no err.message or stack (a duplicate-key message carries the duplicate value).
    const e = err as { name?: unknown; code?: unknown } | null | undefined;
    // T-415: another attempt holds a fresh grant claim (normal for the order.paid +
    // payment.captured pair). 500 so Razorpay retries, but it is not an alert.
    if (err instanceof GrantClaimBusyError || e?.name === 'GrantClaimBusyError') {
      logger.warn(
        { event: payload.event, errorName: e?.name, errorCode: e?.code },
        'Webhook grant claim pending in another attempt; asking Razorpay to retry',
      );
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
    logger.error(
      { event: payload.event, errorName: e?.name, errorCode: e?.code },
      'Webhook handler error',
    );
    // T-413 (Arjun): one Sentry issue per Razorpay event, however many retries. The
    // event-id header is used only as the fingerprint. Never capture the original err
    // (its message can carry PII, e.g. E11000 echoes the key); the request (body,
    // headers, IP) is stripped from the event.
    const eventIdHeader = req.headers['x-razorpay-event-id'];
    const errorName = typeof e?.name === 'string' ? e.name : undefined;
    const errorCode =
      typeof e?.code === 'string' || typeof e?.code === 'number' ? e.code : undefined;
    Sentry.withScope((scope) => {
      scope.setFingerprint([
        'razorpay-webhook',
        typeof eventIdHeader === 'string' && eventIdHeader ? eventIdHeader : payload.event,
      ]);
      scope.setSDKProcessingMetadata({ normalizedRequest: undefined, ipAddress: undefined });
      scope.addEventProcessor((event) => {
        delete event.request;
        delete event.user;
        return event;
      });
      scope.setTags({ event: payload.event, errorName, errorCode });
      Sentry.captureException(
        new Error(
          `Razorpay webhook handler failed: ${errorName ?? 'unknown'}${
            errorCode !== undefined ? ` (${errorCode})` : ''
          }`,
        ),
      );
    });
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }
  res.json({ status: 'ok' });
});

export default router;
