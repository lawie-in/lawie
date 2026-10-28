/**
 * T-646 (Vikram 5): a refund takes back the Ink its payment granted, pro rata,
 * never below zero, on the same refund.processed event that issues the credit
 * note (T-436).
 *
 * - Full refund: the Ink the payment granted. Partial: the same share, rounded
 *   down. Counted cumulatively per payment, so several partial refunds that add
 *   up to the full amount take back exactly the full grant:
 *     due = floor(G * min(R_prev + r, A) / A) - due_prev
 *   where G is the payment's granted units, A its amount, r this refund, and
 *   R_prev / due_prev the refunds and dues already reversed for the payment.
 * - Idempotent on `refund:<refundId>` (ink-ledger.service reverseRefundInk).
 * - Already spent: what is left is debited and the shortfall is logged and
 *   raised once in Sentry, ids and numbers only, for support.
 * - A payment whose grant or user cannot be found is reported (Sentry, ids
 *   only) and nothing is debited.
 *
 * Throws only what reverseRefundInk throws (claim busy, DB error), so the
 * webhook 500s and Razorpay retries; the retry reverses once.
 */
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

import logger from '../config/logger';
import { Payment } from '../models/Payment.model';

import { REFUND_REVERSAL_REASON, reverseRefundInk, topupClaimId } from './ink-ledger.service';

/** Sentry, ids and numbers only; the request and user are stripped. */
function reportRefundInk(
  reason: string,
  ids: { refundId: string; razorpayPaymentId: string },
  extra: Record<string, number> = {},
  level: 'error' | 'warning' = 'warning',
): void {
  Sentry.withScope((scope) => {
    scope.setSDKProcessingMetadata({ normalizedRequest: undefined, ipAddress: undefined });
    scope.addEventProcessor((event) => {
      delete event.request;
      delete event.user;
      return event;
    });
    scope.setFingerprint(['billing-refund-ink', reason, ids.refundId]);
    scope.setTags({ reason, ...ids });
    scope.setExtras(extra);
    Sentry.captureMessage(`Billing: ${reason}`, level);
  });
}

/** Pure: the units due for this refund (see the header). Never negative. */
export function refundDueUnits(input: {
  grantedUnits: number;
  amountPaise: number;
  refundPaise: number;
  prevRefundPaise: number;
  prevDueUnits: number;
}): number {
  const { grantedUnits, amountPaise, refundPaise, prevRefundPaise, prevDueUnits } = input;
  if (grantedUnits <= 0 || amountPaise <= 0 || refundPaise <= 0) return 0;
  const cumulative = Math.min(prevRefundPaise + refundPaise, amountPaise);
  const totalDue = Math.floor((grantedUnits * cumulative) / amountPaise);
  return Math.max(0, totalDue - prevDueUnits);
}

interface Granted {
  userId: string;
  kind: 'plan' | 'topup';
  grantedUnits: number;
  amountPaise: number;
}

/** What the payment granted: its Payment row, else the T-413 top-up claim for its order. */
async function grantedFor(
  razorpayPaymentId: string,
  paymentEntity: Record<string, unknown> | undefined,
): Promise<Granted | null> {
  const entityAmount =
    typeof paymentEntity?.amount === 'number' && paymentEntity.amount > 0
      ? paymentEntity.amount
      : null;
  const row = await Payment.findOne({ razorpayPaymentId }).lean();
  if (row && row.inkUnits > 0) {
    return {
      userId: String(row.userId),
      kind: row.kind,
      grantedUnits: row.inkUnits,
      amountPaise: row.amountPaise > 0 ? row.amountPaise : (entityAmount ?? 0),
    };
  }
  const orderId =
    typeof paymentEntity?.order_id === 'string' && paymentEntity.order_id
      ? paymentEntity.order_id
      : (row?.razorpayOrderId ?? '');
  const db = mongoose.connection.db;
  if (orderId && db) {
    const claim = await db
      .collection<{ _id: string } & Record<string, unknown>>('inkledger')
      .findOne({ _id: topupClaimId(orderId) });
    const delta = typeof claim?.delta === 'number' ? claim.delta : 0;
    if (claim && claim.userId && delta > 0 && claim.state !== 'pending') {
      return {
        userId: String(claim.userId),
        kind: 'topup',
        grantedUnits: delta,
        amountPaise: entityAmount ?? row?.amountPaise ?? 0,
      };
    }
  }
  return null;
}

/** Refunds and dues already reversed for this payment (done rows, other refunds). */
async function priorReversals(
  razorpayPaymentId: string,
  refundId: string,
): Promise<{ refundPaise: number; dueUnits: number }> {
  const db = mongoose.connection.db;
  if (!db) return { refundPaise: 0, dueUnits: 0 };
  const rows = await db
    .collection('inkledger')
    .find(
      {
        reason: REFUND_REVERSAL_REASON,
        state: 'done',
        'metadata.razorpayPaymentId': razorpayPaymentId,
        'metadata.refundId': { $ne: refundId },
      },
      { projection: { metadata: 1 } },
    )
    .toArray();
  let refundPaise = 0;
  let dueUnits = 0;
  for (const r of rows) {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    if (typeof m.refundPaise === 'number') refundPaise += m.refundPaise;
    if (typeof m.dueUnits === 'number') dueUnits += m.dueUnits;
  }
  return { refundPaise, dueUnits };
}

export type RefundInkOutcome =
  | 'reversed'
  | 'already_reversed'
  | 'nothing_due'
  | 'unresolved'
  | 'stale_claim'
  | 'user_not_found';

/** refund.processed: take back this refund's share of the payment's Ink. */
export async function reverseInkForRefund(input: {
  refundId: string;
  razorpayPaymentId: string;
  refundPaise: number;
  paymentEntity?: Record<string, unknown>;
}): Promise<RefundInkOutcome> {
  const { refundId, razorpayPaymentId, refundPaise, paymentEntity } = input;
  const ids = { refundId, razorpayPaymentId };

  const granted = await grantedFor(razorpayPaymentId, paymentEntity);
  if (!granted || granted.amountPaise <= 0) {
    logger.warn(ids, 'refund ink: payment grant not found; nothing reversed');
    reportRefundInk('refund-ink-unresolved', ids, {}, 'error');
    return 'unresolved';
  }

  const prior = await priorReversals(razorpayPaymentId, refundId);
  const dueUnits = refundDueUnits({
    grantedUnits: granted.grantedUnits,
    amountPaise: granted.amountPaise,
    refundPaise,
    prevRefundPaise: prior.refundPaise,
    prevDueUnits: prior.dueUnits,
  });

  const result = await reverseRefundInk({
    userId: granted.userId,
    refundId,
    razorpayPaymentId,
    refundPaise,
    dueUnits,
    preferBucket: granted.kind === 'topup' ? 'topup' : 'sub',
  });

  switch (result.status) {
    case 'already_reversed':
      return 'already_reversed';
    case 'user_not_found':
      reportRefundInk('refund-ink-user-not-found', ids, {}, 'error');
      return 'user_not_found';
    case 'stale_claim':
      reportRefundInk('refund-ink-stale-claim', ids, {}, 'error');
      return 'stale_claim';
    case 'reversed':
      if (result.shortfallUnits > 0) {
        // Vikram 5: the Ink was already spent. Support factors it into the decision.
        logger.warn(
          {
            ...ids,
            dueUnits: result.dueUnits,
            debitedUnits: result.debitedUnits,
            shortfallUnits: result.shortfallUnits,
          },
          'refund ink: shortfall (Ink already spent)',
        );
        reportRefundInk('refund-ink-shortfall', ids, {
          dueUnits: result.dueUnits,
          debitedUnits: result.debitedUnits,
          shortfallUnits: result.shortfallUnits,
        });
      }
      return dueUnits === 0 ? 'nothing_due' : 'reversed';
  }
}
