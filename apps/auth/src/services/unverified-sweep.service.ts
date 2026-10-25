/**
 * T-358 — delete email accounts whose address is never verified (Ajay 44326dc, a84e298,
 * 08a0d09 §8, 3f94ce9 §9, 8a2b639 §10 and 9e42eea; Arjun's calls of 14 Oct 2026 in the ticket).
 *
 * Who: "unverified" is NOT_YET_VERIFIED from verify-email.service (emailVerified not true, not
 * a Google account, no googleId), deactivated accounts included, minus any account that already
 * has an `erasure` marker (the T-115c erase sweep owns those), an Admin, or the golden-set user.
 *
 * The clock (Ajay 8a2b639 / 9e42eea): F = firstVerifySentAt, the first CONFIRMED send (or
 * recipient hard bounce) of any email that carries a verify link, or of the notice itself.
 * Stamped once by recordVerifyMailOutcome, the single stamp path for every such email.
 *
 *   first notice   F null (and the account older than FIRST_NOTICE_GRACE_MS, so a fresh
 *                  sign-up's own verify email goes first): the notice is the first email. Its
 *                  confirmed send sets F (via 'notice'). Date shown: now + 30 days.
 *   warning notice F at least 23 days ago and no warning confirmed yet: the notice again (a
 *                  second one when F came from the notice). Its confirmed send sets
 *                  unverifiedNoticeSentAt; F is unchanged. Date shown: the later of F + 30 days
 *                  and now + 7 days.
 *   delete         the IST day of F + 30 days has ended AND the IST day of warning + 7 days has
 *                  ended (so at least 7 days after the warning, and never before the end of the
 *                  day any notice showed). Billing guard (active plan or billing unreachable:
 *                  skip, counted), then a CONDITIONAL lock re-checking all of this in its own
 *                  updateOne (a user who verifies mid-sweep is never locked), then
 *                  runAccountErase, the T-115c path. A partial erase is finished by the T-115c
 *                  sweep. The User document is hard-deleted, the T-358 fields with it.
 *   hold           an account with no F or no confirmed warning is never deleted; counted.
 *
 * Variant (Ajay §9): an active account gets variant A (a verify link lasting 7 days); a
 * deactivated one (isActive false) gets variant B, with no link. Same timing for both.
 *
 * Switch (Arjun): UNVERIFIED_SWEEP_ENABLED, off unless exactly 'true'. While off, every run is
 * read-only: it counts what is due and logs one line (counts only, enabled: false), and it
 * enqueues nothing, calls no billing, locks and erases nothing. The internal prepare/outcome
 * routes are not gated: verify emails and the clock stamps keep working.
 *
 * Hourly plus a run at boot, started from index.ts (also while off, so the counts are visible). Logs carry counts (and a userId only where
 * T-115c already logs one): never an address or a name.
 */
import { enqueueEmail } from '@lawie/email-client';
import { Types } from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import { User, type FirstVerifySentVia } from '../models/User.model';

import {
  fetchSubscriptionStatus,
  GOLDEN_SET_USER_ID,
  lockAccount,
  runAccountErase,
} from './account-erase.service';
import { mintVerifyLink, NOT_YET_VERIFIED } from './verify-email.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Delete this long after the first verify-link email (Ajay 44326dc, 8a2b639). */
export const UNVERIFIED_DELETE_AFTER_DAYS = 30;
/** The warning notice goes out at least this long before deletion (Ajay a84e298). */
export const UNVERIFIED_NOTICE_LEAD_DAYS = 7;
/** So the warning notice is due at F + 23 days. */
export const UNVERIFIED_NOTICE_AFTER_DAYS =
  UNVERIFIED_DELETE_AFTER_DAYS - UNVERIFIED_NOTICE_LEAD_DAYS;
/**
 * An account with no verify email sent yet gets the notice as its first email only once it is
 * this old: a fresh sign-up's own verify email (queued at sign-up) goes out first. Delays a
 * notice, never shortens any period.
 */
export const FIRST_NOTICE_GRACE_MS = DAY_MS;
/** The notice's verify link lasts as long as its promise (Arjun 23:32, Ajay §9). */
export const NOTICE_LINK_TTL_MS = UNVERIFIED_NOTICE_LEAD_DAYS * DAY_MS;

export const UNVERIFIED_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
export const UNVERIFIED_NOTICE_BATCH = 200;
export const UNVERIFIED_DELETE_BATCH = 50;

export const UNVERIFIED_NOTICE_TEMPLATE = 'auth.unverifiedDeletionNotice' as const;

/** Which notice: the one that starts the clock, or the warning before deletion. */
export type NoticeKind = 'first' | 'warning';
/** A: active account, with a verify link. B: deactivated account, no link (Ajay §9). */
export type NoticeVariant = 'A' | 'B';

/** One key per user and notice kind, so the first notice's kept job never swallows the warning. */
export function unverifiedNoticeIdempotencyKey(userId: string, kind: NoticeKind): string {
  return `unverified-notice:${userId}:${kind}`;
}

// ── Dates (IST, no DST: UTC+05:30) ──────────────────────────────────────────

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The instant the IST calendar day containing `d` starts. */
export function istDayStart(d: Date): Date {
  const shifted = d.getTime() + IST_OFFSET_MS;
  return new Date(shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS) - IST_OFFSET_MS);
}

const IST_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/** "21 October 2026": D Month YYYY in IST (Ajay 08a0d09 §8 row 3). */
export function formatIstDate(d: Date): string {
  return IST_DATE_FORMAT.format(d);
}

/**
 * The deletion date a notice sent at `now` states.
 *  first notice (F not set yet): now + 30 days (it starts the clock).
 *  warning notice: the later of F + 30 days and now + 7 days, except (Arjun, review) when F was
 *    set by the notice itself (firstVia 'notice'): then the IST day of F + 30 days, the date the
 *    first notice gave, whenever now + 7 days still falls on or before the end of that IST day.
 *    Sent a little after F + 23 days, now + 7 days can pass F + 30 days by minutes; that must
 *    not move the date the user was already given.
 * Never earlier than the real earliest deletion: deletion waits for the end of the IST day of
 * F + 30 days AND of warning + 7 days, and the warning stamp is written after `now`.
 */
export function noticeDeletionDate(
  kind: NoticeKind,
  now: Date,
  firstSentAt?: Date,
  firstVia?: FirstVerifySentVia,
): Date {
  const byClockFromNow = now.getTime() + UNVERIFIED_DELETE_AFTER_DAYS * DAY_MS;
  if (kind === 'first' || !firstSentAt) return new Date(byClockFromNow);
  const byClock = firstSentAt.getTime() + UNVERIFIED_DELETE_AFTER_DAYS * DAY_MS;
  const byNotice = now.getTime() + UNVERIFIED_NOTICE_LEAD_DAYS * DAY_MS;
  if (firstVia === 'notice') {
    const endOfClockDay = istDayStart(new Date(byClock)).getTime() + DAY_MS;
    if (byNotice <= endOfClockDay) return new Date(byClock);
  }
  return new Date(Math.max(byClock, byNotice));
}

// ── Filters ─────────────────────────────────────────────────────────────────

/**
 * Every account the T-358 rules apply to: unverified (NOT_YET_VERIFIED), not being erased, not
 * an Admin, not the golden-set user. isActive is deliberately not checked (Arjun ruling 5).
 */
export function unverifiedAccountFilter(): Record<string, unknown> {
  return {
    $and: [
      NOT_YET_VERIFIED,
      { erasure: { $exists: false } },
      { role: { $ne: 'Admin' } },
      { _id: { $ne: new Types.ObjectId(GOLDEN_SET_USER_ID) } },
    ],
  };
}

/** No verify-link email confirmed yet, past the sign-up grace: the notice is the first email. */
export function firstNoticeDueFilter(now: Date): Record<string, unknown> {
  return {
    $and: [
      unverifiedAccountFilter(),
      { firstVerifySentAt: null },
      { createdAt: { $lte: new Date(now.getTime() - FIRST_NOTICE_GRACE_MS) } },
    ],
  };
}

/** F at least 23 days ago and no warning notice confirmed: the warning is due. */
export function warningNoticeDueFilter(now: Date): Record<string, unknown> {
  return {
    $and: [
      unverifiedAccountFilter(),
      {
        firstVerifySentAt: {
          $lte: new Date(now.getTime() - UNVERIFIED_NOTICE_AFTER_DAYS * DAY_MS),
        },
      },
      { unverifiedNoticeSentAt: null },
    ],
  };
}

/**
 * Deletable at `now`. With T = start of today in IST: F + 30d < T (the IST day of F + 30 days
 * has ended) and warning + 7d < T (at least 7 days since the warning, and the IST day of the
 * date it showed has ended). `$lt` on a date never matches a missing field, so an account with
 * no F or no warning never matches. Used both to select and, inside the lock, to re-check.
 */
export function deleteDueFilter(now: Date): Record<string, unknown> {
  const todayStart = istDayStart(now).getTime();
  return {
    $and: [
      unverifiedAccountFilter(),
      {
        firstVerifySentAt: {
          $lt: new Date(todayStart - UNVERIFIED_DELETE_AFTER_DAYS * DAY_MS),
        },
      },
      {
        unverifiedNoticeSentAt: {
          $lt: new Date(todayStart - UNVERIFIED_NOTICE_LEAD_DAYS * DAY_MS),
        },
      },
    ],
  };
}

/** Past 30 days on the clock but no warning confirmed: deletion held. */
function heldNoWarningFilter(now: Date): Record<string, unknown> {
  return {
    $and: [
      unverifiedAccountFilter(),
      {
        firstVerifySentAt: {
          $lte: new Date(now.getTime() - UNVERIFIED_DELETE_AFTER_DAYS * DAY_MS),
        },
      },
      { unverifiedNoticeSentAt: null },
    ],
  };
}

// ── Internal routes (called by the email worker) ────────────────────────────

export type PrepareNoticeResult =
  | {
      kind: 'ready';
      notice: NoticeKind;
      variant: NoticeVariant;
      email: string;
      name: string;
      /** Variant A only. Absent for variant B. */
      link?: string;
      deletionDate: string;
    }
  /** Verified, Google, being erased, Admin, or no notice due now: 409, nothing minted. */
  | { kind: 'not_eligible' }
  | { kind: 'not_found' };

/**
 * The notice's data at send time. Decides which notice is due NOW (first or warning; the job
 * does not carry it) and the variant (A active, B deactivated). Variant A gets a fresh verify
 * link lasting 7 days, minted exactly as for the verify email (mintVerifyLink) with the
 * notice's own eligibility in the same atomic write. Variant B gets no link.
 * The result carries PII and a live credential: never log it.
 */
export async function prepareUnverifiedNotice(
  userId: string,
  now: Date = new Date(),
): Promise<PrepareNoticeResult> {
  if (!Types.ObjectId.isValid(userId)) return { kind: 'not_found' };
  const _id = new Types.ObjectId(userId);

  const notEligible = async (): Promise<PrepareNoticeResult> => {
    const exists = await User.exists({ _id });
    const kind = exists ? 'not_eligible' : 'not_found';
    logger.info({ userId, outcome: kind }, 'Unverified notice not prepared');
    return { kind };
  };

  let notice: NoticeKind = 'first';
  let eligibility = firstNoticeDueFilter(now);
  let row = await User.findOne({ _id, ...eligibility })
    .select('email name isActive firstVerifySentAt firstVerifySentVia')
    .lean();
  if (!row) {
    notice = 'warning';
    eligibility = warningNoticeDueFilter(now);
    row = await User.findOne({ _id, ...eligibility })
      .select('email name isActive firstVerifySentAt firstVerifySentVia')
      .lean();
  }
  if (!row) return notEligible();

  const deletionDate = formatIstDate(
    noticeDeletionDate(
      notice,
      now,
      row.firstVerifySentAt ?? undefined,
      row.firstVerifySentVia ?? undefined,
    ),
  );

  if (row.isActive === false) {
    logger.info({ userId, notice, variant: 'B' }, 'Unverified notice prepared');
    return {
      kind: 'ready',
      notice,
      variant: 'B',
      email: row.email,
      name: typeof row.name === 'string' ? row.name : '',
      deletionDate,
    };
  }

  const minted = await mintVerifyLink(userId, {
    eligibility: { $and: [eligibility, { isActive: { $ne: false } }] },
    ttlMs: NOTICE_LINK_TTL_MS,
    // T-522 (Arjun 1; AJ-522-M1(c)): the notice link verifies only; it never signs anyone in.
    linkKind: 'verify',
  });
  if (minted.kind !== 'minted') return notEligible();
  logger.info({ userId, notice, variant: 'A' }, 'Unverified notice prepared');
  return {
    kind: 'ready',
    notice,
    variant: 'A',
    email: minted.email,
    name: minted.name,
    link: minted.link,
    deletionDate,
  };
}

/**
 * Every email that can start the clock. 'verify' covers the T-223 verify email and any resend
 * (and later Kunal's verify:resend-all); 'notice_first' / 'notice_warning' are the T-358
 * notice as prepare returned it.
 */
export type VerifyMail = 'verify' | 'notice_first' | 'notice_warning';
export const VERIFY_MAILS: readonly VerifyMail[] = ['verify', 'notice_first', 'notice_warning'];

/** 'bounced': the recipient's server rejected the address. Counts as sent (Ajay §8 row 4). */
export type MailOutcome = 'sent' | 'bounced';
export const MAIL_OUTCOMES: readonly MailOutcome[] = ['sent', 'bounced'];

export interface VerifyMailOutcomeResult {
  kind: 'recorded' | 'not_found';
  /** firstVerifySentAt was set by this call. */
  firstStamped: boolean;
  /** unverifiedNoticeSentAt was set by this call. */
  warningStamped: boolean;
}

/**
 * THE stamp function for a confirmed send (or recipient hard bounce) of any verify-link email.
 * Both writes are conditional (unverified, not being erased, field still null), so a repeat or
 * late report never moves a date and a verified account is never written.
 *  - Any mail: firstVerifySentAt = now if not set yet (via 'verify' or 'notice').
 *  - notice_warning only: unverifiedNoticeSentAt = now if not set yet and F was already set
 *    before this call (the email that sets F never counts as the warning).
 */
export async function recordVerifyMailOutcome(
  userId: string,
  mail: VerifyMail,
  outcome: MailOutcome,
  now: Date = new Date(),
): Promise<VerifyMailOutcomeResult> {
  const none: VerifyMailOutcomeResult = {
    kind: 'not_found',
    firstStamped: false,
    warningStamped: false,
  };
  if (!Types.ObjectId.isValid(userId)) return none;
  const _id = new Types.ObjectId(userId);

  let warningStamped = false;
  if (mail === 'notice_warning') {
    // Before the F stamp below, so an F written by this same call can never qualify.
    const w = await User.updateOne(
      {
        _id,
        $and: [
          unverifiedAccountFilter(),
          { firstVerifySentAt: { $ne: null } },
          { unverifiedNoticeSentAt: null },
        ],
      },
      { $set: { unverifiedNoticeSentAt: now } },
    );
    warningStamped = w.matchedCount > 0;
  }

  const via: FirstVerifySentVia = mail === 'verify' ? 'verify' : 'notice';
  const f = await User.updateOne(
    { _id, $and: [unverifiedAccountFilter(), { firstVerifySentAt: null }] },
    { $set: { firstVerifySentAt: now, firstVerifySentVia: via } },
  );
  const firstStamped = f.matchedCount > 0;

  if (!firstStamped && !warningStamped && !(await User.exists({ _id }))) return none;
  logger.info({ userId, mail, outcome, firstStamped, warningStamped }, 'Verify mail outcome');
  return { kind: 'recorded', firstStamped, warningStamped };
}

// ── The sweep ───────────────────────────────────────────────────────────────

export interface UnverifiedSweepCounts {
  noticesQueued: number;
  noticesDeduped: number;
  noticeEnqueueFailed: number;
  /** No verify-link email confirmed yet (past the sign-up grace): first notice due. */
  heldNoFirstEmail: number;
  /** Past 30 days on the clock, no warning confirmed: deletion held. */
  heldNoWarning: number;
  /** heldNoFirstEmail + heldNoWarning: due but notice unsent (Arjun ruling 3). */
  dueNoticeUnsent: number;
  /** Switch off only: accounts the delete step would select now (all of them, not one batch). */
  deletionsDue: number;
  deleteFound: number;
  deleted: number;
  /** Locked, erase not finished: the T-115c sweep finishes it. */
  erasePending: number;
  /** The conditional lock matched nothing: verified (or changed) since the select. */
  skippedNoLongerDue: number;
  skippedSubscriptionActive: number;
  skippedBillingUnavailable: number;
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'UnknownError';
}

async function queueNotices(
  now: Date,
  kind: NoticeKind,
  counts: UnverifiedSweepCounts,
): Promise<void> {
  const filter = kind === 'first' ? firstNoticeDueFilter(now) : warningNoticeDueFilter(now);
  const due = await User.find(filter)
    .select('_id')
    .sort({ createdAt: 1 })
    .limit(UNVERIFIED_NOTICE_BATCH)
    .lean();
  for (const u of due) {
    const userId = String(u._id);
    try {
      const res = await enqueueEmail({
        template: UNVERIFIED_NOTICE_TEMPLATE,
        userId,
        idempotencyKey: unverifiedNoticeIdempotencyKey(userId, kind),
      });
      if (res.deduped) counts.noticesDeduped += 1;
      else counts.noticesQueued += 1;
    } catch (err) {
      counts.noticeEnqueueFailed += 1;
      logger.warn({ userId, errName: errName(err) }, 'Unverified notice enqueue failed');
    }
  }
}

async function deleteDue(now: Date, counts: UnverifiedSweepCounts): Promise<void> {
  const due = await User.find(deleteDueFilter(now))
    .select('_id')
    .sort({ firstVerifySentAt: 1 })
    .limit(UNVERIFIED_DELETE_BATCH)
    .lean();
  counts.deleteFound = due.length;
  for (const u of due) {
    const userId = String(u._id);
    // Billing guard (Arjun ruling 6): one check, skip on anything but "no active plan".
    const sub = await fetchSubscriptionStatus(userId);
    if (sub.kind === 'unavailable') {
      counts.skippedBillingUnavailable += 1;
      continue;
    }
    if (sub.active) {
      counts.skippedSubscriptionActive += 1;
      continue;
    }
    // Re-check every condition inside the lock's own write.
    const locked = await lockAccount(userId, { onlyIf: deleteDueFilter(now) });
    if (!locked) {
      counts.skippedNoLongerDue += 1;
      continue;
    }
    const run = await runAccountErase(userId);
    if (run.done) counts.deleted += 1;
    else counts.erasePending += 1;
  }
}

function emptyCounts(): UnverifiedSweepCounts {
  return {
    noticesQueued: 0,
    noticesDeduped: 0,
    noticeEnqueueFailed: 0,
    heldNoFirstEmail: 0,
    heldNoWarning: 0,
    dueNoticeUnsent: 0,
    deletionsDue: 0,
    deleteFound: 0,
    deleted: 0,
    erasePending: 0,
    skippedNoLongerDue: 0,
    skippedSubscriptionActive: 0,
    skippedBillingUnavailable: 0,
  };
}

/**
 * Switch off: count only. Reads (countDocuments) and one log line; never enqueues, never calls
 * billing, never locks or erases. Never throws.
 */
async function countOnly(now: Date): Promise<UnverifiedSweepCounts> {
  const counts = emptyCounts();
  try {
    counts.heldNoFirstEmail = await User.countDocuments(firstNoticeDueFilter(now));
    counts.heldNoWarning = await User.countDocuments(heldNoWarningFilter(now));
    counts.dueNoticeUnsent = counts.heldNoFirstEmail + counts.heldNoWarning;
    counts.deletionsDue = await User.countDocuments(deleteDueFilter(now));
  } catch (err) {
    logger.warn({ errName: errName(err), enabled: false }, 'Unverified sweep: count failed');
  }
  const summary = {
    enabled: false,
    heldNoFirstEmail: counts.heldNoFirstEmail,
    heldNoWarning: counts.heldNoWarning,
    dueNoticeUnsent: counts.dueNoticeUnsent,
    deletionsDue: counts.deletionsDue,
  };
  const msg = 'Unverified account sweep off (UNVERIFIED_SWEEP_ENABLED): counts only';
  if (counts.dueNoticeUnsent > 0 || counts.deletionsDue > 0) logger.warn(summary, msg);
  else logger.info(summary, msg);
  return counts;
}

/**
 * One run. Switch on: queue due notices, delete due accounts, count held ones. Switch off:
 * count only (see countOnly). `opts.enabled` overrides UNVERIFIED_SWEEP_ENABLED (tests, scripts).
 * Never throws.
 */
export async function runUnverifiedSweep(
  now: Date = new Date(),
  opts: { enabled?: boolean } = {},
): Promise<UnverifiedSweepCounts> {
  const enabled = opts.enabled ?? env.UNVERIFIED_SWEEP_ENABLED;
  if (!enabled) return countOnly(now);
  const counts = emptyCounts();
  for (const kind of ['first', 'warning'] as const) {
    try {
      await queueNotices(now, kind, counts);
    } catch (err) {
      logger.warn({ errName: errName(err), notice: kind }, 'Unverified sweep: notice step failed');
    }
  }
  try {
    await deleteDue(now, counts);
  } catch (err) {
    logger.warn({ errName: errName(err) }, 'Unverified sweep: delete step failed');
  }
  try {
    counts.heldNoFirstEmail = await User.countDocuments(firstNoticeDueFilter(now));
    counts.heldNoWarning = await User.countDocuments(heldNoWarningFilter(now));
    counts.dueNoticeUnsent = counts.heldNoFirstEmail + counts.heldNoWarning;
  } catch (err) {
    logger.warn({ errName: errName(err) }, 'Unverified sweep: held count failed');
  }
  if (counts.dueNoticeUnsent > 0) {
    logger.warn(
      {
        dueNoticeUnsent: counts.dueNoticeUnsent,
        heldNoFirstEmail: counts.heldNoFirstEmail,
        heldNoWarning: counts.heldNoWarning,
      },
      'Unverified accounts held: notice not sent yet',
    );
  }
  if (Object.values(counts).some((n) => n > 0)) logger.info(counts, 'Unverified account sweep');
  return counts;
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

function sweepTick(): void {
  if (sweepRunning) return;
  sweepRunning = true;
  runUnverifiedSweep()
    .catch(() => undefined)
    .finally(() => {
      sweepRunning = false;
    });
}

/**
 * Start the sweep: one run now, then every `intervalMs` (hourly). Started from index.ts, never
 * from app.ts (the tests import app). Unref'd; a second call is a no-op; runs never overlap.
 */
export function startUnverifiedSweep(intervalMs: number = UNVERIFIED_SWEEP_INTERVAL_MS): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepTick, intervalMs);
  sweepTimer.unref();
  sweepTick();
}

/** Stop the sweep. Safe to call when it is not running. */
export function stopUnverifiedSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}
