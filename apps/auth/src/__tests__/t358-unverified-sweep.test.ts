/**
 * T-358 round 2 — the unverified-account sweep on the new clock (Ajay 8a2b639, 9e42eea, 3f94ce9):
 * F = firstVerifySentAt (first CONFIRMED send of any verify-link mail), warning =
 * unverifiedNoticeSentAt. Billing and drafting are a mocked global.fetch; in-memory Mongo;
 * ioredis-mock; the email client is mocked (no Redis queue, no SES). Every run gets an explicit
 * `now`.
 *
 * NOW = 2026-10-14T10:00:00Z = 15:30 IST on 14 October. Start of that IST day = 13 Oct 18:30Z.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';
import { Types } from 'mongoose';

import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import {
  GOLDEN_SET_USER_ID,
  lockAccount,
  runAccountEraseSweep,
} from '../services/account-erase.service';
import * as sessionService from '../services/session.service';
import {
  FIRST_NOTICE_GRACE_MS,
  NOTICE_LINK_TTL_MS,
  UNVERIFIED_DELETE_AFTER_DAYS,
  UNVERIFIED_NOTICE_AFTER_DAYS,
  UNVERIFIED_NOTICE_LEAD_DAYS,
  UNVERIFIED_SWEEP_INTERVAL_MS,
  deleteDueFilter,
  formatIstDate,
  istDayStart,
  noticeDeletionDate,
  prepareUnverifiedNotice,
  recordVerifyMailOutcome,
  runUnverifiedSweep,
  startUnverifiedSweep,
  stopUnverifiedSweep,
  unverifiedNoticeIdempotencyKey,
} from '../services/unverified-sweep.service';
import { mintVerifyLink } from '../services/verify-email.service';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-10-14T10:00:00.000Z');
const ago = (ms: number, from: Date = NOW) => new Date(from.getTime() - ms);

const SECRET_EMAIL = 'never.in.logs@example.com';
const SECRET_NAME = 'Neverinlogs Person';

const enqueue = enqueueEmail as jest.Mock;
const raw = (id: string) => User.collection.findOne({ _id: new Types.ObjectId(id) });

interface Seed {
  _id?: Types.ObjectId;
  /** Default: 60 days ago (old enough for every rule that looks at account age). */
  createdAt?: Date;
  /** F: firstVerifySentAt. */
  firstAt?: Date;
  firstVia?: 'verify' | 'notice';
  /** unverifiedNoticeSentAt (the warning notice). */
  warnAt?: Date;
  extra?: Record<string, unknown>;
}
async function seed({
  _id,
  createdAt,
  firstAt,
  firstVia,
  warnAt,
  extra = {},
}: Seed): Promise<string> {
  const id = _id ?? new Types.ObjectId();
  const created = createdAt ?? ago(60 * DAY);
  await User.collection.insertOne({
    _id: id,
    email: `u${String(id)}@example.com`,
    name: SECRET_NAME,
    authProvider: 'email',
    emailVerified: false,
    isActive: true,
    role: 'Advocate',
    createdAt: created,
    updatedAt: created,
    ...(firstAt ? { firstVerifySentAt: firstAt, firstVerifySentVia: firstVia ?? 'verify' } : {}),
    ...(warnAt ? { unverifiedNoticeSentAt: warnAt } : {}),
    ...extra,
  });
  return String(id);
}
/** An account due for deletion at NOW: F 31 days ago, warning 8 days ago. */
const dueForDelete = (extra: Record<string, unknown> = {}) =>
  seed({ firstAt: ago(31 * DAY), warnAt: ago(8 * DAY), extra });

let subscription: () => { status: number; json: unknown } | 'throw';
let eraseCalls: string[];
let failErase: boolean;
let subscriptionCalls: string[];
let infoSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  await redis.flushall();
  jest.clearAllMocks();
  enqueue.mockReset();
  enqueue.mockResolvedValue({ jobId: 'j', queue: 'email:low', deduped: false });
  subscription = () => ({ status: 200, json: { active: false, status: 'none' } });
  eraseCalls = [];
  subscriptionCalls = [];
  failErase = false;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('subscription-status')) {
      subscriptionCalls.push(decodeURIComponent(u.split('/').pop() as string));
      const s = subscription();
      if (s === 'throw') throw new Error(`connect ECONNREFUSED ${SECRET_EMAIL}`);
      return { status: s.status, json: async () => s.json };
    }
    eraseCalls.push(String(JSON.parse(String(init?.body)).userId));
    if (failErase) return { status: 500, json: async () => ({ ok: false }) };
    return { status: 200, json: async () => ({ ok: true, counts: {} }) };
  }) as unknown as typeof fetch;
  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  stopUnverifiedSweep();
  jest.restoreAllMocks();
});

const enqueuedIds = (key?: string) =>
  enqueue.mock.calls
    .filter((c) => !key || (c[0] as { idempotencyKey: string }).idempotencyKey.endsWith(`:${key}`))
    .map((c) => (c[0] as { userId: string }).userId)
    .sort();

describe('constants and date helpers', () => {
  it('30 days from F, 7 days of warning, warning at F + 23 days, 24 h grace, 7-day link, hourly', () => {
    expect(UNVERIFIED_DELETE_AFTER_DAYS).toBe(30);
    expect(UNVERIFIED_NOTICE_LEAD_DAYS).toBe(7);
    expect(UNVERIFIED_NOTICE_AFTER_DAYS).toBe(23);
    expect(FIRST_NOTICE_GRACE_MS).toBe(24 * HOUR);
    expect(NOTICE_LINK_TTL_MS).toBe(7 * DAY);
    expect(UNVERIFIED_SWEEP_INTERVAL_MS).toBe(HOUR);
  });

  it('formatIstDate is D Month YYYY in IST, not UTC', () => {
    expect(formatIstDate(new Date('2026-10-21T10:00:00Z'))).toBe('21 October 2026');
    expect(formatIstDate(new Date('2026-10-20T20:00:00Z'))).toBe('21 October 2026');
    expect(formatIstDate(new Date('2026-10-20T18:29:59.999Z'))).toBe('20 October 2026');
    expect(formatIstDate(new Date('2026-10-20T18:30:00.000Z'))).toBe('21 October 2026');
    expect(formatIstDate(new Date('2026-03-05T00:00:00Z'))).toBe('5 March 2026');
  });

  it('istDayStart is 18:30Z of the previous UTC day for an IST day', () => {
    expect(istDayStart(NOW).toISOString()).toBe('2026-10-13T18:30:00.000Z');
    expect(istDayStart(new Date('2026-10-13T18:30:00.000Z')).toISOString()).toBe(
      '2026-10-13T18:30:00.000Z',
    );
    expect(istDayStart(new Date('2026-10-13T18:29:59.999Z')).toISOString()).toBe(
      '2026-10-12T18:30:00.000Z',
    );
  });

  it('noticeDeletionDate: first notice is now + 30 days; warning is the later of F + 30d and now + 7d', () => {
    expect(noticeDeletionDate('first', NOW).getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(noticeDeletionDate('first', NOW, ago(5 * DAY)).getTime()).toBe(NOW.getTime() + 30 * DAY);
    // F 25 days ago: F + 30d = now + 5d < now + 7d -> now + 7d
    expect(noticeDeletionDate('warning', NOW, ago(25 * DAY)).getTime()).toBe(
      NOW.getTime() + 7 * DAY,
    );
    // F 10 days ago: F + 30d = now + 20d > now + 7d -> F + 30d
    expect(noticeDeletionDate('warning', NOW, ago(10 * DAY)).getTime()).toBe(
      NOW.getTime() + 20 * DAY,
    );
  });

  it('idempotency keys are unverified-notice:<userId>:first and :warning', () => {
    expect(unverifiedNoticeIdempotencyKey('abc', 'first')).toBe('unverified-notice:abc:first');
    expect(unverifiedNoticeIdempotencyKey('abc', 'warning')).toBe('unverified-notice:abc:warning');
  });
});

describe('first notice: no verify-link mail confirmed yet (F null)', () => {
  it('is queued once the account is 24 h old, not before', async () => {
    const young = await seed({ createdAt: ago(23 * HOUR) });
    const edge = await seed({ createdAt: ago(24 * HOUR - 1000) });
    const ok = await seed({ createdAt: ago(24 * HOUR) });
    const old = await seed({ createdAt: ago(45 * DAY) });
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueuedIds('first')).toEqual([ok, old].sort());
    expect(enqueuedIds()).not.toContain(young);
    expect(enqueuedIds()).not.toContain(edge);
    expect(counts.noticesQueued).toBe(2);
  });

  it('uses the key unverified-notice:<id>:first and the userId only', async () => {
    const id = await seed({});
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toEqual({
      template: 'auth.unverifiedDeletionNotice',
      userId: id,
      idempotencyKey: `unverified-notice:${id}:first`,
    });
    expect(JSON.stringify(enqueue.mock.calls)).not.toContain('@');
    expect(JSON.stringify(enqueue.mock.calls)).not.toContain(SECRET_NAME);
  });

  it('an old account with no F is never noticed by age alone: createdAt does not start the clock, F does', async () => {
    const old = await seed({ createdAt: ago(400 * DAY) });
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    // It gets the first notice (which starts F), but is never deleted.
    expect(enqueuedIds('first')).toEqual([old]);
    expect(enqueuedIds('warning')).toEqual([]);
    expect(counts.deleteFound).toBe(0);
    expect(await raw(old)).not.toBeNull();
  });

  it('once F is set (any source) there is no first notice', async () => {
    await seed({ firstAt: ago(2 * DAY), firstVia: 'verify' });
    await seed({ firstAt: ago(2 * DAY), firstVia: 'notice' });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('before F is stamped, a re-run re-enqueues with the same key; the queue dedupes it', async () => {
    const id = await seed({});
    enqueue.mockResolvedValueOnce({ jobId: 'k', queue: 'q', deduped: false });
    enqueue.mockResolvedValueOnce({ jobId: 'k', queue: 'q', deduped: true });
    const first = await runUnverifiedSweep(NOW, { enabled: true });
    const second = await runUnverifiedSweep(NOW, { enabled: true });
    expect(first.noticesQueued).toBe(1);
    expect(second).toMatchObject({ noticesQueued: 0, noticesDeduped: 1 });
    expect(enqueue.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([
      `unverified-notice:${id}:first`,
      `unverified-notice:${id}:first`,
    ]);
  });

  it('after the confirmed send stamps F, the re-run sends nothing', async () => {
    const id = await seed({});
    await runUnverifiedSweep(NOW, { enabled: true });
    await recordVerifyMailOutcome(id, 'notice_first', 'sent', NOW);
    enqueue.mockClear();
    const again = await runUnverifiedSweep(new Date(NOW.getTime() + HOUR), { enabled: true });
    expect(enqueue).not.toHaveBeenCalled();
    expect(again.noticesQueued).toBe(0);
  });

  it('an enqueue failure is counted, logged by userId only, and the next account still goes', async () => {
    const a = await seed({});
    const b = await seed({ createdAt: ago(70 * DAY) });
    enqueue.mockRejectedValueOnce(new Error(`redis down for ${SECRET_EMAIL}`));
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts.noticeEnqueueFailed).toBe(1);
    expect(counts.noticesQueued).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(2);
    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain(SECRET_EMAIL);
    expect([a, b].some((id) => logged.includes(id))).toBe(true);
  });
});

describe('warning notice: F at least 23 days ago', () => {
  it('queued for F 23 / 29 / 30 / 31 days ago, not for 22 days', async () => {
    const d22 = await seed({ firstAt: ago(22 * DAY) });
    const d22b = await seed({ firstAt: ago(23 * DAY - 1000) });
    const d23 = await seed({ firstAt: ago(23 * DAY) });
    const d29 = await seed({ firstAt: ago(29 * DAY) });
    const d30 = await seed({ firstAt: ago(30 * DAY) });
    const d31 = await seed({ firstAt: ago(31 * DAY) });
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueuedIds('warning')).toEqual([d23, d29, d30, d31].sort());
    expect(enqueuedIds()).not.toContain(d22);
    expect(enqueuedIds()).not.toContain(d22b);
    expect(counts.noticesQueued).toBe(4);
  });

  it('the clock is F, not sign-up: a 400-day-old account whose F is 5 days old gets no warning', async () => {
    await seed({ createdAt: ago(400 * DAY), firstAt: ago(5 * DAY) });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('uses the key unverified-notice:<id>:warning, distinct from the first notice key', async () => {
    const id = await seed({ firstAt: ago(25 * DAY), firstVia: 'notice' });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueue.mock.calls[0][0]).toEqual({
      template: 'auth.unverifiedDeletionNotice',
      userId: id,
      idempotencyKey: `unverified-notice:${id}:warning`,
    });
    expect(unverifiedNoticeIdempotencyKey(id, 'warning')).not.toBe(
      unverifiedNoticeIdempotencyKey(id, 'first'),
    );
  });

  it('a warning already confirmed gets no second warning (re-run sends nothing)', async () => {
    const id = await seed({ firstAt: ago(25 * DAY) });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(await recordVerifyMailOutcome(id, 'notice_warning', 'sent', NOW)).toMatchObject({
      warningStamped: true,
    });
    enqueue.mockClear();
    await runUnverifiedSweep(new Date(NOW.getTime() + HOUR), { enabled: true });
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('who is never selected', () => {
  it('verified, Google (authProvider or googleId), Admin, golden-set and erasure rows: no notice, never deleted', async () => {
    const patches: Array<Record<string, unknown>> = [
      { emailVerified: true },
      { authProvider: 'google' },
      { googleId: 'g-12345' },
      { role: 'Admin' },
      { erasure: { requestedAt: ago(DAY), stage: 'locked' } },
    ];
    const ids: string[] = [];
    for (const extra of patches) {
      // due for deletion by every clock rule; F null (would get the first notice); F 25d (warning)
      ids.push(await seed({ firstAt: ago(60 * DAY), warnAt: ago(20 * DAY), extra }));
      ids.push(await seed({ extra }));
      ids.push(await seed({ firstAt: ago(25 * DAY), extra }));
    }
    ids.push(
      await seed({
        _id: new Types.ObjectId(GOLDEN_SET_USER_ID),
        firstAt: ago(60 * DAY),
        warnAt: ago(20 * DAY),
      }),
    );
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueue).not.toHaveBeenCalled();
    expect(eraseCalls).toEqual([]);
    expect(subscriptionCalls).toEqual([]);
    expect(counts).toMatchObject({
      noticesQueued: 0,
      deleteFound: 0,
      deleted: 0,
      dueNoticeUnsent: 0,
    });
    for (const id of ids) expect(await raw(id)).not.toBeNull();
  });

  it('the golden-set user with no F or a warning due gets no notice either', async () => {
    await seed({ _id: new Types.ObjectId(GOLDEN_SET_USER_ID) });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('an empty-string or null googleId still counts as unverified', async () => {
    const a = await seed({ extra: { googleId: '' } });
    const b = await seed({ extra: { googleId: null } });
    const c = await seed({ extra: { emailVerified: undefined } });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueuedIds('first')).toEqual([a, b, c].sort());
  });

  it('isActive:false unverified accounts are included (first notice, warning and deletion)', async () => {
    const del = await dueForDelete({ isActive: false });
    const first = await seed({ extra: { isActive: false } });
    const warn = await seed({ firstAt: ago(25 * DAY), extra: { isActive: false } });
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueuedIds('first')).toEqual([first]);
    expect(enqueuedIds('warning')).toEqual([warn]);
    expect(counts.deleted).toBe(1);
    expect(await raw(del)).toBeNull();
  });
});

describe('deletion timing: F + 30 days (end of that IST day) and 7+ days after the warning', () => {
  const del = async (firstAt: Date | undefined, warnAt: Date | undefined, now = NOW) => {
    const id = await seed({ firstAt, warnAt });
    const counts = await runUnverifiedSweep(now, { enabled: true });
    return { id, counts, gone: (await raw(id)) === null };
  };

  it('F 29 days ago: kept', async () => {
    expect((await del(ago(29 * DAY), ago(8 * DAY))).gone).toBe(false);
  });
  it('F 30 days ago exactly: kept (the 30th day has not ended in IST)', async () => {
    expect((await del(ago(30 * DAY), ago(8 * DAY))).gone).toBe(false);
  });
  it('F 30 days + 15h ago (still inside the IST day): kept', async () => {
    expect((await del(ago(30 * DAY + 15 * HOUR), ago(8 * DAY))).gone).toBe(false);
  });
  it('F 30 days + 16h ago (the IST day ended): deleted', async () => {
    expect((await del(ago(30 * DAY + 16 * HOUR), ago(8 * DAY))).gone).toBe(true);
  });
  it('F 31 days ago with the warning 8 days ago: deleted', async () => {
    const r = await del(ago(31 * DAY), ago(8 * DAY));
    expect(r.gone).toBe(true);
    expect(r.counts.deleted).toBe(1);
    expect(eraseCalls).toContain(r.id);
  });
  it('F 31 days ago but the warning only 6 days ago: kept (at least 7 days after the warning)', async () => {
    expect((await del(ago(31 * DAY), ago(6 * DAY))).gone).toBe(false);
  });
  it('warning 7d + 15h ago: kept; 7d + 16h ago: deleted', async () => {
    const kept = await seed({ firstAt: ago(90 * DAY), warnAt: ago(7 * DAY + 15 * HOUR) });
    const gone = await seed({ firstAt: ago(90 * DAY), warnAt: ago(7 * DAY + 16 * HOUR) });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(await raw(kept)).not.toBeNull();
    expect(await raw(gone)).toBeNull();
  });
  it('an old F with a fresh warning waits seven days (end of the IST day)', async () => {
    const id = await seed({ firstAt: ago(90 * DAY), warnAt: NOW });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(await raw(id)).not.toBeNull();
    await runUnverifiedSweep(new Date(NOW.getTime() + 6 * DAY), { enabled: true });
    expect(await raw(id)).not.toBeNull();
    await runUnverifiedSweep(new Date(NOW.getTime() + 7 * DAY), { enabled: true });
    expect(await raw(id)).not.toBeNull();
    await runUnverifiedSweep(new Date(NOW.getTime() + 8 * DAY), { enabled: true });
    expect(await raw(id)).toBeNull();
  });

  it('createdAt plays no part: an account created yesterday with F and a warning long ago is deleted; one created 400 days ago with F 10 days ago is kept', async () => {
    const fresh = await seed({
      createdAt: ago(DAY),
      firstAt: ago(40 * DAY),
      warnAt: ago(10 * DAY),
    });
    const ancient = await seed({
      createdAt: ago(400 * DAY),
      firstAt: ago(10 * DAY),
      warnAt: ago(9 * DAY),
    });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(await raw(fresh)).toBeNull();
    expect(await raw(ancient)).not.toBeNull();
  });

  it('F null is never deleted, however old the account and whatever the warning stamp says', async () => {
    const a = await seed({ createdAt: ago(900 * DAY) });
    const b = await seed({ createdAt: ago(900 * DAY), warnAt: ago(100 * DAY) });
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts.deleteFound).toBe(0);
    expect(eraseCalls).toEqual([]);
    expect(await raw(a)).not.toBeNull();
    expect(await raw(b)).not.toBeNull();
  });

  it('F past 30 days but no confirmed warning is never deleted (held)', async () => {
    const id = await seed({ firstAt: ago(100 * DAY) });
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts.deleteFound).toBe(0);
    expect(await raw(id)).not.toBeNull();
  });

  it('nothing is deleted before the end of the IST day the warning stated', async () => {
    const F = ago(25 * DAY);
    const id = await seed({ firstAt: F });
    const prepared = await prepareUnverifiedNotice(id, NOW);
    expect(prepared).toMatchObject({
      kind: 'ready',
      notice: 'warning',
      deletionDate: '21 October 2026',
    });
    expect(await recordVerifyMailOutcome(id, 'notice_warning', 'sent', NOW)).toMatchObject({
      warningStamped: true,
      firstStamped: false,
    });
    await runUnverifiedSweep(new Date('2026-10-21T18:29:59.999Z'), { enabled: true }); // 23:59:59.999 IST
    expect(await raw(id)).not.toBeNull();
    await runUnverifiedSweep(new Date('2026-10-21T18:30:00.000Z'), { enabled: true }); // 00:00 IST on the 22nd
    expect(await raw(id)).toBeNull();
  });

  it('F-based date: F exactly 30 days before deletion day boundary (IST day of F + 30d)', async () => {
    // F = 21 Sep 10:00Z; F + 30d = 21 Oct 10:00Z (IST 21 Oct); deletable from 21 Oct 18:30Z.
    const F = new Date('2026-09-21T10:00:00.000Z');
    const id = await seed({ firstAt: F, warnAt: new Date('2026-10-10T10:00:00.000Z') });
    await runUnverifiedSweep(new Date('2026-10-21T18:29:59.999Z'), { enabled: true });
    expect(await raw(id)).not.toBeNull();
    await runUnverifiedSweep(new Date('2026-10-21T18:30:00.000Z'), { enabled: true });
    expect(await raw(id)).toBeNull();
  });

  it('the select filter and the lock filter are the same function of NOW', () => {
    const f = JSON.stringify(deleteDueFilter(NOW));
    expect(f).toContain('firstVerifySentAt');
    expect(f).toContain('unverifiedNoticeSentAt');
    expect(f).not.toContain('createdAt');
    expect(f).toContain('2026-09-13T18:30:00.000Z'); // todayStart - 30d
    expect(f).toContain('2026-10-06T18:30:00.000Z'); // todayStart - 7d
  });
});

describe('the clock stamps (recordVerifyMailOutcome)', () => {
  const rec = (
    id: string,
    mail: 'verify' | 'notice_first' | 'notice_warning',
    outcome: 'sent' | 'bounced' = 'sent',
    now = NOW,
  ) => recordVerifyMailOutcome(id, mail, outcome, now);

  it('a verify email sets F once, via "verify"; the warning is untouched', async () => {
    const id = await seed({});
    expect(await rec(id, 'verify')).toEqual({
      kind: 'recorded',
      firstStamped: true,
      warningStamped: false,
    });
    const u = await raw(id);
    expect(u!.firstVerifySentAt).toEqual(NOW);
    expect(u!.firstVerifySentVia).toBe('verify');
    expect(u!.unverifiedNoticeSentAt).toBeUndefined();
  });

  it('a resend of the verify email never moves F', async () => {
    const id = await seed({});
    await rec(id, 'verify', 'sent', ago(3 * DAY));
    expect(await rec(id, 'verify', 'sent', NOW)).toEqual({
      kind: 'recorded',
      firstStamped: false,
      warningStamped: false,
    });
    expect((await raw(id))!.firstVerifySentAt).toEqual(ago(3 * DAY));
  });

  it('the first notice sets F via "notice"; it never counts as the warning', async () => {
    const id = await seed({});
    expect(await rec(id, 'notice_first')).toEqual({
      kind: 'recorded',
      firstStamped: true,
      warningStamped: false,
    });
    const u = await raw(id);
    expect(u!.firstVerifySentVia).toBe('notice');
    expect(u!.unverifiedNoticeSentAt).toBeUndefined();
  });

  it('a verify email after the notice does not change F or its source', async () => {
    const id = await seed({});
    await rec(id, 'notice_first', 'sent', ago(2 * DAY));
    expect(await rec(id, 'verify')).toMatchObject({ firstStamped: false });
    const u = await raw(id);
    expect(u!.firstVerifySentAt).toEqual(ago(2 * DAY));
    expect(u!.firstVerifySentVia).toBe('notice');
  });

  it('the notice after a verify email does not change F or its source', async () => {
    const id = await seed({});
    await rec(id, 'verify', 'sent', ago(2 * DAY));
    await rec(id, 'notice_first');
    const u = await raw(id);
    expect(u!.firstVerifySentAt).toEqual(ago(2 * DAY));
    expect(u!.firstVerifySentVia).toBe('verify');
  });

  it('a warning report on an account with F stamps the warning only; F is unchanged', async () => {
    const id = await seed({ firstAt: ago(25 * DAY) });
    expect(await rec(id, 'notice_warning')).toEqual({
      kind: 'recorded',
      firstStamped: false,
      warningStamped: true,
    });
    const u = await raw(id);
    expect(u!.unverifiedNoticeSentAt).toEqual(NOW);
    expect(u!.firstVerifySentAt).toEqual(ago(25 * DAY));
  });

  it('the F-setting call can never also stamp the warning (warning report with F null sets F only)', async () => {
    const id = await seed({});
    expect(await rec(id, 'notice_warning')).toEqual({
      kind: 'recorded',
      firstStamped: true,
      warningStamped: false,
    });
    const u = await raw(id);
    expect(u!.firstVerifySentAt).toEqual(NOW);
    expect(u!.unverifiedNoticeSentAt).toBeUndefined();
  });

  it('the first notice and the warning are two different sends: one stamp each', async () => {
    const id = await seed({});
    await rec(id, 'notice_first', 'sent', ago(25 * DAY));
    // a duplicate of the first report must not become the warning
    expect(await rec(id, 'notice_first', 'sent', NOW)).toMatchObject({
      firstStamped: false,
      warningStamped: false,
    });
    expect((await raw(id))!.unverifiedNoticeSentAt).toBeUndefined();
    expect(await rec(id, 'notice_warning', 'sent', NOW)).toMatchObject({ warningStamped: true });
  });

  it('the warning is stamped once: a repeat never moves it', async () => {
    const id = await seed({ firstAt: ago(25 * DAY) });
    await rec(id, 'notice_warning', 'sent', ago(HOUR));
    expect(await rec(id, 'notice_warning', 'bounced', NOW)).toMatchObject({
      warningStamped: false,
    });
    expect((await raw(id))!.unverifiedNoticeSentAt).toEqual(ago(HOUR));
  });

  it('a bounce counts as sent for every mail kind', async () => {
    const a = await seed({});
    const b = await seed({ firstAt: ago(25 * DAY) });
    expect(await rec(a, 'verify', 'bounced')).toMatchObject({ firstStamped: true });
    expect(await rec(b, 'notice_warning', 'bounced')).toMatchObject({ warningStamped: true });
  });

  it.each([
    ['verified', { emailVerified: true }],
    ['Google provider', { authProvider: 'google' }],
    ['googleId', { googleId: 'g-9' }],
    ['Admin', { role: 'Admin' }],
    ['being erased', { erasure: { requestedAt: NOW, stage: 'locked' } }],
  ])('nothing is written for an account that is %s', async (_l, extra) => {
    const id = await seed({ firstAt: ago(25 * DAY), extra });
    const noF = await seed({ extra });
    expect(await rec(id, 'notice_warning')).toMatchObject({
      kind: 'recorded',
      firstStamped: false,
      warningStamped: false,
    });
    expect(await rec(noF, 'verify')).toMatchObject({ firstStamped: false });
    expect((await raw(id))!.unverifiedNoticeSentAt).toBeUndefined();
    expect((await raw(noF))!.firstVerifySentAt).toBeUndefined();
  });

  it('unknown user or non-ObjectId: not_found', async () => {
    expect(await rec(String(new Types.ObjectId()), 'verify')).toEqual({
      kind: 'not_found',
      firstStamped: false,
      warningStamped: false,
    });
    expect(await rec('nope', 'verify')).toMatchObject({ kind: 'not_found' });
  });
});

describe('prepareUnverifiedNotice: which notice, which variant, which link', () => {
  it('F null and 24 h old: the first notice, variant A, date now + 30 days', async () => {
    const id = await seed({});
    expect(await prepareUnverifiedNotice(id, NOW)).toMatchObject({
      kind: 'ready',
      notice: 'first',
      variant: 'A',
      deletionDate: '13 November 2026',
    });
  });

  it('F 25 days ago and no warning: the warning, variant A, date now + 7 days', async () => {
    const id = await seed({ firstAt: ago(25 * DAY) });
    expect(await prepareUnverifiedNotice(id, NOW)).toMatchObject({
      notice: 'warning',
      variant: 'A',
      deletionDate: '21 October 2026',
    });
  });

  it('IST: a warning prepared at 01:30 IST states the IST date', async () => {
    const id = await seed({ firstAt: new Date('2026-09-20T00:00:00Z') });
    const t = new Date('2026-10-14T20:00:00Z'); // 01:30 IST on 15 October
    expect(await prepareUnverifiedNotice(id, t)).toMatchObject({ deletionDate: '22 October 2026' });
  });

  it('variant B (deactivated): no link, nothing minted, same dates', async () => {
    const first = await seed({ extra: { isActive: false } });
    const warn = await seed({ firstAt: ago(25 * DAY), extra: { isActive: false } });
    const a = await prepareUnverifiedNotice(first, NOW);
    const b = await prepareUnverifiedNotice(warn, NOW);
    expect(a).toMatchObject({
      kind: 'ready',
      notice: 'first',
      variant: 'B',
      deletionDate: '13 November 2026',
    });
    expect(b).toMatchObject({
      kind: 'ready',
      notice: 'warning',
      variant: 'B',
      deletionDate: '21 October 2026',
    });
    expect(a).not.toHaveProperty('link');
    expect(b).not.toHaveProperty('link');
    for (const id of [first, warn]) {
      const u = await raw(id);
      expect(u!.emailVerifyTokenHash).toBeUndefined();
      expect(u!.emailVerifyExpires).toBeUndefined();
    }
  });

  it('variant A mints a link; a fresh prepare replaces the earlier one', async () => {
    const id = await seed({});
    const r = await prepareUnverifiedNotice(id, NOW);
    expect(r.kind === 'ready' && r.link).toMatch(/token=[0-9a-f]{64}/);
    const h1 = (await raw(id))!.emailVerifyTokenHash;
    expect(h1).toBeDefined();
    await prepareUnverifiedNotice(id, NOW);
    expect((await raw(id))!.emailVerifyTokenHash).not.toBe(h1);
  });

  it("the notice's link lasts 7 days; an ordinary verify link lasts 24 hours", async () => {
    const REAL = Date.now();
    const id = await seed({ createdAt: new Date(REAL - 3 * DAY) });
    const r = await prepareUnverifiedNotice(id, new Date(REAL));
    expect(r.kind).toBe('ready');
    const exp = (await raw(id))!.emailVerifyExpires as Date;
    expect(Math.abs(exp.getTime() - (REAL + 7 * DAY))).toBeLessThan(60_000);

    const other = await seed({});
    const m = await mintVerifyLink(other);
    expect(m.kind).toBe('minted');
    const exp2 = (await raw(other))!.emailVerifyExpires as Date;
    expect(Math.abs(exp2.getTime() - (Date.now() + 24 * HOUR))).toBeLessThan(60_000);
  });

  it.each([
    ['younger than 24 h with F null', () => seed({ createdAt: ago(23 * HOUR) })],
    ['F set but only 10 days ago', () => seed({ firstAt: ago(10 * DAY) })],
    ['warning already confirmed', () => seed({ firstAt: ago(25 * DAY), warnAt: ago(HOUR) })],
    ['verified', () => seed({ firstAt: ago(25 * DAY), extra: { emailVerified: true } })],
    ['Google', () => seed({ extra: { authProvider: 'google' } })],
    ['Admin', () => seed({ extra: { role: 'Admin' } })],
    ['being erased', () => seed({ extra: { erasure: { requestedAt: NOW, stage: 'locked' } } })],
    ['golden-set', () => seed({ _id: new Types.ObjectId(GOLDEN_SET_USER_ID) })],
  ])('not_eligible, nothing minted: %s', async (_l, make) => {
    const id = await make();
    expect(await prepareUnverifiedNotice(id, NOW)).toEqual({ kind: 'not_eligible' });
    expect((await raw(id))!.emailVerifyTokenHash).toBeUndefined();
  });

  it('not_found for unknown or malformed ids', async () => {
    expect(await prepareUnverifiedNotice(String(new Types.ObjectId()), NOW)).toEqual({
      kind: 'not_found',
    });
    expect(await prepareUnverifiedNotice('nope', NOW)).toEqual({ kind: 'not_found' });
  });

  it('prepare stamps nothing', async () => {
    const id = await seed({});
    await prepareUnverifiedNotice(id, NOW);
    const u = await raw(id);
    expect(u!.firstVerifySentAt).toBeUndefined();
    expect(u!.unverifiedNoticeSentAt).toBeUndefined();
  });
});

describe('hold: counts of accounts held for want of a confirmed send', () => {
  it('heldNoFirstEmail and heldNoWarning, summed in dueNoticeUnsent; warn carries counts only', async () => {
    await seed({}); // F null, old -> first email held
    await seed({ createdAt: ago(30 * HOUR) }); // F null, 30h -> first email held
    await seed({ createdAt: ago(2 * HOUR) }); // too new: not counted
    await seed({ firstAt: ago(31 * DAY) }); // no warning yet -> held
    await seed({ firstAt: ago(30 * DAY) }); // exactly 30d, no warning -> held
    await seed({ firstAt: ago(25 * DAY) }); // 25d: warning due but not past 30d -> not held
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts.heldNoFirstEmail).toBe(2);
    expect(counts.heldNoWarning).toBe(2);
    expect(counts.dueNoticeUnsent).toBe(4);
    expect(counts.deleted).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      { dueNoticeUnsent: 4, heldNoFirstEmail: 2, heldNoWarning: 2 },
      expect.stringContaining('held'),
    );
  });

  it('no warn when nothing is held', async () => {
    await seed({ firstAt: ago(25 * DAY) });
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts.dueNoticeUnsent).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a hard-bounced warning counts as sent: the hold ends 7 days later', async () => {
    const id = await seed({ firstAt: ago(45 * DAY) });
    expect(await recordVerifyMailOutcome(id, 'notice_warning', 'bounced', NOW)).toMatchObject({
      warningStamped: true,
    });
    expect((await runUnverifiedSweep(NOW, { enabled: true })).heldNoWarning).toBe(0);
    await runUnverifiedSweep(new Date(NOW.getTime() + 8 * DAY), { enabled: true });
    expect(await raw(id)).toBeNull();
  });
});

describe('conditional lock (a user who verifies mid-sweep is never deleted)', () => {
  it('verified between the select and the lock: nothing written, no session killed, no erase', async () => {
    const id = await dueForDelete();
    const killSessions = jest.spyOn(sessionService, 'deleteAllUserSessions');
    const orig = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (u: string, i?: RequestInit) => {
      const r = await orig(u, i);
      if (String(u).includes('subscription-status')) {
        // The billing check sits between the select and the lock: the user verifies there.
        await User.collection.updateOne(
          { _id: new Types.ObjectId(id) },
          { $set: { emailVerified: true } },
        );
      }
      return r;
    }) as unknown as typeof fetch;

    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts.skippedNoLongerDue).toBe(1);
    expect(counts.deleted).toBe(0);
    const u = await raw(id);
    expect(u).not.toBeNull();
    expect(u!.erasure).toBeUndefined();
    expect(u!.isActive).toBe(true);
    expect(killSessions).not.toHaveBeenCalled();
    expect(eraseCalls).toEqual([]);
  });

  it('lockAccount with onlyIf returns false and writes nothing when the filter no longer matches', async () => {
    const id = await dueForDelete();
    await User.collection.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { emailVerified: true } },
    );
    const kill = jest.spyOn(sessionService, 'deleteAllUserSessions');
    expect(await lockAccount(id, { onlyIf: deleteDueFilter(NOW) })).toBe(false);
    const u = await raw(id);
    expect(u!.erasure).toBeUndefined();
    expect(u!.isActive).toBe(true);
    expect(kill).not.toHaveBeenCalled();
  });

  it.each([
    ['gained a googleId', { googleId: 'g-late' }],
    ['switched to google', { authProvider: 'google' }],
    ['promoted to Admin', { role: 'Admin' }],
    ['picked up an erasure marker', { erasure: { requestedAt: new Date(), stage: 'locked' } }],
  ])('lockAccount re-checks everything: an account that %s is not locked', async (_l, patch) => {
    const id = await dueForDelete();
    await User.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: patch });
    const before = await raw(id);
    expect(await lockAccount(id, { onlyIf: deleteDueFilter(NOW) })).toBe(false);
    expect(await raw(id)).toEqual(before);
  });

  it('lockAccount re-checks the clock: a warning that is too fresh, or an F that is too new, is not locked', async () => {
    const freshWarn = await seed({ firstAt: ago(31 * DAY), warnAt: NOW });
    const newF = await seed({ firstAt: ago(10 * DAY), warnAt: ago(8 * DAY) });
    const noF = await seed({ warnAt: ago(8 * DAY) });
    const noWarn = await seed({ firstAt: ago(31 * DAY) });
    for (const id of [freshWarn, newF, noF, noWarn]) {
      expect(await lockAccount(id, { onlyIf: deleteDueFilter(NOW) })).toBe(false);
      expect((await raw(id))!.erasure).toBeUndefined();
    }
  });

  it('lockAccount without onlyIf keeps the T-115c behaviour and returns true', async () => {
    const id = await seed({ extra: { emailVerified: true } });
    expect(await lockAccount(id)).toBe(true);
    const u = await raw(id);
    expect(u!.isActive).toBe(false);
    expect(u!.erasure.stage).toBe('locked');
  });

  it('a matching conditional lock locks and kills the sessions', async () => {
    const id = await dueForDelete();
    const kill = jest.spyOn(sessionService, 'deleteAllUserSessions');
    expect(await lockAccount(id, { onlyIf: deleteDueFilter(NOW) })).toBe(true);
    expect(kill).toHaveBeenCalledWith(id);
    expect((await raw(id))!.erasure.stage).toBe('locked');
  });
});

describe('billing guard', () => {
  it('an active plan: skipped and counted, never locked, no loop (one check)', async () => {
    const id = await dueForDelete();
    subscription = () => ({ status: 200, json: { active: true, status: 'active' } });
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts.skippedSubscriptionActive).toBe(1);
    expect(counts.deleted).toBe(0);
    expect(subscriptionCalls).toEqual([id]);
    expect(eraseCalls).toEqual([]);
    const u = await raw(id);
    expect(u!.erasure).toBeUndefined();
    expect(u!.isActive).toBe(true);
  });

  it.each([
    ['HTTP 409', () => ({ status: 409, json: { error: 'x' } })],
    ['HTTP 500', () => ({ status: 500, json: {} })],
    ['malformed body', () => ({ status: 200, json: { nope: true } })],
    ['network error', () => 'throw' as const],
  ])('billing down (%s): skipped and counted, not deleted, not looped', async (_l, impl) => {
    const id = await dueForDelete();
    subscription = impl;
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts.skippedBillingUnavailable).toBe(1);
    expect(counts.deleted).toBe(0);
    expect(subscriptionCalls).toEqual([id]);
    expect(eraseCalls).toEqual([]);
    expect((await raw(id))!.erasure).toBeUndefined();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(SECRET_EMAIL);
  });

  it('one account on a plan does not stop the next one being deleted', async () => {
    const first = await seed({ firstAt: ago(40 * DAY), warnAt: ago(10 * DAY) });
    const second = await seed({ firstAt: ago(35 * DAY), warnAt: ago(10 * DAY) });
    subscription = (() => {
      let n = 0;
      return () => {
        n += 1;
        return { status: 200, json: { active: n === 1, status: n === 1 ? 'active' : 'none' } };
      };
    })();
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts).toMatchObject({ skippedSubscriptionActive: 1, deleted: 1 });
    expect(await raw(first)).not.toBeNull();
    expect(await raw(second)).toBeNull();
  });
});

describe('failed erase', () => {
  it('stays locked for the 10-minute T-115c sweep; this sweep does not reselect it', async () => {
    const id = await dueForDelete();
    failErase = true;
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts).toMatchObject({ deleted: 0, erasePending: 1 });
    const u = await raw(id);
    expect(u!.erasure.stage).toBe('locked');
    expect(u!.isActive).toBe(false);

    eraseCalls = [];
    const again = await runUnverifiedSweep(NOW, { enabled: true });
    expect(again).toMatchObject({ deleteFound: 0, erasePending: 0 });
    expect(eraseCalls).toEqual([]);

    failErase = false;
    expect(await runAccountEraseSweep()).toEqual({ found: 1, finished: 1, pending: 0 });
    expect(await raw(id)).toBeNull();
  });
});

describe('the sweep never throws', () => {
  it('a database failure in each step is swallowed and logged without values', async () => {
    jest.spyOn(User, 'find').mockImplementation((() => {
      throw new Error(`mongo exploded for ${SECRET_EMAIL}`);
    }) as never);
    jest
      .spyOn(User, 'countDocuments')
      .mockRejectedValue(new Error(`count failed for ${SECRET_EMAIL}`));
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(counts.deleted).toBe(0);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(SECRET_EMAIL);
    expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe('logs carry counts and user ids only', () => {
  it('a full run with notice, delete, skip and failure paths never logs an address or a name', async () => {
    await seed({});
    await seed({ firstAt: ago(25 * DAY) });
    await dueForDelete();
    await seed({ firstAt: ago(50 * DAY) });
    enqueue.mockRejectedValueOnce(new Error(`boom ${SECRET_EMAIL} ${SECRET_NAME}`));
    await runUnverifiedSweep(NOW, { enabled: true });
    subscription = 'throw' as never;
    await dueForDelete();
    await runUnverifiedSweep(NOW, { enabled: true });
    const text = JSON.stringify([infoSpy.mock.calls, warnSpy.mock.calls, errorSpy.mock.calls]);
    expect(text).not.toMatch(/@/);
    expect(text).not.toContain(SECRET_NAME);
    expect(text).not.toContain('example.com');
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ noticesQueued: expect.any(Number), deleted: expect.any(Number) }),
      'Unverified account sweep',
    );
  });

  it('prepare and outcome log the userId and keywords, never the address, name or link', async () => {
    const id = await seed({ extra: { email: SECRET_EMAIL } });
    await prepareUnverifiedNotice(id, NOW);
    await recordVerifyMailOutcome(id, 'notice_first', 'sent', NOW);
    await recordVerifyMailOutcome(id, 'notice_warning', 'sent', NOW);
    const b = await seed({ extra: { isActive: false } });
    await prepareUnverifiedNotice(b, NOW);
    const text = JSON.stringify([infoSpy.mock.calls, warnSpy.mock.calls, errorSpy.mock.calls]);
    expect(text).not.toContain(SECRET_EMAIL);
    expect(text).not.toContain(SECRET_NAME);
    expect(text).not.toContain('verify-email');
    expect(text).not.toContain('token');
    expect(text).toContain(id);
  });
});

describe('timer: boot run, hourly tick, stop, no overlap (switch off: each run is three counts)', () => {
  /** Captures the interval callback without arming a real timer. */
  function startCapturing(intervalMs?: number) {
    const cb: { fn: (() => void) | null; ms: number | undefined } = { fn: null, ms: undefined };
    const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    const setSpy = jest.spyOn(global, 'setInterval').mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      cb.fn = fn;
      cb.ms = ms;
      return timer;
    }) as never);
    const clearSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => undefined);
    startUnverifiedSweep(intervalMs);
    setSpy.mockRestore();
    return { cb, timer, clearSpy };
  }
  // A previous test's run may still be in flight (the no-overlap flag is module state and would
  // skip this test's boot run): let it finish first.
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
  const waitUntil = async (fn: () => boolean) => {
    for (let i = 0; i < 1000 && !fn(); i += 1) await new Promise((r) => setTimeout(r, 10));
    expect(fn()).toBe(true);
  };

  it('runs once at boot, is hourly by default, unref-ed, and ticks run again', async () => {
    const count = jest.spyOn(User, 'countDocuments');
    const { cb, timer } = startCapturing();
    expect(cb.ms).toBe(60 * 60 * 1000);
    expect(timer.unref).toHaveBeenCalled();
    await waitUntil(() => count.mock.calls.length >= 1);
    // let the boot run finish before ticking
    await new Promise((r) => setTimeout(r, 50));
    cb.fn!();
    await waitUntil(() => count.mock.calls.length >= 4);
  });

  it('a second start is a no-op', async () => {
    const count = jest.spyOn(User, 'countDocuments');
    const first = startCapturing();
    await waitUntil(() => count.mock.calls.length >= 1);
    const setSpy = jest.spyOn(global, 'setInterval');
    startUnverifiedSweep();
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
    await new Promise((r) => setTimeout(r, 50));
    expect(count.mock.calls.length).toBeLessThanOrEqual(3); // one run (three counts while the switch is off), not two
    first.clearSpy.mockRestore();
  });

  it('a tick during a running sweep is skipped (no overlap); the next one runs', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<number>((r) => {
      release = () => r(0);
    });
    const count = jest.spyOn(User, 'countDocuments').mockImplementationOnce((() => gate) as never);
    const { cb } = startCapturing();
    await waitUntil(() => count.mock.calls.length >= 1);
    cb.fn!();
    cb.fn!();
    await new Promise((r) => setTimeout(r, 50));
    expect(count.mock.calls.length).toBe(1); // blocked in the first run; the ticks were skipped
    release();
    await new Promise((r) => setTimeout(r, 100));
    cb.fn!();
    await waitUntil(() => count.mock.calls.length >= 4);
  });

  it('a tick whose run fails still frees the lock', async () => {
    const count = jest.spyOn(User, 'countDocuments');
    jest.spyOn(User, 'find').mockImplementation((() => {
      throw new Error('x');
    }) as never);
    const { cb } = startCapturing();
    await waitUntil(() => count.mock.calls.length >= 1);
    await new Promise((r) => setTimeout(r, 50));
    cb.fn!();
    await waitUntil(() => count.mock.calls.length >= 4);
  });

  it('stop clears the interval; stop when not running is safe; start works again after stop', async () => {
    const count = jest.spyOn(User, 'countDocuments');
    const { timer, clearSpy } = startCapturing();
    await waitUntil(() => count.mock.calls.length >= 1);
    stopUnverifiedSweep();
    expect(clearSpy).toHaveBeenCalledWith(timer);
    expect(() => stopUnverifiedSweep()).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
    startCapturing();
    await waitUntil(() => count.mock.calls.length >= 4);
  });
});

describe('wiring in index.ts (source check: index.ts opens the port, so it is not imported)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const src: string = require('fs').readFileSync(
    require('path').resolve(__dirname, '../index.ts'),
    'utf8',
  );
  it('starts the sweep at boot, after the database connects, and stops it on SIGTERM', () => {
    expect(src).toContain(
      "import { startUnverifiedSweep, stopUnverifiedSweep } from './services/unverified-sweep.service';",
    );
    expect(src.indexOf('startUnverifiedSweep();')).toBeGreaterThan(src.indexOf('connectDB'));
    expect(src).toMatch(/SIGTERM[\s\S]*stopUnverifiedSweep\(\);/);
  });
  it('app.ts (imported by tests) never starts the sweep', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const app: string = require('fs').readFileSync(
      require('path').resolve(__dirname, '../app.ts'),
      'utf8',
    );
    expect(app).not.toContain('startUnverifiedSweep');
    expect(app).toContain('internal-unverified-notice.routes');
  });
});
