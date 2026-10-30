/**
 * T-115c — erase what billing holds for one user, per Ajay's signed decisions
 * on the erase runbook (T-235-erase-runbook.md step 3, 6941007) and Arjun's
 * revised design (step 3 of "Account close, in order").
 *
 *   couponusages   delete by userId (Ajay: delete; it resets the per-user
 *                  coupon limit, which is fine for an erased account)
 *   inkledger      delete usage rows (INK_USAGE_REASONS); keep every other
 *                  row as the payment / grant record. On the grant rows that
 *                  carry free text (INK_SCRUB_REASONS) `reference` and
 *                  `metadata` are unset, leaving type, amount and date
 *                  (Ajay 8067679)
 *   creditledgers  usage rows (CREDIT_USAGE_SOURCES): `reference` unset (it
 *                  can hold a draft title); the rows themselves are kept
 *   subscriptions  kept as they are (ids and amounts only)
 *   payments       kept as they are (T-646: ids, amounts, statuses, dates only)
 *   paymentconcerns T-646 (Arjun ruling 5): the customer's free-text `note` is
 *                  unset; the row (reason code, status, reference, dates) is kept
 *
 * Kept rows keep `userId` as an opaque reference: auth hard-deletes the User
 * document last, so nothing billing-side needs rewriting for that.
 *
 * Idempotent: a second run finds no usage rows in inkledger, no reference or
 * metadata on the scrubbed grant rows, no references on the creditledgers usage
 * rows and no couponusages, and returns zero counts.
 * `dryRun` runs the same filters as counts and changes nothing.
 *
 * Logs hold the userId, the step, `err.name` and counts only.
 */
import mongoose, { Types } from 'mongoose';

import logger from '../config/logger';
import { CouponUsage } from '../models/CouponUsage.model';

/**
 * inkledger `reason` values that are usage (Ink spent on a draft): deleted.
 *
 * Every other reason is kept. The reasons found in the code on 14 Oct 2026:
 *   generate, regenerate  usage (billing ink-ledger.service deductInk,
 *                         drafting credits.service)          -> DELETE
 *   topup_purchase        paid top-up (billing)              -> keep (payment)
 *   sub_renewal           paid plan renewal grant (billing)  -> keep (payment)
 *   sub_drip              yearly plan monthly drip (shared yearly-drip) -> keep (payment)
 *   sub_expired           plan period ended (shared yearly-drip)        -> keep (plan record)
 *   sub_cancelled         plan Ink zeroed (billing)          -> keep (plan record)
 *   free_seed             free 5 Ink on verify (auth, billing) -> keep (grant, no payment)
 *   admin_grant           founder hand grant (drafting admin; `reference` and
 *                         `metadata.note` are the admin's free text)   -> keep, scrubbed
 *   referral_bonus        (as above; `reference` and `metadata` hold the referral
 *                         code)                                         -> keep, scrubbed
 *   refund_reversal       T-646: Ink taken back by a refund (billing; ids and
 *                         numbers only)                                 -> keep (payment)
 * An unknown reason is kept: this delete only ever removes rows known to be usage.
 */
export const INK_USAGE_REASONS = ['generate', 'regenerate'] as const;

/**
 * Kept inkledger rows whose `reference` / `metadata` carry free text: both fields
 * are unset, the row keeps its reason, delta, bucket, balance and date (Ajay 8067679).
 */
export const INK_SCRUB_REASONS = ['admin_grant', 'referral_bonus'] as const;

/**
 * creditledgers `source` values that are usage: `reference` is unset (it holds
 * the draft title, e.g. "Bail u/s 437"); the row is kept. Other sources
 * (signup_bonus, login_bonus, rating_bonus, plan_renewal, topup_purchase,
 * admin_grant, plan_lapsed, admin_revoke) are not usage and are left as they are.
 */
export const CREDIT_USAGE_SOURCES = ['draft_spent'] as const;

export type BillingEraseStep =
  | 'couponusages'
  | 'inkledger'
  | 'inkledger_scrubbed'
  | 'creditledgers'
  | 'paymentconcerns';

export interface BillingEraseResult {
  ok: boolean;
  dryRun: boolean;
  /**
   * couponusages, inkledger: rows deleted. inkledger_scrubbed: grant rows whose
   * reference/metadata were unset. creditledgers: rows whose `reference` was
   * unset. paymentconcerns (T-646): concerns whose `note` was unset. On a dry
   * run, the rows that would be.
   */
  counts: Partial<Record<BillingEraseStep, number>>;
  failedAt?: BillingEraseStep;
}

/**
 * Erase (or count, on a dry run) what billing holds for one user. Never
 * throws: a failed step stops the run and is reported, and the caller
 * retries. The route validates the userId.
 */
export async function eraseBillingAccount(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<BillingEraseResult> {
  const { userId } = input;
  const dryRun = input.dryRun === true;
  const counts: BillingEraseResult['counts'] = {};
  let step: BillingEraseStep = 'couponusages';

  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no database connection');
    if (!Types.ObjectId.isValid(userId)) throw new TypeError('invalid userId');
    const uid = new Types.ObjectId(userId);

    step = 'couponusages';
    const couponFilter = { userId: uid };
    counts.couponusages = dryRun
      ? await CouponUsage.countDocuments(couponFilter)
      : (await CouponUsage.deleteMany(couponFilter)).deletedCount;

    step = 'inkledger';
    const inkFilter = { userId: uid, reason: { $in: [...INK_USAGE_REASONS] } };
    const ink = db.collection('inkledger');
    counts.inkledger = dryRun
      ? await ink.countDocuments(inkFilter)
      : (await ink.deleteMany(inkFilter)).deletedCount;

    step = 'inkledger_scrubbed';
    const scrubFilter = {
      userId: uid,
      reason: { $in: [...INK_SCRUB_REASONS] },
      $or: [{ reference: { $exists: true } }, { metadata: { $exists: true } }],
    };
    counts.inkledger_scrubbed = dryRun
      ? await ink.countDocuments(scrubFilter)
      : (await ink.updateMany(scrubFilter, { $unset: { reference: '', metadata: '' } }))
          .modifiedCount;

    step = 'creditledgers';
    const creditFilter = {
      userId: uid,
      source: { $in: [...CREDIT_USAGE_SOURCES] },
      reference: { $exists: true },
    };
    const credit = db.collection('creditledgers');
    counts.creditledgers = dryRun
      ? await credit.countDocuments(creditFilter)
      : (await credit.updateMany(creditFilter, { $unset: { reference: '' } })).modifiedCount;

    // T-646 (Arjun ruling 5): the concern note is the only free text a concern holds.
    step = 'paymentconcerns';
    const concernFilter = { userId: uid, note: { $exists: true } };
    const concerns = db.collection('paymentconcerns');
    counts.paymentconcerns = dryRun
      ? await concerns.countDocuments(concernFilter)
      : (await concerns.updateMany(concernFilter, { $unset: { note: '' } })).modifiedCount;
  } catch (err) {
    logger.warn(
      {
        userId,
        dryRun,
        step,
        errName: err instanceof Error ? err.name : 'UnknownError',
        counts,
      },
      'Account erase step failed (billing); the caller retries',
    );
    return { ok: false, dryRun, counts, failedAt: step };
  }

  logger.info(
    { userId, dryRun, counts },
    dryRun ? 'Account erase dry run (billing)' : 'Account erased (billing)',
  );
  return { ok: true, dryRun, counts };
}

// ── Subscription status, for auth's close-account gate (Arjun, T-115c ruling 4) ──

/**
 * The one place the close-account gate's statuses live.
 *   blocking: a subscription in one of these blocks closing the account
 *   allowed:  closing is allowed ('none' = the user has no subscription)
 * A status in neither list (one Razorpay adds later) blocks: fail closed.
 */
export const SUBSCRIPTION_CLOSE_GATE = {
  blocking: ['active', 'authenticated', 'pending', 'halted', 'paused'],
  allowed: ['created', 'cancelled', 'completed', 'expired', 'none'],
} as const;

export interface SubscriptionStatusResult {
  active: boolean;
  /** The relevant subscription's status, or 'none'. */
  status: string;
}

/**
 * `active` is true when any of the user's subscriptions is not in the
 * allowed list. `status` is the latest such blocking subscription's status;
 * when nothing blocks, the latest subscription's status; 'none' when the
 * user has no subscription.
 */
export async function subscriptionStatusFor(userId: string): Promise<SubscriptionStatusResult> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no database connection');
  const subs = await db
    .collection<{ status?: unknown }>('subscriptions')
    .find({ userId: new Types.ObjectId(userId) }, { projection: { status: 1 } })
    .sort({ createdAt: -1, _id: -1 })
    .toArray();
  if (subs.length === 0) return { active: false, status: 'none' };

  const allowed: readonly string[] = SUBSCRIPTION_CLOSE_GATE.allowed;
  const statusOf = (s: { status?: unknown }): string =>
    typeof s.status === 'string' ? s.status : 'unknown';
  const blocking = subs.find((s) => !allowed.includes(statusOf(s)));
  if (blocking) return { active: true, status: statusOf(blocking) };
  return { active: false, status: statusOf(subs[0]) };
}
