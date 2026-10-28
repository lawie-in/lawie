/**
 * T-646: raising a concern on a payment (AC3; Arjun rulings 1, 4, 5, 7; Ajay
 * AJ-646-M1, M2, M6).
 *
 * - Only the payment's own user, and only a payment that is shown (never an
 *   order-only row): anything else is 'not_found' (404, nothing said about
 *   whether it exists).
 * - One open concern per payment (open or in_review): a second is 'conflict'
 *   (409). Enforced by the unique `openKey` index too, so a race also 409s.
 * - Rate limits (concern-rate-limit.ts): the route counts the IP first; the
 *   per-user count is taken here, after the 404 / 409 checks.
 * - The NOTE is stored on the PaymentConcern row and nowhere else (Arjun 5):
 *   never logged, never in Sentry, never in Redis job data, never in an email,
 *   never in the email view below.
 * - Two emails are queued (Arjun 4): the customer's acknowledgement
 *   (billing.concernReceived) and the support notice (admin.paymentConcern).
 *   Each job carries { userId, concernId } only; the worker fetches the rest
 *   from GET /internal/payment-concerns/:id/email-view at send time. A failed
 *   enqueue never fails the request (the concern is stored); the row's
 *   ackQueuedAt / notifyQueuedAt stay null and the failure is logged.
 */
import crypto from 'crypto';

import { enqueueEmail } from '@lawie/email-client';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import { Payment, VISIBLE_PAYMENT_STATUSES } from '../models/Payment.model';
import {
  CONCERN_NOTE_MAX,
  CONCERN_REASONS,
  type ConcernReason,
  type ConcernStatus,
  type IPaymentConcern,
  PaymentConcern,
} from '../models/PaymentConcern.model';
import { User } from '../models/User.model';

import { consumeConcernUserQuota } from './concern-rate-limit';
import { isErasedUser } from './invoice-email.service';

export const CONCERN_ACK_TEMPLATE = 'billing.concernReceived' as const;
export const CONCERN_NOTIFY_TEMPLATE = 'admin.paymentConcern' as const;

/** Longest wait for one enqueue before it counts as failed (never fails the request). */
export const CONCERN_EMAIL_ENQUEUE_TIMEOUT_MS = 3_000;

/** BullMQ job ids (BullMQ rejects ":" in custom ids). */
export const concernAckJobId = (concernId: string): string => `concern-ack-${concernId}`;
export const concernNotifyJobId = (concernId: string): string => `concern-notify-${concernId}`;

/** Where a payment row lives in the web app (Ajay / design: the ack deep link). */
export const PAYMENT_ROW_PATH = '/dashboard/settings?tab=billing#payment-';

export function paymentRowUrl(paymentId: string, frontendUrl: string = env.FRONTEND_URL): string {
  const base = frontendUrl.trim().replace(/\/+$/, '');
  return `${base}${PAYMENT_ROW_PATH}${paymentId}`;
}

/** Support's link for the payment: the Razorpay dashboard (ids only). */
export function adminPaymentUrl(razorpayPaymentId: string): string {
  return `https://dashboard.razorpay.com/app/payments/${encodeURIComponent(razorpayPaymentId)}`;
}

/** First character of the local part, then ***, then the domain. '' for a non-address. */
export function maskEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return '';
  return `${email[0]}***@${email.slice(at + 1)}`;
}

// No 0/O, 1/I/L: read aloud or typed back without confusion.
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const REF_LENGTH = 8;

/** A concern reference, e.g. PC-7K3M9QX2 ({ref} in AJ-646-M2). */
export function newConcernReference(): string {
  const bytes = crypto.randomBytes(REF_LENGTH);
  let out = '';
  for (let i = 0; i < REF_LENGTH; i += 1) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `PC-${out}`;
}

// ── Body validation ──────────────────────────────────────────────────────────

export type ConcernBody = { reason: ConcernReason; note: string };

/**
 * { reason: one of CONCERN_REASONS, note: string of at most 500 characters }.
 * The note may be empty except for 'other' (design: required only for
 * "Something else"). Returns null for anything else. Never echoes the input.
 */
export function parseConcernBody(body: unknown): ConcernBody | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { reason, note } = body as { reason?: unknown; note?: unknown };
  if (typeof reason !== 'string' || !(CONCERN_REASONS as readonly string[]).includes(reason)) {
    return null;
  }
  const raw = note === undefined || note === null ? '' : note;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length > CONCERN_NOTE_MAX) return null;
  if (reason === 'other' && trimmed.length === 0) return null;
  return { reason: reason as ConcernReason, note: trimmed };
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface ConcernView {
  id: string;
  status: ConcernStatus;
  reference: string;
}

export type CreateConcernResult =
  | { status: 'created'; concern: ConcernView }
  | { status: 'not_found' }
  | { status: 'conflict' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

function isDuplicateKey(err: unknown, field: string): boolean {
  const e = err as { code?: unknown; keyPattern?: Record<string, unknown> } | null;
  return e?.code === 11000 && !!e.keyPattern && field in e.keyPattern;
}

/**
 * Throws ConcernRateLimitUnavailableError (route: 503) when the per-user count
 * cannot be taken, and DB errors (route: 500). `paymentId` must be a valid
 * ObjectId string (the route 404s anything else).
 */
export async function createPaymentConcern(input: {
  userId: string;
  paymentId: string;
  body: ConcernBody;
}): Promise<CreateConcernResult> {
  const { userId, paymentId, body } = input;
  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(paymentId)) {
    return { status: 'not_found' };
  }
  const uid = new mongoose.Types.ObjectId(userId);
  const pid = new mongoose.Types.ObjectId(paymentId);

  const payment = await Payment.findOne(
    {
      _id: pid,
      userId: uid,
      status: { $in: [...VISIBLE_PAYMENT_STATUSES] },
      razorpayPaymentId: { $type: 'string' },
    },
    { _id: 1 },
  ).lean();
  if (!payment) return { status: 'not_found' };

  const openExists = await PaymentConcern.exists({ openKey: String(pid) });
  if (openExists) return { status: 'conflict' };

  const quota = await consumeConcernUserQuota(userId);
  if (!quota.allowed) return { status: 'rate_limited', retryAfterSeconds: quota.retryAfterSeconds };

  let created: IPaymentConcern | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
    try {
      const doc = await PaymentConcern.create({
        paymentId: pid,
        userId: uid,
        reason: body.reason,
        note: body.note,
        status: 'open',
        reference: newConcernReference(),
        openKey: String(pid),
      });
      created = doc.toObject() as IPaymentConcern;
    } catch (err) {
      if (isDuplicateKey(err, 'openKey')) return { status: 'conflict' };
      if (isDuplicateKey(err, 'reference')) continue; // a reference clash: draw again
      throw err;
    }
  }
  if (!created) throw new Error('could not allocate a concern reference');

  const concernId = String(created._id);
  logger.info({ concernId, paymentId, userId, reason: body.reason }, 'payment concern created');
  await queueConcernEmails(concernId, userId);

  return {
    status: 'created',
    concern: { id: concernId, status: created.status, reference: created.reference },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error('concern email enqueue timed out');
      e.name = 'ConcernEmailEnqueueTimeoutError';
      reject(e);
    }, ms);
    timer.unref();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Queues the acknowledgement and the support notice, ids only, and sets each
 * marker on success. Never throws. With REDIS_URL unset nothing is queued.
 */
export async function queueConcernEmails(concernId: string, userId: string): Promise<void> {
  if (!env.REDIS_URL) {
    logger.warn({ concernId }, 'payment concern: REDIS_URL not set; emails not queued');
    return;
  }
  const jobs = [
    {
      template: CONCERN_ACK_TEMPLATE,
      idempotencyKey: concernAckJobId(concernId),
      marker: 'ackQueuedAt',
    },
    {
      template: CONCERN_NOTIFY_TEMPLATE,
      idempotencyKey: concernNotifyJobId(concernId),
      marker: 'notifyQueuedAt',
    },
  ] as const;
  await Promise.all(
    jobs.map(async (j) => {
      try {
        await withTimeout(
          enqueueEmail({
            template: j.template,
            to: [],
            data: { userId, concernId },
            idempotencyKey: j.idempotencyKey,
          }),
          CONCERN_EMAIL_ENQUEUE_TIMEOUT_MS,
        );
        await PaymentConcern.updateOne(
          { _id: new mongoose.Types.ObjectId(concernId), [j.marker]: null },
          { $set: { [j.marker]: new Date() } },
        );
      } catch (err) {
        logger.error(
          { concernId, template: j.template, errName: err instanceof Error ? err.name : 'unknown' },
          'payment concern: email not queued',
        );
      }
    }),
  );
}

// ── Email view for the worker (no note) ──────────────────────────────────────

export interface ConcernEmailView {
  concernId: string;
  userId: string;
  paymentId: string;
  razorpayPaymentId: string;
  reference: string;
  reason: ConcernReason;
  /** The customer's address: the acknowledgement's recipient. */
  email: string;
  /** The customer's name, for the acknowledgement's greeting only ('' when unknown). */
  name: string;
  /** For the support notice only. */
  maskedEmail: string;
  /** The payment row in Settings (AJ-646-M2 deep link). */
  paymentUrl: string;
  /** Support's link for the payment. */
  adminUrl: string;
  /** SUPPORT_NOTIFY_EMAIL: the support notice's recipient. */
  notifyTo: string;
}

export type ConcernEmailViewResult =
  | { status: 'ok'; view: ConcernEmailView }
  | { status: 'not_found' }
  | { status: 'erased' };

/**
 * What the worker needs to send either concern email. Never the note: it is
 * projected out of the read.
 */
export async function concernEmailView(concernId: string): Promise<ConcernEmailViewResult> {
  if (!mongoose.Types.ObjectId.isValid(concernId)) return { status: 'not_found' };
  const concern = await PaymentConcern.findById(new mongoose.Types.ObjectId(concernId), {
    note: 0,
  }).lean();
  if (!concern) return { status: 'not_found' };
  if (await isErasedUser(concern.userId)) return { status: 'erased' };
  const [payment, user] = await Promise.all([
    Payment.findOne(
      { _id: concern.paymentId, userId: concern.userId },
      {
        razorpayPaymentId: 1,
      },
    ).lean(),
    User.findById(concern.userId, { email: 1, name: 1 }).lean<{
      email?: unknown;
      name?: unknown;
    } | null>(),
  ]);
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!payment || !payment.razorpayPaymentId || !email) return { status: 'not_found' };
  const paymentId = String(concern.paymentId);
  return {
    status: 'ok',
    view: {
      concernId: String(concern._id),
      userId: String(concern.userId),
      paymentId,
      razorpayPaymentId: payment.razorpayPaymentId,
      reference: concern.reference,
      reason: concern.reason,
      email,
      name: typeof user?.name === 'string' ? user.name.trim() : '',
      maskedEmail: maskEmail(email),
      paymentUrl: paymentRowUrl(paymentId),
      adminUrl: adminPaymentUrl(payment.razorpayPaymentId),
      notifyTo: env.SUPPORT_NOTIFY_EMAIL,
    },
  };
}
