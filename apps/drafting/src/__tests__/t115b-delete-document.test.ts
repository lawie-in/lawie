/**
 * T-115b — DELETE /documents/:id: owner only, mark and hide first, erase the
 * children with the document row last, 200 only when finished, 202 when not,
 * the sweep finishes it, logs carry no values.
 */
import './setupDb';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { FactDiff } from '../models/FactDiff.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { ReviewFeedback } from '../models/ReviewFeedback.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { TemplateUsage } from '../models/TemplateUsage.model';
import { UsageLog } from '../models/UsageLog.model';
import {
  eraseDocument,
  runDocumentEraseSweep,
  startDocumentEraseSweep,
  stopDocumentEraseSweep,
} from '../services/document-erase.service';
import { encrypt } from '../utils/encryption';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const OWNER = '507f1f77bcf86cd799439161';
const OTHER = '507f1f77bcf86cd799439162';
const SECRET_TITLE = 'Zorblax v. Quimby bail SECRET-TITLE-9931';
const SECRET_CONTENT = 'SECRET-CONTENT-4417 the accused Mr Wibblefoot';

function headers(userId = OWNER) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

const del = (id: unknown, userId = OWNER) =>
  request(app)
    .delete(`/${String(id)}`)
    .set(headers(userId));

async function makeDoc(userId = OWNER, title = SECRET_TITLE) {
  return LawieDocument.create({
    userId,
    title,
    docType: 'bail_application',
    generatedContent: encrypt(SECRET_CONTENT),
  });
}

const col = (m: { collection: mongoose.Collection }) => m.collection;

interface Seeded {
  docId: Types.ObjectId;
  intakeId: string;
  ledgerId: Types.ObjectId;
  genId: Types.ObjectId;
  usageId: Types.ObjectId;
  tuId: Types.ObjectId;
  eventId: Types.ObjectId;
}

/** Raw inserts, so the rows need only the linking fields. */
async function seedChildren(docId: Types.ObjectId, intakeId: string): Promise<Seeded> {
  const ledgerId = new Types.ObjectId();
  const genId = new Types.ObjectId();
  const usageId = new Types.ObjectId();
  const tuId = new Types.ObjectId();
  const eventId = new Types.ObjectId();
  await col(FactLedgerModel).insertOne({
    _id: ledgerId,
    intakeId,
    userId: new Types.ObjectId(OWNER),
  });
  await col(LlmAuxCall).insertOne({ intakeId, userId: new Types.ObjectId(OWNER) });
  await col(FactDiff).insertOne({ documentId: docId, ledgerId, userId: new Types.ObjectId(OWNER) });
  await col(ReviewToken).insertOne({ documentId: docId });
  await col(ReviewFeedback).insertOne({ documentId: docId });
  await col(Generation).insertOne({ _id: genId, documentId: docId, intakeId });
  await col(UsageLog).insertOne({ _id: usageId, documentId: docId });
  await col(TemplateUsage).insertOne({ _id: tuId, documentId: docId });
  await col(Event).insertOne({ _id: eventId, docId });
  return { docId, intakeId, ledgerId, genId, usageId, tuId, eventId };
}

async function childCounts(s: Seeded) {
  return {
    ledger: await col(FactLedgerModel).countDocuments({ _id: s.ledgerId }),
    aux: await col(LlmAuxCall).countDocuments({ intakeId: s.intakeId }),
    diff: await col(FactDiff).countDocuments({ documentId: s.docId }),
    token: await col(ReviewToken).countDocuments({ documentId: s.docId }),
    feedback: await col(ReviewFeedback).countDocuments({ documentId: s.docId }),
  };
}

function logged(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(spies.flatMap((s) => s.mock.calls));
}

describe('DELETE /documents/:id (T-115b)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    stopDocumentEraseSweep();
  });

  describe('AC1 owner only', () => {
    it("another user's id is 404 and nothing changes", async () => {
      const doc = await makeDoc(OWNER);
      const s = await seedChildren(doc._id as Types.ObjectId, 'intake-a');
      const res = await del(doc._id, OTHER);
      expect(res.status).toBe(404);
      const after = await LawieDocument.findById(doc._id).lean();
      expect(after).not.toBeNull();
      expect(after!.isDeleted).toBe(false);
      expect(after!.deletion).toBeUndefined();
      expect(await childCounts(s)).toEqual({ ledger: 1, aux: 1, diff: 1, token: 1, feedback: 1 });
    });

    it('an unknown id is 404', async () => {
      const res = await del(new Types.ObjectId());
      expect(res.status).toBe(404);
    });
  });

  describe('AC3/AC4 full erase', () => {
    it('200, every child gone, kept rows stay with the link unset, document gone', async () => {
      const doc = await makeDoc();
      const s = await seedChildren(doc._id as Types.ObjectId, 'intake-b');
      const res = await del(doc._id);
      expect(res.status).toBe(200);

      expect(await LawieDocument.countDocuments({ _id: doc._id })).toBe(0);
      expect(await childCounts(s)).toEqual({ ledger: 0, aux: 0, diff: 0, token: 0, feedback: 0 });

      const gen = await col(Generation).findOne({ _id: s.genId });
      expect(gen).not.toBeNull();
      expect(gen).not.toHaveProperty('documentId');
      const usage = await col(UsageLog).findOne({ _id: s.usageId });
      expect(usage).not.toBeNull();
      expect(usage).not.toHaveProperty('documentId');
      const tu = await col(TemplateUsage).findOne({ _id: s.tuId });
      expect(tu).not.toBeNull();
      expect(tu).not.toHaveProperty('documentId');
      const ev = await col(Event).findOne({ _id: s.eventId });
      expect(ev).not.toBeNull();
      expect(ev).not.toHaveProperty('docId');
    });

    it('a second DELETE after completion is 404', async () => {
      const doc = await makeDoc();
      expect((await del(doc._id)).status).toBe(200);
      expect((await del(doc._id)).status).toBe(404);
    });

    it('a document with no children still gives 200', async () => {
      const doc = await makeDoc();
      expect((await del(doc._id)).status).toBe(200);
    });

    it('erases the document row last (children already gone when the row is deleted)', async () => {
      const doc = await makeDoc();
      const s = await seedChildren(doc._id as Types.ObjectId, 'intake-last');
      let atRowDelete: Awaited<ReturnType<typeof childCounts>> | null = null;
      const orig = LawieDocument.deleteOne.bind(LawieDocument);
      jest.spyOn(LawieDocument, 'deleteOne').mockImplementation(((...args: unknown[]) => {
        return childCounts(s).then((c) => {
          atRowDelete = c;
          return orig(...(args as Parameters<typeof orig>));
        });
      }) as never);
      expect((await del(doc._id)).status).toBe(200);
      expect(atRowDelete).toEqual({ ledger: 0, aux: 0, diff: 0, token: 0, feedback: 0 });
      expect(await childCounts(s)).toEqual({ ledger: 0, aux: 0, diff: 0, token: 0, feedback: 0 });
    });
  });

  describe('AC2/AC4 partial run, pending, sweep', () => {
    it('a failed step gives 202, hides the doc, repeat 202 then 200, sweep finishes it', async () => {
      const doc = await makeDoc();
      const s = await seedChildren(doc._id as Types.ObjectId, 'intake-c');
      jest.spyOn(ReviewToken, 'deleteMany').mockRejectedValueOnce(new Error(SECRET_TITLE));

      const first = await del(doc._id);
      expect(first.status).toBe(202);
      expect(first.body).toEqual({ status: 'pending' });
      const pending = await LawieDocument.findById(doc._id).lean();
      expect(pending).not.toBeNull();
      expect(pending!.isDeleted).toBe(true);
      expect(pending!.deletion?.requestedAt).toBeInstanceOf(Date);

      // Document row is last: it is still there; reviewfeedbacks (before the failed step) are gone.
      expect(await col(ReviewFeedback).countDocuments({ documentId: s.docId })).toBe(0);
      expect(await col(ReviewToken).countDocuments({ documentId: s.docId })).toBe(1);

      // Repeat while pending, failing again: 202.
      jest.spyOn(ReviewToken, 'deleteMany').mockRejectedValueOnce(new Error('again'));
      expect((await del(doc._id)).status).toBe(202);

      // Now it can finish: 200.
      const third = await del(doc._id);
      expect(third.status).toBe(200);
      expect(await LawieDocument.countDocuments({ _id: doc._id })).toBe(0);
      expect((await del(doc._id)).status).toBe(404);
    });

    it('the sweep finishes a pending erase (crash mid-erase, restart)', async () => {
      const doc = await makeDoc();
      const s = await seedChildren(doc._id as Types.ObjectId, 'intake-d');
      jest.spyOn(FactLedgerModel, 'deleteMany').mockRejectedValueOnce(new Error('boom'));
      expect((await del(doc._id)).status).toBe(202);
      // The ledger links were saved on the marker before the step that failed.
      const marked = await LawieDocument.findById(doc._id).lean();
      expect(marked!.deletion!.intakeIds).toContain('intake-d');
      expect(marked!.deletion!.ledgerIds.map(String)).toContain(String(s.ledgerId));
      // The FactDiff (which carried ledgerId) is already gone; the ledger must still be found.
      expect(await col(FactDiff).countDocuments({ documentId: s.docId })).toBe(0);

      const counts = await runDocumentEraseSweep();
      expect(counts).toEqual({ found: 1, finished: 1, pending: 0 });
      expect(await LawieDocument.countDocuments({ _id: doc._id })).toBe(0);
      expect(await childCounts(s)).toEqual({ ledger: 0, aux: 0, diff: 0, token: 0, feedback: 0 });
      expect(await runDocumentEraseSweep()).toEqual({ found: 0, finished: 0, pending: 0 });
    });

    it('the sweep reports a still-failing erase as pending', async () => {
      const doc = await makeDoc();
      jest.spyOn(UsageLog, 'updateMany').mockRejectedValue(new Error('boom'));
      expect((await del(doc._id)).status).toBe(202);
      expect(await runDocumentEraseSweep()).toEqual({ found: 1, finished: 0, pending: 1 });
      expect(await LawieDocument.countDocuments({ _id: doc._id })).toBe(1);
    });

    it('eraseDocument reports the failing collection and ignores a bad id', async () => {
      expect(await eraseDocument('not-an-id')).toEqual({ done: true, counts: {} });
      const doc = await makeDoc();
      await LawieDocument.updateOne(
        { _id: doc._id },
        { $set: { isDeleted: true, 'deletion.requestedAt': new Date() } },
      );
      jest.spyOn(Event, 'updateMany').mockRejectedValueOnce(new Error('boom'));
      const r = await eraseDocument(String(doc._id));
      expect(r.done).toBe(false);
      expect(r.failedAt).toBe('events');
    });

    it('a mark failure is 500, not 202', async () => {
      const doc = await makeDoc();
      jest.spyOn(LawieDocument, 'findOneAndUpdate').mockImplementationOnce((() => {
        throw new Error('db down');
      }) as never);
      const res = await del(doc._id);
      expect(res.status).toBe(500);
    });
  });

  describe('AC2 hidden while pending', () => {
    it('list, detail and export paths 404 or omit', async () => {
      const doc = await makeDoc();
      const keep = await makeDoc(OWNER, 'Another live doc');
      jest.spyOn(Event, 'updateMany').mockRejectedValue(new Error('boom'));
      expect((await del(doc._id)).status).toBe(202);

      const list = await request(app).get('/').set(headers());
      expect(list.status).toBe(200);
      const ids = (list.body.documents as { _id: string }[]).map((d) => d._id);
      expect(ids).toContain(String(keep._id));
      expect(ids).not.toContain(String(doc._id));

      expect((await request(app).get(`/${doc._id}`).set(headers())).status).toBe(404);
      for (const p of ['export/pdf', 'export/docx', 'annexures-pack']) {
        const r = await request(app).post(`/${doc._id}/${p}`).set(headers()).send({});
        expect(r.status).toBe(404);
      }
    });
  });

  describe('AC3 shared ledger guard', () => {
    it('a second live document on the same intake keeps its FactLedger and LlmAuxCall', async () => {
      const a = await makeDoc();
      const b = await makeDoc(OWNER, 'Second doc');
      const intakeId = 'intake-shared';
      const sa = await seedChildren(a._id as Types.ObjectId, intakeId);
      // b: same intake, its own generation row
      await col(Generation).insertOne({ documentId: b._id, intakeId });

      expect((await del(a._id)).status).toBe(200);

      expect(await col(FactLedgerModel).countDocuments({ _id: sa.ledgerId })).toBe(1);
      expect(await col(LlmAuxCall).countDocuments({ intakeId })).toBe(1);
      expect(await LawieDocument.countDocuments({ _id: b._id })).toBe(1);
      // a's own rows are gone
      expect(await col(ReviewToken).countDocuments({ documentId: a._id })).toBe(0);
      expect(await col(FactDiff).countDocuments({ documentId: a._id })).toBe(0);

      // Now b goes: the shared rows go with the last document.
      expect((await del(b._id)).status).toBe(200);
      expect(await col(FactLedgerModel).countDocuments({ _id: sa.ledgerId })).toBe(0);
      expect(await col(LlmAuxCall).countDocuments({ intakeId })).toBe(0);
    });

    it("a ledger that another live document's FactDiff points at is kept", async () => {
      const a = await makeDoc();
      const b = await makeDoc(OWNER, 'Second doc');
      const s = await seedChildren(a._id as Types.ObjectId, 'intake-e');
      await col(FactDiff).insertOne({
        documentId: b._id,
        ledgerId: s.ledgerId,
        userId: new Types.ObjectId(OWNER),
      });
      expect((await del(a._id)).status).toBe(200);
      expect(await col(FactLedgerModel).countDocuments({ _id: s.ledgerId })).toBe(1);
      expect(await col(FactDiff).countDocuments({ documentId: b._id })).toBe(1);
    });
  });

  describe('AC6 sweep timer', () => {
    it('start runs once immediately, again on the interval, is idempotent, and stop works', async () => {
      jest.useFakeTimers();
      const chain = {
        select: () => chain,
        sort: () => chain,
        limit: () => chain,
        lean: () => Promise.resolve([]),
      };
      const find = jest.spyOn(LawieDocument, 'find').mockImplementation((() => chain) as never);
      startDocumentEraseSweep(1000);
      startDocumentEraseSweep(1000); // no-op
      expect(find).toHaveBeenCalledTimes(1);

      // let the first run settle (promise microtasks), then tick the interval
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await jest.advanceTimersByTimeAsync(1000);
      expect(find.mock.calls.length).toBeGreaterThanOrEqual(2);
      const n = find.mock.calls.length;

      stopDocumentEraseSweep();
      await jest.advanceTimersByTimeAsync(5000);
      expect(find).toHaveBeenCalledTimes(n);
      stopDocumentEraseSweep(); // safe twice
    });

    it('a failing sweep run is logged by name only and does not throw', async () => {
      jest.useFakeTimers();
      const warn = jest.spyOn(logger, 'warn').mockImplementation((() => undefined) as never);
      jest.spyOn(LawieDocument, 'find').mockImplementation((() => {
        throw new Error(SECRET_TITLE);
      }) as never);
      startDocumentEraseSweep(1000);
      await jest.advanceTimersByTimeAsync(10);
      expect(warn).toHaveBeenCalled();
      expect(logged(warn)).not.toContain('SECRET-TITLE');
      expect(logged(warn)).toContain('Error');
    });
  });

  describe('AC7 logs', () => {
    it('carry no title, content or field value, on success or failure', async () => {
      const info = jest.spyOn(logger, 'info');
      const warn = jest.spyOn(logger, 'warn');
      const error = jest.spyOn(logger, 'error');
      const debug = jest.spyOn(logger, 'debug');

      const ok = await makeDoc();
      await seedChildren(ok._id as Types.ObjectId, 'intake-log-ok');
      expect((await del(ok._id)).status).toBe(200);

      const bad = await makeDoc();
      await seedChildren(bad._id as Types.ObjectId, 'intake-log-bad');
      jest
        .spyOn(ReviewFeedback, 'deleteMany')
        .mockRejectedValueOnce(new Error(`${SECRET_TITLE} ${SECRET_CONTENT}`));
      expect((await del(bad._id)).status).toBe(202);
      await runDocumentEraseSweep();

      const out = logged(info, warn, error, debug);
      expect(out).not.toContain('SECRET-TITLE');
      expect(out).not.toContain('SECRET-CONTENT');
      expect(out).not.toContain('Zorblax');
      expect(out).not.toContain('Wibblefoot');
      expect(out).not.toContain('intake-log'); // no field values, even intake ids' strings
      // The failure was logged with the error name and the collection.
      expect(out).toContain('reviewfeedbacks');
      expect(out).toContain('"Error"');
      expect(warn).toHaveBeenCalled();
    });

    it('a mark failure is logged by name only', async () => {
      const error = jest.spyOn(logger, 'error').mockImplementation((() => undefined) as never);
      const doc = await makeDoc();
      jest.spyOn(LawieDocument, 'findOneAndUpdate').mockImplementationOnce((() => {
        throw new Error(SECRET_TITLE);
      }) as never);
      expect((await del(doc._id)).status).toBe(500);
      expect(logged(error)).not.toContain('SECRET-TITLE');
    });
  });
});
