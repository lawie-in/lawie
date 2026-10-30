/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-668b (AJ-668-M5, M5a, M5b, M5c; handoff/legal/T-511-copy-rulings-ajay.md), from Anushka's v1.2.3
 * FAIL: a party name that BEGINS with a section (j)3 non-answer followed by optional whitespace and
 * ( , ; : . (or a dash with whitespace BEFORE it, M5c), or the end of the string, is a non-answer in
 * the 8 M1 packs (and O.39 for party names, M5e), on the brief, the ledger and the form route. Never inside a word. M5a: partyLabel
 * drops one leading "the"; the generic other-party field has its own signed line. O.39 is unchanged.
 * Fictional data only ("Sample Person 1/2"). No network.
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
  GENERIC_PARTY_LINE_OVERRIDES,
  isEmptyOrNonAnswer,
  isPartyNameGuardedField,
  isPartyNonAnswer,
  NON_ANSWER_WITH_TEXT_PARTY_LINE,
} from '../config/intake/signed-confirm-messages';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { formRequiredFieldBlock } from '../services/form-ledger';
import {
  buildBrief,
  buildChecklist,
  GivenValue,
  ledgerGivenKeys,
  partyConfirmLine,
  withoutLedgerGiven,
} from '../services/intake-brief';
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

const USER_ID = '507f1f77bcf86cd799439669';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;

const ANUSHKA =
  'Not known (a person claiming through a forged sale deed, details not available to the plaintiff)';
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
const DEFENDANT_LINE = 'Add the name of the defendant to continue.';
const GENERIC_LINE =
  'Add the name of the person or authority this is against or addressed to, to continue.';
const FIRST_PARTY_LINE = 'Add the name of the person the document is for to continue.';

const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' };
const user = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
const lastSeg = (k: string) => k.split('.').pop()!;

const briefOf = (id: string, values: GivenValue[], court: any = COURT) =>
  buildBrief({
    kind: { id, name: id, court_document: true },
    checklist: buildChecklist(loadRulePack(id)!),
    values,
    court,
  } as any);

const partyValues = (id: string, over: Record<string, string> = {}): GivenValue[] => {
  const v: Record<string, string> = {
    plaintiff_name: 'Sample Person 1',
    defendant_name: 'Sample Person 2',
    ...over,
  };
  const out = Object.entries(v).map(([k, val]) => user(k, val));
  if (id === 'plaint_partition') {
    out.push(user('other_defendants', 'No, Defendant No. 1 is the only defendant'));
  }
  return out;
};

const keyIn = (id: string, name: string): string => {
  const item = buildChecklist(loadRulePack(id)!).find((i) => lastSeg(i.key) === name);
  if (!item) throw new Error(`no ${name} on ${id}`);
  return item.key;
};

// ── 1. isPartyNonAnswer truth table (M5, M5b, M5c) ──────────────────────────

describe('T-668b isPartyNonAnswer', () => {
  const BLOCKS = [
    ANUSHKA,
    'Not known (a person claiming through a forged sale deed)',
    'Not known - claims through deed', // M5b example
    'N/A, see below', // M5b example
    'nil.', // M5 / M5b example
    'पता नहीं (…)', // M5b Hindi example
    'पता नहीं, नाम उपलब्ध नहीं',
    'पता नहीं',
    'NA', // M5 example
    'N/A - to be traced', // M5 example
    // extra punctuation
    'none:',
    'None;',
    'unknown, to be traced',
    'Unknown: see below',
    'unknown.',
    'Not known(x)', // bracket with no space
    'Not known   (x)', // several spaces before the bracket
    'Not known – x', // en dash with whitespace before it
    'N/A – to be traced',
    '  NOT KNOWN (x)  ', // trim and case-insensitive
    'nil\t;',
    '-', // a bare dash is a non-answer by equality
    '?',
    '?, see below',
    // AJ-668-M5d: "." is a boundary at the end, or followed by whitespace then a non-letter
    'N/A.',
    'nil. (see below)',
    'nil. 5',
  ];
  it.each(BLOCKS)('non-answer: %j', (v) => {
    expect(isPartyNonAnswer(v)).toBe(true);
  });

  const PASSES = [
    'Not Known Traders', // M5b: a space then a word is a name
    'Nilesh Kumar', // M5: never inside a word
    'Nagendra',
    'Unknownia',
    'NA Traders',
    'Nil Kanth',
    'Not known to Sample Person 1', // space then a word
    'Sample Person 1',
    'Sample Person 2 (Proprietor)', // a bracket later in a real name
    'Sample Person 1, son of Sample Person 2',
    // AJ-668-M5c: a dash counts only with whitespace BEFORE it
    'Na-Young Kim',
    'Nil-Kanth',
    'Nil-Kanth Rao',
    // AJ-668-M5d: "." then a letter (any script) is an initial, not a boundary
    'Na. Muthukumar',
    'na. मोहन',
    'nil.x',
  ];
  it.each(PASSES)('real name: %j', (v) => {
    expect(isPartyNonAnswer(v)).toBe(false);
  });

  // The two hyphen cases from the pending question: Ajay signed M5c (narrowing), so they pass now.
  // Flip here if the ruling changes again.
  it('AJ-668-M5c: "Na-Young Kim" and "Nil-Kanth" are real names (they blocked before M5c)', () => {
    expect(isPartyNonAnswer('Na-Young Kim')).toBe(false);
    expect(isPartyNonAnswer('Nil-Kanth')).toBe(false);
    expect(isPartyNonAnswer('Nil-Kanth Rao')).toBe(false);
  });

  it('empty and blank values are non-answers (as isEmptyOrNonAnswer)', () => {
    for (const v of ['', '   ', null, undefined]) expect(isPartyNonAnswer(v)).toBe(true);
  });

  it('never narrower than isEmptyOrNonAnswer: whatever it flags, this flags', () => {
    for (const v of ['Not known', 'unknown', 'N/A', 'nil', '?', 'पता नहीं', 'NA', 'none']) {
      expect(isEmptyOrNonAnswer(v)).toBe(true);
      expect(isPartyNonAnswer(v)).toBe(true);
    }
  });

  it('a list is a non-answer only when every entry is', () => {
    expect(isPartyNonAnswer(['Not known (x)', 'nil.'])).toBe(true);
    expect(isPartyNonAnswer(['Not known (x)', 'Sample Person 1'])).toBe(false);
  });

  it('isPartyNameGuardedField: the two party-name keys only', () => {
    expect(isPartyNameGuardedField('plaintiff_name')).toBe(true);
    expect(isPartyNameGuardedField('defendant_name')).toBe(true);
    for (const k of ['main_suit_relief', 'restraint_sought', 'applicant_name', '']) {
      expect(isPartyNameGuardedField(k)).toBe(false);
    }
  });
});

// ── 2. The brief ────────────────────────────────────────────────────────────

describe('T-668b brief', () => {
  it("Anushka's exact value, plaint_declaration defendant_name: blocks with the defendant line and the key", () => {
    const b = briefOf(
      'plaint_declaration',
      partyValues('plaint_declaration', { defendant_name: ANUSHKA }),
    );
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    // AJ-668e: a non-answer followed by text gets the new signed line; the block is unchanged
    expect(b.confirm_message!.split('\n')[0]).toBe(NON_ANSWER_WITH_TEXT_PARTY_LINE);
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['defendant_name']);
  });

  it.each(PACKS)('%s: plaintiff and defendant with a prefixed non-answer both block', (id) => {
    const b = briefOf(
      id,
      partyValues(id, { plaintiff_name: 'N/A - to be traced', defendant_name: 'nil.' }),
    );
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg).sort()).toEqual([
      'defendant_name',
      'plaintiff_name',
    ]);
  });

  it.each(PACKS)(
    '%s: "Not Known Traders" and "Nilesh Kumar" are names (no party blocker)',
    (id) => {
      for (const name of ['Not Known Traders', 'Nilesh Kumar', 'Nagendra', 'Na-Young Kim']) {
        const b = briefOf(id, partyValues(id, { defendant_name: name }));
        expect(b.confirm_blockers).not.toContain('parties');
        expect(b.confirm_missing_party_keys).toBeUndefined();
        expect(b.can_confirm).toBe(true);
      }
    },
  );

  it("a plain description without the non-answer word (the ruling's advice) passes", () => {
    const b = briefOf(
      'plaint_declaration',
      partyValues('plaint_declaration', {
        defendant_name: 'a person claiming through a forged sale deed',
      }),
    );
    expect(b.confirm_blockers).not.toContain('parties');
  });

  it('bail_regular is outside the M1 packs: a prefixed "Not known (x)" applicant is as a real name', () => {
    const base = (name: string) =>
      briefOf('bail_regular', [user('applicant_name', name)], {
        state: 'bihar',
        court_type: 'sessions',
        court: 'district_sessions_patna',
      });
    const nk = base('Not known (x)');
    const real = base('Sample Person 1');
    expect(nk.confirm_blockers).toEqual(real.confirm_blockers);
    expect(nk.confirm_message).toEqual(real.confirm_message);
    expect(nk.confirm_missing_party_keys).toBeUndefined();
  });
});

// ── 3. O.39 unchanged ───────────────────────────────────────────────────────

describe('T-668b O.39 (AJ-668-M5e): party names use the one rule; relief and restraint keep the exact match', () => {
  it('M5e: a prefixed "Not known (x)" plaintiff blocks on O.39 with the signed line and its key', () => {
    const b = briefOf(O39, [
      user('plaintiff_name', ANUSHKA),
      user('defendant_name', 'Sample Person 2'),
    ]);
    expect(b.confirm_blockers).toContain('parties');
    // AJ-668e: the value is a non-answer with text, so the new line replaces the plaintiff line
    expect(b.confirm_message!.split('\n')[0]).toBe(NON_ANSWER_WITH_TEXT_PARTY_LINE);
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['plaintiff_name']);
  });

  it('M5e: look-alike real names still pass on O.39', () => {
    for (const name of ['Not Known Traders', 'Nilesh Kumar', 'Na. Muthukumar', 'Na-Young Kim']) {
      const b = briefOf(O39, [
        user('plaintiff_name', name),
        user('defendant_name', 'Sample Person 2'),
      ]);
      expect(b.confirm_blockers).not.toContain('parties');
      expect(b.confirm_missing_party_keys).toBeUndefined();
    }
  });

  it('M5e: main_suit_relief and restraint_sought "nil. (x)" keep the exact match (not blocked)', () => {
    expect(
      formRequiredFieldBlock(O39, {
        plaintiff_name: 'Sample Person 1',
        defendant_name: 'Sample Person 2',
        main_suit_relief: 'nil. (x)',
        restraint_sought: 'nil. (x)',
      }),
    ).toBeNull();
    const b = briefOf(O39, [
      user('plaintiff_name', 'Sample Person 1'),
      user('defendant_name', 'Sample Person 2'),
      user('main_suit_relief', 'nil. (x)'),
    ]);
    expect(b.confirm_message ?? '').not.toContain('relief sought in the main suit');
  });

  it('bail_regular form: null even for a prefixed party value (T-671)', () => {
    expect(
      formRequiredFieldBlock('bail_regular', { applicant_name: ANUSHKA, plaintiff_name: ANUSHKA }),
    ).toBeNull();
  });

  it('an exact "Not known" plaintiff still blocks with the O.39 signed line', () => {
    const b = briefOf(O39, [
      user('plaintiff_name', 'Not known'),
      user('defendant_name', 'Sample Person 2'),
    ]);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_message!.split('\n')[0]).toBe("Add the plaintiff's name to continue.");
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['plaintiff_name']);
  });

  it('the form route unit for O.39: exact non-answers block as before; M5e adds prefixed party names', () => {
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
    // M5e: a prefixed party value is a party non-answer on O.39 too
    const block = formRequiredFieldBlock(O39, {
      plaintiff_name: ANUSHKA,
      defendant_name: 'Sample Person 2',
    });
    expect(block!.error).toBe('brief_not_confirmed');
    // AJ-668e: the new signed line for a non-answer with text (the block and keys are unchanged)
    expect(block!.message.split('\n')[0]).toBe(NON_ANSWER_WITH_TEXT_PARTY_LINE);
    expect(block!.confirm_blocking_keys).toEqual([
      'plaintiff_name',
      'main_suit_relief',
      'restraint_sought',
    ]);
    expect(block!.confirm_blocking_keys).not.toContain('defendant_name');
  });
});

// ── 4. The ledger ───────────────────────────────────────────────────────────

describe('T-668b ledger', () => {
  const fact = (key: string, text: string) => ({ key, display: text, value: text });

  it.each(['plaintiff_name', 'defendant_name'])(
    'a ledger-held "Not known (…)" %s is not in ledgerGivenKeys (any pack)',
    (name) => {
      for (const id of ['plaint_declaration', O39]) {
        expect(ledgerGivenKeys([fact(keyIn(id, name), ANUSHKA)]).size).toBe(0);
        expect(ledgerGivenKeys([fact(keyIn(id, name), 'nil.')]).size).toBe(0);
        expect(ledgerGivenKeys([fact(keyIn(id, name), 'N/A - to be traced')]).size).toBe(0);
      }
    },
  );

  it('real and look-alike names are given', () => {
    for (const v of ['Sample Person 2', 'Not Known Traders', 'Nilesh Kumar', 'Na-Young Kim']) {
      const k = keyIn('plaint_declaration', 'defendant_name');
      expect([...ledgerGivenKeys([fact(k, v)])]).toEqual([k]);
    }
  });

  it('the value side is checked too: a real display with a prefixed non-answer value is not given', () => {
    const k = keyIn('plaint_declaration', 'defendant_name');
    expect(ledgerGivenKeys([{ key: k, display: 'Sample Person 2', value: 'nil.' }]).size).toBe(0);
  });

  it('plaint_declaration: the ledger-held value does not clear the block; the brief still blocks', () => {
    const id = 'plaint_declaration';
    const base = briefOf(id, [user(keyIn(id, 'plaintiff_name'), 'Sample Person 1')]);
    const k = keyIn(id, 'defendant_name');
    const g = ledgerGivenKeys([fact(k, ANUSHKA)]);
    const b = withoutLedgerGiven(base, g);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_message!.split('\n')[0]).toBe(DEFENDANT_LINE);
    expect(b.confirm_missing_party_keys).toEqual([k]);
    expect(b.ledger_given_keys).toEqual([]);
  });

  it('control: a real ledger-held defendant clears the block', () => {
    const id = 'plaint_declaration';
    const base = briefOf(id, [user(keyIn(id, 'plaintiff_name'), 'Sample Person 1')]);
    const k = keyIn(id, 'defendant_name');
    const b = withoutLedgerGiven(base, ledgerGivenKeys([fact(k, 'Sample Person 2')]));
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.ledger_given_keys).toEqual([k]);
  });

  it('other guarded keys keep their exact-match rule: main_suit_relief "nil." is still given', () => {
    const k = keyIn(O39, 'main_suit_relief');
    expect([...ledgerGivenKeys([fact(k, 'nil.')])]).toEqual([k]);
    expect(ledgerGivenKeys([fact(k, 'nil')]).size).toBe(0);
  });
});

// ── 5. M5a: the doubled "the" and the generic lines ─────────────────────────

describe('T-668b M5a', () => {
  const RULINGS = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'handoff', 'legal', 'T-511-copy-rulings-ajay.md'),
    'utf8',
  );
  const OTHER_LABEL = 'The person or authority it is against or addressed to';
  const FIRST_LABEL = 'The person the document is for';

  it('the override line is byte for byte the signed line in the rulings file', () => {
    expect(RULINGS).toContain(`\`${GENERIC_LINE}\``);
    expect(GENERIC_PARTY_LINE_OVERRIDES['fixed.other_party']).toBe(GENERIC_LINE);
    expect(Object.keys(GENERIC_PARTY_LINE_OVERRIDES)).toEqual(['fixed.other_party']);
  });

  it('the generic other-party field: the override, with any pack id', () => {
    expect(partyConfirmLine(null, 'fixed.other_party', OTHER_LABEL)).toBe(GENERIC_LINE);
    expect(partyConfirmLine('plaint_recovery', 'fixed.other_party', OTHER_LABEL)).toBe(
      GENERIC_LINE,
    );
    expect(GENERIC_LINE).not.toMatch(/ to to /);
  });

  it('the generic first-party field: the T-127 line with one "the" only', () => {
    expect(partyConfirmLine(null, 'fixed.first_party', FIRST_LABEL)).toBe(FIRST_PARTY_LINE);
  });

  it('a lower-case or mixed-case leading "the" is dropped too, once', () => {
    expect(partyConfirmLine(null, 'x.some_party', 'the Opposite Party')).toBe(
      'Add the name of the opposite party to continue.',
    );
    expect(partyConfirmLine(null, 'x.some_party', 'THE Opposite Party')).toBe(
      'Add the name of the opposite party to continue.',
    );
  });

  it('a word that only starts with "the" is kept (Theatre)', () => {
    expect(partyConfirmLine(null, 'x.some_party', 'Theatre Owner')).toBe(
      'Add the name of the theatre owner to continue.',
    );
  });

  it('no pack party label, through partyConfirmLine, gives a doubled "the"', () => {
    const dir = path.join(__dirname, '..', 'config', 'document-rules');
    const ids = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
    expect(ids.length).toBeGreaterThanOrEqual(PACKS.length);
    let scanned = 0;
    for (const id of ids) {
      const pack = loadRulePack(id);
      if (!pack) continue;
      for (const item of buildChecklist(pack)) {
        if (!item.partyName) continue;
        const line = partyConfirmLine(id, item.key, item.label);
        scanned += 1;
        expect(line).not.toMatch(/\bthe\s+the\b/i);
        expect(line).not.toMatch(/ to to /);
      }
    }
    for (const [key, label] of [
      ['fixed.first_party', FIRST_LABEL],
      ['fixed.other_party', OTHER_LABEL],
    ]) {
      expect(partyConfirmLine(null, key, label)).not.toMatch(/\bthe\s+the\b/i);
      scanned += 1;
    }
    expect(scanned).toBeGreaterThan(PACKS.length * 2);
  });
});

// ── 6. The form route ───────────────────────────────────────────────────────

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

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

describe('T-668b form route: POST /generate-from-template', () => {
  beforeEach(async () => {
    mockMessagesStream.mockReset();
    _clearAppSettingsCache();
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

  it("Anushka's value as the plaint_declaration defendant: 400, the defendant line, no Ink, no model call", async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
    const res = await postForm('plaint_declaration', { defendant_name: ANUSHKA });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.message).toBe(NON_ANSWER_WITH_TEXT_PARTY_LINE);
    expect(res.body.blockers).toEqual(['required_fields']);
    expect(res.body.confirm_blocking_keys.map(lastSeg)).toEqual(['defendant_name']);
    expect(res.text).not.toContain('event: done');
    await expectNothingRan();
  });

  it.each([
    ['N/A - to be traced', NON_ANSWER_WITH_TEXT_PARTY_LINE],
    ['nil.', 'Add the name of the plaintiff to continue.'],
    ['Not known - claims through deed', NON_ANSWER_WITH_TEXT_PARTY_LINE],
    ['पता नहीं (…)', NON_ANSWER_WITH_TEXT_PARTY_LINE],
  ])('plaint_declaration plaintiff_name %j: 400 and nothing ran', async (word, line) => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
    const res = await postForm('plaint_declaration', { plaintiff_name: word });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.message).toBe(line);
    await expectNothingRan();
  });

  it.each(PACKS)('%s: a prefixed non-answer defendant is stopped before any run', async (id) => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
    const res = await postForm(id, { defendant_name: ANUSHKA });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.confirm_blocking_keys.map(lastSeg)).toEqual(['defendant_name']);
    await expectNothingRan();
  });

  it.each(['Not Known Traders', 'Nilesh Kumar', 'Na-Young Kim'])(
    '%j passes the brief check (not stopped by brief_not_confirmed)',
    async (name) => {
      mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
      const res = await postForm('plaint_declaration', { defendant_name: name });
      expect(res.text).not.toContain('brief_not_confirmed');
    },
  );

  it('formRequiredFieldBlock unit: Anushka value gives the message; "Not Known Traders" gives null', () => {
    expect(
      formRequiredFieldBlock('plaint_declaration', {
        ...validForm('plaint_declaration'),
        defendant_name: ANUSHKA,
      })?.message,
    ).toBe(NON_ANSWER_WITH_TEXT_PARTY_LINE);
    expect(
      formRequiredFieldBlock('plaint_declaration', {
        ...validForm('plaint_declaration'),
        defendant_name: 'Not Known Traders',
      }),
    ).toBeNull();
  });
});
