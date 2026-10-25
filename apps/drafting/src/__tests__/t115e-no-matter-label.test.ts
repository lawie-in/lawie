/**
 * T-115e — demand-signal events store no matter label; the category is a fixed
 * value from DEMAND_CATEGORIES. Covers the intake write (AC1, AC3, AC4) and the
 * one-off script src/scripts/unset-event-labels.ts (AC2), which is spawned with
 * ts-node against the in-memory MongoDB. Nothing runs against a real database.
 */
import './setupDb';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import request from 'supertest';

import app from '../app';
import { seedVerifiedUsers } from './verifiedUser';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Event } from '../models/Event.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { DEMAND_CATEGORIES } from '../services/intake.service';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(180_000);

const MODEL = 'claude-haiku-4-5-20251001';
const USER_ID = '507f1f77bcf86cd799439071';
const DESCRIPTION =
  'I need a document drafted for a dispute with my neighbour about a boundary wall.';
const NAME_LABEL = 'Bail for Ram Kumar';

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

const reply = (extra: Record<string, unknown>) =>
  JSON.stringify({
    template_id: null,
    confidence: 'low',
    alternatives: [],
    is_legal_drafting: true,
    is_court_document: false,
    label: NAME_LABEL,
    category: 'criminal',
    ...extra,
  });

async function intake(modelReply: string) {
  mockMessagesStream.mockReset();
  mockMessagesStream.mockResolvedValueOnce(sdkAnswer(modelReply, 900, 120));
  const res = await request(app).post('/intake').set(headers()).send({ description: DESCRIPTION });
  expect(res.status).toBe(200);
  return res;
}

beforeEach(async () => {
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
  });
});

describe('T-115e intake: no label in demand events', () => {
  it('demand.no_template: a reply with a name-bearing label stores only the category', async () => {
    await intake(reply({}));
    const ev = await Event.findOne({ type: 'demand.no_template' }).lean();
    expect(ev).not.toBeNull();
    expect(ev!.metadata).not.toHaveProperty('label');
    expect(ev!.metadata).toMatchObject({ category: 'criminal', isCourtDocument: false });
    expect(JSON.stringify(ev)).not.toContain('Ram Kumar');
  });

  it('demand.no_match: a reply with a name-bearing label stores only the category', async () => {
    await intake(reply({ template_id: 'invented_template', confidence: 'high' }));
    const ev = await Event.findOne({ type: 'demand.no_match' }).lean();
    expect(ev).not.toBeNull();
    expect(ev!.metadata).not.toHaveProperty('label');
    expect(ev!.metadata).toMatchObject({ category: 'criminal', reason: 'unknown_template' });
    expect(JSON.stringify(ev)).not.toContain('Ram Kumar');
  });

  it.each([
    ['an off-list category', { category: 'Ram Kumar theft' }, 'other'],
    ['a mixed-case category with a space', { category: 'Criminal ' }, 'criminal'],
    ['a missing category', { category: undefined }, 'other'],
    ['a non-string category', { category: 42 }, 'other'],
  ])('%s is stored as the list value', async (_n, extra, expected) => {
    await intake(reply(extra));
    const ev = await Event.findOne({ type: 'demand.no_template' }).lean();
    expect((ev!.metadata as { category: unknown }).category).toBe(expected);
    expect(JSON.stringify(ev)).not.toContain('Ram Kumar');
  });

  it('an unparseable reply stores a null category', async () => {
    await intake('this is not json');
    const ev = await Event.findOne({ type: /^demand\./ }).lean();
    expect(ev).not.toBeNull();
    expect((ev!.metadata as { category: unknown }).category).toBeNull();
    expect(ev!.metadata).not.toHaveProperty('label');
  });
});

describe('T-115e: the category list', () => {
  const scriptSrc = readFileSync(
    path.join(__dirname, '..', 'scripts', 'unset-event-labels.ts'),
    'utf8',
  );
  const listIn = (src: string, re: RegExp): string[] => {
    const m = src.match(re);
    expect(m).not.toBeNull();
    return Array.from(m![1].matchAll(/'([a-z]+)'/g), (x) => x[1]);
  };

  it("the script's copy equals DEMAND_CATEGORIES", () => {
    expect(listIn(scriptSrc, /const DEMAND_CATEGORIES = \[([^\]]*)\]/)).toEqual([
      ...DEMAND_CATEGORIES,
    ]);
  });

  it('the match prompt names the same categories', () => {
    const prompts = readFileSync(
      path.join(__dirname, '..', 'services', 'intake.prompts.ts'),
      'utf8',
    );
    const m = prompts.match(/- category: one word guess such as ([^.\n]*)\./);
    expect(m).not.toBeNull();
    const named = m![1].split(',').map((s) => s.trim());
    expect(named).toEqual([...DEMAND_CATEGORIES]);
  });
});

// ── The script ──────────────────────────────────────────────────────────────

const SCRIPT = path.join(__dirname, '..', 'scripts', 'unset-event-labels.ts');
const DRAFTING_DIR = path.join(__dirname, '..', '..');
const TS_NODE = require.resolve('ts-node/dist/bin.js');
const uri = () =>
  `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
const events = () => mongoose.connection.db!.collection('events');

function runScript(args: string[]) {
  const r = spawnSync(
    process.execPath,
    [
      TS_NODE,
      '--transpile-only',
      '--project',
      path.join(DRAFTING_DIR, 'tsconfig.json'),
      SCRIPT,
      ...args,
    ],
    {
      cwd: DRAFTING_DIR,
      encoding: 'utf8',
      timeout: 150_000,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        NODE_ENV: 'test',
        MONGO_URI: uri(),
        REDIS_URL: 'redis://localhost:6379',
        INTERNAL_SECRET: 'test-internal-secret-at-least-16',
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? '',
        LOG_LEVEL: 'error',
      },
    },
  );
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

const SECRET_LABEL = 'Zorbaxx Quillfeather bail';
const uid = new mongoose.Types.ObjectId(USER_ID);
const row = (type: string, metadata: Record<string, unknown>) => ({
  userId: uid,
  type,
  metadata,
  runType: 'user',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

async function seed() {
  const r = await events().insertMany([
    row('demand.no_template', { intakeId: 'a', label: SECRET_LABEL, category: 'criminal' }),
    row('demand.no_match', { intakeId: 'b', label: SECRET_LABEL, category: 'Ram Kumar theft' }),
    row('demand.no_template', { intakeId: 'c', category: 'Qwertyuiop' }),
    row('demand.no_match', { intakeId: 'd', category: null }),
    row('demand.no_template', { intakeId: 'e', category: 'family' }),
    row('draft.exported', { label: SECRET_LABEL, category: 'odd category' }),
  ]);
  return Object.values(r.insertedIds);
}

const cat = async (intakeId: string) =>
  ((await events().findOne({ 'metadata.intakeId': intakeId })) as any).metadata;

describe('T-115e script: unset-event-labels', () => {
  it('no args exits 2 and both flags exit 2', () => {
    expect(runScript([]).status).toBe(2);
    expect(runScript(['--dry-run', '--yes']).status).toBe(2);
  });

  it('--dry-run prints counts and changes nothing', async () => {
    await seed();
    const before = await events().find({}).sort({ _id: 1 }).toArray();
    const r = runScript(['--dry-run']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('events with metadata.label: 3');
    expect(r.out).toContain('not on the list: 2');
    expect(r.out).not.toContain(SECRET_LABEL);
    expect(await events().find({}).sort({ _id: 1 }).toArray()).toEqual(before);
  });

  it('--yes unsets labels, fixes off-list demand categories, leaves the rest; a second run changes nothing', async () => {
    await seed();
    const r = runScript(['--yes']);
    expect(r.status).toBe(0);
    expect(r.out).not.toContain(SECRET_LABEL);
    expect(r.out).not.toContain('Ram Kumar');

    expect(await cat('a')).toEqual({ intakeId: 'a', category: 'criminal' });
    expect(await cat('b')).toEqual({ intakeId: 'b', category: 'other' });
    expect(await cat('c')).toEqual({ intakeId: 'c', category: 'other' });
    expect(await cat('d')).toEqual({ intakeId: 'd', category: null });
    expect(await cat('e')).toEqual({ intakeId: 'e', category: 'family' });
    // A non-demand event keeps its category; only its label is unset.
    const other = (await events().findOne({ type: 'draft.exported' })) as any;
    expect(other.metadata).toEqual({ category: 'odd category' });
    expect(await events().countDocuments({ 'metadata.label': { $exists: true } })).toBe(0);

    const after = await events().find({}).sort({ _id: 1 }).toArray();
    const r2 = runScript(['--yes']);
    expect(r2.status).toBe(0);
    expect(r2.out).toContain('matched=0');
    expect(await events().find({}).sort({ _id: 1 }).toArray()).toEqual(after);
  });
});

seedVerifiedUsers('507f1f77bcf86cd799439071');
