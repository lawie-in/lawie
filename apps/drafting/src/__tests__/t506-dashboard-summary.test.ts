/**
 * T-506 — GET /dashboard/summary (gateway: /api/drafting/dashboard/summary).
 *
 * Covers the acceptance criteria: the six fields for the signed-in user only,
 * IST calendar-month boundary (asserted on UTC instants so the server time
 * zone cannot matter), fixtures and soft-deleted documents excluded, other
 * users never returned, Ink not floored, and no personal data in logs.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { getDashboardSummary } from '../services/dashboard-summary.service';
import { istMonthBounds } from '../services/ist-month';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439022';
const SECRET_TITLE = 'sentinel-title-must-not-be-logged';
const SECRET_BODY = 'sentinel-body-must-not-be-logged';
const SECRET_EMAIL = 'sentinel-person@example.com';
const SECRET_NAME = 'sentinel-name-must-not-be-logged';
const SECRET_ERR = 'sentinel-error-must-not-be-logged';

// "Now" is mid October 2026 IST. Month = [2026-09-30T18:30Z, 2026-10-31T18:30Z).
const NOW = new Date('2026-10-17T06:00:00Z');
const IN_OCT = new Date('2026-10-10T10:00:00Z');
const LAST_SEP_EDGE = new Date('2026-09-30T18:29:59Z'); // still September in IST
const OCT_START = new Date('2026-09-30T18:30:00Z'); // first instant of October in IST
const OCT_LAST = new Date('2026-10-31T18:29:59Z'); // last second of October in IST
const NOV_START = new Date('2026-10-31T18:30:00Z'); // November in IST

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': SECRET_EMAIL,
    'x-user-name': SECRET_NAME,
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

async function doc(overrides: Record<string, unknown> = {}) {
  return LawieDocument.create({
    userId: USER_ID,
    title: SECRET_TITLE,
    docType: 'bail_application',
    generatedContent: SECRET_BODY,
    createdAt: IN_OCT,
    ...overrides,
  });
}

async function gen(overrides: Record<string, unknown> = {}) {
  return Generation.create({
    userId: USER_ID,
    docType: 'bail_application',
    tokensUsed: 10,
    status: 'failed',
    createdAt: IN_OCT,
    ...overrides,
  });
}

async function ink(
  rows: Array<{ userId?: string; delta: number; reason: string; createdAt?: Date }>,
) {
  await mongoose.connection.db!.collection('inkledger').insertMany(
    rows.map((r) => ({
      userId: new mongoose.Types.ObjectId(r.userId ?? USER_ID),
      delta: r.delta,
      reason: r.reason,
      createdAt: r.createdAt ?? IN_OCT,
    })),
  );
}

const summary = (now: Date = NOW, userId = USER_ID) => getDashboardSummary(userId, now);

describe('istMonthBounds (T-506)', () => {
  it('9-30T18:29:59Z is September, 18:30:00Z is October', () => {
    expect(istMonthBounds(LAST_SEP_EDGE).month).toBe('2026-09');
    expect(istMonthBounds(OCT_START).month).toBe('2026-10');
  });

  it('start is the first instant of the month in IST, end the first of the next', () => {
    const b = istMonthBounds(NOW);
    expect(b.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(b.end.toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });

  it('rolls the year over at 2026-12-31T18:30:00Z', () => {
    expect(istMonthBounds(new Date('2026-12-31T18:29:59Z')).month).toBe('2026-12');
    const jan = istMonthBounds(new Date('2026-12-31T18:30:00Z'));
    expect(jan.month).toBe('2027-01');
    expect(jan.start.toISOString()).toBe('2026-12-31T18:30:00.000Z');
    expect(jan.end.toISOString()).toBe('2027-01-31T18:30:00.000Z');
  });

  it('handles a leap February', () => {
    const b = istMonthBounds(new Date('2028-02-15T00:00:00Z'));
    expect(b.month).toBe('2028-02');
    expect(b.end.toISOString()).toBe('2028-02-29T18:30:00.000Z');
  });
});

describe('GET /dashboard/summary — auth (T-506)', () => {
  it('401 without the internal secret', async () => {
    const h: Record<string, string> = headers();
    delete h['x-internal-secret'];
    expect((await request(app).get('/dashboard/summary').set(h)).status).toBe(401);
  });

  it('401 with a wrong internal secret', async () => {
    const res = await request(app)
      .get('/dashboard/summary')
      .set({ ...headers(), 'x-internal-secret': 'wrong-secret-value-xx' });
    expect(res.status).toBe(401);
  });

  it('401 without a user id', async () => {
    const h: Record<string, string> = headers();
    delete h['x-user-id'];
    expect((await request(app).get('/dashboard/summary').set(h)).status).toBe(401);
  });

  it('400 for an invalid user id', async () => {
    const res = await request(app).get('/dashboard/summary').set(headers('not-an-object-id'));
    expect(res.status).toBe(400);
  });

  it('is mounted at /dashboard/summary and answers 200 for a valid caller', async () => {
    const res = await request(app).get('/dashboard/summary').set(headers());
    expect(res.status).toBe(200);
  });
});

describe('GET /dashboard/summary — route with a pinned clock (T-506)', () => {
  afterEach(() => jest.useRealTimers());

  it('uses the current IST month: a row at the IST month start counts, the previous second does not', async () => {
    await doc({ createdAt: LAST_SEP_EDGE, docType: 'petition' });
    await doc({ createdAt: OCT_START, docType: 'affidavit' });
    jest.useFakeTimers({
      now: new Date('2026-10-17T06:00:00Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
        'performance',
        'hrtime',
      ],
    });
    const res = await request(app).get('/dashboard/summary').set(headers());
    expect(res.status).toBe(200);
    expect(res.body.month).toBe('2026-10');
    expect(res.body.draftsThisMonth).toBe(1);
    expect(res.body.byType).toEqual({ affidavit: 1 });
    expect(res.body.statusCounts.draft).toBe(2); // all-time
  });

  it('returns every field with the documented shape', async () => {
    await doc({ status: 'finalised' });
    await gen();
    await ink([{ delta: -3, reason: 'generate' }]);
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'clearImmediate',
        'queueMicrotask',
        'performance',
        'hrtime',
      ],
    });
    const res = await request(app).get('/dashboard/summary').set(headers());
    expect(res.body).toEqual({
      month: '2026-10',
      draftsThisMonth: 1,
      byType: { bail_application: 1 },
      statusCounts: { draft: 0, finalised: 1, exported: 0 },
      inkUsedThisMonth: 1.5,
      inkUsed: 1.5,
      inkUsedHalfUnits: 3,
      failedCount: 1,
    });
  });
});

describe('getDashboardSummary — IST month boundary (T-506)', () => {
  it('documents: September-edge row is not in October, October-start row is', async () => {
    await doc({ createdAt: LAST_SEP_EDGE, docType: 'petition' });
    await doc({ createdAt: OCT_START, docType: 'affidavit' });
    await doc({ createdAt: OCT_LAST, docType: 'plaint' });
    await doc({ createdAt: NOV_START, docType: 'vakalatnama' });
    const s = await summary();
    expect(s.draftsThisMonth).toBe(2);
    expect(s.byType).toEqual({ affidavit: 1, plaint: 1 });
  });

  it('the same rows seen from September: only the September-edge row', async () => {
    await doc({ createdAt: LAST_SEP_EDGE, docType: 'petition' });
    await doc({ createdAt: OCT_START, docType: 'affidavit' });
    const s = await summary(new Date('2026-09-15T00:00:00Z'));
    expect(s.month).toBe('2026-09');
    expect(s.draftsThisMonth).toBe(1);
    expect(s.byType).toEqual({ petition: 1 });
  });

  it('failedCount respects both edges', async () => {
    await gen({ createdAt: LAST_SEP_EDGE });
    await gen({ createdAt: OCT_START });
    await gen({ createdAt: OCT_LAST });
    await gen({ createdAt: NOV_START });
    expect((await summary()).failedCount).toBe(2);
  });

  it('ink respects both edges', async () => {
    await ink([
      { delta: -2, reason: 'generate', createdAt: LAST_SEP_EDGE },
      { delta: -4, reason: 'generate', createdAt: OCT_START },
      { delta: -6, reason: 'regenerate', createdAt: OCT_LAST },
      { delta: -8, reason: 'generate', createdAt: NOV_START },
    ]);
    const s = await summary();
    expect(s.inkUsedHalfUnits).toBe(10);
    expect(s.inkUsed).toBe(5);
  });

  it('year rollover: a row at 2026-12-31T18:30Z is January 2027, not December', async () => {
    await doc({ createdAt: new Date('2026-12-31T18:29:59Z'), docType: 'petition' });
    await doc({ createdAt: new Date('2026-12-31T18:30:00Z'), docType: 'affidavit' });
    const jan = await summary(new Date('2027-01-05T00:00:00Z'));
    expect(jan.month).toBe('2027-01');
    expect(jan.byType).toEqual({ affidavit: 1 });
    const dec = await summary(new Date('2026-12-05T00:00:00Z'));
    expect(dec.byType).toEqual({ petition: 1 });
  });
});

describe('getDashboardSummary — fixtures excluded (T-506)', () => {
  it('documents: runType fixture is excluded from month counts, byType and statusCounts', async () => {
    await doc({ runType: 'fixture', status: 'exported', docType: 'petition' });
    await doc({ docType: 'affidavit' });
    const s = await summary();
    expect(s.draftsThisMonth).toBe(1);
    expect(s.byType).toEqual({ affidavit: 1 });
    expect(s.statusCounts).toEqual({ draft: 1, finalised: 0, exported: 0 });
  });

  it('documents: a row with no runType field counts as a user row', async () => {
    await mongoose.connection.db!.collection('documents').insertOne({
      userId: new mongoose.Types.ObjectId(USER_ID),
      title: 'old',
      docType: 'legacy',
      status: 'draft',
      createdAt: IN_OCT,
    });
    const s = await summary();
    expect(s.draftsThisMonth).toBe(1);
    expect(s.byType).toEqual({ legacy: 1 });
    expect(s.statusCounts.draft).toBe(1);
  });

  it('generations: runOrigin fixture failures are not counted; missing runOrigin is', async () => {
    await gen({ runOrigin: 'fixture' });
    await gen({ runOrigin: 'fixture' });
    await mongoose.connection.db!.collection('generations').insertOne({
      userId: new mongoose.Types.ObjectId(USER_ID),
      docType: 'bail_application',
      status: 'failed',
      createdAt: IN_OCT,
    });
    await gen({ runOrigin: 'user' });
    expect((await summary()).failedCount).toBe(2);
  });
});

describe('getDashboardSummary — other users never returned (T-506)', () => {
  it('ignores another user in documents, generations and the ink ledger', async () => {
    await doc({ userId: OTHER_ID, docType: 'petition', status: 'finalised' });
    await doc({ userId: OTHER_ID, docType: 'petition', status: 'exported' });
    await gen({ userId: OTHER_ID });
    await ink([{ userId: OTHER_ID, delta: -20, reason: 'generate' }]);
    await doc({ docType: 'affidavit' });
    await gen();
    await ink([{ delta: -2, reason: 'generate' }]);

    const mine = await summary();
    expect(mine.draftsThisMonth).toBe(1);
    expect(mine.byType).toEqual({ affidavit: 1 });
    expect(mine.statusCounts).toEqual({ draft: 1, finalised: 0, exported: 0 });
    expect(mine.failedCount).toBe(1);
    expect(mine.inkUsedHalfUnits).toBe(2);

    const theirs = await summary(NOW, OTHER_ID);
    expect(theirs.draftsThisMonth).toBe(2);
    expect(theirs.byType).toEqual({ petition: 2 });
    expect(theirs.inkUsedHalfUnits).toBe(20);
  });

  it('a user with only other users data gets all zeros', async () => {
    await doc({ userId: OTHER_ID });
    await gen({ userId: OTHER_ID });
    await ink([{ userId: OTHER_ID, delta: -2, reason: 'generate' }]);
    const res = await request(app).get('/dashboard/summary').set(headers());
    expect(res.body).toMatchObject({
      draftsThisMonth: 0,
      byType: {},
      statusCounts: { draft: 0, finalised: 0, exported: 0 },
      failedCount: 0,
      inkUsedHalfUnits: 0,
    });
  });

  it('a body or query user id cannot select another user', async () => {
    await doc({ userId: OTHER_ID, docType: 'petition' });
    const res = await request(app)
      .get('/dashboard/summary')
      .query({ userId: OTHER_ID })
      .set(headers());
    expect(res.body.byType).toEqual({});
  });
});

describe('getDashboardSummary — soft-deleted documents (T-506)', () => {
  it('isDeleted true is excluded from month counts, byType and statusCounts', async () => {
    await doc({ isDeleted: true, status: 'finalised', docType: 'petition' });
    await doc({ isDeleted: false, docType: 'affidavit' });
    const s = await summary();
    expect(s.draftsThisMonth).toBe(1);
    expect(s.byType).toEqual({ affidavit: 1 });
    expect(s.statusCounts).toEqual({ draft: 1, finalised: 0, exported: 0 });
  });
});

describe('getDashboardSummary — statusCounts (T-506)', () => {
  it('are all-time, while the month fields exclude old documents', async () => {
    await doc({
      createdAt: new Date('2025-03-01T00:00:00Z'),
      status: 'finalised',
      docType: 'petition',
    });
    await doc({
      createdAt: new Date('2026-08-01T00:00:00Z'),
      status: 'exported',
      docType: 'plaint',
    });
    await doc({ status: 'draft', docType: 'affidavit' });
    const s = await summary();
    expect(s.statusCounts).toEqual({ draft: 1, finalised: 1, exported: 1 });
    expect(s.draftsThisMonth).toBe(1);
    expect(s.byType).toEqual({ affidavit: 1 });
  });

  it('exported is counted separately from finalised', async () => {
    await doc({ status: 'finalised' });
    await doc({ status: 'exported' });
    await doc({ status: 'exported' });
    expect((await summary()).statusCounts).toEqual({ draft: 0, finalised: 1, exported: 2 });
  });

  it('all three keys are present with zeros for a user with no data', async () => {
    const s = await summary();
    expect(s.statusCounts).toEqual({ draft: 0, finalised: 0, exported: 0 });
  });
});

describe('getDashboardSummary — failedCount (T-506)', () => {
  it('counts only status failed; each retry counts; completed and status-less rows do not', async () => {
    await gen();
    await gen(); // a retry of the same attempt is a second failure
    await gen({ status: 'completed' });
    await mongoose.connection.db!.collection('generations').insertOne({
      userId: new mongoose.Types.ObjectId(USER_ID),
      docType: 'bail_application',
      createdAt: IN_OCT,
      runOrigin: 'user',
    });
    expect((await summary()).failedCount).toBe(2);
  });
});

describe('getDashboardSummary — Ink (T-506)', () => {
  it('sums only generate and regenerate; ignores grants and other reasons', async () => {
    await ink([
      { delta: -2, reason: 'generate' },
      { delta: -4, reason: 'regenerate' },
      { delta: 100, reason: 'grant' },
      { delta: -50, reason: 'refund' },
      { delta: -50, reason: 'export' },
      { delta: 6, reason: 'monthly_reset' },
    ]);
    const s = await summary();
    expect(s.inkUsedHalfUnits).toBe(6);
    expect(s.inkUsed).toBe(3);
  });

  it('is not floored: odd half units show .5 and the half-unit field stays an integer', async () => {
    await ink([
      { delta: -1, reason: 'generate' },
      { delta: -2, reason: 'generate' },
      { delta: -2, reason: 'regenerate' },
    ]);
    const s = await summary();
    expect(s.inkUsedHalfUnits).toBe(5);
    expect(Number.isInteger(s.inkUsedHalfUnits)).toBe(true);
    expect(s.inkUsed).toBe(2.5);
    expect(s.inkUsedThisMonth).toBe(s.inkUsed);
  });

  it('a net positive sum (refunds booked as generate) clamps to 0', async () => {
    await ink([
      { delta: -2, reason: 'generate' },
      { delta: 6, reason: 'generate' },
    ]);
    const s = await summary();
    expect(s.inkUsedHalfUnits).toBe(0);
    expect(s.inkUsed).toBe(0);
  });

  it('no ledger rows means 0', async () => {
    expect((await summary()).inkUsed).toBe(0);
  });
});

describe('getDashboardSummary — empty user (T-506)', () => {
  it('returns zeros and an empty byType', async () => {
    expect(await summary()).toEqual({
      month: '2026-10',
      draftsThisMonth: 0,
      byType: {},
      statusCounts: { draft: 0, finalised: 0, exported: 0 },
      inkUsedThisMonth: 0,
      inkUsed: 0,
      inkUsedHalfUnits: 0,
      failedCount: 0,
    });
  });
});

describe('GET /dashboard/summary — logging (T-506 AC5)', () => {
  const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
  type AnySpy = jest.SpyInstance;
  let spies: AnySpy[] = [];

  beforeEach(() => {
    spies = [
      ...levels.map((l) => jest.spyOn(logger, l)),
      ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
        jest.spyOn(console, m).mockImplementation(() => undefined),
      ),
    ];
  });
  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
    jest.restoreAllMocks();
  });

  const logged = () => JSON.stringify(spies.map((s) => s.mock.calls));

  it('success path logs no title, content, email, name or other users ids', async () => {
    await doc();
    await doc({ userId: OTHER_ID });
    const res = await request(app).get('/dashboard/summary').set(headers());
    expect(res.status).toBe(200);
    const out = logged();
    for (const s of [SECRET_TITLE, SECRET_BODY, SECRET_EMAIL, SECRET_NAME, OTHER_ID]) {
      expect(out).not.toContain(s);
    }
    // the response itself carries no content either
    expect(JSON.stringify(res.body)).not.toContain(SECRET_TITLE);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_BODY);
  });

  it('a failure is a generic 500 and logs only { route, errorName }', async () => {
    await doc();
    jest
      .spyOn(LawieDocument, 'countDocuments')
      .mockImplementation((() => Promise.reject(new TypeError(SECRET_ERR))) as never);
    const res = await request(app).get('/dashboard/summary').set(headers());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_ERR);
    expect(res.body).toEqual({ error: 'Could not load dashboard summary' });

    const errorCalls = (logger.error as unknown as jest.SpyInstance).mock.calls;
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][0]).toEqual({ route: 'dashboard.summary', errorName: 'TypeError' });
    const out = logged();
    for (const s of [SECRET_ERR, SECRET_TITLE, SECRET_BODY, SECRET_EMAIL, SECRET_NAME, USER_ID]) {
      expect(out).not.toContain(s);
    }
  });

  it('a failure in the Generation query also gives a generic 500 without the message', async () => {
    jest
      .spyOn(Generation, 'countDocuments')
      .mockImplementation((() => Promise.reject(new Error(SECRET_ERR))) as never);
    const res = await request(app).get('/dashboard/summary').set(headers());
    expect(res.status).toBe(500);
    expect(logged()).not.toContain(SECRET_ERR);
  });
});
