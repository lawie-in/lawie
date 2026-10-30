/**
 * T-685 (Arjun §12.2): `v3_runs` docs go with the document (document-erase, by the intake ids only
 * that document reaches) and with the account (account-erase, by userId). Fictional users and intakes.
 */
import '../setupDb';
import mongoose, { Types } from 'mongoose';

import request from 'supertest';

import app from '../../app';
import redis from '../../config/redis';
import { LawieDocument } from '../../models/Document.model';
import { Generation } from '../../models/Generation.model';
import { eraseAccount } from '../../services/account-erase.service';
import { V3RunModel } from '../../services/v3/run.model';
import { encrypt } from '../../utils/encryption';

const OWNER = '507f1f77bcf86cd799439695';
const OTHER = '507f1f77bcf86cd799439696';
const headers = (userId = OWNER) => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': userId,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
/** DELETE /:id marks the document and runs the erase (the erase only runs for a marked one). */
const del = async (d: { _id: unknown }) =>
  expect(
    (
      await request(app)
        .delete(`/${String(d._id)}`)
        .set(headers())
    ).status,
  ).toBe(200);
const col = (m: { collection: mongoose.Collection }) => m.collection;

beforeAll(async () => {
  await V3RunModel.init();
});
beforeEach(async () => {
  await redis.flushall();
});

const run = (userId: string, intakeId: string) =>
  V3RunModel.create({
    intakeId,
    userId,
    stage: 2,
    ledgerStore: 'v3',
    ledgerId: new Types.ObjectId().toString(),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
const runCount = (filter: object = {}) => V3RunModel.countDocuments(filter);
const doc = (userId = OWNER) =>
  LawieDocument.create({
    userId,
    title: 'Fictional v. Fictional (T-685)',
    docType: 'bail_application',
    generatedContent: encrypt('content'),
  });

describe('document-erase deletes v3_runs by intakeId', () => {
  it("the run of the document's intake goes; an unrelated intake's run stays", async () => {
    const d = await doc();
    await col(Generation).insertOne({ documentId: d._id, intakeId: 'in-d1' });
    await run(OWNER, 'in-d1');
    await run(OWNER, 'in-unrelated');
    await del(d);
    expect(await runCount({ intakeId: 'in-d1' })).toBe(0);
    expect(await runCount({ intakeId: 'in-unrelated' })).toBe(1);
  });

  it('an intake another live document reaches keeps its run; a document with no intake touches none', async () => {
    const a = await doc();
    const b = await doc();
    const none = await doc();
    await col(Generation).insertMany([
      { documentId: a._id, intakeId: 'in-shared' },
      { documentId: b._id, intakeId: 'in-shared' },
    ]);
    await run(OWNER, 'in-shared');
    await del(none);
    expect(await runCount()).toBe(1);
    await del(a);
    expect(await runCount({ intakeId: 'in-shared' })).toBe(1);
    await del(b);
    expect(await runCount({ intakeId: 'in-shared' })).toBe(0);
  });
});

describe('account-erase deletes v3_runs by userId', () => {
  it("the user's runs go, other users' runs stay", async () => {
    await run(OWNER, 'in-a1');
    await run(OWNER, 'in-a2');
    await run(OTHER, 'in-o1');
    await eraseAccount({ userId: OWNER });
    expect(await runCount({ userId: new Types.ObjectId(OWNER) })).toBe(0);
    expect(await runCount({ userId: new Types.ObjectId(OTHER) })).toBe(1);
  });

  it('a dry run deletes nothing', async () => {
    await run(OWNER, 'in-a1');
    await eraseAccount({ userId: OWNER, dryRun: true });
    expect(await runCount()).toBe(1);
  });
});
