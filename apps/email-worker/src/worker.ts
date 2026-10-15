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
 * Test seam (T-220 AC4): createProcessor(send, mint, notice) takes the provider send
 * function and the verify-link mint function, and startWorkers({ connection, send }) takes both the Redis
 * connection and the send function, so a test can force a provider error
 * against its own Redis without jest.mock. Importing this module opens no
 * Redis connection; startWorkers() does, unless one is passed in.
 */
import { EMAIL_QUEUE_NAMES, type EmailTemplate } from '@lawie/email-client';
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
import { anyTemplateUnfilled, isLiveSend, templateHasUnfilledFooter } from './placeholders';
import { EmailSendError, sendEmail, type SendEmailFn } from './providers';
import { safeErrorFields, toSentrySafeError, userIdFromData } from './providers/safe-log';
import { renderTemplate } from './templates';

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
    body: JSON.stringify({ userId }),
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
  };
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
          { userId, jobId, mail, outcome, err: safeErrorFields(err) },
          'Verify mail outcome not recorded; the T-358 clock is not stamped and nothing is deleted',
        );
        return false;
      }
      await new Promise((r) => setTimeout(r, NOTICE_REPORT_BACKOFF_MS * i));
    }
  }
  return false;
}

const UNFILLED_PLACEHOLDER_MESSAGE = 'email has unfilled footer placeholders; not sent';
/** Errors raised by the placeholder guard: rethrown as-is, without the Sentry/log path. */
const placeholderRefusals = new WeakSet<object>();

export function createProcessor(
  send: SendEmailFn = sendEmail,
  mint: MintVerifyLinkFn = mintVerifyLinkViaAuth,
  notice: UnverifiedNoticeDeps = unverifiedNoticeViaAuth,
): Processor<EmailJobData> {
  return async (job: Job<EmailJobData>) => {
    const { template, cc, bcc, replyTo, data } = job.data;
    const userId = userIdFromData(data);
    const jobId = job.id;
    const attempt = job.attemptsMade + 1;
    const isVerify = template === 'auth.verifyEmail';
    const isNotice = template === 'auth.unverifiedDeletionNotice';
    // Both resolve the recipient through auth; the job's cc/bcc/replyTo are never used.
    const userIdOnly = isVerify || isNotice;
    // T-358: which verify-link mail this is, for the outcome report (set once known).
    let mail: VerifyMail | null = isVerify ? 'verify' : null;
    Sentry.addBreadcrumb({
      category: 'email.send.start',
      level: 'info',
      data: {
        jobId,
        queue: job.queueName,
        template,
        userId,
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
        logger.error({ userId, jobId }, 'Email not sent: unfilled footer placeholders');
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
            { jobId, template, userId },
            'Verify email not sent: already verified, Google account or no such user',
          );
          return { skipped: 'not_eligible' };
        }
        to = [minted.email];
        renderData = { name: minted.name, verifyUrl: minted.link, userId };
      }
      if (isNotice) {
        // T-358: address, name, date and link come from auth at send time, never from the job.
        if (!userId) {
          throw new UnrecoverableError('auth.unverifiedDeletionNotice job without a userId');
        }
        const prepared = await notice.prepare(userId);
        if (!prepared) {
          logger.info(
            { jobId, template, userId },
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
          meta: { template, userId, jobId },
        });
      } catch (sendErr) {
        // T-358: a recipient hard bounce of a verify-link mail counts as sent (Ajay). Record it
        // and finish the job; retrying would only bounce again. Any other failure is ours:
        // rethrown, retried, nothing reported.
        if (mail && userId && noticeOutcomeReportable() && isRecipientHardBounce(sendErr)) {
          await reportMailOutcome(notice.report, userId, mail, 'bounced', jobId);
          logger.info({ jobId, template, userId }, 'Hard bounce at send; counted as sent');
          return { skipped: 'hard_bounce' };
        }
        throw sendErr;
      }
      Sentry.addBreadcrumb({
        category: 'email.send.success',
        level: 'info',
        data: { jobId, template, userId, messageId: result.messageId },
      });
      logger.info(
        { jobId, template, userId, queue: job.queueName, messageId: result.messageId },
        'Email sent',
      );
      // T-223 AC7: in dry run, one line with the userId only (no address, token or link).
      if (isVerify && !isLiveSend()) logger.info({ userId }, 'verify email sent');
      if (mail && userId) {
        if (noticeOutcomeReportable()) {
          await reportMailOutcome(notice.report, userId, mail, 'sent', jobId);
        } else {
          // Dry run or a dev redirect: the user got nothing, so the clock does not start.
          logger.info(
            { userId, jobId, mail },
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
        data: { jobId, template, userId, attempt, error: errFields },
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
          tags: { template, queue: job.queueName },
          extra: { jobId, userId, attempt, maxAttempts: job.opts?.attempts ?? 1 },
        });
      }
      logger.error(
        { jobId, template, userId, attempt, finalAttempt, err: errFields },
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
  const processor = createProcessor(options.send, options.mint, options.notice);
  const started: Worker[] = [];
  for (const queueName of [EMAIL_QUEUE_NAMES.high, EMAIL_QUEUE_NAMES.low]) {
    const worker = new Worker<EmailJobData>(queueName, processor, {
      connection,
      concurrency: env.EMAIL_WORKER_CONCURRENCY,
      prefix: `{${env.EMAIL_QUEUE_PREFIX}}`,
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
          template: job?.data.template,
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
