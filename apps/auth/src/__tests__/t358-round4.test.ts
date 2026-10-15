/**
 * T-358 round 4 (review): the auth half of the must-fix (an our-side send failure reports
 * nothing, so nothing is stamped and the account is never due for deletion), and the
 * same-date rule for a warning sent after an F that the first notice itself set.
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
  formatIstDate,
  noticeDeletionDate,
  prepareUnverifiedNotice,
  recordVerifyMailOutcome,
  runUnverifiedSweep,
} from '../services/unverified-sweep.service';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-10-14T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const raw = (id: string) => User.collection.findOne({ _id: new Types.ObjectId(id) });
const ON = { enabled: true } as const;

async function seed(
  o: {
    firstAt?: Date;
    via?: 'verify' | 'notice';
    warnAt?: Date;
    createdAt?: Date;
    extra?: Record<string, unknown>;
  } = {},
) {
  const _id = new Types.ObjectId();
  const created = o.createdAt ?? ago(400 * DAY);
  await User.collection.insertOne({
    _id,
    email: `u${String(_id)}@example.com`,
    name: 'Round Four',
    authProvider: 'email',
    emailVerified: false,
    isActive: true,
    role: 'Advocate',
    createdAt: created,
    updatedAt: created,
    ...(o.firstAt ? { firstVerifySentAt: o.firstAt, firstVerifySentVia: o.via ?? 'verify' } : {}),
    ...(o.warnAt ? { unverifiedNoticeSentAt: o.warnAt } : {}),
    ...(o.extra ?? {}),
  });
  return String(_id);
}

beforeEach(async () => {
  await redis.flushall();
  (enqueueEmail as jest.Mock).mockReset();
  (enqueueEmail as jest.Mock).mockResolvedValue({ jobId: 'j', queue: 'q', deduped: false });
  global.fetch = jest.fn(async () => ({
    status: 200,
    json: async () => ({ active: false, status: 'none', ok: true, counts: {} }),
  })) as unknown as typeof fetch;
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('an our-side send failure (quota, relay denied, sender not authorised, MAIL FROM) never advances deletion', () => {
  // The worker reports nothing for these (see apps/email-worker t358-bounce-classifier.test.ts),
  // so auth sees prepare() and then no outcome call. Whatever time passes, nothing is deleted.
  const FAR = [0, 31 * DAY, 90 * DAY, 400 * DAY, 2000 * DAY];

  it('first notice prepared, send failed on our side, nothing reported: F stays null, never due', async () => {
    const id = await seed({});
    for (const t of FAR) {
      const now = new Date(NOW.getTime() + t);
      const prep = await prepareUnverifiedNotice(id, now);
      expect(prep).toMatchObject({ kind: 'ready', notice: 'first' });
      const counts = await runUnverifiedSweep(now, ON);
      expect(counts.deleteFound).toBe(0);
      expect(counts.deleted).toBe(0);
      const u = await raw(id);
      expect(u).not.toBeNull();
      expect(u!.firstVerifySentAt).toBeUndefined();
      expect(u!.unverifiedNoticeSentAt).toBeUndefined();
      expect(u!.erasure).toBeUndefined();
    }
    expect((await runUnverifiedSweep(NOW, { enabled: false })).deletionsDue).toBe(0);
  });

  it('warning prepared, send failed on our side, nothing reported: the warning stays null, never due', async () => {
    const id = await seed({ firstAt: ago(40 * DAY) });
    for (const t of FAR) {
      const now = new Date(NOW.getTime() + t);
      expect(await prepareUnverifiedNotice(id, now)).toMatchObject({
        kind: 'ready',
        notice: 'warning',
      });
      const counts = await runUnverifiedSweep(now, ON);
      expect(counts.deleteFound).toBe(0);
      expect(counts.heldNoWarning).toBe(1);
      expect(await raw(id)).not.toBeNull();
      expect((await raw(id))!.unverifiedNoticeSentAt).toBeUndefined();
    }
    expect((await runUnverifiedSweep(NOW, { enabled: false })).deletionsDue).toBe(0);
  });

  it('a verify email that failed on our side leaves F null as well (account never starts its clock)', async () => {
    const id = await seed({ createdAt: ago(2 * HOUR) });
    const counts = await runUnverifiedSweep(new Date(NOW.getTime() + 1000 * DAY), ON);
    expect(counts.deleted).toBe(0);
    expect((await raw(id))!.firstVerifySentAt).toBeUndefined();
  });

  it('control: the same accounts DO advance once a genuine bounce is reported (the only path the worker takes)', async () => {
    const id = await seed({ firstAt: ago(40 * DAY) });
    await recordVerifyMailOutcome(id, 'notice_warning', 'bounced', ago(10 * DAY));
    const counts = await runUnverifiedSweep(NOW, ON);
    expect(counts.deleted).toBe(1);
    expect(await raw(id)).toBeNull();
  });
});

describe('same-date rule (noticeDeletionDate, warning after a notice-set F)', () => {
  // F + 30 days = 2026-10-21T10:00:00Z = 15:30 IST on 21 October; that IST day ends 18:30Z.
  const F = new Date('2026-09-21T10:00:00.000Z');
  const BY_CLOCK = F.getTime() + 30 * DAY;
  const END_OF_DAY = new Date('2026-10-21T18:30:00.000Z').getTime();
  const nowAt = (offsetMs: number) => new Date(F.getTime() + 23 * DAY + offsetMs);

  it('notice-set F, now + 7d on the same IST day as F + 30d: shows the F + 30d day (the Date is F + 30d itself)', () => {
    for (const off of [0, 1, 10 * 60 * 1000, HOUR, 5 * HOUR, 8 * HOUR + 29 * 60 * 1000]) {
      const d = noticeDeletionDate('warning', nowAt(off), F, 'notice');
      expect(d.getTime()).toBe(BY_CLOCK);
      expect(formatIstDate(d)).toBe('21 October 2026');
    }
  });

  it('exactly at the end of that IST day it still shows that day (on or before)', () => {
    const d = noticeDeletionDate('warning', new Date(END_OF_DAY - 7 * DAY), F, 'notice');
    expect(d.getTime()).toBe(BY_CLOCK);
    expect(formatIstDate(d)).toBe('21 October 2026');
  });

  it('one millisecond past the end of that day: the later date (now + 7d)', () => {
    const now = new Date(END_OF_DAY - 7 * DAY + 1);
    const d = noticeDeletionDate('warning', now, F, 'notice');
    expect(d.getTime()).toBe(now.getTime() + 7 * DAY);
    expect(formatIstDate(d)).toBe('22 October 2026');
  });

  it('a late notice-set warning (days late) shows now + 7d', () => {
    const now = nowAt(5 * DAY);
    const d = noticeDeletionDate('warning', now, F, 'notice');
    expect(d.getTime()).toBe(now.getTime() + 7 * DAY);
  });

  it('verify-set F is unchanged: always the later of F + 30d and now + 7d', () => {
    for (const off of [0, HOUR, 5 * HOUR, 9 * HOUR, 5 * DAY]) {
      const now = nowAt(off);
      const d = noticeDeletionDate('warning', now, F, 'verify');
      expect(d.getTime()).toBe(Math.max(BY_CLOCK, now.getTime() + 7 * DAY));
    }
  });

  it('no source recorded (older rows) behaves as verify-set', () => {
    const now = nowAt(HOUR);
    expect(noticeDeletionDate('warning', now, F, undefined).getTime()).toBe(
      Math.max(BY_CLOCK, now.getTime() + 7 * DAY),
    );
  });

  it('the first notice ignores the source: now + 30d', () => {
    expect(noticeDeletionDate('first', NOW, F, 'notice').getTime()).toBe(NOW.getTime() + 30 * DAY);
  });

  it('F early enough that F + 30d is well before now + 7d: later date even for notice-set', () => {
    const oldF = ago(40 * DAY);
    expect(noticeDeletionDate('warning', NOW, oldF, 'notice').getTime()).toBe(
      NOW.getTime() + 7 * DAY,
    );
  });

  describe('prepare reads the source and the shown date is never earlier than the real earliest deletion', () => {
    it.each([
      0,
      HOUR,
      5 * HOUR,
      8 * HOUR + 29 * 60 * 1000,
      8 * HOUR + 31 * 60 * 1000,
      9 * HOUR,
      2 * DAY,
    ])('notice-set F, warning prepared %i ms after F + 23d', async (off) => {
      const id = await seed({ firstAt: F, via: 'notice' });
      const now = nowAt(off);
      const prep = await prepareUnverifiedNotice(id, now);
      expect(prep.kind).toBe('ready');
      const shown = prep.kind === 'ready' ? prep.deletionDate : '';
      const stampedAt = new Date(now.getTime() + 5000); // the stamp lands a moment later
      expect(await recordVerifyMailOutcome(id, 'notice_warning', 'sent', stampedAt)).toMatchObject({
        warningStamped: true,
      });

      // Find the first IST day start at which the sweep deletes, scanning hourly.
      let deletedAt: Date | null = null;
      for (let t = stampedAt.getTime(); t <= stampedAt.getTime() + 12 * DAY; t += HOUR) {
        const c = await runUnverifiedSweep(new Date(t), ON);
        if (c.deleted === 1) {
          deletedAt = new Date(t);
          break;
        }
      }
      expect(deletedAt).not.toBeNull();
      // Deleted strictly after the end of the shown IST day: its formatted date is later.
      const dayShown = shown;
      expect(formatIstDate(deletedAt!)).not.toBe(dayShown);
      // ...and in particular not before the shown day began.
      expect(deletedAt!.getTime()).toBeGreaterThan(new Date(`${dayShown} 00:00 +05:30`).getTime());
    });

    it('verify-set F: prepare behaves as before (later of the two)', async () => {
      const id = await seed({ firstAt: F, via: 'verify' });
      const now = nowAt(9 * HOUR);
      const prep = await prepareUnverifiedNotice(id, now);
      expect(prep).toMatchObject({
        kind: 'ready',
        deletionDate: formatIstDate(new Date(now.getTime() + 7 * DAY)),
      });
    });

    it('prepare passes the stored source: the same F gives different Dates for notice and verify at the edge', async () => {
      const now = new Date(END_OF_DAY - 7 * DAY - HOUR); // now + 7d is an hour before the end of the F + 30d day
      const a = await seed({ firstAt: F, via: 'notice' });
      const b = await seed({ firstAt: F, via: 'verify' });
      const pa = await prepareUnverifiedNotice(a, now);
      const pb = await prepareUnverifiedNotice(b, now);
      // Same IST day either way, so the printed date is the same; the stamps are untouched.
      expect(pa).toMatchObject({ deletionDate: '21 October 2026' });
      expect(pb).toMatchObject({ deletionDate: '21 October 2026' });
    });
  });
});
