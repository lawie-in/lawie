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
import { confirmedPlanGrantForPayment } from './payment-record.service';

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
  /**
   * Arjun option B: the inkledger row that granted this Ink (the T-413 top-up claim
   * `topup:<orderId>`, or the plan cycle's sub_renewal row), and its delta. Null when the
   * grant row cannot be named (never guessed): then no per-grant cap applies.
   */
  grantLedgerId: string | null;
  grantLedgerUnits: number | null;
}

type LedgerDoc = { _id: unknown } & Record<string, unknown>;

/** The granted top-up claim for an order: `topup:<orderId>`, granted (not pending), delta > 0. */
async function topupGrantRow(orderId: string): Promise<{ row: LedgerDoc; delta: number } | null> {
  const db = mongoose.connection.db;
  if (!orderId || !db) return null;
  const claim = await db
    .collection<{ _id: string } & Record<string, unknown>>('inkledger')
    .findOne({ _id: topupClaimId(orderId) });
  const delta = typeof claim?.delta === 'number' ? claim.delta : 0;
  if (!claim || !claim.userId || delta <= 0 || claim.state === 'pending') return null;
  return { row: claim, delta };
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
  const orderId =
    typeof paymentEntity?.order_id === 'string' && paymentEntity.order_id
      ? paymentEntity.order_id
      : (row?.razorpayOrderId ?? '');
  if (row && row.inkUnits > 0) {
    // Name the grant row this payment's Ink came from, without guessing: a top-up's claim
    // for its order; a plan charge's sub_renewal row carrying this payment id. A legacy plan
    // grant has no payment id: no grant named, the row reverses as before (no cap).
    let grantLedgerId: string | null = null;
    let grantLedgerUnits: number | null = null;
    if (row.kind === 'topup') {
      const g = await topupGrantRow(row.razorpayOrderId ?? orderId);
      if (g) {
        grantLedgerId = String(g.row._id);
        grantLedgerUnits = g.delta;
      }
    } else {
      const g = await confirmedPlanGrantForPayment(
        { ...(paymentEntity ?? {}), id: razorpayPaymentId },
        {
          userId: String(row.userId),
          razorpaySubscriptionId: row.razorpaySubscriptionId ?? null,
        },
      );
      if (g) {
        grantLedgerId = g.grantLedgerId;
        grantLedgerUnits = g.grantedUnits;
      }
    }
    if (!grantLedgerId) {
      logger.info(
        { razorpayPaymentId, kind: row.kind },
        'refund ink: grant row not identified; per-grant cap not applied',
      );
    }
    return {
      userId: String(row.userId),
      kind: row.kind,
      grantedUnits: row.inkUnits,
      amountPaise: row.amountPaise > 0 ? row.amountPaise : (entityAmount ?? 0),
      grantLedgerId,
      grantLedgerUnits,
    };
  }
  const topup = await topupGrantRow(orderId);
  if (topup) {
    return {
      userId: String(topup.row.userId),
      kind: 'topup',
      grantedUnits: topup.delta,
      amountPaise: entityAmount ?? row?.amountPaise ?? 0,
      grantLedgerId: String(topup.row._id),
      grantLedgerUnits: topup.delta,
    };
  }
  // No granted row and no top-up claim: a plan charge whose row was never written, or was
  // written with no Ink. Granted ONLY when the ledger confirms this cycle's grant
  // (confirmedPlanGrantForPayment: the sub_renewal row for this user carrying THIS payment's
  // id), and for the amount that row granted. Otherwise unresolved.
  if (paymentEntity && entityAmount && (!row || row.kind === 'plan')) {
    const confirmed = await confirmedPlanGrantForPayment(
      { ...paymentEntity, id: razorpayPaymentId },
      row
        ? {
            userId: String(row.userId),
            razorpaySubscriptionId: row.razorpaySubscriptionId ?? null,
          }
        : {},
    );
    if (confirmed) {
      return {
        userId: confirmed.userId,
        kind: 'plan',
        grantedUnits: confirmed.grantedUnits,
        amountPaise: entityAmount,
        grantLedgerId: confirmed.grantLedgerId,
        grantLedgerUnits: confirmed.grantedUnits,
      };
    }
  }
  return null;
}

/**
 * Arjun option B: units already reversed against one grant row, across ALL payments and
 * refunds (done AND pending refund_reversal rows naming it in metadata.grantLedgerId; a
 * pending row is another refund in flight, Arjun review condition 2), this refund excluded
 * (its own claim never blocks its own retry). Counts each row's dueUnits (what was charged against the grant), so a shortfall
 * is not tried again through another payment row. userId first: the inkledger
 * {userId: 1, createdAt: -1} index (T-519).
 */
async function reversedAgainstGrant(
  userId: string,
  grantLedgerId: string,
  refundId: string,
): Promise<number> {
  const db = mongoose.connection.db;
  if (!db || !mongoose.Types.ObjectId.isValid(userId)) return 0;
  const rows = await db
    .collection('inkledger')
    .find(
      {
        userId: new mongoose.Types.ObjectId(userId),
        reason: REFUND_REVERSAL_REASON,
        state: { $in: ['done', 'pending'] },
        'metadata.grantLedgerId': grantLedgerId,
        'metadata.refundId': { $ne: refundId },
      },
      { projection: { metadata: 1 } },
    )
    .toArray();
  let units = 0;
  for (const r of rows) {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    if (typeof m.dueUnits === 'number' && m.dueUnits > 0) units += m.dueUnits;
  }
  return units;
}

/** Refunds and dues already reversed for this payment (done rows, other refunds). */
async function priorReversals(
  razorpayPaymentId: string,
  refundId: string,
  userId: string,
): Promise<{ refundPaise: number; dueUnits: number }> {
  const db = mongoose.connection.db;
  if (!db || !mongoose.Types.ObjectId.isValid(userId)) return { refundPaise: 0, dueUnits: 0 };
  const rows = await db
    .collection('inkledger')
    .find(
      {
        // userId first: served by the inkledger {userId: 1, createdAt: -1} index (T-519).
        userId: new mongoose.Types.ObjectId(userId),
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
  | 'grant_already_reversed'
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

  const prior = await priorReversals(razorpayPaymentId, refundId, granted.userId);
  const proRataUnits = refundDueUnits({
    grantedUnits: granted.grantedUnits,
    amountPaise: granted.amountPaise,
    refundPaise,
    prevRefundPaise: prior.refundPaise,
    prevDueUnits: prior.dueUnits,
  });

  // Arjun option B: one grant is reversed at most once in total, whichever payment row
  // claims it. due = min(pro rata for this payment, granted − alreadyReversed for the grant).
  let dueUnits = proRataUnits;
  if (granted.grantLedgerId) {
    const grantUnits = granted.grantLedgerUnits ?? granted.grantedUnits;
    const already = await reversedAgainstGrant(granted.userId, granted.grantLedgerId, refundId);
    const remaining = Math.max(0, grantUnits - already);
    if (remaining === 0) {
      // Expected (another payment row already took this grant back): no debit, no Sentry.
      logger.info(
        { ...ids, grantLedgerId: granted.grantLedgerId },
        'refund ink: grant already fully reversed; nothing debited',
      );
      return 'grant_already_reversed';
    }
    dueUnits = Math.min(proRataUnits, remaining);
  }

  const result = await reverseRefundInk({
    userId: granted.userId,
    refundId,
    razorpayPaymentId,
    refundPaise,
    dueUnits,
    preferBucket: granted.kind === 'topup' ? 'topup' : 'sub',
    ...(granted.grantLedgerId
      ? {
          grant: { ledgerId: granted.grantLedgerId, paymentId: razorpayPaymentId },
          // Re-check once this refund's claim is in, counting other refunds' claims too.
          capAfterClaim: async () => {
            const grantUnits = granted.grantLedgerUnits ?? granted.grantedUnits;
            const others = await reversedAgainstGrant(
              granted.userId,
              granted.grantLedgerId as string,
              refundId,
            );
            return Math.max(0, grantUnits - others);
          },
        }
      : {}),
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
