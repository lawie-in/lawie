/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-668e (AJ-668e; handoff/legal/T-511-copy-rulings-ajay.md): a party name that is a description which
 * identifies the party passes; a non-answer followed by text is still refused, now with a NEW signed
 * line (NON_ANSWER_WITH_TEXT_PARTY_LINE) instead of the party's own line. Which keys block is
 * unchanged (T-668b, T-668c). A bare non-answer keeps the normal line. Fictional data only.
 */
import './setupEnv';
import './setupDb';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { TEMPLATE_CIVIL_PLAINT_SETTING } from '../config/catalogue/template-switches';
import * as signed from '../config/intake/signed-confirm-messages';
import {
  isNonAnswerWithText,
  isPartyNonAnswer,
  NON_ANSWER_PARTY_PACKS,
  NON_ANSWER_TAIL,
  NON_ANSWER_WITH_TEXT_PARTY_LINE,
  O39_CONFIRM_MESSAGES,
  O39_NON_ANSWERS,
  requiredFieldBlockers,
} from '../config/intake/signed-confirm-messages';
import { AppSetting } from '../models/AppSetting.model';
import { Generation } from '../models/Generation.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { formRequiredFieldBlock } from '../services/form-ledger';
import {
  buildBrief,
  buildChecklist,
  fixedChecklist,
  FIXED_KEYS,
  GivenValue,
  ledgerGivenKeys,
  partyConfirmLine,
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

const USER_ID = '507f1f77bcf86cd79943966e';
const MODEL = 'claude-sonnet-4-5-20250929';

const NEW_LINE =
  'Give the name, or only a description that identifies the party, without words like "Not known".';
const O39 = 'temporary_injunction_o39';
const DECL = 'plaint_declaration';
const PACK_IDS = [...NON_ANSWER_PARTY_PACKS] as string[];
const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' };

const ANUSHKA =
  'Defendant: Not known (a person claiming through a forged sale deed, details not available to the plaintiff)';
// Ajay's four values: all still refused, with the new line.
const WITH_TEXT = [
  'Not known (buyer under the sale deed)',
  'Not known - claims through deed',
  'Unknown, the tenant',
  'पता नहीं (…)',
  ANUSHKA,
];
const DESCRIPTION = 'a person claiming through a forged sale deed';
const BARE = ['Not known', 'N/A', '', 'Not known.', 'Defendant'];
const REAL_NAMES = ['Not Known Traders', 'Nilesh Kumar', 'Na-Young Kim'];

const lastSeg = (k: string) => k.split('.').pop()!;
const user = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
const fact = (key: string, text: string) => ({ key, display: text, value: text });

const briefOf = (id: string, values: GivenValue[]) =>
  buildBrief({
    kind: { id, name: id, court_document: true },
    checklist: buildChecklist(loadRulePack(id)!),
    values,
    court: COURT,
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

const o39Values = (over: Record<string, string> = {}): GivenValue[] =>
  Object.entries({
    plaintiff_name: 'Sample Person 1',
    defendant_name: 'Sample Person 2',
    ...over,
  }).map(([k, val]) => user(k, val));

const keyIn = (id: string, name: string): string => {
  const item = buildChecklist(loadRulePack(id)!).find((i) => lastSeg(i.key) === name);
  if (!item) throw new Error(`no ${name} on ${id}`);
  return item.key;
};

function generic(first: string | null, other: string | null, ledger?: Array<[string, string]>) {
  const values: GivenValue[] = [];
  if (first !== null) values.push(user(FIXED_KEYS.firstParty, first));
  if (other !== null) values.push(user(FIXED_KEYS.otherParty, other));
  values.push(user(FIXED_KEYS.facts, 'A sample dispute about Plot 000.'));
  values.push(user(FIXED_KEYS.relief, 'A sample declaration.'));
  return buildBrief({
    kind: { id: null, name: 'Document', court_document: true },
    checklist: fixedChecklist(true),
    values,
    court: COURT,
    ...(ledger ? { ledgerGiven: ledgerGivenKeys(ledger.map(([k, v]) => fact(k, v))) } : {}),
  } as any);
}

const firstLine = (b: { confirm_message?: string | null }) =>
  (b.confirm_message ?? '').split('\n')[0];

/** A valid form for the O.39 form route unit (relief and restraint given). */
const o39Form = (over: Record<string, unknown> = {}) => ({
  plaintiff_name: 'Sample Person 1',
  defendant_name: 'Sample Person 2',
  main_suit_relief: 'A sample relief.',
  restraint_sought: 'A sample restraint.',
  ...over,
});

// ── (f) the exact string ────────────────────────────────────────────────────

describe('T-668e (f): the signed line, byte for byte', () => {
  it('is exactly the signed string', () => {
    expect(NON_ANSWER_WITH_TEXT_PARTY_LINE).toBe(NEW_LINE);
    expect(NON_ANSWER_WITH_TEXT_PARTY_LINE).toBe(
      'Give the name, or only a description that identifies the party, without words like "Not known".',
    );
  });

  it('has the SHA-256 of the signed bytes', () => {
    expect(crypto.createHash('sha256').update(NEW_LINE, 'utf8').digest('hex')).toBe(
      '6dd0ef3a58740e6188dfd19feb4f45190f4630a46d49fa7deeca2055884c3158',
    );
    expect(
      crypto.createHash('sha256').update(NON_ANSWER_WITH_TEXT_PARTY_LINE, 'utf8').digest('hex'),
    ).toBe('6dd0ef3a58740e6188dfd19feb4f45190f4630a46d49fa7deeca2055884c3158');
  });

  it('uses straight ASCII quotes and no trailing space', () => {
    expect(NEW_LINE).not.toMatch(/[\u201c\u201d\u2018\u2019\u00a0]/);
    expect(NEW_LINE).toBe(NEW_LINE.trim());
    expect(NEW_LINE.endsWith('.')).toBe(true);
  });
});

// ── (g) nothing else signed moved ───────────────────────────────────────────

describe('T-668e (g): the existing signed lines and lists are unchanged', () => {
  it('O39_CONFIRM_MESSAGES en and hi are as signed', () => {
    expect(O39_CONFIRM_MESSAGES).toEqual({
      plaintiff_name: {
        en: "Add the plaintiff's name to continue.",
        hi: 'आगे बढ़ने के लिए वादी का नाम जोड़िए।',
      },
      defendant_name: {
        en: "Add the defendant's name to continue.",
        hi: 'आगे बढ़ने के लिए प्रतिवादी का नाम जोड़िए।',
      },
      main_suit_relief: {
        en: 'Add the relief sought in the main suit to continue.',
        hi: 'आगे बढ़ने के लिए मुख्य वाद में माँगी गई राहत जोड़िए।',
      },
      restraint_sought: {
        en: 'Add the acts the defendant should be restrained from, to continue.',
        hi: 'आगे बढ़ने के लिए वे कार्य जोड़िए जिनसे प्रतिवादी को रोका जाना है।',
      },
    });
  });

  it('the generic overrides, the pack lines and the pack list keep their signed content', () => {
    expect(signed.GENERIC_PARTY_LINE_OVERRIDES).toEqual({
      'fixed.other_party':
        'Add the name of the person or authority this is against or addressed to, to continue.',
    });
    expect(partyConfirmLine(null, FIXED_KEYS.firstParty, 'the person the document is for')).toBe(
      'Add the name of the person the document is for to continue.',
    );
    expect(signed.PACK_CONFIRM_MESSAGES.plaint_partition.other_defendants.en).toBe(
      'Say whether there are other defendants to continue.',
    );
    expect(signed.PACK_CONFIRM_MESSAGES.plaint_partition.other_defendants.hi).toBe(
      'आगे बढ़ने के लिए बताइए कि क्या अन्य प्रतिवादी भी हैं।',
    );
    expect(signed.PACK_CONFIRM_MESSAGES.plaint_partition.defendant_name.en).toBe(
      'Add the name of Defendant No. 1 to continue.',
    );
    expect(signed.PACK_CONFIRM_MESSAGES.plaint_partition.defendant_name.hi).toBe(
      'आगे बढ़ने के लिए प्रतिवादी संख्या 1 का नाम जोड़िए।',
    );
    expect([...NON_ANSWER_PARTY_PACKS].sort()).toEqual(
      [
        'plaint_declaration',
        'plaint_eviction',
        'plaint_injunction',
        'plaint_recovery',
        'plaint_specific_performance',
        'plaint_partition',
        'replication',
        'written_statement',
      ].sort(),
    );
  });

  it('NON_ANSWER_TAIL is unchanged', () => {
    expect(NON_ANSWER_TAIL.source).toBe('^(\\s*[(,;:]|\\s*\\.(?:$|\\s+[^\\p{L}\\s])|\\s+[-–])');
    expect(NON_ANSWER_TAIL.flags).toBe('u');
  });

  it('O39_NON_ANSWERS keeps the §(j)3 entries', () => {
    expect([...O39_NON_ANSWERS]).toEqual([
      'Not known',
      'unknown',
      'NA',
      'N/A',
      'nil',
      'none',
      '-',
      '?',
      'नहीं पता',
      'पता नहीं',
    ]);
  });

  it('the block decision is unchanged: isPartyNonAnswer on the cases of this ticket', () => {
    for (const v of [...WITH_TEXT, ...BARE]) expect(isPartyNonAnswer(v)).toBe(true);
    for (const v of [...REAL_NAMES, DESCRIPTION, `Respondent: ${DESCRIPTION}`]) {
      expect(isPartyNonAnswer(v)).toBe(false);
    }
  });
});

// ── isNonAnswerWithText truth table ─────────────────────────────────────────

describe('T-668e: isNonAnswerWithText', () => {
  it.each(WITH_TEXT)('true: %j', (v) => {
    expect(isNonAnswerWithText(v)).toBe(true);
  });

  it.each(BARE)('false (bare non-answer): %j', (v) => {
    expect(isNonAnswerWithText(v)).toBe(false);
  });

  it.each([DESCRIPTION, `Respondent: ${DESCRIPTION}`, ...REAL_NAMES, 'Sample Person 1'])(
    'false (passes): %j',
    (v) => {
      expect(isNonAnswerWithText(v)).toBe(false);
    },
  );

  it('false for null, undefined, numbers and an empty list', () => {
    for (const v of [null, undefined, 0, 5, {}, []]) expect(isNonAnswerWithText(v)).toBe(false);
  });
});

// ── (a) block + new line: brief ─────────────────────────────────────────────

describe('T-668e (a): a non-answer followed by text blocks with the new line', () => {
  describe.each(PACK_IDS)('%s', (id) => {
    it.each(WITH_TEXT)('defendant_name %j: blocks, new line, the key', (v) => {
      const b = briefOf(id, partyValues(id, { defendant_name: v }));
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('parties');
      expect(firstLine(b)).toBe(NEW_LINE);
      expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['defendant_name']);
    });
  });

  it.each(WITH_TEXT)('plaint_declaration plaintiff_name %j: blocks, new line, the key', (v) => {
    const b = briefOf(DECL, partyValues(DECL, { plaintiff_name: v }));
    expect(b.can_confirm).toBe(false);
    expect(firstLine(b)).toBe(NEW_LINE);
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['plaintiff_name']);
  });

  it.each(WITH_TEXT)('O.39 plaintiff_name %j: blocks, new line, the key', (v) => {
    const b = briefOf(O39, o39Values({ plaintiff_name: v }));
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect(firstLine(b)).toBe(NEW_LINE);
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['plaintiff_name']);
  });

  it.each(WITH_TEXT)('O.39 defendant_name %j: blocks, new line, the key', (v) => {
    const b = briefOf(O39, o39Values({ defendant_name: v }));
    expect(b.can_confirm).toBe(false);
    expect(firstLine(b)).toBe(NEW_LINE);
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['defendant_name']);
  });

  it.each(WITH_TEXT)('generic fixed.other_party %j on a court document: new line wins', (v) => {
    for (const ledger of [undefined, [[FIXED_KEYS.otherParty, v]] as Array<[string, string]>]) {
      const b = generic('Sample Person 1', v, ledger);
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('parties');
      expect(b.confirm_missing_party_keys).toEqual([FIXED_KEYS.otherParty]);
      expect(b.ledger_given_keys ?? []).not.toContain(FIXED_KEYS.otherParty);
      expect(b.confirm_message).toBe(NEW_LINE);
    }
  });

  it('generic fixed.first_party takes the new line too (it beats the generic override)', () => {
    const b = generic('Not known (buyer under the sale deed)', 'Sample Person 2');
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_missing_party_keys).toEqual([FIXED_KEYS.firstParty]);
    expect(b.confirm_message).toBe(NEW_LINE);
  });

  it('a role label is stripped first: "Defendant: Not known (x)" gets the new line (e)', () => {
    const b = briefOf(DECL, partyValues(DECL, { defendant_name: 'Defendant: Not known (x)' }));
    expect(b.can_confirm).toBe(false);
    expect(firstLine(b)).toBe(NEW_LINE);
    const g = generic('Sample Person 1', 'Defendant: Not known (x)');
    expect(g.confirm_message).toBe(NEW_LINE);
  });

  it('partyConfirmLine: the value picks the line; without a value, the normal line', () => {
    const key = keyIn(DECL, 'defendant_name');
    expect(partyConfirmLine(DECL, key, 'defendant', 'Not known (x)')).toBe(NEW_LINE);
    expect(partyConfirmLine(DECL, key, 'defendant', 'Not known')).not.toBe(NEW_LINE);
    expect(partyConfirmLine(DECL, key, 'defendant')).not.toBe(NEW_LINE);
    expect(partyConfirmLine(DECL, key, 'defendant', undefined)).toBe(
      partyConfirmLine(DECL, key, 'defendant'),
    );
  });
});

// ── (a) block + new line: form route unit ───────────────────────────────────

describe('T-668e (a): the form route unit gives the new line, same keys', () => {
  describe.each(PACK_IDS)('%s', (id) => {
    it.each(WITH_TEXT)('defendant_name %j: blocks with the new line', (v) => {
      const block = formRequiredFieldBlock(id, {
        plaintiff_name: 'Sample Person 1',
        defendant_name: v,
      });
      expect(block).not.toBeNull();
      expect(block!.error).toBe('brief_not_confirmed');
      expect(block!.message).toBe(NEW_LINE);
      expect(block!.blockers).toEqual(['required_fields']);
      expect(block!.confirm_blocking_keys.map(lastSeg)).toEqual(['defendant_name']);
    });
  });

  it.each(WITH_TEXT)('O.39 plaintiff_name %j: new line first, keys unchanged', (v) => {
    const block = formRequiredFieldBlock(O39, o39Form({ plaintiff_name: v }));
    expect(block!.error).toBe('brief_not_confirmed');
    expect(block!.message).toBe(NEW_LINE);
    expect(block!.confirm_blocking_keys).toEqual(['plaintiff_name']);
  });

  it.each(WITH_TEXT)('O.39 defendant_name %j: new line, keys unchanged', (v) => {
    const block = formRequiredFieldBlock(O39, o39Form({ defendant_name: v }));
    expect(block!.message).toBe(NEW_LINE);
    expect(block!.confirm_blocking_keys).toEqual(['defendant_name']);
  });

  it('requiredFieldBlockers: the new line for a with-text value, the normal line for a bare one', () => {
    expect(
      requiredFieldBlockers({
        ...o39Form(),
        plaintiff_name: 'Not known (x)',
        defendant_name: 'N/A',
      }),
    ).toEqual([
      { key: 'plaintiff_name', en: NEW_LINE },
      { key: 'defendant_name', en: O39_CONFIRM_MESSAGES.defendant_name.en },
    ]);
  });

  it('relief and restraint never get the new line (they are not party names)', () => {
    const out = requiredFieldBlockers({
      ...o39Form(),
      main_suit_relief: 'nil',
      restraint_sought: 'nil',
    });
    expect(out).toEqual([
      { key: 'main_suit_relief', en: O39_CONFIRM_MESSAGES.main_suit_relief.en },
      { key: 'restraint_sought', en: O39_CONFIRM_MESSAGES.restraint_sought.en },
    ]);
  });

  it('packs: with two missing parties the message follows the first missing one (pack order)', () => {
    // plaintiff bare, defendant with text: the plaintiff is first, so its normal line shows
    const a = formRequiredFieldBlock(DECL, {
      plaintiff_name: 'Not known',
      defendant_name: 'Not known (x)',
    });
    expect(a!.message).not.toBe(NEW_LINE);
    expect(a!.confirm_blocking_keys.map(lastSeg)).toEqual(['plaintiff_name', 'defendant_name']);
    // plaintiff with text, defendant bare: the new line shows
    const b = formRequiredFieldBlock(DECL, {
      plaintiff_name: 'Not known (x)',
      defendant_name: 'Not known',
    });
    expect(b!.message).toBe(NEW_LINE);
    expect(b!.confirm_blocking_keys.map(lastSeg)).toEqual(['plaintiff_name', 'defendant_name']);
  });
});

// ── (b) a description passes ────────────────────────────────────────────────

describe('T-668e (b): a description that identifies the party passes', () => {
  it.each(PACK_IDS)('%s: defendant_name is not a block, and the stored value is as typed', (id) => {
    const b = briefOf(id, partyValues(id, { defendant_name: DESCRIPTION }));
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.confirm_missing_party_keys).toBeUndefined();
    expect(b.confirm_message ?? '').not.toBe(NEW_LINE);
    const item = b.items.find((i) => lastSeg(i.key) === 'defendant_name')!;
    expect(item.value).toBe(DESCRIPTION);
    expect(
      formRequiredFieldBlock(id, {
        plaintiff_name: 'Sample Person 1',
        defendant_name: DESCRIPTION,
      }),
    ).toBeNull();
  });

  it('plaintiff_name too, on plaint_declaration', () => {
    const b = briefOf(DECL, partyValues(DECL, { plaintiff_name: DESCRIPTION }));
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.items.find((i) => lastSeg(i.key) === 'plaintiff_name')!.value).toBe(DESCRIPTION);
  });

  it('O.39: passes on both party names, form route null, value as typed', () => {
    const b = briefOf(O39, o39Values({ plaintiff_name: DESCRIPTION, defendant_name: DESCRIPTION }));
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.confirm_missing_party_keys).toBeUndefined();
    for (const n of ['plaintiff_name', 'defendant_name']) {
      expect(b.items.find((i) => lastSeg(i.key) === n)!.value).toBe(DESCRIPTION);
    }
    expect(
      formRequiredFieldBlock(
        O39,
        o39Form({ plaintiff_name: DESCRIPTION, defendant_name: DESCRIPTION }),
      ),
    ).toBeNull();
    expect(requiredFieldBlockers(o39Form({ plaintiff_name: DESCRIPTION }))).toEqual([]);
  });

  it('ledgerGivenKeys counts it as given (display and value untouched)', () => {
    const k = keyIn(DECL, 'defendant_name');
    expect(ledgerGivenKeys([fact(k, DESCRIPTION)]).has(k)).toBe(true);
    expect(
      ledgerGivenKeys([fact(FIXED_KEYS.otherParty, DESCRIPTION)]).has(FIXED_KEYS.otherParty),
    ).toBe(true);
    expect(
      ledgerGivenKeys([fact(FIXED_KEYS.firstParty, DESCRIPTION)]).has(FIXED_KEYS.firstParty),
    ).toBe(true);
    // the same fact with a non-answer prefix is still not given
    expect(ledgerGivenKeys([fact(k, 'Not known (x)')]).has(k)).toBe(false);
  });

  it('generic fixed.other_party: confirms, value kept as typed', () => {
    const b = generic('Sample Person 1', DESCRIPTION);
    expect(b.can_confirm).toBe(true);
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.items.find((i) => i.key === FIXED_KEYS.otherParty)!.value).toBe(DESCRIPTION);
  });

  it('the checks do not change or trim the text they are given', () => {
    const vals = { plaintiff_name: DESCRIPTION, defendant_name: ` ${DESCRIPTION} ` };
    const copy = JSON.stringify(vals);
    requiredFieldBlockers(vals);
    formRequiredFieldBlock(DECL, vals);
    isNonAnswerWithText(vals.defendant_name);
    expect(JSON.stringify(vals)).toBe(copy);
  });
});

// ── (c) real names pass ─────────────────────────────────────────────────────

describe('T-668e (c): look-alike real names pass', () => {
  it.each(REAL_NAMES)('%j passes on a pack, on O.39 and on the generic path', (name) => {
    const b = briefOf(DECL, partyValues(DECL, { defendant_name: name }));
    expect(b.confirm_blockers).not.toContain('parties');
    expect(
      formRequiredFieldBlock(DECL, { plaintiff_name: 'Sample Person 1', defendant_name: name }),
    ).toBeNull();
    const o = briefOf(O39, o39Values({ plaintiff_name: name }));
    expect(o.confirm_blockers).not.toContain('parties');
    expect(formRequiredFieldBlock(O39, o39Form({ plaintiff_name: name }))).toBeNull();
    const g = generic('Sample Person 1', name);
    expect(g.confirm_blockers).not.toContain('parties');
    expect(isNonAnswerWithText(name)).toBe(false);
  });
});

// ── (d) bare non-answers keep the normal line ───────────────────────────────

describe('T-668e (d): a bare non-answer still blocks, with the normal line', () => {
  it.each(BARE)('plaint_declaration defendant_name %j: blocks, not the new line', (v) => {
    const normal = partyConfirmLine(DECL, keyIn(DECL, 'defendant_name'), 'defendant');
    expect(normal).not.toBe(NEW_LINE);
    const b = briefOf(DECL, partyValues(DECL, { defendant_name: v }));
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect(firstLine(b)).not.toBe(NEW_LINE);
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual(['defendant_name']);
    const block = formRequiredFieldBlock(DECL, {
      plaintiff_name: 'Sample Person 1',
      defendant_name: v,
    });
    expect(block).not.toBeNull();
    expect(block!.message).toBe(normal);
    expect(block!.confirm_blocking_keys.map(lastSeg)).toEqual(['defendant_name']);
  });

  it.each(BARE)('O.39 plaintiff_name %j: blocks with the plaintiff line', (v) => {
    const b = briefOf(O39, o39Values({ plaintiff_name: v }));
    expect(b.confirm_blockers).toContain('parties');
    expect(firstLine(b)).toBe(O39_CONFIRM_MESSAGES.plaintiff_name.en);
    const block = formRequiredFieldBlock(O39, o39Form({ plaintiff_name: v }));
    expect(block!.message).toBe(O39_CONFIRM_MESSAGES.plaintiff_name.en);
    expect(block!.confirm_blocking_keys).toEqual(['plaintiff_name']);
  });

  it.each(BARE)('generic fixed.other_party %j: blocks with the other-party line', (v) => {
    const b = generic('Sample Person 1', v);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toBe(signed.GENERIC_PARTY_LINE_OVERRIDES['fixed.other_party']);
  });

  it('FINDING: "Not known yet" is NOT a block today (no NON_ANSWER_TAIL after the non-answer)', () => {
    // The handoff listed it as a bare non-answer that blocks. At the current source it does not
    // block at all, so it never reaches either line. Block logic is unchanged by T-668e.
    expect(isPartyNonAnswer('Not known yet')).toBe(false);
    expect(isNonAnswerWithText('Not known yet')).toBe(false);
    const b = briefOf(DECL, partyValues(DECL, { defendant_name: 'Not known yet' }));
    expect(b.confirm_blockers).not.toContain('parties');
  });

  it('a courtesy word after a bare non-answer is still bare', () => {
    expect(isNonAnswerWithText('Not known, sir')).toBe(false);
    expect(isPartyNonAnswer('Not known, sir')).toBe(true);
  });
});

// ── (e) role labels ─────────────────────────────────────────────────────────

describe('T-668e (e): role-labelled values', () => {
  it('"Defendant: Not known (x)" is a non-answer with text; a bare "Defendant: Not known" is not', () => {
    expect(isNonAnswerWithText('Defendant: Not known (x)')).toBe(true);
    expect(isNonAnswerWithText('Defendant: Not known')).toBe(false);
    expect(isPartyNonAnswer('Defendant: Not known')).toBe(true);
  });

  it('"Respondent: a person claiming through a forged sale deed" passes everywhere', () => {
    const v = `Respondent: ${DESCRIPTION}`;
    expect(isPartyNonAnswer(v)).toBe(false);
    const b = briefOf(DECL, partyValues(DECL, { defendant_name: v }));
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.items.find((i) => lastSeg(i.key) === 'defendant_name')!.value).toBe(v);
    expect(
      formRequiredFieldBlock(DECL, { plaintiff_name: 'Sample Person 1', defendant_name: v }),
    ).toBeNull();
    expect(generic('Sample Person 1', v).confirm_blockers).not.toContain('parties');
    const k = keyIn(DECL, 'defendant_name');
    expect(ledgerGivenKeys([fact(k, v)]).has(k)).toBe(true);
  });

  it('"Respondent: Not Known Traders" passes (M6)', () => {
    expect(isPartyNonAnswer('Respondent: Not Known Traders')).toBe(false);
    expect(isNonAnswerWithText('Respondent: Not Known Traders')).toBe(false);
  });
});

// ── (h) edge: "Not known ()" ────────────────────────────────────────────────

describe('T-668e (h): edge "Not known ()" (CURRENT BEHAVIOUR, for Ajay to rule)', () => {
  it('RECORDS: it blocks, and counts as "with text", so it gets the new line', () => {
    // The empty brackets hold no words, but only spaces and end punctuation count as
    // "no text"; ")" is neither, so this is "with text". If Ajay rules it is a bare
    // non-answer, change these two expectations to false / the normal line.
    expect(isPartyNonAnswer('Not known ()')).toBe(true);
    expect(isNonAnswerWithText('Not known ()')).toBe(true);
    const b = briefOf(DECL, partyValues(DECL, { defendant_name: 'Not known ()' }));
    expect(b.can_confirm).toBe(false);
    expect(firstLine(b)).toBe(NEW_LINE);
  });
});

// ── (i) both parties on O.39 ────────────────────────────────────────────────

describe('T-668e (i): both parties a non-answer with text on O.39', () => {
  const both = o39Values({
    plaintiff_name: 'Not known (buyer under the sale deed)',
    defendant_name: 'Unknown, the tenant',
  });

  it('the brief shows the new line once per party, keys in order', () => {
    const b = briefOf(O39, both);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    const lines = (b.confirm_message ?? '').split('\n');
    expect(lines.filter((l) => l === NEW_LINE)).toHaveLength(2);
    expect(lines[0]).toBe(NEW_LINE);
    expect(lines[1]).toBe(NEW_LINE);
    expect((b.confirm_missing_party_keys ?? []).map(lastSeg)).toEqual([
      'plaintiff_name',
      'defendant_name',
    ]);
  });

  it('the form route unit: the new line per party, then relief/restraint only if missing', () => {
    const block = formRequiredFieldBlock(O39, {
      plaintiff_name: 'Not known (buyer under the sale deed)',
      defendant_name: 'Unknown, the tenant',
      main_suit_relief: 'A sample relief.',
      restraint_sought: 'A sample restraint.',
    });
    expect(block!.message).toBe(`${NEW_LINE}\n${NEW_LINE}`);
    expect(block!.confirm_blocking_keys).toEqual(['plaintiff_name', 'defendant_name']);
    const all = formRequiredFieldBlock(O39, {
      plaintiff_name: 'Not known (buyer under the sale deed)',
      defendant_name: 'Unknown, the tenant',
    });
    expect(all!.message).toBe(
      [
        NEW_LINE,
        NEW_LINE,
        O39_CONFIRM_MESSAGES.main_suit_relief.en,
        O39_CONFIRM_MESSAGES.restraint_sought.en,
      ].join('\n'),
    );
    expect(all!.confirm_blocking_keys).toEqual([
      'plaintiff_name',
      'defendant_name',
      'main_suit_relief',
      'restraint_sought',
    ]);
  });

  it('mixed: with text plaintiff and bare defendant keep their own lines, in order', () => {
    const block = formRequiredFieldBlock(
      O39,
      o39Form({ plaintiff_name: 'Not known (x)', defendant_name: 'Not known' }),
    );
    expect(block!.message).toBe(`${NEW_LINE}\n${O39_CONFIRM_MESSAGES.defendant_name.en}`);
    expect(block!.confirm_blocking_keys).toEqual(['plaintiff_name', 'defendant_name']);
    const rev = formRequiredFieldBlock(
      O39,
      o39Form({ plaintiff_name: 'Not known', defendant_name: 'Not known (x)' }),
    );
    expect(rev!.message).toBe(`${O39_CONFIRM_MESSAGES.plaintiff_name.en}\n${NEW_LINE}`);
  });
});

// ── the HTTP form route ─────────────────────────────────────────────────────

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

describe('T-668e: POST /generate-from-template', () => {
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
      inkTopup: 2000,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(WITH_TEXT)(
    'defendant_name %j: 400, the new line, no model call, no Generation',
    async (v) => {
      mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
      const res = await postForm(DECL, { defendant_name: v });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('brief_not_confirmed');
      expect(res.body.message).toBe(NEW_LINE);
      expect(res.body.blockers).toEqual(['required_fields']);
      expect(res.body.confirm_blocking_keys.map(lastSeg)).toEqual(['defendant_name']);
      expect(mockMessagesStream).not.toHaveBeenCalled();
      expect(await Generation.countDocuments({})).toBe(0);
      expect(mongoose.connection.readyState).toBe(1);
    },
  );

  it.each(['Not known', 'N/A', 'Defendant'])(
    'bare %j: 400 with the defendant line, not the new one',
    async (v) => {
      const res = await postForm(DECL, { defendant_name: v });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('brief_not_confirmed');
      expect(res.body.message).not.toBe(NEW_LINE);
      expect(res.body.message).toBe(
        partyConfirmLine(DECL, keyIn(DECL, 'defendant_name'), 'defendant'),
      );
      expect(mockMessagesStream).not.toHaveBeenCalled();
    },
  );

  it.each([DESCRIPTION, `Respondent: ${DESCRIPTION}`, ...REAL_NAMES])(
    '%j is not stopped by brief_not_confirmed',
    async (name) => {
      mockMessagesStream.mockResolvedValue(sdkAnswer('1. A sample body.', 4000, 800));
      const res = await postForm(DECL, { defendant_name: name });
      expect(res.text).not.toContain('brief_not_confirmed');
      expect(res.body?.message).not.toBe(NEW_LINE);
    },
  );
});
