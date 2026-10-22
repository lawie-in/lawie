/**
 * Top-up quote (T-540): the ONE place a coupon price is worked out.
 *
 * Both `GET /validate-coupon/:code` (what the footer shows) and
 * `POST /topup/order` (what is charged) call quoteTopup(), so the displayed
 * total and the charge are the same integer number of paise. Neither route
 * computes a price itself.
 *
 * - computeTopupQuote() is pure over its inputs (item, coupon, this user's
 *   usage count, the free-grant switch, now): no I/O, unit-testable alone.
 * - quoteTopup() is the thin loader: it resolves the SKU, loads the coupon and
 *   the user's CouponUsage count, and reads the free-grant switch only when
 *   the quote comes to ₹0.
 *
 * Money rules (Arjun + Vikram, 21 Oct 2026), all in integer paise:
 * - percent: discount = Math.round(originalPaise * value / 100 / 100) * 100
 *   (whole rupees; Arjun, T-540 round 2);
 * - fixed:   discount = Math.min(value * 100, originalPaise) (value is whole rupees);
 * - finalPaise = originalPaise - discount, never negative;
 * - 0 < finalPaise < 100 (below Razorpay's minimum; cannot arise from whole-rupee
 *   discounts on whole-rupee prices, kept as a guard): the discount is cut so
 *   finalPaise = 100 (₹1), here, so validate shows ₹1 and order charges ₹1;
 * - finalPaise === 0: the free-grant path, only while
 *   `feature.coupon_free_grant` is on; while off the coupon is refused.
 *
 * Checks, in this order, the same for both routes: exists, isActive,
 * expiresAt, applicablePlans (empty = all; 'all' matches), maxUses,
 * maxUsesPerUser (only when a user is known).
 */
import mongoose from 'mongoose';

import { SUBSCRIPTION_PLANS, TOPUP_SKUS, type TopupSku } from '../config/credit-skus';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';

import { isCouponFreeGrantEnabled } from './app-settings.service';

/** Razorpay's smallest order, in paise. */
export const MIN_CHARGE_PAISE = 100;

/** The user-facing reasons, unchanged from what validate-coupon showed before T-540. */
export const QUOTE_REASONS = {
  notFound: 'Coupon not found or inactive.',
  expired: 'Coupon has expired.',
  notApplicable: 'This coupon does not apply to the selected item.',
  usedUp: 'Coupon has reached its usage limit.',
  perUser: 'You have already used this coupon.',
  cannotApply: 'This coupon cannot be applied to this item.',
} as const;

/** The coupon fields the quote reads (a lean CouponCode document fits). */
export interface QuoteCoupon {
  _id: mongoose.Types.ObjectId | string;
  code: string;
  label: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  applicablePlans: string[];
  maxUses: number | null;
  maxUsesPerUser: number | null;
  uses: number;
  isActive: boolean;
  expiresAt: Date | null;
  razorpayOfferId: string | null;
}

/** A priced item: a top-up SKU (sold through /topup/order) or a plan (validate only). */
export interface QuoteItem {
  id: string;
  kind: 'topup' | 'plan';
  priceInr: number;
  /** Top-ups only. */
  topup?: TopupSku;
}

export type TopupQuote =
  | {
      ok: true;
      skuId: string;
      /** null when no item, or an unknown item, was named (validate only). */
      sku: QuoteItem | null;
      originalPaise: number | null;
      discountPaise: number;
      finalPaise: number | null;
      coupon?: QuoteCoupon;
      /** false when no user was known, so maxUsesPerUser was not checked. */
      perUserChecked: boolean;
    }
  | { ok: false; reason: string };

export function inrToPaise(inr: number): number {
  return Math.round(inr * 100);
}

export function paiseToInr(paise: number): number {
  return paise / 100;
}

export function resolveQuoteItem(skuId: string): QuoteItem | null {
  const topup = TOPUP_SKUS.find((s) => s.id === skuId);
  if (topup) return { id: topup.id, kind: 'topup', priceInr: topup.priceInr, topup };
  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === skuId);
  if (plan) return { id: plan.id, kind: 'plan', priceInr: plan.priceInr };
  return null;
}

/** The raw discount in paise, before the ₹1 minimum. */
export function computeDiscountPaise(
  discountType: 'percent' | 'fixed',
  discountValue: number,
  originalPaise: number,
): number {
  // Arjun (T-540 round 2): a percent discount rounds to whole rupees, so every
  // final amount is whole rupees (and still integer paise). 10% of ₹199 = ₹20.
  const raw =
    discountType === 'percent'
      ? Math.round((originalPaise * discountValue) / 100 / 100) * 100
      : Math.min(Math.round(discountValue * 100), originalPaise);
  return Math.max(0, Math.min(raw, originalPaise));
}

/** Discount and final amount after the ₹1-minimum rule (finalPaise is 0 or >= 100). */
export function applyMinimumCharge(
  originalPaise: number,
  rawDiscountPaise: number,
): { discountPaise: number; finalPaise: number } {
  let discountPaise = rawDiscountPaise;
  let finalPaise = Math.max(0, originalPaise - discountPaise);
  if (finalPaise > 0 && finalPaise < MIN_CHARGE_PAISE && originalPaise >= MIN_CHARGE_PAISE) {
    discountPaise = originalPaise - MIN_CHARGE_PAISE;
    finalPaise = MIN_CHARGE_PAISE;
  }
  return { discountPaise, finalPaise };
}

/**
 * Whether a coupon can make any top-up SKU free (finalPaise 0), with the same
 * rule as the quote. Used by admin create (Vikram rule 3).
 */
export function couponCanReachFree(
  discountType: 'percent' | 'fixed',
  discountValue: number,
): boolean {
  return TOPUP_SKUS.some((sku) => {
    const original = inrToPaise(sku.priceInr);
    const raw = computeDiscountPaise(discountType, discountValue, original);
    return applyMinimumCharge(original, raw).finalPaise === 0;
  });
}

/** Pure quote over its inputs. */
export function computeTopupQuote(input: {
  skuId: string;
  item: QuoteItem | null;
  couponCode?: string | null;
  coupon: QuoteCoupon | null;
  /** This user's CouponUsage count for the coupon; null when no user is known. */
  userUses: number | null;
  freeGrantEnabled: boolean;
  now: Date;
}): TopupQuote {
  const { skuId, item, coupon, userUses, freeGrantEnabled, now } = input;
  const code = (input.couponCode ?? '').trim();
  const originalPaise = item ? inrToPaise(item.priceInr) : null;

  if (!code) {
    return {
      ok: true,
      skuId,
      sku: item,
      originalPaise,
      discountPaise: 0,
      finalPaise: originalPaise,
      perUserChecked: userUses !== null,
    };
  }

  if (!coupon || !coupon.isActive) return { ok: false, reason: QUOTE_REASONS.notFound };
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: QUOTE_REASONS.expired };
  }
  const plans = coupon.applicablePlans ?? [];
  if (plans.length > 0 && skuId && !plans.includes(skuId) && !plans.includes('all')) {
    return { ok: false, reason: QUOTE_REASONS.notApplicable };
  }
  if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.uses >= coupon.maxUses) {
    return { ok: false, reason: QUOTE_REASONS.usedUp };
  }
  if (userUses !== null && coupon.maxUsesPerUser && userUses >= coupon.maxUsesPerUser) {
    return { ok: false, reason: QUOTE_REASONS.perUser };
  }

  if (originalPaise === null) {
    return {
      ok: true,
      skuId,
      sku: null,
      originalPaise: null,
      discountPaise: 0,
      finalPaise: null,
      coupon,
      perUserChecked: userUses !== null,
    };
  }

  const raw = computeDiscountPaise(coupon.discountType, coupon.discountValue, originalPaise);
  const { discountPaise, finalPaise } = applyMinimumCharge(originalPaise, raw);
  if (finalPaise === 0 && !freeGrantEnabled) {
    return { ok: false, reason: QUOTE_REASONS.cannotApply };
  }

  return {
    ok: true,
    skuId,
    sku: item,
    originalPaise,
    discountPaise,
    finalPaise,
    coupon,
    perUserChecked: userUses !== null,
  };
}

/** Normalised coupon code, or '' for none. */
export function normaliseCouponCode(code: unknown): string {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

/**
 * The loader: resolves the SKU, loads the coupon and this user's usage count,
 * and reads the free-grant switch only when the quote comes to ₹0.
 */
export async function quoteTopup(input: {
  skuId: string;
  couponCode?: string | null;
  userId?: string | null;
  now?: Date;
}): Promise<TopupQuote> {
  const now = input.now ?? new Date();
  const skuId = input.skuId ?? '';
  const item = skuId ? resolveQuoteItem(skuId) : null;
  const code = normaliseCouponCode(input.couponCode);

  let coupon: QuoteCoupon | null = null;
  let userUses: number | null = null;
  if (code) {
    coupon = (await CouponCode.findOne({ code }).lean()) as QuoteCoupon | null;
    const userId = input.userId ?? '';
    if (coupon && userId && mongoose.Types.ObjectId.isValid(userId)) {
      userUses = await CouponUsage.countDocuments({
        couponId: coupon._id,
        userId: new mongoose.Types.ObjectId(userId),
      });
    }
  }

  const base = { skuId, item, couponCode: code, coupon, userUses, now };
  const first = computeTopupQuote({ ...base, freeGrantEnabled: true });
  if (first.ok && first.finalPaise === 0 && first.coupon) {
    const enabled = await isCouponFreeGrantEnabled();
    if (!enabled) return computeTopupQuote({ ...base, freeGrantEnabled: false });
  }
  return first;
}

/** The public view of a quote, for the 409 price_changed body (no internal coupon fields). */
export function quoteView(quote: Extract<TopupQuote, { ok: true }>): Record<string, unknown> {
  return {
    skuId: quote.skuId,
    originalPaise: quote.originalPaise,
    discountPaise: quote.discountPaise,
    finalPaise: quote.finalPaise,
    originalAmountInr: quote.originalPaise === null ? null : paiseToInr(quote.originalPaise),
    discountInr: paiseToInr(quote.discountPaise),
    amountInr: quote.finalPaise === null ? null : paiseToInr(quote.finalPaise),
    couponCode: quote.coupon?.code ?? null,
  };
}
