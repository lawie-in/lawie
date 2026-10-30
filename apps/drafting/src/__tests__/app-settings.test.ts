/**
 * AppSetting (runtime config) tests.
 *
 * Covers:
 *   - AppSetting model: unique key, schema validation (key pattern, lengths)
 *   - app-settings.service: get/set with TTL cache, missing-key throws,
 *     set invalidates cache, multi-key isolation
 *   - Admin routes: GET/PUT auth gating + validation
 *   - End-to-end: PUT writes a value the next get returns
 */

import './setupEnv';

// Drafting uses x-internal-secret-style auth via the gateway header passthrough,
// but here we hit the routes directly — no Redis or JWT needed.
import './setupDb';

import supertest from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import {
  APP_SETTING_KEYS,
  AppSettingMissingError,
  _clearAppSettingsCache,
  getAppSetting,
  getConfigWarnings,
  insertAppSettingIfAbsent,
  listAppSettings,
  onAppSettingInvalidated,
  primeConfigWarnings,
  setAppSetting,
} from '../services/app-settings.service';

const ADMIN_HEADERS = {
  'x-internal-secret': process.env.INTERNAL_SECRET ?? 'test-internal-secret-at-least-16',
  'x-user-id': '507f1f77bcf86cd799439011',
  'x-user-email': 'founder@lawie.in',
  'x-user-role': 'Admin',
  'x-user-plan': 'free',
  'x-user-name': 'Founder',
};

const CLIENT_HEADERS = {
  ...ADMIN_HEADERS,
  'x-user-id': '507f1f77bcf86cd799439012',
  'x-user-role': 'Client',
};

beforeAll(async () => {
  // mongodb-memory-server resets indexes between collection drops, so wait for
  // the unique index on `key` before the first `enforces unique key` test runs.
  await AppSetting.syncIndexes();
});

beforeEach(() => {
  _clearAppSettingsCache();
});

// ── Model ─────────────────────────────────────────────────────────────────────

describe('AppSetting model', () => {
  it('persists a setting with value + optional description', async () => {
    const doc = await AppSetting.create({
      key: 'ai.drafting_model',
      value: 'claude-sonnet-4-6',
      description: 'main drafting body',
    });
    expect(doc.key).toBe('ai.drafting_model');
    expect(doc.value).toBe('claude-sonnet-4-6');
    expect(doc.description).toBe('main drafting body');
  });

  it('enforces unique key', async () => {
    await AppSetting.create({ key: 'duplicate.key', value: 'a' });
    await expect(AppSetting.create({ key: 'duplicate.key', value: 'b' })).rejects.toThrow();
  });

  it('rejects keys that violate the pattern', async () => {
    await expect(AppSetting.create({ key: 'Bad Key with spaces', value: 'x' })).rejects.toThrow();
    await expect(
      AppSetting.create({ key: '_starts_with_underscore', value: 'x' }),
    ).rejects.toThrow();
  });

  it('rejects empty value', async () => {
    await expect(AppSetting.create({ key: 'no.value', value: '' })).rejects.toThrow();
  });
});

// ── Service ──────────────────────────────────────────────────────────────────

describe('app-settings.service', () => {
  it('getAppSetting throws AppSettingMissingError when key absent', async () => {
    await expect(getAppSetting('does.not.exist')).rejects.toBeInstanceOf(AppSettingMissingError);
    await expect(getAppSetting('does.not.exist')).rejects.toThrow(/does\.not\.exist/);
  });

  it('setAppSetting upserts and getAppSetting returns the value', async () => {
    await setAppSetting({ key: 'ai.drafting_model', value: 'claude-sonnet-4-6' });
    expect(await getAppSetting('ai.drafting_model')).toBe('claude-sonnet-4-6');
  });

  it('setAppSetting invalidates the cache on update', async () => {
    await setAppSetting({ key: 'ai.drafting_model', value: 'first' });
    expect(await getAppSetting('ai.drafting_model')).toBe('first');

    await setAppSetting({ key: 'ai.drafting_model', value: 'second' });
    expect(await getAppSetting('ai.drafting_model')).toBe('second');
  });

  it('caches reads within the TTL (a manual DB poke is not picked up until invalidation)', async () => {
    await setAppSetting({ key: 'ai.preflight_model', value: 'haiku-a' });
    expect(await getAppSetting('ai.preflight_model')).toBe('haiku-a');

    // Bypass the service — write directly to DB. Without invalidation the cache
    // should still serve the previous value.
    await AppSetting.updateOne({ key: 'ai.preflight_model' }, { $set: { value: 'haiku-b' } });
    expect(await getAppSetting('ai.preflight_model')).toBe('haiku-a');

    _clearAppSettingsCache();
    expect(await getAppSetting('ai.preflight_model')).toBe('haiku-b');
  });

  it('listAppSettings returns rows sorted by key', async () => {
    await setAppSetting({ key: 'ai.preflight_model', value: 'p' });
    await setAppSetting({ key: 'ai.drafting_model', value: 'd' });
    const all = await listAppSettings();
    expect(all.map((s) => s.key)).toEqual(['ai.drafting_model', 'ai.preflight_model']);
  });

  it('exposes well-known keys but no default values', () => {
    expect(APP_SETTING_KEYS.DRAFTING_MODEL).toBe('ai.drafting_model');
    expect(APP_SETTING_KEYS.PREFLIGHT_MODEL).toBe('ai.preflight_model');
    // Sanity — there's no exported DEFAULT_* anywhere
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const mod: Record<string, unknown> = require('../services/app-settings.service');
    for (const k of Object.keys(mod)) {
      expect(k.toLowerCase()).not.toMatch(/default.*model|model.*default/);
    }
  });
});

// ── Admin routes ──────────────────────────────────────────────────────────────

describe('GET /admin/app-settings', () => {
  it('200 for Admin — lists settings', async () => {
    await setAppSetting({ key: 'ai.drafting_model', value: 'claude-sonnet-4-6' });
    const res = await supertest(app).get('/admin/app-settings').set(ADMIN_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.settings.length).toBeGreaterThanOrEqual(1);
    expect(res.body.settings[0]).toMatchObject({
      key: 'ai.drafting_model',
      value: 'claude-sonnet-4-6',
    });
  });

  it('403 for Client', async () => {
    const res = await supertest(app).get('/admin/app-settings').set(CLIENT_HEADERS);
    expect(res.status).toBe(403);
  });

  it('401 without auth', async () => {
    const res = await supertest(app).get('/admin/app-settings');
    expect(res.status).toBe(401);
  });
});

describe('PUT /admin/app-settings/:key', () => {
  it('200 for Admin — upserts a value', async () => {
    const res = await supertest(app)
      .put('/admin/app-settings/ai.drafting_model')
      .set(ADMIN_HEADERS)
      .send({ value: 'claude-sonnet-4-6', description: 'main drafting' });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('claude-sonnet-4-6');
    expect(res.body.description).toBe('main drafting');

    expect(await getAppSetting('ai.drafting_model')).toBe('claude-sonnet-4-6');
  });

  it('400 for empty value', async () => {
    const res = await supertest(app)
      .put('/admin/app-settings/ai.drafting_model')
      .set(ADMIN_HEADERS)
      .send({ value: '   ' });
    expect(res.status).toBe(400);
  });

  it('400 for non-string value', async () => {
    const res = await supertest(app)
      .put('/admin/app-settings/ai.drafting_model')
      .set(ADMIN_HEADERS)
      .send({ value: 123 });
    expect(res.status).toBe(400);
  });

  it('400 for invalid key format', async () => {
    const res = await supertest(app)
      .put('/admin/app-settings/Bad Key With Spaces')
      .set(ADMIN_HEADERS)
      .send({ value: 'x' });
    expect(res.status).toBe(400);
  });

  it('403 for Client', async () => {
    const res = await supertest(app)
      .put('/admin/app-settings/ai.drafting_model')
      .set(CLIENT_HEADERS)
      .send({ value: 'x' });
    expect(res.status).toBe(403);
  });
});

// ── T-684b: insert-only writes ───────────────────────────────────────────────

describe('insertAppSettingIfAbsent (T-684b)', () => {
  // Listeners cannot be unregistered, so register once and read its calls.
  const invalidated = jest.fn();
  beforeAll(() => {
    onAppSettingInvalidated(invalidated);
  });
  beforeEach(() => {
    invalidated.mockClear();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('inserts when absent and returns the saved row', async () => {
    const r = await insertAppSettingIfAbsent({
      key: 'ai.model.drafter',
      value: '  model-a  ',
      description: ' note ',
      updatedBy: '507f1f77bcf86cd799439021',
    });
    expect(r.inserted).toBe(true);
    if (!r.inserted) throw new Error('unreachable');
    expect(r.setting).toMatchObject({
      key: 'ai.model.drafter',
      value: 'model-a',
      description: 'note',
    });
    const doc = await AppSetting.findOne({ key: 'ai.model.drafter' }).lean();
    expect(String(doc?.updatedBy)).toBe('507f1f77bcf86cd799439021');
    expect(await getAppSetting('ai.model.drafter')).toBe('model-a');
  });

  it('leaves an existing row untouched (value, description, updatedBy) and returns inserted:false', async () => {
    await AppSetting.create({
      key: 'ai.model.drafter',
      value: 'orig',
      description: 'orig note',
      updatedBy: '507f1f77bcf86cd799439031',
    });
    const r = await insertAppSettingIfAbsent({
      key: 'ai.model.drafter',
      value: 'other',
      description: 'other note',
      updatedBy: '507f1f77bcf86cd799439041',
    });
    expect(r).toEqual({ inserted: false });
    const doc = await AppSetting.findOne({ key: 'ai.model.drafter' }).lean();
    expect(doc).toMatchObject({ value: 'orig', description: 'orig note' });
    expect(String(doc?.updatedBy)).toBe('507f1f77bcf86cd799439031');
    expect(await AppSetting.countDocuments({ key: 'ai.model.drafter' })).toBe(1);
  });

  it('notifies and drops the cache only on insert', async () => {
    // Not inserted: a cached read stays, no listener call.
    await setAppSetting({ key: 'ai.model.drafter', value: 'orig' });
    expect(await getAppSetting('ai.model.drafter')).toBe('orig'); // cached
    await AppSetting.updateOne({ key: 'ai.model.drafter' }, { $set: { value: 'poked' } });
    invalidated.mockClear();
    expect(await insertAppSettingIfAbsent({ key: 'ai.model.drafter', value: 'x' })).toEqual({
      inserted: false,
    });
    expect(invalidated).not.toHaveBeenCalled();
    expect(await getAppSetting('ai.model.drafter')).toBe('orig'); // still the cached value

    // Inserted: listener called with the key.
    const r = await insertAppSettingIfAbsent({ key: 'ai.model.matcher', value: 'm' });
    expect(r.inserted).toBe(true);
    expect(invalidated).toHaveBeenCalledWith('ai.model.matcher');
  });

  it('maps E11000 to inserted:false and runs no post-write steps', async () => {
    jest
      .spyOn(AppSetting, 'updateOne')
      .mockRejectedValueOnce(
        Object.assign(new Error('E11000 duplicate key'), { code: 11000 }) as never,
      );
    const r = await insertAppSettingIfAbsent({ key: 'ai.model.drafter', value: 'x' });
    expect(r).toEqual({ inserted: false });
    expect(invalidated).not.toHaveBeenCalled();
  });

  it('rethrows any other error', async () => {
    const boom = Object.assign(new Error('network down'), { code: 91 });
    jest.spyOn(AppSetting, 'updateOne').mockRejectedValueOnce(boom as never);
    await expect(insertAppSettingIfAbsent({ key: 'ai.model.drafter', value: 'x' })).rejects.toBe(
      boom,
    );
    expect(invalidated).not.toHaveBeenCalled();
  });

  it("keeps an existing row's createdAt and updatedAt unchanged on inserted:false", async () => {
    const past = new Date('2020-01-02T03:04:05.000Z');
    // Raw insert bypasses Mongoose timestamps so the dates stay fixed.
    await AppSetting.collection.insertOne({
      key: 'ai.model.drafter',
      value: 'orig',
      createdAt: past,
      updatedAt: past,
    });
    const r = await insertAppSettingIfAbsent({ key: 'ai.model.drafter', value: 'other' });
    expect(r).toEqual({ inserted: false });
    const doc = await AppSetting.findOne({ key: 'ai.model.drafter' }).lean();
    expect(doc?.updatedAt.getTime()).toBe(past.getTime());
    expect(doc?.createdAt.getTime()).toBe(past.getTime());
  });

  it('sets createdAt and updatedAt as Dates close to now on a new row', async () => {
    const before = Date.now();
    const r = await insertAppSettingIfAbsent({ key: 'ai.model.drafter', value: 'x' });
    const after = Date.now();
    expect(r.inserted).toBe(true);
    if (!r.inserted) throw new Error('unreachable');
    expect(r.setting.updatedAt).toBeInstanceOf(Date);
    const doc = await AppSetting.findOne({ key: 'ai.model.drafter' }).lean();
    expect(doc?.createdAt).toBeInstanceOf(Date);
    expect(doc?.updatedAt).toBeInstanceOf(Date);
    for (const d of [doc?.createdAt, doc?.updatedAt]) {
      expect(d!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(d!.getTime()).toBeLessThanOrEqual(after + 1000);
    }
  });

  it('setAppSetting still overwrites', async () => {
    await setAppSetting({ key: 'ai.model.drafter', value: 'one' });
    await setAppSetting({ key: 'ai.model.drafter', value: 'two' });
    expect(await getAppSetting('ai.model.drafter')).toBe('two');
  });
});

describe('PUT /admin/app-settings/:key?ifAbsent=1 (T-684b)', () => {
  const put = (path: string, headers: Record<string, string> = ADMIN_HEADERS) =>
    supertest(app).put(path).set(headers);

  it('absent: 200 with the saved row', async () => {
    const res = await put('/admin/app-settings/ai.model.drafter?ifAbsent=1').send({
      value: 'model-a',
      description: 'copied',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      key: 'ai.model.drafter',
      value: 'model-a',
      description: 'copied',
    });
    expect(await getAppSetting('ai.model.drafter')).toBe('model-a');
    const doc = await AppSetting.findOne({ key: 'ai.model.drafter' }).lean();
    expect(String(doc?.updatedBy)).toBe('507f1f77bcf86cd799439011');
  });

  it('present: 409 with the exact text, stored row unchanged, stored value not echoed', async () => {
    await AppSetting.create({
      key: 'ai.model.drafter',
      value: 'stored-model-value-x1',
      description: 'd0',
    });
    const res = await put('/admin/app-settings/ai.model.drafter?ifAbsent=1').send({
      value: 'new-value',
      description: 'd1',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'ai.model.drafter is already set; not overwritten.' });
    expect(res.text).not.toContain('stored-model-value-x1');
    const doc = await AppSetting.findOne({ key: 'ai.model.drafter' }).lean();
    expect(doc).toMatchObject({ value: 'stored-model-value-x1', description: 'd0' });
  });

  it('present: 409 leaves createdAt and updatedAt unchanged', async () => {
    const past = new Date('2020-01-02T03:04:05.000Z');
    await AppSetting.collection.insertOne({
      key: 'ai.model.drafter',
      value: 'orig',
      createdAt: past,
      updatedAt: past,
    });
    const res = await put('/admin/app-settings/ai.model.drafter?ifAbsent=1').send({
      value: 'new-value',
    });
    expect(res.status).toBe(409);
    const doc = await AppSetting.findOne({ key: 'ai.model.drafter' }).lean();
    expect(doc?.updatedAt.getTime()).toBe(past.getTime());
    expect(doc?.createdAt.getTime()).toBe(past.getTime());
  });

  it.each([['true'], ['0'], [''], ['2'], ['1&ifAbsent=1']])(
    'ifAbsent=%p: 400 and nothing written',
    async (v) => {
      const res = await put(`/admin/app-settings/ai.model.drafter?ifAbsent=${v}`).send({
        value: 'x',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'ifAbsent must be 1' });
      expect(await AppSetting.countDocuments({})).toBe(0);
    },
  );

  it('repeated ifAbsent=1&ifAbsent=1: 400', async () => {
    const res = await put('/admin/app-settings/ai.model.drafter?ifAbsent=1&ifAbsent=1').send({
      value: 'x',
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'ifAbsent must be 1' });
    expect(await AppSetting.countDocuments({})).toBe(0);
  });

  it('bare ?ifAbsent (empty) is 400', async () => {
    const res = await put('/admin/app-settings/ai.model.drafter?ifAbsent').send({ value: 'x' });
    expect(res.status).toBe(400);
  });

  it('existing validations still fire in insert mode', async () => {
    const bad = (path: string, body: object) => put(path).send(body);
    expect((await bad('/admin/app-settings/Bad Key?ifAbsent=1', { value: 'x' })).status).toBe(400);
    expect(
      (await bad('/admin/app-settings/ai.model.drafter?ifAbsent=1', { value: '   ' })).status,
    ).toBe(400);
    expect(
      (await bad('/admin/app-settings/ai.model.drafter?ifAbsent=1', { value: 5 })).status,
    ).toBe(400);
    expect(
      (await bad('/admin/app-settings/ai.model.drafter?ifAbsent=1', { value: 'x', description: 7 }))
        .status,
    ).toBe(400);
    const effort = await bad('/admin/app-settings/ai.effort.drafter?ifAbsent=1', {
      value: 'turbo',
    });
    expect(effort.status).toBe(400);
    expect(effort.body.error).toMatch(/must be one of/);
    expect(await AppSetting.countDocuments({})).toBe(0);
  });

  it('an effort key is stored trimmed and lower-cased', async () => {
    const res = await put('/admin/app-settings/ai.effort.drafter?ifAbsent=1').send({
      value: '  HIGH ',
    });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('high');
    expect((await AppSetting.findOne({ key: 'ai.effort.drafter' }).lean())?.value).toBe('high');
  });

  it('403 for Client, nothing written', async () => {
    const res = await put('/admin/app-settings/ai.model.drafter?ifAbsent=1', CLIENT_HEADERS).send({
      value: 'x',
    });
    expect(res.status).toBe(403);
    expect(await AppSetting.countDocuments({})).toBe(0);
  });

  it('no flag: still overwrites', async () => {
    await AppSetting.create({ key: 'ai.model.drafter', value: 'old' });
    const res = await put('/admin/app-settings/ai.model.drafter').send({ value: 'new' });
    expect(res.status).toBe(200);
    expect(await getAppSetting('ai.model.drafter')).toBe('new');
  });

  it('two concurrent insert-only PUTs: exactly one 200 and one 409', async () => {
    const [a, b] = await Promise.all([
      put('/admin/app-settings/ai.model.drafter?ifAbsent=1').send({ value: 'first' }),
      put('/admin/app-settings/ai.model.drafter?ifAbsent=1').send({ value: 'second' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await AppSetting.countDocuments({ key: 'ai.model.drafter' })).toBe(1);
    const winner = a.status === 200 ? a : b;
    expect((await AppSetting.findOne({ key: 'ai.model.drafter' }).lean())?.value).toBe(
      winner.body.value,
    );
  });
});

// ── T-684b x T-683: insert path keeps the v3 stage tracking ──────────────────

describe('insert-only writes and the v3 stage warning (T-684b, T-683)', () => {
  const STAGE = 'feature.drafting_v3_stage';
  const seed = async (entries: Record<string, string>): Promise<void> => {
    for (const [key, value] of Object.entries(entries)) {
      await AppSetting.create({ key, value });
    }
  };
  const BASE = {
    'ai.model.drafter': 'model-x',
    'ai.model.fact_checker': 'model-x',
    'ai.intake_model': 'legacy-model',
  };
  const put = (path: string) => supertest(app).put(path).set(ADMIN_HEADERS);

  it('inserting stage 1 with ai.model.extractor missing adds the warning', async () => {
    await seed(BASE);
    expect(await primeConfigWarnings()).toEqual([]); // no stage row: stage 0
    const r = await insertAppSettingIfAbsent({ key: STAGE, value: '1' });
    expect(r.inserted).toBe(true);
    expect(getConfigWarnings()).toEqual(['ai.model.extractor']);
  });

  it('inserting stage 0 leaves no warning', async () => {
    await seed(BASE);
    await primeConfigWarnings();
    const r = await insertAppSettingIfAbsent({ key: STAGE, value: '0' });
    expect(r.inserted).toBe(true);
    expect(getConfigWarnings()).toEqual([]);
  });

  it('a not-inserted call (stage row exists as 0) does not raise the tracked stage', async () => {
    await seed({ ...BASE, [STAGE]: '0' });
    expect(await primeConfigWarnings()).toEqual([]);
    const r = await insertAppSettingIfAbsent({ key: STAGE, value: '1' });
    expect(r).toEqual({ inserted: false });
    expect(getConfigWarnings()).toEqual([]);
    expect((await AppSetting.findOne({ key: STAGE }).lean())?.value).toBe('0');
  });

  it('a not-inserted call (stage row exists as 1) does not lower the tracked stage', async () => {
    await seed({ ...BASE, [STAGE]: '1' });
    expect(await primeConfigWarnings()).toEqual(['ai.model.extractor']);
    const r = await insertAppSettingIfAbsent({ key: STAGE, value: '0' });
    expect(r).toEqual({ inserted: false });
    expect(getConfigWarnings()).toEqual(['ai.model.extractor']);
  });

  it('through the route: PUT ?ifAbsent=1 of stage 1 adds the warning (200), a second PUT is 409 and changes nothing', async () => {
    await seed(BASE);
    expect(await primeConfigWarnings()).toEqual([]);
    const first = await put(`/admin/app-settings/${STAGE}?ifAbsent=1`).send({ value: '1' });
    expect(first.status).toBe(200);
    expect(getConfigWarnings()).toEqual(['ai.model.extractor']);
    const second = await put(`/admin/app-settings/${STAGE}?ifAbsent=1`).send({ value: '0' });
    expect(second.status).toBe(409);
    expect(getConfigWarnings()).toEqual(['ai.model.extractor']);
  });
});

// ── End-to-end ────────────────────────────────────────────────────────────────

describe('end-to-end: PUT then read via service', () => {
  it('a value set through the admin route is what streamLLM/preflight will see', async () => {
    const put = await supertest(app)
      .put('/admin/app-settings/ai.drafting_model')
      .set(ADMIN_HEADERS)
      .send({ value: 'claude-opus-4-7' });
    expect(put.status).toBe(200);

    expect(await getAppSetting('ai.drafting_model')).toBe('claude-opus-4-7');
  });
});
