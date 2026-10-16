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
 *   reads grant a month once. The ledger `reference`
 *   `sub_drip:<subId>:<cycle>:<n>` is for audit only (no unique index yet;
 *   T-409). `cycle` is the Subscription's lastGrantedPaidCount, else its
 *   lastGrantedPeriodStart (unix seconds), so each paid year's keys differ.
 * - Drip dates are `inkDripAnchor` (the paid period's start) + n months, each
 *   clamped to the month's end, so a 31st start does not drift. A Subscription
 *   without an anchor chains one month from the previous date instead.
 * - Cancel stops renewal, not the drip (Ajay, T-399-yearly-cancel-signed.md):
 *   a cancelled plan drips until `paidThrough`.
 * - After `paidThrough`, a cancelled, halted, paused, completed or expired plan
 *   is zeroed and downgraded to free here too, in case the
 *   `subscription.expired` webhook never arrives (T-444).
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

/**
 * T-444: statuses that keep access until the paid period ends, then expire
 * here. Halted, paused and pending drip nothing (the drip query is
 * active/cancelled/completed); cancelled and completed drip until paidThrough.
 */
const PAID_THROUGH_STATUSES = ['cancelled', 'halted', 'paused', 'completed'];
/** T-444: statuses the lazy expiry downgrades once the paid period is over. */
const ENDED_STATUSES = [...PAID_THROUGH_STATUSES, 'expired'];
/**
 * T-444 review fix: a pending sub keeps access on paidThrough only (never the
 * currentPeriodEnd fallback) and expires lazily at paidThrough like halted.
 */
const PENDING = 'pending';

/** Drips after the yearly charge: 11, so 12 monthly grants per paid year. */
export const YEARLY_DRIP_MAX = 11;

export interface SettleYearlyDripResult {
  /** Monthly drips granted by this call. */
  granted: number;
  /** True if this call zeroed and downgraded a plan past its paid period. */
  expired: boolean;
}

/** `months` calendar months later (UTC), clamped to the last day of a short month. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** One calendar month later (UTC), clamped to the last day of a short month. */
export function addOneMonth(date: Date): Date {
  return addMonths(date, 1);
}

/**
 * The drip date after drip `count` (1–11) has been granted: anchor + (count + 1)
 * months when the Subscription has an anchor, else one month after `prev`.
 */
export function nextDripAt(anchor: Date | null, count: number, prev: Date): Date {
  return anchor ? addMonths(anchor, count + 1) : addOneMonth(prev);
}

/** The paid cycle a drip belongs to, for the ledger reference. */
function dripCycle(sub: Doc): string {
  if (typeof sub.lastGrantedPaidCount === 'number') return String(sub.lastGrantedPaidCount);
  const periodStart = asDate(sub.lastGrantedPeriodStart) ?? asDate(sub.inkDripAnchor);
  return periodStart ? String(Math.floor(periodStart.getTime() / 1000)) : 'none';
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

  // ── Drip: a yearly plan still inside its paid year (active, cancelled, completed) ──
  const sub = await subs.findOne(
    {
      userId,
      billingCycle: 'yearly',
      // T-444 (Arjun): completed is paid in full, so it drips until paidThrough.
      // halted, paused and pending drip nothing.
      status: { $in: ['active', 'cancelled', 'completed'] },
      paidThrough: { $gte: now },
    },
    { sort: { createdAt: -1 } },
  );
  const units = sub ? dripUnitsFor(sub.planId) : undefined;
  if (sub && units !== undefined && typeof sub.inkDripCount === 'number') {
    let n = sub.inkDripCount;
    let nextAt = asDate(sub.inkDripNextAt);
    const anchor = asDate(sub.inkDripAnchor);
    const cycle = dripCycle(sub);
    while (nextAt && nextAt <= now && n < YEARLY_DRIP_MAX) {
      const following = nextDripAt(anchor, n + 1, nextAt);
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
        reference: `sub_drip:${String(sub.razorpaySubscriptionId)}:${cycle}:${n}`,
        metadata: {
          razorpaySubscriptionId: sub.razorpaySubscriptionId,
          planId: sub.planId,
          cycle,
          dripNumber: n,
        },
        createdAt: new Date(),
      });
    }
    return result;
  }

  // ── Lazy expiry: an ended plan past its paid period ──────────────────────
  // T-444 (Arjun ruling 1): paidThrough, else currentPeriodEnd; with neither,
  // the paid period is over (never keep Pro on a sub not proven paid).
  const ended = await subs.findOne({
    userId,
    $or: [
      { status: { $in: ENDED_STATUSES }, paidThrough: { $lt: now } },
      { status: { $in: ENDED_STATUSES }, paidThrough: null, currentPeriodEnd: { $lt: now } },
      { status: { $in: ENDED_STATUSES }, paidThrough: null, currentPeriodEnd: null },
      { status: PENDING, paidThrough: { $lt: now } },
      { status: PENDING, paidThrough: null, currentPeriodEnd: { $lt: now } },
      { status: PENDING, paidThrough: null, currentPeriodEnd: null },
    ],
  });
  if (!ended) return result;

  // Same guard as the expiry webhook: keep the plan if another sub still runs.
  const current = await subs.findOne({
    userId,
    $or: [
      { status: 'active' },
      { status: { $in: PAID_THROUGH_STATUSES }, paidThrough: { $gte: now } },
      {
        status: { $in: PAID_THROUGH_STATUSES },
        paidThrough: null,
        currentPeriodEnd: { $gte: now },
      },
      { status: PENDING, paidThrough: { $gte: now } },
    ],
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
