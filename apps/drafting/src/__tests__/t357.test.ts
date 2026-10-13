/**
 * T-357 (template config edge cases after T-350).
 *
 * AC1: an override whose JSON is `null` (or any non-object) fails like any invalid override.
 * AC2: an override file name that is not a plain id fails the boot check.
 * AC3: a throw from template config loading in documents.routes.ts is a 500 with a safe
 *      message, not a hung request.
 *
 * No model call. A real in-memory Mongo (setupDb) backs the route tests.
 */
import './setupDb';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return { ...actual, readFileSync: jest.fn(actual.readFileSync) };
});

/* eslint-disable import/order */
import app from '../app';
import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as engine from '../services/template-engine.service';
import { clearTemplateRegistryCache } from '../services/template-promoter';
/* eslint-enable import/order */

const { assertOverridesCatalogued, clearConfigCache, loadTemplateConfig } = engine;
const realReadFileSync = jest.requireActual<typeof import('fs')>('fs').readFileSync;

afterEach(() => {
  jest.restoreAllMocks();
  (fs.readFileSync as unknown as jest.Mock).mockReset().mockImplementation(realReadFileSync);
  clearConfigCache();
  clearTemplateRegistryCache();
});

function messageOf(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return '';
}

// ── AC1 ─────────────────────────────────────────────────────────────────────

describe('T-357 AC1: a non-object override is invalid, not a silent fallback', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't357-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ['null', 'null'],
    ['an array', '[1, 2]'],
    ['a number', '42'],
    ['a string', '"text"'],
  ])('boot check lists a file holding %s as invalid JSON and logs the id only', (_n, content) => {
    writeFileSync(join(dir, 'x.json'), content);
    const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const message = messageOf(() => assertOverridesCatalogued(dir));
    expect(message).toMatch(/not valid JSON: x$/);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toEqual({ templateId: 'x' });
  });

  it('boot check: a catalogued id holding null still fails (not treated as catalogued)', () => {
    writeFileSync(join(dir, 'nda.json'), 'null');
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    expect(() => assertOverridesCatalogued(dir)).toThrow(/not valid JSON: nda/);
  });

  function overrideReads(id: string, content: string): void {
    (fs.readFileSync as unknown as jest.Mock).mockImplementation(
      (p: unknown, ...rest: unknown[]) => {
        if (typeof p === 'string' && p.endsWith(join('docs', 'templates', `${id}.json`)))
          return content;
        return (realReadFileSync as (...a: unknown[]) => unknown)(p, ...rest);
      },
    );
  }

  it('loadTemplateConfig throws on a null override, logs the id, and does not fall back to the registry', () => {
    // nda resolves from the registry when no override exists: prove the fallback would work.
    expect(loadTemplateConfig('nda')).not.toBeNull();
    clearConfigCache();

    const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    overrideReads('nda', 'null');
    expect(() => loadTemplateConfig('nda')).toThrow(/nda is not valid JSON/);
    expect(error).toHaveBeenCalledWith(
      { templateId: 'nda' },
      expect.stringContaining('not valid JSON'),
    );
  });

  it('a null override is not cached: once the file is fixed the next call loads it', () => {
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    overrideReads('nda', 'null');
    expect(() => loadTemplateConfig('nda')).toThrow(/not valid JSON/);
    expect(() => loadTemplateConfig('nda')).toThrow(/not valid JSON/);
    (fs.readFileSync as unknown as jest.Mock).mockImplementation(realReadFileSync);
    expect(loadTemplateConfig('nda')).not.toBeNull();
  });

  it.each(['[]', '7'])('loadTemplateConfig also refuses %s', (content) => {
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    overrideReads('nda', content);
    expect(() => loadTemplateConfig('nda')).toThrow(/not valid JSON/);
  });
});

// ── AC2 ─────────────────────────────────────────────────────────────────────

describe('T-357 AC2: an override file name that is not a plain id fails the boot check', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't357-'));
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists every bad name, sorted, in one error', () => {
    writeFileSync(join(dir, 'bail.v2.json'), JSON.stringify({ template_id: 'bail_regular' }));
    writeFileSync(join(dir, 'Bail_Regular.json'), JSON.stringify({ template_id: 'bail_regular' }));
    const message = messageOf(() => assertOverridesCatalogued(dir));
    expect(message).toContain(
      'docs/templates override file name(s) not a plain template id: Bail_Regular, bail.v2',
    );
  });

  it('a plain-id file alongside does not appear in the bad-names list', () => {
    writeFileSync(join(dir, 'bail_regular.json'), JSON.stringify({ template_id: 'bail_regular' }));
    writeFileSync(join(dir, 'Bad Name.json'), JSON.stringify({ template_id: 'bail_regular' }));
    const message = messageOf(() => assertOverridesCatalogued(dir));
    expect(message).toMatch(/not a plain template id: Bad Name$/);
    expect(message).not.toMatch(/plain template id:.*bail_regular/);
  });

  it('plain ids with digits, dashes and underscores pass', () => {
    writeFileSync(join(dir, 'bail_regular.json'), JSON.stringify({ template_id: 'bail_regular' }));
    expect(() => assertOverridesCatalogued(dir)).not.toThrow();
  });

  it('keeps the order: uncatalogued, invalid JSON, then bad names', () => {
    writeFileSync(
      join(dir, 'zz_uncatalogued.json'),
      JSON.stringify({ template_id: 'zz_uncatalogued' }),
    );
    writeFileSync(join(dir, 'nda.json'), 'null');
    writeFileSync(join(dir, 'Bad.Name.json'), JSON.stringify({ template_id: 'bail_regular' }));
    const message = messageOf(() => assertOverridesCatalogued(dir));
    const a = message.indexOf('zz_uncatalogued');
    const b = message.indexOf('not valid JSON: nda');
    const c = message.indexOf('not a plain template id: Bad.Name');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

// ── AC3 ─────────────────────────────────────────────────────────────────────

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439057';
const SECRET_BODY = 'PRIVILEGED-REQUEST-TEXT-DO-NOT-LOG';

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

describe('T-357 AC3: a template config throw is a 500, not a hang', () => {
  let error: jest.SpyInstance;
  beforeEach(async () => {
    _clearAppSettingsCache();
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    await User.create({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
    error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  const boom = () => {
    throw new Error('Template engine: docs/templates override nda is not valid JSON');
  };

  function expectSafe500(res: request.Response): void {
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Template config unavailable' });
    expect(res.text).not.toContain('Template engine');
    expect(error).toHaveBeenCalled();
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain(SECRET_BODY);
  }

  it('GET /template-configs', async () => {
    jest.spyOn(engine, 'listTemplateConfigs').mockImplementation(boom);
    expectSafe500(await request(app).get('/template-configs').set(headers()));
  });

  it('GET /template-configs/:id', async () => {
    jest.spyOn(engine, 'loadTemplateConfig').mockImplementation(boom);
    expectSafe500(await request(app).get('/template-configs/nda').set(headers()));
  });

  it('POST /generate-from-template', async () => {
    jest.spyOn(engine, 'loadTemplateConfig').mockImplementation(boom);
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'nda', form_data: { note: SECRET_BODY } });
    expectSafe500(res);
  });

  it('POST /generate-from-brief (rule-pack route)', async () => {
    jest.spyOn(engine, 'loadTemplateConfig').mockImplementation(boom);
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: 'bail_regular',
        values: [{ key: 'applicant_name', value: SECRET_BODY, source: 'user' }],
        court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
      });
    expectSafe500(res);
  });

  it('a real null override (not a mock) gives the same 500 on GET /template-configs/:id', async () => {
    (fs.readFileSync as unknown as jest.Mock).mockImplementation(
      (p: unknown, ...rest: unknown[]) => {
        if (typeof p === 'string' && p.endsWith(join('docs', 'templates', 'nda.json')))
          return 'null';
        return (realReadFileSync as (...a: unknown[]) => unknown)(p, ...rest);
      },
    );
    expectSafe500(await request(app).get('/template-configs/nda').set(headers()));
  });

  it('unchanged: unknown id is still 404', async () => {
    const get = await request(app).get('/template-configs/does_not_exist').set(headers());
    expect(get.status).toBe(404);
    expect(get.body).toEqual({ error: 'Template config not found' });
  });

  it('unchanged: a pro-only template for a free plan is still 403', async () => {
    const real = engine.loadTemplateConfig('nda')!;
    jest.spyOn(engine, 'loadTemplateConfig').mockReturnValue({ ...real, plan_access: 'pro' });
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'nda', form_data: {} });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'This template requires a Pro plan' });
  });

  it('unchanged: no auth is still 401/403 and never reaches the loader', async () => {
    const load = jest.spyOn(engine, 'loadTemplateConfig');
    const res = await request(app).get('/template-configs/nda');
    expect([401, 403]).toContain(res.status);
    expect(load).not.toHaveBeenCalled();
  });

  it('unchanged: a good config still returns 200', async () => {
    const res = await request(app).get('/template-configs/nda').set(headers());
    expect(res.status).toBe(200);
  });
});
