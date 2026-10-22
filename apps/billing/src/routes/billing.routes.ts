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
import { readSellerConfig } from '../config/gst';
import logger from '../config/logger';
import { razorpay } from '../config/razorpay';
import { authenticate } from '../middleware/authenticate';
import { Invoice } from '../models/Invoice.model';
import { User } from '../models/User.model';
import { GrantClaimBusyError, grantCouponInk } from '../services/ink-ledger.service';
import { invoicePdfFilename, renderInvoicePdf } from '../services/invoice-pdf.service';
import {
  cancelSubscriptionAtCycleEnd,
  createSubscription,
  getSubscriptionStatus,
  handleWebhookEvent,
  NoLiveSubscriptionError,
  SubscriptionCancelFailedError,
  SubscriptionCreateUnknownOutcomeError,
  SubscriptionExistsError,
  SubscriptionInProgressError,
  verifyWebhookSignature,
} from '../services/subscription.service';
import {
  QUOTE_REASONS,
  normaliseCouponCode,
  paiseToInr,
  quoteTopup,
  quoteView,
  type TopupQuote,
} from '../services/topup-quote.service';

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
      // T-444 (Arjun ruling 7): a live sub exists; the user fixes or cancels it first.
      if (err instanceof SubscriptionExistsError) {
        res.status(409).json({
          error: 'subscription_exists',
          status: err.status,
          planId: err.planId,
          paidThrough: err.paidThrough,
          // T-516 (Arjun): past_due only; the live Razorpay link or null.
          // Absent for any other state, so that body is unchanged.
          ...(err.shortUrl !== undefined ? { shortUrl: err.shortUrl } : {}),
        });
        return;
      }
      // T-444c (Arjun ruling 1): another create for this user is in flight.
      if (err instanceof SubscriptionInProgressError) {
        res.status(409).json({ error: 'subscription_in_progress' });
        return;
      }
      // T-444c (Arjun ruling 2): the lapsed sub could not be cancelled at
      // Razorpay; nothing was changed and no new sub was created.
      // T-516: same for a stale checkout for a different plan.
      if (err instanceof SubscriptionCancelFailedError) {
        res.status(503).json({ error: 'try_again' });
        return;
      }
      // T-526 (Arjun, item 1a): the create timed out; its outcome at Razorpay
      // is unknown. Fixed body, never err.message.
      if (err instanceof SubscriptionCreateUnknownOutcomeError) {
        res.status(503).json({ error: 'try_again' });
        return;
      }
      // T-526 (Arjun, item 1c): fixed body and the error class only, never
      // err.message (a provider or internal message), as on /cancel. An
      // unknown planId also lands here (500; a 400 is a recorded follow-up).
      logger.error(
        {
          userId: req.jwtPayload?.sub,
          errName: err instanceof Error ? err.name : 'unknown',
        },
        'Failed to create subscription',
      );
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  },
);

// ── POST /cancel — T-508: cancel the live subscription at the end of the cycle ─
//
// Idempotent: a second call returns the same body, with no Razorpay call.
// Ink and the plan are untouched (they run to paidThrough, T-399).
router.post('/cancel', authenticate, requireCurrentPrivacy, async (req: Request, res: Response) => {
  const { sub: userId } = req.jwtPayload!;
  try {
    const result = await cancelSubscriptionAtCycleEnd(userId);
    res.json({ status: 'success', data: result });
  } catch (err) {
    if (err instanceof NoLiveSubscriptionError) {
      res.status(409).json({ error: 'no_live_subscription' });
      return;
    }
    if (err instanceof SubscriptionCancelFailedError) {
      res.status(503).json({ error: 'try_again' });
      return;
    }
    logger.error(
      { userId, errName: err instanceof Error ? err.name : 'unknown' },
      'Failed to cancel subscription',
    );
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// ── POST /topup/order — create a one-off Razorpay order for a top-up SKU ─────
//
// Body: { skuId, couponCode?, expectedAmountPaise? }
// T-540: the amount comes from quoteTopup(), the same function validate-coupon
// shows the footer total with, in integer paise. Responses:
// - 200 { status: 'success', data: { orderId, amountInr, amountPaise, finalPaise, originalAmountInr,
//   ink, skuId, couponApplied, razorpayKeyId } }: hand orderId to Razorpay Checkout;
// - 200 { status: 'granted', grant: { ink, couponCode, ledgerKey } }: a ₹0 quote (100%
//   coupon) with feature.coupon_free_grant on; Ink granted, no Razorpay order, no data;
// - 409 { error: 'coupon_invalid', reason }: the coupon given no longer applies
//   (never silently dropped), or a free grant lost a race; nothing created;
// - 409 { error: 'price_changed', quote }: expectedAmountPaise differs from the quote.
// T-343 — user-started payment: needs the current privacy version (not the webhook).
// T-223 — and a verified email (or Google account).
router.post(
  '/topup/order',
  authenticate,
  requireCurrentPrivacy,
  requireVerifiedEmail,
  async (req: Request, res: Response) => {
    const { sub: userId } = req.jwtPayload!;
    const { skuId, couponCode, expectedAmountPaise } = req.body as {
      skuId?: string;
      couponCode?: unknown;
      expectedAmountPaise?: unknown;
    };

    const sku = findTopupSku(String(skuId ?? ''));
    if (!sku) {
      res.status(400).json({ error: 'Unknown top-up SKU' });
      return;
    }
    if (
      expectedAmountPaise !== undefined &&
      expectedAmountPaise !== null &&
      !(typeof expectedAmountPaise === 'number' && Number.isInteger(expectedAmountPaise))
    ) {
      res.status(400).json({ error: 'expectedAmountPaise must be an integer' });
      return;
    }
    // T-540 round 3: a couponCode that is present must be a non-blank string. A
    // number, an object or a blank string is refused, never read as "no coupon"
    // (that would charge full price silently). The web leaves the field out when
    // there is no coupon, so it never sends a blank one.
    if (
      couponCode !== undefined &&
      couponCode !== null &&
      (typeof couponCode !== 'string' || couponCode.trim() === '')
    ) {
      res.status(400).json({ error: 'invalid_coupon_code' });
      return;
    }
    const code = normaliseCouponCode(couponCode);

    let quote: TopupQuote;
    try {
      quote = await quoteTopup({ skuId: sku.id, couponCode: code, userId, now: new Date() });
    } catch (err) {
      logger.error(
        { skuId: sku.id, errName: err instanceof Error ? err.name : 'unknown' },
        'Failed to quote top-up',
      );
      res.status(500).json({ error: 'Failed to create top-up order' });
      return;
    }
    if (!quote.ok) {
      res.status(409).json({ error: 'coupon_invalid', reason: quote.reason });
      return;
    }
    // A top-up SKU always prices, so these are set; guard for the type only.
    if (quote.originalPaise === null || quote.finalPaise === null) {
      res.status(500).json({ error: 'Failed to create top-up order' });
      return;
    }
    const { originalPaise, finalPaise } = quote;

    if (typeof expectedAmountPaise === 'number' && expectedAmountPaise !== finalPaise) {
      res.status(409).json({ error: 'price_changed', quote: quoteView(quote) });
      return;
    }

    // ── ₹0: the free-grant path (the quote is ok only while the switch is on) ──
    if (finalPaise === 0 && quote.coupon) {
      const coupon = quote.coupon;
      let grant;
      try {
        grant = await grantCouponInk({
          userId,
          couponId: String(coupon._id),
          couponCode: coupon.code,
          maxUsesPerUser: coupon.maxUsesPerUser,
          skuId: sku.id,
          inkUnits: sku.ink * 2, // 1 Ink = 2 ledger units
          listPaise: originalPaise,
        });
      } catch (err) {
        logger.error(
          {
            couponCode: coupon.code,
            skuId: sku.id,
            errName: err instanceof Error ? err.name : 'unknown',
          },
          'Failed to grant coupon top-up',
        );
        res.status(500).json({ error: 'Failed to create top-up order' });
        return;
      }
      if (!grant.ok) {
        if (grant.reason === 'user_not_found') {
          res.status(500).json({ error: 'Failed to create top-up order' });
          return;
        }
        res.status(409).json({
          error: 'coupon_invalid',
          reason: grant.reason === 'per_user_limit' ? QUOTE_REASONS.perUser : QUOTE_REASONS.usedUp,
        });
        return;
      }
      // Vikram: the monthly list value given away, for the marketing-spend line.
      // No PII: no userId or ledger key, only the per-user use index n.
      logger.info(
        { couponCode: coupon.code, skuId: sku.id, listPaise: originalPaise, n: grant.n },
        'coupon free grant',
      );
      res.json({
        status: 'granted',
        grant: { ink: sku.ink, couponCode: coupon.code, ledgerKey: grant.ledgerKey },
      });
      return;
    }

    const appliedCouponCode = quote.coupon ? quote.coupon.code : null;

    try {
      const notes: Record<string, string | number> = {
        sku_id: sku.id,
        user_id: userId,
        ink: sku.ink,
      };
      if (appliedCouponCode) notes['coupon_code'] = appliedCouponCode;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const order = await (razorpay.orders.create as any)({
        amount: finalPaise, // integer paise, from the quote
        currency: 'INR',
        receipt: `topup_${sku.id}_${userId.slice(-8)}_${Date.now().toString().slice(-8)}`,
        notes,
      });

      res.json({
        status: 'success',
        data: {
          orderId: order.id,
          amountInr: paiseToInr(finalPaise),
          amountPaise: finalPaise,
          finalPaise,
          originalAmountInr: paiseToInr(originalPaise),
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

// ── GET /public/supplier — T-436: GST supplier details for public pages ──────
//
// No auth (gateway: /api/billing/public/supplier, public like /plans). Legal
// name, trade name, GSTIN and State from env. No street address: Ajay's
// Addendum 1 keeps it off public pages until the E-Commerce Rules question is
// settled (it stays on the invoice PDF). 503 with an empty body while any of
// the five seller values (GST_ADDRESS included, which invoices need) is missing.
router.get('/public/supplier', (_req: Request, res: Response) => {
  const seller = readSellerConfig();
  if (!seller) {
    res.set('Cache-Control', 'no-store');
    res.status(503).json({});
    return;
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    legalName: seller.legalName,
    tradeName: seller.tradeName,
    gstin: seller.gstin,
    stateCode: seller.stateCode,
    stateName: seller.stateName,
  });
});

// ── GET /invoices — T-436: the caller's issued invoices and credit notes ─────
//
// Newest first. Without the seller block (it is the same on every row and the
// PDF carries it).
router.get('/invoices', authenticate, async (req: Request, res: Response) => {
  const userId = req.jwtPayload!.sub;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.json({ status: 'success', data: [] });
    return;
  }
  try {
    const rows = await Invoice.find({
      userId: new mongoose.Types.ObjectId(userId),
      state: 'issued',
    })
      .sort({ issuedAt: -1, _id: -1 })
      .select('-seller -draft -__v')
      .lean();
    res.json({
      status: 'success',
      data: rows.map((r) => ({
        id: String(r._id),
        number: r.number,
        kind: r.kind,
        issuedAt: r.issuedAt,
        customer: r.customer,
        placeOfSupply: r.placeOfSupply,
        lines: r.lines,
        price: r.price,
        taxable: r.taxable,
        cgst: r.cgst,
        sgst: r.sgst,
        igst: r.igst,
        total: r.total,
        originalInvoiceId: r.originalInvoiceId ? String(r.originalInvoiceId) : null,
        originalInvoiceNumber: r.originalInvoiceNumber ?? null,
      })),
    });
  } catch (err) {
    logger.error(
      { userId, errName: err instanceof Error ? err.name : 'unknown' },
      'Failed to list invoices',
    );
    res.status(500).json({ error: 'Failed to list invoices' });
  }
});

// ── GET /invoices/:id/pdf — T-436: one issued invoice as a PDF ───────────────
//
// Owner or Admin; anyone else (and any unknown, unissued or malformed id) 404.
router.get('/invoices/:id/pdf', authenticate, async (req: Request, res: Response) => {
  const { sub: userId, role } = req.jwtPayload!;
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  try {
    const inv = await Invoice.findOne({ _id: new mongoose.Types.ObjectId(id), state: 'issued' });
    if (!inv || (role !== 'Admin' && String(inv.userId) !== userId)) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    const pdf = await renderInvoicePdf(inv);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoicePdfFilename(inv.number!)}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(pdf.length),
    });
    res.send(pdf);
  } catch (err) {
    logger.error(
      { invoiceId: id, errName: err instanceof Error ? err.name : 'unknown' },
      'Failed to render invoice PDF',
    );
    res.status(500).json({ error: 'Failed to render invoice' });
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
