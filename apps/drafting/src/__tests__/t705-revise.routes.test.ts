/**
 * T-705 — POST /documents/:id/revise, end to end through the app with the model stubbed
 * and an in-memory Mongo. One free revision per draft, then each further one is charged
 * the original draft's quote (Vikram, 30 Oct 2026); a refused, failed, withheld or
 * duplicate revision charges nothing and counts for nothing.
 *
 * Units: the ledger and the user's buckets count 2 units per Ink. A bail_regular draft
 * is quoted 2 Ink (4 units) when no paragraph count was asked for.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import * as aiService from '../services/ai.service';
import { GenerationFailedError, REVISION_INSTRUCTION } from '../services/ai.service';
import { releaseInk } from '../services/credits.service';
import { setLlmCallListener, type LlmCallRecord } from '../services/llm-usage';
import { draftAsText } from '../utils/draft-text';
import { decrypt, encrypt } from '../utils/encryption';
import { sdkAnswer, systemText, type SdkStreamParams } from './sdkStream';
import {
  BODY,
  drafterAnswer,
  headersFor,
  inkLedger,
  makeDraft,
  NOTE,
  rawUser,
  revise,
  revisedBody,
  seedWorld,
  signedRevisionBlock,
  sseEvent,
} from './t705-fixtures';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(60_000);

const USER_ID = '507f1f77bcf86cd7994392d2';
const OTHER_ID = '507f1f77bcf86cd7994392d3';
const START = 2000;
/** The original quote of the drafts below: 2 Ink = 4 units. */
const QUOTE_INK = 2;
const QUOTE_UNITS = 4;

beforeEach(async () => {
  await seedWorld(USER_ID, START);
});

afterEach(() => {
  setLlmCallListener(null);
  jest.restoreAllMocks();
});

const docRow = (id: string) =>
  LawieDocument.collection.findOne({ _id: new mongoose.Types.ObjectId(id) }) as Promise<Record<
    string,
    any
  > | null>; // eslint-disable-line @typescript-eslint/no-explicit-any
const setDoc = (id: string, set: Record<string, unknown>, unset: Record<string, 1> = {}) =>
  LawieDocument.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
/**
 * expected_ink is required by the route. Unless a test names it, send the price the dialog would
 * show: 0 for the first revision, else the original quote.
 */
const rev = async (
  docId: string,
  body: Record<string, unknown> = { note: NOTE },
  answers?: Array<string | Error>,
) => {
  let sent = body;
  if (typeof body.note === 'string' && !('expected_ink' in body)) {
    const row = await docRow(docId);
    const count = row?.revisions?.count ?? 0;
    sent = { ...body, expected_ink: count === 0 ? 0 : QUOTE_INK };
  }
  return revise(mockMessagesStream, USER_ID, docId, sent, answers);
};
const draft = (extra: Record<string, unknown> = {}) =>
  makeDraft(mockMessagesStream, USER_ID, extra);

/** After a refusal: no model call, no hold, no new attempt, Ink and document as they were. */
async function expectNothingHappened(docId: string, before: Record<string, any>) {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(mockMessagesStream).not.toHaveBeenCalled();
  const u = await rawUser(USER_ID);
  expect(u.inkHolds ?? []).toEqual([]);
  expect(u.inkTopup).toBe(START - QUOTE_UNITS);
  expect(await Generation.countDocuments({ userId: USER_ID })).toBe(1);
  expect((await inkLedger(USER_ID)).filter((r) => r.reason === 'regenerate')).toHaveLength(0);
  const after = await docRow(docId);
  expect(after!.version).toBe(before.version);
  expect(after!.generatedContent).toBe(before.generatedContent);
  expect(after!.revisions).toEqual(before.revisions);
  expect(after!.previousVersions).toBeUndefined();
}

describe('refusals come before any hold', () => {
  let docId: string;
  let before: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  beforeEach(async () => {
    ({ docId } = await draft());
    before = (await docRow(docId))!;
  });

  const notRevisable = async () => {
    const res = await rev(docId);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_revisable' });
    await expectNothingHappened(docId, before);
  };

  it('409 not_revisable: the document has no stored brief', async () => {
    await setDoc(docId, {}, { brief: 1 });
    await notRevisable();
  });

  it('409 not_revisable: the document has no run id', async () => {
    await setDoc(docId, {}, { runId: 1 });
    await notRevisable();
  });

  it('409 not_revisable: a guided draft', async () => {
    await setDoc(docId, { rulePackId: 'guided' });
    await notRevisable();
  });

  it('409 not_revisable: a form draft (no rule pack)', async () => {
    await setDoc(docId, {}, { rulePackId: 1 });
    await notRevisable();
  });

  it('409 not_revisable: the brief is not readable (not JSON, wrong shape, another kind)', async () => {
    for (const bad of [
      'not json {',
      JSON.stringify({ unexpected: true }),
      JSON.stringify({ kind: 'noc', values: [], language: 'en' }),
    ]) {
      await setDoc(docId, { brief: encrypt(bad) });
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      await notRevisable();
    }
  });

  it('409 not_revisable: the delivered text is empty', async () => {
    await setDoc(docId, { generatedContent: encrypt('  \n '), finalContent: null });
    before = (await docRow(docId))!;
    await notRevisable();
  });

  it('409 not_revisable: the run has no completed initial attempt', async () => {
    await Generation.updateMany({}, { $set: { status: 'failed' } });
    const res = await rev(docId);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_revisable' });
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect((await rawUser(USER_ID)).inkHolds ?? []).toEqual([]);
    expect(await Generation.countDocuments({})).toBe(1);
  });

  it('429 revision_limit at count 10, with the limit in the body', async () => {
    await setDoc(docId, { revisions: { count: 10, freeUsed: true } });
    before = (await docRow(docId))!;
    const res = await rev(docId);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'revision_limit', limit: 10 });
    await expectNothingHappened(docId, before);
  });

  it('count 9 is still revisable (the 10th revision is the last)', async () => {
    await setDoc(docId, { revisions: { count: 9, freeUsed: true } });
    const res = await rev(docId);
    expect(res.status).toBe(200);
    expect(sseEvent(res.text, 'done')).toMatchObject({ revisions: { count: 10, freeUsed: true } });
  });

  it('409 run_in_progress while an Ink hold is open on the run; that hold is left alone', async () => {
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(USER_ID) }, {
      $push: {
        inkHolds: {
          runId: before.runId,
          runSequence: 2,
          units: QUOTE_UNITS,
          split: { sub: 0, carry: 0, topup: QUOTE_UNITS },
          unit: 'ink2',
          expiresAt: new Date(Date.now() + 600_000),
        },
      },
    } as never);
    const res = await rev(docId);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'run_in_progress' });
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect((await rawUser(USER_ID)).inkHolds).toHaveLength(1);
    expect(await Generation.countDocuments({})).toBe(1);
  });

  it('409 price_changed when expected_ink is not the price (first revision: 0)', async () => {
    const res = await rev(docId, { note: NOTE, expected_ink: QUOTE_INK });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'price_changed', ink: 0 });
    await expectNothingHappened(docId, before);
  });

  it('409 price_changed when expected_ink is not the price (a paid revision: the quote)', async () => {
    await setDoc(docId, { revisions: { count: 1, freeUsed: true } });
    before = (await docRow(docId))!;
    const res = await rev(docId, { note: NOTE, expected_ink: 0 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'price_changed', ink: QUOTE_INK });
    await expectNothingHappened(docId, before);
  });

  it('expected_ink equal to the price goes ahead', async () => {
    const res = await rev(docId, { note: NOTE, expected_ink: 0 });
    expect(res.status).toBe(200);
    expect(sseEvent(res.text, 'done')).not.toBeNull();
  });

  it('400 for a note under 10 or over 2000 characters, and for a half-Ink-off expected_ink; nothing is held', async () => {
    for (const body of [
      { note: 'too short' },
      { note: 'x'.repeat(2001) },
      { note: NOTE, expected_ink: 0.3 },
      {},
    ]) {
      const res = await rev(docId, body);
      expect(res.status).toBe(400);
    }
    await expectNothingHappened(docId, before);
  });

  it('400 when expected_ink is missing (it is required); nothing is held', async () => {
    mockMessagesStream.mockReset();
    const res = await request(app)
      .post(`/${docId}/revise`)
      .set(headersFor(USER_ID))
      .send({ note: NOTE });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.issues)).toContain('expected_ink');
    await expectNothingHappened(docId, before);
  });

  it('a note of exactly 10 and exactly 2000 characters is accepted', async () => {
    expect((await rev(docId, { note: 'x'.repeat(10) })).status).toBe(200);
    expect(
      (await rev(docId, { note: 'y'.repeat(2000) }, [drafterAnswer(revisedBody(2))])).status,
    ).toBe(200);
  });

  it("404 for another user's document and for a deleted one; nothing is held", async () => {
    await seedOther();
    mockMessagesStream.mockReset();
    const other = await request(app)
      .post(`/${docId}/revise`)
      .set(headersFor(OTHER_ID))
      .send({ note: NOTE, expected_ink: 0 });
    expect(other.status).toBe(404);
    await setDoc(docId, { isDeleted: true });
    const gone = await rev(docId);
    expect(gone.status).toBe(404);
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect((await rawUser(USER_ID)).inkHolds ?? []).toEqual([]);
    expect((await rawUser(OTHER_ID)).inkTopup).toBe(500);
  });

  it('401 without a user', async () => {
    mockMessagesStream.mockReset();
    const res = await request(app).post(`/${docId}/revise`).send({ note: NOTE });
    expect([401, 403]).toContain(res.status);
    expect(mockMessagesStream).not.toHaveBeenCalled();
  });
});

async function seedOther() {
  const { createVerifiedUser } = await import('./verifiedUser');
  await createVerifiedUser({
    _id: OTHER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 500,
  });
}

describe('the free revision (count 0)', () => {
  it('holds 0, takes no Ink, records a revision attempt on the same run, and stores the old text sealed', async () => {
    const { docId, runId } = await draft();
    const first = (await docRow(docId))!;
    const oldText = decrypt(first.generatedContent);
    expect(first.version).toBe(1);
    expect(first.revisions).toBeUndefined();
    const ledgerBefore = await inkLedger(USER_ID);
    expect(ledgerBefore).toHaveLength(1);

    // What the user's buckets hold while the model is running.
    let duringHolds: Array<{ units: number; reason?: string }> = [];
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementationOnce(async () => {
      duringHolds = (await rawUser(USER_ID)).inkHolds ?? [];
      return sdkAnswer(drafterAnswer(revisedBody()), 4000, 800);
    });
    const res = await request(app)
      .post(`/${docId}/revise`)
      .set(headersFor(USER_ID))
      .send({ note: NOTE, expected_ink: 0 });

    expect(res.status).toBe(200);
    expect(res.headers['x-run-id']).toBe(runId);
    expect(res.headers['x-run-sequence']).toBe('2');
    const done = sseEvent(res.text, 'done');
    expect(done).toMatchObject({
      complete: true,
      docId,
      runId,
      revisions: { count: 1, freeUsed: true },
    });
    expect(JSON.stringify(sseEvent(res.text, 'template_sections'))).toContain('revision 1');

    // hold 0, no debit, no new ledger row
    expect(duringHolds.every((h) => h.units === 0)).toBe(true);
    const u = await rawUser(USER_ID);
    expect(u.inkHolds ?? []).toEqual([]);
    expect(u.inkTopup).toBe(START - QUOTE_UNITS);
    expect(await inkLedger(USER_ID)).toHaveLength(1);
    expect((await inkLedger(USER_ID)).some((r) => r.reason === 'regenerate')).toBe(false);

    // the attempt
    const rows = await Generation.find({ runId }).sort({ runSequence: 1 }).lean();
    expect(rows.map((r) => [r.runSequence, r.runType, r.status])).toEqual([
      [1, 'initial', 'completed'],
      [2, 'revision', 'completed'],
    ]);
    expect(rows[1].inkQuoted).toBe(0);
    expect(rows[1].documentId!.toString()).toBe(docId);

    // the document
    const after = (await docRow(docId))!;
    expect(after.version).toBe(2);
    expect(after.revisions).toEqual({ count: 1, freeUsed: true });
    expect(after.runSequence).toBe(2);
    expect(after.finalContent).toBeNull();
    expect(decrypt(after.generatedContent)).not.toBe(oldText);
    expect(decrypt(after.generatedContent)).toContain('revision 1');
    expect(after.previousVersions).toHaveLength(1);
    expect(after.previousVersions[0].version).toBe(1);
    expect(after.previousVersions[0].content).toBe(first.generatedContent); // sealed as stored
    expect(after.previousVersions[0].content).not.toContain('Ram Kumar'); // not plain text
    expect(decrypt(after.previousVersions[0].content)).toBe(oldText);
    expect(after.previousVersions[0].createdAt).toBeInstanceOf(Date);
  });

  it("the user's edit (finalContent) is what is kept as the previous version, and is cleared", async () => {
    const { docId } = await draft();
    const edited = '<p>My own edit of the draft</p>';
    await setDoc(docId, { finalContent: encrypt(edited) });
    const res = await rev(docId);
    expect(res.status).toBe(200);
    const after = (await docRow(docId))!;
    expect(decrypt(after.previousVersions[0].content)).toBe(edited);
    expect(after.finalContent).toBeNull();
  });

  it('an old row without revisions or previousVersions reads as count 0 (the first revision is free)', async () => {
    const { docId } = await draft();
    await setDoc(docId, {}, { revisions: 1, previousVersions: 1, version: 1 });
    const res = await rev(docId);
    expect(res.status).toBe(200);
    expect((await docRow(docId))!.version).toBe(2);
    expect((await docRow(docId))!.revisions).toEqual({ count: 1, freeUsed: true });
  });

  it('every llm_call of the revision says revision:free with the run id; a plain draft has no revision key', async () => {
    const seen: LlmCallRecord[] = [];
    setLlmCallListener((r) => seen.push(r));
    const { docId, runId } = await draft();
    const drafted = seen.splice(0);
    expect(drafted.length).toBeGreaterThan(0);
    for (const r of drafted) expect(r).not.toHaveProperty('revision');

    const res = await rev(docId);
    expect(res.status).toBe(200);
    expect(seen.length).toBeGreaterThan(0);
    for (const r of seen) {
      expect(r.revision).toBe('free');
      expect(r.run_id).toBe(runId);
      expect(r.run_sequence).toBe(2);
    }
  });
});

describe('a paid revision (count >= 1)', () => {
  it('holds the original quote, settles it as a "regenerate" ledger row, debits exactly the quote, tags llm_call paid', async () => {
    const { docId, runId } = await draft();
    await rev(docId); // the free one
    const topupBefore = (await rawUser(USER_ID)).inkTopup;
    const ledgerBefore = await inkLedger(USER_ID);

    let duringHolds: Array<{ units: number; reason?: string; runSequence: number }> = [];
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementationOnce(async () => {
      duringHolds = (await rawUser(USER_ID)).inkHolds ?? [];
      return sdkAnswer(drafterAnswer(revisedBody(2)), 4000, 800);
    });
    const res = await request(app)
      .post(`/${docId}/revise`)
      .set(headersFor(USER_ID))
      .send({ note: NOTE, expected_ink: QUOTE_INK });

    expect(res.status).toBe(200);
    expect(res.headers['x-run-sequence']).toBe('3');
    expect(duringHolds).toHaveLength(1);
    expect(duringHolds[0]).toMatchObject({
      units: QUOTE_UNITS,
      runSequence: 3,
      reason: 'regenerate',
    });

    const done = sseEvent(res.text, 'done')!;
    expect(done.revisions).toEqual({ count: 2, freeUsed: true });
    expect(done.inkDebited).toBe(QUOTE_INK);

    const u = await rawUser(USER_ID);
    expect(u.inkHolds ?? []).toEqual([]);
    expect(u.inkTopup).toBe(topupBefore - QUOTE_UNITS);
    const rows = await inkLedger(USER_ID);
    expect(rows).toHaveLength(ledgerBefore.length + 1);
    const added = rows[rows.length - 1];
    expect(added).toMatchObject({
      reason: 'regenerate',
      delta: -QUOTE_UNITS,
      runId,
      runSequence: 3,
    });
    expect(rows.filter((r) => r.reason === 'generate')).toHaveLength(1); // the draft's own row

    const gen = (await Generation.findOne({ runId, runSequence: 3 }).lean())!;
    expect(gen).toMatchObject({ runType: 'revision', status: 'completed', inkQuoted: QUOTE_INK });

    const after = (await docRow(docId))!;
    expect(after.version).toBe(3);
    expect(after.previousVersions).toHaveLength(2);
  });

  it('every llm_call of a paid revision says revision:paid with the run id and sequence', async () => {
    const { docId, runId } = await draft();
    await rev(docId); // the free one
    const seen: LlmCallRecord[] = [];
    setLlmCallListener((r) => seen.push(r));
    const res = await rev(docId, { note: NOTE }, [drafterAnswer(revisedBody(2))]);
    expect(res.status).toBe(200);
    expect(seen.length).toBeGreaterThan(0);
    for (const r of seen)
      expect(r).toMatchObject({ revision: 'paid', run_id: runId, run_sequence: 3 });
  });

  it("the paid price is the original draft's quote even when the pack price has moved since", async () => {
    const { docId, runId } = await draft();
    await rev(docId);
    // The original attempt kept 6 units (3 Ink) in the ledger; the listed price is not 3.
    await mongoose.connection
      .db!.collection('inkledger')
      .updateMany({ runId, reason: 'generate' }, { $set: { delta: -6 } });
    const res = await rev(docId, { note: NOTE, expected_ink: 3 }, [drafterAnswer(revisedBody(2))]);
    expect(res.status).toBe(200);
    const rows = await inkLedger(USER_ID);
    expect(rows[rows.length - 1]).toMatchObject({ reason: 'regenerate', delta: -6 });
  });

  it('quote resolution: inkQuoted on the original attempt wins over the ledger rows', async () => {
    const { docId, runId } = await draft();
    await rev(docId);
    await Generation.updateOne({ runId, runSequence: 1 }, { $set: { inkQuoted: 5 } });
    const res = await rev(docId, { note: NOTE, expected_ink: 5 }, [drafterAnswer(revisedBody(2))]);
    expect(res.status).toBe(200);
    const rows = await inkLedger(USER_ID);
    expect(rows[rows.length - 1]).toMatchObject({ reason: 'regenerate', delta: -10 });
    expect((await rawUser(USER_ID)).inkTopup).toBe(START - QUOTE_UNITS - 10);
  });

  it('quote resolution: without inkQuoted, the ledger generate rows of that attempt (summed over buckets)', async () => {
    const { docId, runId } = await draft();
    await rev(docId);
    await Generation.updateOne({ runId, runSequence: 1 }, { $unset: { inkQuoted: 1 } });
    const col = mongoose.connection.db!.collection('inkledger');
    const g = (await col.findOne({ runId, reason: 'generate' }))!;
    await col.deleteOne({ _id: g._id });
    const { _id, ...rest } = g;
    void _id;
    await col.insertMany([
      { ...rest, delta: -2, sourceBucket: 'sub' },
      { ...rest, delta: -5, sourceBucket: 'topup' },
    ]);
    const res = await rev(docId, { note: NOTE, expected_ink: 3.5 }, [
      drafterAnswer(revisedBody(2)),
    ]);
    expect(res.status).toBe(200);
    const rows = await inkLedger(USER_ID);
    expect(rows[rows.length - 1]).toMatchObject({ reason: 'regenerate', delta: -7 });
  });

  it("quote resolution: with neither, the pack's listed price today (costForTemplate)", async () => {
    const { docId, runId } = await draft();
    await rev(docId);
    await Generation.updateOne({ runId, runSequence: 1 }, { $unset: { inkQuoted: 1 } });
    await mongoose.connection.db!.collection('inkledger').deleteMany({ runId, reason: 'generate' });
    const { costForTemplate } = await import('../services/credits.service');
    const listed = costForTemplate('bail_regular')!;
    expect(listed).toBeGreaterThan(0);
    const res = await rev(docId, { note: NOTE, expected_ink: listed }, [
      drafterAnswer(revisedBody(2)),
    ]);
    expect(res.status).toBe(200);
    const rows = await inkLedger(USER_ID);
    expect(rows[rows.length - 1]).toMatchObject({ reason: 'regenerate', delta: -listed * 2 });
  });

  it('a user who cannot cover the quote gets 402, no model call, no attempt, count unchanged', async () => {
    const { docId, runId } = await draft();
    await rev(docId);
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(USER_ID) },
      { $set: { inkTopup: QUOTE_UNITS - 1 } },
    );
    const attempts = await Generation.countDocuments({ runId });
    const res = await rev(docId, { note: NOTE }, [drafterAnswer(revisedBody(2))]);
    expect(res.status).toBe(402);
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(await Generation.countDocuments({ runId })).toBe(attempts);
    expect((await docRow(docId))!.revisions).toEqual({ count: 1, freeUsed: true });
    expect((await rawUser(USER_ID)).inkTopup).toBe(QUOTE_UNITS - 1);
  });
});

describe('a revision that does not stand charges nothing and counts for nothing', () => {
  /** count 0 (free) and count 1 (paid): both must leave Ink, count and text alone. */
  const cases: Array<[string, number]> = [
    ['free (count 0)', 0],
    ['paid (count 1)', 1],
  ];

  async function setup(count: number) {
    const { docId, runId } = await draft();
    if (count > 0) await setDoc(docId, { revisions: { count, freeUsed: true } });
    const doc = (await docRow(docId))!;
    return { docId, runId, doc, topup: (await rawUser(USER_ID)).inkTopup };
  }

  async function expectUnchanged(docId: string, doc: Record<string, any>, topup: number) {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    const u = await rawUser(USER_ID);
    expect(u.inkHolds ?? []).toEqual([]);
    expect(u.inkTopup).toBe(topup);
    expect((await inkLedger(USER_ID)).filter((r) => r.reason === 'regenerate')).toHaveLength(0);
    const after = (await docRow(docId))!;
    expect(after.version).toBe(doc.version);
    expect(after.revisions).toEqual(doc.revisions);
    expect(after.generatedContent).toBe(doc.generatedContent);
    expect(after.finalContent ?? null).toBe(doc.finalContent ?? null);
    expect(after.runSequence).toBe(doc.runSequence);
    expect(after.previousVersions).toBeUndefined();
  }

  describe.each(cases)('%s', (_name, count) => {
    it('the model fails mid-stream: hold released, balance, count, freeUsed and text unchanged, a failed attempt kept', async () => {
      const { docId, runId, doc, topup } = await setup(count);
      const res = await rev(docId, { note: NOTE }, [new Error('503 service unavailable')]);
      expect(res.text).toContain('event: error');
      expect(res.text).not.toContain('event: done');
      await expectUnchanged(docId, doc, topup);
      const failed = await Generation.findOne({ runId, runSequence: 2 }).lean();
      expect(failed).toMatchObject({ status: 'failed', runType: 'revision' });
    });

    it('the gates withhold it (GenerationFailedError with a code): same', async () => {
      const { docId, runId, doc, topup } = await setup(count);
      mockMessagesStream.mockReset();
      jest
        .spyOn(aiService, 'streamGenerateFromBrief')
        .mockRejectedValueOnce(
          new GenerationFailedError(
            'withheld',
            'fact_needed',
            { inputTokens: 10, outputTokens: 5, llmCalls: 1, usageSource: 'provider', calls: [] },
            undefined,
            undefined,
            { code: 'fact_needed', rule: 'held_blank', keyA: 'police_station' },
          ),
        );
      const res = await request(app)
        .post(`/${docId}/revise`)
        .set(headersFor(USER_ID))
        .send({ note: NOTE, expected_ink: count === 0 ? 0 : QUOTE_INK });
      expect(res.text).not.toContain('event: done');
      await expectUnchanged(docId, doc, topup);
      expect(await Generation.findOne({ runId, runSequence: 2 }).lean()).toMatchObject({
        status: 'failed',
        failure: { code: 'fact_needed' },
      });
    });

    it('a plain error thrown by the pipeline: same, answered without a done', async () => {
      const { docId, doc, topup } = await setup(count);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest.spyOn(aiService, 'streamGenerateFromBrief').mockRejectedValueOnce(new Error('bug'));
      const res = await request(app)
        .post(`/${docId}/revise`)
        .set(headersFor(USER_ID))
        .send({ note: NOTE, expected_ink: count === 0 ? 0 : QUOTE_INK });
      expect([200, 500]).toContain(res.status);
      expect(res.text).not.toContain('event: done');
      await expectUnchanged(docId, doc, topup);
    });

    it('a duplicate attempt (the unique index says it was already recorded): hold released, document put back, no done', async () => {
      const { docId, runId, doc, topup } = await setup(count);
      const dup = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      jest.spyOn(Generation, 'create').mockRejectedValueOnce(dup as never);
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const res = await rev(docId, { note: NOTE });
      expect(res.text).not.toContain('event: done');
      await expectUnchanged(docId, doc, topup);
      expect(await Generation.countDocuments({ runId, runType: 'revision' })).toBe(0);
    });

    it('the Ink cannot be settled (hold lost, balance spent meanwhile): withheld, document put back, attempt marked failed', async () => {
      const { docId, runId, doc } = await setup(count);
      if (count === 0) {
        // A free revision holds 0 and always settles; the lost-hold path needs a priced one.
        return;
      }
      mockMessagesStream.mockReset();
      mockMessagesStream.mockImplementationOnce(async () => {
        await releaseInk(USER_ID, runId, 2);
        await User.collection.updateOne(
          { _id: new mongoose.Types.ObjectId(USER_ID) },
          { $set: { inkTopup: 0 } },
        );
        return sdkAnswer(drafterAnswer(revisedBody()), 4000, 800);
      });
      const res = await request(app)
        .post(`/${docId}/revise`)
        .set(headersFor(USER_ID))
        .send({ note: NOTE, expected_ink: count === 0 ? 0 : QUOTE_INK });
      expect(res.text).not.toContain('event: done');
      await expectUnchanged(docId, doc, 0);
      expect(await Generation.findOne({ runId, runSequence: 2 }).lean()).toMatchObject({
        status: 'failed',
      });
    });
  });

  it('a failed revision does not use up the free one: the next try is still free', async () => {
    const { docId } = await draft();
    await rev(docId, { note: NOTE }, [new Error('503 service unavailable')]);
    const res = await rev(docId, { note: NOTE, expected_ink: 0 }, [drafterAnswer(revisedBody())]);
    expect(res.status).toBe(200);
    expect(sseEvent(res.text, 'done')).toMatchObject({ revisions: { count: 1, freeUsed: true } });
    expect(res.headers['x-run-sequence']).toBe('3'); // the failed attempt took 2
    expect((await rawUser(USER_ID)).inkTopup).toBe(START - QUOTE_UNITS);
  });

  it('the document is deleted while the model runs: not saved, hold released, nothing charged', async () => {
    const { docId } = await draft();
    await setDoc(docId, { revisions: { count: 1, freeUsed: true } });
    const topup = (await rawUser(USER_ID)).inkTopup;
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementationOnce(async () => {
      await setDoc(docId, { isDeleted: true });
      return sdkAnswer(drafterAnswer(revisedBody()), 4000, 800);
    });
    const res = await request(app)
      .post(`/${docId}/revise`)
      .set(headersFor(USER_ID))
      .send({ note: NOTE, expected_ink: QUOTE_INK });
    expect(res.text).not.toContain('event: done');
    const u = await rawUser(USER_ID);
    expect(u.inkTopup).toBe(topup);
    expect(u.inkHolds ?? []).toEqual([]);
    expect((await inkLedger(USER_ID)).filter((r) => r.reason === 'regenerate')).toHaveLength(0);
  });
});

describe('guards on the save and on the sequence', () => {
  it('stale version: the document is changed after the request started and before its save; not saved, hold released, no count change, no done', async () => {
    const { docId } = await draft();
    await setDoc(docId, { revisions: { count: 1, freeUsed: true } });
    const before = (await docRow(docId))!;
    const topup = (await rawUser(USER_ID)).inkTopup;
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementationOnce(async () => {
      // a save of the editor (PATCH) bumps the version while the model runs
      await LawieDocument.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(docId) },
        { $set: { version: 2, finalContent: encrypt('<p>edited meanwhile</p>') } },
      );
      return sdkAnswer(drafterAnswer(revisedBody()), 4000, 800);
    });
    const res = await request(app)
      .post(`/${docId}/revise`)
      .set(headersFor(USER_ID))
      .send({ note: NOTE, expected_ink: QUOTE_INK });
    expect(res.text).not.toContain('event: done');
    expect(res.text).toContain('event: error');
    const u = await rawUser(USER_ID);
    expect(u.inkHolds ?? []).toEqual([]);
    expect(u.inkTopup).toBe(topup);
    expect((await inkLedger(USER_ID)).filter((r) => r.reason === 'regenerate')).toHaveLength(0);
    const after = (await docRow(docId))!;
    expect(after.revisions).toEqual(before.revisions);
    expect(after.version).toBe(2); // the editor's save, not ours
    expect(decrypt(after.finalContent)).toBe('<p>edited meanwhile</p>');
    expect(after.generatedContent).toBe(before.generatedContent);
    expect(after.previousVersions).toBeUndefined();
    expect(await Generation.findOne({ documentId: docId, runSequence: 2 }).lean()).toMatchObject({
      status: 'failed',
    });
  });

  it('stale revision count: another revise finished first; this one is not saved and not charged', async () => {
    const { docId } = await draft();
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementationOnce(async () => {
      await setDoc(docId, { revisions: { count: 1, freeUsed: true } });
      return sdkAnswer(drafterAnswer(revisedBody()), 4000, 800);
    });
    const res = await request(app)
      .post(`/${docId}/revise`)
      .set(headersFor(USER_ID))
      .send({ note: NOTE, expected_ink: 0 });
    expect(res.text).not.toContain('event: done');
    expect((await docRow(docId))!.revisions).toEqual({ count: 1, freeUsed: true });
    expect((await docRow(docId))!.version).toBe(1);
    expect((await rawUser(USER_ID)).inkTopup).toBe(START - QUOTE_UNITS);
  });

  it('sequence floor: doc.runSequence 3 with attempt rows only up to 2 gives the revision sequence 4', async () => {
    const { docId, runId } = await draft();
    await Generation.collection.insertOne({
      userId: new mongoose.Types.ObjectId(USER_ID),
      docType: 'bail_application',
      templateId: 'bail_regular',
      status: 'completed',
      runId,
      runSequence: 2,
      runType: 'revision',
      inkQuoted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(docId, { runSequence: 3 });
    const res = await rev(docId);
    expect(res.status).toBe(200);
    expect(res.headers['x-run-sequence']).toBe('4');
    expect((await docRow(docId))!.runSequence).toBe(4);
  });
});

describe('previousVersions is capped at 5', () => {
  it('after a free revision and five paid ones, the five newest earlier texts remain, oldest dropped', async () => {
    const { docId } = await draft();
    const texts: Record<number, string> = { 1: decrypt((await docRow(docId))!.generatedContent) };
    for (let n = 1; n <= 6; n++) {
      const res = await rev(docId, { note: NOTE }, [drafterAnswer(revisedBody(n))]);
      expect(res.status).toBe(200);
      const row = (await docRow(docId))!;
      texts[row.version] = decrypt(row.generatedContent);
      expect(row.revisions).toEqual({ count: n, freeUsed: true });
    }
    const row = (await docRow(docId))!;
    expect(row.version).toBe(7);
    expect(row.previousVersions).toHaveLength(5);
    expect(row.previousVersions.map((v: { version: number }) => v.version)).toEqual([
      2, 3, 4, 5, 6,
    ]);
    for (const v of row.previousVersions as Array<{ version: number; content: string }>) {
      expect(decrypt(v.content)).toBe(texts[v.version]);
    }
    // one free + five paid: the ledger shows five regenerate rows of the quote each
    const regen = (await inkLedger(USER_ID)).filter((r) => r.reason === 'regenerate');
    expect(regen).toHaveLength(5);
    expect(regen.every((r) => r.delta === -QUOTE_UNITS)).toBe(true);
    expect((await rawUser(USER_ID)).inkTopup).toBe(START - QUOTE_UNITS * 6);
    // run sequences 2..7 on one run
    const seqs = (await Generation.find({ documentId: docId }).sort({ runSequence: 1 }).lean()).map(
      (g) => g.runSequence,
    );
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('what the drafter is sent', () => {
  const sentOf = (n: number) => mockMessagesStream.mock.calls[n][0] as SdkStreamParams;

  it("the system prompt is the plain-draft prompt plus Ajay's block, byte for byte, and nothing else changes", async () => {
    const { docId } = await draft();
    const draftSystem = systemText(sentOf(0).system);
    const draftUser = sentOf(0).messages[0].content;

    const res = await rev(docId);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    const block = signedRevisionBlock();
    expect(REVISION_INSTRUCTION).toBe(block);
    const system = systemText(sentOf(0).system);
    expect(system).toBe(`${draftSystem}\n\n${block}`);
    expect(system.split(block)).toHaveLength(2); // exactly once
    expect(system.replace(`\n\n${block}`, '')).toBe(draftSystem);
    // the user message is the draft's, then the labelled additions
    const user = sentOf(0).messages[0].content;
    expect(user.startsWith(draftUser)).toBe(true);
    expect(user.slice(draftUser.length)).toMatch(/^\n\nDRAFT:\n[\s\S]+\n\nREVISION NOTE:\n/);
    expect(user.endsWith(`\n\nREVISION NOTE:\n${NOTE}`)).toBe(true);
    // the note is user text only: never in the system prompt
    expect(system).not.toContain(NOTE);
    expect(user).not.toContain('The user has asked for a revision of the draft below.');
  });

  it("a plain draft's system prompt does not contain the block or the labels", async () => {
    await draft();
    expect(systemText(sentOf(0).system)).not.toContain(signedRevisionBlock());
    expect(sentOf(0).messages[0].content).not.toContain('REVISION NOTE:');
    expect(sentOf(0).messages[0].content).not.toContain('\nDRAFT:\n');
  });

  it('previousDraft is the generated text (stored as HTML, sent as text) when the user has not edited', async () => {
    const { docId } = await draft();
    const generated = decrypt((await docRow(docId))!.generatedContent);
    expect(generated).toMatch(/^<p/); // a pack draft is stored as the editor's HTML
    await rev(docId);
    const user = sentOf(0).messages[0].content;
    const sent = user.split('\n\nDRAFT:\n')[1].split('\n\nREVISION NOTE:\n')[0];
    expect(sent).toBe(draftAsText(generated));
    expect(sent).not.toMatch(/<\/?(p|strong|br)\b/);
    expect(sent).toContain('IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA');
    expect(sent).toContain(
      '4. That the applicant has deep roots in society and will not flee from justice.',
    );
    expect(sent).toContain('Place: Patna\nDate: ');
  });

  it('previousDraft is finalContent, converted from HTML to text, when the user has edited', async () => {
    const { docId } = await draft();
    const html =
      '<h1>IN THE COURT</h1><p>First &amp; <b>bold</b> para</p><p>Second&nbsp;para<br>line two</p><ul><li>one</li></ul>';
    await setDoc(docId, { finalContent: encrypt(html) });
    const generated = decrypt((await docRow(docId))!.generatedContent);
    await rev(docId);
    const user = sentOf(0).messages[0].content;
    const after = user.split('\n\nDRAFT:\n')[1].split('\n\nREVISION NOTE:\n')[0];
    expect(after).toBe('IN THE COURT\n\nFirst & bold para\n\nSecond para\nline two\n\none');
    expect(user).not.toContain('<p>');
    expect(user).not.toContain(generated.slice(0, 40));
  });

  it('the note is trimmed and sent as written', async () => {
    const { docId } = await draft();
    await rev(docId, { note: `   ${NOTE}   ` });
    expect(sentOf(0).messages[0].content.endsWith(`REVISION NOTE:\n${NOTE}`)).toBe(true);
  });

  it('the revision runs on the same model as the draft', async () => {
    const { docId } = await draft();
    await rev(docId);
    expect(sentOf(0).model).toBe('claude-sonnet-4-5-20250929');
  });
});

describe('the document read model', () => {
  it('GET /:id gives revisions, revisionLimit, revisable and originalInk, and none of the sealed versions', async () => {
    const { docId } = await draft();
    const get = () => request(app).get(`/${docId}`).set(headersFor(USER_ID));
    const first = await get();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      revisionLimit: 10,
      revisable: true,
      originalInk: QUOTE_INK,
    });
    expect(first.body.revisions ?? { count: 0, freeUsed: false }).toEqual(
      expect.objectContaining({ count: 0 }),
    );
    await rev(docId);
    const second = await get();
    expect(second.body.revisions).toEqual({ count: 1, freeUsed: true });
    expect(JSON.stringify(second.body)).not.toContain('previousVersions');
    expect(JSON.stringify(second.body)).not.toContain(
      (await docRow(docId))!.previousVersions[0].content,
    );
  });

  it('revisable is false for a document the route would refuse', async () => {
    const { docId } = await draft();
    await setDoc(docId, {}, { brief: 1 });
    const res = await request(app).get(`/${docId}`).set(headersFor(USER_ID));
    expect(res.body.revisable).toBe(false);
  });
});

// A plain draft after the work above must be written exactly as before.
describe('a plain draft is written as before', () => {
  it('no revisions or previousVersions on a new document; the ledger row is a generate row', async () => {
    const { docId, runId } = await draft();
    const row = (await docRow(docId))!;
    expect(row).not.toHaveProperty('revisions');
    expect(row).not.toHaveProperty('previousVersions');
    expect(row.version).toBe(1);
    expect(await inkLedger(USER_ID)).toEqual([
      expect.objectContaining({ reason: 'generate', runId, runSequence: 1, delta: -QUOTE_UNITS }),
    ]);
    void BODY;
  });
});
