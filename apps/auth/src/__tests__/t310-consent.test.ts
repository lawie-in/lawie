import request from 'supertest';

// Without this, loading ../app opens a real Redis connection that keeps Jest from exiting.
jest.mock('ioredis', () => require('ioredis-mock'));

import mongoose from 'mongoose';

import app from '../app';
import './setupDb';
import logger from '../config/logger';
import { ConsentRecord } from '../models/Consent.model';

const mockSentryCapture = jest.fn();
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureException: (...a: unknown[]) => mockSentryCapture(...a),
  captureMessage: (...a: unknown[]) => mockSentryCapture(...a),
}));

// T-310 — POST /consent: the server record of an anonymous visitor's analytics choice.

const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const OTHER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

const post = (body: unknown) =>
  request(app).post('/consent').set('Content-Type', 'application/json').send(JSON.stringify(body));

const rows = () => ConsentRecord.collection.find({}).toArray();

// Only Date is faked; timers and I/O must keep running for the Mongo driver.
const fakeClock = (iso: string) =>
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
      'hrtime',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
    ],
  });

describe('T-310 POST /consent', () => {
  let loggerSpies: jest.SpyInstance[];

  beforeAll(async () => {
    await ConsentRecord.init();
    await ConsentRecord.syncIndexes();
  });

  beforeEach(() => {
    loggerSpies = LEVELS.map((l) => jest.spyOn(logger, l));
    mockSentryCapture.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('success', () => {
    it('204 with no body, one row, expiresAt 12 months after decidedAt', async () => {
      fakeClock('2026-10-12T10:00:00.000Z');
      const res = await post({ id: ID, choice: 'granted', version: 1 });
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      const all = await rows();
      expect(all).toHaveLength(1);
      expect(all[0].consentId).toBe(ID);
      expect(all[0].purpose).toBe('analytics');
      expect(all[0].choice).toBe('granted');
      expect(all[0].textVersion).toBe(1);
      expect(all[0].previous).toEqual([]);
      expect(all[0].decidedAt.toISOString()).toBe('2026-10-12T10:00:00.000Z');
      expect(all[0].expiresAt.toISOString()).toBe('2027-10-12T10:00:00.000Z');
    });

    it('stores the id lower-case and treats upper-case input as the same record', async () => {
      expect((await post({ id: ID.toUpperCase(), choice: 'denied', version: 1 })).status).toBe(204);
      expect((await post({ id: ID, choice: 'denied', version: 1 })).status).toBe(204);
      const all = await rows();
      expect(all).toHaveLength(1);
      expect(all[0].consentId).toBe(ID);
    });

    it('same id, other choice: updates the row and moves the old one to previous', async () => {
      fakeClock('2026-01-01T00:00:00.000Z');
      await post({ id: ID, choice: 'granted', version: 1 });
      jest.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
      expect((await post({ id: ID, choice: 'denied', version: 1 })).status).toBe(204);
      const all = await rows();
      expect(all).toHaveLength(1);
      expect(all[0].choice).toBe('denied');
      expect(all[0].decidedAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(all[0].expiresAt.toISOString()).toBe('2027-02-01T00:00:00.000Z');
      expect(all[0].previous).toEqual([
        { choice: 'granted', textVersion: 1, decidedAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);
    });

    it('same id, new version with the same choice also records history', async () => {
      await post({ id: ID, choice: 'granted', version: 1 });
      await post({ id: ID, choice: 'granted', version: 2 });
      const all = await rows();
      expect(all[0].textVersion).toBe(2);
      expect(all[0].previous).toHaveLength(1);
      expect(all[0].previous[0]).toMatchObject({ choice: 'granted', textVersion: 1 });
    });

    it('history is capped at 5, newest kept', async () => {
      const choices = ['granted', 'denied'] as const;
      for (let i = 0; i < 9; i++) {
        expect((await post({ id: ID, choice: choices[i % 2], version: 1 })).status).toBe(204);
      }
      const all = await rows();
      expect(all).toHaveLength(1);
      expect(all[0].choice).toBe('granted'); // i = 8
      expect(all[0].previous).toHaveLength(5);
      // previous holds decisions i = 3..7: denied, granted, denied, granted, denied
      expect(all[0].previous.map((p: { choice: string }) => p.choice)).toEqual([
        'denied',
        'granted',
        'denied',
        'granted',
        'denied',
      ]);
    });

    it('the same choice again only moves the time', async () => {
      fakeClock('2026-01-01T00:00:00.000Z');
      await post({ id: ID, choice: 'granted', version: 1 });
      jest.setSystemTime(new Date('2026-03-05T00:00:00.000Z'));
      expect((await post({ id: ID, choice: 'granted', version: 1 })).status).toBe(204);
      const all = await rows();
      expect(all).toHaveLength(1);
      expect(all[0].previous).toEqual([]);
      expect(all[0].decidedAt.toISOString()).toBe('2026-03-05T00:00:00.000Z');
      expect(all[0].expiresAt.toISOString()).toBe('2027-03-05T00:00:00.000Z');
    });

    it('different ids make separate rows', async () => {
      await post({ id: ID, choice: 'granted', version: 1 });
      await post({ id: OTHER_ID, choice: 'denied', version: 1 });
      expect(await rows()).toHaveLength(2);
    });

    it('accepts version 1 and 1000', async () => {
      expect((await post({ id: ID, choice: 'granted', version: 1 })).status).toBe(204);
      expect((await post({ id: OTHER_ID, choice: 'granted', version: 1000 })).status).toBe(204);
    });
  });

  describe('invalid bodies: 400 invalid_input, nothing echoed, nothing stored', () => {
    const MARK = 'ECHOMARKER';
    const cases: Array<[string, unknown]> = [
      ['bad uuid', { id: `${MARK}-not-a-uuid`, choice: 'granted', version: 1 }],
      [
        'uuid v1 (non-v4)',
        { id: '3f2b8c1e-5a4d-1e6f-9b7a-1c2d3e4f5a6b', choice: 'granted', version: 1 },
      ],
      [
        'uuid v4 with bad variant',
        { id: '3f2b8c1e-5a4d-4e6f-0b7a-1c2d3e4f5a6b', choice: 'granted', version: 1 },
      ],
      ['extra key', { id: ID, choice: 'granted', version: 1, email: `${MARK}@x.co` }],
      ['version 0', { id: ID, choice: 'granted', version: 0 }],
      ['version 1001', { id: ID, choice: 'granted', version: 1001 }],
      ['non-integer version', { id: ID, choice: 'granted', version: 1.5 }],
      ['string version', { id: ID, choice: 'granted', version: '1' }],
      ['choice maybe', { id: ID, choice: `maybe${MARK}`, version: 1 }],
      ['missing id', { choice: 'granted', version: 1 }],
      ['missing choice', { id: ID, version: 1 }],
      ['missing version', { id: ID, choice: 'granted' }],
      ['empty object', {}],
      ['array body', [{ id: ID, choice: 'granted', version: 1 }]],
      ['null body', null],
    ];

    it.each(cases)('%s', async (_name, body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_input' });
      expect(res.text).not.toContain(MARK);
      expect(await rows()).toHaveLength(0);
    });

    it('bad JSON gives 400 invalid_input with no echo', async () => {
      const res = await request(app)
        .post('/consent')
        .set('Content-Type', 'application/json')
        .send(`{"id": "${MARK}", "choice": oops}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_input' });
      const lower = res.text.toLowerCase();
      for (const s of [MARK.toLowerCase(), 'unexpected', 'syntaxerror', 'json']) {
        expect(lower).not.toContain(s);
      }
    });

    it('non-JSON content type gives 400 (body not parsed)', async () => {
      const res = await request(app).post('/consent').type('text/plain').send('hello');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_input' });
    });

    it('no body at all gives 400', async () => {
      const res = await request(app).post('/consent');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_input' });
    });
  });

  describe('size limit', () => {
    it('an over 1 KB body gives 413 and never reaches the global errorHandler', async () => {
      const big = JSON.stringify({ id: ID, choice: 'granted', version: 1, pad: 'x'.repeat(2000) });
      const res = await request(app)
        .post('/consent')
        .set('Content-Type', 'application/json')
        .send(big);
      expect(res.status).toBe(413);
      expect(res.body).toEqual({ error: 'invalid_input' });
      expect(res.text).not.toContain('xxxx');
      // errorHandler logs "Request failed" with req.ip and reports to Sentry; neither may happen.
      expect(logger.error).not.toHaveBeenCalled();
      expect(mockSentryCapture).not.toHaveBeenCalled();
      expect(await rows()).toHaveLength(0);
    });

    it('a body just under 1 KB is accepted for parsing (then rejected only by the schema)', async () => {
      const res = await post({ id: ID, choice: 'granted', version: 1, pad: 'x'.repeat(500) });
      expect(res.status).toBe(400);
    });

    it('bad JSON never reaches the global errorHandler either', async () => {
      await request(app).post('/consent').set('Content-Type', 'application/json').send('{oops');
      expect(logger.error).not.toHaveBeenCalled();
      expect(mockSentryCapture).not.toHaveBeenCalled();
    });
  });

  describe('privacy', () => {
    it('stores exactly the listed keys: no ip, user agent or user id', async () => {
      await request(app)
        .post('/consent')
        .set('Content-Type', 'application/json')
        .set('User-Agent', 'SecretAgent/9.9')
        .set('X-Forwarded-For', '203.0.113.7')
        .set('Cookie', 'sid=abc')
        .send(JSON.stringify({ id: ID, choice: 'granted', version: 1 }));
      await post({ id: ID, choice: 'denied', version: 1 });
      const all = await rows();
      expect(Object.keys(all[0]).sort()).toEqual(
        [
          '_id',
          'choice',
          'consentId',
          'decidedAt',
          'expiresAt',
          'previous',
          'purpose',
          'textVersion',
        ].sort(),
      );
      const dump = JSON.stringify(all);
      for (const s of ['SecretAgent', '203.0.113.7', 'sid=abc', 'ip', 'userAgent', 'userId']) {
        if (s === 'ip') expect(Object.keys(all[0])).not.toContain('ip');
        else expect(dump).not.toContain(s);
      }
      for (const p of all[0].previous) {
        expect(Object.keys(p).sort()).toEqual(['choice', 'decidedAt', 'textVersion']);
      }
    });

    it('logs no id and no body on success, invalid input or store failure', async () => {
      const stderr = jest.spyOn(process.stderr, 'write');
      const stdout = jest.spyOn(process.stdout, 'write');
      const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
        jest.spyOn(console, m),
      );
      await post({ id: ID, choice: 'granted', version: 1 });
      await post({ id: ID, choice: 'nope', version: 1 });
      await request(app).post('/consent').set('Content-Type', 'application/json').send('{bad');
      jest.spyOn(ConsentRecord, 'updateOne').mockRejectedValueOnce(new Error(`boom ${ID}`));
      const failed = await post({ id: OTHER_ID, choice: 'granted', version: 1 });
      expect(failed.status).toBe(500);
      expect(failed.body).toEqual({ error: 'server_error' });
      expect(failed.text).not.toContain(ID);
      expect(failed.text).not.toContain('boom');

      const captured = [
        ...loggerSpies.flatMap((s) => s.mock.calls),
        ...consoles.flatMap((s) => s.mock.calls),
        ...stderr.mock.calls,
        ...stdout.mock.calls,
      ]
        .map((c) =>
          c.map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
        )
        .join('\n');
      expect(captured).not.toContain(ID);
      expect(captured).not.toContain(OTHER_ID);
      expect(captured).not.toContain('granted');
      expect(captured).not.toContain('boom');
      expect(mockSentryCapture).not.toHaveBeenCalled();
    });

    it('needs no Authorization header; one present (even garbage) is ignored', async () => {
      const none = await post({ id: ID, choice: 'granted', version: 1 });
      expect(none.status).toBe(204);
      const withAuth = await request(app)
        .post('/consent')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'Bearer not.a.real.token')
        .send(JSON.stringify({ id: OTHER_ID, choice: 'denied', version: 1 }));
      expect(withAuth.status).toBe(204);
      const all = await rows();
      expect(all).toHaveLength(2);
      for (const r of all) expect(JSON.stringify(r)).not.toContain('Bearer');
    });
  });

  describe('indexes', () => {
    it('has a TTL index on expiresAt (expireAfterSeconds 0) and a unique consentId', async () => {
      const indexes = await mongoose.connection.collection('consentrecords').indexes();
      const ttl = indexes.find((i) => i.key && 'expiresAt' in i.key);
      expect(ttl).toBeDefined();
      expect(ttl?.expireAfterSeconds).toBe(0);
      const unique = indexes.find((i) => i.key && 'consentId' in i.key);
      expect(unique).toBeDefined();
      expect(unique?.unique).toBe(true);
    });

    it('the unique index rejects a second row for the same consentId', async () => {
      const doc = {
        consentId: ID,
        purpose: 'analytics',
        choice: 'granted',
        textVersion: 1,
        decidedAt: new Date(),
        previous: [],
        expiresAt: new Date(),
      };
      await ConsentRecord.collection.insertOne({ ...doc });
      await expect(ConsentRecord.collection.insertOne({ ...doc })).rejects.toMatchObject({
        code: 11000,
      });
    });
  });

  describe('store failure', () => {
    it('500 server_error without reaching the global errorHandler', async () => {
      jest.spyOn(ConsentRecord, 'updateOne').mockRejectedValueOnce(new Error('db down'));
      const res = await post({ id: ID, choice: 'granted', version: 1 });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'server_error' });
      // T-332: one fixed message, error name and code only.
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        { errName: 'Error', code: undefined },
        'consent_store_failed',
      );
      expect(mockSentryCapture).not.toHaveBeenCalled();
    });

    it('the store-failure log holds no consentId, no body and no error message', async () => {
      const err = Object.assign(new Error(`E11000 dup key { consentId: "${ID}" }`), {
        code: 11000,
      });
      jest.spyOn(ConsentRecord, 'updateOne').mockRejectedValue(err);
      const res = await post({ id: ID, choice: 'granted', version: 1 });
      expect(res.status).toBe(500);
      expect(logger.error).toHaveBeenCalledTimes(1);
      const args = (logger.error as unknown as jest.Mock).mock.calls[0];
      expect(args).toEqual([{ errName: 'Error', code: 11000 }, 'consent_store_failed']);
      const dump = JSON.stringify(args);
      for (const s of [ID, 'granted', 'E11000', 'dup key', 'consentId']) {
        expect(dump).not.toContain(s);
      }
      for (const a of args) expect(a).not.toBe(err);
    });

    it('retries once on a duplicate-key race and then succeeds', async () => {
      const real = ConsentRecord.updateOne.bind(ConsentRecord);
      const spy = jest
        .spyOn(ConsentRecord, 'updateOne')
        .mockImplementationOnce((() =>
          Promise.reject(Object.assign(new Error('dup'), { code: 11000 }))) as never)
        .mockImplementation(real as never);
      const res = await post({ id: ID, choice: 'granted', version: 1 });
      expect(res.status).toBe(204);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
