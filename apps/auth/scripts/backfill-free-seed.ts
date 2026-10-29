/**
 * T-657 (Ajay AJ-657-M1, M1a, M1b, M1c) — one-off: the advertised free 5 Ink for verified
 * accounts that carry the once-only marker (signupBonusGrantedAt) but never got the seed, because
 * the marker and the Ink were two separate writes before T-657.
 *
 *   yarn workspace @lawie/auth backfill:free-seed -- --cutoff 2026-10-25T22:00:00Z \
 *     --ids-out /path/ids.tsv                     # dry run (default; --dry-run says the same)
 *   yarn workspace @lawie/auth backfill:free-seed -- --cutoff 2026-10-25T22:00:00Z \
 *     --ids-out /path/ids.tsv --apply             # writes
 *   ... --before <ISO date>                       # only markers older than this
 *
 * WHO AND WHEN: Arjun or Nikhil, via the v11 SSM action on prod, and only AFTER the T-657
 * atomic grantSignupBonus is deployed (so every new marker comes with freeSeedAt and the Ink,
 * and nothing new can join the set). Dry run first: its counts per class go to Ajay (and Priya)
 * before any --apply. The ids go only to the 0600 --ids-out file, which is handed to Ajay.
 *
 * CUT-OFF (AJ-657-M1a/M1b, Arjun, Priya). Users dated before the effective cut-off are never
 * granted (no Ink, no row, ever) and are counted skipped_pre_seed.
 *  - --cutoff <ISO> is REQUIRED with --apply. Prod value: 2026-10-25T22:00:00Z (the prod DB was
 *    created empty at launch on 25 Oct 2026, before the 22:50 UTC smoke; Arjun).
 *  - FREE_SEED_GO_LIVE (2026-06-15T19:40:43Z, commit 7652ed93, the first free_seed code) is the
 *    FLOOR: a --cutoff earlier than it is a usage error. A dry run without --cutoff uses the
 *    floor and prints a warning.
 *  - Earliest-account guard (M1c): every run prints the earliest createdAt of ALL users and how
 *    many accounts have createdAt before the effective cut-off (plus no_createdAt, users with no
 *    createdAt, which do not count). If any account predates the cut-off, --apply refuses
 *    (exit 1) before writing anything; that goes back to Ajay. A dry run still prints everything.
 *  - Expected on prod with --cutoff 2026-10-25T22:00:00Z: "confirmed: 0 accounts before the
 *    cut-off", skipped_pre_seed 0, window 0, near_cutoff 0 (all empty).
 *
 * SELECTION is by state; the date is only a guard. Raw `users`: signupBonusGrantedAt set and
 * not null, no freeSeedAt (the T-657 marker), and with --before, signupBonusGrantedAt < that
 * date. Each one is then put in exactly one group, in this order:
 *   skipped_test        isTestAccount true (grantTestInk is their grant)
 *   skipped_erased      an `erasure` is present (T-115c: closing has started)
 *   skipped_inactive    isActive false
 *   unverified_skipped  not VERIFIED_FOR_BONUS (Google, emailVerified, or a googleId) and no
 *                       free_seed row (with a row: skipped_has_row)
 *   skipped_pre_seed    dated before the effective cut-off (or no date at all): never granted
 *   skipped_has_row     an inkledger row {userId, reason 'free_seed'} already exists (any _id)
 *   manual              any sign of a paid plan (inkSub, inkAnnualCarry or
 *                       inkSubMonthlyAllotment > 0, plan not 'free', planTier not 'free',
 *                       billingCycle not 'none'). T-651: sub_renewal and drip ledger deltas are
 *                       unreliable, so the topup sum below cannot be trusted. Never written.
 *   ambiguous           unexplained is neither exactly 0 nor exactly 10 (negative, non-integer,
 *                       or any other value; inkTopup not a number), or the user has any inkledger
 *                       row in billing's claim state 'pending' (topup/coupon/drip claims; kept in
 *                       the sum, its presence alone makes it ambiguous). A guess here could pay
 *                       twice (seed landed, a spend's row also failed) or withhold the Ink
 *                       (another grant's row failed). Listed, never written, never granted.
 *   A                   unexplained === 0: the seed never landed. Gets +10 units and the row.
 *   B                   unexplained === 10: the Ink is there, only the row is missing. Row only.
 * where unexplained = (inkTopup ?? 0) - sum(delta of inkledger rows with this userId and
 * sourceBucket 'topup').
 * Two extra id classes, listed in the ids file only and never written to the DB:
 *   window       skipped_pre_seed users with no free_seed row dated in [floor, cut-off): they
 *                may have verified between the commit and the deploy. Empty unless --cutoff is
 *                later than the floor.
 *   near_cutoff  candidates (not test accounts) whose date came from createdAt and lies in the
 *                7 days before the cut-off: they may have verified after it.
 *
 * DATE ("verified on or after", M1a). The User model has no verification timestamp
 * (emailVerified is a boolean; checked 29 Oct 2026). Precedence: signupBonusGrantedAt (the
 * marker: grantSignupBonus stamps it at verification for email users, at sign-up for Google
 * users), else createdAt, else none (counts as pre-seed). The run counts each source.
 *
 * APPLY (both guarded: freeSeedAt absent, marker set, not a test account, active, no erasure,
 * VERIFIED_FOR_BONUS, so a second or concurrent run matches nothing):
 *   A: the same pipeline update as grantSignupBonus: inkTopup $add 10 ($ifNull, never $set, so
 *      order-independent with referral Ink, T-298), ink field defaults, freeSeedAt '$$NOW'.
 *      signupBonusGrantedAt is not touched.
 *   B: freeSeedAt only (no Ink change).
 *   then, for both, the ledger row `_id: 'free_seed:<userId>'` {userId, delta 10, reason
 *   'free_seed', sourceBucket 'topup', balanceAfter, metadata {note 'backfill'}, createdAt};
 *   a duplicate key (E11000) counts as done. For B, balanceAfter is the current inkTopup
 *   (approximate). A user whose row insert fails keeps the Ink and freeSeedAt and is counted
 *   failed; grantSignupBonus's heal writes the row at their next sign-in.
 *   manual, ambiguous, window, near_cutoff: never touched. No email, no queue.
 *
 * OUTPUT: counts only on stdout/stderr, never a user id, email, name or other PII. The id lists
 * (dry run: A, B, manual, ambiguous, window, near_cutoff; apply: seeded_A, row_only_B, manual,
 * ambiguous, window, near_cutoff, failed) go to --ids-out <path>, one `<class>\t<userId>` per line, created with
 * mode 0600 and never overwriting a file (exit 2 if it exists or its directory is missing).
 * --ids-out is required with --apply and optional for a dry run.
 *
 * --cutoff and --before take a full ISO 8601 date-time with Z or a numeric offset
 * (2026-10-25T22:00:00Z, 2026-10-26T03:30+05:30); a date-only, local-time or partial value is a
 * usage error. The row _id is free_seed:<lower-case hex userId> (freeSeedLedgerId, in lockstep
 * with the auth service).
 *
 * Needs MONGO_URI of the target environment. When it is not set, NODE_ENV must be set (no
 * default: the script refuses to guess, exit 2 'set MONGO_URI or NODE_ENV'), and .env.<NODE_ENV>
 * or .env from the repo root is loaded. Reads MONGO_URI directly rather than
 * auth's env module (which demands JWT and other secrets this script does not use).
 *
 * Exit codes: 0 done (or dry run read), 1 failed (any user counted failed, or --apply refused
 * by the earliest-account guard), 2 usage.
 */
/* eslint-disable no-console */
import { appendFileSync, existsSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { config as loadDotenv } from 'dotenv';
import mongoose from 'mongoose';

type Db = mongoose.mongo.Db;
type UserDoc = Record<string, unknown> & { _id: mongoose.Types.ObjectId };

/**
 * The FLOOR for the cut-off (an --apply always names its own --cutoff, never below this): the
 * first commit that shipped the free Ink seed in grantSignupBonus (SCRUM-101):
 * 7652ed93d8dcdeab29371e73c19d0a91b6ce86f1, author and commit date 2026-06-16 01:10:43 +0530
 * = 2026-06-15T19:40:43Z (verified with git log -S"free_seed", 29 Oct 2026).
 */
export const FREE_SEED_GO_LIVE = new Date('2026-06-15T19:40:43Z');
export const FREE_SEED_GO_LIVE_SHA = '7652ed93d8dcdeab29371e73c19d0a91b6ce86f1';
export const FREE_SEED_GO_LIVE_LABEL = '2026-06-16 01:10:43 +0530';

/** AJ-657-M1b (Arjun) — the prod cut-off: prod DB created empty at launch, 25 Oct 2026. */
export const PROD_CUTOFF_HINT = '2026-10-25T22:00:00Z';

/** near_cutoff: createdAt-dated candidates this close before the cut-off. */
export const NEAR_CUTOFF_MS = 7 * 24 * 60 * 60 * 1000;

/** SCRUM-101 — 5 Ink, stored at 2 units per Ink. Same as FREE_SEED_UNITS in the auth service. */
export const FREE_SEED_UNITS = 10;

/**
 * Copy of VERIFIED_FOR_BONUS in src/services/credit-bonus.service.ts. Not imported: that module
 * loads the auth logger, which loads and validates auth's whole env. Keep the two equal.
 */
export const VERIFIED_FOR_BONUS = {
  $or: [
    { authProvider: 'google' },
    { emailVerified: true },
    { googleId: { $exists: true, $nin: [null, ''] } },
  ],
};

const USAGE =
  'Usage: yarn workspace @lawie/auth backfill:free-seed [--dry-run | --apply] ' +
  '[--cutoff <ISO>] [--ids-out <path>] [--before <ISO date>]   ' +
  `(--apply needs --cutoff and --ids-out; --cutoff >= ${FREE_SEED_GO_LIVE.toISOString()}; ` +
  'dates are full ISO 8601 date-times with Z or +hh:mm, e.g. 2026-10-25T22:00:00Z)';

export type Group =
  | 'skipped_test'
  | 'skipped_erased'
  | 'skipped_inactive'
  | 'unverified_skipped'
  | 'skipped_pre_seed'
  | 'skipped_has_row'
  | 'manual'
  | 'ambiguous'
  | 'A'
  | 'B';

export type DateSource = 'marker' | 'createdAt' | 'none';

export interface Classified {
  group: Group;
  /** The "verified at" date used for the cut-off, and where it came from. */
  verifiedAt: Date | null;
  dateSource: DateSource;
  /** Pre-seed, no free_seed row, dated in [floor, cut-off). Listed only. */
  window: boolean;
  /** Dated by createdAt within NEAR_CUTOFF_MS before the cut-off. Listed only. */
  nearCutoff: boolean;
}

export interface RunOptions {
  apply: boolean;
  before?: Date;
  /** The effective cut-off. Absent: the floor (FREE_SEED_GO_LIVE); the CLI allows that for a
   * dry run only. */
  cutoff?: Date;
  /** Called with `<class>\t<userId>` lines; the only place ids go. */
  writeIds?: (lines: string[]) => void;
  /** Counts-only output. Defaults to console.log. */
  log?: (line: string) => void;
}

export interface RunResult {
  counts: Record<string, number>;
  dateSources: Record<DateSource, number>;
  monthsEligible: Record<string, number>;
  monthsPreCutoff: Record<string, number>;
  failed: number;
  /** M1c: --apply refused because accounts predate the cut-off. Nothing was written. */
  refused: boolean;
  earliestCreatedAt: Date | null;
  predateCutoff: number;
  noCreatedAt: number;
}

/**
 * The free_seed row's _id, lower-case hex via the ObjectId. LOCKSTEP with freeSeedLedgerId in
 * src/services/credit-bonus.service.ts (not imported: env init); the two must stay equal.
 */
export function freeSeedLedgerId(userId: string | mongoose.Types.ObjectId): string {
  // Callers validate first; a non-ObjectId input (never written) is lower-cased, not thrown on.
  const hex = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId).toHexString()
    : String(userId).toLowerCase();
  return `free_seed:${hex}`;
}

/**
 * --cutoff / --before: a full ISO 8601 date-time with Z or a numeric offset (no date-only, no
 * local time), and a real date.
 */
export const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseIsoDateTime(v: string): Date | null {
  if (!ISO_DATETIME_RE.test(v)) return null;
  // A real calendar day (no 2026-02-30 rolling over into March).
  const [y, m, day] = v.slice(0, 10).split('-').map(Number);
  const cal = new Date(Date.UTC(y, m - 1, day));
  if (cal.getUTCFullYear() !== y || cal.getUTCMonth() !== m - 1 || cal.getUTCDate() !== day) {
    return null;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isDate(v: unknown): v is Date {
  return v instanceof Date && !Number.isNaN(v.getTime());
}

/** JS mirror of VERIFIED_FOR_BONUS for an already-read document. */
export function isVerifiedForBonus(u: Record<string, unknown>): boolean {
  const g = u['googleId'];
  return (
    u['authProvider'] === 'google' ||
    u['emailVerified'] === true ||
    (g !== undefined && g !== null && g !== '')
  );
}

/** Any sign of a paid plan: the topup arithmetic cannot be trusted for these (T-651). */
export function isManual(u: Record<string, unknown>): boolean {
  const positive = (k: string): boolean => Number(u[k] ?? 0) > 0;
  const notValue = (k: string, free: string): boolean =>
    u[k] !== undefined && u[k] !== null && u[k] !== free;
  return (
    positive('inkSub') ||
    positive('inkAnnualCarry') ||
    positive('inkSubMonthlyAllotment') ||
    notValue('plan', 'free') ||
    notValue('planTier', 'free') ||
    notValue('billingCycle', 'none')
  );
}

/** "Verified at": the marker, else createdAt (the model has no verification timestamp). */
export function verificationDate(u: Record<string, unknown>): {
  at: Date | null;
  source: DateSource;
} {
  if (isDate(u['signupBonusGrantedAt'])) return { at: u['signupBonusGrantedAt'], source: 'marker' };
  if (isDate(u['createdAt'])) return { at: u['createdAt'], source: 'createdAt' };
  return { at: null, source: 'none' };
}

function monthKey(d: Date | null): string {
  return d ? d.toISOString().slice(0, 7) : 'unknown';
}

async function hasFreeSeedRow(db: Db, userId: mongoose.Types.ObjectId): Promise<boolean> {
  const row = await db
    .collection('inkledger')
    .findOne({ userId, reason: 'free_seed' }, { projection: { _id: 1 } });
  return row !== null;
}

/** Any inkledger row of this user still in billing's claim state 'pending'. */
async function hasPendingRow(db: Db, userId: mongoose.Types.ObjectId): Promise<boolean> {
  const row = await db
    .collection('inkledger')
    .findOne({ userId, state: 'pending' }, { projection: { _id: 1 } });
  return row !== null;
}

async function topupLedgerSum(db: Db, userId: mongoose.Types.ObjectId): Promise<number> {
  const [agg] = await db
    .collection('inkledger')
    .aggregate<{ s: number }>([
      { $match: { userId, sourceBucket: 'topup' } },
      { $group: { _id: null, s: { $sum: '$delta' } } },
    ])
    .toArray();
  return typeof agg?.s === 'number' ? agg.s : 0;
}

/** Put one candidate (from the candidate query) in exactly one group. Reads, never writes. */
export async function classify(
  db: Db,
  u: UserDoc,
  cutoff: Date = FREE_SEED_GO_LIVE,
): Promise<Classified> {
  const { at, source } = verificationDate(u);
  const nearCutoff =
    source === 'createdAt' &&
    at !== null &&
    at < cutoff &&
    at.getTime() >= cutoff.getTime() - NEAR_CUTOFF_MS;
  const out = (group: Group, window = false): Classified => ({
    group,
    verifiedAt: at,
    dateSource: source,
    window,
    nearCutoff,
  });

  if (u['isTestAccount'] === true) return out('skipped_test');
  if (Object.prototype.hasOwnProperty.call(u, 'erasure')) return out('skipped_erased');
  if (u['isActive'] === false) return out('skipped_inactive');

  const hasRow = await hasFreeSeedRow(db, u._id);
  if (!isVerifiedForBonus(u)) return out(hasRow ? 'skipped_has_row' : 'unverified_skipped');
  // AJ-657-M1a: before the cut-off, or no usable date at all: never granted. Those dated in
  // [floor, cut-off) with no row are also listed as `window` (state matches, date does not).
  if (!at || at < cutoff) {
    return out('skipped_pre_seed', at !== null && at >= FREE_SEED_GO_LIVE && !hasRow);
  }
  if (hasRow) return out('skipped_has_row');
  if (isManual(u)) return out('manual');

  // T-657 review: only the two exact shapes are acted on. unexplained 0 = the seed never landed
  // (A); unexplained 10 = the seed landed, only its row is missing (B). Anything else (a spend or
  // another grant whose row also failed, negative, non-integer) cannot tell the two apart, and
  // a guess either double-pays or withholds the Ink: `ambiguous`, listed and never written. A
  // pending claim row (billing's topup/coupon/drip claims, state 'pending') is ambiguous too:
  // its Ink may or may not have landed. Pending rows stay in the sum; their presence decides.
  const rawTopup = u['inkTopup'] ?? 0;
  const inkTopup = typeof rawTopup === 'number' ? rawTopup : Number.NaN;
  if (!Number.isFinite(inkTopup) || (await hasPendingRow(db, u._id))) return out('ambiguous');
  const unexplained = inkTopup - (await topupLedgerSum(db, u._id));
  if (unexplained === 0) return out('A');
  if (unexplained === FREE_SEED_UNITS) return out('B');
  return out('ambiguous');
}

/** The apply-time guard: still a T-657 backfill candidate. */
function applyFilter(_id: mongoose.Types.ObjectId): Record<string, unknown> {
  return {
    _id,
    freeSeedAt: { $exists: false },
    signupBonusGrantedAt: { $exists: true, $ne: null },
    isTestAccount: { $ne: true },
    isActive: { $ne: false },
    erasure: { $exists: false },
    ...VERIFIED_FOR_BONUS,
  };
}

/** The row; E11000 means it is already there. Throws any other error. */
async function insertBackfillRow(
  db: Db,
  _id: mongoose.Types.ObjectId,
  balanceAfter: unknown,
): Promise<void> {
  try {
    await db.collection<{ _id: string; [key: string]: unknown }>('inkledger').insertOne({
      _id: freeSeedLedgerId(_id),
      userId: _id,
      delta: FREE_SEED_UNITS,
      reason: 'free_seed',
      sourceBucket: 'topup',
      balanceAfter,
      metadata: { note: 'backfill' },
      createdAt: new Date(),
    });
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 11000) return;
    throw err;
  }
}

/** 'done' when this call wrote, 'gone' when the guard no longer matches (raced / changed). */
async function applyOne(
  db: Db,
  _id: mongoose.Types.ObjectId,
  group: 'A' | 'B',
): Promise<'done' | 'gone'> {
  const users = db.collection('users');
  if (group === 'A') {
    const seeded = await users.findOneAndUpdate(
      applyFilter(_id),
      [
        {
          $set: {
            inkTopup: { $add: [{ $ifNull: ['$inkTopup', 0] }, FREE_SEED_UNITS] },
            inkSub: { $ifNull: ['$inkSub', 0] },
            inkAnnualCarry: { $ifNull: ['$inkAnnualCarry', 0] },
            inkSubMonthlyAllotment: { $ifNull: ['$inkSubMonthlyAllotment', 0] },
            freeSeedAt: '$$NOW',
          },
        },
      ],
      { returnDocument: 'after' },
    );
    if (!seeded) return 'gone';
    await insertBackfillRow(db, _id, seeded['inkTopup']);
    return 'done';
  }
  const marked = await users.findOneAndUpdate(
    applyFilter(_id),
    { $set: { freeSeedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!marked) return 'gone';
  // Approximate: the current inkTopup, not the balance when the Ink first landed.
  await insertBackfillRow(db, _id, marked['inkTopup'] ?? null);
  return 'done';
}

/** M1c — the earliest-account guard over ALL users. A date and counts only; reads no _id. */
export async function earliestAccountCheck(
  db: Db,
  cutoff: Date,
): Promise<{ earliestCreatedAt: Date | null; predateCutoff: number; noCreatedAt: number }> {
  const users = db.collection('users');
  const [first] = await users
    .find({ createdAt: { $type: 'date' } }, { projection: { _id: 0, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .limit(1)
    .toArray();
  const predateCutoff = await users.countDocuments({ createdAt: { $lt: cutoff } });
  const noCreatedAt = await users.countDocuments({
    $or: [{ createdAt: { $exists: false } }, { createdAt: null }],
  });
  const earliest = first?.['createdAt'];
  return {
    earliestCreatedAt: isDate(earliest) ? earliest : null,
    predateCutoff,
    noCreatedAt,
  };
}

export async function run(db: Db, opts: RunOptions): Promise<RunResult> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const writeIds = opts.writeIds ?? (() => undefined);
  const cutoff = opts.cutoff ?? FREE_SEED_GO_LIVE;
  const cutoffSource = opts.cutoff ? 'arg' : 'floor';
  const guard = await earliestAccountCheck(db, cutoff);
  const filter: Record<string, unknown> = {
    signupBonusGrantedAt: {
      $exists: true,
      $ne: null,
      ...(opts.before ? { $lt: opts.before } : {}),
    },
    freeSeedAt: { $exists: false },
  };
  const cursor = db.collection('users').find(filter, {
    projection: {
      _id: 1,
      signupBonusGrantedAt: 1,
      createdAt: 1,
      isTestAccount: 1,
      isActive: 1,
      erasure: 1,
      authProvider: 1,
      emailVerified: 1,
      googleId: 1,
      inkTopup: 1,
      inkSub: 1,
      inkAnnualCarry: 1,
      inkSubMonthlyAllotment: 1,
      plan: 1,
      planTier: 1,
      billingCycle: 1,
    },
  });

  const counts: Record<string, number> = {
    candidates: 0,
    skipped_test: 0,
    skipped_erased: 0,
    skipped_inactive: 0,
    unverified_skipped: 0,
    skipped_pre_seed: 0,
    skipped_has_row: 0,
    manual: 0,
    ambiguous: 0,
    A: 0,
    B: 0,
    window: 0,
    near_cutoff: 0,
    seeded_A: 0,
    row_only_B: 0,
    already_done: 0,
    failed: 0,
  };
  const dateSources: Record<DateSource, number> = { marker: 0, createdAt: 0, none: 0 };
  const monthsEligible: Record<string, number> = {};
  const monthsPreCutoff: Record<string, number> = {};
  const work: Array<{ _id: mongoose.Types.ObjectId; group: 'A' | 'B' }> = [];
  const dryLines: string[] = [];
  const listLines: string[] = [];

  for await (const doc of cursor) {
    const u = doc as UserDoc;
    counts['candidates'] += 1;
    let c: Classified;
    try {
      c = await classify(db, u, cutoff);
    } catch {
      counts['failed'] += 1;
      writeIds([`failed\t${u._id.toString()}`]);
      continue;
    }
    counts[c.group] += 1;
    const verifiedPath = !['skipped_test', 'skipped_erased', 'skipped_inactive'].includes(c.group);
    if (verifiedPath && c.group !== 'unverified_skipped') {
      dateSources[c.dateSource] += 1;
      const m = monthKey(c.verifiedAt);
      const bucket = c.group === 'skipped_pre_seed' ? monthsPreCutoff : monthsEligible;
      bucket[m] = (bucket[m] ?? 0) + 1;
    }
    if (c.window) {
      counts['window'] += 1;
      listLines.push(`window\t${u._id.toString()}`);
    }
    if (c.nearCutoff && c.group !== 'skipped_test') {
      counts['near_cutoff'] += 1;
      listLines.push(`near_cutoff\t${u._id.toString()}`);
    }
    if (c.group === 'manual' || c.group === 'ambiguous') {
      dryLines.push(`${c.group}\t${u._id.toString()}`);
    }
    if (c.group === 'A' || c.group === 'B') {
      work.push({ _id: u._id, group: c.group });
      dryLines.push(`${c.group}\t${u._id.toString()}`);
    }
  }

  if (!opts.cutoff) {
    log(
      'WARNING: no --cutoff given: using the commit-time floor; --apply requires --cutoff ' +
        `(prod: ${PROD_CUTOFF_HINT})`,
    );
  }
  log(
    `cut-off: ${cutoff.toISOString()} (source: ${cutoffSource}; floor ` +
      `${FREE_SEED_GO_LIVE.toISOString()}, commit ${FREE_SEED_GO_LIVE_SHA}, ${FREE_SEED_GO_LIVE_LABEL})`,
  );
  const earliestIso = guard.earliestCreatedAt ? guard.earliestCreatedAt.toISOString() : 'none';
  log(`earliest account createdAt: ${earliestIso}`);
  log(`accounts with createdAt before the cut-off: ${guard.predateCutoff}`);
  log(`no_createdAt: ${guard.noCreatedAt}`);
  if (guard.predateCutoff === 0) log('confirmed: 0 accounts before the cut-off');
  else log(`WARNING: ${guard.predateCutoff} accounts predate the cut-off`);
  if (opts.before) log(`--before: ${opts.before.toISOString()}`);
  for (const k of [
    'candidates',
    'skipped_test',
    'skipped_erased',
    'skipped_inactive',
    'unverified_skipped',
    'skipped_pre_seed',
    'skipped_has_row',
    'manual',
    'ambiguous',
    'A',
    'B',
    'window',
    'near_cutoff',
  ]) {
    log(`${k}: ${counts[k]}`);
  }
  log(
    `verified-at source: marker ${dateSources.marker}, createdAt ${dateSources.createdAt}, ` +
      `none ${dateSources.none}`,
  );
  const printMonths = (label: string, months: Record<string, number>): void => {
    log(`${label} by month:`);
    for (const m of Object.keys(months).sort()) log(`  ${m} -> ${months[m]}`);
  };
  printMonths('pre-cutoff (dated before the cut-off, never granted)', monthsPreCutoff);
  printMonths('eligible (dated on or after the cut-off)', monthsEligible);

  const result = (refused: boolean): RunResult => ({
    counts,
    dateSources,
    monthsEligible,
    monthsPreCutoff,
    failed: counts['failed'],
    refused,
    ...guard,
  });

  if (!opts.apply) {
    if (dryLines.length + listLines.length > 0) writeIds([...dryLines, ...listLines]);
    if (counts['failed'] > 0) log(`failed: ${counts['failed']}`);
    log('Dry run: nothing written.');
    return result(false);
  }

  // M1c: any account older than the cut-off sends this back to Ajay. Nothing is written.
  if (guard.predateCutoff > 0) {
    log(
      `refusing --apply: ${guard.predateCutoff} accounts predate the cut-off; ` +
        'goes back to Ajay (AJ-657-M1c)',
    );
    return result(true);
  }

  // manual, ambiguous, window, near_cutoff: listed, never written.
  const manualLines = dryLines.filter(
    (l) => l.startsWith('manual\t') || l.startsWith('ambiguous\t'),
  );
  if (manualLines.length + listLines.length > 0) writeIds([...manualLines, ...listLines]);

  for (const { _id, group } of work) {
    const id = _id.toString();
    try {
      const r = await applyOne(db, _id, group);
      if (r === 'gone') {
        counts['already_done'] += 1;
        continue;
      }
      const cls = group === 'A' ? 'seeded_A' : 'row_only_B';
      counts[cls] += 1;
      writeIds([`${cls}\t${id}`]);
    } catch {
      counts['failed'] += 1;
      writeIds([`failed\t${id}`]);
    }
  }

  log(`seeded_A: ${counts['seeded_A']}`);
  log(`row_only_B: ${counts['row_only_B']}`);
  log(`already_done (guard no longer matched): ${counts['already_done']}`);
  log(`manual (not touched): ${counts['manual']}`);
  log(`ambiguous (not touched): ${counts['ambiguous']}`);
  log(`failed: ${counts['failed']}`);
  return result(false);
}

/**
 * Scheme, host(s) and database of a Mongo URI, never the credentials or the query string
 * (as billing's backfill-yearly-drip). gitleaks:allow
 */
export function redactMongoUri(uri: string): string {
  const scheme = /^[a-z+]+:\/\//i.exec(uri)?.[0];
  if (!scheme) return '(unparseable MONGO_URI)';
  const rest = uri.slice(scheme.length);
  const afterCreds = rest.slice(rest.lastIndexOf('@') + 1);
  return scheme + afterCreds.split('?')[0];
}

export interface ParsedArgs {
  apply: boolean;
  before?: Date;
  cutoff?: Date;
  idsOut?: string;
}

/** Null on any usage error. */
export function parseArgs(argv: string[]): ParsedArgs | null {
  let apply = false;
  let dry = false;
  let before: Date | undefined;
  let idsOut: string | undefined;
  let cutoff: Date | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') apply = true;
    else if (a === '--dry-run') dry = true;
    else if (a === '--before' || a === '--ids-out' || a === '--cutoff') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return null;
      i += 1;
      if (a === '--ids-out') idsOut = v;
      else {
        // Full ISO 8601 date-time with Z or an offset, and a real date (no date-only, no
        // local time, no '2026').
        const d = parseIsoDateTime(v);
        if (!d) return null;
        if (a === '--before') before = d;
        else if (d < FREE_SEED_GO_LIVE)
          return null; // below the floor
        else cutoff = d;
      }
    } else return null;
  }
  if (apply && dry) return null;
  if (apply && (!idsOut || !cutoff)) return null;
  return { apply, before, cutoff, idsOut };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error(USAGE);
    process.exit(2);
  }

  // Refuse to guess the target: without MONGO_URI, NODE_ENV must say which env file to load
  // (no silent fallback to the development file).
  if (!process.env.MONGO_URI && !process.env.NODE_ENV) {
    console.error('set MONGO_URI or NODE_ENV');
    process.exit(2);
  }

  // apps/auth/scripts -> repo root.
  const repoRoot = join(__dirname, '..', '..', '..');
  const envFiles = process.env.MONGO_URI ? [] : [`.env.${process.env.NODE_ENV}`, '.env'];
  for (const candidate of envFiles) {
    const p = join(repoRoot, candidate);
    if (existsSync(p)) {
      loadDotenv({ path: p });
      break;
    }
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set.');
    process.exit(2);
  }

  // Claim the id file before connecting: never overwrite, owner-only.
  const idsOut = args.idsOut;
  if (idsOut) {
    if (!existsSync(dirname(idsOut))) {
      console.error(`--ids-out directory does not exist: ${dirname(idsOut)}`);
      process.exit(2);
    }
    try {
      writeFileSync(idsOut, '', { mode: 0o600, flag: 'wx' });
    } catch {
      console.error(`--ids-out file exists or cannot be created: ${idsOut}`);
      process.exit(2);
    }
    console.log(`Ids file: ${idsOut}`);
  }
  const writeIds = idsOut
    ? (lines: string[]): void => appendFileSync(idsOut, lines.map((l) => `${l}\n`).join(''))
    : undefined;

  const target = redactMongoUri(mongoUri);
  if (args.apply) {
    console.log('='.repeat(72));
    console.log(`  --apply: WRITING to ${target}`);
    console.log('='.repeat(72));
  } else {
    console.log(`Target (dry run, read-only): ${target}`);
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  let failed = 0;
  let refused = false;
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('No database handle after connect');
    const result = await run(db, {
      apply: args.apply,
      before: args.before,
      cutoff: args.cutoff,
      writeIds,
    });
    failed = result.failed;
    refused = result.refused;
  } finally {
    await mongoose.disconnect();
  }
  if (failed > 0 || refused) process.exit(1);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`Backfill stopped: ${err instanceof Error ? err.name : 'UnknownError'}`);
    void mongoose.disconnect().finally(() => process.exit(1));
  });
}
