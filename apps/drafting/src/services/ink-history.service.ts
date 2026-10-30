/**
 * T-646 — Ink history for one signed-in user (Arjun: drafting serves it,
 * billing serves payments; the web makes two calls).
 *
 * Source: the `inkledger` collection only (1 Ink = 2 storage units). The
 * stored `balanceAfter` is never used (the writers disagree on what it holds);
 * the running balance is computed here.
 *
 * Window (Arjun, T-646 b): the last 90 days or 500 rows, whichever is smaller.
 * Anchor: the user's per-bucket balances now, plus the units of open holds
 * (debited, no ledger row yet), walked back row by row to the window start. A
 * bucket that a window row SETS (plan reset: sub; plan end: sub and carry) has
 * no recoverable earlier value, so for that bucket only the start is rebuilt
 * forward from the older rows: from the last older row that set it, plus every
 * older change to it since. The window is then replayed forward from that start.
 *
 * Replay rules (they mirror what each writer does to the user's buckets):
 *   - `sub_renewal`, `sub_drip`: the plan bucket is SET to the grant
 *     (`$set inkSub`), not added to. Any plan Ink left from before ends at that
 *     moment, so a separate `other` entry (label `plan_ink_ended`) shows it
 *     going, then the grant shows as `plan`.
 *   - `sub_cancelled`, `sub_expired`: written with delta 0 but they zero the
 *     plan and carry buckets; shown as one `other` entry for what was removed.
 *   - `refund_reversal` (billing, T-646): one row whose debit may span buckets; the split is in
 *     `metadata.buckets` and is replayed per bucket. A claim still `pending` has delta 0.
 *   - every other row adds its delta to its `sourceBucket`, never below zero.
 *
 * Usage rows (`generate`, `regenerate`) of one run are written together, one
 * per bucket; consecutive usage rows with the same runId are one entry. The
 * title comes from runId → Generation.documentId → Document {title} (or the
 * Document's own runId); never any document content. A run whose document no
 * longer exists shows `documentDeleted: true`. Titles never go in logs.
 *
 * Not included: legacy `creditledgers` rows. They go to `earnedCredits`, which
 * is not Ink: nothing spends it and the Ink balance does not include it.
 */
import mongoose from 'mongoose';

import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';

import { getCreditBalance } from './credits.service';
import { isFixtureUser } from './run-origin';

const INK_LEDGER_COLLECTION = 'inkledger';
const UNITS_PER_INK = 2;

export const INK_HISTORY_DEFAULT_LIMIT = 20;
/** Arjun (T-646 b): replay the last 90 days or 500 ledger rows, whichever is smaller. */
export const INK_HISTORY_WINDOW_DAYS = 90;
export const INK_HISTORY_MAX_LIMIT = 100;
export const INK_HISTORY_MAX_ROWS = 500;

const ROW_PROJECTION = {
  delta: 1,
  reason: 1,
  sourceBucket: 1,
  runId: 1,
  createdAt: 1,
  'metadata.buckets': 1,
} as const;

export type InkHistoryKind = 'purchase' | 'plan' | 'grant' | 'usage' | 'refund_reversal' | 'other';

/**
 * `label` is a stable code, not display text: the web maps it to its signed
 * copy (components/billing/paymentCopy.ts).
 */
export type InkHistoryLabel =
  | 'topup'
  | 'plan'
  | 'plan_ink_ended'
  | 'plan_ended'
  | 'signup'
  | 'referral'
  | 'coupon'
  | 'admin_grant'
  | 'test_grant'
  | 'draft'
  | 'refund_reversal'
  | 'other';

export interface InkHistoryEntry {
  id: string;
  createdAt: string;
  kind: InkHistoryKind;
  label: InkHistoryLabel;
  /** Ink, signed (may end in .5). */
  inkDelta: number;
  /** Ink balance after this entry, computed from the ledger. */
  balanceAfter: number;
  documentTitle: string | null;
  documentDeleted: boolean;
}

export interface InkHistoryPage {
  entries: InkHistoryEntry[];
  /** Current Ink balance (as GET /credits/balance totalInk). */
  balance: number;
  /** Pass as `cursor` for the next (older) page; null when there is none. */
  nextCursor: string | null;
}

export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid cursor');
    this.name = 'InvalidCursorError';
  }
}

type Bucket = 'sub' | 'annual_carry' | 'topup';

interface LedgerRow {
  _id: unknown;
  delta?: unknown;
  metadata?: unknown;
  reason?: unknown;
  sourceBucket?: unknown;
  runId?: unknown;
  createdAt?: unknown;
}

interface Draft {
  id: string;
  createdAt: Date;
  kind: InkHistoryKind;
  label: InkHistoryLabel;
  deltaUnits: number;
  balanceUnits: number;
  runId: string | null;
}

const USAGE_REASONS = new Set(['generate', 'regenerate']);
const PLAN_RESET_REASONS = new Set(['sub_renewal', 'sub_drip']);
const PLAN_END_REASONS = new Set(['sub_cancelled', 'sub_expired']);

function classify(
  reason: string,
  isTestAccount: boolean,
): { kind: InkHistoryKind; label: InkHistoryLabel } {
  switch (reason) {
    case 'topup_purchase':
      return { kind: 'purchase', label: 'topup' };
    case 'sub_renewal':
    case 'sub_drip':
      return { kind: 'plan', label: 'plan' };
    case 'free_seed':
      return { kind: 'grant', label: 'signup' };
    case 'referral_bonus':
      return { kind: 'grant', label: 'referral' };
    case 'coupon_grant':
      return { kind: 'grant', label: 'coupon' };
    case 'admin_grant':
      return { kind: 'grant', label: 'admin_grant' };
    case 'test_grant':
      // AJ-646-M8, AJ-646-M11 (1f07122c) condition (2): "Test Ink" only on a test or fixture
      // account: a T-563 test account (users.isTestAccount === true) or the T-147e golden-set
      // fixture user (run-origin isFixtureUser). grantTestInk writes this reason only for a test
      // account, but if the flag is ever cleared the row stays: a real user then sees the
      // neutral admin-grant label.
      return { kind: 'grant', label: isTestAccount ? 'test_grant' : 'admin_grant' };
    case 'generate':
    case 'regenerate':
      return { kind: 'usage', label: 'draft' };
    case 'refund_reversal':
      return { kind: 'refund_reversal', label: 'refund_reversal' };
    default:
      return { kind: 'other', label: 'other' };
  }
}

function asBucket(v: unknown): Bucket {
  return v === 'sub' || v === 'annual_carry' ? v : 'topup';
}

function asUnits(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** metadata.buckets of a multi-bucket debit ({ sub, annual_carry, topup } units), or null. */
function bucketSplit(metadata: unknown): Record<Bucket, number> | null {
  const m = metadata as { buckets?: unknown } | null | undefined;
  const raw =
    m && typeof m === 'object' ? (m.buckets as Record<string, unknown> | undefined) : undefined;
  if (!raw || typeof raw !== 'object') return null;
  const pick = (k: string) => Math.max(0, asUnits(raw[k]));
  return { sub: pick('sub'), annual_carry: pick('annual_carry'), topup: pick('topup') };
}

function asDate(v: unknown): Date {
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

/**
 * Replays the rows (oldest first) into display entries, oldest first, each
 * with its running balance in units. Pure: exported for tests.
 */
export function replayInkLedger(
  rows: readonly LedgerRow[],
  opts: { start?: Record<Bucket, number>; isTestAccount?: boolean } = {},
): Draft[] {
  const b: Record<Bucket, number> = { sub: 0, annual_carry: 0, topup: 0, ...opts.start };
  const total = (): number => b.sub + b.annual_carry + b.topup;
  const out: Draft[] = [];

  for (const row of rows) {
    const id = String(row._id);
    const createdAt = asDate(row.createdAt);
    const reason = typeof row.reason === 'string' ? row.reason : '';
    const delta = asUnits(row.delta);
    const { kind, label } = classify(reason, opts.isTestAccount === true);

    if (PLAN_RESET_REASONS.has(reason)) {
      const grant = Math.max(0, delta);
      if (b.sub > 0) {
        const ended = b.sub;
        b.sub = 0;
        out.push({
          id: `${id}-ended`,
          createdAt,
          kind: 'other',
          label: 'plan_ink_ended',
          deltaUnits: -ended,
          balanceUnits: total(),
          runId: null,
        });
      }
      b.sub = grant;
      if (grant > 0) {
        out.push({
          id,
          createdAt,
          kind,
          label,
          deltaUnits: grant,
          balanceUnits: total(),
          runId: null,
        });
      }
      continue;
    }

    if (PLAN_END_REASONS.has(reason)) {
      const removed = b.sub + b.annual_carry;
      b.sub = 0;
      b.annual_carry = 0;
      if (removed > 0) {
        out.push({
          id,
          createdAt,
          kind: 'other',
          label: 'plan_ended',
          deltaUnits: -removed,
          balanceUnits: total(),
          runId: null,
        });
      }
      continue;
    }

    let applied = 0;
    const split = bucketSplit(row.metadata);
    if (split && delta < 0) {
      // Billing records the units taken from each bucket (positive numbers).
      for (const k of ['sub', 'annual_carry', 'topup'] as const) {
        const before = b[k];
        b[k] = Math.max(0, before - split[k]);
        applied += b[k] - before;
      }
    } else {
      const bucket = asBucket(row.sourceBucket);
      const before = b[bucket];
      b[bucket] = Math.max(0, before + delta);
      applied = b[bucket] - before;
    }
    // A row that moved nothing (zero delta, or a debit of an already-empty bucket) is not shown.
    if (applied === 0) continue;

    const runId = typeof row.runId === 'string' && row.runId !== '' ? row.runId : null;
    const last = out[out.length - 1];
    if (
      USAGE_REASONS.has(reason) &&
      runId !== null &&
      last !== undefined &&
      last.kind === 'usage' &&
      last.runId === runId
    ) {
      last.deltaUnits += applied;
      last.balanceUnits = total();
      if (createdAt > last.createdAt) last.createdAt = createdAt;
      continue;
    }

    out.push({ id, createdAt, kind, label, deltaUnits: applied, balanceUnits: total(), runId });
  }

  return out;
}

const BUCKETS: readonly Bucket[] = ['sub', 'annual_carry', 'topup'];

/** Current bucket units plus the units each open hold took (no ledger row exists for them yet). */
export function currentBucketsWithHolds(user: Record<string, unknown>): Record<Bucket, number> {
  const b: Record<Bucket, number> = {
    sub: Math.max(0, asUnits(user.inkSub)),
    annual_carry: Math.max(0, asUnits(user.inkAnnualCarry)),
    topup: Math.max(0, asUnits(user.inkTopup)),
  };
  const holds = Array.isArray(user.inkHolds)
    ? (user.inkHolds as Array<Record<string, unknown>>)
    : [];
  for (const h of holds) {
    const split = (h?.split ?? {}) as Record<string, unknown>;
    b.sub += Math.max(0, asUnits(split.sub));
    b.annual_carry += Math.max(0, asUnits(split.carry));
    b.topup += Math.max(0, asUnits(split.topup));
  }
  return b;
}

/**
 * Walks the window rows newest → oldest from `now`, undoing each row, to the state just before
 * the oldest window row. A bucket SET by a row (plan reset: sub; plan end: sub and carry) has no
 * recoverable earlier value: it is returned in `unknown`. A step that would go below zero is held
 * at zero (the ledger is missing a row there). Pure: exported for tests.
 */
export function walkBack(
  now: Record<Bucket, number>,
  newestFirst: readonly LedgerRow[],
): { state: Record<Bucket, number>; unknown: Set<Bucket> } {
  const b = { ...now };
  const unknown = new Set<Bucket>();
  for (const row of newestFirst) {
    const reason = typeof row.reason === 'string' ? row.reason : '';
    const delta = asUnits(row.delta);
    if (PLAN_RESET_REASONS.has(reason)) {
      unknown.add('sub');
      continue;
    }
    if (PLAN_END_REASONS.has(reason)) {
      unknown.add('sub');
      unknown.add('annual_carry');
      continue;
    }
    const split = bucketSplit(row.metadata);
    if (split && delta < 0) {
      for (const k of BUCKETS) b[k] += split[k];
    } else {
      const k = asBucket(row.sourceBucket);
      b[k] = Math.max(0, b[k] - delta);
    }
  }
  return { state: b, unknown };
}

/**
 * For each bucket in `buckets`, its value at the end of the rows matched by `olderFilter`
 * (createdAt): from the last row older than the window that SET it (a plan reset sets sub to its
 * grant; a plan end sets sub and carry to 0; none → 0), plus every older row's change to it after
 * that. One aggregation per bucket, ledger fields only.
 */
async function forwardFromOlder(
  ledger: mongoose.mongo.Collection,
  uid: mongoose.Types.ObjectId,
  olderFilter: Record<string, unknown>,
  buckets: Set<Bucket>,
): Promise<Record<Bucket, number>> {
  const out: Record<Bucket, number> = { sub: 0, annual_carry: 0, topup: 0 };
  for (const k of buckets) {
    const setReasons =
      k === 'sub' ? [...PLAN_RESET_REASONS, ...PLAN_END_REASONS] : [...PLAN_END_REASONS];
    const lastSet = await ledger.findOne(
      { userId: uid, createdAt: olderFilter, reason: { $in: setReasons } },
      { sort: { createdAt: -1, _id: -1 }, projection: { reason: 1, delta: 1, createdAt: 1 } },
    );
    let base = 0;
    const range: Record<string, unknown> = { ...olderFilter };
    if (lastSet) {
      const reason = String(lastSet.reason);
      base = PLAN_RESET_REASONS.has(reason) ? Math.max(0, asUnits(lastSet.delta)) : 0;
      range.$gt = lastSet.createdAt;
    }
    const agg = await ledger
      .aggregate<{ total: number }>([
        { $match: { userId: uid, createdAt: range, reason: { $nin: setReasons } } },
        {
          $project: {
            change: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$delta', 0] },
                    { $eq: [{ $type: '$metadata.buckets' }, 'object'] },
                  ],
                },
                { $multiply: [-1, { $ifNull: [`$metadata.buckets.${k}`, 0] }] },
                {
                  $cond: [
                    {
                      $eq: [
                        k === 'topup'
                          ? {
                              $cond: [
                                { $in: ['$sourceBucket', ['sub', 'annual_carry']] },
                                'x',
                                'topup',
                              ],
                            }
                          : '$sourceBucket',
                        k,
                      ],
                    },
                    { $ifNull: ['$delta', 0] },
                    0,
                  ],
                },
              ],
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$change' } } },
      ])
      .toArray();
    out[k] = Math.max(0, base + (agg[0]?.total ?? 0));
  }
  return out;
}

interface TitleInfo {
  title: string | null;
  deleted: boolean;
}

/** runId → the title of the user's document for that run (title only). */
async function titlesForRuns(
  userId: mongoose.Types.ObjectId,
  runIds: string[],
): Promise<Map<string, TitleInfo>> {
  const out = new Map<string, TitleInfo>();
  if (runIds.length === 0) return out;

  const gens = await Generation.find({ userId, runId: { $in: runIds }, documentId: { $ne: null } })
    .select('runId documentId')
    .lean();
  const docIdByRun = new Map<string, string>();
  for (const g of gens) {
    if (g.runId && g.documentId && !docIdByRun.has(g.runId))
      docIdByRun.set(g.runId, String(g.documentId));
  }

  const docIds = [...new Set(docIdByRun.values())].map((id) => new mongoose.Types.ObjectId(id));
  const docs = await LawieDocument.find({
    userId,
    $or: [{ _id: { $in: docIds } }, { runId: { $in: runIds } }],
  })
    .select('_id title runId isDeleted deletion.requestedAt')
    .lean();

  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const byRun = new Map<string, (typeof docs)[number]>();
  for (const d of docs) if (d.runId && !byRun.has(d.runId)) byRun.set(d.runId, d);

  for (const runId of runIds) {
    const docId = docIdByRun.get(runId);
    const doc = (docId ? byId.get(docId) : undefined) ?? byRun.get(runId);
    const deleted = !doc || doc.isDeleted === true || Boolean(doc.deletion?.requestedAt);
    out.set(runId, { title: deleted ? null : (doc!.title ?? null), deleted });
  }
  return out;
}

function toInk(units: number): number {
  return units / UNITS_PER_INK;
}

export function clampLimit(raw: unknown): number {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return INK_HISTORY_DEFAULT_LIMIT;
  return Math.min(n, INK_HISTORY_MAX_LIMIT);
}

/**
 * One page of the user's Ink history, newest first. `cursor` is the id of the
 * last entry of the previous page (`nextCursor`); unknown cursor →
 * InvalidCursorError.
 */
export async function getInkHistory(
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<InkHistoryPage> {
  const limit = clampLimit(opts.limit);
  // The balance read first: it also settles any yearly-plan month that is due,
  // so that grant's ledger row is in the history below.
  const { totalInk } = await getCreditBalance(userId);
  if (isFixtureUser(userId) || !mongoose.Types.ObjectId.isValid(userId)) {
    return { entries: [], balance: totalInk, nextCursor: null };
  }
  const db = mongoose.connection.db;
  if (!db) throw new Error('no database connection');

  const uid = new mongoose.Types.ObjectId(userId);
  const user = await db
    .collection('users')
    .findOne(
      { _id: uid },
      { projection: { inkSub: 1, inkAnnualCarry: 1, inkTopup: 1, inkHolds: 1, isTestAccount: 1 } },
    );
  if (!user) return { entries: [], balance: totalInk, nextCursor: null };
  const ledger = db.collection(INK_LEDGER_COLLECTION);

  // 1. The window: rows of the last 90 days, at most 500. When the 500 cap cuts in, every row at
  //    the cut's timestamp goes to "older", so the window/older split never splits a timestamp.
  const since = new Date(Date.now() - INK_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const fetched = (await ledger
    .find({ userId: uid, createdAt: { $gte: since } }, { projection: ROW_PROJECTION })
    .sort({ createdAt: -1, _id: -1 })
    .limit(INK_HISTORY_MAX_ROWS + 1)
    .toArray()) as unknown as LedgerRow[];
  let windowNewestFirst = fetched;
  let olderFilter: Record<string, unknown> = { $lt: since };
  if (fetched.length > INK_HISTORY_MAX_ROWS) {
    const cutTs = asDate(fetched[INK_HISTORY_MAX_ROWS].createdAt);
    windowNewestFirst = fetched.filter((r) => asDate(r.createdAt) > cutTs);
    olderFilter = { $lte: cutTs };
  }
  const windowRows = [...windowNewestFirst].reverse();

  // 2. The anchor: the user's buckets now, plus open holds (taken from the buckets, no ledger row
  //    yet), walked back through the window to its start.
  const now = currentBucketsWithHolds(user);
  const walked = walkBack(now, windowNewestFirst);

  // 3. A bucket the walk-back cannot recover (a plan reset or plan end in the window SET it, so
  //    its earlier value is not in the rows) is rebuilt forward from rows older than the window.
  const startState = walked.state;
  if (walked.unknown.size > 0) {
    const fwd = await forwardFromOlder(ledger, uid, olderFilter, walked.unknown);
    for (const k of walked.unknown) startState[k] = fwd[k];
  }

  const newestFirst = replayInkLedger(windowRows, {
    start: startState,
    isTestAccount: user.isTestAccount === true || isFixtureUser(userId),
  }).reverse();

  let start = 0;
  if (opts.cursor) {
    const at = newestFirst.findIndex((e) => e.id === opts.cursor);
    if (at < 0) throw new InvalidCursorError();
    start = at + 1;
  }
  const page = newestFirst.slice(start, start + limit);
  const hasMore = start + limit < newestFirst.length;

  const runIds = [
    ...new Set(page.filter((e) => e.kind === 'usage' && e.runId).map((e) => e.runId!)),
  ];
  const titles = await titlesForRuns(uid, runIds);

  const entries: InkHistoryEntry[] = page.map((e) => {
    let documentTitle: string | null = null;
    let documentDeleted = false;
    if (e.kind === 'usage') {
      const t = e.runId ? titles.get(e.runId) : undefined;
      // A usage row with no run id predates T-003 and cannot be traced to a document.
      documentTitle = t?.title ?? null;
      documentDeleted = t?.deleted ?? false;
    }
    return {
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      kind: e.kind,
      label: e.label,
      inkDelta: toInk(e.deltaUnits),
      balanceAfter: toInk(e.balanceUnits),
      documentTitle,
      documentDeleted,
    };
  });

  return {
    entries,
    balance: totalInk,
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
  };
}
