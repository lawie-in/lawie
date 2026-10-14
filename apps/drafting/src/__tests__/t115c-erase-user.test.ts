/**
 * T-115c — drafting POST /internal/erase-user. Everything drafting holds for the user goes
 * (documents last); as a reviewer on other owners' documents the user is anonymised in place
 * (Ajay 8067679, Arjun): feedback reads "A reviewer", events lose the token, the review token is
 * given a random link, isActive false, assignedTo/assignedEmail unset, reviewerErased true.
 * The admin overview and token lists show "reviewer: erased".
 */

import './setupDb';

import mongoose, { Types } from 'mongoose';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { BonusCredit } from '../models/BonusCredit.model';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { FactDiff } from '../models/FactDiff.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { ReviewFeedback } from '../models/ReviewFeedback.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { SectionBookmark } from '../models/SectionBookmark.model';
import { SectionRecent } from '../models/SectionRecent.model';
import { TemplateUsage } from '../models/TemplateUsage.model';
import { UsageLog } from '../models/UsageLog.model';
import { REVIEWER_PLACEHOLDER, eraseAccount } from '../services/account-erase.service';
import { encrypt } from '../utils/encryption';

const SECRET = process.env.INTERNAL_SECRET!;
const USER = '507f1f77bcf86cd799439201';
const OTHER = '507f1f77bcf86cd799439202';
const FIXTURE = '0000000000000000000f147e';
const EMAIL = 'erase.me@example.com';
const NAME = 'Erase Me Advocate';
const TITLE = 'Zorblax v. Quimby SECRET-TITLE-1';
const u = new Types.ObjectId(USER);
const o = new Types.ObjectId(OTHER);
const col = (m: { collection: mongoose.Collection }) => m.collection;

const post = (body: unknown, secret: string | null = SECRET) => {
  const r = request(app).post('/internal/erase-user');
  if (secret !== null) r.set('x-internal-secret', secret);
  return r.send(body as object);
};

async function mkDoc(userId: string, isDeleted = false) {
  return LawieDocument.create({
    userId,
    title: TITLE,
    docType: 'bail_application',
    generatedContent: encrypt('content'),
    isDeleted,
  });
}

interface Seed {
  ownDocs: Types.ObjectId[];
  otherDoc: Types.ObjectId;
  reviewerToken: Types.ObjectId;
  bystanderToken: Types.ObjectId;
  ownToken: Types.ObjectId;
}

async function seed(): Promise<Seed> {
  const d1 = await mkDoc(USER);
  const d2 = await mkDoc(USER, true);
  const od = await mkDoc(OTHER);
  const ownDocs = [d1._id as Types.ObjectId, d2._id as Types.ObjectId];
  const otherDoc = od._id as Types.ObjectId;

  const now = new Date();
  await col(FactLedgerModel).insertMany([
    { intakeId: 'in-1', userId: u },
    { intakeId: 'in-o', userId: o },
  ]);
  await col(Generation).insertMany([
    { intakeId: 'in-1', userId: u, documentId: d1._id },
    { intakeId: 'in-o', userId: o },
  ]);
  await col(LlmAuxCall).insertMany([
    { intakeId: 'in-2', userId: u },
    { intakeId: 'in-o', userId: o },
  ]);
  await col(UsageLog).insertMany([{ userId: u }, { userId: o }]);
  await col(Event).insertMany([
    { userId: u, type: 'x', docId: d1._id },
    { userId: o, type: 'x' },
  ]);
  await col(TemplateUsage).insertMany([{ userId: u }, { userId: o }]);
  await col(SectionBookmark).insertMany([
    { userId: u, code: 'BNSS', section: '480' },
    { userId: o, code: 'BNSS', section: '480' },
  ]);
  await col(SectionRecent).insertMany([
    { userId: u, code: 'BNSS', section: '480' },
    { userId: o, code: 'BNSS', section: '480' },
  ]);
  await col(BonusCredit).insertMany([
    { userId: u, granted: 3 },
    { userId: o, granted: 3 },
  ]);
  await col(FactDiff).insertMany([
    { userId: u, documentId: d1._id },
    { userId: o, documentId: od._id },
  ]);

  // Tokens on the user's own document: deleted with it, whoever the reviewer is.
  const ownToken = new Types.ObjectId();
  await col(ReviewToken).insertOne({
    _id: ownToken,
    token: 'own-doc-token',
    documentId: d1._id,
    assignedTo: 'Someone Else',
    assignedEmail: 'someone@example.com',
    isActive: true,
    createdBy: o,
    expiresAt: new Date(Date.now() + 1e9),
  });
  await col(ReviewFeedback).insertOne({
    reviewTokenId: ownToken,
    documentId: d1._id,
    assignedTo: 'Someone Else',
  });

  // The user as a reviewer on the other owner's document.
  const reviewerToken = new Types.ObjectId();
  const bystanderToken = new Types.ObjectId();
  await col(ReviewToken).insertMany([
    {
      _id: reviewerToken,
      token: 'reviewer-link-1',
      documentId: od._id,
      assignedTo: NAME,
      assignedEmail: EMAIL,
      isActive: true,
      isUsed: true,
      createdBy: o,
      expiresAt: new Date(Date.now() + 1e9),
      updatedAt: now,
    },
    {
      _id: bystanderToken,
      token: 'bystander-link-1',
      documentId: od._id,
      assignedTo: 'Other Reviewer',
      assignedEmail: 'other.reviewer@example.com',
      isActive: true,
      isUsed: true,
      createdBy: o,
      expiresAt: new Date(Date.now() + 1e9),
    },
  ]);
  await col(ReviewFeedback).insertMany([
    {
      reviewTokenId: reviewerToken,
      documentId: od._id,
      assignedTo: NAME,
      comments: 'Prayer clause needs work',
      overallVerdict: 'minor_edits',
      causeTitleCorrect: true,
    },
    {
      reviewTokenId: bystanderToken,
      documentId: od._id,
      assignedTo: 'Other Reviewer',
      comments: 'fine',
      overallVerdict: 'ready_to_file',
    },
  ]);
  await col(Event).insertMany([
    {
      userId: o,
      type: 'panel_review_submitted',
      metadata: { token: 'reviewer-link-1', assignedTo: NAME, verdict: 'minor_edits' },
    },
    {
      userId: o,
      type: 'panel_review_submitted',
      metadata: { token: 'bystander-link-1', assignedTo: 'Other Reviewer' },
    },
  ]);

  await redis.mset(
    `intake:burst:${USER}`,
    '1',
    `intake:day:${USER}:2026-10-14`,
    '3',
    `intake:day:${USER}:2026-10-13`,
    '3',
    'intake:owner:in-1',
    USER,
    'intake:followups:in-1',
    '2',
    'intake:owner:in-2',
    USER,
    `intake:burst:${OTHER}`,
    '1',
    'intake:owner:in-o',
    OTHER,
    'intake:followups:in-o',
    '1',
  );
  return { ownDocs, otherDoc, reviewerToken, bystanderToken, ownToken };
}

beforeEach(async () => {
  await redis.flushall();
});
afterEach(() => jest.restoreAllMocks());

const everyCount = async (userId: Types.ObjectId) => ({
  documents: await col(LawieDocument).countDocuments({ userId }),
  ledgers: await col(FactLedgerModel).countDocuments({ userId }),
  generations: await col(Generation).countDocuments({ userId }),
  aux: await col(LlmAuxCall).countDocuments({ userId }),
  usage: await col(UsageLog).countDocuments({ userId }),
  events: await col(Event).countDocuments({ userId, type: 'x' }),
  tu: await col(TemplateUsage).countDocuments({ userId }),
  bookmarks: await col(SectionBookmark).countDocuments({ userId }),
  recents: await col(SectionRecent).countDocuments({ userId }),
  bonus: await col(BonusCredit).countDocuments({ userId }),
  diffs: await col(FactDiff).countDocuments({ userId }),
});
const ONE = {
  documents: 1,
  ledgers: 1,
  generations: 1,
  aux: 1,
  usage: 1,
  events: 1,
  tu: 1,
  bookmarks: 1,
  recents: 1,
  bonus: 1,
  diffs: 1,
};

describe('guards', () => {
  it.each([
    ['no secret', null],
    ['wrong secret', 'z'.repeat(SECRET.length)],
    ['empty secret', ''],
    ['prefix of the secret', SECRET.slice(0, -1)],
    ['secret with extra', `${SECRET}!`],
  ])('401 with %s; nothing erased', async (_n, secret) => {
    await seed();
    expect((await post({ userId: USER }, secret)).status).toBe(401);
    expect(await everyCount(u)).toEqual({ ...ONE, documents: 2 });
  });

  it('the secret is also required when INTERNAL_SECRET is unset (fails closed)', async () => {
    const saved = process.env.INTERNAL_SECRET;
    delete process.env.INTERNAL_SECRET;
    try {
      expect((await post({ userId: USER }, SECRET)).status).toBe(401);
    } finally {
      process.env.INTERNAL_SECRET = saved;
    }
  });

  it('grant-bonus keeps working with the right secret and still 401s a wrong one', async () => {
    const ok = await request(app)
      .post('/internal/grant-bonus')
      .set('x-internal-secret', SECRET)
      .send({ userId: OTHER, bonus: 2 });
    expect(ok.status).toBe(200);
    const bad = await request(app)
      .post('/internal/grant-bonus')
      .set('x-internal-secret', `${SECRET}x`)
      .send({ userId: OTHER, bonus: 2 });
    expect(bad.status).toBe(401);
  });

  it.each([
    ['no userId', {}],
    ['numeric userId', { userId: 4 }],
    ['malformed userId', { userId: 'abc' }],
    ['object userId', { userId: { $gt: '' } }],
    ['non-string email', { userId: USER, email: 5 }],
    ['an email over 320 chars', { userId: USER, email: 'a'.repeat(321) }],
  ])('400 for %s', async (_n, body) => {
    expect((await post(body)).status).toBe(400);
  });

  it.each(['true', 'false', 1, 0, null, 'yes'])(
    '400 when dryRun is %p (never read as false); nothing erased',
    async (dryRun) => {
      await seed();
      const res = await post({ userId: USER, dryRun });
      expect(res.status).toBe(400);
      expect(await everyCount(u)).toEqual({ ...ONE, documents: 2 });
    },
  );

  it.each([FIXTURE, FIXTURE.toUpperCase()])(
    '403 for the golden-set fixture user %s',
    async (id) => {
      await col(Event).insertOne({ userId: new Types.ObjectId(FIXTURE), type: 'x' });
      const res = await post({ userId: id });
      expect(res.status).toBe(403);
      expect(await col(Event).countDocuments({ userId: new Types.ObjectId(FIXTURE) })).toBe(1);
    },
  );
});

describe('erase', () => {
  it('deletes every user collection, the Redis intake keys, and the documents; counts add up', async () => {
    const s = await seed();
    const res = await post({ userId: USER, email: EMAIL });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      ok: true,
      dryRun: false,
      counts: {
        redisKeys: 6, // burst, 2 day keys, owner:in-1, followups:in-1, owner:in-2 (followups:in-2 absent)
        reviewerfeedbacks: 1,
        reviewerevents: 1,
        reviewertokens: 1,
        reviewfeedbacks: 1,
        reviewtokens: 1,
        factdiffs: 1,
        factledgers: 1,
        generations: 1,
        llmauxcalls: 1,
        usagelogs: 1,
        events: 1,
        templateusages: 1,
        sectionbookmarks: 1,
        sectionrecents: 1,
        bonuscredits: 1,
        documents: 2,
      },
    });
    expect(await everyCount(u)).toEqual({
      documents: 0,
      ledgers: 0,
      generations: 0,
      aux: 0,
      usage: 0,
      events: 0,
      tu: 0,
      bookmarks: 0,
      recents: 0,
      bonus: 0,
      diffs: 0,
    });
    // Tokens and feedback on the user's own documents are gone with them.
    expect(await col(ReviewToken).countDocuments({ _id: s.ownToken })).toBe(0);
    expect(await col(ReviewFeedback).countDocuments({ documentId: { $in: s.ownDocs } })).toBe(0);

    // Redis: the user's keys are gone, the other user's are not.
    expect(await redis.keys('*')).toEqual(
      expect.arrayContaining([
        `intake:burst:${OTHER}`,
        'intake:owner:in-o',
        'intake:followups:in-o',
      ]),
    );
    expect(
      (await redis.keys('*')).filter(
        (k) => k.includes(USER) || k.endsWith('in-1') || k.endsWith('in-2'),
      ),
    ).toEqual([]);

    // The other user is untouched.
    expect(await everyCount(o)).toEqual({ ...ONE, events: 1 });
    expect(await col(LawieDocument).countDocuments({ _id: s.otherDoc })).toBe(1);
  });

  it('the reviewer role: feedback reads "A reviewer", events scrubbed, token anonymised in place', async () => {
    const s = await seed();
    await post({ userId: USER, email: EMAIL });

    const fb = await col(ReviewFeedback).findOne({ reviewTokenId: s.reviewerToken });
    expect(fb!.assignedTo).toBe('A reviewer');
    expect(REVIEWER_PLACEHOLDER).toBe('A reviewer');
    // The feedback itself is kept, unchanged.
    expect(fb).toMatchObject({
      comments: 'Prayer clause needs work',
      overallVerdict: 'minor_edits',
      causeTitleCorrect: true,
      documentId: s.otherDoc,
    });

    const ev = await col(Event).findOne({
      type: 'panel_review_submitted',
      'metadata.assignedTo': 'A reviewer',
    });
    expect(ev!.metadata).toEqual({ assignedTo: 'A reviewer', verdict: 'minor_edits' });

    const tok = await col(ReviewToken).findOne({ _id: s.reviewerToken });
    expect(tok).not.toBeNull(); // the row and its _id stay
    expect(tok!.token).not.toBe('reviewer-link-1');
    expect(tok!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(tok!.isActive).toBe(false);
    expect(tok!.reviewerErased).toBe(true);
    expect(tok).not.toHaveProperty('assignedTo');
    expect(tok).not.toHaveProperty('assignedEmail');
    expect(tok!.documentId).toEqual(s.otherDoc);
    expect(tok!.isUsed).toBe(true);

    // The other reviewer on the same document is untouched.
    const by = await col(ReviewToken).findOne({ _id: s.bystanderToken });
    expect(by).toMatchObject({
      token: 'bystander-link-1',
      assignedTo: 'Other Reviewer',
      assignedEmail: 'other.reviewer@example.com',
      isActive: true,
    });
    expect(by).not.toHaveProperty('reviewerErased');
    expect(
      (await col(ReviewFeedback).findOne({ reviewTokenId: s.bystanderToken }))!.assignedTo,
    ).toBe('Other Reviewer');
    expect(await col(Event).countDocuments({ 'metadata.token': 'bystander-link-1' })).toBe(1);
  });

  it('two erased reviewers get different random links (token is unique)', async () => {
    const s = await seed();
    const extra = new Types.ObjectId();
    await col(ReviewToken).insertOne({
      _id: extra,
      token: 'reviewer-link-2',
      documentId: s.otherDoc,
      assignedTo: NAME,
      assignedEmail: EMAIL,
      isActive: true,
      createdBy: o,
      expiresAt: new Date(Date.now() + 1e9),
    });
    expect((await post({ userId: USER, email: EMAIL })).status).toBe(200);
    const toks = await col(ReviewToken).find({ reviewerErased: true }).toArray();
    expect(toks).toHaveLength(2);
    expect(new Set(toks.map((t) => t.token)).size).toBe(2);
  });

  it('the email is matched trimmed and case-insensitively; without an email the reviewer rows are left', async () => {
    const s = await seed();
    await post({ userId: USER }); // no email
    expect((await col(ReviewToken).findOne({ _id: s.reviewerToken }))!.assignedEmail).toBe(EMAIL);
    expect(
      (await col(ReviewFeedback).findOne({ reviewTokenId: s.reviewerToken }))!.assignedTo,
    ).toBe(NAME);
    // Run again WITH the email (the sweep would): the reviewer is anonymised now.
    await post({ userId: USER, email: `  ${EMAIL.toUpperCase()} ` });
    expect((await col(ReviewToken).findOne({ _id: s.reviewerToken }))!.reviewerErased).toBe(true);
  });

  it('is idempotent: a second run finds nothing and returns zero counts', async () => {
    await seed();
    await post({ userId: USER, email: EMAIL });
    const again = await post({ userId: USER, email: EMAIL });
    expect(again.status).toBe(200);
    expect(Object.values(again.body.counts).every((n) => n === 0)).toBe(true);
    expect(Object.keys(again.body.counts)).toContain('documents');
  });

  it('a user with nothing at all is 200 with zero counts', async () => {
    const res = await post({
      userId: new Types.ObjectId().toString(),
      email: 'nobody@example.com',
    });
    expect(res.status).toBe(200);
    expect(Object.values(res.body.counts).every((n) => n === 0)).toBe(true);
  });

  it('removes isDeleted documents and half-erased ones too', async () => {
    const d = await mkDoc(USER, true);
    await LawieDocument.updateOne(
      { _id: d._id },
      { $set: { deletion: { requestedAt: new Date() } } },
    );
    const res = await post({ userId: USER });
    expect(res.body.counts.documents).toBe(1);
    expect(await LawieDocument.countDocuments({ userId: u })).toBe(0);
  });

  it('Ajay: nothing under that userId holds the email, name or title afterwards (drafting collections)', async () => {
    await seed();
    await post({ userId: USER, email: EMAIL });
    const db = mongoose.connection.db!;
    for (const c of await db.collections()) {
      for (const doc of await c.find({}).toArray()) {
        const txt = JSON.stringify(doc);
        for (const needle of [EMAIL, NAME, TITLE, 'reviewer-link-1']) {
          // The other owner's own document legitimately carries the title; skip it.
          if (c.collectionName === 'documents') continue;
          expect({ c: c.collectionName, needle, leaks: txt.includes(needle) }).toMatchObject({
            leaks: false,
          });
        }
      }
    }
    // And no document of the user's is left.
    expect(await LawieDocument.countDocuments({ userId: u })).toBe(0);
  });

  it('documents go LAST: when an earlier step fails, the documents are still there', async () => {
    await seed();
    jest.spyOn(Generation, 'deleteMany').mockRejectedValueOnce(new Error('hiccup') as never);
    const res = await post({ userId: USER, email: EMAIL });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, error: 'erase_failed', failedAt: 'generations' });
    expect(res.body.counts).toHaveProperty('factledgers');
    expect(res.body.counts).not.toHaveProperty('documents');
    expect(await LawieDocument.countDocuments({ userId: u })).toBe(2);
    // Auth retries; the same call finishes the job.
    jest.restoreAllMocks();
    const retry = await post({ userId: USER, email: EMAIL });
    expect(retry.status).toBe(200);
    expect(await LawieDocument.countDocuments({ userId: u })).toBe(0);
    expect(await col(ReviewToken).find({ reviewerErased: true }).toArray()).toHaveLength(1);
  });

  it('a Redis failure is a 500 with failedAt redisKeys and nothing else is touched', async () => {
    await seed();
    jest.spyOn(redis, 'scan').mockRejectedValue(new Error('redis down') as never);
    const res = await post({ userId: USER, email: EMAIL });
    expect(res.status).toBe(500);
    expect(res.body.failedAt).toBe('redisKeys');
    expect(await everyCount(u)).toEqual({ ...ONE, documents: 2 });
  });

  it('eraseAccount never throws on a bad id', async () => {
    expect(await eraseAccount({ userId: 'nope' })).toMatchObject({ ok: false });
  });

  it('logs hold no email, name or title', async () => {
    const logger = (await import('../config/logger')).default;
    const lines: string[] = [];
    for (const lvl of ['info', 'warn', 'error'] as const) {
      jest.spyOn(logger, lvl).mockImplementation(((...a: unknown[]) => {
        lines.push(JSON.stringify(a));
      }) as never);
    }
    await seed();
    jest.spyOn(Generation, 'deleteMany').mockRejectedValueOnce(new Error('hiccup') as never);
    await post({ userId: USER, email: EMAIL });
    await post({ userId: USER, email: EMAIL });
    const blob = lines.join('\n');
    expect(blob.length).toBeGreaterThan(0);
    for (const n of [EMAIL, NAME, TITLE]) expect(blob).not.toContain(n);
  });
});

describe('long emails (auth sends up to 320 chars)', () => {
  const emailOf = (n: number) => `${'a'.repeat(n - 12)}@example.com`; // exactly n chars

  it('320 chars is accepted (200)', async () => {
    await seed();
    expect(emailOf(320)).toHaveLength(320);
    expect((await post({ userId: USER, email: emailOf(320) })).status).toBe(200);
    expect(await LawieDocument.countDocuments({ userId: u })).toBe(0);
  });

  it('321 chars is a 400 and nothing is erased', async () => {
    await seed();
    const bad = await post({ userId: USER, email: emailOf(321) });
    expect(bad.status).toBe(400);
    expect(await LawieDocument.countDocuments({ userId: u })).toBe(2);
  });

  it('200 chars is still matched against review tokens: no reviewerEmailSkipped', async () => {
    const s = await seed();
    const e200 = emailOf(200);
    await col(ReviewToken).updateOne({ _id: s.reviewerToken }, { $set: { assignedEmail: e200 } });
    const res = await post({ userId: USER, email: e200 });
    expect(res.status).toBe(200);
    expect(res.body.counts).not.toHaveProperty('reviewerEmailSkipped');
    expect(res.body.counts.reviewertokens).toBe(1);
    expect((await col(ReviewToken).findOne({ _id: s.reviewerToken }))!.reviewerErased).toBe(true);
  });

  it.each([201, 320])(
    '%i chars: the reviewer-token match is skipped, counts.reviewerEmailSkipped is 1, the rest is erased',
    async (n) => {
      const s = await seed();
      const long = emailOf(n);
      await col(ReviewToken).updateOne({ _id: s.reviewerToken }, { $set: { assignedEmail: long } });
      const res = await post({ userId: USER, email: long });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.counts.reviewerEmailSkipped).toBe(1);
      expect(res.body.counts.reviewertokens).toBe(0);
      expect(res.body.counts.reviewerfeedbacks).toBe(0);
      expect(res.body.counts.documents).toBe(2);
      expect(await everyCount(u)).toEqual(
        expect.objectContaining({ documents: 0, ledgers: 0, generations: 0, bonus: 0 }),
      );
      // The token that could not be matched is left as it was.
      expect(await col(ReviewToken).findOne({ _id: s.reviewerToken })).toMatchObject({
        assignedEmail: long,
        isActive: true,
      });
    },
  );

  it('a dry run reports reviewerEmailSkipped too, and the email is never logged or echoed', async () => {
    await seed();
    const long = emailOf(250);
    const dry = await post({ userId: USER, email: long, dryRun: true });
    expect(dry.body.counts.reviewerEmailSkipped).toBe(1);
    expect(JSON.stringify(dry.body)).not.toContain(long);
  });
});

describe('dryRun', () => {
  it('returns the same counts as a real run and changes nothing', async () => {
    const s = await seed();
    const snap = async () =>
      JSON.stringify(
        await Promise.all(
          [
            LawieDocument,
            FactLedgerModel,
            Generation,
            LlmAuxCall,
            UsageLog,
            Event,
            TemplateUsage,
            SectionBookmark,
            SectionRecent,
            BonusCredit,
            FactDiff,
            ReviewToken,
            ReviewFeedback,
          ].map((m) => col(m).find({}).sort({ _id: 1 }).toArray()),
        ),
      );
    const redisBefore = (await redis.keys('*')).sort();
    const before = await snap();
    const dry = await post({ userId: USER, email: EMAIL, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.dryRun).toBe(true);
    expect(await snap()).toBe(before);
    expect((await redis.keys('*')).sort()).toEqual(redisBefore);
    expect((await col(ReviewToken).findOne({ _id: s.reviewerToken }))!.assignedEmail).toBe(EMAIL);

    const real = await post({ userId: USER, email: EMAIL });
    expect(real.body.counts).toEqual(dry.body.counts);
  });
});

describe('admin pages show "reviewer: erased"', () => {
  const adminHeaders = {
    'x-internal-secret': SECRET,
    'x-user-id': OTHER,
    'x-user-email': 'admin@example.com',
    'x-user-name': 'Admin',
    'x-user-plan': 'free',
    'x-user-role': 'Admin',
  };

  it('GET /admin/review-tokens and /admin/panel-review give null names and reviewerErased', async () => {
    const s = await seed();
    await post({ userId: USER, email: EMAIL });
    const list = await request(app).get('/admin/review-tokens').set(adminHeaders);
    expect(list.status).toBe(200);
    const rows = list.body.tokens as Array<Record<string, unknown>>;
    const erased = rows.filter((r) => r.reviewerErased === true);
    expect(erased).toHaveLength(1);
    expect(erased[0]).toMatchObject({ assignedTo: null, assignedEmail: null, isActive: false });
    expect(String(erased[0].documentId)).toBe(String(s.otherDoc));
    const other = rows.find((r) => r.token === 'bystander-link-1');
    expect(other).toMatchObject({
      assignedTo: 'Other Reviewer',
      assignedEmail: 'other.reviewer@example.com',
      reviewerErased: false,
    });
    expect(JSON.stringify(list.body)).not.toContain(NAME);
    expect(JSON.stringify(list.body)).not.toContain(EMAIL);

    const panel = await request(app).get('/admin/panel-review').set(adminHeaders);
    expect(panel.status).toBe(200);
    const matrix = panel.body.matrix as Array<Record<string, unknown>>;
    expect(matrix.filter((r) => r.reviewerErased === true && r.assignedTo === null)).toHaveLength(
      1,
    );
    expect(matrix.find((r) => r.token === 'bystander-link-1')).toMatchObject({
      assignedTo: 'Other Reviewer',
      reviewerErased: false,
    });
    expect(JSON.stringify(panel.body)).not.toContain(NAME);
  });

  it('the old review link of an erased reviewer is dead (404), and a guessed new one is revoked (403)', async () => {
    const s = await seed();
    await post({ userId: USER, email: EMAIL });
    expect((await request(app).get('/review/reviewer-link-1')).status).toBe(404);
    const tok = await col(ReviewToken).findOne({ _id: s.reviewerToken });
    expect((await request(app).get(`/review/${tok!.token}`)).status).toBe(403);
  });

  it('the admin activity feed labels an erased reviewer "reviewer: erased"', async () => {
    const s = await seed();
    await post({ userId: USER, email: EMAIL });
    await col(ReviewToken).updateMany(
      { _id: { $in: [s.reviewerToken, s.bystanderToken] } },
      { $set: { isUsed: true, updatedAt: new Date() } },
    );
    const res = await request(app).get('/admin/overview/activity').set(adminHeaders);
    expect(res.status).toBe(200);
    const labels = (res.body.items as Array<{ label: string }>).map((i) => i.label);
    expect(labels).toContain('reviewer: erased submitted review');
    expect(labels).toContain('Other Reviewer submitted review');
    expect(JSON.stringify(res.body)).not.toContain(NAME);
  });
});
