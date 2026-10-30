/**
 * T-684b item 8 - scripts/migrate-model-settings.ts --apply must leave an existing row completely
 * untouched (no updatedAt bump), and a newly copied row must get Date createdAt/updatedAt.
 *
 * The script runs as a child process against a mongodb-memory-server (URI only in the child's env).
 * To reach the "appeared meanwhile" branch, a preload (written to a temp dir at run time) makes the
 * first findOne for the target role key resolve null, while the row really exists in the DB, which
 * is exactly the state of a row inserted between the check and the write.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { tmpdir } from 'os';
import { join } from 'path';

import { AppSetting } from '../models/AppSetting.model';

const DRAFTING_DIR = join(__dirname, '..', '..');
const SCRIPT = join('scripts', 'migrate-model-settings.ts');
const TS_NODE = require.resolve('ts-node/dist/bin.js');
const MONGOOSE_PATH = require.resolve('mongoose', { paths: [DRAFTING_DIR] });

const LEGACY_KEY = 'ai.drafting_model';
const ROLE_KEY = 'ai.model.drafter';
const LEGACY_VALUE = 'LEGACY-VALUE-t684b';
const RACE_VALUE = 'RACE-WINNER-VALUE-t684b';
const PAST_CREATED = new Date('2020-01-02T03:04:05.000Z');
const PAST_UPDATED = new Date('2021-06-07T08:09:10.000Z');

let mongod: MongoMemoryServer;
let uri: string;
let tmpDir: string;
let preload: string;

function runScript(
  args: string[],
  withRacePreload = false,
): { status: number | null; out: string } {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TS_NODE_TRANSPILE_ONLY: 'true',
    MONGO_URI: uri,
  };
  const nodeArgs = withRacePreload ? ['-r', preload] : [];
  const r = spawnSync(
    process.execPath,
    [...nodeArgs, TS_NODE, '--transpile-only', SCRIPT, ...args],
    { cwd: DRAFTING_DIR, env, encoding: 'utf8', timeout: 150_000 },
  );
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Raw insert: bypasses Mongoose timestamps so the past dates are kept. */
async function rawInsert(doc: Record<string, unknown>): Promise<void> {
  await AppSetting.collection.insertOne(doc);
}

async function raw(key: string): Promise<Record<string, unknown> | null> {
  return AppSetting.collection.findOne({ key });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  uri = mongod.getUri();
  await mongoose.connect(uri);
  await AppSetting.syncIndexes();
  tmpDir = mkdtempSync(join(tmpdir(), 't684b-'));
  preload = join(tmpDir, 'race-preload.js');
  writeFileSync(
    preload,
    `const mongoose = require(${JSON.stringify(MONGOOSE_PATH)});
const orig = mongoose.Model.findOne;
let used = false;
mongoose.Model.findOne = function (filter, ...rest) {
  if (!used && filter && filter.key === ${JSON.stringify(ROLE_KEY)}) {
    used = true;
    return { lean: async () => null };
  }
  return orig.call(this, filter, ...rest);
};
`,
  );
}, 90_000);

afterEach(async () => {
  await AppSetting.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('migrate-model-settings: no updatedAt bump (T-684b item 8)', () => {
  it('a row that appears between the check and the write is left completely unchanged', async () => {
    await AppSetting.create({ key: LEGACY_KEY, value: LEGACY_VALUE });
    await rawInsert({
      key: ROLE_KEY,
      value: RACE_VALUE,
      description: 'race winner description',
      updatedBy: 'race-user',
      createdAt: PAST_CREATED,
      updatedAt: PAST_UPDATED,
    });
    const before = await raw(ROLE_KEY);

    const r = runScript(['--apply'], true);

    expect(r.status).toBe(0);
    expect(r.out).toContain(`${ROLE_KEY}: appeared meanwhile, left as it is`);
    expect(r.out).not.toContain(`${LEGACY_KEY} -> ${ROLE_KEY}: copied`);
    expect(r.out).toContain('Copied 0; role key already set 1; legacy key not set 2');
    const after = await raw(ROLE_KEY);
    expect(after).toEqual(before);
    expect(after?.value).toBe(RACE_VALUE);
    expect(after?.description).toBe('race winner description');
    expect(after?.updatedBy).toBe('race-user');
    expect((after?.createdAt as Date).getTime()).toBe(PAST_CREATED.getTime());
    expect((after?.updatedAt as Date).getTime()).toBe(PAST_UPDATED.getTime());
  }, 180_000);

  it('a newly copied row gets createdAt and updatedAt as Dates close to now', async () => {
    await AppSetting.create({ key: LEGACY_KEY, value: LEGACY_VALUE });
    const t0 = Date.now();
    const r = runScript(['--apply']);
    const t1 = Date.now();

    expect(r.status).toBe(0);
    expect(r.out).toContain(`${LEGACY_KEY} -> ${ROLE_KEY}: copied`);
    const row = await raw(ROLE_KEY);
    expect(row?.value).toBe(LEGACY_VALUE);
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.updatedAt).toBeInstanceOf(Date);
    for (const f of ['createdAt', 'updatedAt'] as const) {
      const t = (row?.[f] as Date).getTime();
      expect(t).toBeGreaterThanOrEqual(t0 - 2000);
      expect(t).toBeLessThanOrEqual(t1 + 2000);
    }
  }, 180_000);

  it('a role key seen by the first check ("already set") keeps all fields and timestamps', async () => {
    await AppSetting.create({ key: LEGACY_KEY, value: LEGACY_VALUE });
    await rawInsert({
      key: ROLE_KEY,
      value: RACE_VALUE,
      createdAt: PAST_CREATED,
      updatedAt: PAST_UPDATED,
    });
    const before = await raw(ROLE_KEY);

    const r = runScript(['--apply']);

    expect(r.status).toBe(0);
    expect(r.out).toContain(`${ROLE_KEY}: already set, left as it is`);
    expect(await raw(ROLE_KEY)).toEqual(before);
  }, 180_000);
});
