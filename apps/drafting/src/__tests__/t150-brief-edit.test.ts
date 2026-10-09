/**
 * T-150 - the brief after "Edit my description" (Rule A) and the warning on a
 * regular bail for a client not in custody (Rule B). Both rules are Ajay's,
 * signed in AJ-2026-10-07-T150.
 *
 * Part 1 calls the rules directly. Part 2 goes through POST /intake/brief with a
 * stubbed model, the way the web app sends an edit: a new request with no
 * intake_id and what the advocate typed in `keep`.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  needsNotInCustodyWarning,
  REGULAR_BAIL_NOT_IN_CUSTODY_WARNING,
} from '../services/bail-guard';
import * as intakeBrief from '../services/intake-brief';
import {
  buildBrief,
  buildChecklist,
  buildQuestions,
  GivenValue,
  valuesAfterEditedDescription,
} from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// Every test sets its own model answer; nothing carries over from the one before.
beforeEach(() => {
  mockMessagesStream.mockReset();
});

const WARNING =
  'A regular bail application is usually for a client who is in custody or who will surrender before the court. If your client has not been arrested and will not surrender, you may need anticipatory bail.';
const NOT_ARRESTED = 'No — anticipating arrest';
const POLICE = 'Yes — Police custody';
const JUDICIAL = 'Yes — Judicial custody';
const EDIT = 'My client Ram Kumar is in judicial custody since 13 Sept 2026 in FIR No. 124/2026.';
const EDIT_NO_CUSTODY = 'My client Ram Kumar needs bail in FIR No. 124/2026 at Kotwali.';

const bailPack = loadRulePack('bail_regular')!;
const antiPack = loadRulePack('bail_anticipatory')!;
const BAIL = buildChecklist(bailPack);
const ANTI = buildChecklist(antiPack);
const MAG = buildChecklist(loadRulePack('bail_before_magistrate')!);
// A single-value fact the pack does not require: Rule A can clear it, and it is not asked unless told to.
const OPTIONAL = BAIL.find(
  (i) => !i.required && ['choice', 'date', 'number', 'amount'].includes(i.kind) && i.modelReadable,
)!;

function typed(key: string, value: string): GivenValue {
  return { key, value, source: 'user' };
}

function brief(kindId: string, checklist = BAIL, values: GivenValue[] = []) {
  return buildBrief({
    kind: { id: kindId, name: kindId, court_document: true },
    checklist,
    values,
  });
}

describe('Rule B text and trigger (bail-guard)', () => {
  it('the text is Ajay\'s, word for word', () => {
    expect(REGULAR_BAIL_NOT_IN_CUSTODY_WARNING).toBe(WARNING);
  });

  it.each([
    ['bail_regular', NOT_ARRESTED, true],
    ['bail_regular', null, true],
    ['bail_regular', '', true],
    ['bail_before_magistrate', NOT_ARRESTED, true],
    ['bail_before_magistrate', null, true],
    ['bail_regular', JUDICIAL, false],
    ['bail_regular', POLICE, false],
    ['bail_anticipatory', NOT_ARRESTED, false],
    ['bail_anticipatory', null, false],
    [null, NOT_ARRESTED, false],
  ])('%s with custody %j -> warning %s', (kind, answer, expected) => {
    expect(needsNotInCustodyWarning(kind as string | null, answer as string | null)).toBe(expected);
  });
});

describe('Rule B on the brief (criteria 3, 4, 5)', () => {
  const custody = (b: ReturnType<typeof brief>) => b.items.find((i) => i.key === 'currently_in_custody')!;

  it('criterion 3: regular bail + "No — anticipating arrest" is marked with the exact text', () => {
    const b = brief('bail_regular', BAIL, [typed('currently_in_custody', NOT_ARRESTED)]);
    expect(custody(b)).toMatchObject({ value: NOT_ARRESTED, please_check: true, note: WARNING });
  });

  it('regular bail with no custody answer is marked too', () => {
    const b = brief('bail_regular');
    expect(custody(b)).toMatchObject({ value: null, please_check: true, note: WARNING });
  });

  it('a missing custody date alone does not trigger it', () => {
    const b = brief('bail_regular', BAIL, [typed('currently_in_custody', JUDICIAL)]);
    expect(b.items.find((i) => i.key === 'custody_since')?.value).toBeNull();
    expect(custody(b).please_check).toBe(false);
    expect(custody(b).note).toBeUndefined();
  });

  it('criterion 4: warn, not block. can_confirm and the blockers are what they are without the warning', () => {
    const values = [typed('currently_in_custody', NOT_ARRESTED)];
    const warned = brief('bail_regular', BAIL, values);
    // Same checklist and answers under a kind the rule does not touch.
    const plain = brief('some_other_kind', BAIL, values);
    expect(custody(plain).note).toBeUndefined();
    expect(warned.can_confirm).toBe(plain.can_confirm);
    expect(warned.still_unknown).toEqual(plain.still_unknown);
  });

  it('criterion 5: anticipatory bail + "No — anticipating arrest" has no warning', () => {
    const b = brief('bail_anticipatory', ANTI, [typed('currently_in_custody', NOT_ARRESTED)]);
    expect(b.items.some((i) => i.note !== undefined)).toBe(false);
    expect(b.items.find((i) => i.key === 'currently_in_custody')?.please_check ?? false).toBe(false);
  });
});

describe('Rule A on the values (criteria 1, 2)', () => {
  const read = new Map([
    ['currently_in_custody', { value: JUDICIAL, quote: 'in judicial custody' }],
    ['custody_since', { value: '2026-09-13', quote: 'since 13 Sept 2026' }],
  ]);

  it('criterion 1: a contradicting earlier answer is replaced by the new reading', () => {
    const r = valuesAfterEditedDescription(BAIL, read, [], [typed('currently_in_custody', NOT_ARRESTED)]);
    expect(r.replaced).toEqual(['currently_in_custody']);
    const b = brief('bail_regular', BAIL, r.values);
    expect(b.items.find((i) => i.key === 'currently_in_custody')).toMatchObject({
      value: JUDICIAL,
      source: 'description',
      please_check: true,
    });
    // The old answer is gone as a value (it is still one of the options on offer).
    expect(b.items.filter((i) => i.value === NOT_ARRESTED)).toEqual([]);
    expect(b.unplaced).toEqual([]);
  });

  it('criterion 2: a description silent on custody keeps the earlier answer, unmarked', () => {
    const r = valuesAfterEditedDescription(BAIL, new Map(), [], [typed('currently_in_custody', POLICE)]);
    expect(r.replaced).toEqual([]);
    const b = brief('bail_regular', BAIL, r.values);
    expect(b.items.find((i) => i.key === 'currently_in_custody')).toMatchObject({
      value: POLICE,
      source: 'user',
      please_check: false,
    });
  });

  it('two values in the new reading (ADR-019 4.1.5): earlier answer emptied, nothing guessed', () => {
    const r = valuesAfterEditedDescription(
      BAIL,
      new Map(),
      [{ key: 'currently_in_custody', reason: 'conflict' }],
      [typed('currently_in_custody', NOT_ARRESTED)],
    );
    expect(r.cleared).toEqual(['currently_in_custody']);
    const b = brief('bail_regular', BAIL, r.values);
    expect(b.items.find((i) => i.key === 'currently_in_custody')?.value).toBeNull();
  });

  it('a new reading equal to the earlier answer changes nothing', () => {
    const r = valuesAfterEditedDescription(BAIL, read, [], [typed('currently_in_custody', JUDICIAL)]);
    expect(r.replaced).toEqual([]);
  });
});

describe('Ajay call 3 and call 1 on the values (names, cleared facts, Magistrate bail)', () => {
  it('names: typed "Ram Kumar", edited description reads "Shyam Kumar" -> kept, Please check, no note', () => {
    const read = new Map([['applicant_name', { value: 'Shyam Kumar', quote: 'Shyam Kumar' }]]);
    const r = valuesAfterEditedDescription(BAIL, read, [], [typed('applicant_name', 'Ram Kumar')]);
    expect(r.nameDiffers).toEqual(['applicant_name']);
    expect(r.replaced).toEqual([]);
    const item = brief('bail_regular', BAIL, r.values).items.find((i) => i.key === 'applicant_name')!;
    expect(item).toMatchObject({ value: 'Ram Kumar', source: 'user', please_check: true });
    expect(item.note).toBeUndefined();
  });

  it('names: the same name (case and spacing aside) is not marked', () => {
    const read = new Map([['applicant_name', { value: 'ram  KUMAR', quote: 'Ram Kumar' }]]);
    const r = valuesAfterEditedDescription(BAIL, read, [], [typed('applicant_name', 'Ram Kumar')]);
    expect(r.nameDiffers).toEqual([]);
    const item = brief('bail_regular', BAIL, r.values).items.find((i) => i.key === 'applicant_name')!;
    expect(item).toMatchObject({ value: 'Ram Kumar', please_check: false });
  });

  it('a cleared fact that is not required: empty, shows its blank, and is asked again', () => {
    expect(OPTIONAL).toBeDefined();
    const earlier = [typed(OPTIONAL.key, OPTIONAL.options[0] ?? '5')];
    const r = valuesAfterEditedDescription(
      BAIL,
      new Map(),
      [{ key: OPTIONAL.key, reason: 'conflict' }],
      earlier,
    );
    expect(r.cleared).toEqual([OPTIONAL.key]);
    const b = brief('bail_regular', BAIL, r.values);
    const item = b.items.find((i) => i.key === OPTIONAL.key)!;
    expect(item.value).toBeNull();
    expect(item.placeholder).toBeTruthy();
    // Without alsoAsk a not-required fact is not asked; with it, it is.
    expect(buildQuestions(b, new Map()).some((q) => q.key === OPTIONAL.key)).toBe(false);
    expect(buildQuestions(b, new Map(), new Set(r.cleared)).some((q) => q.key === OPTIONAL.key)).toBe(true);
  });

  it('Magistrate bail with custody "not given" shows the Rule B note, T-153 (option (a) is superseded)', () => {
    const b = brief('bail_before_magistrate', MAG);
    const c = b.items.find((i) => i.key === 'currently_in_custody')!;
    expect(c).toMatchObject({ value: null, please_check: true, note: WARNING });
    expect(needsNotInCustodyWarning('bail_before_magistrate', null)).toBe(true);
  });
});

describe('POST /intake/brief with a stubbed model (criteria 1 to 5)', () => {
  const USER_ID = '507f1f77bcf86cd799439081';
  const MODEL = 'claude-haiku-4-5-20251001';
  const headers = {
    'x-internal-secret': process.env.INTERNAL_SECRET!,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };

  function stub(read: unknown[]) {
    mockMessagesStream.mockReset();
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        JSON.stringify({ outcome: 'read', read, conflicts: [], questions: [] }),
        900,
        120,
      ),
    );
    return mockMessagesStream;
  }

  const post = (body: Record<string, unknown>) =>
    request(app).post('/intake/brief').set(headers).send(body);
  type It = { key: string; value: unknown; source: string | null; please_check: boolean; note?: string };
  const find = (res: request.Response, key: string): It =>
    res.body.brief.items.find((i: It) => i.key === key);

  beforeEach(async () => {
    _clearAppSettingsCache();
    await redis.flushall();
    await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
    });
  });

  afterEach(() => {
    mockMessagesStream.mockReset();
    jest.restoreAllMocks();
  });

  it('criterion 1 (scenario 3): the edit replaces "No — anticipating arrest" with custody and the date, marked', async () => {
    stub([
      { id: 'currently_in_custody', value: JUDICIAL, quote: 'in judicial custody' },
      { id: 'custody_since', value: '2026-09-13', quote: 'in judicial custody since 13 Sept 2026' },
    ]);
    const res = await post({
      description: EDIT,
      kind: 'bail_regular',
      keep: [{ key: 'currently_in_custody', value: NOT_ARRESTED }],
    });
    expect(res.body.outcome).toBe('brief');
    expect(find(res, 'currently_in_custody')).toMatchObject({
      value: JUDICIAL,
      source: 'description',
      please_check: true,
    });
    expect(find(res, 'currently_in_custody').note).toBeUndefined();
    expect(find(res, 'custody_since')).toMatchObject({ value: '2026-09-13', please_check: true });
    expect(res.body.brief.items.filter((i: It) => i.value === NOT_ARRESTED)).toEqual([]);
    expect(res.body.brief.unplaced).toEqual([]);
  });

  it('criterion 2: an edit that does not mention custody keeps "Yes — Police custody", unmarked', async () => {
    stub([{ id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' }]);
    const res = await post({
      description: EDIT_NO_CUSTODY,
      kind: 'bail_regular',
      keep: [{ key: 'currently_in_custody', value: POLICE }],
    });
    expect(find(res, 'currently_in_custody')).toMatchObject({
      value: POLICE,
      source: 'user',
      please_check: false,
    });
    expect(find(res, 'currently_in_custody').note).toBeUndefined();
  });

  it('criteria 3 and 4: regular bail + "No — anticipating arrest" shows the text and can still be confirmed once the rest is given', async () => {
    stub([{ id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' }]);
    const res = await post({
      description: EDIT_NO_CUSTODY,
      kind: 'bail_regular',
      keep: [{ key: 'currently_in_custody', value: NOT_ARRESTED }],
    });
    expect(find(res, 'currently_in_custody')).toMatchObject({
      value: NOT_ARRESTED,
      please_check: true,
      note: WARNING,
    });
    // The warning is not a blocker: the custody item is not among the unknowns.
    expect(res.body.brief.still_unknown.join(' ')).not.toMatch(/custody/i);
  });

  it('criterion 5: anticipatory bail + "No — anticipating arrest" has no warning', async () => {
    stub([]);
    const res = await post({
      description: EDIT_NO_CUSTODY,
      kind: 'bail_anticipatory',
      keep: [{ key: 'currently_in_custody', value: NOT_ARRESTED }],
    });
    expect(res.body.outcome).toBe('brief');
    expect(JSON.stringify(res.body.brief)).not.toContain('you may need anticipatory bail');
  });
  it('names (Ajay): typed "Ram Kumar", edit reads "Shyam Kumar" -> brief shows "Ram Kumar", Please check, no note', async () => {
    stub([{ id: 'applicant_name', value: 'Shyam Kumar', quote: 'Shyam Kumar' }]);
    const res = await post({
      description: 'My client Shyam Kumar is in judicial custody in FIR No. 124/2026.',
      kind: 'bail_regular',
      keep: [{ key: 'applicant_name', value: 'Ram Kumar' }],
    });
    expect(find(res, 'applicant_name')).toMatchObject({
      value: 'Ram Kumar',
      source: 'user',
      please_check: true,
    });
    expect(find(res, 'applicant_name').note).toBeUndefined();
  });

  it('a first description (empty keep) never goes through valuesAfterEditedDescription', async () => {
    const spy = jest.spyOn(intakeBrief, 'valuesAfterEditedDescription');
    stub([{ id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' }]);
    const res = await post({ description: EDIT_NO_CUSTODY, kind: 'bail_regular', keep: [] });
    expect(res.body.outcome).toBe('brief');
    expect(spy).not.toHaveBeenCalled();
    stub([{ id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' }]);
    await post({ description: EDIT_NO_CUSTODY, kind: 'bail_regular' });
    expect(spy).not.toHaveBeenCalled();
    // And an edit (no intake_id, non-empty keep) does.
    stub([]);
    await post({ description: EDIT_NO_CUSTODY, kind: 'bail_regular', keep: [{ key: 'currently_in_custody', value: POLICE }] });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a cleared fact that is not required comes back empty and in the questions', async () => {
    const fetchMock = stub([]);
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      sdkAnswer(
        JSON.stringify({ outcome: 'read', read: [], conflicts: [OPTIONAL.key], questions: [] }),
        0,
        0,
      ),
    );
    const res = await post({
      description: EDIT_NO_CUSTODY,
      kind: 'bail_regular',
      keep: [{ key: OPTIONAL.key, value: OPTIONAL.options[0] ?? '5' }],
    });
    expect(find(res, OPTIONAL.key).value).toBeNull();
    expect(res.body.questions.map((q: { key: string }) => q.key)).toContain(OPTIONAL.key);
  });

  it('Magistrate bail, custody not given: the Rule B warning is on the custody item, T-153', async () => {
    stub([{ id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' }]);
    const res = await post({ description: EDIT_NO_CUSTODY, kind: 'bail_before_magistrate', keep: [] });
    expect(res.body.outcome).toBe('brief');
    expect(find(res, 'currently_in_custody')).toMatchObject({ please_check: true, note: WARNING });
  });
});

describe('Review round 1 fixes: the mark survives /intake/brief/update', () => {
  const headers = {
    'x-internal-secret': process.env.INTERNAL_SECRET!,
    'x-user-id': '507f1f77bcf86cd799439082',
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
  const update = (body: Record<string, unknown>) =>
    request(app).post('/intake/brief/update').set(headers).send(body);
  type It = { key: string; value: unknown; source: string | null; please_check: boolean; note?: string };
  const item = (res: request.Response, key: string): It =>
    res.body.brief.items.find((i: It) => i.key === key);
  const CUSTODY = BAIL.find((i) => i.kind === 'choice' && i.options.includes(JUDICIAL))!.key;

  beforeEach(async () => {
    _clearAppSettingsCache();
    await redis.flushall();
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  });

  it('(1) a kept differing name keeps its mark when another field changes (intake_id is ignored)', async () => {
    // Step 0: the edit. The advocate typed Ram Kumar, the description says Shyam Kumar.
    const read = new Map([['applicant_name', { value: 'Shyam Kumar', quote: 'Shyam Kumar' }]]);
    const edited = valuesAfterEditedDescription(BAIL, read, [], [typed('applicant_name', 'Ram Kumar')]);
    const first = brief('bail_regular', BAIL, edited.values);
    // What the web app sends back (its valuesAfter, not run here: apps/web has no runner).
    const nameItem = first.items.find((i) => i.key === 'applicant_name')!;
    expect(nameItem).toMatchObject({ value: 'Ram Kumar', source: 'user', please_check: true });
    const held = [{ key: 'applicant_name', value: 'Ram Kumar', source: 'user', please_check: true }];
    const res = await update({
      intake_id: '507f1f77bcf86cd799439099',
      kind: 'bail_regular',
      values: [...held, { key: CUSTODY, value: JUDICIAL }],
    });
    expect(res.status).toBe(200);
    expect(item(res, 'applicant_name')).toMatchObject({
      value: 'Ram Kumar',
      source: 'user',
      please_check: true,
    });
    expect(item(res, 'applicant_name').note).toBeUndefined();
    expect(item(res, CUSTODY)).toMatchObject({ value: JUDICIAL, please_check: false });
  });

  it('(2) once the advocate edits the name, the mark is gone', async () => {
    const res = await update({
      kind: 'bail_regular',
      values: [{ key: 'applicant_name', value: 'Ram Kumar Singh' }], // web drops please_check on edit
    });
    expect(item(res, 'applicant_name')).toMatchObject({ value: 'Ram Kumar Singh', please_check: false });
  });

  it('(3) valueSchema accepts please_check in values and in keep, and a non-boolean is refused', async () => {
    const ok = await update({
      kind: 'bail_regular',
      values: [{ key: 'applicant_name', value: 'Ram Kumar', please_check: true }],
    });
    expect(ok.status).toBe(200);
    expect(item(ok, 'applicant_name').please_check).toBe(true);
    const bad = await update({
      kind: 'bail_regular',
      values: [{ key: 'applicant_name', value: 'Ram Kumar', please_check: 'yes' }],
    });
    expect(bad.status).toBe(400);
    // keep on /intake/brief: the schema must not reject it (status is not a validation error).
    mockMessagesStream.mockReset().mockRejectedValue(new Error('503 service unavailable'));
    const keep = await request(app)
      .post('/intake/brief')
      .set(headers)
      .send({
        description: EDIT_NO_CUSTODY,
        kind: 'bail_regular',
        keep: [{ key: 'applicant_name', value: 'Ram Kumar', please_check: true }],
      });
    expect(keep.status).not.toBe(400);
  });

  it('the request can only add a mark, never a value: please_check on an empty value shows nothing', async () => {
    const res = await update({
      kind: 'bail_regular',
      values: [{ key: 'applicant_name', value: '', please_check: true }],
    });
    expect(item(res, 'applicant_name').value).toBeNull();
  });
});

describe('Review round 1 fixes: cleared facts and the question cap', () => {
  it('(4) a cleared non-required fact has reask true and a blank; a required empty one has no reask', () => {
    const b = buildBrief({
      kind: { id: 'bail_regular', name: 'bail_regular', court_document: true },
      checklist: BAIL,
      values: [],
      reask: [OPTIONAL.key],
    });
    const it = b.items.find((i) => i.key === OPTIONAL.key)!;
    expect(it).toMatchObject({ reask: true, value: null });
    expect(it.placeholder).toBeTruthy();
    expect(b.items.filter((i) => i.reask).map((i) => i.key)).toEqual([OPTIONAL.key]);
    // A reask on a fact that has a value is not shown.
    const filled = buildBrief({
      kind: { id: 'bail_regular', name: 'bail_regular', court_document: true },
      checklist: BAIL,
      values: [typed(OPTIONAL.key, OPTIONAL.kind === 'date' ? '2026-03-10' : (OPTIONAL.options[0] ?? '5'))],
      reask: [OPTIONAL.key],
    });
    expect(filled.items.find((i) => i.key === OPTIONAL.key)!.reask).toBeUndefined();
  });

  it('(4) with more than ten missing required facts the cleared fact is still asked, ahead of non-party facts', () => {
    const b = brief('bail_regular');
    const missingRequired = b.items.filter((i) => i.required && i.value === null);
    expect(missingRequired.length).toBeGreaterThan(10);
    const qs = buildQuestions(b, new Map(), new Set([OPTIONAL.key]));
    expect(qs).toHaveLength(10);
    const keys = qs.map((q) => q.key);
    const at = keys.indexOf(OPTIONAL.key);
    expect(at).toBeGreaterThanOrEqual(0);
    const partyKeys = new Set(b.items.filter((i) => i.party_name).map((i) => i.key));
    // Every party name asked comes before it; every non-party question comes after it.
    keys.forEach((k, idx) => {
      if (k === OPTIONAL.key) return;
      if (partyKeys.has(k)) expect(idx).toBeLessThan(at);
      else expect(idx).toBeGreaterThan(at);
    });
    // Without alsoAsk it is not asked at all.
    expect(buildQuestions(b, new Map()).map((q) => q.key)).not.toContain(OPTIONAL.key);
  });
});
