/**
 * T-705 — the revision price and the plumbing under it, without the HTTP layer:
 * the original draft's quote (originalDraftQuote), the revision state of a row,
 * resolveRun's revise branch, the hold reason 'regenerate' (holdInk / settleInk),
 * the open-hold check, the cost alert on recordGeneration (Vikram, 1800 paise),
 * the draft-text converter, and the REVISION_USES_DRAFTER_MODEL assertion.
 */
import './setupDb';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

import { AppSetting } from '../models/AppSetting.model';
import { REVISION_LIMIT, PREVIOUS_VERSIONS_KEEP, LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import {
  COST_ALERT_PAISE,
  originalDraftQuote,
  recordGeneration,
  resolveRun,
  revisionState,
  REVISION_USES_DRAFTER_MODEL,
} from '../routes/documents.routes';
import {
  costForTemplate,
  hasOpenHoldForRun,
  holdInk,
  releaseInk,
  settleInk,
} from '../services/credits.service';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { draftAsText } from '../utils/draft-text';
import { seedWorld } from './t705-fixtures';

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: jest.fn(),
}));
const captureMessage = Sentry.captureMessage as jest.Mock;

jest.setTimeout(60_000);

const USER_ID = '507f1f77bcf86cd7994392e1';
const OTHER_ID = '507f1f77bcf86cd7994392e2';
const OID = new mongoose.Types.ObjectId(USER_ID);
const T = 'bail_regular';

beforeEach(async () => {
  captureMessage.mockReset();
  await seedWorld(USER_ID, 1000);
});

afterEach(() => jest.restoreAllMocks());

async function attempt(
  runId: string,
  runSequence: number,
  fields: Record<string, unknown> = {},
  userId = USER_ID,
) {
  return Generation.create({
    userId,
    docType: 'bail_application',
    templateId: T,
    status: 'completed',
    tokensUsed: 100,
    runId,
    runSequence,
    runType: runSequence === 1 ? 'initial' : 'revision',
    ...fields,
  });
}
const ledger = () => mongoose.connection.db!.collection('inkledger');

describe('constants and the type assertion', () => {
  it('a draft may have 10 revisions and keeps 5 earlier versions', () => {
    expect(REVISION_LIMIT).toBe(10);
    expect(PREVIOUS_VERSIONS_KEEP).toBe(5);
    expect(COST_ALERT_PAISE).toBe(1800);
  });

  it('REVISION_USES_DRAFTER_MODEL is true (the revision input carries no model field)', () => {
    expect(REVISION_USES_DRAFTER_MODEL).toBe(true);
  });
});

describe('revisionState', () => {
  it.each([
    [undefined, { count: 0, freeUsed: false }],
    [null, { count: 0, freeUsed: false }],
    [{}, { count: 0, freeUsed: false }],
    [
      { count: 0, freeUsed: false },
      { count: 0, freeUsed: false },
    ],
    [
      { count: 3, freeUsed: true },
      { count: 3, freeUsed: true },
    ],
    [
      { count: -2, freeUsed: true },
      { count: 0, freeUsed: true },
    ],
    [
      { count: Number.NaN, freeUsed: false },
      { count: 0, freeUsed: false },
    ],
    [{ count: 2 }, { count: 2, freeUsed: false }],
  ])('%j reads as %j', (revisions, expected) => {
    expect(revisionState({ revisions: revisions as never })).toEqual(expected);
  });
});

describe('originalDraftQuote', () => {
  it("is the initial attempt's inkQuoted when it has one", async () => {
    await attempt('r1', 1, { inkQuoted: 3.5 });
    expect(await originalDraftQuote(USER_ID, 'r1', T)).toMatchObject({
      ink: 3.5,
      initial: { runSequence: 1 },
    });
  });

  it('an inkQuoted of 0 on the initial attempt is a quote of 0 (not "unknown")', async () => {
    await attempt('r1', 1, { inkQuoted: 0 });
    expect((await originalDraftQuote(USER_ID, 'r1', T)).ink).toBe(0);
  });

  it("a revision's own inkQuoted (0 for the free one) never stands in for the draft's", async () => {
    await attempt('r1', 1, { inkQuoted: 4 });
    await attempt('r1', 2, { inkQuoted: 0, runType: 'revision' });
    await attempt('r1', 3, { inkQuoted: 9, runType: 'revision' });
    expect((await originalDraftQuote(USER_ID, 'r1', T)).ink).toBe(4);
  });

  it("without inkQuoted, it is the Ink the ledger kept for that attempt's generate rows (all buckets)", async () => {
    await attempt('r1', 1);
    await ledger().insertMany([
      {
        userId: OID,
        runId: 'r1',
        runSequence: 1,
        reason: 'generate',
        delta: -3,
        sourceBucket: 'sub',
      },
      {
        userId: OID,
        runId: 'r1',
        runSequence: 1,
        reason: 'generate',
        delta: -2,
        sourceBucket: 'topup',
      },
      // other rows must not count
      {
        userId: OID,
        runId: 'r1',
        runSequence: 2,
        reason: 'regenerate',
        delta: -9,
        sourceBucket: 'topup',
      },
      {
        userId: OID,
        runId: 'r1',
        runSequence: 2,
        reason: 'generate',
        delta: -9,
        sourceBucket: 'topup',
      },
      {
        userId: OID,
        runId: 'r2',
        runSequence: 1,
        reason: 'generate',
        delta: -9,
        sourceBucket: 'topup',
      },
      {
        userId: OID,
        runId: 'r1',
        runSequence: 1,
        reason: 'refund',
        delta: 7,
        sourceBucket: 'topup',
      },
    ]);
    expect((await originalDraftQuote(USER_ID, 'r1', T)).ink).toBe(2.5);
  });

  it("with neither, it is the pack's listed price today", async () => {
    await attempt('r1', 1);
    const listed = costForTemplate(T)!;
    expect(listed).toBeGreaterThan(0);
    expect((await originalDraftQuote(USER_ID, 'r1', T)).ink).toBe(listed);
  });

  it('a failed first attempt is not the original: the completed initial one is', async () => {
    await attempt('r1', 1, { status: 'failed', inkQuoted: 99 });
    await attempt('r1', 2, { status: 'completed', runType: 'initial', inkQuoted: 6 });
    expect(await originalDraftQuote(USER_ID, 'r1', T)).toMatchObject({
      ink: 6,
      initial: { runSequence: 2 },
    });
  });

  it("no completed initial attempt (none, only failed, only revisions, or another user's run) is {ink: null, initial: null}", async () => {
    expect(await originalDraftQuote(USER_ID, 'none', T)).toEqual({ ink: null, initial: null });
    await attempt('rf', 1, { status: 'failed' });
    expect(await originalDraftQuote(USER_ID, 'rf', T)).toEqual({ ink: null, initial: null });
    await attempt('rr', 2, { runType: 'revision', inkQuoted: 3 });
    expect(await originalDraftQuote(USER_ID, 'rr', T)).toEqual({ ink: null, initial: null });
    await attempt('ro', 1, { inkQuoted: 3 }, OTHER_ID);
    expect(await originalDraftQuote(USER_ID, 'ro', T)).toEqual({ ink: null, initial: null });
  });
});

describe('resolveRun, revise branch', () => {
  it('continues a run with a completed attempt: same runId, highest sequence + 1, runType revision', async () => {
    await attempt('r1', 1);
    expect(await resolveRun(USER_ID, { templateId: T }, 'r1', 'revise')).toEqual({
      runId: 'r1',
      runSequence: 2,
      runType: 'revision',
    });
  });

  it('counts failed attempts in the sequence (the next number is never reused)', async () => {
    await attempt('r1', 1);
    await attempt('r1', 2, { status: 'failed' });
    await attempt('r1', 3, { runType: 'revision' });
    expect(await resolveRun(USER_ID, { templateId: T }, 'r1', 'revise')).toMatchObject({
      runSequence: 4,
    });
  });

  it("the floor (the document's own sequence) lifts the next number above the attempt rows", async () => {
    await attempt('r1', 1);
    await attempt('r1', 2);
    expect(await resolveRun(USER_ID, { templateId: T }, 'r1', 'revise', 3)).toMatchObject({
      runSequence: 4,
    });
    expect(await resolveRun(USER_ID, { templateId: T }, 'r1', 'revise', 1)).toMatchObject({
      runSequence: 3,
    });
    expect(await resolveRun(USER_ID, { templateId: T }, 'r1', 'revise', undefined)).toMatchObject({
      runSequence: 3,
    });
  });

  it("returns null with no run id, an unknown run, a run with only failed attempts, another user's run or another template", async () => {
    await attempt('rf', 1, { status: 'failed' });
    await attempt('ro', 1, {}, OTHER_ID);
    await attempt('rt', 1, { templateId: 'noc' });
    expect(await resolveRun(USER_ID, { templateId: T }, undefined as never, 'revise')).toBeNull();
    expect(await resolveRun(USER_ID, { templateId: T }, 'nope', 'revise')).toBeNull();
    expect(await resolveRun(USER_ID, { templateId: T }, 'rf', 'revise')).toBeNull();
    expect(await resolveRun(USER_ID, { templateId: T }, 'ro', 'revise')).toBeNull();
    expect(await resolveRun(USER_ID, { templateId: T }, 'rt', 'revise')).toBeNull();
  });

  it('the generate branch is unchanged: no run id starts a new initial run', async () => {
    const r = await resolveRun(USER_ID, { templateId: T }, undefined);
    expect(r).toMatchObject({ runSequence: 1, runType: 'initial' });
    expect(r.runId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('hold reason regenerate', () => {
  const units = (u: string) =>
    User.collection.findOne({ _id: new mongoose.Types.ObjectId(u) }) as Promise<{
      inkTopup: number;
      inkHolds: Array<{ reason?: string; units: number }>;
    } | null>;

  it('a hold with reason regenerate stores it; settle writes regenerate ledger rows for exactly the held units', async () => {
    const held = await holdInk({
      userId: USER_ID,
      costCredits: 3,
      runId: 'r1',
      runSequence: 2,
      reason: 'regenerate',
    });
    expect(held.ok).toBe(true);
    expect((await units(USER_ID))!.inkHolds[0]).toMatchObject({ reason: 'regenerate', units: 6 });
    expect(await settleInk(USER_ID, 'r1', 2, undefined, 'ref')).toMatchObject({ settled: true });
    const rows = await ledger().find({ userId: OID }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'regenerate', delta: -6, runId: 'r1', runSequence: 2 });
    expect((await units(USER_ID))!.inkTopup).toBe(994);
    expect((await units(USER_ID))!.inkHolds).toEqual([]);
  });

  it('a hold without a reason is written exactly as before and settles as generate', async () => {
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'r1', runSequence: 1 });
    const hold = (await units(USER_ID))!.inkHolds[0];
    expect(hold).not.toHaveProperty('reason');
    await settleInk(USER_ID, 'r1', 1);
    expect((await ledger().findOne({ userId: OID }))!.reason).toBe('generate');
  });

  it('a released regenerate hold gives everything back and writes no row', async () => {
    await holdInk({
      userId: USER_ID,
      costCredits: 3,
      runId: 'r1',
      runSequence: 2,
      reason: 'regenerate',
    });
    expect((await units(USER_ID))!.inkTopup).toBe(994);
    expect(await releaseInk(USER_ID, 'r1', 2)).toEqual({ released: true });
    expect((await units(USER_ID))!.inkTopup).toBe(1000);
    expect(await ledger().countDocuments({})).toBe(0);
  });

  it('a hold of 0 (the free revision) takes nothing', async () => {
    const held = await holdInk({ userId: USER_ID, costCredits: 0, runId: 'r1', runSequence: 2 });
    expect(held.ok).toBe(true);
    expect((await units(USER_ID))!.inkTopup).toBe(1000);
    await settleInk(USER_ID, 'r1', 2);
    expect((await units(USER_ID))!.inkTopup).toBe(1000);
    expect(await ledger().countDocuments({ delta: { $lt: 0 } })).toBe(0);
  });
});

describe('hasOpenHoldForRun', () => {
  it('is true for any attempt of the run, false for another run, after release, for a bad id and for a missing user', async () => {
    expect(await hasOpenHoldForRun(USER_ID, 'r1')).toBe(false);
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'r1', runSequence: 3 });
    expect(await hasOpenHoldForRun(USER_ID, 'r1')).toBe(true);
    expect(await hasOpenHoldForRun(USER_ID, 'r2')).toBe(false);
    expect(await hasOpenHoldForRun(OTHER_ID, 'r1')).toBe(false);
    expect(await hasOpenHoldForRun('not-an-id', 'r1')).toBe(false);
    await releaseInk(USER_ID, 'r1', 3);
    expect(await hasOpenHoldForRun(USER_ID, 'r1')).toBe(false);
  });
});

describe('the document model', () => {
  it('a new document has no revisions or previousVersions; both are accepted when set', async () => {
    const d = new LawieDocument({
      userId: USER_ID,
      title: 't',
      docType: 'bail_application',
      generatedContent: 'x',
    });
    await d.save();
    const raw = await LawieDocument.collection.findOne({ _id: d._id });
    expect(raw).not.toHaveProperty('revisions');
    expect(raw).not.toHaveProperty('previousVersions');
    d.revisions = { count: 2, freeUsed: true };
    d.previousVersions = [{ version: 1, content: 'sealed', createdAt: new Date() }];
    await d.save();
    const again = await LawieDocument.findById(d._id).lean();
    expect(again!.revisions).toEqual({ count: 2, freeUsed: true });
    expect(again!.previousVersions).toHaveLength(1);
  });
});

// ── Cost alert (Vikram, binding, until T-685) ───────────────────────────────

describe('cost alert on recordGeneration', () => {
  const base = (over: Record<string, unknown> = {}, input = 4000, output = 800) =>
    ({
      userId: USER_ID,
      docType: 'bail_application' as const,
      status: 'completed' as const,
      templateId: T,
      aiModel: 'claude-sonnet-4-5-20250929',
      transport: 'direct' as const,
      usage: {
        inputTokens: input,
        outputTokens: output,
        llmCalls: 1,
        usageSource: 'provider' as const,
      },
      paragraphCount: 4,
      durationMs: 10,
      runId: 'run-alert',
      runSequence: 2,
      runType: 'revision' as const,
      ...over,
    }) as Parameters<typeof recordGeneration>[0];

  async function atRate(rate: number) {
    await AppSetting.create({ key: 'finance.usd_inr', value: String(rate) });
    _clearAppSettingsCache();
  }

  it('an attempt over 1800 paise sends exactly one warning with the stated tags and ids and paise only', async () => {
    const docId = new mongoose.Types.ObjectId();
    // 40000 in + 20000 out = 0.12 + 0.30 = 0.42 USD; x 85 (default rate) x 100 = 3570 paise
    const r = await recordGeneration(base({ documentId: docId }, 40_000, 20_000));
    expect(r).toEqual({ duplicate: false });
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, ctx] = captureMessage.mock.calls[0];
    expect(typeof message).toBe('string');
    expect(ctx).toEqual({
      level: 'warning',
      fingerprint: ['draft-cost-alert', 'run-alert'],
      tags: { kind: 'revision', runId: 'run-alert' },
      extra: {
        runId: 'run-alert',
        runSequence: 2,
        documentId: String(docId),
        costPaise: Math.round(0.42 * 85 * 100),
      },
    });
    // no content of any kind
    const all = JSON.stringify(captureMessage.mock.calls);
    expect(all).not.toContain(USER_ID);
    expect(all).not.toMatch(/Ram Kumar|note|draft text/i);
  });

  it('an initial draft over the line is tagged kind draft', async () => {
    await recordGeneration(base({ runType: 'initial', runSequence: 1 }, 40_000, 20_000));
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][1].tags).toEqual({ kind: 'draft', runId: 'run-alert' });
    expect(captureMessage.mock.calls[0][1].extra.documentId).toBeNull();
  });

  it('an attempt under the line sends nothing', async () => {
    await recordGeneration(base());
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('exactly 1800 paise sends nothing; 1815 sends one (the rate is finance.usd_inr)', async () => {
    await atRate(100);
    // 40000 in + 4000 out = 0.12 + 0.06 = 0.18 USD x 100 x 100 = 1800
    await recordGeneration(base({ runId: 'edge-1' }, 40_000, 4_000));
    expect(captureMessage).not.toHaveBeenCalled();
    // 0.12 + 0.0615 = 0.1815 -> 1815
    await recordGeneration(base({ runId: 'edge-2' }, 40_000, 4_100));
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][1].extra.costPaise).toBe(1815);
  });

  it('a duplicate insert (unique index) sends no second alert', async () => {
    await recordGeneration(base({}, 40_000, 20_000));
    expect(captureMessage).toHaveBeenCalledTimes(1);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const again = await recordGeneration(base({}, 40_000, 20_000));
    expect(again).toEqual({ duplicate: true });
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('a model with no rate costs 0 and sends nothing', async () => {
    await recordGeneration(base({ aiModel: 'unpriced-model' }, 40_000, 20_000));
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('Sentry throwing never fails the record', async () => {
    captureMessage.mockImplementationOnce(() => {
      throw new Error('sentry down');
    });
    await expect(recordGeneration(base({}, 40_000, 20_000))).resolves.toEqual({ duplicate: false });
    expect(await Generation.countDocuments({ runId: 'run-alert' })).toBe(1);
  });
});

// ── The text the drafter is shown as the earlier draft ──────────────────────

describe('draftAsText', () => {
  it('returns plain text as it is', () => {
    expect(draftAsText('1. That the applicant.\n\n2. That FIR.')).toBe(
      '1. That the applicant.\n\n2. That FIR.',
    );
    expect(draftAsText('a < b and c > d')).toBe('a < b and c > d');
  });

  it('turns block ends into breaks, removes tags and decodes entities', () => {
    expect(
      draftAsText(
        '<h1>TITLE</h1><p style="x">A &amp; B &lt;c&gt; &quot;q&quot; it&#39;s&nbsp;here</p><p>l1<br/>l2<br>l3</p><ul><li>x</li><li>y</li></ul>',
      ),
    ).toBe('TITLE\n\nA & B <c> "q" it\'s here\n\nl1\nl2\nl3\n\nx\n\ny');
  });

  it('decodes numeric entities and leaves an out-of-range one alone', () => {
    expect(draftAsText('<p>&#8377;500 &#128512; &#99999999;</p>')).toBe('₹500 😀 &#99999999;');
  });

  it('trims trailing spaces on lines and collapses runs of blank lines', () => {
    expect(draftAsText('<p>a   </p><p></p><p></p><p>b</p>')).toBe('a\n\nb');
  });

  it('leading whitespace before the first tag still counts as HTML', () => {
    expect(draftAsText('  \n<p>x</p>')).toBe('x');
  });
});
