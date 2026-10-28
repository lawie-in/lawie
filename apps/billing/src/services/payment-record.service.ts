/**
 * T-646: the customer's payment history (Payment rows).
 *
 * Writers (Arjun ruling 3): every webhook writer runs AFTER the Ink grant, in
 * its own try/catch, and is idempotent (upsert on the Razorpay payment id). A
 * failure logs `err.name` only and never changes the webhook's response, the
 * grant, or the T-413 / T-415 claim order. Statuses only move forward
 * (processing -> failed -> paid -> partly_refunded / refunded), so a late or
 * repeated event never undoes a later one.
 *
 * Reader: listPaymentsForUser builds GET /payments (own user only). A payment
 * still 'processing' 24 h after the attempt is flagged `checking: true` and
 * raises ONE Sentry event per payment, ids only (Vikram 2).
 *
 * Logs carry ids, statuses and counts only. Nothing here reads or returns a
 * concern note.
 */
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

import { findPlanByRazorpayId, findSubscriptionPlan, findTopupSku } from '../config/credit-skus';
import logger from '../config/logger';
import { razorpay } from '../config/razorpay';
import { Invoice } from '../models/Invoice.model';
import {
  type IPayment,
  Payment,
  type PaymentKind,
  type PaymentStatus,
  VISIBLE_PAYMENT_STATUSES,
  type VisiblePaymentStatus,
} from '../models/Payment.model';
import { PaymentConcern, type ConcernStatus } from '../models/PaymentConcern.model';
import { Subscription } from '../models/Subscription.model';

import { REFUND_REVERSAL_REASON, topupClaimId } from './ink-ledger.service';

/** Vikram 2: a payment still processing this long after the attempt is "being checked". */
export const PROCESSING_CHECK_AFTER_MS = 24 * 60 * 60 * 1000;

/** Most rows GET /payments returns (newest first). */
export const PAYMENT_LIST_LIMIT = 500;

/** Characters of the Razorpay payment id shown on a row (API contract). */
export const REFERENCE_TAIL_LENGTH = 8;

const STATUS_RANK: Record<PaymentStatus, number> = {
  created: -1,
  processing: 0,
  failed: 1,
  paid: 2,
  partly_refunded: 3,
  refunded: 3,
};

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}

type Entity = Record<string, unknown>;

/** The payment entity in a Razorpay webhook payload, or undefined. */
export function paymentEntityOf(payload: Record<string, unknown>): Entity | undefined {
  return (payload.payment as Entity | undefined)?.entity as Entity | undefined;
}

function paise(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

function fromUnixSeconds(v: unknown): Date | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? new Date(v * 1000) : null;
}

/** The status a Razorpay payment entity maps to (Vikram 1), or null to ignore it. */
export function statusFromEntity(entity: Entity): Exclude<PaymentStatus, 'created'> | null {
  switch (entity.status) {
    case 'captured':
    case 'refunded': {
      // Razorpay keeps a partly refunded payment 'captured', with amount_refunded > 0.
      const amount = paise(entity.amount) ?? 0;
      const refunded = paise(entity.amount_refunded) ?? 0;
      if (refunded <= 0) return 'paid';
      return refunded >= amount ? 'refunded' : 'partly_refunded';
    }
    case 'failed':
      return 'failed';
    case 'created':
    case 'authorized':
      return 'processing';
    default:
      return null;
  }
}

/** Who and what a payment is for, when the caller knows it. */
export interface PaymentContext {
  userId?: string;
  kind?: PaymentKind;
  /** Ledger units the payment granted (1 Ink = 2 units). */
  inkUnits?: number;
  razorpaySubscriptionId?: string;
  planId?: string;
  topupSkuId?: string;
}

/**
 * Fills in the user and kind for a payment entity the caller could not attribute:
 * notes (user_id + sku_id), then the order row from POST /topup/order, then the
 * T-413 top-up claim in the ledger. Null when none of them knows the payment.
 */
export async function resolvePaymentContext(
  entity: Entity,
  ctx: PaymentContext = {},
): Promise<PaymentContext | null> {
  if (ctx.userId && mongoose.Types.ObjectId.isValid(ctx.userId) && ctx.kind) return ctx;

  // Already recorded (e.g. a plan charge, then its refund): the row knows.
  if (typeof entity.id === 'string' && entity.id) {
    const existing = await Payment.findOne({ razorpayPaymentId: entity.id }).lean();
    if (existing) {
      return {
        ...ctx,
        userId: String(existing.userId),
        kind: existing.kind,
        inkUnits: ctx.inkUnits ?? existing.inkUnits,
      };
    }
  }

  const notes = (entity.notes ?? {}) as Record<string, unknown>;
  if (typeof notes.user_id === 'string' && mongoose.Types.ObjectId.isValid(notes.user_id)) {
    const sku = typeof notes.sku_id === 'string' ? findTopupSku(notes.sku_id) : undefined;
    if (sku) {
      return {
        ...ctx,
        userId: notes.user_id,
        kind: 'topup',
        topupSkuId: sku.id,
        inkUnits: ctx.inkUnits ?? sku.ink * 2,
      };
    }
  }

  const orderId = typeof entity.order_id === 'string' ? entity.order_id : '';
  if (orderId) {
    const orderRow = await Payment.findOne({
      razorpayOrderId: orderId,
      status: 'created',
    }).lean();
    if (orderRow) {
      return {
        ...ctx,
        userId: String(orderRow.userId),
        kind: orderRow.kind,
        topupSkuId: orderRow.topupSkuId,
        inkUnits: ctx.inkUnits ?? orderRow.inkUnits,
      };
    }
    const db = mongoose.connection.db;
    if (db) {
      const claim = await db
        .collection<{ _id: string } & Record<string, unknown>>('inkledger')
        .findOne({ _id: topupClaimId(orderId) });
      if (claim && claim.userId) {
        const delta = typeof claim.delta === 'number' && claim.delta > 0 ? claim.delta : 0;
        const meta = (claim.metadata ?? {}) as Record<string, unknown>;
        return {
          ...ctx,
          userId: String(claim.userId),
          kind: 'topup',
          topupSkuId: typeof meta.topupSkuId === 'string' ? meta.topupSkuId : undefined,
          inkUnits: ctx.inkUnits ?? delta,
        };
      }
    }
  }

  // A subscription payment (payment.failed / .authorized usually carry no subscription
  // entity): the payment's subscription_id, else its Razorpay invoice's subscription_id.
  const subscriptionCtx = await subscriptionContextFor(entity, ctx);
  if (subscriptionCtx) return subscriptionCtx;
  return null;
}

/** Longest wait for the Razorpay invoice read in subscriptionContextFor. */
export const RAZORPAY_INVOICE_READ_TIMEOUT_MS = 5_000;

/**
 * The Razorpay subscription id of a payment's invoice (GET, as the invoice backfill does).
 * Null on any failure or timeout; nothing from the response or the error is logged.
 */
async function subscriptionIdFromInvoice(invoiceId: string): Promise<string | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), RAZORPAY_INVOICE_READ_TIMEOUT_MS);
      timer.unref();
    });
    const inv = (await Promise.race([
      razorpay.invoices.fetch(invoiceId) as unknown as Promise<Record<string, unknown>>,
      timeout,
    ])) as Record<string, unknown> | null;
    const subId = inv?.subscription_id;
    return typeof subId === 'string' && subId ? subId : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Plan context through the local Subscription row, or null. */
async function subscriptionContextFor(
  entity: Entity,
  ctx: PaymentContext,
): Promise<PaymentContext | null> {
  let subId =
    typeof entity.subscription_id === 'string' && entity.subscription_id
      ? entity.subscription_id
      : null;
  if (!subId && typeof entity.invoice_id === 'string' && entity.invoice_id) {
    subId = await subscriptionIdFromInvoice(entity.invoice_id);
  }
  if (!subId) return null;
  const sub = await Subscription.findOne({ razorpaySubscriptionId: subId }).lean();
  if (!sub) return null;
  const planId = (sub as { planId?: unknown }).planId;
  const rzpPlanId = (sub as { razorpayPlanId?: unknown }).razorpayPlanId;
  const plan =
    (typeof planId === 'string' ? findSubscriptionPlan(planId) : undefined) ??
    (typeof rzpPlanId === 'string' ? findPlanByRazorpayId(rzpPlanId) : undefined);
  return {
    ...ctx,
    userId: String(sub.userId),
    kind: 'plan',
    razorpaySubscriptionId: subId,
    inkUnits: ctx.inkUnits ?? (plan ? plan.inkPerCycle * 2 : 0),
    ...(plan ? { planId: plan.id } : {}),
  };
}

/**
 * Upserts the Payment row for one Razorpay payment entity, moving the status
 * forward only. Throws on a DB error; webhook callers use recordPaymentSafely.
 * Returns false when the payment could not be attributed (nothing written).
 */
export async function upsertPaymentFromEntity(
  entity: Entity,
  ctxIn: PaymentContext = {},
  source: 'webhook' | 'backfill' = 'webhook',
): Promise<boolean> {
  const razorpayPaymentId = typeof entity.id === 'string' ? entity.id : '';
  if (!razorpayPaymentId) return false;
  const status = statusFromEntity(entity);
  if (!status) return false;
  const amountPaise = paise(entity.amount);
  if (amountPaise === null) return false;

  const ctx = await resolvePaymentContext(entity, ctxIn);
  if (!ctx || !ctx.userId || !ctx.kind) {
    logger.info({ razorpayPaymentId, status }, 'payment record: payment not attributable; skipped');
    return false;
  }

  const now = new Date();
  const attemptedAt = fromUnixSeconds(entity.created_at) ?? now;
  const refundedPaise = paise(entity.amount_refunded) ?? 0;
  const orderId = typeof entity.order_id === 'string' && entity.order_id ? entity.order_id : null;
  // Ink the payment added: only once it is paid (a failed or processing payment added none).
  const inkUnits = STATUS_RANK[status] >= STATUS_RANK.paid ? Math.max(0, ctx.inkUnits ?? 0) : 0;

  const lit = (v: unknown) => ({ $literal: v });
  const keep = (field: string, v: unknown) => ({ $ifNull: [`$${field}`, lit(v)] });
  const currentRank = {
    $switch: {
      branches: (Object.keys(STATUS_RANK) as PaymentStatus[]).map((s) => ({
        case: { $eq: ['$status', s] },
        then: STATUS_RANK[s],
      })),
      default: -2,
    },
  };
  const moves = { $gt: [STATUS_RANK[status], currentRank] };

  const update = () =>
    Payment.collection.updateOne(
      { razorpayPaymentId },
      [
        {
          $set: {
            userId: keep('userId', new mongoose.Types.ObjectId(ctx.userId)),
            kind: keep('kind', ctx.kind),
            razorpayOrderId: keep('razorpayOrderId', orderId),
            razorpaySubscriptionId: keep(
              'razorpaySubscriptionId',
              ctx.razorpaySubscriptionId ?? null,
            ),
            topupSkuId: keep('topupSkuId', ctx.topupSkuId ?? null),
            planId: keep('planId', ctx.planId ?? null),
            source: keep('source', source),
            createdAt: keep('createdAt', attemptedAt),
            checkingAlertedAt: keep('checkingAlertedAt', null),
            amountPaise: lit(amountPaise),
            refundedPaise: { $max: [{ $ifNull: ['$refundedPaise', 0] }, refundedPaise] },
            inkUnits: { $max: [{ $ifNull: ['$inkUnits', 0] }, inkUnits] },
            inkReversedUnits: { $ifNull: ['$inkReversedUnits', 0] },
            status: { $cond: [moves, status, '$status'] },
            settledAt:
              status === 'processing'
                ? { $ifNull: ['$settledAt', null] }
                : { $ifNull: ['$settledAt', lit(now)] },
            updatedAt: lit(now),
          },
        },
      ],
      { upsert: true },
    );
  try {
    await update();
  } catch (err) {
    // Two deliveries raced the upsert and both tried to insert: the loser gets E11000 on the
    // unique razorpayPaymentId. Once more, now as an update of the winner's row (the same
    // forward-only pipeline). Any other error, or a second failure, is thrown.
    if ((err as { code?: unknown } | null)?.code !== 11000) throw err;
    await update();
  }
  return true;
}

/**
 * Webhook form (Arjun ruling 3): never throws, logs the error class only.
 * Call it AFTER the Ink grant.
 */
export async function recordPaymentSafely(
  payload: Record<string, unknown>,
  ctx: PaymentContext = {},
): Promise<void> {
  const entity = paymentEntityOf(payload);
  if (!entity) return;
  try {
    await upsertPaymentFromEntity(entity, ctx);
  } catch (err) {
    logger.error(
      {
        razorpayPaymentId: typeof entity.id === 'string' ? entity.id : undefined,
        errName: errName(err),
      },
      'payment record: upsert failed',
    );
  }
}

/**
 * POST /topup/order: records the ORDER only (status 'created', no payment id),
 * so a later payment for it can be attributed. Never shown. Never throws.
 */
export async function recordTopupOrderSafely(input: {
  userId: string;
  razorpayOrderId: string;
  amountPaise: number;
  topupSkuId: string;
  inkUnits: number;
}): Promise<void> {
  const { userId, razorpayOrderId, amountPaise, topupSkuId, inkUnits } = input;
  if (!mongoose.Types.ObjectId.isValid(userId) || !razorpayOrderId) return;
  const now = new Date();
  try {
    await Payment.collection.updateOne(
      { razorpayOrderId, status: 'created', razorpayPaymentId: { $exists: false } },
      {
        $setOnInsert: {
          userId: new mongoose.Types.ObjectId(userId),
          kind: 'topup',
          status: 'created',
          razorpayOrderId,
          topupSkuId,
          amountPaise,
          refundedPaise: 0,
          inkUnits,
          inkReversedUnits: 0,
          source: 'order',
          settledAt: null,
          checkingAlertedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logger.error({ razorpayOrderId, errName: errName(err) }, 'payment record: order insert failed');
  }
}

/**
 * refund.processed: raise refundedPaise (never lower it) and move the status to
 * partly_refunded / refunded; refresh inkReversedUnits from the ledger. Creates
 * the row from the payment entity first if it is missing. Never throws.
 */
export async function recordRefundSafely(
  payload: Record<string, unknown>,
  refund: { id: string; paymentId: string; amount: number },
): Promise<void> {
  try {
    const entity = paymentEntityOf(payload);
    if (entity && entity.id === refund.paymentId) {
      await upsertPaymentFromEntity({ ...entity, status: 'captured', amount_refunded: 0 });
    }
    const sameEntity = !!entity && entity.id === refund.paymentId;
    const entityRefunded = (sameEntity ? paise(entity.amount_refunded) : null) ?? 0;
    const refundAmount = paise(refund.amount) ?? 0;
    const reversed = await reversedUnitsForPayment(refund.paymentId);
    // Per-refund amounts keyed by Razorpay refund id (`refunds.<refundId>`): a redelivered
    // refund overwrites its own entry with the same amount, so it is never counted twice.
    // refundedPaise = max(previous, sum over distinct refunds, entity amount_refunded),
    // capped at amountPaise: forward-only and idempotent.
    await Payment.collection.updateOne({ razorpayPaymentId: refund.paymentId }, [
      {
        $set: {
          refunds: {
            $mergeObjects: [
              { $ifNull: ['$refunds', {}] },
              { $arrayToObject: { $literal: [[refund.id, refundAmount]] } },
            ],
          },
        },
      },
      {
        $set: {
          refundedPaise: {
            $min: [
              { $ifNull: ['$amountPaise', 0] },
              {
                $max: [
                  { $ifNull: ['$refundedPaise', 0] },
                  entityRefunded,
                  { $sum: { $map: { input: { $objectToArray: '$refunds' }, in: '$$this.v' } } },
                ],
              },
            ],
          },
          inkReversedUnits: { $max: [{ $ifNull: ['$inkReversedUnits', 0] }, reversed] },
          updatedAt: { $literal: new Date() },
        },
      },
      {
        $set: {
          status: {
            $cond: [
              { $lte: ['$refundedPaise', 0] },
              '$status',
              {
                $cond: [
                  { $gte: ['$refundedPaise', '$amountPaise'] },
                  'refunded',
                  'partly_refunded',
                ],
              },
            ],
          },
        },
      },
    ]);
  } catch (err) {
    logger.error(
      { refundId: refund.id, razorpayPaymentId: refund.paymentId, errName: errName(err) },
      'payment record: refund update failed',
    );
  }
}

/** Ledger units already taken back by refunds of this payment (done reversal rows). */
export async function reversedUnitsForPayment(razorpayPaymentId: string): Promise<number> {
  const db = mongoose.connection.db;
  if (!db) return 0;
  const rows = await db
    .collection('inkledger')
    .find(
      {
        reason: REFUND_REVERSAL_REASON,
        state: 'done',
        'metadata.razorpayPaymentId': razorpayPaymentId,
      },
      { projection: { delta: 1 } },
    )
    .toArray();
  return rows.reduce(
    (sum, r) => sum + Math.max(0, -(typeof r.delta === 'number' ? r.delta : 0)),
    0,
  );
}

// ── Reader: GET /payments ────────────────────────────────────────────────────

export interface PaymentRowView {
  id: string;
  createdAt: Date;
  kind: PaymentKind;
  amountPaise: number;
  status: VisiblePaymentStatus;
  checking: boolean;
  refundedPaise: number;
  /** Net Ink this payment changed, in Ink (units / 2): added minus taken back by refunds. */
  inkDelta: number;
  /** Vikram 3: Ink this payment added (granted units / 2). 0 for failed / processing. */
  inkAddedInk: number;
  /** Vikram 3: Ink its refunds took back (reversed units / 2, >= 0). 0 for failed / processing. */
  inkReversedInk: number;
  referenceTail: string;
  invoiceId: string | null;
  /** `note` goes back to its owner here only (Arjun/Priya follow-up); null when empty. */
  concern: { id: string; status: ConcernStatus; reference: string; note: string | null } | null;
}

/** Vikram 2: true when the row is still processing 24 h after the attempt. */
export function isChecking(row: Pick<IPayment, 'status' | 'createdAt'>, now: Date): boolean {
  return (
    row.status === 'processing' &&
    now.getTime() - new Date(row.createdAt).getTime() >= PROCESSING_CHECK_AFTER_MS
  );
}

/**
 * Vikram 2: one Sentry event per payment stuck in processing, ids only. The
 * conditional update on checkingAlertedAt makes it once, across processes.
 * Never throws.
 */
export async function alertStuckProcessing(
  row: Pick<IPayment, '_id' | 'razorpayPaymentId'>,
): Promise<boolean> {
  try {
    const claimed = await Payment.updateOne(
      { _id: row._id, status: 'processing', checkingAlertedAt: null },
      { $set: { checkingAlertedAt: new Date() } },
    );
    if (claimed.modifiedCount !== 1) return false;
    const razorpayPaymentId = row.razorpayPaymentId ?? 'unknown';
    Sentry.withScope((scope) => {
      scope.setSDKProcessingMetadata({ normalizedRequest: undefined, ipAddress: undefined });
      scope.addEventProcessor((event) => {
        delete event.request;
        delete event.user;
        return event;
      });
      scope.setFingerprint(['billing-payment-processing-24h', razorpayPaymentId]);
      scope.setTags({ paymentId: String(row._id), razorpayPaymentId });
      Sentry.captureMessage('Billing: payment still processing after 24h', 'warning');
    });
    logger.warn(
      { paymentId: String(row._id), razorpayPaymentId },
      'payment still processing after 24h',
    );
    return true;
  } catch (err) {
    logger.error(
      { paymentId: String(row._id), errName: errName(err) },
      'payment record: 24h alert failed',
    );
    return false;
  }
}

/** Most stuck payments one sweep run alerts on. */
export const PROCESSING_ALERT_BATCH = 200;

/**
 * Vikram 2, from the invoice sweep (no timer of its own): every payment still
 * processing 24 h after the attempt and not yet alerted gets its one Sentry
 * event, through the same checkingAlertedAt CAS as the on-read path. Returns
 * how many alerted. Never throws.
 */
export async function alertStuckProcessingPayments(now: Date = new Date()): Promise<number> {
  try {
    const rows = await Payment.find(
      {
        status: 'processing',
        checkingAlertedAt: null,
        createdAt: { $lte: new Date(now.getTime() - PROCESSING_CHECK_AFTER_MS) },
      },
      { _id: 1, razorpayPaymentId: 1 },
    )
      .sort({ createdAt: 1 })
      .limit(PROCESSING_ALERT_BATCH)
      .lean();
    let alerted = 0;
    for (const r of rows) {
      if (await alertStuckProcessing(r)) alerted += 1;
    }
    return alerted;
  } catch (err) {
    logger.error({ errName: errName(err) }, 'payment record: stuck-processing sweep failed');
    return 0;
  }
}

/** GET /payments: the user's own payments, newest first. Order-only rows are never returned. */
export async function listPaymentsForUser(userId: string): Promise<PaymentRowView[]> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return [];
  const uid = new mongoose.Types.ObjectId(userId);
  const rows = await Payment.find({
    userId: uid,
    status: { $in: [...VISIBLE_PAYMENT_STATUSES] },
    razorpayPaymentId: { $type: 'string' },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(PAYMENT_LIST_LIMIT)
    .lean();
  if (rows.length === 0) return [];

  const rzpIds = rows.map((r) => r.razorpayPaymentId as string);
  const [invoices, concerns] = await Promise.all([
    Invoice.find(
      { paymentId: { $in: rzpIds }, kind: 'invoice', state: 'issued', userId: uid },
      { _id: 1, paymentId: 1 },
    ).lean(),
    PaymentConcern.find(
      { userId: uid, paymentId: { $in: rows.map((r) => r._id) } },
      { _id: 1, paymentId: 1, status: 1, reference: 1, note: 1, createdAt: 1 },
    )
      .sort({ createdAt: -1, _id: -1 })
      .lean(),
  ]);
  const invoiceByPayment = new Map<string, string>();
  for (const inv of invoices) invoiceByPayment.set(inv.paymentId, String(inv._id));
  // The newest concern per payment.
  const concernByPayment = new Map<string, PaymentRowView['concern']>();
  for (const c of concerns) {
    const key = String(c.paymentId);
    if (!concernByPayment.has(key)) {
      const note = typeof c.note === 'string' && c.note.length > 0 ? c.note : null;
      concernByPayment.set(key, {
        id: String(c._id),
        status: c.status,
        reference: c.reference,
        note,
      });
    }
  }

  const now = new Date();
  return rows.map((r) => {
    const checking = isChecking(r, now);
    if (checking && !r.checkingAlertedAt) void alertStuckProcessing(r);
    const rzp = r.razorpayPaymentId as string;
    const counted = STATUS_RANK[r.status] >= STATUS_RANK.paid;
    const addedUnits = counted ? Math.max(0, r.inkUnits ?? 0) : 0;
    // AJ-646-M10: the Ink taken back is never more than was added.
    const reversedUnits = counted ? Math.min(addedUnits, Math.max(0, r.inkReversedUnits ?? 0)) : 0;
    const netUnits = Math.max(0, addedUnits - reversedUnits);
    return {
      id: String(r._id),
      createdAt: r.createdAt,
      kind: r.kind,
      amountPaise: r.amountPaise,
      status: r.status as VisiblePaymentStatus,
      checking,
      refundedPaise: r.refundedPaise ?? 0,
      inkDelta: netUnits / 2,
      inkAddedInk: addedUnits / 2,
      inkReversedInk: reversedUnits / 2,
      referenceTail: rzp.slice(-REFERENCE_TAIL_LENGTH),
      invoiceId: invoiceByPayment.get(rzp) ?? null,
      concern: concernByPayment.get(String(r._id)) ?? null,
    };
  });
}
