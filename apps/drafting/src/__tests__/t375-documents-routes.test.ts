/**
 * T-375 part 2 - the plaint switch (feature.template_civil_plaint) on the documents routes.
 *
 * Off (the code default): GET /template-configs leaves out all six civil_plaints_suits ids,
 * GET /template-configs/:id, POST /generate-from-template, POST /generate-from-brief and the
 * legacy POST /generate (docType 'plaint') answer 404 { error: 'Template not found' } before
 * any credit check, hold or model call. On: the same routes behave as before. Other ids are
 * unaffected either way. The fixture user always sees plaints. A read error hides them.
 * A missing or non-string field passes through to the existing 400.
 *
 * getAppSetting is a jest.fn that falls through to the real in-memory Mongo unless a test
 * stubs a key. The model SDK is faked and must never be reached for a hidden id.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { TEMPLATE_CATALOGUE } from '../config/catalogue';
import logger from '../config/logger';
import redis from '../config/redis';
import {
  AppSettingMissingError,
  getAppSetting,
  _clearAppSettingsCache,
} from '../services/app-settings.service';
import * as credits from '../services/credits.service';
import * as preflight from '../services/preflight.service';
import {
  _resetToolSwitches,
  CIVIL_PLAINT_CATEGORY,
  DESCRIBE_FIRST_SETTING,
  TEMPLATE_CIVIL_PLAINT_SETTING,
  TEMPLATE_NOT_FOUND,
} from '../services/feature-switches';
import {
  listTemplateConfigs,
  clearConfigCache,
  loadTemplateConfig,
} from '../services/template-engine.service';
import { GOLDEN_SET_USER_ID } from '../services/run-origin';
import { Generation } from '../models/Generation.model';
import { LawieDocument } from '../models/Document.model';
import { sdkAnswer } from './sdkStream';
import { AppSetting } from '../models/AppSetting.model';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.mock('../services/app-settings.service', () => {
  const actual = jest.requireActual('../services/app-settings.service');
  return { ...actual, getAppSetting: jest.fn(actual.getAppSetting) };
});

const realGet = jest.requireActual('../services/app-settings.service')
  .getAppSetting as typeof getAppSetting;
const mockGet = getAppSetting as unknown as jest.Mock;

const P = TEMPLATE_CIVIL_PLAINT_SETTING;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439376';

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'pro',
    'x-user-role': 'Client',
  };
}

type Stub = string | 'missing' | 'throw';

/** Stub some keys of getAppSetting; any other key still reads the real in-memory Mongo. */
function stub(map: Record<string, Stub>): void {
  mockGet.mockImplementation((key: string) => {
    const v = map[key];
    if (v === undefined) return realGet(key);
    if (v === 'missing') return Promise.reject(new AppSettingMissingError(key));
    if (v === 'throw') return Promise.reject(new Error('mongo is down'));
    return Promise.resolve(v);
  });
}

const PLAINT_IDS = Object.keys(TEMPLATE_CATALOGUE)
  .filter((id) => TEMPLATE_CATALOGUE[id].category === CIVIL_PLAINT_CATEGORY)
  .sort();
const PLAINT_ID = PLAINT_IDS[0];
const OTHER_ID = 'bail_regular';

// Spies on everything that spends: the balance read, the hold, the spend.
let balanceSpy: jest.SpyInstance;
let holdSpy: jest.SpyInstance;
let spendSpy: jest.SpyInstance;

function expectNothingSpent(): void {
  expect(balanceSpy).not.toHaveBeenCalled();
  expect(holdSpy).not.toHaveBeenCalled();
  expect(spendSpy).not.toHaveBeenCalled();
  expect(mockMessagesStream).not.toHaveBeenCalled();
}

const isHiddenBody = (b: unknown) => JSON.stringify(b) === JSON.stringify(TEMPLATE_NOT_FOUND);

beforeEach(async () => {
  mockMessagesStream.mockReset();
  mockGet.mockReset();
  mockGet.mockImplementation(realGet);
  _resetToolSwitches();
  clearConfigCache();
  await redis.flushall();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  balanceSpy = jest.spyOn(credits, 'getCreditBalance');
  holdSpy = jest.spyOn(credits, 'holdInk');
  spendSpy = jest.spyOn(credits, 'spendInk');
});

afterEach(() => {
  jest.restoreAllMocks();
});

function list(userId = USER_ID) {
  return request(app).get('/template-configs').set(headers(userId));
}
const ids = (body: { templates: Array<{ template_id: string }> }) =>
  body.templates.map((t) => t.template_id);

describe('the setup', () => {
  it('has six plaint ids and the exact 404 body', () => {
    expect(PLAINT_IDS).toHaveLength(6);
    expect(TEMPLATE_NOT_FOUND).toEqual({ error: 'Template not found' });
  });
});

describe('GET /template-configs', () => {
  it('off by default (no AppSetting doc): no plaint id, count is catalogue minus 6', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    const got = ids(res.body);
    for (const id of PLAINT_IDS) expect(got).not.toContain(id);
    expect(got).toHaveLength(listTemplateConfigs().length - PLAINT_IDS.length);
    expect(listTemplateConfigs().map((c) => c.template_id)).toEqual(
      expect.arrayContaining(PLAINT_IDS),
    );
  });

  it('off explicitly: same', async () => {
    stub({ [P]: 'off' });
    const res = await list();
    const got = ids(res.body);
    expect(PLAINT_IDS.some((id) => got.includes(id))).toBe(false);
    expect(got).toHaveLength(listTemplateConfigs().length - 6);
  });

  it('a value that is not on/off stays off', async () => {
    stub({ [P]: 'yes' });
    const res = await list();
    expect(PLAINT_IDS.some((id) => ids(res.body).includes(id))).toBe(false);
  });

  it('on: all six plaints are back and the full catalogue is listed', async () => {
    stub({ [P]: 'on' });
    const res = await list();
    const got = ids(res.body);
    for (const id of PLAINT_IDS) expect(got).toContain(id);
    expect(got).toHaveLength(listTemplateConfigs().length);
  });

  it('turning it on needs no code change: an AppSetting flip brings them back', async () => {
    stub({ [P]: 'off' });
    const before = await list();
    expect(ids(before.body)).not.toContain(PLAINT_ID);
    stub({ [P]: 'on' });
    const after = await list();
    expect(ids(after.body)).toContain(PLAINT_ID);
  });

  it('non-plaint ids are listed whether the switch is off or on', async () => {
    stub({ [P]: 'off' });
    const off = ids((await list()).body);
    stub({ [P]: 'on' });
    const on = ids((await list()).body);
    const nonPlaint = listTemplateConfigs()
      .map((c) => c.template_id)
      .filter((id) => !PLAINT_IDS.includes(id));
    expect(off.sort()).toEqual([...nonPlaint].sort());
    for (const id of nonPlaint) expect(on).toContain(id);
  });

  it('the fixture user still sees every plaint with the switch off', async () => {
    stub({ [P]: 'off' });
    const res = await list(GOLDEN_SET_USER_ID);
    expect(res.status).toBe(200);
    for (const id of PLAINT_IDS) expect(ids(res.body)).toContain(id);
    expect(ids(res.body)).toHaveLength(listTemplateConfigs().length);
  });

  it('a read error on the switch hides the plaints (fail closed)', async () => {
    stub({ [P]: 'throw' });
    const res = await list();
    expect(res.status).toBe(200);
    expect(PLAINT_IDS.some((id) => ids(res.body).includes(id))).toBe(false);
    expect(ids(res.body)).toHaveLength(listTemplateConfigs().length - 6);
  });

  it('a missing doc is off', async () => {
    stub({ [P]: 'missing' });
    const res = await list();
    expect(PLAINT_IDS.some((id) => ids(res.body).includes(id))).toBe(false);
  });
});

describe('GET /template-configs/:id', () => {
  it.each(PLAINT_IDS)('%s is 404 with the exact body when off', async (id) => {
    stub({ [P]: 'off' });
    const res = await request(app).get(`/template-configs/${id}`).set(headers());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Template not found' });
  });

  it.each(PLAINT_IDS)('%s is 404 by default (no doc)', async (id) => {
    const res = await request(app).get(`/template-configs/${id}`).set(headers());
    expect(res.status).toBe(404);
    expect(isHiddenBody(res.body)).toBe(true);
  });

  it.each(PLAINT_IDS)('%s is served when on', async (id) => {
    stub({ [P]: 'on' });
    const res = await request(app).get(`/template-configs/${id}`).set(headers());
    expect(res.status).toBe(200);
    expect(res.body.config.template_id).toBe(id);
  });

  it('a non-plaint id is served either way', async () => {
    for (const v of ['off', 'on'] as const) {
      stub({ [P]: v });
      const res = await request(app).get(`/template-configs/${OTHER_ID}`).set(headers());
      expect(res.status).toBe(200);
      expect(res.body.config.template_id).toBe(OTHER_ID);
    }
  });

  it('an unknown id keeps the existing not-found answer, not the guard body', async () => {
    stub({ [P]: 'off' });
    const res = await request(app).get('/template-configs/no_such_doc_t375').set(headers());
    expect(res.status).toBe(404);
  });

  it('the fixture user can read a plaint when off', async () => {
    stub({ [P]: 'off' });
    const res = await request(app)
      .get(`/template-configs/${PLAINT_ID}`)
      .set(headers(GOLDEN_SET_USER_ID));
    expect(res.status).toBe(200);
  });

  it('a read error hides a plaint', async () => {
    stub({ [P]: 'throw' });
    const res = await request(app).get(`/template-configs/${PLAINT_ID}`).set(headers());
    expect(res.status).toBe(404);
    expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
  });
});

describe('POST /generate-from-template', () => {
  const post = (body: unknown, userId = USER_ID) =>
    request(app)
      .post('/generate-from-template')
      .set(headers(userId))
      .send(body as object);

  it.each(PLAINT_IDS)('%s is 404 when off, with no hold, charge or model call', async (id) => {
    stub({ [P]: 'off' });
    const res = await post({ template_id: id, form_data: {} });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Template not found' });
    expectNothingSpent();
  });

  it('is 404 by default with no doc', async () => {
    const res = await post({ template_id: PLAINT_ID, form_data: {} });
    expect(res.status).toBe(404);
    expectNothingSpent();
  });

  it('a read error is 404 and spends nothing', async () => {
    stub({ [P]: 'throw' });
    const res = await post({ template_id: PLAINT_ID, form_data: {} });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
    expectNothingSpent();
  });

  it('on: the guard passes the plaint on to the credit gate', async () => {
    stub({ [P]: 'on' });
    const res = await post({ template_id: PLAINT_ID, form_data: {} });
    expect(isHiddenBody(res.body)).toBe(false);
    expect(res.status).not.toBe(404);
    expect(balanceSpy).toHaveBeenCalled();
  });

  it('a non-plaint id reaches the credit gate either way', async () => {
    for (const v of ['off', 'on'] as const) {
      balanceSpy.mockClear();
      stub({ [P]: v });
      const res = await post({ template_id: OTHER_ID, form_data: {} });
      expect(isHiddenBody(res.body)).toBe(false);
      expect(balanceSpy).toHaveBeenCalled();
    }
  });

  it('the fixture user is not blocked when off', async () => {
    stub({ [P]: 'off' });
    const res = await post({ template_id: PLAINT_ID, form_data: {} }, GOLDEN_SET_USER_ID);
    expect(isHiddenBody(res.body)).toBe(false);
    expect(res.status).not.toBe(404);
  });

  it.each([
    ['no template_id', {}],
    ['a number', { template_id: 42 }],
    ['null', { template_id: null }],
    ['an array', { template_id: [PLAINT_ID] }],
    ['an object', { template_id: { id: PLAINT_ID } }],
  ])('%s passes through to the existing 400', async (_n, body) => {
    stub({ [P]: 'off' });
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(isHiddenBody(res.body)).toBe(false);
  });

  it('a non-JSON body passes through to the existing 400', async () => {
    stub({ [P]: 'off' });
    const res = await request(app).post('/generate-from-template').set(headers()).send();
    expect(res.status).toBe(400);
  });
});

describe('POST /generate-from-brief', () => {
  const post = (body: unknown, userId = USER_ID) =>
    request(app)
      .post('/generate-from-brief')
      .set(headers(userId))
      .send(body as object);

  beforeEach(() => {
    // describe_first on so the request reaches the template guard.
    stub({ [DESCRIBE_FIRST_SETTING]: 'on', [P]: 'off' });
  });
  const withSwitch = (v: Stub) => stub({ [DESCRIBE_FIRST_SETTING]: 'on', [P]: v });

  it.each(PLAINT_IDS)('kind %s is 404 when off, with no hold, charge or model call', async (id) => {
    const res = await post({ kind: id, values: [] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Template not found' });
    expectNothingSpent();
  });

  it('describe_first off still gives its own not_enabled before the guard', async () => {
    stub({ [DESCRIBE_FIRST_SETTING]: 'off', [P]: 'off' });
    const res = await post({ kind: PLAINT_ID, values: [] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_enabled' });
  });

  it('a read error on the plaint switch is 404 and spends nothing', async () => {
    withSwitch('throw');
    const res = await post({ kind: PLAINT_ID, values: [] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
    expectNothingSpent();
  });

  it('on: the guard passes the plaint on', async () => {
    withSwitch('on');
    const res = await post({ kind: PLAINT_ID, values: [] });
    expect(isHiddenBody(res.body)).toBe(false);
    expect(balanceSpy).toHaveBeenCalled();
  });

  it('a non-plaint kind and kind none are not blocked either way', async () => {
    for (const v of ['off', 'on'] as const) {
      for (const kind of [OTHER_ID, 'none']) {
        balanceSpy.mockClear();
        withSwitch(v);
        const res = await post({ kind, values: [] });
        expect(isHiddenBody(res.body)).toBe(false);
        expect(balanceSpy).toHaveBeenCalled();
      }
    }
  });

  it('the fixture user is not blocked when off', async () => {
    const res = await post({ kind: PLAINT_ID, values: [] }, GOLDEN_SET_USER_ID);
    expect(isHiddenBody(res.body)).toBe(false);
  });

  it.each([
    ['no kind', {}],
    ['a number', { kind: 7 }],
    ['null', { kind: null }],
    ['an array', { kind: [PLAINT_ID] }],
  ])('%s passes through to the existing 400', async (_n, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(isHiddenBody(res.body)).toBe(false);
  });
});

describe("legacy POST /generate (docType 'plaint')", () => {
  const post = (body: unknown, userId = USER_ID) =>
    request(app)
      .post('/generate')
      .set(headers(userId))
      .send(body as object);

  it("docType 'plaint' is 404 when off, before any credit check", async () => {
    stub({ [P]: 'off' });
    const res = await post({ docType: 'plaint' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Template not found' });
    expectNothingSpent();
  });

  it("docType 'plaint' is 404 by default and on a read error", async () => {
    let res = await post({ docType: 'plaint' });
    expect(res.status).toBe(404);
    stub({ [P]: 'throw' });
    res = await post({ docType: 'plaint' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
    expectNothingSpent();
  });

  it.each(PLAINT_IDS)('a catalogue plaint id %s as docType is 404 when off', async (id) => {
    stub({ [P]: 'off' });
    const res = await post({ docType: id });
    expect(res.status).toBe(404);
    expectNothingSpent();
  });

  it("on: docType 'plaint' reaches the credit gate", async () => {
    stub({ [P]: 'on' });
    const res = await post({ docType: 'plaint' });
    expect(isHiddenBody(res.body)).toBe(false);
    expect(res.status).not.toBe(404);
    expect(balanceSpy).toHaveBeenCalled();
  });

  it('another docType is not blocked either way', async () => {
    for (const v of ['off', 'on'] as const) {
      balanceSpy.mockClear();
      stub({ [P]: v });
      const res = await post({ docType: 'legal_notice' });
      expect(isHiddenBody(res.body)).toBe(false);
      expect(balanceSpy).toHaveBeenCalled();
    }
  });

  it("the fixture user's 'plaint' is not blocked when off", async () => {
    stub({ [P]: 'off' });
    const res = await post({ docType: 'plaint' }, GOLDEN_SET_USER_ID);
    expect(isHiddenBody(res.body)).toBe(false);
  });

  it.each([
    ['no docType', {}],
    ['a number', { docType: 5 }],
    ['null', { docType: null }],
  ])('%s passes through to the existing 400', async (_n, body) => {
    stub({ [P]: 'off' });
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(isHiddenBody(res.body)).toBe(false);
  });
});

describe('POST /preflight', () => {
  let preflightSpy: jest.SpyInstance;
  const post = (body: unknown, userId = USER_ID) =>
    request(app)
      .post('/preflight')
      .set(headers(userId))
      .send(body as object);
  const ok = { verdict: 'pass', issues: [] };

  beforeEach(() => {
    preflightSpy = jest.spyOn(preflight, 'preflightCheck').mockResolvedValue(ok as never);
  });

  const expectNoRulesNoModel = () => {
    expect(preflightSpy).not.toHaveBeenCalled();
    expect(mockMessagesStream).not.toHaveBeenCalled();
  };

  it.each(PLAINT_IDS)('%s is 404 when off: no rules run, no model call', async (id) => {
    stub({ [P]: 'off' });
    const res = await post({ template_id: id, form_data: {} });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Template not found' });
    expectNoRulesNoModel();
  });

  it('is 404 by default with no doc, for every plaint id', async () => {
    for (const id of PLAINT_IDS) {
      const res = await post({ template_id: id, form_data: {} });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
    }
    expectNoRulesNoModel();
  });

  it('is 404 on a read error, and a value that is not "on" stays off', async () => {
    for (const v of ['throw', 'missing', 'yes'] as const) {
      stub({ [P]: v });
      const res = await post({ template_id: PLAINT_ID, form_data: {} });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
    }
    expectNoRulesNoModel();
  });

  it.each(PLAINT_IDS)('%s passes the guard when on and runs the check', async (id) => {
    stub({ [P]: 'on' });
    const res = await post({ template_id: id, form_data: { a: 'b' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ok);
    expect(preflightSpy).toHaveBeenCalledTimes(1);
    expect(preflightSpy.mock.calls[0][0]).toBe(id);
  });

  it('a non-plaint id is unaffected either way', async () => {
    for (const v of ['off', 'on'] as const) {
      preflightSpy.mockClear();
      stub({ [P]: v });
      const res = await post({ template_id: OTHER_ID, form_data: { a: 'b' } });
      expect(res.status).toBe(200);
      expect(preflightSpy).toHaveBeenCalledTimes(1);
    }
  });

  it('the fixture user is not blocked when off', async () => {
    stub({ [P]: 'off' });
    const res = await post({ template_id: PLAINT_ID, form_data: { a: 'b' } }, GOLDEN_SET_USER_ID);
    expect(res.status).toBe(200);
    expect(preflightSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no template_id', {}],
    ['a number', { template_id: 42 }],
    ['null', { template_id: null }],
    ['an array', { template_id: [PLAINT_ID] }],
  ])('%s passes through to the existing 400', async (_n, body) => {
    stub({ [P]: 'off' });
    const res = await post({ ...body, form_data: {} });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'template_id is required' });
    expectNoRulesNoModel();
  });
});

describe('T-375 Arjun: the fixture user generates a plaint with the switch off, a normal user does not', () => {
  const post = (userId: string, body: unknown) =>
    request(app)
      .post('/generate-from-template')
      .set(headers(userId))
      .send(body as object);

  /** A form that satisfies every required, visible field of the plaint config. */
  function validPlaintForm(id: string): Record<string, unknown> {
    const cfg = loadTemplateConfig(id)!;
    const form: Record<string, unknown> = {};
    for (const step of cfg.form_schema.steps) {
      for (const f of step.fields) {
        if (!f.required) continue;
        const t = f.type as string;
        const opt = (f as { options?: Array<{ value: string }> }).options?.[0]?.value;
        if (t === 'date') form[f.field_id] = '2026-03-15';
        else if (t === 'currency') form[f.field_id] = 5000;
        else if (opt !== undefined)
          form[f.field_id] = t === 'checkbox_group' || t === 'multi_select_search' ? [opt] : opt;
        else form[f.field_id] = 'Sample value for the plaint';
      }
    }
    return form;
  }

  it('fixture user: past the guard, draft saved with runType fixture; normal user: 404 on the same request', async () => {
    _clearAppSettingsCache();
    await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
    await AppSetting.create({
      key: 'ai.rates.claude-sonnet-4-5-20250929',
      value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
    });
    stub({ [P]: 'off' });
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. The plaintiff submits.', 500, 100));
    const body = { template_id: PLAINT_ID, form_data: validPlaintForm(PLAINT_ID) };

    const normal = await post(USER_ID, body);
    expect(normal.status).toBe(404);
    expect(normal.body).toEqual({ error: 'Template not found' });
    expect(mockMessagesStream).not.toHaveBeenCalled();

    const fixture = await post(GOLDEN_SET_USER_ID, body);
    expect(isHiddenBody(fixture.body)).toBe(false);
    expect(fixture.status).not.toBe(404);
    expect(fixture.status).toBe(200);
    expect(fixture.text).toContain('event: done');
    expect(mockMessagesStream).toHaveBeenCalled();

    const gens = await Generation.find({ userId: GOLDEN_SET_USER_ID }).lean();
    expect(gens).toHaveLength(1);
    expect(gens[0].templateId).toBe(PLAINT_ID);
    expect(gens[0].runOrigin).toBe('fixture');
    const docs = await LawieDocument.find({ userId: GOLDEN_SET_USER_ID }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].runType).toBe('fixture');
    // The normal user wrote nothing.
    expect(await Generation.countDocuments({ userId: USER_ID })).toBe(0);
  });
});
