/**
 * T-250 / T-255 - a real run of scripts/seed-sections.ts against an in-memory
 * MongoDB: repealed_no_equivalent rows are accepted, and CrPC rows (which use
 * `note`, singular) get their notes.
 */
import './setupEnv';
import { execFile } from 'child_process';
import path from 'path';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { SectionMapping } from '../models/SectionMapping.model';

const ROOT = path.join(__dirname, '..', '..');
const TS_NODE = path.join(ROOT, '..', '..', 'node_modules', '.bin', 'ts-node');

let mongo: MongoMemoryServer;

const runSeed = (uri: string): Promise<{ code: number | null; out: string }> =>
  new Promise((resolve) => {
    execFile(
      TS_NODE,
      ['--transpile-only', path.join(ROOT, 'src', 'scripts', 'seed-sections.ts')],
      { cwd: ROOT, env: { ...process.env, MONGO_URI: uri, NODE_ENV: 'test' }, timeout: 150_000 },
      (err, stdout, stderr) => {
        resolve({ code: err ? 1 : 0, out: `${stdout}\n${stderr}` });
      },
    );
  });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);
  await mongoose.connection.syncIndexes();
  const res = await runSeed(uri);
  if (res.code !== 0) throw new Error(`seed failed: ${res.out}`);
}, 240_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('seed-sections.ts (real run)', () => {
  it('seeds IEA 166 as repealed_no_equivalent with no BSA section', async () => {
    const row = await SectionMapping.findOne({
      oldCode: 'IEA',
      oldSection: '166',
      isNewProvision: false,
    });
    expect(row).not.toBeNull();
    expect(row?.mappingType).toBe('repealed_no_equivalent');
    expect(row?.newSection).toBeNull();
  });

  it('seeds all six IEA repealed_no_equivalent rows', async () => {
    const rows = await SectionMapping.find({
      oldCode: 'IEA',
      mappingType: 'repealed_no_equivalent',
    });
    expect(rows.map((r) => r.oldSection).sort()).toEqual(['113', '166', '2', '22A', '82', '88']);
  });

  it('seeds IEA 32 -> BSA 26 and IEA 45 -> BSA 39(1)', async () => {
    const a = await SectionMapping.findOne({
      oldCode: 'IEA',
      oldSection: '32',
      isNewProvision: false,
    });
    const b = await SectionMapping.findOne({
      oldCode: 'IEA',
      oldSection: '45',
      isNewProvision: false,
    });
    expect(a?.newSection).toBe('26');
    expect(b?.newSection).toBe('39(1)');
  });

  it('seeds 535 CrPC rows and 9 BNSS new provisions', async () => {
    expect(await SectionMapping.countDocuments({ oldCode: 'CrPC', isNewProvision: false })).toBe(
      535,
    );
    expect(await SectionMapping.countDocuments({ oldCode: 'CrPC', isNewProvision: true })).toBe(9);
  });

  it('CrPC rows get notes from the singular `note` field', async () => {
    const row = await SectionMapping.findOne({
      oldCode: 'CrPC',
      oldSection: '10',
      isNewProvision: false,
    });
    expect(row?.notes).toBe(
      'Deleted in BNSS (UP Police correspondence table: Deleted; no BNSS section)',
    );
  });

  it('IEA rows keep notes from `notes`', async () => {
    const row = await SectionMapping.findOne({
      oldCode: 'IEA',
      oldSection: '3',
      isNewProvision: false,
    });
    expect(row?.notes).toContain('Gazette BSA 2(1) contains the definitions');
  });

  it('seeds BNSS 173(3) as the preliminary enquiry', async () => {
    const row = await SectionMapping.findOne({
      newCode: 'BNSS',
      newSection: '173(3)',
      isNewProvision: true,
    });
    expect(row?.newTitle).toMatch(/^Preliminary enquiry within fourteen days/);
  });

  describe('validation fields (Ajay r3)', () => {
    const IEA_BY =
      'Ajay (CLO) - 2026-10-12 - corrected table (T-250); every row checked against the Gazette headings of the BSA and two comparison tables';
    const IPC_BY =
      'Ajay (CLO) - 2026-10-12 - corrected table (T-267); every row checked against the Gazette headings of the BNS and two comparison tables';
    const CRPC_BY =
      'Ajay (CLO) - 2026-10-12 - corrected table (T-255); every row checked against the Gazette headings of the BNSS and two comparison tables';
    const DAY = new Date('2026-10-12').getTime();

    it('every IPC row (mappings and new provisions) carries the T-267 validatedBy and 2026-10-12; none is Pending', async () => {
      const rows = await SectionMapping.find({ oldCode: 'IPC' });
      expect(rows.length).toBeGreaterThan(500);
      for (const r of rows) {
        expect(r.validatedBy).toBe(IPC_BY);
        expect(r.validatedAt?.getTime()).toBe(DAY);
      }
      expect(
        await SectionMapping.countDocuments({ oldCode: 'IPC', validatedBy: 'Pending CLO review' }),
      ).toBe(0);
    });

    it('the old IPC "completed 2026-05-10" string is never seeded', async () => {
      expect(await SectionMapping.countDocuments({ validatedBy: /completed 2026-05-10/ })).toBe(0);
      expect(await SectionMapping.countDocuments({ validatedBy: /Batch 2a/ })).toBe(0);
    });

    it('every IEA row (mappings and new provisions) carries the signed validatedBy and 2026-10-12', async () => {
      const rows = await SectionMapping.find({ oldCode: 'IEA' });
      expect(rows.length).toBeGreaterThanOrEqual(185);
      for (const r of rows) {
        expect(r.validatedBy).toBe(IEA_BY);
        expect(r.validatedAt?.getTime()).toBe(DAY);
      }
    });

    it('every CrPC row (mappings and new provisions) carries the signed validatedBy and 2026-10-12', async () => {
      const rows = await SectionMapping.find({ oldCode: 'CrPC' });
      expect(rows).toHaveLength(535 + 9);
      for (const r of rows) {
        expect(r.validatedBy).toBe(CRPC_BY);
        expect(r.validatedAt?.getTime()).toBe(DAY);
      }
    });
  });

  describe('notes (Ajay r4)', () => {
    it('repealed IEA rows take notes from new_law_status', async () => {
      const row = await SectionMapping.findOne({
        oldCode: 'IEA',
        oldSection: '166',
        isNewProvision: false,
      });
      expect(row?.notes).toBe(
        'Project 39A Note: "Section 166: Power of jury or assessors to put questions" deleted; insaaf "---"; BSA 168 is the Judge-only power (IEA 165).',
      );
      const two = await SectionMapping.findOne({
        oldCode: 'IEA',
        oldSection: '2',
        isNewProvision: false,
      });
      expect(two?.notes).toContain('BSA 170 repeals only the IEA itself');
    });

    it('a non-repealed_no_equivalent row without notes gets empty notes, not new_law_status', async () => {
      const row = await SectionMapping.findOne({
        oldCode: 'IPC',
        oldSection: '1',
        isNewProvision: false,
      });
      expect(row).not.toBeNull();
      expect(row?.notes ?? '').not.toMatch(/new_law_status/);
    });
  });
});
