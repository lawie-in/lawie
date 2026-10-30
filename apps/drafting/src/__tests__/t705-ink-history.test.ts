/**
 * T-705 — the Ink history lines of a revision (Ajay, 30 Oct 2026): a paid revision is
 * its own entry "Revision −{n} Ink" (ledger reason `regenerate`), never merged into its
 * draft; the free revision has no ledger row and shows as "Revision — free" (0 Ink) at
 * its completed Generation row's time, with the balance it had before it.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { Generation } from '../models/Generation.model';
import { LawieDocument } from '../models/Document.model';
import { mergeFreeRevisions, replayInkLedger } from '../services/ink-history.service';
import { createVerifiedUser } from './verifiedUser';

jest.setTimeout(60_000);

const SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994392f1';
const OTHER_ID = '507f1f77bcf86cd7994392f2';
const OID = new mongoose.Types.ObjectId(USER_ID);
const OTHER_OID = new mongoose.Types.ObjectId(OTHER_ID);
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

const hdr = (userId = USER_ID) => ({
  'x-internal-secret': SECRET,
  'x-user-id': userId,
  'x-user-email': 't@test.com',
  'x-user-name': 'T',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
const get = (qs = '', userId = USER_ID) =>
  request(app).get(`/credits/history${qs}`).set(hdr(userId));

const ledger = () => mongoose.connection.db!.collection('inkledger');
async function seedUser(topup: number, id = USER_ID) {
  await createVerifiedUser({
    _id: id,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: topup,
  });
}
async function row(r: {
  delta: number;
  reason: string;
  at: Date;
  runId?: string;
  runSequence?: number;
  userId?: mongoose.Types.ObjectId;
}) {
  await ledger().insertOne({
    userId: r.userId ?? OID,
    delta: r.delta,
    reason: r.reason,
    sourceBucket: 'topup',
    ...(r.runId ? { runId: r.runId } : {}),
    ...(r.runSequence !== undefined ? { runSequence: r.runSequence } : {}),
    createdAt: r.at,
  });
}
async function revisionRow(
  at: Date,
  fields: Record<string, unknown> = {},
  runId = 'run-1',
  runSequence = 2,
) {
  await Generation.collection.insertOne({
    userId: (fields.userId as mongoose.Types.ObjectId) ?? OID,
    docType: 'bail_application',
    templateId: 'bail_regular',
    status: 'completed',
    runId,
    runSequence,
    runType: 'revision',
    inkQuoted: 0,
    createdAt: at,
    updatedAt: at,
    ...fields,
  });
}

type Entry = {
  kind: string;
  label: string;
  inkDelta: number;
  balanceAfter: number;
  createdAt: string;
  documentTitle: string | null;
};

describe('GET /credits/history with revisions', () => {
  it('a paid revision is a separate "revision" entry (−n); the free one is a 0-Ink "revision_free" entry at its time, balance = the balance before it', async () => {
    // topup +20u, draft −4u, free revision (no row), paid revision −4u => 12u left
    await seedUser(12);
    await row({ delta: 20, reason: 'topup_purchase', at: daysAgo(5) });
    await row({ delta: -4, reason: 'generate', runId: 'run-1', runSequence: 1, at: daysAgo(4) });
    const freeAt = daysAgo(3);
    await revisionRow(freeAt);
    await row({ delta: -4, reason: 'regenerate', runId: 'run-1', runSequence: 3, at: daysAgo(2) });

    const res = await get();
    expect(res.status).toBe(200);
    const e = res.body.entries as Entry[];
    expect(e.map((x) => [x.label, x.inkDelta, x.balanceAfter])).toEqual([
      ['revision', -2, 6],
      ['revision_free', 0, 8],
      ['draft', -2, 8],
      ['topup', 10, 10],
    ]);
    expect(e.map((x) => x.kind)).toEqual(['usage', 'usage', 'usage', 'purchase']);
    expect(e[1].createdAt).toBe(freeAt.toISOString());
    expect(res.body.balance).toBe(6);
  });

  it('a revision of the same run is never folded into its draft, whichever reason comes first or last', async () => {
    await seedUser(2);
    await row({ delta: 20, reason: 'topup_purchase', at: daysAgo(9) });
    await row({ delta: -4, reason: 'generate', runId: 'run-1', runSequence: 1, at: daysAgo(8) });
    await row({ delta: -4, reason: 'regenerate', runId: 'run-1', runSequence: 2, at: daysAgo(7) });
    await row({ delta: -4, reason: 'regenerate', runId: 'run-1', runSequence: 3, at: daysAgo(6) });
    await row({ delta: -6, reason: 'regenerate', runId: 'run-1', runSequence: 4, at: daysAgo(5) });
    const e = (await get()).body.entries as Entry[];
    expect(e.map((x) => [x.label, x.inkDelta])).toEqual([
      ['revision', -3],
      ['revision', -2],
      ['revision', -2],
      ['draft', -2],
      ['topup', 10],
    ]);
  });

  it('two bucket rows of one paid revision are one entry', async () => {
    await seedUser(0);
    await row({ delta: 20, reason: 'topup_purchase', at: daysAgo(9) });
    await row({ delta: -4, reason: 'regenerate', runId: 'run-1', runSequence: 2, at: daysAgo(3) });
    await ledger().insertOne({
      userId: OID,
      delta: -6,
      reason: 'regenerate',
      sourceBucket: 'sub',
      runId: 'run-1',
      runSequence: 2,
      createdAt: new Date(daysAgo(3).getTime() + 500),
    });
    const usage = ((await get()).body.entries as Entry[]).filter((x) => x.kind === 'usage');
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ label: 'revision', inkDelta: -5 });
  });

  it('the free revision is first in time: its balance is the opening balance', async () => {
    await seedUser(20);
    await revisionRow(daysAgo(2));
    const e = (await get()).body.entries as Entry[];
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ label: 'revision_free', inkDelta: 0, balanceAfter: 10 });
  });

  it('only a completed revision with inkQuoted 0 on this user, inside the window, is a free-revision entry', async () => {
    await seedUser(20);
    await row({ delta: 20, reason: 'topup_purchase', at: daysAgo(10) });
    await revisionRow(daysAgo(5), { status: 'failed' }, 'r-failed', 2);
    await revisionRow(daysAgo(5), { inkQuoted: 2 }, 'r-paid', 3);
    await revisionRow(daysAgo(5), { runType: 'initial', runSequence: 1 }, 'r-init', 1);
    await revisionRow(daysAgo(5), { userId: OTHER_OID }, 'r-other', 2);
    await revisionRow(daysAgo(200), {}, 'r-old', 2); // outside the 90 days
    await revisionRow(daysAgo(4), {}, 'r-ok', 2);
    const e = (await get()).body.entries as Entry[];
    expect(e.map((x) => x.label)).toEqual(['revision_free', 'topup']);
  });

  it('the entries carry the document title of the run, and never its content', async () => {
    await seedUser(20);
    const docId = new mongoose.Types.ObjectId();
    await LawieDocument.collection.insertOne({
      _id: docId,
      userId: OID,
      title: 'Bail application Ram Kumar',
      runId: 'run-1',
      isDeleted: false,
      generatedContent: 'SECRET-BODY',
      createdAt: new Date(),
    });
    await Generation.collection.insertOne({
      userId: OID,
      runId: 'run-1',
      runSequence: 1,
      documentId: docId,
      createdAt: daysAgo(4),
    });
    await revisionRow(daysAgo(3), { documentId: docId });
    const res = await get();
    const free = (res.body.entries as Entry[]).find((x) => x.label === 'revision_free')!;
    expect(free.documentTitle).toBe('Bail application Ram Kumar');
    expect(JSON.stringify(res.body)).not.toContain('SECRET-BODY');
  });

  it('pages: a free-revision entry can be a cursor and is not repeated', async () => {
    await seedUser(20);
    await row({ delta: 20, reason: 'topup_purchase', at: daysAgo(9) });
    await revisionRow(daysAgo(5), {}, 'r-a', 2);
    await revisionRow(daysAgo(4), {}, 'r-b', 2);
    await revisionRow(daysAgo(3), {}, 'r-c', 2);
    const first = await get('?limit=2');
    expect(first.body.entries).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await get(`?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    const all = [...first.body.entries, ...second.body.entries] as Array<{ label: string }>;
    expect(all.map((x) => x.label)).toEqual([
      'revision_free',
      'revision_free',
      'revision_free',
      'topup',
    ]);
    expect(second.body.nextCursor).toBeNull();
  });
});

describe('replayInkLedger, revisions', () => {
  const r = (
    id: string,
    reason: string,
    delta: number,
    ms: number,
    runId?: string,
    runSequence?: number,
    sourceBucket = 'topup',
  ) => ({ _id: id, reason, delta, sourceBucket, runId, runSequence, createdAt: new Date(ms) });

  it('labels regenerate "revision" and generate "draft"', () => {
    const out = replayInkLedger(
      [r('a', 'generate', -2, 1, 'x', 1), r('b', 'regenerate', -2, 2, 'x', 2)],
      { start: { sub: 0, annual_carry: 0, topup: 10 } },
    );
    expect(out.map((o) => o.label)).toEqual(['draft', 'revision']);
    expect(out.map((o) => o.deltaUnits)).toEqual([-2, -2]);
  });

  it('merges rows of one run, one sequence and one reason; keeps apart another sequence or reason', () => {
    const out = replayInkLedger(
      [
        r('a', 'generate', -2, 1, 'x', 1, 'sub'),
        r('b', 'generate', -2, 2, 'x', 1, 'topup'),
        r('c', 'generate', -2, 3, 'x', 2, 'topup'), // another sequence
        r('d', 'regenerate', -2, 4, 'x', 2, 'topup'), // another reason
        r('e', 'regenerate', -2, 5, 'x', 2, 'sub'),
      ],
      { start: { sub: 10, annual_carry: 0, topup: 10 } },
    );
    expect(out.map((o) => [o.label, o.deltaUnits])).toEqual([
      ['draft', -4],
      ['draft', -2],
      ['revision', -4],
    ]);
  });

  it('a row with no sequence (pre-T-003 shape) still merges with the next of its run and reason', () => {
    const out = replayInkLedger([r('a', 'generate', -2, 1, 'x'), r('b', 'generate', -2, 2, 'x')], {
      start: { sub: 0, annual_carry: 0, topup: 10 },
    });
    expect(out).toHaveLength(1);
    expect(out[0].deltaUnits).toBe(-4);
  });
});

describe('mergeFreeRevisions', () => {
  type D = Parameters<typeof mergeFreeRevisions>[0][number];
  const d = (id: string, ms: number, delta: number, balance: number): D => ({
    id,
    createdAt: new Date(ms),
    kind: 'usage',
    label: 'draft',
    deltaUnits: delta,
    balanceUnits: balance,
    runId: 'x',
  });
  const f = (id: string, ms: number) => ({ id, createdAt: new Date(ms), runId: 'x' });

  it('nothing to merge returns a copy of the entries', () => {
    const drafts = [d('a', 1, -2, 8)];
    const out = mergeFreeRevisions(drafts, [], 10);
    expect(out).toEqual(drafts);
    expect(out).not.toBe(drafts);
  });

  it('places each free revision by time, with the balance of the entry before it (or the start)', () => {
    const out = mergeFreeRevisions(
      [d('a', 10, -2, 8), d('b', 30, -2, 6)],
      [f('late', 40), f('first', 5), f('mid', 20)],
      10,
    );
    expect(out.map((o) => [o.id, o.label, o.deltaUnits, o.balanceUnits])).toEqual([
      ['rev-first', 'revision_free', 0, 10],
      ['a', 'draft', -2, 8],
      ['rev-mid', 'revision_free', 0, 8],
      ['b', 'draft', -2, 6],
      ['rev-late', 'revision_free', 0, 6],
    ]);
    expect(
      out
        .filter((o) => o.label === 'revision_free')
        .every((o) => o.kind === 'usage' && o.runId === 'x'),
    ).toBe(true);
  });

  it('a free revision at the same instant as an entry comes before it', () => {
    const out = mergeFreeRevisions([d('a', 10, -2, 8)], [f('t', 10)], 10);
    expect(out.map((o) => o.id)).toEqual(['rev-t', 'a']);
    expect(out[0].balanceUnits).toBe(10);
  });

  it('only free revisions: all at the start balance', () => {
    const out = mergeFreeRevisions([], [f('a', 1), f('b', 2)], 7);
    expect(out.map((o) => o.balanceUnits)).toEqual([7, 7]);
  });
});
