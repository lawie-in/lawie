/**
 * T-682 (Arjun Q5): `factledgers_v3` rows go with the account (account-erase) and with the document
 * (document-erase, through the intake ids only that document reaches). The existing erase suites
 * (t115b, t115c) are run unchanged next to this one. Fictional users and intakes.
 */
import '../setupDb';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';

import app from '../../app';
import redis from '../../config/redis';
import { LawieDocument } from '../../models/Document.model';
import { FactLedgerModel } from '../../models/FactLedger.model';
import { FactLedgerV3Model } from '../../models/FactLedgerV3.model';
import { Generation } from '../../models/Generation.model';
import { eraseAccount } from '../../services/account-erase.service';
import { eraseDocument } from '../../services/document-erase.service';
import * as L from '../../services/v3/ledger.service';
import { encrypt } from '../../utils/encryption';
import { ARREST, CUSTODY, DESC_CALM, PACK, readDescription } from './t682-helpers';

const OWNER = '507f1f77bcf86cd799439691';
const OTHER = '507f1f77bcf86cd799439692';
const headers = (userId = OWNER) => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': userId,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
const col = (m: { collection: mongoose.Collection }) => m.collection;

beforeAll(async () => {
  await FactLedgerV3Model.init();
});
beforeEach(async () => {
  await redis.flushall();
});

/** A v3 ledger with a real sealed version for a user on an intake. */
async function v3(userId: string, intakeId: string, runId = `${intakeId}-run`) {
  const s = await L.createLedger({ runId, userId, packId: PACK, intakeId });
  await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()], userId);
  return s;
}
const count = (filter: object = {}) => FactLedgerV3Model.countDocuments(filter);
const doc = (userId = OWNER) =>
  LawieDocument.create({
    userId,
    title: 'Fictional v. Fictional (T-682)',
    docType: 'bail_application',
    generatedContent: encrypt('content'),
  });

describe('account erase deletes factledgers_v3 rows', () => {
  it("the user's rows go, other users' rows stay", async () => {
    await v3(OWNER, 'in-a1');
    await v3(OWNER, 'in-a2');
    await v3(OTHER, 'in-o1');
    expect(await count()).toBe(3);
    const res = await eraseAccount({ userId: OWNER });
    expect(res.counts.factledgers_v3).toBe(2);
    expect(await count({ userId: new Types.ObjectId(OWNER) })).toBe(0);
    expect(await count({ userId: new Types.ObjectId(OTHER) })).toBe(1);
  });

  it('a dry run counts them and deletes nothing', async () => {
    await v3(OWNER, 'in-a1');
    const res = await eraseAccount({ userId: OWNER, dryRun: true });
    expect(res.counts.factledgers_v3).toBe(1);
    expect(await count()).toBe(1);
  });

  it('v2 ledgers and v3 ledgers are each counted under their own step', async () => {
    await v3(OWNER, 'in-a1');
    await col(FactLedgerModel).insertOne({ intakeId: 'in-v2', userId: new Types.ObjectId(OWNER) });
    const res = await eraseAccount({ userId: OWNER });
    expect(res.counts.factledgers).toBe(1);
    expect(res.counts.factledgers_v3).toBe(1);
  });

  it('the intake ids of v3 ledgers reach the Redis intake keys that go with the account', async () => {
    await v3(OWNER, 'in-v3-only');
    await v3(OTHER, 'in-other');
    await redis.mset(
      'intake:owner:in-v3-only',
      'x',
      'intake:followups:in-v3-only',
      '1',
      'intake:owner:in-other',
      'x',
    );
    await eraseAccount({ userId: OWNER });
    expect(await redis.exists('intake:owner:in-v3-only', 'intake:followups:in-v3-only')).toBe(0);
    expect(await redis.exists('intake:owner:in-other')).toBe(1);
  });

  it('the erase route (POST /internal/erase-user) does the same', async () => {
    await v3(OWNER, 'in-a1');
    await v3(OTHER, 'in-o1');
    const res = await request(app)
      .post('/internal/erase-user')
      .set('x-internal-secret', process.env.INTERNAL_SECRET!)
      .send({ userId: OWNER });
    expect(res.status).toBe(200);
    expect(await count({ userId: new Types.ObjectId(OWNER) })).toBe(0);
    expect(await count({ userId: new Types.ObjectId(OTHER) })).toBe(1);
  });
});

describe('document erase deletes factledgers_v3 rows only through erasable intake ids', () => {
  it('DELETE /:id removes the v3 ledger of its intake and leaves the unrelated one', async () => {
    const d = await doc();
    await col(Generation).insertOne({ documentId: d._id, intakeId: 'in-d1' });
    await v3(OWNER, 'in-d1');
    await v3(OWNER, 'in-unrelated');
    const res = await request(app)
      .delete(`/${String(d._id)}`)
      .set(headers());
    expect(res.status).toBe(200);
    expect(await count({ intakeId: 'in-d1' })).toBe(0);
    expect(await count({ intakeId: 'in-unrelated' })).toBe(1);
  });

  it('another live document that reaches the same intake keeps the ledger; the last one takes it', async () => {
    const a = await doc();
    const b = await doc();
    await col(Generation).insertMany([
      { documentId: a._id, intakeId: 'in-shared' },
      { documentId: b._id, intakeId: 'in-shared' },
    ]);
    await v3(OWNER, 'in-shared');
    expect(
      (
        await request(app)
          .delete(`/${String(a._id)}`)
          .set(headers())
      ).status,
    ).toBe(200);
    expect(await count({ intakeId: 'in-shared' })).toBe(1);
    expect(await LawieDocument.countDocuments({ _id: b._id })).toBe(1);
    expect(
      (
        await request(app)
          .delete(`/${String(b._id)}`)
          .set(headers())
      ).status,
    ).toBe(200);
    expect(await count({ intakeId: 'in-shared' })).toBe(0);
  });

  it('a document with no intake leaves every v3 ledger alone', async () => {
    const d = await doc();
    await v3(OWNER, 'in-x');
    expect(
      (
        await request(app)
          .delete(`/${String(d._id)}`)
          .set(headers())
      ).status,
    ).toBe(200);
    expect(await count({})).toBe(1);
  });

  it('a ledger of a v3 run whose intake the document reaches is found without a v2 ledger existing', async () => {
    const d = await doc();
    await col(Generation).insertOne({ documentId: d._id, intakeId: 'in-only-v3' });
    await v3(OWNER, 'in-only-v3');
    expect(await col(FactLedgerModel).countDocuments({})).toBe(0);
    expect(
      (
        await request(app)
          .delete(`/${String(d._id)}`)
          .set(headers())
      ).status,
    ).toBe(200);
    expect(await count({})).toBe(0);
  });

  it('it is safe to run again (the second erase finds nothing and does not fail)', async () => {
    const d = await doc();
    await col(Generation).insertOne({ documentId: d._id, intakeId: 'in-d1' });
    await v3(OWNER, 'in-d1');
    await request(app)
      .delete(`/${String(d._id)}`)
      .set(headers());
    const again = await eraseDocument(String(d._id));
    expect(again.done).toBe(true);
    expect(await count({})).toBe(0);
  });
});
