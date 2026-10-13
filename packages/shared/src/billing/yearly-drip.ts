/**
 * T-399: lazy monthly Ink drip for yearly plans (Arjun's design, ticket
 * handoff/tickets/T-399-yearly-plans-monthly-ink.md).
 *
 * A yearly Razorpay subscription is charged once a year. The charge webhook
 * (billing) grants month 1 and sets `inkDripNextAt` = charge + 1 month and
 * `inkDripCount` = 0. Every balance read and every hold calls this function,
 * which grants each month that has come due since, up to 11 drips (12 grants a
 * year with the charge). No scheduler.
 *
 * - Each drip follows the monthly reset rule: inkSub is SET to the allotment
 *   (no rollover); inkAnnualCarry is left alone.
 * - Idempotency is a compare-and-set on the Subscription's inkDripCount. Only
 *   the caller whose CAS wins grants and writes the ledger row, so concurrent
 *   reads grant a month once. The ledger `reference` `sub_drip:<subId>:<n>` is
 *   for audit only (no unique index yet; follow-up ticket).
 * - Cancel stops renewal, not the drip (Ajay, T-399-yearly-cancel-signed.md):
 *   a cancelled plan drips until `paidThrough`.
 * - After `paidThrough`, a cancelled or expired plan is zeroed and downgraded to
 *   free here too, in case the `subscription.expired` webhook never arrives.
 *   Conditional update, so a second call does nothing.
 *
 * Works on the raw collections (`users`, `subscriptions`, `inkledger`) through a
 * structural `db` type, so this package needs neither mongoose nor mongodb.
 * Callers pass `mongoose.connection.db` and the user's `_id` as stored (an
 * ObjectId). Errors are thrown; callers log them and carry on.
 */
import { INK_PER_CYCLE, INK_UNITS_PER_INK } from '../constants/ink';

type Doc = Record<string, unknown>;

/** The subset of a MongoDB driver collection this module uses. */
export interface InkDripCollection {
  findOne(filter: Doc, options?: { sort?: Record<string, 1 | -1> }): Promise<Doc | null>;
  findOneAndUpdate(
    filter: Doc,
    update: Doc,
    options: { returnDocument: 'before' | 'after' },
  ): Promise<Doc | null>;
  insertOne(doc: Doc): Promise<unknown>;
}

/** The subset of a MongoDB driver `Db` this module uses. */
export interface InkDripDb {
  collection(name: string): InkDripCollection;
}

export const INK_DRIP_COLLECTIONS = {
  users: 'users',
  subscriptions: 'subscriptions',
  ledger: 'inkledger',
} as const;

/** Drips after the yearly charge: 11, so 12 monthly grants per paid year. */
export const YEARLY_DRIP_MAX = 11;

export interface SettleYearlyDripResult {
  /** Monthly drips granted by this call. */
  granted: number;
  /** True if this call zeroed and downgraded a plan past its paid period. */
  expired: boolean;
}

/** One calendar month later (UTC), clamped to the last day of a short month. */
export function addOneMonth(date: Date): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function asDate(v: unknown): Date | null {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v : null;
}

function asNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function dripUnitsFor(planId: unknown): number | undefined {
  if (typeof planId !== 'string' || !Object.prototype.hasOwnProperty.call(INK_PER_CYCLE, planId)) {
    return undefined;
  }
  return INK_PER_CYCLE[planId as keyof typeof INK_PER_CYCLE] * INK_UNITS_PER_INK;
}

function totalUnits(user: Doc): number {
  return asNumber(user.inkSub) + asNumber(user.inkAnnualCarry) + asNumber(user.inkTopup);
}

export async function settleYearlyDrip(input: {
  db: InkDripDb;
  userId: unknown;
  now?: Date;
}): Promise<SettleYearlyDripResult> {
  const { db, userId } = input;
  const now = input.now ?? new Date();
  const subs = db.collection(INK_DRIP_COLLECTIONS.subscriptions);
  const users = db.collection(INK_DRIP_COLLECTIONS.users);
  const ledger = db.collection(INK_DRIP_COLLECTIONS.ledger);
  const result: SettleYearlyDripResult = { granted: 0, expired: false };

  // ── Drip: a yearly plan still inside its paid year (active or cancelled) ──
  const sub = await subs.findOne(
    {
      userId,
      billingCycle: 'yearly',
      status: { $in: ['active', 'cancelled'] },
      paidThrough: { $gte: now },
    },
    { sort: { createdAt: -1 } },
  );
  const units = sub ? dripUnitsFor(sub.planId) : undefined;
  if (sub && units !== undefined && typeof sub.inkDripCount === 'number') {
    let n = sub.inkDripCount;
    let nextAt = asDate(sub.inkDripNextAt);
    while (nextAt && nextAt <= now && n < YEARLY_DRIP_MAX) {
      const following = addOneMonth(nextAt);
      const won = await subs.findOneAndUpdate(
        { _id: sub._id, inkDripCount: n, inkDripNextAt: { $lte: now } },
        { $inc: { inkDripCount: 1 }, $set: { inkDripNextAt: following } },
        { returnDocument: 'after' },
      );
      // Lost the CAS: another caller took month n and grants it.
      if (!won) break;
      n += 1;
      nextAt = following;

      // Monthly reset rule, as billing's grantSubscriptionInk monthly path.
      const user = await users.findOneAndUpdate(
        { _id: userId },
        { $set: { inkSub: units, inkSubMonthlyAllotment: units } },
        { returnDocument: 'after' },
      );
      if (!user) break;
      result.granted += 1;

      await ledger.insertOne({
        userId,
        delta: units,
        reason: 'sub_drip',
        sourceBucket: 'sub',
        balanceAfter: totalUnits(user),
        reference: `sub_drip:${String(sub.razorpaySubscriptionId)}:${n}`,
        metadata: {
          razorpaySubscriptionId: sub.razorpaySubscriptionId,
          planId: sub.planId,
          dripNumber: n,
        },
        createdAt: new Date(),
      });
    }
    return result;
  }

  // ── Lazy expiry: a cancelled/expired plan past its paid period ────────────
  const ended = await subs.findOne({
    userId,
    status: { $in: ['cancelled', 'expired'] },
    paidThrough: { $lt: now },
  });
  if (!ended) return result;

  // Same guard as the expiry webhook: keep the plan if another sub still runs.
  const current = await subs.findOne({
    userId,
    $or: [{ status: 'active' }, { status: 'cancelled', paidThrough: { $gte: now } }],
  });
  if (current) return result;

  const zeroed = await users.findOneAndUpdate(
    {
      _id: userId,
      $or: [{ plan: { $ne: 'free' } }, { inkSub: { $gt: 0 } }, { inkAnnualCarry: { $gt: 0 } }],
    },
    {
      $set: {
        plan: 'free',
        planTier: 'free',
        billingCycle: 'none',
        inkSub: 0,
        inkAnnualCarry: 0,
      },
    },
    { returnDocument: 'after' },
  );
  if (!zeroed) return result;
  result.expired = true;

  await ledger.insertOne({
    userId,
    delta: 0,
    reason: 'sub_expired',
    sourceBucket: 'sub',
    balanceAfter: totalUnits(zeroed),
    reference: `sub_expired:${String(ended.razorpaySubscriptionId)}`,
    createdAt: new Date(),
  });
  return result;
}
