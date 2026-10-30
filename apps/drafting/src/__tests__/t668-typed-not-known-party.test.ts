/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-668 (AJ-668-M1, M2, M3): a typed non-answer ("Not known", "unknown" and the T-655 list) for a
 * required party name blocks, with the pack's existing line and no new strings, in the 8 packs
 * (the 6 plaint packs, replication, written_statement), on both the brief route and the form route
 * (POST /generate-from-template, before any Ink hold, run or model call). O.39 and bail are
 * unchanged (T-671 covers bail). Fictional data only. No network.
 */
import './setupEnv';
import './setupDb';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { TEMPLATE_CIVIL_PLAINT_SETTING } from '../config/catalogue/template-switches';
import {
  isNonAnswerPartyPack,
  NON_ANSWER_PARTY_PACKS,
} from '../config/intake/signed-confirm-messages';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { formRequiredFieldBlock } from '../services/form-ledger';
import { buildBrief, buildChecklist, GivenValue, partyConfirmLine } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { sdkAnswer } from './sdkStream';
import { createVerifiedUser } from './verifiedUser';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd799439668';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;

const PACKS = [
  'plaint_declaration',
  'plaint_eviction',
  'plaint_injunction',
  'plaint_recovery',
  'plaint_specific_performance',
  'plaint_partition',
  'replication',
  'written_statement',
] as const;
const O39 = 'temporary_injunction_o39';
const NON_ANSWERS = ['Not known', 'unknown', 'N/A', 'nil', '?', 'पता नहीं'];
const DEF1_EN = 'Add the name of Defendant No. 1 to continue.'; // plaint_partition, signed (T-650 3h)
const T127 = (who: string, id = '') =>
  `Add the name of the ${
    id === 'plaint_eviction'
      ? who === 'plaintiff'
        ? 'plaintiff / landlord'
        : 'defendant / tenant'
      : who
  } to continue.`;
const NO_LABEL = 'No, Defendant No. 1 is the only defendant';

const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' };
const user = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
const lastSeg = (k: string) => k.split('.').pop();

const briefOf = (id: string, values: GivenValue[], court: any = COURT) =>
  buildBrief({
    kind: { id, name: id, court_document: true },
    checklist: buildChecklist(loadRulePack(id)!),
    values,
    court,
  } as any);

/** Party values for a pack; `over` replaces a name. Partition also needs other_defendants. */
const partyValues = (id: string, over: Record<string, string> = {}): GivenValue[] => {
  const v: Record<string, string> = {
    plaintiff_name: 'Sample Person 1',
    defendant_name: 'Sample Person 2',
    ...over,
  };
  const out = Object.entries(v).map(([k, val]) => user(k, val));
  if (id === 'plaint_partition') out.push(user('other_defendants', NO_LABEL));
  return out;
};

// ── Form route harness ──────────────────────────────────────────────────────

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

/** A form that satisfies every required field of the pack's config, with fictional text. */
function validForm(id: string): Record<string, unknown> {
  const cfg = loadTemplateConfig(id)!;
  const form: Record<string, unknown> = {};
  for (const step of cfg.form_schema.steps) {
    for (const f of step.fields) {
      if (!f.required) continue;
      const t = f.type as string;
      const opt = (f as { options?: Array<{ value: string }> }).options?.[0]?.value;
      if (t === 'date') form[f.field_id] = '2026-03-15';
      else if (t === 'currency' || t === 'number') form[f.field_id] = 5000;
      else if (t === 'boolean') form[f.field_id] = false;
      else if (opt !== undefined)
        form[f.field_id] = t === 'checkbox_group' || t === 'multi_select_search' ? [opt] : opt;
      else form[f.field_id] = 'Plot 000, Sample Nagar, Patna';
    }
  }
  form.plaintiff_name = 'Sample Person 1';
  form.defendant_name = 'Sample Person 2';
  return form;
}

const postForm = (id: string, over: Record<string, unknown> = {}) =>
  request(app)
    .post('/generate-from-template')
    .set(headers())
    .send({ template_id: id, form_data: { ...validForm(id), ...over } });

async function expectNothingRan() {
  expect(mockMessagesStream).not.toHaveBeenCalled();
  expect(await Generation.countDocuments({})).toBe(0);
  expect(await LawieDocument.countDocuments({})).toBe(0);
  const u = (await User.collection.findOne({ _id: OID })) as unknown as {
    inkTopup: number;
    inkSub: number;
    inkHolds: unknown[];
  };
  expect(u.inkTopup).toBe(START_INK);
  expect(u.inkSub).toBe(0);
  expect(u.inkHolds).toEqual([]);
  const rows = await mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: OID })
    .toArray();
  expect(rows).toEqual([]);
}

function events(text: string, name: string): Array<Record<string, any>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}

// ── The scope list ──────────────────────────────────────────────────────────

describe('T-668: NON_ANSWER_PARTY_PACKS', () => {
  it('is exactly the packs whose document-rules JSON category is civil_pleading', () => {
    const dir = path.join(__dirname, '..', 'config', 'document-rules');
    const civil = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .filter(
        (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).category === 'civil_pleading',
      )
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect([...NON_ANSWER_PARTY_PACKS].sort()).toEqual(civil);
    expect(civil).toEqual([...PACKS].sort());
  });

  it('isNonAnswerPartyPack: the 8 yes; O.39, bail, null and unknown ids no', () => {
    for (const p of PACKS) expect(isNonAnswerPartyPack(p)).toBe(true);
    for (const p of [O39, 'bail_regular', 'bail_anticipatory', 'x', '']) {
      expect(isNonAnswerPartyPack(p)).toBe(false);
    }
    expect(isNonAnswerPartyPack(null)).toBe(false);
  });
});

// ── Brief route ─────────────────────────────────────────────────────────────

describe('T-668 brief: a typed non-answer party blocks in the 8 packs', () => {
  it('plaint_partition, defendant_name "Not known": the signed Defendant No. 1 line', () => {
    const b = briefOf(
      'plaint_partition',
      partyValues('plaint_partition', { defendant_name: 'Not known' }),
    );
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_message).toBe(DEF1_EN);
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['defendant_name']);
  });

  it.each(['Not known', 'N/A', 'पता नहीं'])(
    'plaint_recovery and replication, plaintiff_name %j: the T-127 line, and the key is listed',
    (word) => {
      for (const id of ['plaint_recovery', 'replication']) {
        const b = briefOf(id, partyValues(id, { plaintiff_name: word }));
        expect(b.can_confirm).toBe(false);
        expect(b.confirm_blockers).toContain('parties');
        expect(b.confirm_message!.split('\n')[0]).toBe(T127('plaintiff'));
        expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['plaintiff_name']);
      }
    },
  );

  it.each(PACKS.flatMap((p) => NON_ANSWERS.map((w) => [p, w] as [string, string])))(
    '%s, plaintiff_name %j blocks; confirm_missing_party_keys lists it',
    (id, word) => {
      const b = briefOf(id, partyValues(id, { plaintiff_name: word }));
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('parties');
      expect(b.confirm_message!.split('\n')[0]).toBe(T127('plaintiff', id));
      expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['plaintiff_name']);
    },
  );

  it.each(PACKS.flatMap((p) => NON_ANSWERS.map((w) => [p, w] as [string, string])))(
    '%s, defendant_name %j blocks with the pack line',
    (id, word) => {
      const b = briefOf(id, partyValues(id, { defendant_name: word }));
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('parties');
      expect(b.confirm_message!.split('\n')[0]).toBe(
        id === 'plaint_partition' ? DEF1_EN : T127('defendant', id),
      );
      expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['defendant_name']);
    },
  );

  it.each(PACKS)('%s, real fictional names: no party blocker, and the key list is absent', (id) => {
    const b = briefOf(id, partyValues(id));
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.confirm_missing_party_keys).toBeUndefined();
    expect(b.can_confirm).toBe(true);
  });

  it('a longer answer that contains a non-answer word is a name', () => {
    const b = briefOf(
      'plaint_recovery',
      partyValues('plaint_recovery', { plaintiff_name: 'Not Known Traders' }),
    );
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.confirm_missing_party_keys).toBeUndefined();
  });

  it('both parties non-answers: both keys, in pack order', () => {
    const b = briefOf(
      'plaint_recovery',
      partyValues('plaint_recovery', { plaintiff_name: 'Not known', defendant_name: 'unknown' }),
    );
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual([
      'plaintiff_name',
      'defendant_name',
    ]);
  });

  it('bail_regular applicant_name "Not known": unchanged (T-671), same as a real name', () => {
    const base = (name: string) =>
      briefOf('bail_regular', [user('applicant_name', name)], {
        state: 'bihar',
        court_type: 'sessions',
        court: 'district_sessions_patna',
      });
    const nk = base('Not known');
    const real = base('Sample Person 1');
    expect(nk.confirm_blockers).toEqual(real.confirm_blockers);
    expect(nk.confirm_message).toEqual(real.confirm_message);
    expect(nk.confirm_missing_party_keys).toBeUndefined();
    expect(nk.confirm_blockers).not.toContain('parties');
  });
});

describe('T-668 O.39: unchanged', () => {
  it('a typed "Not known" plaintiff still blocks, with the O.39 signed line and its key listed', () => {
    const b = briefOf(O39, [
      user('plaintiff_name', 'Not known'),
      user('defendant_name', 'Sample Person 2'),
    ]);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_message!.split('\n')[0]).toBe("Add the plaintiff's name to continue.");
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['plaintiff_name']);
  });

  it('real names: no party blocker and no key list; the O.39 required-field lines are as before', () => {
    const b = briefOf(O39, [
      user('plaintiff_name', 'Sample Person 1'),
      user('defendant_name', 'Sample Person 2'),
    ]);
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.confirm_missing_party_keys).toBeUndefined();
    expect(b.confirm_blockers).toContain('required_fields');
    expect(b.confirm_message).toBe(
      'Add the relief sought in the main suit to continue.\nAdd the acts the defendant should be restrained from, to continue.',
    );
  });

  it('the form route unit is as before: the O.39 party and field lines, no pack branch', () => {
    expect(
      formRequiredFieldBlock(O39, { plaintiff_name: 'Not known', defendant_name: 'nil' }),
    ).toEqual({
      error: 'brief_not_confirmed',
      message:
        "Add the plaintiff's name to continue.\nAdd the defendant's name to continue.\nAdd the relief sought in the main suit to continue.\nAdd the acts the defendant should be restrained from, to continue.",
      blockers: ['required_fields'],
      confirm_blocking_keys: [
        'plaintiff_name',
        'defendant_name',
        'main_suit_relief',
        'restraint_sought',
      ],
    });
  });
});

// ── Form route unit ─────────────────────────────────────────────────────────

describe('T-668 formRequiredFieldBlock: the 8 packs', () => {
  it.each(PACKS)(
    '%s: a non-answer plaintiff blocks with the brief line (partyConfirmLine)',
    (id) => {
      const block = formRequiredFieldBlock(id, { ...validForm(id), plaintiff_name: 'Not known' });
      const item = buildChecklist(loadRulePack(id)!).find(
        (i) => lastSeg(i.key) === 'plaintiff_name',
      )!;
      expect(block).toEqual({
        error: 'brief_not_confirmed',
        message: partyConfirmLine(id, item.key, item.label),
        blockers: ['required_fields'],
        confirm_blocking_keys: [item.key],
      });
      expect(block!.message).toBe(T127('plaintiff', id));
    },
  );

  it('plaint_partition defendant: the signed Defendant No. 1 line', () => {
    expect(
      formRequiredFieldBlock('plaint_partition', {
        ...validForm('plaint_partition'),
        defendant_name: 'unknown',
      })?.message,
    ).toBe(DEF1_EN);
  });

  it('partyConfirmLine gives the same string on both routes, every pack and both parties', () => {
    for (const id of PACKS) {
      for (const [who, word] of [
        ['plaintiff_name', 'N/A'],
        ['defendant_name', 'Not known'],
      ]) {
        const brief = briefOf(id, partyValues(id, { [who]: word }));
        const block = formRequiredFieldBlock(id, { ...validForm(id), [who]: word });
        expect(block!.message).toBe(brief.confirm_message!.split('\n')[0]);
        expect(block!.confirm_blocking_keys!.map(lastSeg)).toEqual(
          (brief.confirm_missing_party_keys ?? []).map(lastSeg),
        );
      }
    }
  });

  it('written_statement with both missing: the defendant first (pack order), both keys', () => {
    const block = formRequiredFieldBlock('written_statement', {
      ...validForm('written_statement'),
      plaintiff_name: '?',
      defendant_name: 'nil',
    });
    expect(block!.message).toBe(T127('defendant'));
    expect(block!.confirm_blocking_keys!.map(lastSeg)).toEqual([
      'defendant_name',
      'plaintiff_name',
    ]);
  });

  it('empty, null, absent and non-text values block too', () => {
    for (const v of ['', '   ', null, undefined, 0, {}, true]) {
      expect(
        formRequiredFieldBlock('plaint_recovery', {
          ...validForm('plaint_recovery'),
          plaintiff_name: v,
        })?.message,
      ).toBe(T127('plaintiff'));
    }
    const f = validForm('plaint_recovery');
    delete f.plaintiff_name;
    expect(formRequiredFieldBlock('plaint_recovery', f)?.message).toBe(T127('plaintiff'));
  });

  it.each(PACKS)('%s: real names pass', (id) => {
    expect(formRequiredFieldBlock(id, validForm(id))).toBeNull();
  });

  it('bail and other templates: null, even with "Not known" names (T-671)', () => {
    for (const t of ['bail_regular', 'bail_anticipatory', 'nope', '']) {
      expect(
        formRequiredFieldBlock(t, { applicant_name: 'Not known', plaintiff_name: 'Not known' }),
      ).toBeNull();
    }
  });
});

// ── Form route (AJ-668-M2, AJ-668-M3) ───────────────────────────────────────

describe('T-668 form route: POST /generate-from-template', () => {
  beforeEach(async () => {
    mockMessagesStream.mockReset();
    _clearAppSettingsCache();
    // the plaint switch is off in code (T-375); on, so the real form route is reached
    await AppSetting.create({ key: TEMPLATE_CIVIL_PLAINT_SETTING, value: 'on' });
    await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
    });
    await createVerifiedUser({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: START_INK,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('AJ-668-M2: plaint_recovery, plaintiff_name "Not known": 400 brief_not_confirmed, nothing generated', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
    const res = await postForm('plaint_recovery', { plaintiff_name: 'Not known' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'brief_not_confirmed',
      message: T127('plaintiff'),
      blockers: ['required_fields'],
      confirm_blocking_keys: [expect.stringMatching(/plaintiff_name$/)],
    });
    expect(res.text).not.toContain('template_sections');
    expect(res.text).not.toContain('event: done');
    await expectNothingRan();
  });

  // AJ-668-M3: for each of the 8 packs, no draft is generated with a non-answer party name.
  describe.each(PACKS)('AJ-668-M3 %s', (id) => {
    it.each(NON_ANSWERS)(
      'plaintiff_name %j: 400 with the brief line; nothing ran',
      async (word) => {
        mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
        const res = await postForm(id, { plaintiff_name: word });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('brief_not_confirmed');
        expect(res.body.message).toBe(T127('plaintiff', id));
        expect(res.body.blockers).toEqual(['required_fields']);
        expect(res.body.confirm_blocking_keys.map(lastSeg)).toEqual(['plaintiff_name']);
        expect(res.text).not.toContain('Form validation failed');
        await expectNothingRan();
      },
    );

    it.each(NON_ANSWERS)(
      'defendant_name %j: 400 with the brief line; nothing ran',
      async (word) => {
        mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
        const res = await postForm(id, { defendant_name: word });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('brief_not_confirmed');
        expect(res.body.message).toBe(id === 'plaint_partition' ? DEF1_EN : T127('defendant', id));
        expect(res.body.confirm_blocking_keys.map(lastSeg)).toEqual(['defendant_name']);
        await expectNothingRan();
      },
    );

    it('control: real names are not stopped by brief_not_confirmed', async () => {
      mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
      const res = await postForm(id);
      expect(res.text).not.toContain('brief_not_confirmed');
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) expect(events(res.text, 'error')).toEqual([]);
    });
  });

  it('a longer answer containing a non-answer word is a name: not blocked', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
    const res = await postForm('plaint_recovery', { plaintiff_name: 'Not Known Traders' });
    expect(res.text).not.toContain('brief_not_confirmed');
  });

  it('bail_regular with applicant_name "Not known" is not stopped by this check (T-671)', async () => {
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: { applicant_name: 'Not known' } });
    expect(JSON.stringify(res.body)).not.toContain('brief_not_confirmed');
  });
});
