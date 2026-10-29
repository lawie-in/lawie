/**
 * T-657 (Ajay AJ-657-M1 / M1a): the one-time free-seed backfill script. Tests import its exported
 * functions and use the mongodb-memory-server harness DB; the few subprocess tests point
 * MONGO_URI at that same in-memory server (never any real database).
 *
 * Rules pinned: the hard cut-off (FREE_SEED_GO_LIVE, no flag), group order, A vs B arithmetic,
 * counts-only output (never a user id), ids only in the --ids-out file (0600, never overwritten),
 * dry run writes nothing, apply is guarded and idempotent.
 */
import './setupEnv';

import './setupDb';

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

import mongoose from 'mongoose';

import * as bonusSvc from '../services/credit-bonus.service';
import { grantSignupBonus } from '../services/credit-bonus.service';

import {
  classify,
  earliestAccountCheck,
  freeSeedLedgerId,
  FREE_SEED_GO_LIVE,
  FREE_SEED_GO_LIVE_SHA,
  isManual,
  isVerifiedForBonus,
  NEAR_CUTOFF_MS,
  parseArgs,
  parseIsoDateTime,
  PROD_CUTOFF_HINT,
  redactMongoUri,
  run,
  verificationDate,
} from '../../scripts/backfill-free-seed';

jest.setTimeout(120_000);

const CUT = FREE_SEED_GO_LIVE; // 2026-06-15T19:40:43Z, the floor
const CO = new Date(PROD_CUTOFF_HINT); // 2026-10-25T22:00:00Z, the prod cut-off (a --cutoff value)
const DAY = 86_400_000;
const db = () => mongoose.connection.db!;
const users = () => db().collection('users');
const ink = () => db().collection('inkledger');
type Row = Record<string, unknown>;

let tmpDir: string;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't657-'));
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
afterEach(() => jest.restoreAllMocks());

let seq = 0;
async function mkUser(fields: Row = {}): Promise<mongoose.Types.ObjectId> {
  seq += 1;
  const _id = new mongoose.Types.ObjectId();
  await users().insertOne({
    _id,
    email: `bf-${seq}-${crypto.randomBytes(3).toString('hex')}@example.com`,
    name: `Backfill Person ${seq}`,
    isActive: true,
    emailVerified: true,
    authProvider: 'email',
    plan: 'free',
    // After the floor, so that no default account predates the effective cut-off (M1c).
    createdAt: new Date('2026-06-20T00:00:00Z'),
    ...fields,
  });
  return _id;
}
const iso = (s: string) => new Date(s);

interface Fixtures {
  ids: Record<string, mongoose.Types.ObjectId>;
  markers: Record<string, Date>;
}

/**
 * The fixture set from the ticket (see counts in the tests). applySafe leaves out the one
 * account created before the cut-off, so --apply (M1c) is not refused: 19 candidates, 3 pre-seed.
 */
async function seedFixtures(applySafe = false): Promise<Fixtures> {
  const ids: Fixtures['ids'] = {};
  const markers: Fixtures['markers'] = {};
  const add = async (name: string, marker: Date | string | null | undefined, f: Row = {}) => {
    ids[name] = await mkUser({
      ...(marker === undefined ? {} : { signupBonusGrantedAt: marker }),
      ...f,
    });
    if (marker instanceof Date) markers[name] = marker;
  };
  // class A
  await add('A_basic', iso('2026-06-16T10:00:00Z'));
  await add('A_referral', iso('2026-08-01T10:00:00Z'), { inkTopup: 6 });
  await ink().insertOne({
    userId: ids['A_referral'],
    delta: 6,
    reason: 'referral_bonus',
    sourceBucket: 'topup',
    balanceAfter: 6,
    createdAt: new Date(),
  });
  await add('at_cutoff', new Date(CUT.getTime()));
  await add('nodate_createdAt_after', 'not-a-date', { createdAt: iso('2026-07-01T00:00:00Z') });
  await add('google_flag', iso('2026-08-05T10:00:00Z'), {
    authProvider: 'google',
    emailVerified: false,
  });
  await add('googleId_linked', iso('2026-08-06T10:00:00Z'), {
    emailVerified: false,
    googleId: 'g-linked',
  });
  // class B (Ink present, no row)
  await add('B_present', iso('2026-08-02T10:00:00Z'), { inkTopup: 10 });
  await add('B_plus_referral', iso('2026-08-03T10:00:00Z'), { inkTopup: 16 });
  await ink().insertOne({
    userId: ids['B_plus_referral'],
    delta: 6,
    reason: 'referral_bonus',
    sourceBucket: 'topup',
    balanceAfter: 16,
    createdAt: new Date(),
  });
  // has a row already (ObjectId _id and string _id)
  await add('row_oid', iso('2026-08-03T11:00:00Z'), { inkTopup: 10 });
  await ink().insertOne({
    userId: ids['row_oid'],
    delta: 10,
    reason: 'free_seed',
    sourceBucket: 'topup',
    balanceAfter: 10,
    createdAt: new Date(),
  });
  await add('row_str', iso('2026-08-04T11:00:00Z'), { inkTopup: 10 });
  await ink().insertOne({
    _id: `free_seed:${ids['row_str'].toString()}` as never,
    userId: ids['row_str'],
    delta: 10,
    reason: 'free_seed',
    sourceBucket: 'topup',
    balanceAfter: 10,
    createdAt: new Date(),
  });
  // before the go-live: never offered
  await add('pre_cutoff', iso('2026-06-01T10:00:00Z'));
  await add('before_1ms', new Date(CUT.getTime() - 1));
  // The only fixture whose account predates the floor: a dry run allows it, M1c refuses --apply.
  if (!applySafe) {
    await add('nodate_createdAt_before', 'not-a-date', { createdAt: iso('2026-05-01T00:00:00Z') });
  }
  await add('nodate_none', 'not-a-date', { createdAt: undefined });
  await users().updateOne({ _id: ids['nodate_none'] }, { $unset: { createdAt: '' } });
  // skipped before any money question
  await add('test_acct', iso('2026-08-10T10:00:00Z'), { isTestAccount: true });
  await add('erased', iso('2026-08-11T10:00:00Z'), { erasure: { at: new Date() } });
  await add('inactive', iso('2026-08-12T10:00:00Z'), { isActive: false });
  await add('unverified', iso('2026-08-13T10:00:00Z'), { emailVerified: false });
  // manual
  await add('subscriber', iso('2026-08-07T10:00:00Z'), { inkSub: 20 });
  await add('plan_paid', iso('2026-08-08T10:00:00Z'), { plan: 'pro' });
  // not candidates at all
  await add('already_seeded', iso('2026-08-14T10:00:00Z'), {
    freeSeedAt: new Date(),
    inkTopup: 10,
  });
  await add('no_marker', undefined);
  await add('null_marker', null);
  return { ids, markers };
}

const A_NAMES = [
  'A_basic',
  'A_referral',
  'at_cutoff',
  'nodate_createdAt_after',
  'google_flag',
  'googleId_linked',
];
const B_NAMES = ['B_present', 'B_plus_referral'];
const MANUAL_NAMES = ['subscriber', 'plan_paid'];
const UNTOUCHED = [
  'row_oid',
  'row_str',
  'pre_cutoff',
  'before_1ms',
  'nodate_createdAt_before',
  'nodate_none',
  'test_acct',
  'erased',
  'inactive',
  'unverified',
  ...MANUAL_NAMES,
  'already_seeded',
  'no_marker',
  'null_marker',
];

const UNTOUCHED_SAFE = UNTOUCHED.filter((k) => k !== 'nodate_createdAt_before');

async function snapshot() {
  const u = await users().find({}).sort({ _id: 1 }).toArray();
  const l = await ink().find({}).sort({ _id: 1 }).toArray();
  return JSON.stringify({ u, l });
}
const rawOf = (id: mongoose.Types.ObjectId) => users().findOne({ _id: id }) as Promise<Row>;
const freeRows = (id: mongoose.Types.ObjectId) =>
  ink().find({ userId: id, reason: 'free_seed' }).toArray();

function collect() {
  const lines: string[] = [];
  const ids: string[] = [];
  const con = [
    jest.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' '))),
    jest.spyOn(console, 'warn').mockImplementation((...a) => void lines.push(a.join(' '))),
    jest.spyOn(console, 'error').mockImplementation((...a) => void lines.push(a.join(' '))),
  ];
  return {
    lines,
    ids,
    con,
    log: (l: string) => lines.push(l),
    writeIds: (ls: string[]) => ids.push(...ls),
  };
}

describe('pure helpers', () => {
  it('isVerifiedForBonus mirrors the filter', () => {
    expect(isVerifiedForBonus({ authProvider: 'google' })).toBe(true);
    expect(isVerifiedForBonus({ emailVerified: true })).toBe(true);
    expect(isVerifiedForBonus({ googleId: 'g' })).toBe(true);
    expect(isVerifiedForBonus({ googleId: '' })).toBe(false);
    expect(isVerifiedForBonus({ googleId: null })).toBe(false);
    expect(isVerifiedForBonus({ emailVerified: false, authProvider: 'email' })).toBe(false);
    expect(isVerifiedForBonus({})).toBe(false);
  });

  it.each([
    [{ inkSub: 1 }, true],
    [{ inkAnnualCarry: 5 }, true],
    [{ inkSubMonthlyAllotment: 2 }, true],
    [{ plan: 'pro' }, true],
    [{ planTier: 'plus' }, true],
    [{ billingCycle: 'monthly' }, true],
    [{}, false],
    [{ plan: 'free', planTier: 'free', billingCycle: 'none' }, false],
    [{ inkSub: 0, inkAnnualCarry: 0, inkSubMonthlyAllotment: 0, plan: null }, false],
  ])('isManual(%j) = %s', (u, expected) => {
    expect(isManual(u as Row)).toBe(expected);
  });

  it('verificationDate: marker, else createdAt, else none', () => {
    const m = iso('2026-07-01T00:00:00Z');
    const c = iso('2026-05-01T00:00:00Z');
    expect(verificationDate({ signupBonusGrantedAt: m, createdAt: c })).toEqual({
      at: m,
      source: 'marker',
    });
    expect(verificationDate({ signupBonusGrantedAt: 'x', createdAt: c })).toEqual({
      at: c,
      source: 'createdAt',
    });
    expect(verificationDate({ signupBonusGrantedAt: true })).toEqual({ at: null, source: 'none' });
    expect(verificationDate({ signupBonusGrantedAt: new Date('nope'), createdAt: c }).source).toBe(
      'createdAt',
    );
  });

  it('the cut-off is exactly commit 7652ed93, 2026-06-15T19:40:43Z', () => {
    expect(FREE_SEED_GO_LIVE.toISOString()).toBe('2026-06-15T19:40:43.000Z');
    expect(FREE_SEED_GO_LIVE_SHA.startsWith('7652ed93')).toBe(true);
  });

  it('redactMongoUri never prints credentials or the query string', () => {
    const pw = crypto.randomBytes(8).toString('hex');
    const uri = `mongodb+srv://admin:${pw}@cluster0.example.net/lawie?retryWrites=true&w=${pw}`;
    const out = redactMongoUri(uri);
    expect(out).toBe('mongodb+srv://cluster0.example.net/lawie');
    expect(out).not.toContain(pw);
    expect(out).not.toContain('admin');
    const tricky = redactMongoUri(`mongodb://u:p@${pw}@host1:27017,host2:27017/db`);
    expect(tricky).toBe('mongodb://host1:27017,host2:27017/db');
    expect(tricky).not.toContain(pw);
    expect(redactMongoUri('garbage')).toBe('(unparseable MONGO_URI)');
  });
});

describe('parseArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseArgs([])).toEqual({ apply: false, before: undefined, idsOut: undefined });
    expect(parseArgs(['--dry-run', '--ids-out', '/x/y'])).toMatchObject({
      apply: false,
      idsOut: '/x/y',
    });
  });
  it('--apply needs --ids-out and --cutoff', () => {
    expect(parseArgs(['--apply'])).toBeNull();
    expect(parseArgs(['--apply', '--cutoff', CO.toISOString()])).toBeNull();
    expect(parseArgs(['--apply', '--ids-out', '/x/y'])).toBeNull();
    expect(parseArgs(['--apply', '--cutoff', CO.toISOString(), '--ids-out', '/x/y'])).toMatchObject(
      {
        apply: true,
        cutoff: CO,
        idsOut: '/x/y',
      },
    );
  });
  it.each([
    [['--apply', '--dry-run', '--ids-out', '/x']],
    [['--bogus']],
    [['positional']],
    [['--before']],
    [['--before', 'not-a-date']],
    [['--ids-out']],
    [['--ids-out', '--apply']],
    [['--before', '--dry-run']],
  ])('usage error for %j', (argv) => {
    expect(parseArgs(argv)).toBeNull();
  });
  it('parses --before', () => {
    expect(parseArgs(['--before', '2026-09-01T00:00:00Z'])?.before).toEqual(
      iso('2026-09-01T00:00:00Z'),
    );
  });
});

describe('classify', () => {
  it('puts every fixture in exactly the expected group', async () => {
    const { ids } = await seedFixtures();
    const expected: Record<string, string> = {
      ...Object.fromEntries(A_NAMES.map((k) => [k, 'A'])),
      ...Object.fromEntries(B_NAMES.map((k) => [k, 'B'])),
      row_oid: 'skipped_has_row',
      row_str: 'skipped_has_row',
      pre_cutoff: 'skipped_pre_seed',
      before_1ms: 'skipped_pre_seed',
      nodate_createdAt_before: 'skipped_pre_seed',
      nodate_none: 'skipped_pre_seed',
      test_acct: 'skipped_test',
      erased: 'skipped_erased',
      inactive: 'skipped_inactive',
      unverified: 'unverified_skipped',
      subscriber: 'manual',
      plan_paid: 'manual',
    };
    for (const [name, group] of Object.entries(expected)) {
      const doc = (await rawOf(ids[name])) as never;
      const c = await classify(db(), doc);
      expect({ name, group: c.group }).toEqual({ name, group });
    }
  });

  it('cut-off boundary: the instant itself is eligible, 1 ms earlier is not', async () => {
    const { ids } = await seedFixtures();
    expect((await classify(db(), (await rawOf(ids['at_cutoff'])) as never)).group).toBe('A');
    expect((await classify(db(), (await rawOf(ids['before_1ms'])) as never)).group).toBe(
      'skipped_pre_seed',
    );
  });

  it('date source: createdAt fallback is reported', async () => {
    const { ids } = await seedFixtures();
    const c = await classify(db(), (await rawOf(ids['nodate_createdAt_after'])) as never);
    expect(c).toMatchObject({ group: 'A', dateSource: 'createdAt' });
    const none = await classify(db(), (await rawOf(ids['nodate_none'])) as never);
    expect(none).toMatchObject({ group: 'skipped_pre_seed', dateSource: 'none', verifiedAt: null });
  });

  it('a pre-cutoff user is skipped even with a ledger row-less zero balance (no flag overrides)', async () => {
    const id = await mkUser({ signupBonusGrantedAt: iso('2026-06-01T00:00:00Z') });
    expect((await classify(db(), (await rawOf(id)) as never)).group).toBe('skipped_pre_seed');
  });

  it('is read-only', async () => {
    const { ids } = await seedFixtures();
    const before = await snapshot();
    for (const id of Object.values(ids)) await classify(db(), (await rawOf(id)) as never);
    expect(await snapshot()).toBe(before);
  });

  it('unexplained arithmetic: exactly 0 is A, exactly 10 is B, 9 and 11 are ambiguous', async () => {
    const mk = (inkTopup: number) => mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup });
    const g = async (id: mongoose.Types.ObjectId) =>
      (await classify(db(), (await rawOf(id)) as never)).group;
    expect(await g(await mk(0))).toBe('A');
    expect(await g(await mk(9))).toBe('ambiguous');
    expect(await g(await mk(10))).toBe('B');
    expect(await g(await mk(11))).toBe('ambiguous');
  });

  it('non-topup ledger rows do not count as explaining the topup balance', async () => {
    const id = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: 10 });
    await ink().insertOne({ userId: id, delta: 10, reason: 'x', sourceBucket: 'sub' });
    expect((await classify(db(), (await rawOf(id)) as never)).group).toBe('B');
  });
});

describe('run: dry run', () => {
  it('writes nothing, prints counts only (no user id, no email), cut-off line and histograms', async () => {
    const { ids } = await seedFixtures();
    const before = await snapshot();
    const c = collect();
    const res = await run(db(), { apply: false, log: c.log, writeIds: c.writeIds });
    expect(await snapshot()).toBe(before);

    expect(res.counts).toMatchObject({
      candidates: 20,
      skipped_test: 1,
      skipped_erased: 1,
      skipped_inactive: 1,
      unverified_skipped: 1,
      skipped_pre_seed: 4,
      skipped_has_row: 2,
      manual: 2,
      A: 6,
      B: 2,
      seeded_A: 0,
      row_only_B: 0,
      failed: 0,
    });
    expect(res.dateSources).toEqual({ marker: 13, createdAt: 2, none: 1 });
    expect(res.monthsEligible).toEqual({ '2026-06': 2, '2026-07': 1, '2026-08': 9 });
    expect(res.monthsPreCutoff).toEqual({ '2026-06': 2, '2026-05': 1, unknown: 1 });

    const text = c.lines.join('\n');
    expect(text).toContain(
      'cut-off: 2026-06-15T19:40:43.000Z (source: floor; floor 2026-06-15T19:40:43.000Z, commit 7652ed93d8dcdeab29371e73c19d0a91b6ce86f1, 2026-06-16 01:10:43 +0530)',
    );
    expect(c.lines[0]).toBe(
      'WARNING: no --cutoff given: using the commit-time floor; --apply requires --cutoff (prod: 2026-10-25T22:00:00Z)',
    );
    expect(text).toContain('candidates: 20');
    expect(text).toContain('A: 6');
    expect(text).toContain('B: 2');
    expect(text).toContain('skipped_pre_seed: 4');
    expect(text).toContain('verified-at source: marker 13, createdAt 2, none 1');
    const preIdx = text.indexOf('pre-cutoff');
    const eligIdx = text.indexOf('eligible');
    expect(preIdx).toBeGreaterThan(-1);
    expect(eligIdx).toBeGreaterThan(preIdx);
    expect(text.slice(preIdx, eligIdx)).toContain('2026-05 -> 1');
    expect(text.slice(eligIdx)).toContain('2026-08 -> 9');
    expect(c.lines[c.lines.length - 1]).toBe('Dry run: nothing written.');

    // no id, email or name anywhere in stdout/stderr/console
    for (const id of Object.values(ids)) expect(text).not.toContain(id.toString());
    expect(text).not.toMatch(/@example\.com/);
    expect(text).not.toContain('Backfill Person');
    expect(text).not.toMatch(/\b[0-9a-f]{24}\b/);

    // the ids went only to writeIds, as `<class>\t<id>` for A, B, manual
    const by = (cls: string) =>
      c.ids
        .filter((l) => l.startsWith(`${cls}\t`))
        .map((l) => l.split('\t')[1])
        .sort();
    expect(by('A')).toEqual(A_NAMES.map((k) => ids[k].toString()).sort());
    expect(by('B')).toEqual(B_NAMES.map((k) => ids[k].toString()).sort());
    expect(by('manual')).toEqual(MANUAL_NAMES.map((k) => ids[k].toString()).sort());
    expect(c.ids).toHaveLength(10);
  });

  it('--before limits the candidates to older markers', async () => {
    await seedFixtures();
    const c = collect();
    const res = await run(db(), {
      apply: false,
      before: iso('2026-07-01T00:00:00Z'),
      log: c.log,
      writeIds: c.writeIds,
    });
    // markers before July: pre_cutoff, before_1ms, at_cutoff, A_basic (strings never match $lt Date)
    expect(res.counts['candidates']).toBe(4);
    expect(res.counts['A']).toBe(2);
    expect(res.counts['skipped_pre_seed']).toBe(2);
    expect(c.lines.join('\n')).toContain('--before: 2026-07-01T00:00:00.000Z');
  });
});

describe('run: apply', () => {
  it('seeds A (+10, freeSeedAt, marker unchanged, row with note), row-only for B, others untouched', async () => {
    const { ids, markers } = await seedFixtures(true);
    const untouchedBefore: Record<string, string> = {};
    for (const k of UNTOUCHED_SAFE) untouchedBefore[k] = JSON.stringify(await rawOf(ids[k]));
    const preInk: Record<string, number> = {};
    for (const k of [...A_NAMES, ...B_NAMES])
      preInk[k] = Number((await rawOf(ids[k])).inkTopup ?? 0);
    const legacyRows = await ink().find({ reason: 'free_seed' }).toArray();

    const c = collect();
    const res = await run(db(), { apply: true, cutoff: CUT, log: c.log, writeIds: c.writeIds });
    expect(res.counts).toMatchObject({ seeded_A: 6, row_only_B: 2, already_done: 0, failed: 0 });

    for (const k of A_NAMES) {
      const d = await rawOf(ids[k]);
      expect(d.inkTopup).toBe(preInk[k] + 10);
      expect(d.freeSeedAt).toBeInstanceOf(Date);
      if (markers[k]) expect(d.signupBonusGrantedAt).toEqual(markers[k]); // marker untouched
      expect(d.inkSub).toBe(0);
      const r = await freeRows(ids[k]);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({
        _id: `free_seed:${ids[k].toString()}`,
        delta: 10,
        reason: 'free_seed',
        sourceBucket: 'topup',
        balanceAfter: preInk[k] + 10,
        metadata: { note: 'backfill' },
      });
    }
    for (const k of B_NAMES) {
      const d = await rawOf(ids[k]);
      expect(d.inkTopup).toBe(preInk[k]); // no extra Ink
      expect(d.freeSeedAt).toBeInstanceOf(Date);
      const r = await freeRows(ids[k]);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ _id: `free_seed:${ids[k].toString()}`, delta: 10 });
      expect((r[0] as Row).metadata).toEqual({ note: 'backfill' });
    }
    for (const k of UNTOUCHED_SAFE)
      expect(JSON.stringify(await rawOf(ids[k]))).toBe(untouchedBefore[k]);
    expect(
      await ink()
        .find({ reason: 'free_seed', 'metadata.note': { $ne: 'backfill' } })
        .toArray(),
    ).toEqual(legacyRows);
    expect(await ink().countDocuments({ reason: 'free_seed' })).toBe(legacyRows.length + 8);

    // ids only in writeIds; classes manual, seeded_A, row_only_B
    const text = c.lines.join('\n');
    for (const id of Object.values(ids)) expect(text).not.toContain(id.toString());
    expect(text).not.toMatch(/\b[0-9a-f]{24}\b/);
    const cls = (x: string) => c.ids.filter((l) => l.startsWith(`${x}\t`)).length;
    expect(cls('seeded_A')).toBe(6);
    expect(cls('row_only_B')).toBe(2);
    expect(cls('manual')).toBe(2);
    expect(c.ids.some((l) => l.startsWith('A\t') || l.startsWith('B\t'))).toBe(false);
    expect(text).toContain('seeded_A: 6');
    expect(text).toContain('row_only_B: 2');
  });

  it('a second apply is a no-op', async () => {
    await seedFixtures(true);
    await run(db(), { apply: true, cutoff: CUT, log: () => undefined });
    const after1 = await snapshot();
    const c = collect();
    const res = await run(db(), { apply: true, cutoff: CUT, log: c.log, writeIds: c.writeIds });
    expect(await snapshot()).toBe(after1);
    expect(res.counts).toMatchObject({ A: 0, B: 0, seeded_A: 0, row_only_B: 0, failed: 0 });
  });

  it('two concurrent applies give exactly one +10 and one row per user', async () => {
    const { ids } = await seedFixtures(true);
    const [r1, r2] = await Promise.all([
      run(db(), { apply: true, cutoff: CUT, log: () => undefined }),
      run(db(), { apply: true, cutoff: CUT, log: () => undefined }),
    ]);
    expect(r1.counts['seeded_A'] + r2.counts['seeded_A']).toBe(6);
    expect(r1.counts['row_only_B'] + r2.counts['row_only_B']).toBe(2);
    expect(r1.failed + r2.failed).toBe(0);
    const expectInk: Record<string, number> = {
      A_basic: 10,
      A_referral: 16,
      at_cutoff: 10,
      nodate_createdAt_after: 10,
      google_flag: 10,
      googleId_linked: 10,
      B_present: 10,
      B_plus_referral: 16,
    };
    for (const [k, v] of Object.entries(expectInk)) {
      expect((await rawOf(ids[k])).inkTopup).toBe(v);
      expect(await freeRows(ids[k])).toHaveLength(1);
    }
  });

  it('the guard no longer matching at write time is counted already_done and nothing is written', async () => {
    const { ids } = await seedFixtures(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = mongoose.mongo.Collection.prototype as any;
    const orig = proto.findOneAndUpdate;
    let raced: unknown;
    jest.spyOn(proto, 'findOneAndUpdate').mockImplementation(async function (
      this: any,
      ...args: any[]
    ) {
      if (!raced && this.collectionName === 'users') {
        raced = args[0]._id;
        await this.updateOne({ _id: raced }, { $set: { freeSeedAt: new Date() } }); // someone else won
      }
      return orig.apply(this, args);
    });
    const res = await run(db(), { apply: true, cutoff: CUT, log: () => undefined });
    expect(res.counts['already_done']).toBe(1);
    expect(res.counts['seeded_A'] + res.counts['row_only_B']).toBe(7);
    const racedKey = Object.entries(ids).find(([, v]) => String(v) === String(raced))![0];
    expect(await freeRows(ids[racedKey])).toHaveLength(0);
    const d = await rawOf(ids[racedKey]);
    // the script added no Ink: A fixtures started with 0 (or 6 referral), B fixtures keep theirs
    const start: Record<string, number> = { A_referral: 6, B_present: 10, B_plus_referral: 16 };
    expect(d.inkTopup ?? 0).toBe(start[racedKey] ?? 0);
  });

  it('a guard change after classify (user became a test account) is not written', async () => {
    const id = await mkUser({ signupBonusGrantedAt: iso('2026-08-01') });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = mongoose.mongo.Collection.prototype as any;
    const orig = proto.findOneAndUpdate;
    jest.spyOn(proto, 'findOneAndUpdate').mockImplementation(async function (
      this: any,
      ...args: any[]
    ) {
      if (this.collectionName === 'users') {
        await this.updateOne({ _id: id }, { $set: { isActive: false } });
      }
      return orig.apply(this, args);
    });
    const res = await run(db(), { apply: true, cutoff: CUT, log: () => undefined });
    expect(res.counts['already_done']).toBe(1);
    expect((await rawOf(id)).inkTopup).toBeUndefined();
    expect(await freeRows(id)).toHaveLength(0);
  });

  it('a per-user failure is counted failed, the rest still run, the id goes to the ids sink', async () => {
    const { ids } = await seedFixtures(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = mongoose.mongo.Collection.prototype as any;
    const orig = proto.findOneAndUpdate;
    let failedId: unknown;
    jest.spyOn(proto, 'findOneAndUpdate').mockImplementation(function (this: any, ...args: any[]) {
      if (!failedId && this.collectionName === 'users') {
        failedId = args[0]._id;
        return Promise.reject(new Error('injected'));
      }
      return orig.apply(this, args);
    });
    const c = collect();
    const res = await run(db(), { apply: true, cutoff: CUT, log: c.log, writeIds: c.writeIds });
    expect(res.failed).toBe(1); // main() exits 1 on any failure
    expect(res.counts['seeded_A'] + res.counts['row_only_B']).toBe(7);
    expect(c.ids).toContain(`failed\t${String(failedId)}`);
    expect(c.lines.join('\n')).not.toContain(String(failedId));
    const key = Object.entries(ids).find(([, v]) => String(v) === String(failedId))![0];
    expect((await rawOf(ids[key])).freeSeedAt).toBeUndefined();
    expect(await freeRows(ids[key])).toHaveLength(0);
  });

  it('a failed row insert keeps Ink + freeSeedAt, counts failed, and the sign-in heal writes the row once', async () => {
    const id = await mkUser({ signupBonusGrantedAt: iso('2026-08-01') });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = mongoose.mongo.Collection.prototype as any;
    const orig = proto.insertOne;
    let used = false;
    jest.spyOn(proto, 'insertOne').mockImplementation(function (this: any, ...args: any[]) {
      if (!used && this.collectionName === 'inkledger') {
        used = true;
        return Promise.reject(new Error('row down'));
      }
      return orig.apply(this, args);
    });
    const res = await run(db(), { apply: true, cutoff: CUT, log: () => undefined });
    expect(res.failed).toBe(1);
    expect((await rawOf(id)).inkTopup).toBe(10);
    expect(await freeRows(id)).toHaveLength(0);
    jest.restoreAllMocks();
    await grantSignupBonus(id.toString()); // what sign-in does
    await grantSignupBonus(id.toString());
    expect(await freeRows(id)).toHaveLength(1);
    expect((await rawOf(id)).inkTopup).toBe(10);
  });

  it('a backfilled user signing in later (heal path) gets no second row and no more Ink', async () => {
    const { ids } = await seedFixtures(true);
    await run(db(), { apply: true, cutoff: CUT, log: () => undefined });
    const before = await snapshot();
    for (const k of [...A_NAMES, ...B_NAMES]) await grantSignupBonus(ids[k].toString());
    expect(await snapshot()).toBe(before);
  });

  it('the unverified user with no row is never given anything, even after a run', async () => {
    const { ids } = await seedFixtures(true);
    await run(db(), { apply: true, cutoff: CUT, log: () => undefined });
    const d = await rawOf(ids['unverified']);
    expect(d.inkTopup).toBeUndefined();
    expect(d.freeSeedAt).toBeUndefined();
  });
});

describe('the script as a process (harness DB only)', () => {
  const root = path.join(__dirname, '..', '..', '..', '..');
  const authDir = path.join(__dirname, '..', '..');
  const uri = () =>
    `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
  const exec = (args: string[]) => {
    const target = uri();
    // Only ever the in-memory test server.
    expect(target).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//);
    return spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules', '.bin', 'ts-node'),
        '--transpile-only',
        'scripts/backfill-free-seed.ts',
        ...args,
      ],
      {
        cwd: authDir,
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'test',
          MONGO_URI: target,
        },
      },
    );
  };

  it('dry run with --ids-out: exit 0, file mode 0600, lines <class>\\t<id>, stdout has no id', async () => {
    const { ids } = await seedFixtures();
    const before = await snapshot();
    const out = path.join(tmpDir, 'dry.tsv');
    const r = exec(['--dry-run', '--ids-out', out]);
    expect(r.status).toBe(0);
    expect(await snapshot()).toBe(before);
    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
    const lines = fs.readFileSync(out, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(10);
    for (const l of lines) expect(l).toMatch(/^(A|B|manual|failed)\t[0-9a-f]{24}$/);
    expect(lines).toContain(`A\t${ids['A_basic'].toString()}`);
    const all = `${r.stdout}\n${r.stderr}`;
    for (const id of Object.values(ids)) expect(all).not.toContain(id.toString());
    expect(all).toContain('Dry run: nothing written.');
    expect(all).toContain('cut-off: 2026-06-15T19:40:43.000Z (source: floor; floor 2026-06-15');
    expect(all).toContain('WARNING: no --cutoff given');
    expect(all).toContain('Target (dry run, read-only): mongodb://');
  });

  it('refuses to overwrite an existing ids file and a missing directory (exit 2)', async () => {
    const existing = path.join(tmpDir, 'exists.tsv');
    fs.writeFileSync(existing, 'keep me\n');
    const r1 = exec(['--ids-out', existing]);
    expect(r1.status).toBe(2);
    expect(fs.readFileSync(existing, 'utf8')).toBe('keep me\n');
    const r2 = exec(['--ids-out', path.join(tmpDir, 'no-such-dir', 'x.tsv')]);
    expect(r2.status).toBe(2);
  });

  it.each([
    [['--apply']],
    [['--apply', '--ids-out', 'x']], // no --cutoff
    [['--apply', '--cutoff', '2026-10-25T22:00:00Z']], // no --ids-out
    [['--apply', '--cutoff', '2026-06-15T19:40:42Z', '--ids-out', 'x']], // below the floor
    [['--cutoff', 'garbage']],
    [['--cutoff']],
    [['--apply', '--dry-run', '--ids-out', 'x']],
    [['--nope']],
    [['--before', 'garbage']],
    [['--before']],
  ])('usage error exits 2 and writes nothing: %j', async (args) => {
    await seedFixtures();
    const before = await snapshot();
    const r = exec(args);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Usage:');
    expect(await snapshot()).toBe(before);
  });

  it('--apply via the CLI: exit 0, seeded, ids file lists seeded_A / row_only_B / manual, stdout no ids', async () => {
    const { ids } = await seedFixtures(true);
    const out = path.join(tmpDir, 'apply.tsv');
    const r = exec(['--apply', '--cutoff', CUT.toISOString(), '--ids-out', out]);
    expect(r.status).toBe(0);
    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
    const lines = fs.readFileSync(out, 'utf8').trim().split('\n');
    expect(lines.filter((l) => l.startsWith('seeded_A\t'))).toHaveLength(6);
    expect(lines.filter((l) => l.startsWith('row_only_B\t'))).toHaveLength(2);
    expect(lines.filter((l) => l.startsWith('manual\t'))).toHaveLength(2);
    const all = `${r.stdout}\n${r.stderr}`;
    for (const id of Object.values(ids)) expect(all).not.toContain(id.toString());
    expect(all).toContain('--apply: WRITING to mongodb://');
    expect((await rawOf(ids['A_basic'])).inkTopup).toBe(10);
    expect(await freeRows(ids['A_basic'])).toHaveLength(1);
    expect((await rawOf(ids['pre_cutoff'])).inkTopup).toBeUndefined();
  });

  it('a failing user makes the CLI exit 1 and the ids file lists it as failed, others still done', async () => {
    const good = await mkUser({ signupBonusGrantedAt: iso('2026-08-01') });
    const bad = await mkUser({ signupBonusGrantedAt: iso('2026-08-02') });
    // Reject only the bad user's seed row with a collection validator (server-side failure).
    await ink().insertOne({ userId: new mongoose.Types.ObjectId(), delta: 1, reason: 'seed-coll' });
    await db().command({
      collMod: 'inkledger',
      validator: { $expr: { $ne: ['$userId', bad] } },
      validationLevel: 'strict',
      validationAction: 'error',
    });
    try {
      const out = path.join(tmpDir, 'fail.tsv');
      const r = exec(['--apply', '--cutoff', CUT.toISOString(), '--ids-out', out]);
      expect(r.status).toBe(1);
      const lines = fs.readFileSync(out, 'utf8').trim().split('\n');
      expect(lines).toContain(`failed\t${bad.toString()}`);
      expect(lines).toContain(`seeded_A\t${good.toString()}`);
      expect(`${r.stdout}${r.stderr}`).not.toContain(bad.toString());
      expect(`${r.stdout}${r.stderr}`).toContain('failed: 1');
    } finally {
      await db().command({ collMod: 'inkledger', validator: {}, validationLevel: 'off' });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Round 2 (AJ-657-M1b / M1c): --cutoff, window / near_cutoff, earliest-account guard.
// ---------------------------------------------------------------------------------------------

const LATE = new Date(CO.getTime() + DAY); // createdAt that never predates CO
const mkLate = (marker: Date | string | null | undefined, f: Row = {}) =>
  mkUser({
    ...(marker === undefined ? {} : { signupBonusGrantedAt: marker }),
    createdAt: LATE,
    ...f,
  });
const classifyAt = async (id: mongoose.Types.ObjectId, cutoff: Date) =>
  classify(db(), (await rawOf(id)) as never, cutoff);
const noIds = (text: string, ids: mongoose.Types.ObjectId[]) => {
  for (const id of ids) expect(text).not.toContain(id.toString());
  expect(text).not.toMatch(/\b[0-9a-f]{24}\b/);
};

describe('parseArgs --cutoff', () => {
  it('parses a valid ISO value', () => {
    expect(parseArgs(['--cutoff', '2026-10-25T22:00:00Z'])?.cutoff).toEqual(CO);
    expect(parseArgs(['--cutoff', '2026-10-25T22:00:00Z'])?.apply).toBe(false);
  });
  it('no --cutoff: undefined (a dry run then uses the floor)', () => {
    expect(parseArgs([])?.cutoff).toBeUndefined();
    expect(parseArgs(['--dry-run'])?.cutoff).toBeUndefined();
  });
  it('the floor itself is accepted, 1 ms earlier is a usage error', () => {
    expect(parseArgs(['--cutoff', CUT.toISOString()])?.cutoff).toEqual(CUT);
    expect(parseArgs(['--cutoff', new Date(CUT.getTime() - 1).toISOString()])).toBeNull();
    expect(parseArgs(['--cutoff', '2020-01-01T00:00:00Z'])).toBeNull();
  });
  it.each([
    [['--cutoff', 'not-a-date']],
    [['--cutoff']],
    [['--cutoff', '--apply']],
    [['--cutoff', '--ids-out', '/x']],
  ])('usage error for %j', (argv) => {
    expect(parseArgs(argv)).toBeNull();
  });
  it('--apply needs --cutoff even with --ids-out; with both it is accepted', () => {
    expect(parseArgs(['--apply', '--ids-out', '/x'])).toBeNull();
    expect(parseArgs(['--apply', '--ids-out', '/x', '--cutoff', CO.toISOString()])).not.toBeNull();
    expect(
      parseArgs(['--apply', '--ids-out', '/x', '--cutoff', '2026-01-01T00:00:00Z']),
    ).toBeNull();
  });
});

describe('run: the cut-off line', () => {
  it('without cutoff: WARNING first, then the cut-off line with source: floor', async () => {
    const c = collect();
    await run(db(), { apply: false, log: c.log });
    expect(c.lines[0]).toBe(
      `WARNING: no --cutoff given: using the commit-time floor; --apply requires --cutoff (prod: ${PROD_CUTOFF_HINT})`,
    );
    expect(c.lines[1]).toBe(
      `cut-off: ${CUT.toISOString()} (source: floor; floor ${CUT.toISOString()}, commit ${FREE_SEED_GO_LIVE_SHA}, 2026-06-16 01:10:43 +0530)`,
    );
  });
  it('with cutoff: source: arg, the effective instant, no WARNING', async () => {
    const c = collect();
    await run(db(), { apply: false, cutoff: CO, log: c.log });
    const text = c.lines.join('\n');
    expect(text).toContain(
      `cut-off: ${CO.toISOString()} (source: arg; floor ${CUT.toISOString()}, commit ${FREE_SEED_GO_LIVE_SHA}`,
    );
    expect(text).not.toContain('WARNING: no --cutoff');
  });
});

describe('run: the cut-off is a guard, not a selector', () => {
  it('dry run: the exact instant is eligible, 1 ms before is skipped_pre_seed; nothing written', async () => {
    const at = await mkLate(new Date(CO.getTime()));
    const before1 = await mkLate(new Date(CO.getTime() - 1));
    const after = await mkLate(iso('2026-11-01T00:00:00Z'));
    const early = await mkLate(iso('2026-08-01T00:00:00Z'));
    expect((await classifyAt(at, CO)).group).toBe('A');
    expect((await classifyAt(before1, CO)).group).toBe('skipped_pre_seed');
    expect((await classifyAt(after, CO)).group).toBe('A');
    expect((await classifyAt(early, CO)).group).toBe('skipped_pre_seed');
    // the same users with the floor as cut-off: all eligible (the date is only a guard)
    expect((await classifyAt(early, CUT)).group).toBe('A');
    const snap = await snapshot();
    const c = collect();
    const res = await run(db(), { apply: false, cutoff: CO, log: c.log, writeIds: c.writeIds });
    expect(await snapshot()).toBe(snap);
    expect(res.counts).toMatchObject({ candidates: 4, A: 2, skipped_pre_seed: 2 });
  });

  it('apply: pre-cutoff users are untouched (no Ink, no row, no freeSeedAt); the instant gets the seed', async () => {
    const at = await mkLate(new Date(CO.getTime()));
    const before1 = await mkLate(new Date(CO.getTime() - 1));
    const early = await mkLate(iso('2026-08-01T00:00:00Z'), { inkTopup: 3 });
    const earlyDoc = JSON.stringify(await rawOf(early));
    const before1Doc = JSON.stringify(await rawOf(before1));
    const c = collect();
    const res = await run(db(), { apply: true, cutoff: CO, log: c.log, writeIds: c.writeIds });
    expect(res.refused).toBe(false);
    expect(res.counts).toMatchObject({ seeded_A: 1, skipped_pre_seed: 2, failed: 0 });
    expect((await rawOf(at)).inkTopup).toBe(10);
    expect(await freeRows(at)).toHaveLength(1);
    expect(JSON.stringify(await rawOf(early))).toBe(earlyDoc);
    expect(JSON.stringify(await rawOf(before1))).toBe(before1Doc);
    expect(await freeRows(early)).toHaveLength(0);
    expect(await freeRows(before1)).toHaveLength(0);
    // pre-seed users appear in no write class
    for (const l of c.ids.filter((x) => /^(seeded_A|row_only_B|failed)\t/.test(x))) {
      expect(l).not.toContain(early.toString());
      expect(l).not.toContain(before1.toString());
    }
    expect(c.ids).toContain(`window\t${early.toString()}`); // listed only
  });

  it('selection is by state: a marker after the cut-off with freeSeedAt set is not a candidate', async () => {
    await mkLate(iso('2026-11-02T00:00:00Z'), { freeSeedAt: new Date(), inkTopup: 10 });
    const res = await run(db(), { apply: false, cutoff: CO, log: () => undefined });
    expect(res.counts['candidates']).toBe(0);
  });

  it('run() without cutoff falls back to the floor', async () => {
    const id = await mkLate(iso('2026-07-01T00:00:00Z'));
    const withFloor = await run(db(), { apply: false, log: () => undefined });
    expect(withFloor.counts).toMatchObject({ A: 1, skipped_pre_seed: 0 });
    const withCo = await run(db(), { apply: false, cutoff: CO, log: () => undefined });
    expect(withCo.counts).toMatchObject({ A: 0, skipped_pre_seed: 1 });
    expect(id).toBeTruthy();
  });
});

describe('window and near_cutoff (listed only, never written, never on stdout)', () => {
  async function windowFixtures() {
    const f: Record<string, mongoose.Types.ObjectId> = {};
    f.w_floor = await mkLate(new Date(CUT.getTime()));
    f.w_below_floor = await mkLate(new Date(CUT.getTime() - 1));
    f.w_mid = await mkLate(iso('2026-08-01T00:00:00Z'));
    f.w_last_ms = await mkLate(new Date(CO.getTime() - 1));
    f.w_row = await mkLate(iso('2026-08-02T00:00:00Z'), { inkTopup: 10 });
    await ink().insertOne({
      _id: `free_seed:${f.w_row.toString()}` as never,
      userId: f.w_row,
      delta: 10,
      reason: 'free_seed',
      sourceBucket: 'topup',
      balanceAfter: 10,
      createdAt: new Date(),
    });
    f.w_unverified = await mkLate(iso('2026-08-03T00:00:00Z'), { emailVerified: false });
    f.w_none = await mkLate('not-a-date', { createdAt: undefined });
    await users().updateOne({ _id: f.w_none }, { $unset: { createdAt: '' } });
    f.w_test = await mkLate(iso('2026-08-04T00:00:00Z'), { isTestAccount: true });
    f.elig_at_cutoff = await mkLate(new Date(CO.getTime()));
    // createdAt-dated (marker not a date): near_cutoff boundary at exactly 7 days
    const cr = (ms: number, f2: Row = {}) =>
      mkUser({ signupBonusGrantedAt: 'x', createdAt: new Date(ms), ...f2 });
    f.n_edge = await cr(CO.getTime() - NEAR_CUTOFF_MS);
    f.n_edge_minus = await cr(CO.getTime() - NEAR_CUTOFF_MS - 1);
    f.n_last_ms = await cr(CO.getTime() - 1);
    f.n_at_cutoff = await cr(CO.getTime());
    f.n_marker_sourced = await mkUser({
      signupBonusGrantedAt: new Date(CO.getTime() - DAY),
      createdAt: new Date(CO.getTime() - DAY),
    });
    f.n_test = await cr(CO.getTime() - DAY, { isTestAccount: true });
    return f;
  }
  const WINDOW = [
    'w_floor',
    'w_mid',
    'w_last_ms',
    'n_edge',
    'n_edge_minus',
    'n_last_ms',
    'n_marker_sourced',
  ];
  const NEAR = ['n_edge', 'n_last_ms'];

  it('Classified flags: floor inclusive / cut-off exclusive; row, unverified, test, no-date never window; 7 days inclusive', async () => {
    const f = await windowFixtures();
    const flags = async (k: string) => {
      const c = await classifyAt(f[k], CO);
      return { group: c.group, window: c.window, nearCutoff: c.nearCutoff };
    };
    expect(await flags('w_floor')).toEqual({
      group: 'skipped_pre_seed',
      window: true,
      nearCutoff: false,
    });
    expect(await flags('w_below_floor')).toEqual({
      group: 'skipped_pre_seed',
      window: false,
      nearCutoff: false,
    });
    expect(await flags('w_mid')).toMatchObject({ window: true, nearCutoff: false });
    expect(await flags('w_last_ms')).toMatchObject({ window: true, nearCutoff: false }); // marker-dated
    expect(await flags('elig_at_cutoff')).toEqual({ group: 'A', window: false, nearCutoff: false });
    // a row of any date: not window (the code checks for any free_seed row)
    expect(await flags('w_row')).toMatchObject({ group: 'skipped_pre_seed', window: false });
    expect(await flags('w_unverified')).toMatchObject({
      group: 'unverified_skipped',
      window: false,
    });
    expect(await flags('w_none')).toMatchObject({
      group: 'skipped_pre_seed',
      window: false,
      nearCutoff: false,
    });
    expect(await flags('w_test')).toMatchObject({ group: 'skipped_test', window: false });
    // near_cutoff: createdAt-sourced, [cut-off - 7d, cut-off)
    expect(await flags('n_edge')).toEqual({
      group: 'skipped_pre_seed',
      window: true,
      nearCutoff: true,
    });
    expect(await flags('n_edge_minus')).toMatchObject({ window: true, nearCutoff: false });
    expect(await flags('n_last_ms')).toMatchObject({ window: true, nearCutoff: true });
    expect(await flags('n_at_cutoff')).toEqual({ group: 'A', window: false, nearCutoff: false });
    expect(await flags('n_marker_sourced')).toMatchObject({ window: true, nearCutoff: false });
  });

  it('dry run: ids only in the ids sink as window/near_cutoff lines, counts on stdout, users never written', async () => {
    const f = await windowFixtures();
    const snap = await snapshot();
    const c = collect();
    const res = await run(db(), { apply: false, cutoff: CO, log: c.log, writeIds: c.writeIds });
    expect(await snapshot()).toBe(snap);
    const by = (cls: string) =>
      c.ids
        .filter((l) => l.startsWith(`${cls}\t`))
        .map((l) => l.split('\t')[1])
        .sort();
    expect(by('window')).toEqual(WINDOW.map((k) => f[k].toString()).sort());
    expect(by('near_cutoff')).toEqual(NEAR.map((k) => f[k].toString()).sort());
    expect(res.counts['window']).toBe(WINDOW.length);
    expect(res.counts['near_cutoff']).toBe(NEAR.length);
    const text = c.lines.join('\n');
    expect(text).toContain(`window: ${WINDOW.length}`);
    expect(text).toContain(`near_cutoff: ${NEAR.length}`);
    noIds(text, Object.values(f));
    // test accounts are never in near_cutoff (nor window)
    expect(c.ids.join('\n')).not.toContain(f.n_test.toString());
    expect(c.ids.join('\n')).not.toContain(f.w_test.toString());
  });

  it('empty when everything is dated after the cut-off', async () => {
    await mkLate(iso('2026-11-01T00:00:00Z'));
    await mkLate(new Date(CO.getTime()));
    await mkUser({ signupBonusGrantedAt: 'x', createdAt: new Date(CO.getTime() + 1) });
    const c = collect();
    const res = await run(db(), { apply: false, cutoff: CO, log: c.log, writeIds: c.writeIds });
    expect(res.counts).toMatchObject({ window: 0, near_cutoff: 0, skipped_pre_seed: 0, A: 3 });
    expect(c.ids.some((l) => l.startsWith('window\t') || l.startsWith('near_cutoff\t'))).toBe(
      false,
    );
    expect(c.lines.join('\n')).toContain('window: 0');
    expect(c.lines.join('\n')).toContain('near_cutoff: 0');
  });

  it('with the floor as cut-off both classes are empty', async () => {
    await windowFixtures();
    const c = collect();
    const res = await run(db(), { apply: false, log: c.log, writeIds: c.writeIds });
    expect(res.counts).toMatchObject({ window: 0, near_cutoff: 0 });
  });

  it('apply: a window user is listed, never granted; the eligible user is', async () => {
    const win = await mkLate(iso('2026-08-01T00:00:00Z'), { inkTopup: 4 });
    const elig = await mkLate(iso('2026-11-01T00:00:00Z'));
    const winDoc = JSON.stringify(await rawOf(win));
    const c = collect();
    const res = await run(db(), { apply: true, cutoff: CO, log: c.log, writeIds: c.writeIds });
    expect(res.refused).toBe(false);
    expect(res.counts).toMatchObject({ window: 1, seeded_A: 1, failed: 0 });
    expect(JSON.stringify(await rawOf(win))).toBe(winDoc);
    expect(await freeRows(win)).toHaveLength(0);
    expect((await rawOf(elig)).inkTopup).toBe(10);
    expect(c.ids).toContain(`window\t${win.toString()}`);
    expect(c.ids).toContain(`seeded_A\t${elig.toString()}`);
    noIds(c.lines.join('\n'), [win, elig]);
  });

  it('apply: a near_cutoff user is createdAt-dated before the cut-off, so it is refused by M1c and untouched', async () => {
    const near = await mkUser({
      signupBonusGrantedAt: 'x',
      createdAt: new Date(CO.getTime() - DAY),
    });
    await mkLate(iso('2026-11-01T00:00:00Z'));
    const snap = await snapshot();
    const c = collect();
    const res = await run(db(), { apply: true, cutoff: CO, log: c.log, writeIds: c.writeIds });
    expect(res.refused).toBe(true);
    expect(res.counts['near_cutoff']).toBe(1);
    expect(await snapshot()).toBe(snap);
    expect(c.ids).toEqual([]);
    expect(await freeRows(near)).toHaveLength(0);
  });
});

describe('earliest-account guard (AJ-657-M1c)', () => {
  it('earliestAccountCheck: minimum createdAt over ALL users; < cutoff counted, == cutoff is not; absent/null counted as no_createdAt', async () => {
    await mkUser({ createdAt: iso('2026-09-10T00:00:00Z') });
    await mkUser({ createdAt: iso('2026-09-01T00:00:00Z'), isTestAccount: true, isActive: false });
    await mkUser({ createdAt: new Date(CO.getTime() - 1), erasure: { at: new Date() } });
    await mkUser({ createdAt: new Date(CO.getTime()) });
    await mkUser({ createdAt: LATE });
    await mkUser({ createdAt: null });
    const gone = await mkUser({});
    await users().updateOne({ _id: gone }, { $unset: { createdAt: '' } });
    const r = await earliestAccountCheck(db(), CO);
    expect(r.earliestCreatedAt).toEqual(iso('2026-09-01T00:00:00Z'));
    expect(r.predateCutoff).toBe(3);
    expect(r.noCreatedAt).toBe(2);
    // an empty collection
    await users().deleteMany({});
    expect(await earliestAccountCheck(db(), CO)).toEqual({
      earliestCreatedAt: null,
      predateCutoff: 0,
      noCreatedAt: 0,
    });
  });

  it('earliestAccountCheck reads createdAt only (projection excludes _id)', async () => {
    await mkUser({});
    const spy = jest.spyOn(mongoose.mongo.Collection.prototype, 'find');
    await earliestAccountCheck(db(), CO);
    const usersCall = spy.mock.calls.find(
      (_c, i) => (spy.mock.contexts[i] as { collectionName?: string }).collectionName === 'users',
    );
    expect(usersCall?.[1]).toMatchObject({ projection: { _id: 0, createdAt: 1 } });
  });

  it('dry run with accounts before the cut-off: prints earliest, count, no_createdAt and the WARNING; completes; writes nothing', async () => {
    const early = await mkUser({
      signupBonusGrantedAt: iso('2026-08-01'),
      createdAt: iso('2026-09-01T12:00:00Z'),
    });
    await mkUser({ createdAt: iso('2026-10-01T00:00:00Z') });
    const nocr = await mkUser({});
    await users().updateOne({ _id: nocr }, { $unset: { createdAt: '' } });
    await mkUser({ createdAt: null });
    await mkLate(iso('2026-11-01'));
    const snap = await snapshot();
    const c = collect();
    const res = await run(db(), { apply: false, cutoff: CO, log: c.log, writeIds: c.writeIds });
    expect(await snapshot()).toBe(snap);
    expect(res.refused).toBe(false);
    expect(res.earliestCreatedAt).toEqual(iso('2026-09-01T12:00:00Z'));
    expect(res.predateCutoff).toBe(2);
    expect(res.noCreatedAt).toBe(2);
    expect(c.lines).toContain('earliest account createdAt: 2026-09-01T12:00:00.000Z');
    expect(c.lines).toContain('accounts with createdAt before the cut-off: 2');
    expect(c.lines).toContain('no_createdAt: 2');
    expect(c.lines).toContain('WARNING: 2 accounts predate the cut-off');
    expect(c.lines.join('\n')).not.toContain('confirmed: 0 accounts');
    expect(c.lines[c.lines.length - 1]).toBe('Dry run: nothing written.');
    noIds(c.lines.join('\n'), [early, nocr]);
  });

  it('dry run with none before the cut-off: the confirmed line, no WARNING', async () => {
    await mkLate(iso('2026-11-01'));
    await mkUser({ createdAt: new Date(CO.getTime()) });
    const c = collect();
    const res = await run(db(), { apply: false, cutoff: CO, log: c.log });
    expect(res.predateCutoff).toBe(0);
    expect(c.lines).toContain('confirmed: 0 accounts before the cut-off');
    expect(c.lines).toContain(`earliest account createdAt: ${CO.toISOString()}`);
    expect(c.lines.join('\n')).not.toMatch(/WARNING: \d+ accounts predate/);
  });

  it('empty database: earliest is none, confirmed', async () => {
    const c = collect();
    await run(db(), { apply: false, cutoff: CO, log: c.log });
    expect(c.lines).toContain('earliest account createdAt: none');
    expect(c.lines).toContain('confirmed: 0 accounts before the cut-off');
  });

  it('--apply with N > 0 refuses before ANY write: users + inkledger identical, no ids written, refused true, message printed', async () => {
    await seedFixtures(true);
    await mkUser({ createdAt: iso('2026-07-01T00:00:00Z') }); // predates CO
    await mkLate(iso('2026-11-01T00:00:00Z')); // an eligible A candidate that must stay untouched
    const snap = await snapshot();
    const c = collect();
    const res = await run(db(), { apply: true, cutoff: CO, log: c.log, writeIds: c.writeIds });
    expect(res.refused).toBe(true);
    expect(res.predateCutoff).toBeGreaterThan(0);
    expect(res.counts).toMatchObject({ seeded_A: 0, row_only_B: 0, failed: 0 });
    expect(await snapshot()).toBe(snap);
    expect(c.ids).toEqual([]);
    expect(c.lines).toContain(
      `refusing --apply: ${res.predateCutoff} accounts predate the cut-off; goes back to Ajay (AJ-657-M1c)`,
    );
    expect(c.lines.join('\n')).not.toContain('seeded_A:');
    expect(c.lines.join('\n')).toContain(
      `WARNING: ${res.predateCutoff} accounts predate the cut-off`,
    );
  });

  it('refusal makes no write call at all (no findOneAndUpdate / insertOne / updateOne)', async () => {
    await mkUser({ signupBonusGrantedAt: iso('2026-11-01'), createdAt: iso('2026-07-01') });
    const proto = mongoose.mongo.Collection.prototype;
    const spies = [
      jest.spyOn(proto, 'findOneAndUpdate'),
      jest.spyOn(proto, 'insertOne'),
      jest.spyOn(proto, 'updateOne'),
      jest.spyOn(proto, 'updateMany'),
    ];
    const res = await run(db(), { apply: true, cutoff: CO, log: () => undefined });
    expect(res.refused).toBe(true);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('users without createdAt are no_createdAt and do NOT trigger the refusal', async () => {
    const a = await mkLate(iso('2026-11-01'));
    const b = await mkUser({ signupBonusGrantedAt: iso('2026-11-02') });
    await users().updateOne({ _id: b }, { $unset: { createdAt: '' } });
    const cnull = await mkUser({ signupBonusGrantedAt: iso('2026-11-03'), createdAt: null });
    const c = collect();
    const res = await run(db(), { apply: true, cutoff: CO, log: c.log, writeIds: c.writeIds });
    expect(res.refused).toBe(false);
    expect(res.noCreatedAt).toBe(2);
    expect(res.predateCutoff).toBe(0);
    expect(res.counts['seeded_A']).toBe(3);
    for (const id of [a, b, cnull]) expect((await rawOf(id)).inkTopup).toBe(10);
    expect(c.lines).toContain('no_createdAt: 2');
    expect(c.lines).toContain('confirmed: 0 accounts before the cut-off');
  });
});

describe('the script as a process, round 2 (harness DB only)', () => {
  const root = path.join(__dirname, '..', '..', '..', '..');
  const authDir = path.join(__dirname, '..', '..');
  const cli = (args: string[]) => {
    const target = `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
    expect(target).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//);
    return spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules', '.bin', 'ts-node'),
        '--transpile-only',
        'scripts/backfill-free-seed.ts',
        ...args,
      ],
      {
        cwd: authDir,
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'test',
          MONGO_URI: target,
        },
      },
    );
  };

  it('dry run with --cutoff: source: arg, no WARNING, earliest + confirmed lines, exit 0', async () => {
    await mkLate(iso('2026-11-01'));
    const r = cli(['--cutoff', CO.toISOString()]);
    expect(r.status).toBe(0);
    const all = `${r.stdout}\n${r.stderr}`;
    expect(all).toContain(`cut-off: ${CO.toISOString()} (source: arg;`);
    expect(all).not.toContain('WARNING: no --cutoff');
    expect(all).toContain('confirmed: 0 accounts before the cut-off');
    expect(all).toContain('Dry run: nothing written.');
  });

  it('--apply with --cutoff and --ids-out: exit 0, 0600 ids file with seeded lines, pre-cutoff untouched, stdout no ids', async () => {
    const a = await mkLate(iso('2026-11-01'));
    const pre = await mkLate(iso('2026-08-01'));
    const win = pre;
    const out = path.join(tmpDir, 'apply-co.tsv');
    const r = cli(['--apply', '--cutoff', CO.toISOString(), '--ids-out', out]);
    expect(r.status).toBe(0);
    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
    const lines = fs.readFileSync(out, 'utf8').trim().split('\n');
    expect(lines).toContain(`seeded_A\t${a.toString()}`);
    expect(lines).toContain(`window\t${win.toString()}`);
    expect((await rawOf(a)).inkTopup).toBe(10);
    expect((await rawOf(pre)).inkTopup).toBeUndefined();
    noIds(`${r.stdout}\n${r.stderr}`, [a, pre]);
  });

  it('--apply when an account predates the cut-off: exit 1, the message, nothing written, ids file empty (0600)', async () => {
    await seedFixtures(true);
    await mkUser({ createdAt: iso('2026-07-01T00:00:00Z') });
    await mkLate(iso('2026-11-01'));
    const snap = await snapshot();
    const out = path.join(tmpDir, 'refused.tsv');
    const r = cli(['--apply', '--cutoff', CO.toISOString(), '--ids-out', out]);
    expect(r.status).toBe(1);
    const all = `${r.stdout}\n${r.stderr}`;
    expect(all).toMatch(
      /refusing --apply: \d+ accounts predate the cut-off; goes back to Ajay \(AJ-657-M1c\)/,
    );
    expect(await snapshot()).toBe(snap);
    expect(fs.statSync(out).size).toBe(0);
    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
    expect(all).not.toMatch(/\b[0-9a-f]{24}\b/);
  });

  it('--apply without --cutoff exits 2 with usage and writes nothing; --cutoff below the floor exits 2', async () => {
    await mkLate(iso('2026-11-01'));
    const snap = await snapshot();
    const out = path.join(tmpDir, 'nocut.tsv');
    const r1 = cli(['--apply', '--ids-out', out]);
    expect(r1.status).toBe(2);
    expect(r1.stderr).toContain('Usage:');
    expect(fs.existsSync(out)).toBe(false);
    const r2 = cli(['--cutoff', '2026-06-15T19:40:42Z']);
    expect(r2.status).toBe(2);
    expect(await snapshot()).toBe(snap);
  });
});

// ---------------------------------------------------------------------------------------------
// Round 3: ambiguous class, normalised row id, strict dates, env guard.
// ---------------------------------------------------------------------------------------------

describe('ambiguous class (only exact 0 => A, exact 10 => B)', () => {
  const grp = async (id: mongoose.Types.ObjectId) =>
    (await classify(db(), (await rawOf(id)) as never)).group;
  const topupRow = (userId: mongoose.Types.ObjectId, delta: number, f: Row = {}) =>
    ink().insertOne({
      userId,
      delta,
      reason: 'topup',
      sourceBucket: 'topup',
      createdAt: new Date(),
      ...f,
    });

  it.each([[-1], [-10], [0.5], [1], [2], [5], [9], [11], [20], [10.5]])(
    'inkTopup %s with no ledger rows is ambiguous',
    async (v) => {
      const id = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: v });
      expect(await grp(id)).toBe('ambiguous');
    },
  );

  it('inkTopup a string or NaN is ambiguous', async () => {
    const s = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: '10' });
    const n = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: Number.NaN });
    expect(await grp(s)).toBe('ambiguous');
    expect(await grp(n)).toBe('ambiguous');
  });

  it('missing or null inkTopup counts as 0 and is A', async () => {
    const missing = await mkUser({ signupBonusGrantedAt: iso('2026-08-01') });
    const nul = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: null });
    expect(await grp(missing)).toBe('A');
    expect(await grp(nul)).toBe('A');
  });

  it('explained balances: topup 6 with a 6 row is A; 16 with a 6 row is B; 5 with a 6 row is ambiguous (-1)', async () => {
    const a = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: 6 });
    await topupRow(a, 6);
    const b = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: 16 });
    await topupRow(b, 6);
    const neg = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: 5 });
    await topupRow(neg, 6);
    expect(await grp(a)).toBe('A');
    expect(await grp(b)).toBe('B');
    expect(await grp(neg)).toBe('ambiguous');
  });

  it.each([
    ['topup claim', { _id: 'topup:pay_1', delta: 20, reason: 'topup' }],
    ['coupon claim', { _id: 'coupon:c1', delta: 5, reason: 'coupon' }],
    ['drip claim', { _id: 'drip:2026-09', delta: 4, reason: 'sub_drip' }],
  ])('a pending %s row makes the user ambiguous even when the sum says A or B', async (_n, row) => {
    // sum says A: topup equals the row delta; sum says B: topup is the delta + 10
    const sumA = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: row.delta });
    await ink().insertOne({
      ...row,
      userId: sumA,
      sourceBucket: 'topup',
      state: 'pending',
    } as never);
    const sumB = await mkUser({
      signupBonusGrantedAt: iso('2026-08-01'),
      inkTopup: row.delta + 10,
    });
    await ink().insertOne({
      ...row,
      _id: `${row._id}-b`,
      userId: sumB,
      sourceBucket: 'topup',
      state: 'pending',
    } as never);
    expect(await grp(sumA)).toBe('ambiguous');
    expect(await grp(sumB)).toBe('ambiguous');
    // the same shape settled (state 'applied') is not pending: A
    const done = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: row.delta });
    await ink().insertOne({
      ...row,
      _id: `${row._id}-d`,
      userId: done,
      sourceBucket: 'topup',
      state: 'applied',
    } as never);
    expect(await grp(done)).toBe('A');
  });

  it('a subscriber (manual) wins over ambiguous', async () => {
    const id = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: 3, inkSub: 20 });
    expect(await grp(id)).toBe('manual');
    const p = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), plan: 'pro' });
    await ink().insertOne({
      _id: 'topup:x' as never,
      userId: p,
      delta: 1,
      sourceBucket: 'topup',
      state: 'pending',
    });
    expect(await grp(p)).toBe('manual');
  });

  async function ambFixtures() {
    const f: Record<string, mongoose.Types.ObjectId> = {};
    f.double_pay = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: 2 }); // unexplained 2
    f.negative = await mkUser({ signupBonusGrantedAt: iso('2026-08-02'), inkTopup: -3 });
    f.pending = await mkUser({ signupBonusGrantedAt: iso('2026-06-20'), inkTopup: 0 });
    await ink().insertOne({
      _id: 'topup:p1' as never,
      userId: f.pending,
      delta: 0,
      sourceBucket: 'topup',
      state: 'pending',
    });
    f.a_ok = await mkUser({ signupBonusGrantedAt: iso('2026-08-03') });
    f.b_ok = await mkUser({ signupBonusGrantedAt: iso('2026-08-04'), inkTopup: 10 });
    return f;
  }

  it('dry run: count on stdout and in both-month histogram, ids only in the ids sink, users untouched', async () => {
    const f = await ambFixtures();
    const snap = await snapshot();
    const c = collect();
    const res = await run(db(), { apply: false, cutoff: CUT, log: c.log, writeIds: c.writeIds });
    expect(await snapshot()).toBe(snap);
    expect(res.counts).toMatchObject({ ambiguous: 3, A: 1, B: 1 });
    const text = c.lines.join('\n');
    expect(text).toContain('ambiguous: 3');
    expect(res.monthsEligible).toEqual({ '2026-06': 1, '2026-08': 4 });
    expect(c.ids).toEqual(
      expect.arrayContaining(
        [f.double_pay, f.negative, f.pending].map((i) => `ambiguous\t${i.toString()}`),
      ),
    );
    expect(c.ids.filter((l) => l.startsWith('ambiguous\t'))).toHaveLength(3);
    noIds(text, Object.values(f));
  });

  it('ambiguous users are counted in the pre-cutoff histogram too when dated before the cut-off', async () => {
    await mkLate(iso('2026-08-01'), { inkTopup: 2 });
    const res = await run(db(), { apply: false, cutoff: CO, log: () => undefined });
    expect(res.counts['ambiguous']).toBe(0); // pre-seed wins before any money question
    expect(res.monthsPreCutoff).toEqual({ '2026-08': 1 });
  });

  it('apply: ambiguous users are byte-identical (users + inkledger), listed in the ids sink, summary line printed; second and concurrent applies change nothing more', async () => {
    const f = await ambFixtures();
    const amb = [f.double_pay, f.negative, f.pending];
    const before = JSON.stringify([
      await Promise.all(amb.map(rawOf)),
      await ink()
        .find({ userId: { $in: amb } })
        .sort({ _id: 1 })
        .toArray(),
    ]);
    const c = collect();
    const res = await run(db(), { apply: true, cutoff: CUT, log: c.log, writeIds: c.writeIds });
    expect(res.refused).toBe(false);
    expect(res.counts).toMatchObject({ ambiguous: 3, seeded_A: 1, row_only_B: 1, failed: 0 });
    const after = () =>
      ink()
        .find({ userId: { $in: amb } })
        .sort({ _id: 1 })
        .toArray();
    expect(JSON.stringify([await Promise.all(amb.map(rawOf)), await after()])).toBe(before);
    for (const i of amb) expect(c.ids).toContain(`ambiguous\t${i.toString()}`);
    const text = c.lines.join('\n');
    expect(text).toContain('ambiguous (not touched): 3');
    noIds(text, Object.values(f));
    const snap = await snapshot();
    await Promise.all([
      run(db(), { apply: true, cutoff: CUT, log: () => undefined }),
      run(db(), { apply: true, cutoff: CUT, log: () => undefined }),
    ]);
    expect(await snapshot()).toBe(snap);
  });

  it('double-pay scenario (inkTopup 2, topup ledger sum 0): NOT granted', async () => {
    const id = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: 2 });
    await run(db(), { apply: true, cutoff: CUT, log: () => undefined });
    expect((await rawOf(id)).inkTopup).toBe(2);
    expect((await rawOf(id)).freeSeedAt).toBeUndefined();
    expect(await freeRows(id)).toHaveLength(0);
  });

  it('LIMITATION: lost-Ink (seed never landed, a failed 10-unit referral row => unexplained 10) is class B: row only, no Ink. B means "Ink present as far as the ledger can tell"', async () => {
    const id = await mkUser({ signupBonusGrantedAt: iso('2026-08-01'), inkTopup: 10 });
    // the 10 units are a referral grant whose row failed to be written: nothing in the ledger
    expect((await classify(db(), (await rawOf(id)) as never)).group).toBe('B');
    await run(db(), { apply: true, cutoff: CUT, log: () => undefined });
    expect((await rawOf(id)).inkTopup).toBe(10); // no extra Ink
    expect(await freeRows(id)).toHaveLength(1);
  });
});

describe('freeSeedLedgerId (script copy and service copy)', () => {
  const oid = new mongoose.Types.ObjectId();
  const lower = oid.toHexString();
  const cases: Array<[string, string | mongoose.Types.ObjectId]> = [
    ['lower-case hex', lower],
    ['UPPER-CASE hex', lower.toUpperCase()],
    ['ObjectId instance', oid],
    ['non-ObjectId string', 'Not-An-ObjectId'],
    ['short string', 'ABC'],
  ];
  it.each(cases)('%s: both copies are identical and never throw', (_n, input) => {
    const a = freeSeedLedgerId(input);
    expect(a).toBe(bonusSvc.freeSeedLedgerId(input));
  });
  it('ObjectId forms normalise to lower-case; others are lower-cased', () => {
    expect(freeSeedLedgerId(lower.toUpperCase())).toBe(`free_seed:${lower}`);
    expect(freeSeedLedgerId(oid)).toBe(`free_seed:${lower}`);
    expect(freeSeedLedgerId('Not-An-ObjectId')).toBe('free_seed:not-an-objectid');
  });
  it('an upper-case userId to grantSignupBonus creates no second row when the lower-case row exists, and exactly one row overall', async () => {
    const id = await mkUser({
      signupBonusGrantedAt: iso('2026-08-01'),
      inkTopup: 10,
      freeSeedAt: new Date(),
    });
    await ink().insertOne({
      _id: `free_seed:${id.toHexString()}` as never,
      userId: id,
      delta: 10,
      reason: 'free_seed',
      sourceBucket: 'topup',
      balanceAfter: 10,
      createdAt: new Date(),
    });
    await grantSignupBonus(id.toHexString().toUpperCase());
    const rows = await freeRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(`free_seed:${id.toHexString()}`);
    expect((await rawOf(id)).inkTopup).toBe(10);
    // and the heal path with a missing row writes exactly the lower-case one
    const id2 = await mkUser({
      signupBonusGrantedAt: iso('2026-08-01'),
      inkTopup: 10,
      freeSeedAt: new Date(),
    });
    await grantSignupBonus(id2.toHexString().toUpperCase());
    await grantSignupBonus(id2.toHexString());
    const rows2 = await freeRows(id2);
    expect(rows2).toHaveLength(1);
    expect(rows2[0]._id).toBe(`free_seed:${id2.toHexString()}`);
  });
  it('the backfill inserts the same _id shape', async () => {
    const id = await mkUser({ signupBonusGrantedAt: iso('2026-08-01') });
    await run(db(), { apply: true, cutoff: CUT, log: () => undefined });
    const rows = await freeRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(freeSeedLedgerId(id));
    expect(rows[0]._id).toBe(bonusSvc.freeSeedLedgerId(id.toHexString()));
  });
});

describe('strict dates (parseIsoDateTime)', () => {
  it.each([
    '2026-10-25T22:00:00Z',
    '2026-10-25T22:00Z',
    '2026-10-25T22:00:00.123Z',
    '2026-10-25T22:00:00+05:30',
    '2026-10-26T03:30:00+05:30',
  ])('accepts %s', (v) => {
    expect(parseIsoDateTime(v)).toBeInstanceOf(Date);
  });
  it.each([
    '2026-10-25',
    '2026-10-25 22:00',
    '2026-10-25T22:00:00',
    '2026',
    '2026-02-30T00:00Z',
    '2026-13-01T00:00Z',
    '2026-10-25T25:00:00Z',
    '',
    'garbage',
  ])('rejects %j', (v) => {
    expect(parseIsoDateTime(v)).toBeNull();
  });
  it('rejects non-strings without throwing', () => {
    for (const v of [undefined, null, 5, {}, new Date()]) {
      expect(parseIsoDateTime(v as never)).toBeNull();
    }
  });
  it('an offset form is the right UTC instant', () => {
    expect(parseIsoDateTime('2026-10-26T03:30:00+05:30')).toEqual(CO);
    expect(parseIsoDateTime('2026-10-25T22:00:00.123Z')!.getTime()).toBe(CO.getTime() + 123);
    expect(parseArgs(['--cutoff', '2026-10-26T03:30:00+05:30'])?.cutoff).toEqual(CO);
  });
  it.each([
    [['--cutoff', '2026-10-25']],
    [['--cutoff', '2026']],
    [['--cutoff', '2026-10-25T22:00:00']],
    [['--cutoff', '2026-02-30T00:00Z']],
    [['--before', '2026-09-01']],
    [['--before', '2026-09-01 10:00']],
    [['--before', '2026-13-01T00:00Z']],
  ])('parseArgs usage error for %j', (argv) => {
    expect(parseArgs(argv)).toBeNull();
  });
  it('the floor check on --cutoff still applies to offset forms', () => {
    expect(parseArgs(['--cutoff', '2026-06-16T01:10:42+05:30'])).toBeNull();
    expect(parseArgs(['--cutoff', '2026-06-16T01:10:43+05:30'])?.cutoff).toEqual(CUT);
  });
});

describe('the script as a process, round 3 (harness DB only)', () => {
  const root = path.join(__dirname, '..', '..', '..', '..');
  const authDir = path.join(__dirname, '..', '..');
  const spawn = (args: string[], env: Record<string, string | undefined>) =>
    spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules', '.bin', 'ts-node'),
        '--transpile-only',
        'scripts/backfill-free-seed.ts',
        ...args,
      ],
      { cwd: authDir, encoding: 'utf8', timeout: 90_000, env: env as NodeJS.ProcessEnv },
    );

  it('a bad --cutoff date (date-only) exits 2 with the usage line naming the date format', async () => {
    const target = `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
    expect(target).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//);
    const r = spawn(['--cutoff', '2026-10-25'], {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      MONGO_URI: target,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Usage:');
    expect(r.stderr).toContain('full ISO 8601 date-times with Z or +hh:mm');
  });

  it('no MONGO_URI and no NODE_ENV: exit 2 "set MONGO_URI or NODE_ENV", never connects', () => {
    const r = spawn([], { PATH: process.env.PATH, HOME: process.env.HOME });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('set MONGO_URI or NODE_ENV');
    expect(`${r.stdout}${r.stderr}`).not.toContain('Target (dry run');
    expect(`${r.stdout}${r.stderr}`).not.toContain('mongodb://');
  });
});
