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
  listAppSettings,
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
    await expect(AppSetting.create({ key: '_starts_with_underscore', value: 'x' })).rejects.toThrow();
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
