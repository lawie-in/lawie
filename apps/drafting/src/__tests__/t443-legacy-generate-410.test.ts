/**
 * T-443 - the legacy POST /documents/generate route is retired.
 *
 * It answers 410 { error: 'Gone', message } for every docType (the old generateSchema enum,
 * 'bail_regular', 'plaint', and an unknown one), and it answers BEFORE auth, privacy, the
 * template guard, validation, the credit gate and the spend cap: no headers and an empty body
 * still get the 410. It does nothing else: no Ink hold, no spend, no Generation row, no document,
 * no model call, no run headers. The live generation routes are not shadowed by the stub.
 *
 * The last block proves the "nothing happened" assertions can fail: the same checks, run against a
 * stand-in app whose /generate behaves like the old route, must throw.
 */
import './setupDb';
import express from 'express';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { CreditLedger } from '../models/CreditLedger.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { UsageLog } from '../models/UsageLog.model';
import * as aiService from '../services/ai.service';
import * as credits from '../services/credits.service';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439443';

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'pro',
    'x-user-role': 'Client',
  };
}

// The docType enum of the removed generateSchema (HEAD:documents.routes.ts, before T-443).
// Pinned here on purpose: the schema is gone, the list is the contract being tested.
const OLD_SCHEMA_DOC_TYPES = [
  'bail_application',
  'petition',
  'legal_notice',
  'affidavit',
  'vakalatnama',
  'plaint',
  'written_statement',
  'injunction',
  'reply',
  'complaint',
  'rent_agreement',
];
const ALL_DOC_TYPES = [...OLD_SCHEMA_DOC_TYPES, 'bail_regular', 'nonsense'];

const legacyBody = (docType: string) => ({
  docType,
  courtName: 'District Court, Pune',
  courtType: 'district_court',
  partyDetails: { applicant: 'A', respondent: 'B' },
  keyFacts: 'The applicant was arrested on 1 January 2026 and has been in custody since.',
  reliefPrayer: 'Grant regular bail to the applicant.',
  advocateName: 'Adv. Test',
  advocateEnrollment: 'MH/1234/2015',
});

let holdSpy: jest.SpyInstance;
let spendSpy: jest.SpyInstance;
let balanceSpy: jest.SpyInstance;
let releaseSpy: jest.SpyInstance;
let settleSpy: jest.SpyInstance;
let streamSpy: jest.SpyInstance;
let genCreateSpy: jest.SpyInstance;
let docCreateSpy: jest.SpyInstance;

function spyAll(): void {
  holdSpy = jest.spyOn(credits, 'holdInk');
  spendSpy = jest.spyOn(credits, 'spendInk');
  balanceSpy = jest.spyOn(credits, 'getCreditBalance');
  releaseSpy = jest.spyOn(credits, 'releaseInk');
  settleSpy = jest.spyOn(credits, 'settleInk');
  streamSpy = jest.spyOn(aiService, 'streamGenerateDocument');
  genCreateSpy = jest.spyOn(Generation, 'create');
  docCreateSpy = jest.spyOn(LawieDocument, 'create');
}

/** Everything the old route did that must NOT happen now, checked against one response. */
async function expectNothingHappened(res: request.Response): Promise<void> {
  expect(holdSpy).not.toHaveBeenCalled();
  expect(spendSpy).not.toHaveBeenCalled();
  expect(balanceSpy).not.toHaveBeenCalled();
  expect(releaseSpy).not.toHaveBeenCalled();
  expect(settleSpy).not.toHaveBeenCalled();
  expect(streamSpy).not.toHaveBeenCalled();
  expect(genCreateSpy).not.toHaveBeenCalled();
  expect(docCreateSpy).not.toHaveBeenCalled();
  expect(mockMessagesStream).not.toHaveBeenCalled();
  expect(await Generation.countDocuments({})).toBe(0);
  expect(await LawieDocument.countDocuments({})).toBe(0);
  expect(await CreditLedger.countDocuments({})).toBe(0);
  expect(await UsageLog.countDocuments({})).toBe(0);
  expect(res.headers['x-run-id']).toBeUndefined();
  expect(res.headers['x-run-sequence']).toBeUndefined();
}

/** The 410 contract, shared by the main cases and the can-fail proof below. */
function expectGone(res: request.Response): void {
  expect(res.status).toBe(410);
  expect(res.headers['content-type']).toMatch(/json/);
  expect(res.body).toEqual({ error: 'Gone', message: expect.any(String) });
  expect(res.body.message.length).toBeGreaterThan(0);
  expect(res.body.message.length).toBeLessThan(200);
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  await redis.flushall();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  spyAll();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /generate is retired (410 Gone)', () => {
  it.each(ALL_DOC_TYPES)("docType '%s' -> 410 { error: 'Gone', message }", async (docType) => {
    const res = await request(app).post('/generate').set(headers()).send(legacyBody(docType));
    expectGone(res);
    await expectNothingHappened(res);
  });

  it('the list covers bail_regular, plaint and an unknown docType', () => {
    expect(ALL_DOC_TYPES).toEqual(
      expect.arrayContaining(['bail_regular', 'bail_application', 'plaint', 'nonsense']),
    );
    expect(OLD_SCHEMA_DOC_TYPES).toHaveLength(11);
  });

  it('answers 410 with no auth headers at all (before authenticate)', async () => {
    const res = await request(app).post('/generate').send(legacyBody('bail_regular'));
    expect(res.status).toBe(410);
    expect(res.body).toEqual({ error: 'Gone', message: expect.any(String) });
    await expectNothingHappened(res);
  });

  it('answers 410 with a wrong internal secret (not 401/403)', async () => {
    const res = await request(app)
      .post('/generate')
      .set({ ...headers(), 'x-internal-secret': 'not-the-secret' })
      .send(legacyBody('bail_regular'));
    expect(res.status).toBe(410);
    await expectNothingHappened(res);
  });

  it('answers 410 for an empty body {} (before validation, not 400)', async () => {
    const res = await request(app).post('/generate').set(headers()).send({});
    expect(res.status).toBe(410);
    expect(res.body).toEqual({ error: 'Gone', message: expect.any(String) });
    await expectNothingHappened(res);
  });

  it('answers 410 with no headers and no body', async () => {
    const res = await request(app).post('/generate');
    expect(res.status).toBe(410);
    await expectNothingHappened(res);
  });

  it('a valid-looking legacy body from an authenticated user touches nothing', async () => {
    mockMessagesStream.mockImplementation(() => sdkAnswer('should never be reached', 1, 1));
    const res = await request(app)
      .post('/generate')
      .set(headers())
      .send(legacyBody('bail_regular'));
    expect(res.status).toBe(410);
    await expectNothingHappened(res);
  });
});

describe('the live generation routes are not shadowed by the stub', () => {
  it.each(['/generate-from-brief', '/generate-from-template'])(
    '%s is still routed (not 410)',
    async (url) => {
      const res = await request(app).post(url).set(headers()).send({});
      expect(res.status).not.toBe(410);
      expect(res.body?.error).not.toBe('Gone');
      // the existing enforceCredits refusal for a body with no document id
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Unknown document type' });
    },
  );

  it.each(['/generate-from-brief', '/generate-from-template'])(
    '%s without auth is refused by auth (not 410)',
    async (url) => {
      const res = await request(app).post(url).send({});
      expect(res.status).not.toBe(410);
      expect([401, 403]).toContain(res.status);
    },
  );
});

describe('the assertions can fail (stand-in for the old route)', () => {
  // A stand-in that behaves like the old route: it answers 200, takes a hold and writes a row.
  function oldRouteApp(): express.Express {
    const a = express();
    a.use(express.json());
    a.post('/generate', async (_req, res) => {
      await credits
        .holdInk({
          userId: USER_ID,
          amount: 1,
          runId: 'r-old',
          templateId: 'bail_regular',
        } as never)
        .catch(() => undefined);
      await Generation.create({ userId: USER_ID } as never).catch(() => undefined);
      res.set('X-Run-Id', 'r-old').status(200).json({ ok: true });
    });
    return a;
  }

  it('the 410 helper throws against a handler that answers 200', async () => {
    const res = await request(oldRouteApp()).post('/generate').send(legacyBody('bail_regular'));
    expect(() => expectGone(res)).toThrow();
  });

  it('the nothing-happened helper throws once a hold and a row exist', async () => {
    const res = await request(oldRouteApp()).post('/generate').send(legacyBody('bail_regular'));
    expect(holdSpy).toHaveBeenCalledTimes(1);
    expect(genCreateSpy).toHaveBeenCalledTimes(1);
    expect(res.headers['x-run-id']).toBe('r-old');
    await expect(expectNothingHappened(res)).rejects.toThrow();
  });
});
