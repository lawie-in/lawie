/**
 * T-436 (Arjun's condition for the queue:purge follow-up, 15 Oct 2026) — pins the T-358
 * invariant: the two unverified-account stamps, firstVerifySentAt (F) and unverifiedNoticeSentAt,
 * are written ONLY on a CONFIRMED send (or recipient hard bounce) reported by the email worker
 * through recordVerifyMailOutcome / POST /internal/unverified-notice/outcome. Never at enqueue,
 * never by the sweep, never by requestVerifyEmail. If they were, purging a held notice job
 * (queue:purge) would leave a user stamped "noticed" with no email, and the F + 30 d deletion
 * could fire with no notice sent.
 *
 * Real Mongo (memory server), ioredis-mock, email client stubbed at the boundary, billing and
 * drafting a mocked global.fetch.
 *
 * NOW = 2026-10-14T10:00:00Z.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import fs from 'fs';
import path from 'path';

import { enqueueEmail } from '@lawie/email-client';
import { Types } from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import {
  UNVERIFIED_NOTICE_TEMPLATE,
  deleteDueFilter,
  recordVerifyMailOutcome,
  runUnverifiedSweep,
} from '../services/unverified-sweep.service';
import { requestVerifyEmail } from '../services/verify-email.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-14T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const SECRET = process.env.INTERNAL_SECRET as string;
const OUTCOME = '/internal/unverified-notice/outcome';

const enqueue = enqueueEmail as jest.Mock;
const raw = (id: string) => User.collection.findOne({ _id: new Types.ObjectId(id) });

async function seed(extra: Record<string, unknown> = {}, createdAt = ago(60 * DAY)) {
  const _id = new Types.ObjectId();
  await User.collection.insertOne({
    _id,
    email: `t436-${String(_id)}@example.com`,
    name: 'Stamp Person',
    authProvider: 'email',
    emailVerified: false,
    isActive: true,
    role: 'Advocate',
    createdAt,
    updatedAt: createdAt,
    ...extra,
  });
  return String(_id);
}
/** Neither stamp present (null or absent both read as "unset"). */
async function expectUnstamped(id: string) {
  const doc = await raw(id);
  expect(doc?.firstVerifySentAt ?? null).toBeNull();
  expect(doc?.unverifiedNoticeSentAt ?? null).toBeNull();
}

let eraseCalls: string[];
beforeEach(async () => {
  await redis.flushall();
  enqueue.mockReset();
  enqueue.mockResolvedValue({ jobId: 'j', queue: 'email:low', deduped: false });
  eraseCalls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('subscription-status')) {
      return { status: 200, json: async () => ({ active: false, status: 'none' }) };
    }
    eraseCalls.push(String(JSON.parse(String(init?.body)).userId));
    return { status: 200, json: async () => ({ ok: true, counts: {} }) };
  }) as unknown as typeof fetch;
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const noticeJobsFor = (id: string) =>
  enqueue.mock.calls
    .map((c) => c[0] as { template: string; userId: string; idempotencyKey: string })
    .filter((j) => j.template === UNVERIFIED_NOTICE_TEMPLATE && j.userId === id);

describe('enqueueing never stamps', () => {
  it('the sweep queuing the FIRST notice leaves F and the notice stamp unset', async () => {
    const id = await seed(); // 60 days old, no verify-link mail confirmed
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(noticeJobsFor(id).map((j) => j.idempotencyKey)).toEqual([
      `unverified-notice:${id}:first`,
    ]);
    await expectUnstamped(id);
  });

  it('the sweep queuing the WARNING notice leaves the notice stamp null and F unchanged', async () => {
    const f = ago(24 * DAY);
    const id = await seed({ firstVerifySentAt: f, firstVerifySentVia: 'verify' });
    await runUnverifiedSweep(NOW, { enabled: true });
    expect(noticeJobsFor(id).map((j) => j.idempotencyKey)).toEqual([
      `unverified-notice:${id}:warning`,
    ]);
    const doc = await raw(id);
    expect(doc?.unverifiedNoticeSentAt ?? null).toBeNull();
    expect(doc?.firstVerifySentAt).toEqual(f);
  });

  it('the sweep with the switch off (count only) stamps nothing', async () => {
    const id = await seed();
    await runUnverifiedSweep(NOW, { enabled: false });
    expect(enqueue).not.toHaveBeenCalled();
    await expectUnstamped(id);
  });

  it('requestVerifyEmail queuing a verify email leaves F unset', async () => {
    const id = await seed();
    expect(await requestVerifyEmail(id)).toEqual({ kind: 'queued' });
    await new Promise((r) => setImmediate(r)); // the enqueue is fire-and-forget
    expect(enqueue).toHaveBeenCalledWith({ template: 'auth.verifyEmail', userId: id });
    await expectUnstamped(id);
  });

  it('requestVerifyEmail for a user whose F is set does not stamp the notice', async () => {
    const id = await seed({ firstVerifySentAt: ago(24 * DAY), firstVerifySentVia: 'verify' });
    await requestVerifyEmail(id);
    expect((await raw(id))?.unverifiedNoticeSentAt ?? null).toBeNull();
  });
});

describe('only a confirmed send reported by the worker stamps', () => {
  const post = (body: unknown) =>
    supertest(app)
      .post(OUTCOME)
      .set('x-internal-secret', SECRET)
      .send(body as object);

  it('outcome "sent" for a verify mail stamps F (via verify), not the notice stamp', async () => {
    const id = await seed();
    await runUnverifiedSweep(NOW, { enabled: true });
    await requestVerifyEmail(id);
    await expectUnstamped(id); // queued, nothing reported yet
    const res = await post({ userId: id, mail: 'verify', outcome: 'sent' });
    expect(res.status).toBe(200);
    const doc = await raw(id);
    expect(doc?.firstVerifySentAt).toBeInstanceOf(Date);
    expect(doc?.firstVerifySentVia).toBe('verify');
    expect(doc?.unverifiedNoticeSentAt ?? null).toBeNull();
  });

  it('outcome "sent" for notice_first stamps F (via notice), not the notice stamp', async () => {
    const id = await seed();
    await post({ userId: id, mail: 'notice_first', outcome: 'sent' });
    const doc = await raw(id);
    expect(doc?.firstVerifySentAt).toBeInstanceOf(Date);
    expect(doc?.firstVerifySentVia).toBe('notice');
    expect(doc?.unverifiedNoticeSentAt ?? null).toBeNull();
  });

  it('notice_warning stamps the notice stamp only when F was already set before the call', async () => {
    const withF = await seed({ firstVerifySentAt: ago(24 * DAY), firstVerifySentVia: 'verify' });
    const res = await post({ userId: withF, mail: 'notice_warning', outcome: 'sent' });
    expect(res.status).toBe(200);
    expect((await raw(withF))?.unverifiedNoticeSentAt).toBeInstanceOf(Date);

    const noF = await seed();
    await post({ userId: noF, mail: 'notice_warning', outcome: 'sent' });
    const doc = await raw(noF);
    expect(doc?.firstVerifySentAt).toBeInstanceOf(Date); // this mail set F ...
    expect(doc?.unverifiedNoticeSentAt ?? null).toBeNull(); // ... and never counts as the warning
  });

  it('a recipient hard bounce counts as sent', async () => {
    const id = await seed({ firstVerifySentAt: ago(24 * DAY), firstVerifySentVia: 'verify' });
    await post({ userId: id, mail: 'notice_warning', outcome: 'bounced' });
    expect((await raw(id))?.unverifiedNoticeSentAt).toBeInstanceOf(Date);
  });

  it('recordVerifyMailOutcome is the stamp function (direct call, same result)', async () => {
    const id = await seed({ firstVerifySentAt: ago(24 * DAY), firstVerifySentVia: 'verify' });
    expect(await recordVerifyMailOutcome(id, 'notice_warning', 'sent', NOW)).toMatchObject({
      kind: 'recorded',
      warningStamped: true,
    });
    expect((await raw(id))?.unverifiedNoticeSentAt).toEqual(NOW);
  });
});

describe('a purged held notice job leaves the user unstamped and undeletable', () => {
  it('warning job purged (queued, never reported): no stamp, not in the deletion query, not erased', async () => {
    // F 31 days ago: the 30-day clock has run out, but no warning was ever confirmed.
    const id = await seed({ firstVerifySentAt: ago(31 * DAY), firstVerifySentVia: 'verify' });

    const first = await runUnverifiedSweep(NOW, { enabled: true });
    expect(first.noticesQueued).toBe(1);
    expect(noticeJobsFor(id)).toHaveLength(1);

    // queue:purge removes the job. The worker never ran, so no outcome is reported.
    enqueue.mockClear();

    const second = await runUnverifiedSweep(NOW, { enabled: true });
    expect(noticeJobsFor(id)).toHaveLength(1); // freed jobId: the sweep queues it again
    expect(second.noticesQueued).toBe(1);
    expect(second.deleteFound).toBe(0);
    expect(second.deleted).toBe(0);
    expect(second.heldNoWarning).toBe(1); // counted as held, not deletable
    expect(eraseCalls).toEqual([]);

    const doc = await raw(id);
    expect(doc?.unverifiedNoticeSentAt ?? null).toBeNull();
    expect(doc?.erasure).toBeUndefined();
    expect(await User.countDocuments({ _id: id, ...deleteDueFilter(NOW) })).toBe(0);
    expect(await User.countDocuments(deleteDueFilter(NOW))).toBe(0);
  });

  it('first-notice job purged: still no F, so no deletion, however old the account', async () => {
    const id = await seed({}, ago(400 * DAY));
    await runUnverifiedSweep(NOW, { enabled: true });
    await runUnverifiedSweep(NOW, { enabled: true });
    await expectUnstamped(id);
    expect(await User.countDocuments(deleteDueFilter(NOW))).toBe(0);
    expect(eraseCalls).toEqual([]);
  });

  it('control: once the warning IS confirmed and 7 days have passed, the same user becomes deletable', async () => {
    const id = await seed({ firstVerifySentAt: ago(31 * DAY), firstVerifySentVia: 'verify' });
    await recordVerifyMailOutcome(id, 'notice_warning', 'sent', ago(8 * DAY));
    expect(await User.countDocuments({ _id: id, ...deleteDueFilter(NOW) })).toBe(1);
  });
});

/**
 * Static guard. Scans every non-test .ts file under apps/auth/src and fails when a file other
 * than the allow-listed ones WRITES either stamp, so a future write at enqueue (sweep, request
 * path, controller) fails here. A "write" is, after comments are stripped:
 *   - the field name appearing inside a `$set` / `$setOnInsert` / `$min` / `$max` /
 *     `$currentDate` object  (`$set: { firstVerifySentAt: now }`, `{ $set: { a: 1, field: x } }`),
 *   - a property assignment `x.field = ...` or `x['field'] = ...`,
 *   - in any other file, the field as an object key with a value other than a 0/1 projection
 *     (`field: someDate`), which covers `User.create({ field })` style writes.
 * Reads (`.select('field')`, `{ field: null }` filters in the sweep service, `?.field`, type
 * declarations) are not matched in the sweep service, because there only the `$set` rule applies
 * and must fall inside recordVerifyMailOutcome. The model file is the schema definition.
 */
describe('static guard: the stamps are written only by recordVerifyMailOutcome', () => {
  const FIELDS = ['firstVerifySentAt', 'unverifiedNoticeSentAt'];
  const SRC = path.resolve(__dirname, '..');
  const SWEEP = path.join(SRC, 'services', 'unverified-sweep.service.ts');
  const MODEL = path.join(SRC, 'models', 'User.model.ts');

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory())
        return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(p);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });

  /** Block comments and whole-line / trailing `//` comments blanked to spaces (offsets kept). */
  const stripComments = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|\s)\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

  const fieldAlt = FIELDS.join('|');
  const SET_BLOCK = new RegExp(
    `\\$(?:set|setOnInsert|min|max|currentDate)\\s*:\\s*\\{[^}]*?\\b(?:${fieldAlt})\\b`,
    'g',
  );
  const ASSIGN = new RegExp(
    `(?:\\.(?:${fieldAlt})|\\[\\s*['"](?:${fieldAlt})['"]\\s*\\])\\s*=(?!=)`,
    'g',
  );
  const KEY_WITH_VALUE = new RegExp(`\\b(?:${fieldAlt})\\s*:(?!\\s*[01]\\b)\\s*\\S`, 'g');

  const offsets = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m.index ?? 0);

  it('the scan finds the source files (guards against an empty walk)', () => {
    const files = walk(SRC);
    expect(files).toContain(SWEEP);
    expect(files).toContain(MODEL);
    expect(files.length).toBeGreaterThan(20);
  });

  it('no file other than the sweep service and the User schema writes either stamp', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file === SWEEP || file === MODEL) continue;
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      const hits = [SET_BLOCK, ASSIGN, KEY_WITH_VALUE].flatMap((re) => offsets(re, text));
      if (hits.length > 0) offenders.push(path.relative(SRC, file));
    }
    expect(offenders).toEqual([]);
  });

  it('in the sweep service every $set / assignment of a stamp is inside recordVerifyMailOutcome', () => {
    const text = stripComments(fs.readFileSync(SWEEP, 'utf8'));
    const start = text.indexOf('export async function recordVerifyMailOutcome');
    const end = text.indexOf('export interface UnverifiedSweepCounts');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);

    const writes = [SET_BLOCK, ASSIGN].flatMap((re) => offsets(re, text));
    expect(writes.length).toBeGreaterThanOrEqual(2); // the notice stamp and the F stamp
    const outside = writes.filter((o) => o < start || o > end);
    expect(outside).toEqual([]);
  });

  it('the recordVerifyMailOutcome function is only called from the internal outcome route', () => {
    const callers = walk(SRC)
      .filter((f) => f !== SWEEP)
      .filter((f) =>
        /\brecordVerifyMailOutcome\s*\(/.test(stripComments(fs.readFileSync(f, 'utf8'))),
      )
      .map((f) => path.relative(SRC, f));
    expect(callers).toEqual([path.join('routes', 'internal-unverified-notice.routes.ts')]);
  });

  it('the guard patterns do fire on a write (self-check, no false negatives)', () => {
    const bad = [
      'await User.updateOne({ _id }, { $set: { firstVerifySentAt: new Date() } });',
      'await User.updateOne({ _id }, { $set: { a: 1, unverifiedNoticeSentAt: now } });',
      'user.firstVerifySentAt = new Date();',
      "user['unverifiedNoticeSentAt'] = now;",
      'await User.create({ email, firstVerifySentAt: new Date() });',
    ];
    for (const line of bad) {
      const t = stripComments(line);
      const hit = [SET_BLOCK, ASSIGN, KEY_WITH_VALUE].some((re) => offsets(re, t).length > 0);
      expect(hit).toBe(true);
    }
    const ok = [
      '// await User.updateOne({ _id }, { $set: { firstVerifySentAt: now } });',
      '/* user.firstVerifySentAt = now */',
      'const f = user.firstVerifySentAt;',
      "User.find({ firstVerifySentAt: 0 }).select('firstVerifySentAt');",
    ];
    for (const line of ok) {
      const t = stripComments(line);
      const hit = [SET_BLOCK, ASSIGN, KEY_WITH_VALUE].some((re) => offsets(re, t).length > 0);
      expect(hit).toBe(false);
    }
  });
});
