/**
 * T-684 - scripts/migrate-model-settings.ts: copies ai.drafting_model, ai.intake_model and
 * ai.preflight_model to ai.model.drafter, ai.model.extractor and ai.model.fact_checker.
 *
 * The script runs on import, so it is run as a child process (ts-node, transpile only) against
 * a mongodb-memory-server whose URI is set only in the child's env object. No real DB is
 * touched and the environment is never printed. Seeded values are made-up strings; the tests
 * assert the script output never contains one.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { join } from 'path';

import { AppSetting } from '../models/AppSetting.model';

const DRAFTING_DIR = join(__dirname, '..', '..');
const SCRIPT = join('scripts', 'migrate-model-settings.ts');
const TS_NODE = require.resolve('ts-node/dist/bin.js');

const OLD_DRAFTER = 'SECRET-OLD-DRAFTER-VALUE';
const OLD_INTAKE = 'SECRET-OLD-INTAKE-VALUE';
const OLD_PREFLIGHT = 'SECRET-OLD-PREFLIGHT-VALUE';
const EXISTING_NEW = 'SECRET-EXISTING-NEW-VALUE';
const ALL_SECRETS = [OLD_DRAFTER, OLD_INTAKE, OLD_PREFLIGHT, EXISTING_NEW];

let mongod: MongoMemoryServer;
let uri: string;

interface Run {
  status: number | null;
  out: string; // stdout + stderr
}

/** Run the script with the given args. `mongoUri` null leaves MONGO_URI out of the child's env. */
function runScript(args: string[], mongoUri: string | null = uri): Run {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    TS_NODE_TRANSPILE_ONLY: 'true',
  };
  if (mongoUri !== null) env.MONGO_URI = mongoUri;
  const r = spawnSync(process.execPath, [TS_NODE, '--transpile-only', SCRIPT, ...args], {
    cwd: DRAFTING_DIR,
    env,
    encoding: 'utf8',
    timeout: 150_000,
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

async function value(key: string): Promise<string | undefined> {
  return (await AppSetting.findOne({ key }).lean())?.value;
}

async function seedLegacy(): Promise<void> {
  await AppSetting.create({ key: 'ai.drafting_model', value: OLD_DRAFTER });
  await AppSetting.create({ key: 'ai.intake_model', value: OLD_INTAKE });
  await AppSetting.create({ key: 'ai.preflight_model', value: OLD_PREFLIGHT });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  uri = mongod.getUri();
  await mongoose.connect(uri);
  await AppSetting.syncIndexes();
}, 90_000);

afterEach(async () => {
  await AppSetting.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('migrate-model-settings: dry run (default)', () => {
  it('writes nothing, says what it would copy, prints key names and counts only', async () => {
    await seedLegacy();
    const r = runScript([]);
    expect(r.status).toBe(0);
    expect(await AppSetting.countDocuments({})).toBe(3);
    expect(await value('ai.model.drafter')).toBeUndefined();
    expect(await value('ai.model.extractor')).toBeUndefined();
    expect(await value('ai.model.fact_checker')).toBeUndefined();
    expect(r.out).toContain('Dry run');
    expect(r.out).toContain('ai.drafting_model -> ai.model.drafter: would copy');
    expect(r.out).toContain('ai.intake_model -> ai.model.extractor: would copy');
    expect(r.out).toContain('ai.preflight_model -> ai.model.fact_checker: would copy');
    expect(r.out).toContain('Would copy 3; role key already set 0; legacy key not set 0');
    for (const secret of ALL_SECRETS) expect(r.out).not.toContain(secret);
  }, 180_000);
});

describe('migrate-model-settings: --apply', () => {
  it('copies each legacy value to its role key, keeps the legacy keys, prints no value', async () => {
    await seedLegacy();
    const r = runScript(['--apply']);
    expect(r.status).toBe(0);
    expect(await value('ai.model.drafter')).toBe(OLD_DRAFTER);
    expect(await value('ai.model.extractor')).toBe(OLD_INTAKE);
    expect(await value('ai.model.fact_checker')).toBe(OLD_PREFLIGHT);
    // never deletes or changes the legacy keys
    expect(await value('ai.drafting_model')).toBe(OLD_DRAFTER);
    expect(await value('ai.intake_model')).toBe(OLD_INTAKE);
    expect(await value('ai.preflight_model')).toBe(OLD_PREFLIGHT);
    expect(await AppSetting.countDocuments({})).toBe(6);
    expect(r.out).toContain('APPLY');
    expect(r.out).toContain('Copied 3; role key already set 0; legacy key not set 0');
    for (const secret of ALL_SECRETS) expect(r.out).not.toContain(secret);
  }, 180_000);

  it('is idempotent: a second run copies nothing and changes nothing', async () => {
    await seedLegacy();
    expect(runScript(['--apply']).status).toBe(0);
    const before = await AppSetting.find({}).sort({ key: 1 }).lean();
    const r = runScript(['--apply']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('Copied 0; role key already set 3; legacy key not set 0');
    const after = await AppSetting.find({}).sort({ key: 1 }).lean();
    expect(after).toEqual(before);
  }, 240_000);

  it('never overwrites an existing role key; copies the others; never deletes the old key', async () => {
    await seedLegacy();
    await AppSetting.create({ key: 'ai.model.drafter', value: EXISTING_NEW });
    const r = runScript(['--apply']);
    expect(r.status).toBe(0);
    expect(await value('ai.model.drafter')).toBe(EXISTING_NEW);
    expect(await value('ai.drafting_model')).toBe(OLD_DRAFTER);
    expect(await value('ai.model.extractor')).toBe(OLD_INTAKE);
    expect(await value('ai.model.fact_checker')).toBe(OLD_PREFLIGHT);
    expect(r.out).toContain('Copied 2; role key already set 1; legacy key not set 0');
    expect(r.out).toContain('ai.model.drafter: already set, left as it is');
    for (const secret of ALL_SECRETS) expect(r.out).not.toContain(secret);
  }, 180_000);

  it('a legacy key that is not set copies nothing for that role', async () => {
    await AppSetting.create({ key: 'ai.intake_model', value: OLD_INTAKE });
    const r = runScript(['--apply']);
    expect(r.status).toBe(0);
    expect(await value('ai.model.extractor')).toBe(OLD_INTAKE);
    expect(await value('ai.model.drafter')).toBeUndefined();
    expect(await value('ai.model.fact_checker')).toBeUndefined();
    expect(r.out).toContain('Copied 1; role key already set 0; legacy key not set 2');
  }, 180_000);
});

describe('migrate-model-settings: refusals', () => {
  it('MONGO_URI omitted from the env, dry run: exit 2 with the message, nothing touched', async () => {
    await seedLegacy();
    const r = runScript([], null);
    expect(r.status).toBe(2);
    expect(r.out).toContain(
      'MONGO_URI is not set. Export it explicitly; this script never reads .env files. Refusing to run.',
    );
    expect(r.out).not.toContain('Connecting');
    expect(await AppSetting.countDocuments({})).toBe(3);
  }, 180_000);

  it('MONGO_URI omitted, --apply: exit 2, nothing written', async () => {
    await seedLegacy();
    const r = runScript(['--apply'], null);
    expect(r.status).toBe(2);
    expect(r.out).toContain('MONGO_URI is not set');
    expect(await AppSetting.countDocuments({})).toBe(3);
  }, 180_000);

  it.each([
    ['empty', ''],
    ['blank', '   '],
  ])(
    'MONGO_URI set to an %s string: exit 2 with the message',
    async (_n, v) => {
      await seedLegacy();
      for (const args of [[], ['--apply']]) {
        const r = runScript(args, v);
        expect(r.status).toBe(2);
        expect(r.out).toContain('MONGO_URI is not set. Export it explicitly');
        expect(r.out).not.toContain('Connecting');
      }
      expect(await AppSetting.countDocuments({})).toBe(3);
    },
    180_000,
  );

  it('refuses an unknown argument', () => {
    const r = runScript(['--delete']);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('Usage');
  }, 180_000);

  it('a bad URI: non-zero exit, prints the error name only (no host, db name or query)', () => {
    // No credentials in the fixture: an unreachable port with a short timeout.
    const badUri =
      'mongodb://127.0.0.1:1/t684db?serverSelectionTimeoutMS=300&appName=LEAKMARKER-t684';
    const r = runScript([], badUri);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/Migration failed: \w*Error\s*$/);
    for (const part of ['LEAKMARKER', 't684db', '127.0.0.1', 'mongodb://', ':1/']) {
      expect(r.out).not.toContain(part);
    }
  }, 180_000);
});

describe('migrate-model-settings: database line and no env-file reading', () => {
  it('--apply prints "Database: <name>" after connecting and before any write line; the name only', async () => {
    await seedLegacy();
    const r = runScript(['--apply']);
    expect(r.status).toBe(0);
    const lines = r.out.split('\n');
    const dbIdx = lines.findIndex((l) => l.startsWith('→ Database: '));
    expect(dbIdx).toBeGreaterThan(-1);
    expect(lines[dbIdx]).toBe(`→ Database: ${mongoose.connection.name}`);
    expect(dbIdx).toBeGreaterThan(lines.findIndex((l) => l.includes('Connecting')));
    const firstWrite = lines.findIndex((l) => l.includes(' copied') || l.includes('would copy'));
    expect(firstWrite).toBeGreaterThan(dbIdx);
    expect(r.out).not.toContain('mongodb://');
    expect(r.out).not.toContain('127.0.0.1');
    expect(r.out).not.toMatch(/localhost|:\d{4,5}/);
  }, 180_000);

  it('the dry run prints the Database line too', () => {
    const r = runScript([]);
    expect(r.status).toBe(0);
    expect(r.out).toContain(`→ Database: ${mongoose.connection.name}`);
  }, 180_000);

  it('static: the script source loads no dotenv and reads no env file', () => {
    const src = readFileSync(join(DRAFTING_DIR, SCRIPT), 'utf8');
    // comments and quoted messages are allowed to mention it; code is not
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/'[^'\n]*'/g, "''")
      .replace(/`[^`]*`/g, '``');
    expect(code).not.toMatch(/dotenv/i);
    expect(code).not.toMatch(/readFileSync|readFile\b|existsSync|createReadStream/);
    expect(code).not.toMatch(/require\(\s*['"](node:)?fs['"]|from\s+['"](node:)?fs['"]/);
    expect(src).not.toMatch(/require\(\s*['"]dotenv|from\s+['"]dotenv/);
  });
});
