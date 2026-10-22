/**
 * Single BullMQ worker process — drains both email:high and email:low
 * queues, renders the requested template, sends via the configured provider.
 *
 * Concurrency: EMAIL_WORKER_CONCURRENCY (default 5). One Worker instance
 * per queue so the high-tier queue isn't starved by low-tier backlog.
 *
 * Failure handling:
 *  - Any thrown error fails the attempt; BullMQ retries with the producer's
 *    `attempts` / exponential `backoff` (packages/email-client), then keeps
 *    the job as failed for 30 days for scripts/replay.ts.
 *  - The processor always rethrows a sanitised error (EmailSendError from the
 *    provider, or toSentrySafeError: name, code and stack frames, no message),
 *    so BullMQ's stored failedReason holds no address or template data.
 *  - Sentry breadcrumb on every send.start / send.success / send.failure
 *
 * T-220 AC6: logs and Sentry carry template id, user id (data.userId, when
 * the producer sets it), job id and counts. Never an address or the body.
 *
 * T-223 (Arjun, condition 2): an auth.verifyEmail job carries the userId only.
 * The processor asks auth (POST AUTH_SERVICE_URL/internal/verify-email/mint,
 * INTERNAL_SECRET header) for the address, name and a freshly minted link, then
 * renders and sends. A 409 (already verified, or a Google account) or a 404 (no
 * such user) completes the job with no send and no Sentry event. The mint
 * response is never logged, never put in job data, meta, the return value,
 * failedReason or Sentry. A BullMQ retry mints again; the newest link wins.
 *
 * T-358 (Arjun rulings 2-3; Ajay 8a2b639 / 9e42eea / 3f94ce9): an
 * auth.unverifiedDeletionNotice job also carries the userId only. The processor asks auth
 * (POST /internal/unverified-notice/prepare) which notice is due (first / warning), which
 * variant (A with a 7-day link, B deactivated with none), the address, name and formatted
 * deletion date, then renders and sends.
 *
 * Every email that carries a verify link (auth.verifyEmail, resends included) and the notice
 * report their outcome to auth through ONE route (POST /internal/unverified-notice/outcome
 * { userId, mail, outcome }), which stamps the T-358 clock (firstVerifySentAt) and, for the
 * warning notice, unverifiedNoticeSentAt. Auth deletes nothing without those stamps, so the
 * outcome is reported ONLY for a real send to the real recipient: never in dry run and never
 * with EMAIL_DEV_REDIRECT_TO set. A recipient hard bounce at send time (SMTP 550/551/553
 * recipient rejection) counts as sent (Ajay, 08a0d09 §8 row 4) and completes the job; any
 * other send failure is ours and the job retries as usual, with nothing reported. If the report
 * itself fails after a real send, the job still completes (no second email); the account just
 * stays unstamped, which can only delay a deletion.
 *
 * T-436 (b/c, Arjun #1): billing.taxInvoice and billing.creditNote jobs carry { userId, invoiceId }
 * only (`to` is empty and ignored, as are cc/bcc/replyTo). The processor asks billing (GET
 * BILLING_SERVICE_URL/internal/invoices/:id/email-view, INTERNAL_SECRET header) for the number,
 * total, date, name, address and download link, checks the row belongs to the job's user and
 * matches the template's kind, then renders and sends to the snapshot address.
 *  - 410 (user erased or being erased; Ajay Addendum 8 #2, e591d0d): dropped, like a verify 409:
 *    the job completes with no send, no retry and no Sentry event.
 *  - 404 / 409 (no such row, not issued), 400, a userId / invoiceId / kind mismatch, or a job
 *    without both ids: UnrecoverableError (failed once, no retry, kept for replay).
 *  - 5xx, 401, a network error or timeout, a malformed 200, or BILLING_SERVICE_URL unset:
 *    BillingViewError, retried with the producer's backoff.
 * The view is PII and an amount: never logged, never in job data, meta, the return value,
 * failedReason or Sentry. Logs carry jobId, template, userId, invoiceId and HTTP status only.
 *
 * T-221: an auth.passwordReset job carries the userId only. The processor asks auth (POST
 * /internal/password-reset/mint, INTERNAL_SECRET) for the address and either a freshly minted
 * 30-minute reset link (variant 'link') or, for a Google-only account, the login URL (variant
 * 'google'), then renders and sends. A 404 (no such user, inactive, being closed) completes the
 * job with no send and no Sentry event. The mint response (address, link) is never logged, put
 * in job data, meta, the return value, failedReason or Sentry. A BullMQ retry mints again; only
 * the newest link works.
 *
 * Test seam (T-220 AC4): createProcessor(send, mint, notice, invoiceView, passwordReset) takes the provider send
 * function and the verify-link mint function, and startWorkers({ connection, send }) takes both the Redis
 * connection and the send function, so a test can force a provider error
 * against its own Redis without jest.mock. Importing this module opens no
 * Redis connection; startWorkers() does, unless one is passed in.
 */
import { EMAIL_TIER_BY_TEMPLATE, type EmailTemplate } from '@lawie/email-client';
import { INTERNAL_HEADERS } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import {
  UnrecoverableError,
  Worker,
  type ConnectionOptions,
  type Processor,
  type Job,
} from 'bullmq';
import Redis from 'ioredis';

import { env } from './config/env';
import { logger } from './config/logger';
import {
  anyTemplateUnfilled,
  isLiveSend,
  supplierStreetAddress,
  templateHasUnfilledFooter,
} from './placeholders';
import { EmailSendError, sendEmail, type SendEmailFn } from './providers';
import { safeErrorFields, toSentrySafeError, userIdFromData } from './providers/safe-log';
import { bullPrefix, WORKER_QUEUE_NAMES } from './queues';
import { isTemplateRegistered, renderTemplate } from './templates';
import { formatInr, formatIstDate } from './templates/billing/format';

export interface EmailJobData {
  template: EmailTemplate;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string;
  data: Record<string, unknown>;
}

/**
 * True when BullMQ will NOT retry this job after the current attempt fails.
 * Mirrors Job.shouldRetryJob() in bullmq 5.x: inside the processor
 * `attemptsMade` counts the attempts that already finished (it is
 * incremented in moveToFailed, after the processor throws), so the current
 * attempt is `attemptsMade + 1`, and BullMQ retries only while
 * `attemptsMade + 1 < opts.attempts`. A missing `opts.attempts` means one
 * attempt. An UnrecoverableError is never retried either. (BullMQ also skips
 * retries for job.discard(), but `discarded` is protected and this worker
 * never calls discard().)
 */
export function isFinalAttempt(job: Job, err?: unknown): boolean {
  if ((err as { name?: unknown } | undefined)?.name === 'UnrecoverableError') return true;
  return job.attemptsMade + 1 >= (job.opts?.attempts ?? 1);
}

// ── T-223: verify-link mint (auth) ──────────────────────────────────────────

/** What auth's mint route returns. PII and a live credential: never log any of it. */
export interface MintedVerifyLink {
  email: string;
  name: string;
  link: string;
  /** T-522: the sign-up Ink was already granted (picks the verify mail's body variant). */
  signupInkGranted?: boolean;
}

/**
 * Asks auth to mint a verify link for userId. Returns null when auth refuses with 409
 * (already verified, or a Google account) or 404 (no such user): the job is dropped.
 * Throws a value-free error on any other failure, so BullMQ retries.
 */
export type MintVerifyLinkFn = (userId: string) => Promise<MintedVerifyLink | null>;

/** Value-free error for a failed mint call: name + code only, no URL, no body. */
class VerifyMintError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`verify-email mint failed: ${code}`);
    this.name = 'VerifyMintError';
    this.code = code;
  }
}

const MINT_TIMEOUT_MS = 10_000;

export const mintVerifyLinkViaAuth: MintVerifyLinkFn = async (userId) => {
  const res = await fetch(`${env.AUTH_SERVICE_URL}/internal/verify-email/mint`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [INTERNAL_HEADERS.SECRET]: env.INTERNAL_SECRET,
    },
    // T-522 (Arjun 1): the verify mail carries a 'signin' link (30 min, signs in). The route's
    // default is 'verify', so the worker must ask for it.
    body: JSON.stringify({ userId, kind: 'signin' }),
    signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
  });
  if (res.status === 409 || res.status === 404) return null;
  if (!res.ok) throw new VerifyMintError(`HTTP_${res.status}`);
  const body = (await res.json().catch(() => null)) as Partial<MintedVerifyLink> | null;
  if (
    !body ||
    typeof body.email !== 'string' ||
    body.email.length === 0 ||
    typeof body.link !== 'string' ||
    body.link.length === 0
  ) {
    throw new VerifyMintError('BAD_RESPONSE');
  }
  return {
    email: body.email,
    name: typeof body.name === 'string' ? body.name : '',
    link: body.link,
    signupInkGranted: body.signupInkGranted === true,
  };
};

// ── T-522: existing-address sign-up attempt mail (auth) ─────────────────────

/** What auth's signup-attempt prepare returns. PII: never log any of it. */
export interface PreparedSignupAttempt {
  email: string;
  signInUrl: string;
  resetUrl: string;
}

/**
 * Asks auth for the address and the two page links for an auth.signupAttempt job. Returns null
 * on 404 (no such user, deactivated, being closed): the job is dropped. Throws a value-free
 * error otherwise, so BullMQ retries.
 */
export type PrepareSignupAttemptFn = (userId: string) => Promise<PreparedSignupAttempt | null>;

class SignupAttemptPrepareError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`signup-attempt prepare failed: ${code}`);
    this.name = 'SignupAttemptPrepareError';
    this.code = code;
  }
}

export const prepareSignupAttemptViaAuth: PrepareSignupAttemptFn = async (userId) => {
  let res: Response;
  try {
    res = await postToAuth('/internal/signup-attempt/prepare', { userId });
  } catch (err) {
    // Network error or timeout. The original message can carry the URL: not kept.
    const name = (err as { name?: unknown } | null)?.name;
    throw new SignupAttemptPrepareError(name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new SignupAttemptPrepareError(`HTTP_${res.status}`);
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (body && nonEmpty(body.email) && nonEmpty(body.signInUrl) && nonEmpty(body.resetUrl)) {
    return { email: body.email, signInUrl: body.signInUrl, resetUrl: body.resetUrl };
  }
  throw new SignupAttemptPrepareError('BAD_RESPONSE');
};

// ── T-221: password-reset mint (auth) ───────────────────────────────────────

/** What auth's password-reset mint returns. PII and a live credential: never log any of it. */
export type MintedPasswordReset =
  | { variant: 'link'; email: string; resetUrl: string }
  | { variant: 'google'; email: string; loginUrl: string };

/**
 * Asks auth to mint a password-reset link for userId (or, for a Google-only account, the login
 * URL). Returns null on 404 (no such user, inactive, being closed): the job is dropped. Throws a
 * value-free error on any other failure, so BullMQ retries.
 */
export type MintPasswordResetFn = (userId: string) => Promise<MintedPasswordReset | null>;

class PasswordResetMintError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`password-reset mint failed: ${code}`);
    this.name = 'PasswordResetMintError';
    this.code = code;
  }
}

export const mintPasswordResetViaAuth: MintPasswordResetFn = async (userId) => {
  let res: Response;
  try {
    res = await fetch(`${env.AUTH_SERVICE_URL}/internal/password-reset/mint`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [INTERNAL_HEADERS.SECRET]: env.INTERNAL_SECRET,
      },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
    });
  } catch (err) {
    // Network error or timeout. The original message can carry the URL: not kept.
    const name = (err as { name?: unknown } | null)?.name;
    throw new PasswordResetMintError(name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new PasswordResetMintError(`HTTP_${res.status}`);
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (body && nonEmpty(body.email)) {
    if (body.variant === 'link' && nonEmpty(body.resetUrl)) {
      return { variant: 'link', email: body.email, resetUrl: body.resetUrl };
    }
    if (body.variant === 'google' && nonEmpty(body.loginUrl)) {
      return { variant: 'google', email: body.email, loginUrl: body.loginUrl };
    }
  }
  throw new PasswordResetMintError('BAD_RESPONSE');
};

// ── T-358: verify-link mail outcome and the deletion notice (auth) ─────────

/** What auth's prepare route returns. PII and a live credential: never log any of it. */
export interface PreparedNotice {
  /** 'first' starts the clock; 'warning' is the one 7 days before deletion. */
  notice: 'first' | 'warning';
  /** 'A': active account, with a link. 'B': deactivated account, no link (Ajay §9). */
  variant: 'A' | 'B';
  email: string;
  name: string;
  /** Present for variant A only. */
  link?: string;
  /** Already formatted by auth, e.g. "21 October 2026" (IST). */
  deletionDate: string;
}

/**
 * Every email that carries a verify link (or is the notice), as auth's ONE stamp path names it.
 * 'verify': the T-223 verify email and any resend. 'notice_first' / 'notice_warning': the
 * T-358 notice, as prepare classed it.
 */
export type VerifyMail = 'verify' | 'notice_first' | 'notice_warning';

/** 'bounced': the recipient's server rejected the address (counts as sent, Ajay). */
export type NoticeOutcome = 'sent' | 'bounced';

export interface UnverifiedNoticeDeps {
  /**
   * Asks auth for the notice data. Returns null on 409 (verified, Google, being erased, or no
   * notice due) or 404 (no such user): the job is dropped. Throws a value-free error
   * otherwise, so BullMQ retries.
   */
  prepare: (userId: string) => Promise<PreparedNotice | null>;
  /**
   * Reports a confirmed send (or recipient hard bounce) of any verify-link mail to auth, which
   * stamps the T-358 clock. Resolves on 200 or 404 (no such user: nothing to stamp). Throws a
   * value-free error otherwise.
   */
  report: (userId: string, mail: VerifyMail, outcome: NoticeOutcome) => Promise<void>;
}

/** The same deps, under the name that says what `report` now covers. */
export type VerifyMailAuthDeps = UnverifiedNoticeDeps;

class NoticeAuthError extends Error {
  readonly code: string;
  constructor(step: 'prepare' | 'outcome', code: string) {
    super(`unverified-notice ${step} failed: ${code}`);
    this.name = 'NoticeAuthError';
    this.code = code;
  }
}

async function postToAuth(path: string, body: unknown): Promise<Response> {
  return fetch(`${env.AUTH_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [INTERNAL_HEADERS.SECRET]: env.INTERNAL_SECRET,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
  });
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export const unverifiedNoticeViaAuth: UnverifiedNoticeDeps = {
  prepare: async (userId) => {
    const res = await postToAuth('/internal/unverified-notice/prepare', { userId });
    if (res.status === 409 || res.status === 404) return null;
    if (!res.ok) throw new NoticeAuthError('prepare', `HTTP_${res.status}`);
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const valid =
      body !== null &&
      (body.notice === 'first' || body.notice === 'warning') &&
      nonEmpty(body.email) &&
      nonEmpty(body.deletionDate) &&
      // A carries a link; B must not (a link we know cannot work is never sent).
      ((body.variant === 'A' && nonEmpty(body.link)) ||
        (body.variant === 'B' && body.link === undefined));
    if (!valid || !body) throw new NoticeAuthError('prepare', 'BAD_RESPONSE');
    return {
      notice: body.notice as PreparedNotice['notice'],
      variant: body.variant as PreparedNotice['variant'],
      email: body.email as string,
      name: typeof body.name === 'string' ? body.name : '',
      ...(body.variant === 'A' ? { link: body.link as string } : {}),
      deletionDate: body.deletionDate as string,
    };
  },
  report: async (userId, mail, outcome) => {
    const res = await postToAuth('/internal/unverified-notice/outcome', { userId, mail, outcome });
    if (res.status === 404) return;
    if (!res.ok) throw new NoticeAuthError('outcome', `HTTP_${res.status}`);
  },
};

/** SMTP reply codes for a recipient the receiving server rejects outright. */
const HARD_BOUNCE_SMTP_STATUS = new Set([550, 551, 553]);

/**
 * RFC 3463 enhanced status codes that mean the DESTINATION address is bad: 5.1.1 bad mailbox,
 * 5.1.2 bad destination system, 5.1.3 bad mailbox syntax, 5.1.6 mailbox moved, 5.1.10 null MX
 * (RFC 7505). Deliberately not 5.1.0 (unspecified), 5.1.4 (ambiguous), or 5.1.7 / 5.1.8 (the
 * SENDER's address: ours).
 */
const RECIPIENT_BAD_ADDRESS_STATUS = new Set(['5.1.1', '5.1.2', '5.1.3', '5.1.6', '5.1.10']);

/**
 * True ONLY when the send failed because the RECIPIENT's server rejected the destination
 * address (a hard bounce at send time), which counts as sent (Ajay §8 row 4). All of these
 * must hold: an SMTP EmailSendError, nodemailer code EENVELOPE, the failed command RCPT TO,
 * reply code 550/551/553, and a destination-address enhanced status (5.1.1/2/3/6/10).
 *
 * Everything else is OUR failure and is never reported, so the account is held (fail safe):
 * MAIL FROM rejections, quota ("550 5.4.5"), relaying or policy denials ("550 5.7.1", "553"
 * sender not authorised), a reply with no enhanced status, and every SES error (SES reports
 * bounces only after it has accepted the message).
 */
export function isRecipientHardBounce(err: unknown): boolean {
  return (
    err instanceof EmailSendError &&
    err.provider === 'smtp' &&
    err.code === 'EENVELOPE' &&
    err.smtpCommand === 'RCPT TO' &&
    err.statusCode !== undefined &&
    HARD_BOUNCE_SMTP_STATUS.has(err.statusCode) &&
    err.enhancedStatus !== undefined &&
    RECIPIENT_BAD_ADDRESS_STATUS.has(err.enhancedStatus)
  );
}

/** An outcome is reported only when the email really went to the real recipient. */
export function noticeOutcomeReportable(): boolean {
  return isLiveSend() && !env.EMAIL_DEV_REDIRECT_TO;
}

const NOTICE_REPORT_ATTEMPTS = 3;
const NOTICE_REPORT_BACKOFF_MS = 500;

/** Reports the outcome, retrying a few times. Never throws: true when auth accepted it. */
async function reportMailOutcome(
  report: UnverifiedNoticeDeps['report'],
  userId: string,
  mail: VerifyMail,
  outcome: NoticeOutcome,
  jobId: string | undefined,
): Promise<boolean> {
  for (let i = 1; i <= NOTICE_REPORT_ATTEMPTS; i += 1) {
    try {
      await report(userId, mail, outcome);
      return true;
    } catch (err) {
      if (i === NOTICE_REPORT_ATTEMPTS) {
        logger.error(
          {
            userId: safeLogIds(undefined, userId).userId,
            jobId,
            mail,
            outcome,
            err: safeErrorFields(err),
          },
          'Verify mail outcome not recorded; the T-358 clock is not stamped and nothing is deleted',
        );
        return false;
      }
      await new Promise((r) => setTimeout(r, NOTICE_REPORT_BACKOFF_MS * i));
    }
  }
  return false;
}

// ── T-436 (b/c): invoice email view (billing) ─────────────────────────────────

/** The invoice-email templates and the Invoice.kind each one must render. */
const INVOICE_TEMPLATE_KIND: Partial<Record<EmailTemplate, InvoiceEmailView['kind']>> = {
  'billing.taxInvoice': 'invoice',
  'billing.creditNote': 'credit_note',
};

/** What billing's email-view route returns on 200. PII and an amount: never log any of it. */
export interface InvoiceEmailView {
  invoiceId: string;
  userId: string;
  kind: 'invoice' | 'credit_note';
  number: string;
  /** ISO timestamp of issue. */
  issuedAt: string;
  /** Paise, GST included. */
  total: number;
  customer: { name: string; email: string };
  /** Credit notes only (null for an invoice). */
  originalInvoiceNumber: string | null;
  downloadUrl: string;
}

/**
 * 'ok': render and send. 'erased' (410): drop, no retry. 'rejected' (400 / 404 / 409): the row's
 * state will not change, so the job fails without retry.
 */
export type InvoiceViewResult =
  | { status: 'ok'; view: InvoiceEmailView }
  | { status: 'erased' }
  | { status: 'rejected'; httpStatus: number };

/**
 * Asks billing for the email view of one invoice or credit note. Throws a value-free
 * BillingViewError on any failure worth retrying (5xx, 401, network, timeout, malformed body,
 * BILLING_SERVICE_URL unset).
 */
export type FetchInvoiceViewFn = (invoiceId: string) => Promise<InvoiceViewResult>;

/** Value-free error for a failed email-view call: name + code only, no URL, no body. */
export class BillingViewError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`invoice email-view failed: ${code}`);
    this.name = 'BillingViewError';
    this.code = code;
  }
}

const BILLING_VIEW_TIMEOUT_MS = 10_000;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function parseInvoiceView(body: unknown): InvoiceEmailView | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const customer = (b.customer ?? null) as Record<string, unknown> | null;
  const issuedAt = typeof b.issuedAt === 'string' ? new Date(b.issuedAt) : null;
  const valid =
    nonEmpty(b.invoiceId) &&
    nonEmpty(b.userId) &&
    (b.kind === 'invoice' || b.kind === 'credit_note') &&
    nonEmpty(b.number) &&
    issuedAt !== null &&
    !Number.isNaN(issuedAt.getTime()) &&
    typeof b.total === 'number' &&
    Number.isSafeInteger(b.total) &&
    b.total >= 0 &&
    customer !== null &&
    typeof customer === 'object' &&
    nonEmpty(customer.email) &&
    (customer.name === undefined || typeof customer.name === 'string') &&
    nonEmpty(b.downloadUrl) &&
    // A credit note names the invoice it is against; an invoice names none.
    (b.kind === 'credit_note'
      ? nonEmpty(b.originalInvoiceNumber)
      : b.originalInvoiceNumber === null || b.originalInvoiceNumber === undefined);
  if (!valid || !customer) return null;
  return {
    invoiceId: b.invoiceId as string,
    userId: b.userId as string,
    kind: b.kind as InvoiceEmailView['kind'],
    number: b.number as string,
    issuedAt: b.issuedAt as string,
    total: b.total as number,
    customer: {
      name: typeof customer.name === 'string' ? customer.name : '',
      email: customer.email as string,
    },
    originalInvoiceNumber: b.kind === 'credit_note' ? (b.originalInvoiceNumber as string) : null,
    downloadUrl: b.downloadUrl as string,
  };
}

export const fetchInvoiceViewViaBilling: FetchInvoiceViewFn = async (invoiceId) => {
  if (!env.BILLING_SERVICE_URL) throw new BillingViewError('NO_BILLING_URL');
  const base = env.BILLING_SERVICE_URL.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/internal/invoices/${encodeURIComponent(invoiceId)}/email-view`, {
      method: 'GET',
      headers: { [INTERNAL_HEADERS.SECRET]: env.INTERNAL_SECRET },
      signal: AbortSignal.timeout(BILLING_VIEW_TIMEOUT_MS),
    });
  } catch (err) {
    // Network error or timeout. The original message can carry the URL: not kept.
    const name = (err as { name?: unknown } | null)?.name;
    throw new BillingViewError(name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK');
  }
  if (res.status === 410) return { status: 'erased' };
  if (res.status === 400 || res.status === 404 || res.status === 409) {
    return { status: 'rejected', httpStatus: res.status };
  }
  if (!res.ok) throw new BillingViewError(`HTTP_${res.status}`);
  const view = parseInvoiceView(await res.json().catch(() => null));
  if (!view) throw new BillingViewError('BAD_RESPONSE');
  return { status: 'ok', view };
};

/** The merge fields a template needs, from the view. Formatting throws value-free errors. */
function invoiceRenderData(view: InvoiceEmailView, userId: string): Record<string, unknown> {
  const common = {
    name: view.customer.name,
    amount: formatInr(view.total),
    date: formatIstDate(new Date(view.issuedAt)),
    downloadUrl: view.downloadUrl,
    userId,
  };
  return view.kind === 'credit_note'
    ? { ...common, creditNoteNumber: view.number, invoiceNumber: view.originalInvoiceNumber }
    : { ...common, invoiceNumber: view.number };
}

const UNFILLED_PLACEHOLDER_MESSAGE = 'email has unfilled footer placeholders; not sent';
const NO_STREET_ADDRESS_MESSAGE =
  'password reset email needs the supplier street address; not sent';
const NO_STREET_ADDRESS_SIGNUP_ATTEMPT_MESSAGE =
  'sign-up attempt email needs the supplier street address; not sent';
/** Errors raised by the placeholder guard: rethrown as-is, without the Sentry/log path. */
const placeholderRefusals = new WeakSet<object>();

/**
 * T-229 (Kunal, T-455 review): `template` and `data.userId` come from the job unchecked. Logs,
 * Sentry breadcrumbs/tags/extra and the send `meta` get only a known template id (a key of
 * @lawie/email-client's EMAIL_TIER_BY_TEMPLATE, the full EmailTemplate list; else
 * 'unregistered') and a 24-hex userId (else 'invalid'; omitted when absent). The real values
 * still drive the logic (isVerify, INVOICE_TEMPLATE_KIND, mint, render, send).
 */
export function safeLogIds(
  template: unknown,
  userId: string | undefined,
): { template: string; userId: string | undefined } {
  const registered =
    typeof template === 'string' &&
    Object.prototype.hasOwnProperty.call(EMAIL_TIER_BY_TEMPLATE, template);
  return {
    template: registered ? (template as string) : 'unregistered',
    userId: userId === undefined ? undefined : OBJECT_ID.test(userId) ? userId : 'invalid',
  };
}

export function createProcessor(
  send: SendEmailFn = sendEmail,
  mint: MintVerifyLinkFn = mintVerifyLinkViaAuth,
  notice: UnverifiedNoticeDeps = unverifiedNoticeViaAuth,
  invoiceView: FetchInvoiceViewFn = fetchInvoiceViewViaBilling,
  passwordReset: MintPasswordResetFn = mintPasswordResetViaAuth,
  signupAttempt: PrepareSignupAttemptFn = prepareSignupAttemptViaAuth,
): Processor<EmailJobData> {
  return async (job: Job<EmailJobData>) => {
    const { template, cc, bcc, replyTo, data } = job.data;
    const userId = userIdFromData(data);
    // Log/Sentry-safe copies; `template` and `userId` themselves drive the logic below.
    const ids = safeLogIds(template, userId);
    const jobId = job.id;
    const attempt = job.attemptsMade + 1;
    const isVerify = template === 'auth.verifyEmail';
    const isNotice = template === 'auth.unverifiedDeletionNotice';
    const isPasswordReset = template === 'auth.passwordReset';
    const isSignupAttempt = template === 'auth.signupAttempt';
    // T-436: invoice and credit-note emails resolve the recipient through billing.
    const invoiceKind = INVOICE_TEMPLATE_KIND[template];
    const rawInvoiceId = data?.invoiceId;
    const invoiceId = invoiceKind && nonEmpty(rawInvoiceId) ? rawInvoiceId : undefined;
    // All of these resolve the recipient through auth or billing; the job's to/cc/bcc/replyTo
    // are never used.
    const userIdOnly =
      isVerify || isNotice || isPasswordReset || isSignupAttempt || invoiceKind !== undefined;
    // T-358: which verify-link mail this is, for the outcome report (set once known).
    let mail: VerifyMail | null = isVerify ? 'verify' : null;
    Sentry.addBreadcrumb({
      category: 'email.send.start',
      level: 'info',
      data: {
        jobId,
        queue: job.queueName,
        template: ids.template,
        userId: ids.userId,
        attempt,
        recipientsCount: job.data.to.length,
      },
    });

    try {
      // T-223 review / Ajay, T-379: no live send while the template's own footer still has
      // [registered address] or [PIN]. Checked on the static footer, before auth's mint, so a
      // refused job never rotates the user's verify token. Dry run is unaffected. Fixed message,
      // ids only, no Sentry, no retry.
      if (isLiveSend() && templateHasUnfilledFooter(template)) {
        logger.error({ userId: ids.userId, jobId }, 'Email not sent: unfilled footer placeholders');
        const refusal = new UnrecoverableError(UNFILLED_PLACEHOLDER_MESSAGE);
        placeholderRefusals.add(refusal);
        throw refusal;
      }

      let to = job.data.to;
      let renderData = data;
      if (isVerify) {
        // T-223: the address, name and link come from auth at send time, never from the job.
        if (!userId) throw new UnrecoverableError('auth.verifyEmail job without a userId');
        const minted = await mint(userId);
        if (!minted) {
          logger.info(
            { jobId, template: ids.template, userId: ids.userId },
            'Verify email not sent: already verified, Google account or no such user',
          );
          return { skipped: 'not_eligible' };
        }
        to = [minted.email];
        renderData = {
          name: minted.name,
          verifyUrl: minted.link,
          signupInkGranted: minted.signupInkGranted === true,
          userId,
        };
      }
      if (isSignupAttempt) {
        // T-522 (AJ-522-M5): the address and links come from auth at send time, never the job.
        if (!userId) throw new UnrecoverableError('auth.signupAttempt job without a userId');
        // Checked before the fetch, so no PII is pulled for an email that cannot render.
        if (!isTemplateRegistered(template)) {
          throw new Error(`Template "${template}" is not registered`);
        }
        // AJ-522-S9: footer line 1 carries the supplier street address, as in the reset mail.
        // Same guard as auth.passwordReset: no live send without it, checked before the fetch.
        const streetAddress = supplierStreetAddress();
        if (isLiveSend() && !streetAddress) {
          logger.error(
            { userId: ids.userId, reason: 'supplier_street_address_unset' },
            'Sign-up attempt email not sent: supplier street address not set',
          );
          const refusal = new UnrecoverableError(NO_STREET_ADDRESS_SIGNUP_ATTEMPT_MESSAGE);
          placeholderRefusals.add(refusal);
          throw refusal;
        }
        const prepared = await signupAttempt(userId);
        if (!prepared) {
          logger.info(
            { jobId, template: ids.template, userId: ids.userId },
            'Sign-up attempt email not sent: no such user, inactive or being closed',
          );
          return { skipped: 'not_eligible' };
        }
        to = [prepared.email];
        renderData = { signInUrl: prepared.signInUrl, resetUrl: prepared.resetUrl, userId };
        if (streetAddress) renderData = { ...renderData, streetAddress };
      }
      if (isPasswordReset) {
        // T-221: the address and the link (or the login URL) come from auth at send time,
        // never from the job.
        if (!userId) throw new UnrecoverableError('auth.passwordReset job without a userId');
        // Checked before the mint, so a job that cannot render never rotates the user's token.
        if (!isTemplateRegistered(template)) {
          throw new Error(`Template "${template}" is not registered`);
        }
        // T-221 (Ajay condition 1): no live send until the supplier street address is set.
        // Checked before the mint, so a refused job mints no token. Same handling as the
        // placeholder guard: userId and reason only, no Sentry, no retry. Dry run renders a
        // visible marker instead.
        const streetAddress = supplierStreetAddress();
        if (isLiveSend() && !streetAddress) {
          logger.error(
            { userId: ids.userId, reason: 'supplier_street_address_unset' },
            'Password reset email not sent: supplier street address not set',
          );
          const refusal = new UnrecoverableError(NO_STREET_ADDRESS_MESSAGE);
          placeholderRefusals.add(refusal);
          throw refusal;
        }
        const minted = await passwordReset(userId);
        if (!minted) {
          logger.info(
            { jobId, template: ids.template, userId: ids.userId },
            'Password reset email not sent: no such user, inactive or being closed',
          );
          return { skipped: 'not_eligible' };
        }
        to = [minted.email];
        renderData =
          minted.variant === 'link'
            ? { variant: 'link', resetUrl: minted.resetUrl, userId }
            : { variant: 'google', loginUrl: minted.loginUrl, userId };
        if (streetAddress) renderData = { ...renderData, streetAddress };
      }
      if (isNotice) {
        // T-358: address, name, date and link come from auth at send time, never from the job.
        if (!userId) {
          throw new UnrecoverableError('auth.unverifiedDeletionNotice job without a userId');
        }
        const prepared = await notice.prepare(userId);
        if (!prepared) {
          logger.info(
            { jobId, template: ids.template, userId: ids.userId },
            'Unverified notice not sent: no longer eligible or no such user',
          );
          return { skipped: 'not_eligible' };
        }
        to = [prepared.email];
        mail = prepared.notice === 'first' ? 'notice_first' : 'notice_warning';
        renderData = {
          variant: prepared.variant,
          name: prepared.name,
          ...(prepared.variant === 'A' ? { verifyUrl: prepared.link } : {}),
          deletionDate: prepared.deletionDate,
          userId,
        };
      }
      if (invoiceKind) {
        // T-436 (b/c): number, total, name, address and link come from billing at send time,
        // never from the job.
        if (!userId || !invoiceId || !OBJECT_ID.test(invoiceId)) {
          logger.error(
            { jobId, template: ids.template, userId: ids.userId },
            'Invoice email job without valid ids',
          );
          throw new UnrecoverableError('invoice email job without a valid userId and invoiceId');
        }
        // Checked before the fetch, so no PII is pulled for an email that cannot render.
        if (!isTemplateRegistered(template)) {
          throw new Error(`Template "${template}" is not registered`);
        }
        const result = await invoiceView(invoiceId);
        if (result.status === 'erased') {
          logger.info(
            { jobId, template: ids.template, userId: ids.userId, invoiceId, status: 410 },
            'Invoice email not sent: user erased or being erased',
          );
          return { skipped: 'erased' };
        }
        if (result.status === 'rejected') {
          logger.warn(
            {
              jobId,
              template: ids.template,
              userId: ids.userId,
              invoiceId,
              status: result.httpStatus,
            },
            'Invoice email not sent: billing has no issued row for this id',
          );
          throw new UnrecoverableError(`invoice email-view HTTP_${result.httpStatus}`);
        }
        const { view } = result;
        if (view.userId !== userId || view.invoiceId !== invoiceId || view.kind !== invoiceKind) {
          logger.error(
            { jobId, template: ids.template, userId: ids.userId, invoiceId },
            'Invoice email not sent: billing row does not match the job (user, id or kind)',
          );
          throw new UnrecoverableError('invoice email-view does not match the job');
        }
        to = [view.customer.email];
        renderData = invoiceRenderData(view, userId);
      }

      const rendered = await renderTemplate(template, renderData);
      let result: { messageId: string | null };
      try {
        result = await send({
          to,
          cc: userIdOnly ? [] : cc,
          bcc: userIdOnly ? [] : bcc,
          replyTo: userIdOnly ? undefined : replyTo,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          meta: { template: ids.template, userId: ids.userId, jobId },
        });
      } catch (sendErr) {
        // T-358: a recipient hard bounce of a verify-link mail counts as sent (Ajay). Record it
        // and finish the job; retrying would only bounce again. Any other failure is ours:
        // rethrown, retried, nothing reported.
        if (mail && userId && noticeOutcomeReportable() && isRecipientHardBounce(sendErr)) {
          await reportMailOutcome(notice.report, userId, mail, 'bounced', jobId);
          logger.info(
            { jobId, template: ids.template, userId: ids.userId },
            'Hard bounce at send; counted as sent',
          );
          return { skipped: 'hard_bounce' };
        }
        throw sendErr;
      }
      Sentry.addBreadcrumb({
        category: 'email.send.success',
        level: 'info',
        data: { jobId, template: ids.template, userId: ids.userId, messageId: result.messageId },
      });
      logger.info(
        {
          jobId,
          template: ids.template,
          userId: ids.userId,
          queue: job.queueName,
          messageId: result.messageId,
        },
        'Email sent',
      );
      // T-223 AC7: in dry run, one line with the userId only (no address, token or link).
      if (isVerify && !isLiveSend()) logger.info({ userId: ids.userId }, 'verify email sent');
      if (isPasswordReset && !isLiveSend()) {
        logger.info({ userId: ids.userId }, 'password reset email sent');
      }
      if (mail && userId) {
        if (noticeOutcomeReportable()) {
          await reportMailOutcome(notice.report, userId, mail, 'sent', jobId);
        } else {
          // Dry run or a dev redirect: the user got nothing, so the clock does not start.
          logger.info(
            { userId: ids.userId, jobId, mail },
            'Verify mail outcome not recorded: dry run or redirect',
          );
        }
      }
      return { messageId: result.messageId };
    } catch (err) {
      // Already logged (ids only) where it was raised; no Sentry event, no retry.
      if (placeholderRefusals.has(err as object)) throw err;
      const errFields = safeErrorFields(err);
      Sentry.addBreadcrumb({
        category: 'email.send.failure',
        level: 'error',
        data: { jobId, template: ids.template, userId: ids.userId, attempt, error: errFields },
      });
      // Name/code/status only, no original message: this is what Sentry gets
      // AND what BullMQ stores as failedReason (kept 30 days). Throwing it
      // still fails the attempt, so BullMQ retries as before.
      const safeErr = toSentrySafeError(err);
      // T-353: one Sentry event per dead job, not one per retry. The
      // breadcrumb above and the log line below still fire on every attempt.
      const finalAttempt = isFinalAttempt(job, safeErr);
      if (finalAttempt) {
        Sentry.captureException(safeErr, {
          tags: { template: ids.template, queue: job.queueName },
          extra: { jobId, userId: ids.userId, attempt, maxAttempts: job.opts?.attempts ?? 1 },
        });
      }
      logger.error(
        {
          jobId,
          template: ids.template,
          userId: ids.userId,
          attempt,
          finalAttempt,
          err: errFields,
        },
        'Email send failed',
      );
      throw safeErr;
    }
  };
}

export const workers: Worker[] = [];

let ownConnection: Redis | null = null;

function defaultConnection(): Redis {
  if (!ownConnection) {
    ownConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return ownConnection;
}

export interface StartWorkersOptions {
  /** Redis connection for BullMQ; defaults to one built from REDIS_URL. */
  connection?: ConnectionOptions;
  /** Provider send function; defaults to the configured provider. */
  send?: SendEmailFn;
  /** T-223 verify-link mint function; defaults to the call to auth's internal route. */
  mint?: MintVerifyLinkFn;
  /** T-358 notice prepare/report functions; default to the calls to auth's internal routes. */
  notice?: UnverifiedNoticeDeps;
  /** T-436 invoice email-view fetch; defaults to the call to billing's internal route. */
  invoiceView?: FetchInvoiceViewFn;
  /** T-221 password-reset mint; defaults to the call to auth's internal route. */
  passwordReset?: MintPasswordResetFn;
  /** T-522 signup-attempt prepare; defaults to the call to auth's internal route. */
  signupAttempt?: PrepareSignupAttemptFn;
}

export function startWorkers(options: StartWorkersOptions = {}): Worker[] {
  // T-379: in live mode, start no processors while any template's footer still has the
  // founder's placeholders. The process stays up (no pm2 crash loop) and /health reports
  // unhealthy; jobs stay queued and go out once the footer is filled and the worker restarts.
  if (isLiveSend() && anyTemplateUnfilled()) {
    logger.warn(
      'Workers not started (live mode): email footer placeholders are not filled in yet; jobs stay queued until the footer is filled and the worker restarts',
    );
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = options.connection ?? (defaultConnection() as any);
  const processor = createProcessor(
    options.send,
    options.mint,
    options.notice,
    options.invoiceView,
    options.passwordReset,
    options.signupAttempt,
  );
  const started: Worker[] = [];
  for (const queueName of WORKER_QUEUE_NAMES) {
    const worker = new Worker<EmailJobData>(queueName, processor, {
      connection,
      concurrency: env.EMAIL_WORKER_CONCURRENCY,
      prefix: bullPrefix(env.EMAIL_QUEUE_PREFIX),
    });
    worker.on('completed', (job, result) => {
      logger.debug({ jobId: job.id, queue: queueName, result }, 'Job completed');
    });
    // T-353: without an 'error' listener a BullMQ/Redis error is emitted
    // unhandled and reaches process-level handlers with the raw error.
    worker.on('error', (err) => {
      logger.error({ queue: queueName, err: safeErrorFields(err) }, 'Worker error');
    });
    worker.on('failed', (job, err) => {
      logger.warn(
        {
          jobId: job?.id,
          queue: queueName,
          template: safeLogIds(job?.data.template, undefined).template,
          attemptsMade: job?.attemptsMade,
          err: safeErrorFields(err),
        },
        'Job failed',
      );
    });
    workers.push(worker);
    started.push(worker);
    logger.info({ queue: queueName, concurrency: env.EMAIL_WORKER_CONCURRENCY }, 'Worker started');
  }
  return started;
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
  if (ownConnection) {
    await ownConnection.quit();
    ownConnection = null;
  }
}
