/**
 * T-115c — close an account and erase it (Arjun's revised design, "Account close, in order",
 * and his T-115c rulings 1-5; Ajay e13d474 and the signed failure conditions in
 * handoff/legal/dpdp-v1-calls-signed.md).
 *
 * Auth orchestrates; each service erases what it owns through its own
 * POST /internal/erase-user. Order, each step idempotent:
 *
 *   checks (no write)  re-proof (password, or typed email + authAt < 15 min) -> billing
 *                      GET /internal/subscription-status -> 409 if active, 503 if unreachable
 *   lock               erasure { requestedAt, stage: 'locked' }, isActive: false, then every
 *                      session killed (Redis session:* and session:refresh:*, Session rows).
 *                      From here the account cannot log in, refresh or use Google (all check
 *                      isActive), even if a later step fails (Ajay condition 3).
 *   drafting_erased    drafting POST /internal/erase-user { userId, email }
 *   billing_erased     billing POST /internal/erase-user { userId }
 *   auth_data_erased   Session rows and Redis session keys again, auth:verify-email:min/day:<uid>,
 *                      the gateway's rate-limit key rl:<uid>
 *   audit_done         an `account_delete` AuditLog row (userId, eventType, createdAt only);
 *                      `payment` and `account_delete` rows stripped to those three fields;
 *                      every other audit row of the user deleted (Ajay e13d474)
 *   recheck            drafting and billing erase-user once more (both idempotent): a request
 *                      already in flight when the lock landed may have written rows after
 *                      drafting_erased. A failure here is a failed step; the sweep retries.
 *   (last)             the User document hard-deleted (Arjun ruling 1). No placeholder.
 *
 * `erasure.stage` is the last step that finished, so a retry starts after it. A failed step
 * leaves the account locked at that stage; the sweep (every 10 minutes and at boot) and
 * `scripts/erase-user.ts --resume` finish it (Ajay condition 2). "No User document and an
 * account_delete row" is a finished erase.
 *
 * Logs hold the userId, the stage, HTTP status codes, `err.name` and counts only: never the
 * email, a name, a password or any content.
 */
import mongoose, { Types } from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import redis from '../config/redis';
import { AuditLog } from '../models/AuditLog.model';
import { Session } from '../models/Session.model';
import { ERASURE_STAGES, ErasureStage, User } from '../models/User.model';

import { deleteAllUserSessions, hashToken, validateSession } from './session.service';

/** A Google-only user re-proves by typing the email within this long of signing in (ruling 2). */
export const REAUTH_WINDOW_MS = 15 * 60 * 1000;

/** Audit events kept, stripped to userId, type and time (Ajay e13d474). The rest are deleted. */
export const AUDIT_KEEP_TYPES = ['payment', 'account_delete'] as const;

/**
 * The golden-set fixture user (drafting services/run-origin.ts GOLDEN_SET_USER_ID, T-147e).
 * A copy, because apps do not import from each other. It has no users row; refused anyway.
 */
export const GOLDEN_SET_USER_ID = '0000000000000000000f147e';

/** Each internal call gives up after this long; the step is retried later. */
const INTERNAL_CALL_TIMEOUT_MS = 15_000;

const PASSWORD_MAX_LENGTH = 1024;
const EMAIL_MAX_LENGTH = 320;

// ── Internal calls ──────────────────────────────────────────────────────────

interface InternalResponse {
  status: number;
  body: unknown;
}

async function callInternal(
  baseUrl: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<InternalResponse> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': env.INTERNAL_SECRET,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(INTERNAL_CALL_TIMEOUT_MS),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'UnknownError';
}

export type SubscriptionCheck =
  | { kind: 'ok'; active: boolean; status: string }
  | { kind: 'unavailable' };

/** Billing GET /internal/subscription-status/:userId (Arjun ruling 4). Never throws. */
export async function fetchSubscriptionStatus(userId: string): Promise<SubscriptionCheck> {
  try {
    const { status, body } = await callInternal(
      env.BILLING_SERVICE_URL,
      `/internal/subscription-status/${encodeURIComponent(userId)}`,
      { method: 'GET' },
    );
    const b = body as { active?: unknown; status?: unknown } | null;
    if (status !== 200 || !b || typeof b.active !== 'boolean') {
      logger.warn({ userId, httpStatus: status }, 'Subscription status check failed');
      return { kind: 'unavailable' };
    }
    return { kind: 'ok', active: b.active, status: typeof b.status === 'string' ? b.status : '' };
  } catch (err) {
    logger.warn({ userId, errName: errName(err) }, 'Subscription status check failed');
    return { kind: 'unavailable' };
  }
}

type Counts = Record<string, number>;

/** POST /internal/erase-user on drafting or billing. Returns the counts, or throws. */
async function eraseRemote(
  service: 'drafting' | 'billing',
  body: { userId: string; email?: string; dryRun?: boolean },
): Promise<Counts> {
  const baseUrl = service === 'drafting' ? env.DRAFTING_SERVICE_URL : env.BILLING_SERVICE_URL;
  const { status, body: resBody } = await callInternal(baseUrl, '/internal/erase-user', {
    method: 'POST',
    body,
  });
  const b = resBody as { ok?: unknown; counts?: unknown } | null;
  if (status !== 200 || !b || b.ok !== true) {
    const err = new Error(`${service} erase-user returned ${status}`);
    err.name = 'RemoteEraseFailed';
    throw err;
  }
  const counts: Counts = {};
  if (b.counts && typeof b.counts === 'object') {
    for (const [k, v] of Object.entries(b.counts as Record<string, unknown>)) {
      if (typeof v === 'number') counts[k] = v;
    }
  }
  return counts;
}

// ── Auth's own data ─────────────────────────────────────────────────────────

/** Redis keys auth or the gateway hold per user, other than sessions. */
function userRedisKeys(userId: string): string[] {
  return [
    `auth:verify-email:min:${userId}`,
    `auth:verify-email:day:${userId}`,
    // The gateway's per-user rate limiter (rate-limit-redis, prefix 'rl:', keyed by user id).
    `rl:${userId}`,
  ];
}

async function countSessionKeys(userId: string): Promise<number> {
  let n = 0;
  for (const pattern of [`session:${userId}:*`, `session:refresh:${userId}:*`]) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      // `session:<uid>:*` never matches `session:refresh:...` (the uid comes first): no double count.
      n += keys.length;
    } while (cursor !== '0');
  }
  return n;
}

async function eraseAuthData(userId: string, dryRun: boolean): Promise<Counts> {
  const uid = new Types.ObjectId(userId);
  const sessions = await Session.countDocuments({ userId: uid });
  const sessionKeys = await countSessionKeys(userId);
  const otherKeys = userRedisKeys(userId);
  if (dryRun) {
    return { sessions, sessionKeys, redisKeys: await redis.exists(...otherKeys) };
  }
  await deleteAllUserSessions(userId);
  const redisKeys = await redis.del(...otherKeys);
  return { sessions, sessionKeys, redisKeys };
}

async function eraseAudit(userId: string, dryRun: boolean): Promise<Counts> {
  const uid = new Types.ObjectId(userId);
  const keep = { userId: uid, eventType: { $in: [...AUDIT_KEEP_TYPES] } };
  const drop = { userId: uid, eventType: { $nin: [...AUDIT_KEEP_TYPES] } };
  const coll = AuditLog.collection;
  if (dryRun) {
    const existing = await coll.countDocuments({ userId: uid, eventType: 'account_delete' });
    return {
      auditDeleted: await coll.countDocuments(drop),
      auditKept: await coll.countDocuments(keep),
      auditWritten: existing > 0 ? 0 : 1,
    };
  }
  // Raw driver, so no schema defaults (severity, metadata) are added: userId, type and time only.
  const written = await coll.updateOne(
    { userId: uid, eventType: 'account_delete' },
    { $setOnInsert: { userId: uid, eventType: 'account_delete', createdAt: new Date() } },
    { upsert: true },
  );
  await coll.updateMany(keep, { $unset: { severity: '', ipAddress: '', metadata: '' } });
  const deleted = await coll.deleteMany(drop);
  return {
    auditDeleted: deleted.deletedCount,
    auditKept: await coll.countDocuments(keep),
    auditWritten: written.upsertedCount,
  };
}

// ── Lock, run, resume ───────────────────────────────────────────────────────

/**
 * The first write of an account close: lock the account and kill every session. Only sets
 * the erasure marker when there is none, so a second lock never moves `requestedAt` or the
 * stage back. A session-kill failure is logged and left to the auth_data step, which kills
 * them again before the account is gone.
 *
 * T-358 (Arjun ruling 6): with `onlyIf`, the lock is CONDITIONAL. The filter is added (under
 * $and) to the lock's own updateOne, so the check and the lock are one atomic write: if the
 * account no longer matches (e.g. the user verified mid-sweep, or it is already being erased)
 * nothing is written, no session is killed and false is returned. Without `onlyIf` the
 * behaviour is unchanged and the result is always true.
 */
export async function lockAccount(
  userId: string,
  opts: { onlyIf?: Record<string, unknown> } = {},
): Promise<boolean> {
  const _id = new Types.ObjectId(userId);
  const lockSet = {
    $set: { isActive: false, erasure: { requestedAt: new Date(), stage: 'locked' } },
  };
  if (opts.onlyIf) {
    const locked = await User.updateOne(
      { _id, $and: [{ erasure: { $exists: false } }, opts.onlyIf] },
      lockSet,
    );
    if (locked.matchedCount === 0) return false;
  } else {
    await User.updateOne({ _id, erasure: { $exists: false } }, lockSet);
    // Also when the marker already existed: the account must stay locked.
    await User.updateOne({ _id }, { $set: { isActive: false } });
  }
  try {
    await deleteAllUserSessions(userId);
  } catch (err) {
    logger.warn({ userId, errName: errName(err) }, 'Account close: session kill failed; retried');
  }
  return true;
}

export interface AccountEraseRun {
  /** True when the account is fully erased (or, on a dry run, when the counts were read). */
  done: boolean;
  dryRun: boolean;
  /** Per service: rows or keys removed, or that would be on a dry run. */
  counts: {
    drafting?: Counts;
    billing?: Counts;
    auth?: Counts;
    /** The second drafting and billing pass just before the User document goes. */
    recheck?: { drafting?: Counts; billing?: Counts };
  };
  /** The step that failed, when done is false. */
  failedAt?: ErasureStage | 'recheck' | 'user' | 'read';
  /** No User document and no account_delete row: there was nothing to erase. */
  notFound?: boolean;
}

/** After this many failed attempts an unfinished erase is logged at warn on every failure. */
export const ERASE_ATTEMPTS_WARN_THRESHOLD = 5;

/**
 * A failed step: record when (the sweep orders by this, least recently tried first) and how
 * many times. Ids and counts only in the logs. Never throws.
 */
async function recordFailedAttempt(
  uid: Types.ObjectId,
  failedAt: string,
  err: unknown,
  counts: AccountEraseRun['counts'],
): Promise<void> {
  const userId = String(uid);
  logger.warn(
    { userId, failedAt, errName: errName(err), counts },
    'Account erase step failed; the sweep retries',
  );
  try {
    const after = await User.findOneAndUpdate(
      { _id: uid, erasure: { $exists: true } },
      { $set: { 'erasure.lastAttemptAt': new Date() }, $inc: { 'erasure.attempts': 1 } },
      { new: true, projection: { 'erasure.attempts': 1 } },
    ).lean();
    const attempts = after?.erasure?.attempts ?? 0;
    if (attempts >= ERASE_ATTEMPTS_WARN_THRESHOLD) {
      logger.warn({ userId, failedAt, attempts }, 'Account erase keeps failing');
    }
  } catch {
    // Recording the attempt is best effort; the sweep still finds the account.
  }
}

function stageIndex(stage: ErasureStage | undefined): number {
  return stage === undefined ? -1 : ERASURE_STAGES.indexOf(stage);
}

/**
 * Runs (or resumes) the erase of a LOCKED account, from the step after its stored stage.
 * With `dryRun`, reads counts from every service and changes nothing; the account need not
 * be locked. Never throws.
 */
export async function runAccountErase(
  userId: string,
  opts: { dryRun?: boolean } = {},
): Promise<AccountEraseRun> {
  const dryRun = opts.dryRun === true;
  const counts: AccountEraseRun['counts'] = {};
  if (!mongoose.isValidObjectId(userId)) {
    return { done: false, dryRun, counts, failedAt: 'read', notFound: true };
  }
  const uid = new Types.ObjectId(userId);

  let user: { email?: string; erasure?: { stage?: ErasureStage } } | null;
  try {
    user = await User.findById(uid).select('email erasure').lean();
    if (!user) {
      const finished = await AuditLog.exists({ userId: uid, eventType: 'account_delete' });
      return finished
        ? { done: true, dryRun, counts }
        : { done: false, dryRun, counts, notFound: true };
    }
  } catch (err) {
    logger.warn({ userId, errName: errName(err) }, 'Account erase: user read failed');
    return { done: false, dryRun, counts, failedAt: 'read' };
  }

  const from = dryRun ? -1 : stageIndex(user.erasure?.stage);
  if (!dryRun && !user.erasure) {
    // Only a locked account is erased: lockAccount is the one way in.
    return { done: false, dryRun, counts, failedAt: 'read' };
  }

  const steps: Array<{ stage: ErasureStage; run: () => Promise<void> }> = [
    {
      stage: 'drafting_erased',
      run: async () => {
        counts.drafting = await eraseRemote('drafting', {
          userId,
          ...(user?.email ? { email: user.email } : {}),
          ...(dryRun ? { dryRun: true } : {}),
        });
      },
    },
    {
      stage: 'billing_erased',
      run: async () => {
        counts.billing = await eraseRemote('billing', {
          userId,
          ...(dryRun ? { dryRun: true } : {}),
        });
      },
    },
    {
      stage: 'auth_data_erased',
      run: async () => {
        counts.auth = { ...(counts.auth ?? {}), ...(await eraseAuthData(userId, dryRun)) };
      },
    },
    {
      stage: 'audit_done',
      run: async () => {
        counts.auth = { ...(counts.auth ?? {}), ...(await eraseAudit(userId, dryRun)) };
      },
    },
  ];

  for (const step of steps) {
    if (stageIndex(step.stage) <= from) continue;
    try {
      await step.run();
      if (!dryRun) {
        await User.updateOne({ _id: uid }, { $set: { 'erasure.stage': step.stage } });
      }
    } catch (err) {
      if (dryRun) {
        logger.warn(
          { userId, dryRun, failedAt: step.stage, errName: errName(err), counts },
          'Account erase dry run step failed',
        );
      } else {
        await recordFailedAttempt(uid, step.stage, err, counts);
      }
      return { done: false, dryRun, counts, failedAt: step.stage };
    }
  }

  if (dryRun) {
    counts.auth = { ...(counts.auth ?? {}), users: 1 };
    logger.info({ userId, counts }, 'Account erase dry run');
    return { done: true, dryRun, counts };
  }

  // Recheck: a drafting or billing request in flight when the lock landed can still write
  // rows after drafting_erased / billing_erased. Both erases are idempotent, so run them once
  // more right before the User document goes. A failure stays pending for the sweep.
  try {
    const drafting = await eraseRemote('drafting', {
      userId,
      ...(user.email ? { email: user.email } : {}),
    });
    const billing = await eraseRemote('billing', { userId });
    counts.recheck = { drafting, billing };
  } catch (err) {
    await recordFailedAttempt(uid, 'recheck', err, counts);
    return { done: false, dryRun, counts, failedAt: 'recheck' };
  }

  try {
    // Last: the User document itself, every field with it (Arjun ruling 1, Ajay e13d474).
    const removed = await User.deleteOne({ _id: uid, erasure: { $exists: true } });
    counts.auth = { ...(counts.auth ?? {}), users: removed.deletedCount };
  } catch (err) {
    await recordFailedAttempt(uid, 'user', err, counts);
    return { done: false, dryRun, counts, failedAt: 'user' };
  }

  logger.info({ userId, counts }, 'Account erased');
  return { done: true, dryRun, counts };
}

// ── DELETE /me ──────────────────────────────────────────────────────────────

export type CloseAccountOutcome =
  | { kind: 'not_found' }
  | { kind: 'not_closable' }
  | { kind: 'wrong_password' }
  | { kind: 'reauth_required' }
  | { kind: 'subscription_active' }
  | { kind: 'billing_unavailable' }
  | { kind: 'done' }
  | { kind: 'pending' };

/**
 * DELETE /me. The caller has a live session (authenticate). Nothing is written before the
 * re-proof and the subscription check pass (Arjun rulings 3 and 4).
 */
export async function closeAccount(
  userId: string,
  accessToken: string,
  body: { password?: unknown; email?: unknown },
): Promise<CloseAccountOutcome> {
  if (!mongoose.isValidObjectId(userId) || userId.toLowerCase() === GOLDEN_SET_USER_ID) {
    return { kind: 'not_found' };
  }
  const user = await User.findById(userId).select('+password email role isActive erasure');
  if (!user || !user.isActive || user.erasure) return { kind: 'not_found' };
  // The founder's own account is never closed here; that stays the runbook (ruling 5).
  if (user.role === 'Admin') return { kind: 'not_closable' };

  // Re-proof (ruling 2). Checked with +password, not authProvider.
  if (typeof user.password === 'string' && user.password.length > 0) {
    const password = body.password;
    if (
      typeof password !== 'string' ||
      password.length === 0 ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      return { kind: 'wrong_password' };
    }
    if (!(await user.comparePassword(password))) return { kind: 'wrong_password' };
  } else {
    const email = body.email;
    if (
      typeof email !== 'string' ||
      email.length > EMAIL_MAX_LENGTH ||
      email.trim().toLowerCase() !== user.email
    ) {
      return { kind: 'wrong_password' };
    }
    const session = await validateSession(userId, hashToken(accessToken));
    const authAt = session?.authAt ? Date.parse(session.authAt) : NaN;
    const now = Date.now();
    // Missing (a session from before T-115c), too old, or in the future: sign in again.
    if (!Number.isFinite(authAt) || now - authAt > REAUTH_WINDOW_MS || authAt > now + 60_000) {
      return { kind: 'reauth_required' };
    }
  }

  // Subscription (ruling 4), still before any write.
  const sub = await fetchSubscriptionStatus(userId);
  if (sub.kind === 'unavailable') return { kind: 'billing_unavailable' };
  if (sub.active) return { kind: 'subscription_active' };

  // First write.
  await lockAccount(userId);
  logger.info({ userId }, 'Account close started; account locked');
  const run = await runAccountErase(userId);
  return run.done ? { kind: 'done' } : { kind: 'pending' };
}

// ── The sweep ───────────────────────────────────────────────────────────────

export const ACCOUNT_ERASE_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
export const ACCOUNT_ERASE_SWEEP_BATCH = 50;

export interface AccountEraseSweepCounts {
  found: number;
  finished: number;
  pending: number;
}

/** One sweep run: resumes every account whose erase has not finished. Never throws. */
export async function runAccountEraseSweep(): Promise<AccountEraseSweepCounts> {
  const counts: AccountEraseSweepCounts = { found: 0, finished: 0, pending: 0 };
  try {
    const users = await User.find({ 'erasure.requestedAt': { $exists: true } })
      .select('_id')
      // Least recently tried first; never tried (no lastAttemptAt) sorts before any date, so a
      // few erases that keep failing cannot starve newer ones.
      .sort({ 'erasure.lastAttemptAt': 1, 'erasure.requestedAt': 1 })
      .limit(ACCOUNT_ERASE_SWEEP_BATCH)
      .lean();
    counts.found = users.length;
    for (const u of users) {
      const run = await runAccountErase(String(u._id));
      if (run.done) counts.finished += 1;
      else counts.pending += 1;
    }
  } catch (err) {
    logger.warn({ errName: errName(err) }, 'Account erase sweep failed');
  }
  if (counts.found > 0) logger.info(counts, 'Account erase sweep');
  return counts;
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

function sweepTick(): void {
  if (sweepRunning) return;
  sweepRunning = true;
  runAccountEraseSweep()
    .catch(() => undefined)
    .finally(() => {
      sweepRunning = false;
    });
}

/**
 * Start the sweep: one run now (an erase cut off by a crash or restart is finished at boot),
 * then every `intervalMs`. Started from index.ts, never from app.ts (the tests import app).
 * The timer is unref'd; a second call is a no-op; runs never overlap.
 */
export function startAccountEraseSweep(intervalMs: number = ACCOUNT_ERASE_SWEEP_INTERVAL_MS): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepTick, intervalMs);
  sweepTimer.unref();
  sweepTick();
}

/** Stop the sweep. Safe to call when it is not running. */
export function stopAccountEraseSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}
