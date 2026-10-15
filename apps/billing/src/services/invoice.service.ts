/**
 * T-436: GST tax invoices and credit notes (Arjun #1-#5, Ajay §1-4).
 *
 * Two steps, both idempotent:
 *
 * 1. record (`recordInvoiceForPayment`, `recordCreditNoteForRefund`): upsert
 *    the row by paymentId (invoice) or refundId (credit note) in state
 *    'issuing', holding only the payment facts (`draft`). Needs no seller
 *    config. A failure here throws, so the webhook 500s and Razorpay retries.
 * 2. issue (`issueInvoice`): needs the seller config (throws
 *    InvoiceConfigError otherwise). Allocates the next number of the series
 *    for the FY of the issue date and writes number + snapshots + amounts +
 *    state 'issued' in one conditional update.
 *
 * Numbering without gaps or reuse: the counter's `$inc` also records which row
 * the number is for (`pendingInvoiceId`, `pendingIssuedAt`) and the series
 * allocates nothing else until that row carries it. A crash in between is
 * finished, with the same number, by the next issue in that series or by the
 * sweep (invoice-sweep.service.ts). Numbers are only ever allocated for a
 * confirmed (captured, recorded) payment.
 *
 * Logs: ids, counts and err.name only. No names, emails, GSTINs or amounts.
 * Nothing here goes to Sentry.
 */
import { findGstState } from '@lawie/shared';
import mongoose from 'mongoose';

import {
  CUSTOMER_STATE_CODE_FIELD,
  GST_RATE_PERCENT,
  GST_SAC,
  INVOICE_NUMBER_MAX_LENGTH,
  readEffectiveFrom,
  requireInvoiceConfig,
  type SellerSnapshot,
} from '../config/gst';
import logger from '../config/logger';
import { Invoice, type IInvoice, type InvoiceDraft } from '../models/Invoice.model';
import { InvoiceCounter, type IInvoiceCounter } from '../models/InvoiceCounter.model';
import { RefundCap } from '../models/RefundCap.model';
import { User } from '../models/User.model';

import { queueInvoiceEmailInBackground } from './invoice-email.service';
import {
  financialYear,
  formatIstDate,
  formatInvoiceNumber,
  splitGstInclusive,
  type InvoiceKind,
} from './invoice-math';

/** Largest sequence that keeps a number within Ajay's 16 characters (4 digits). */
export const MAX_INVOICE_SEQ = 9999;

/** Attempts at allocating a number while the series is busy with another row. */
const ALLOCATE_ATTEMPTS = 5;

export class InvoiceSeriesExhaustedError extends Error {
  constructor() {
    super('invoice number series is full for this financial year');
    this.name = 'InvoiceSeriesExhaustedError';
  }
}

export class InvoiceSeriesBusyError extends Error {
  constructor() {
    super('invoice number series is busy; retry later');
    this.name = 'InvoiceSeriesBusyError';
  }
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 11000;
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}

// ── Descriptions (Ajay §1) ──────────────────────────────────────────────────

/** "Lawie Ink top-up — {n} Ink". */
export function topupDescription(ink: number): string {
  return `Lawie Ink top-up — ${ink} Ink`;
}

/**
 * "Lawie subscription — {plan}, {period}" (Ajay §1). With no known plan
 * (Ajay 3325466): exactly "Lawie subscription — {period}"; never a guessed plan.
 */
export function subscriptionDescription(
  plan: { tier: string; cycle: 'monthly' | 'yearly' } | null,
  periodStart?: Date,
  periodEnd?: Date,
): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const period =
    periodStart && periodEnd
      ? `${formatIstDate(periodStart)} to ${formatIstDate(periodEnd)}`
      : plan
        ? `${plan.cycle} billing period`
        : 'billing period';
  if (!plan) return `Lawie subscription — ${period}`;
  return `Lawie subscription — ${cap(plan.tier)} ${cap(plan.cycle)}, ${period}`;
}

/**
 * The plan named in the charge record when no SKU matched: the subscription
 * entity's notes `tier` + `cycle` (written by createSubscription). Null when
 * absent or not a plan we sell; Razorpay's payload carries no plan name.
 */
export function planFromChargeNotes(
  notes: Record<string, unknown> | undefined,
): { tier: 'solo' | 'pro'; cycle: 'monthly' | 'yearly' } | null {
  const tier = notes?.tier;
  const cycle = notes?.cycle;
  if ((tier === 'solo' || tier === 'pro') && (cycle === 'monthly' || cycle === 'yearly')) {
    return { tier, cycle };
  }
  return null;
}

// ── Step 1: record ──────────────────────────────────────────────────────────

export interface CapturedPayment {
  paymentId: string;
  userId: string;
  /** Paise charged, from the Razorpay payment entity (never the SKU price). */
  amount: number;
  paidAt: Date;
  description: string;
  source: InvoiceDraft['source'];
  razorpayOrderId?: string;
  razorpaySubscriptionId?: string;
}

/**
 * Upserts the invoice row for a captured payment in state 'issuing'. Returns the
 * row (possibly already issued), or null when no invoice is due: bad input, or
 * a payment before GST_EFFECTIVE_FROM. Throws on a database error.
 */
export async function recordInvoiceForPayment(p: CapturedPayment): Promise<IInvoice | null> {
  if (!p.paymentId || !mongoose.Types.ObjectId.isValid(p.userId)) {
    logger.warn({ paymentId: p.paymentId || null }, 'invoice: no payment id or user; not recorded');
    return null;
  }
  if (!Number.isSafeInteger(p.amount) || p.amount <= 0) {
    logger.warn(
      { paymentId: p.paymentId },
      'invoice: payment has no positive amount; not recorded',
    );
    return null;
  }
  const effectiveFrom = readEffectiveFrom();
  if (effectiveFrom && p.paidAt < effectiveFrom) {
    logger.info({ paymentId: p.paymentId }, 'invoice: payment before GST_EFFECTIVE_FROM; none due');
    return null;
  }

  const draft: InvoiceDraft = {
    amount: p.amount,
    description: p.description,
    paidAt: p.paidAt,
    source: p.source,
    ...(p.razorpayOrderId ? { razorpayOrderId: p.razorpayOrderId } : {}),
    ...(p.razorpaySubscriptionId ? { razorpaySubscriptionId: p.razorpaySubscriptionId } : {}),
  };
  const filter = { kind: 'invoice' as const, paymentId: p.paymentId };
  try {
    const row = await Invoice.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          kind: 'invoice',
          state: 'issuing',
          paymentId: p.paymentId,
          userId: new mongoose.Types.ObjectId(p.userId),
          draft,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: false },
    );
    if (row) return row;
  } catch (err) {
    // The sibling event inserted first, or the row is issued (the immutability
    // guard hides issued rows from the upsert, so it tries an insert).
    if (!isDuplicateKey(err)) throw err;
  }
  return Invoice.findOne(filter);
}

export interface ProcessedRefund {
  refundId: string;
  paymentId: string;
  /** Paise refunded, from the Razorpay refund entity. */
  amount: number;
  processedAt: Date;
}

/**
 * Makes sure the RefundCap row for `original` exists. A new row is seeded with
 * any credit notes already recorded against the invoice (rows made before the
 * cap existed, T-436 a); after that, credit notes are only ever recorded after
 * the cap counted them, so the seed is exact. A concurrent first insert loses
 * on the unique index and is ignored.
 */
async function ensureRefundCap(original: IInvoice): Promise<void> {
  const prior = await Invoice.find({ kind: 'credit_note', originalInvoiceId: original._id })
    .select('refundId draft.amount')
    .lean();
  const refundIds = prior
    .map((cn) => cn.refundId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const total = prior.reduce((sum, cn) => sum + (cn.draft?.amount ?? 0), 0);
  try {
    await RefundCap.updateOne(
      { originalInvoiceId: original._id },
      { $setOnInsert: { refundedTotal: total, creditedRefundIds: refundIds } },
      { upsert: true },
    );
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
}

/**
 * Upserts the credit note row for a processed refund in state 'issuing'.
 * Returns null (and logs) when the refunded payment has no invoice: then no
 * tax invoice exists to credit (e.g. a payment before GST_EFFECTIVE_FROM).
 *
 * Refund cap (T-436 b, Arjun #3): the refund is counted against the original
 * invoice by ONE conditional update on its RefundCap row: `$inc refundedTotal`
 * and `$addToSet creditedRefundIds`, matched only while this refundId is not
 * yet listed and refundedTotal + amount <= the invoiced amount. Concurrent
 * refunds therefore cannot together exceed the invoice (no check-then-insert).
 *
 * - Counted now, or already counted (refundId listed): record the credit note.
 * - Neither (the cap would be exceeded): log an error, return null.
 *
 * Crash between the `$inc` and the credit note upsert: the refundId is in
 * creditedRefundIds, so Razorpay's retry (or any re-run) does not match the
 * conditional update again (no second `$inc`), sees the refundId listed, and
 * goes on to the credit note upsert, which is keyed by refundId and inserts the
 * missing row (or returns it if it exists). One count, one credit note.
 */
export async function recordCreditNoteForRefund(r: ProcessedRefund): Promise<IInvoice | null> {
  if (!r.refundId || !r.paymentId || !Number.isSafeInteger(r.amount) || r.amount <= 0) {
    logger.warn({ refundId: r.refundId || null }, 'credit note: refund incomplete; not recorded');
    return null;
  }
  const original = await Invoice.findOne({ kind: 'invoice', paymentId: r.paymentId });
  if (!original) {
    logger.warn(
      { refundId: r.refundId, paymentId: r.paymentId },
      'credit note: refunded payment has no invoice; no credit note',
    );
    return null;
  }
  const filter = { kind: 'credit_note' as const, refundId: r.refundId };
  // A retry of a refund already recorded: return its row, no re-check.
  const existing = await Invoice.findOne(filter);
  if (existing) return existing;

  await ensureRefundCap(original);
  const counted = await RefundCap.findOneAndUpdate(
    {
      originalInvoiceId: original._id,
      creditedRefundIds: { $ne: r.refundId },
      $expr: {
        $lte: [{ $add: [{ $ifNull: ['$refundedTotal', 0] }, r.amount] }, original.draft.amount],
      },
    },
    { $inc: { refundedTotal: r.amount }, $addToSet: { creditedRefundIds: r.refundId } },
    { new: true },
  );
  if (!counted) {
    const already = await RefundCap.exists({
      originalInvoiceId: original._id,
      creditedRefundIds: r.refundId,
    });
    if (!already) {
      logger.error(
        { refundId: r.refundId, paymentId: r.paymentId },
        'credit note: refund exceeds the invoiced amount (with earlier credit notes); not recorded, check by hand',
      );
      return null;
    }
    // Counted by an earlier attempt (a retry, or a crash before the credit
    // note was written): fall through to the refundId-keyed upsert.
  }

  try {
    const row = await Invoice.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          kind: 'credit_note',
          state: 'issuing',
          refundId: r.refundId,
          paymentId: r.paymentId,
          userId: original.userId,
          originalInvoiceId: original._id,
          draft: {
            amount: r.amount,
            description: original.draft.description,
            paidAt: r.processedAt,
            source: 'refund.processed',
          } satisfies InvoiceDraft,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: false },
    );
    if (row) return row;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
  return Invoice.findOne(filter);
}

// ── Step 2: issue ───────────────────────────────────────────────────────────

export type IssueOutcome =
  | 'issued' // this call issued it
  | 'already_issued'
  | 'waiting_for_original' // credit note whose invoice is not issued yet
  | 'dropped' // payment before GST_EFFECTIVE_FROM: row removed, no number used
  | 'not_found';

interface IssueContent {
  seller: SellerSnapshot;
  customer: { name: string; email: string; stateCode: string; stateName: string };
  placeOfSupply: { code: string; name: string; source: 'user' | 'fallback' };
  lines: IInvoice['lines'];
  price: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  originalInvoiceNumber?: string;
  originalInvoiceDate?: Date;
}

/** The customer's place of supply: their GST State if valid, else ours (Ajay Addendum 3). */
async function placeOfSupplyFor(
  userId: mongoose.Types.ObjectId,
  seller: SellerSnapshot,
): Promise<{ customer: IssueContent['customer']; placeOfSupply: IssueContent['placeOfSupply'] }> {
  const user = await User.findById(userId, {
    name: 1,
    email: 1,
    [CUSTOMER_STATE_CODE_FIELD]: 1,
  }).lean<Record<string, unknown> | null>();
  const raw = user?.[CUSTOMER_STATE_CODE_FIELD];
  const state = findGstState(typeof raw === 'string' ? raw.trim() : undefined);
  const placeOfSupply = state
    ? { code: state.code, name: state.name, source: 'user' as const }
    : { code: seller.stateCode, name: seller.stateName, source: 'fallback' as const };
  return {
    customer: {
      name: typeof user?.name === 'string' ? user.name : '',
      email: typeof user?.email === 'string' ? user.email : '',
      stateCode: placeOfSupply.code,
      stateName: placeOfSupply.name,
    },
    placeOfSupply,
  };
}

/** Everything the issued row carries besides number/fy/seq/issuedAt. */
async function buildContent(
  row: IInvoice,
  seller: SellerSnapshot,
  original: IInvoice | null,
): Promise<IssueContent> {
  let customer: IssueContent['customer'];
  let placeOfSupply: IssueContent['placeOfSupply'];
  let intraState: boolean;
  if (row.kind === 'credit_note') {
    // Ajay §4: reverse the tax at the original invoice's split.
    if (!original?.customer || !original.placeOfSupply || !original.seller) {
      throw new Error('credit note original is not issued');
    }
    customer = { ...original.customer };
    placeOfSupply = { ...original.placeOfSupply };
    intraState = original.placeOfSupply.code === original.seller.stateCode;
  } else {
    ({ customer, placeOfSupply } = await placeOfSupplyFor(row.userId, seller));
    intraState = placeOfSupply.code === seller.stateCode;
  }
  const split = splitGstInclusive(row.draft.amount, intraState);
  return {
    seller,
    customer,
    placeOfSupply,
    lines: [
      {
        description: row.draft.description,
        sac: GST_SAC,
        ratePercent: GST_RATE_PERCENT,
        quantity: 1,
        taxable: split.taxable,
        amount: split.total,
      },
    ],
    ...split,
    ...(original && row.kind === 'credit_note'
      ? { originalInvoiceNumber: original.number, originalInvoiceDate: original.issuedAt }
      : {}),
  };
}

/**
 * Writes the number the counter holds for `invoiceId` onto that row (with its
 * content), then frees the series. Safe to run twice or concurrently: both
 * writes are conditional.
 *
 * If the row did not take the number (it is gone, or a concurrent issue gave
 * it a different one), the number is given back before the series is freed:
 * the series lock (`pendingInvoiceId`) is still held, so nothing has been
 * allocated after it and `seq - 1` is exact. No gap either way.
 */
async function finalizeAllocation(
  counter: IInvoiceCounter,
  invoiceId: mongoose.Types.ObjectId,
  seller: SellerSnapshot,
): Promise<boolean> {
  const row = await Invoice.findById(invoiceId);
  let wrote = false;
  if (row?.state === 'issuing') {
    const original =
      row.kind === 'credit_note' && row.originalInvoiceId
        ? await Invoice.findById(row.originalInvoiceId)
        : null;
    const content = await buildContent(row, seller, original);
    const issuedAt = counter.pendingIssuedAt ?? new Date();
    const number = formatInvoiceNumber(row.kind as InvoiceKind, counter.fy, counter.seq);
    if (number.length <= INVOICE_NUMBER_MAX_LENGTH) {
      const res = await Invoice.updateOne(
        { _id: row._id, state: 'issuing' },
        {
          $set: {
            ...content,
            number,
            fy: counter.fy,
            seq: counter.seq,
            issuedAt,
            state: 'issued',
          },
        },
      );
      wrote = res.modifiedCount === 1;
      if (wrote) {
        // T-436 (c): the single write point for every issue (issueInvoice and
        // finishPendingIn), so every issued row is queued from here. Fire and
        // forget: the email never delays or fails issuing; the sweep retries.
        queueInvoiceEmailInBackground({
          _id: row._id,
          kind: row.kind,
          state: 'issued',
          userId: row.userId,
          emailQueuedAt: null,
          draft: { source: row.draft.source },
        });
      }
    }
  }

  // Did the row end up with this number (by this call or a concurrent one)?
  const used =
    wrote ||
    (await Invoice.exists({
      _id: invoiceId,
      state: 'issued',
      fy: counter.fy,
      seq: counter.seq,
    })) !== null;

  if (used) {
    await InvoiceCounter.updateOne(
      { _id: counter._id, pendingInvoiceId: invoiceId },
      { $set: { pendingInvoiceId: null, pendingIssuedAt: null } },
    );
    return wrote;
  }

  const returned = await InvoiceCounter.updateOne(
    { _id: counter._id, pendingInvoiceId: invoiceId, seq: counter.seq },
    { $inc: { seq: -1 }, $set: { pendingInvoiceId: null, pendingIssuedAt: null } },
  );
  if (returned.modifiedCount === 1) {
    logger.warn(
      { invoiceId: String(invoiceId), fy: counter.fy, series: counter.series, seq: counter.seq },
      'invoice: allocated number not taken by its row; number given back',
    );
  }
  if (
    row?.state === 'issuing' &&
    formatInvoiceNumber(row.kind as InvoiceKind, counter.fy, counter.seq).length >
      INVOICE_NUMBER_MAX_LENGTH
  ) {
    throw new InvoiceSeriesExhaustedError();
  }
  return false;
}

/** Finishes whatever allocation is pending on (fy, series). Returns false if none was. */
async function finishPendingIn(
  fy: string,
  series: InvoiceKind,
  seller: SellerSnapshot,
): Promise<boolean> {
  const counter = await InvoiceCounter.findOne({ fy, series });
  if (!counter?.pendingInvoiceId) return false;
  await finalizeAllocation(counter, counter.pendingInvoiceId, seller);
  return true;
}

/**
 * Issues a recorded row: allocates its number and writes it with the content.
 * Throws InvoiceConfigError when the seller config is incomplete (the sweep
 * retries), InvoiceSeriesBusyError when the series stays busy, and database
 * errors as they come.
 */
export async function issueInvoice(
  invoiceId: mongoose.Types.ObjectId | string,
): Promise<IssueOutcome> {
  const { seller, effectiveFrom } = requireInvoiceConfig();
  const id = new mongoose.Types.ObjectId(String(invoiceId));

  // A number already allocated to this row (a crash after the $inc): finish
  // that one, never allocate a second.
  const held = await InvoiceCounter.findOne({ pendingInvoiceId: id });
  if (held) {
    if (await finalizeAllocation(held, id, seller)) return 'issued';
    const after = await Invoice.findById(id).select('state').lean();
    return after?.state === 'issued' ? 'already_issued' : 'not_found';
  }

  const row = await Invoice.findById(id);
  if (!row) return 'not_found';
  if (row.state === 'issued') return 'already_issued';

  if (row.kind === 'invoice' && row.draft.paidAt < effectiveFrom) {
    // Recorded while GST_EFFECTIVE_FROM was unset; no supply under the
    // registration, so no invoice. Nothing was allocated, so no gap.
    await Invoice.deleteOne({ _id: row._id, state: 'issuing' });
    logger.info(
      { invoiceId: String(row._id) },
      'invoice: payment before GST_EFFECTIVE_FROM; dropped',
    );
    return 'dropped';
  }
  if (row.kind === 'credit_note') {
    const original = row.originalInvoiceId
      ? await Invoice.findById(row.originalInvoiceId).select('state').lean()
      : null;
    if (original?.state !== 'issued') return 'waiting_for_original';
  }

  const series = row.kind as InvoiceKind;
  for (let attempt = 0; attempt < ALLOCATE_ATTEMPTS; attempt += 1) {
    // Re-check right before allocating: a concurrent issue (the sibling event,
    // a retry overlapping the sweep) may have issued or dropped the row since
    // it was read. finalizeAllocation gives the number back if one still slips
    // through.
    const current = await Invoice.findById(row._id).select('state').lean();
    if (!current) return 'not_found';
    if (current.state === 'issued') return 'already_issued';
    const issuedAt = new Date();
    const fy = financialYear(issuedAt);
    let counter: IInvoiceCounter | null = null;
    try {
      counter = await InvoiceCounter.findOneAndUpdate(
        { fy, series, pendingInvoiceId: null, seq: { $lt: MAX_INVOICE_SEQ } },
        { $inc: { seq: 1 }, $set: { pendingInvoiceId: row._id, pendingIssuedAt: issuedAt } },
        { upsert: true, new: true, setDefaultsOnInsert: false },
      );
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // The series exists but did not match: another row's allocation is
      // pending, or the series is full.
      const existing = await InvoiceCounter.findOne({ fy, series }).lean();
      if (existing && !existing.pendingInvoiceId && existing.seq >= MAX_INVOICE_SEQ) {
        logger.error({ fy, series }, 'invoice: number series full; nothing issued');
        throw new InvoiceSeriesExhaustedError();
      }
      await finishPendingIn(fy, series, seller);
      // Someone may have finished this very row while we helped.
      const now = await Invoice.findById(row._id).select('state').lean();
      if (now?.state === 'issued') return 'already_issued';
      continue;
    }
    if (!counter) continue;
    const wrote = await finalizeAllocation(counter, row._id as mongoose.Types.ObjectId, seller);
    if (wrote) {
      logger.info(
        { invoiceId: String(row._id), kind: row.kind, fy, seq: counter.seq },
        'invoice issued',
      );
      return 'issued';
    }
    // Not written by this call; the number went back if the row did not take it.
    const after = await Invoice.findById(row._id).select('state').lean();
    return after?.state === 'issued' ? 'already_issued' : 'not_found';
  }
  throw new InvoiceSeriesBusyError();
}

// ── Webhook entry points ────────────────────────────────────────────────────

/**
 * Records then issues. Recording errors throw (the webhook 500s, Razorpay
 * retries); issuing errors are logged and left for the sweep, so a missing
 * seller config never fails the payment webhook.
 */
async function issueRecorded(row: IInvoice | null): Promise<void> {
  if (!row || row.state === 'issued') return;
  try {
    await issueInvoice(row._id as mongoose.Types.ObjectId);
  } catch (err) {
    logger.error(
      { invoiceId: String(row._id), kind: row.kind, errName: errName(err) },
      'invoice: issue failed; the invoice sweep will retry',
    );
  }
}

export async function issueInvoiceOnCapture(p: CapturedPayment): Promise<void> {
  await issueRecorded(await recordInvoiceForPayment(p));
}

export async function issueCreditNoteOnRefund(r: ProcessedRefund): Promise<void> {
  await issueRecorded(await recordCreditNoteForRefund(r));
}

// ── Payload helpers ─────────────────────────────────────────────────────────

/** Razorpay unix seconds -> Date, or `fallback`. */
export function fromUnix(seconds: unknown, fallback: Date = new Date()): Date {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : fallback;
}

/**
 * The captured payment in a webhook payload, or null if there is none, or it
 * is not captured (failed, refunded or otherwise reversed: Ajay §2, no invoice).
 */
export function capturedPaymentEntity(
  payload: Record<string, unknown>,
): { id: string; amount: number; createdAt: Date } | null {
  const entity = (payload.payment as Record<string, unknown> | undefined)?.entity as
    | Record<string, unknown>
    | undefined;
  if (!entity) return null;
  if (typeof entity.id !== 'string' || !entity.id) return null;
  if (entity.status !== 'captured') return null;
  if (typeof entity.amount !== 'number') return null;
  return { id: entity.id, amount: entity.amount, createdAt: fromUnix(entity.created_at) };
}
