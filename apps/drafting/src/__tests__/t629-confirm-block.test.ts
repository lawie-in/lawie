/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-629 (Ajay, T-613 §(g), §(i) rows 2/4/5/6, §(j) rows 2/3/5): Confirm is blocked while
 * main_suit_relief or restraint_sought is empty or a non-answer.
 *
 * The signed strings are typed here on purpose, byte for byte. The test does not read handoff/.
 * No model call, no network.
 */
import './setupEnv';
import './setupDb';
import { readFileSync } from 'fs';
import { join } from 'path';

import request from 'supertest';

import app from '../app';
import { createVerifiedUser } from './verifiedUser';
import {
  isEmptyOrNonAnswer,
  isO39RequiredField,
  O39_CONFIRM_MESSAGES,
  O39_NON_ANSWERS,
  O39_REQUIRED_FIELDS,
  requiredFieldBlockers,
} from '../config/intake/o39-confirm-messages';
import {
  BriefItem,
  buildBrief,
  buildChecklist,
  buildQuestions,
  GivenValue,
} from '../services/intake-brief';
import { loadRulePack, listRulePackIds } from '../services/rule-pack.service';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);
beforeEach(() => {
  mockMessagesStream.mockReset();
});

// ── Signed strings (T-613 §(g)) ──────────────────────────────────────────────────────────
const SIGNED_RELIEF_EN = 'Add the relief sought in the main suit to continue.';
const SIGNED_RELIEF_HI = 'आगे बढ़ने के लिए मुख्य वाद में माँगी गई राहत जोड़िए।';
const SIGNED_RESTRAINT_EN = 'Add the acts the defendant should be restrained from, to continue.';
const SIGNED_RESTRAINT_HI = 'आगे बढ़ने के लिए वे कार्य जोड़िए जिनसे प्रतिवादी को रोका जाना है।';
// T-644, AJ-644-M1 (typed byte for byte from handoff/legal/T-511-copy-rulings-ajay.md).
const SIGNED_PLAINTIFF_EN = "Add the plaintiff's name to continue.";
const SIGNED_DEFENDANT_EN = "Add the defendant's name to continue.";
const COURT_ONLY_MSG = 'Choose the court to continue.';

const O39 = 'temporary_injunction_o39';
const PACK = loadRulePack(O39)!;
const CHECKLIST = buildChecklist(PACK);
const KIND = { id: O39, name: 'Temporary Injunction (O.39)', court_document: true };
const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' };
const NO_COURT = { state: null, court_type: null, court: null } as any;

const PARTIES: GivenValue[] = [
  { key: 'plaintiff_name', value: 'Ram Kumar', source: 'user' },
  { key: 'defendant_name', value: 'Shyam Lal', source: 'user' },
];
const RELIEF: GivenValue = {
  key: 'main_suit_relief',
  value: 'Declaration of title',
  source: 'user',
};
const RESTRAINT: GivenValue = {
  key: 'restraint_sought',
  value: 'raising any construction on the suit land',
  source: 'user',
};

function brief(values: GivenValue[], extra: Record<string, unknown> = {}, court: any = COURT) {
  return buildBrief({ kind: KIND, checklist: CHECKLIST, values, court, ...extra } as any);
}
const itemOf = (b: { items: BriefItem[] }, name: string) => {
  const found = b.items.find((i) => i.key === name || i.key.endsWith(`.${name}`));
  if (!found) throw new Error(`no item ${name}`);
  return found;
};

// ── A. The messages file ─────────────────────────────────────────────────────────────────
describe('o39-confirm-messages: the signed strings', () => {
  it('EN and HI are byte for byte the signed text', () => {
    expect(O39_CONFIRM_MESSAGES.main_suit_relief.en).toBe(SIGNED_RELIEF_EN);
    expect(O39_CONFIRM_MESSAGES.main_suit_relief.hi).toBe(SIGNED_RELIEF_HI);
    expect(O39_CONFIRM_MESSAGES.restraint_sought.en).toBe(SIGNED_RESTRAINT_EN);
    expect(O39_CONFIRM_MESSAGES.restraint_sought.hi).toBe(SIGNED_RESTRAINT_HI);
  });

  it('the field order is plaintiff_name, defendant_name (T-644), main_suit_relief, restraint_sought', () => {
    expect([...O39_REQUIRED_FIELDS]).toEqual([
      'plaintiff_name',
      'defendant_name',
      'main_suit_relief',
      'restraint_sought',
    ]);
    expect(isO39RequiredField('restraint_sought')).toBe(true);
    expect(isO39RequiredField('acts_complained_of')).toBe(false);
  });

  it('the non-answer list is exactly the ten signed values', () => {
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

  it.each([
    'Not known',
    'not known',
    'NOT KNOWN',
    '  unknown  ',
    'UnKnown',
    'NA',
    'na',
    'N/A',
    'n/a',
    'nil',
    'NIL',
    'None',
    ' - ',
    '?',
    'नहीं पता',
    '  पता नहीं ',
    '',
    '   ',
  ])('%j counts as empty', (v) => {
    expect(isEmptyOrNonAnswer(v)).toBe(true);
  });

  it('null, undefined and a list of only non-answers count as empty', () => {
    expect(isEmptyOrNonAnswer(null)).toBe(true);
    expect(isEmptyOrNonAnswer(undefined)).toBe(true);
    expect(isEmptyOrNonAnswer([])).toBe(true);
    expect(isEmptyOrNonAnswer(['none', ' ? '])).toBe(true);
  });

  it('a real answer, or a non-answer inside a longer answer, is not empty', () => {
    expect(isEmptyOrNonAnswer('Declaration of title')).toBe(false);
    expect(isEmptyOrNonAnswer('Not known to me at present, see the plaint')).toBe(false);
    expect(isEmptyOrNonAnswer('none of the above')).toBe(false);
    expect(isEmptyOrNonAnswer(['none', 'permanent injunction'])).toBe(false);
  });

  it('requiredFieldBlockers returns the open fields in signed order, with the EN line', () => {
    expect(requiredFieldBlockers({})).toEqual([
      { key: 'plaintiff_name', en: SIGNED_PLAINTIFF_EN },
      { key: 'defendant_name', en: SIGNED_DEFENDANT_EN },
      { key: 'main_suit_relief', en: SIGNED_RELIEF_EN },
      { key: 'restraint_sought', en: SIGNED_RESTRAINT_EN },
    ]);
    const parties = { plaintiff_name: 'Ramesh Kumar Verma', defendant_name: 'Sunita Devi Agarwal' };
    expect(
      requiredFieldBlockers({ ...parties, main_suit_relief: 'x', restraint_sought: 'N/A' }),
    ).toEqual([{ key: 'restraint_sought', en: SIGNED_RESTRAINT_EN }]);
    expect(
      requiredFieldBlockers({ ...parties, main_suit_relief: 'x', restraint_sought: 'y' }),
    ).toEqual([]);
  });
});

describe('fail closed: every blocks_confirm field in a pack has a signed message', () => {
  it('iterates every rule pack JSON', () => {
    const dir = join(__dirname, '..', 'config', 'document-rules');
    const flagged: Array<{ pack: string; id: string }> = [];
    for (const id of listRulePackIds()) {
      const raw = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf-8'));
      for (const f of raw?.form_schema?.fields ?? []) {
        if (f.blocks_confirm === true) flagged.push({ pack: id, id: f.id });
      }
    }
    // The two O.39 fields, and nothing else flagged.
    expect(flagged).toEqual(
      expect.arrayContaining([
        { pack: O39, id: 'main_suit_relief' },
        { pack: O39, id: 'restraint_sought' },
      ]),
    );
    for (const f of flagged) {
      expect(isO39RequiredField(f.id)).toBe(true);
      expect(O39_CONFIRM_MESSAGES[f.id as 'main_suit_relief'].en.length).toBeGreaterThan(0);
      expect(O39_CONFIRM_MESSAGES[f.id as 'main_suit_relief'].hi.length).toBeGreaterThan(0);
    }
  });

  it('the pack flags exactly the two fields, through the loader', () => {
    const flagged = CHECKLIST.filter((i) => i.blocksConfirm).map((i) => i.key.split('.').pop());
    expect(flagged.sort()).toEqual(['main_suit_relief', 'restraint_sought']);
  });
});

// ── B. confirmState ──────────────────────────────────────────────────────────────────────
describe('confirmState: the required fields block Confirm', () => {
  it('both empty: blocked, two lines in order, keys in order', () => {
    const b = brief(PARTIES);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toEqual(['required_fields']);
    expect(b.confirm_message).toBe(`${SIGNED_RELIEF_EN}\n${SIGNED_RESTRAINT_EN}`);
    expect((b.confirm_blocking_keys ?? []).map((k) => k.split('.').pop())).toEqual([
      'main_suit_relief',
      'restraint_sought',
    ]);
  });

  it('only main_suit_relief empty: one line', () => {
    const b = brief([...PARTIES, RESTRAINT]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toBe(SIGNED_RELIEF_EN);
  });

  it('only restraint_sought empty: one line', () => {
    const b = brief([...PARTIES, RELIEF]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toBe(SIGNED_RESTRAINT_EN);
  });

  it('both given: can confirm, no message, no blocking keys', () => {
    const b = brief([...PARTIES, RELIEF, RESTRAINT]);
    expect(b.can_confirm).toBe(true);
    expect(b.confirm_blockers).toEqual([]);
    expect(b.confirm_message).toBeNull();
    expect(b.confirm_blocking_keys ?? []).toEqual([]);
  });

  it.each(['Not known', 'unknown', 'NA', 'N/A', 'nil', 'none', '-', '?', 'नहीं पता', 'पता नहीं'])(
    'a typed non-answer %j still blocks, for each field',
    (word) => {
      const r = brief([...PARTIES, { ...RELIEF, value: word }, RESTRAINT]);
      expect(r.can_confirm).toBe(false);
      expect(r.confirm_message).toBe(SIGNED_RELIEF_EN);
      const s = brief([...PARTIES, RELIEF, { ...RESTRAINT, value: word.toUpperCase() }]);
      expect(s.can_confirm).toBe(false);
      expect(s.confirm_message).toBe(SIGNED_RESTRAINT_EN);
    },
  );

  it('a non-answer with spaces and case differences still blocks', () => {
    const b = brief([...PARTIES, { ...RELIEF, value: '  Not   Known ' }, RESTRAINT]);
    expect(b.can_confirm).toBe(false);
  });

  it('a non-answer inside a real answer does not block', () => {
    const b = brief([...PARTIES, { ...RELIEF, value: 'none of the earlier orders' }, RESTRAINT]);
    expect(b.can_confirm).toBe(true);
  });

  it('(j)2 order (AJ-644-M2): no court and no parties: court line, both party lines, then both fields', () => {
    const b = brief([], {}, NO_COURT);
    expect(b.confirm_blockers).toEqual(['court', 'parties', 'required_fields']);
    expect(b.confirm_message!.split('\n')).toEqual([
      COURT_ONLY_MSG,
      SIGNED_PLAINTIFF_EN,
      SIGNED_DEFENDANT_EN,
      SIGNED_RELIEF_EN,
      SIGNED_RESTRAINT_EN,
    ]);
  });

  it('(j)2 order: court only missing: court line first, then the fields', () => {
    const b = brief(PARTIES, {}, NO_COURT);
    expect(b.confirm_blockers).toEqual(['court', 'required_fields']);
    expect(b.confirm_message!.split('\n')).toEqual([
      COURT_ONLY_MSG,
      SIGNED_RELIEF_EN,
      SIGNED_RESTRAINT_EN,
    ]);
  });

  it('(j)2 order: parties missing, court chosen: the party line precedes the fields', () => {
    const b = brief([RELIEF]);
    expect(b.confirm_blockers).toEqual(['parties', 'required_fields']);
    expect(b.confirm_message!.split('\n')).toEqual([
      SIGNED_PLAINTIFF_EN,
      SIGNED_DEFENDANT_EN,
      SIGNED_RESTRAINT_EN,
    ]);
  });

  it('a value read from the description lifts the blocker (the brief shows it to confirm)', () => {
    const b = brief([
      ...PARTIES,
      {
        key: 'main_suit_relief',
        value: 'Declaration of title and possession',
        source: 'description',
        quote: 'the suit seeks declaration of title and possession',
      },
      {
        key: 'restraint_sought',
        value: 'selling the land',
        source: 'description',
        quote: 'stop him selling the land',
      },
    ]);
    expect(b.can_confirm).toBe(true);
    expect(b.confirm_message).toBeNull();
  });

  it('a ledger-held key does NOT lift it (fail closed), while a held party still does', () => {
    const b = brief([], { ledgerGiven: new Set(['main_suit_relief', 'restraint_sought']) });
    expect(b.confirm_blockers).toContain('required_fields');
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toContain(SIGNED_RELIEF_EN);
    expect(b.confirm_message).toContain(SIGNED_RESTRAINT_EN);
  });

  it('a pack with no blocks_confirm fact is unchanged', () => {
    const bail = loadRulePack('bail_regular')!;
    const b = buildBrief({
      kind: { id: 'bail_regular', name: 'Regular Bail', court_document: true },
      checklist: buildChecklist(bail),
      values: [{ key: 'applicant_name', value: 'Ram Kumar', source: 'user' }],
      court: COURT,
    } as any);
    expect(b.confirm_blockers).not.toContain('required_fields');
    expect(b.confirm_blocking_keys).toBeUndefined();
  });
});

// ── C. Relief and facts parts (§(i)6) ────────────────────────────────────────────────────
describe('brief parts (§(i)6)', () => {
  const b = brief([...PARTIES, RELIEF, RESTRAINT]);
  it('restraint_sought is in relief', () => {
    expect(itemOf(b, 'restraint_sought').part).toBe('relief');
  });
  it('acts_complained_of stays in facts', () => {
    expect(itemOf(b, 'acts_complained_of').part).toBe('facts');
  });
  it('other *_sought facts are not moved to relief', () => {
    expect(itemOf(b, 'ex_parte_sought').part).not.toBe('relief');
    const other = buildChecklist(loadRulePack('bail_regular')!);
    const moved = other.filter((i) => /interim_custody_sought$/.test(i.key) && i.part === 'relief');
    expect(moved).toEqual([]);
  });
  it('blocks_confirm is on the two items in the brief', () => {
    expect(itemOf(b, 'main_suit_relief').blocks_confirm).toBe(true);
    expect(itemOf(b, 'restraint_sought').blocks_confirm).toBe(true);
    expect(itemOf(b, 'acts_complained_of').blocks_confirm).toBeUndefined();
  });
});

// ── D. title_document_date: blank once asked (§(i)2) ─────────────────────────────────────
describe('title_document_date: a blank once asked is answered', () => {
  const full = [...PARTIES, RELIEF, RESTRAINT];
  const KEY = CHECKLIST.find((i) => i.key.endsWith('title_document_date'))!.key;
  const questions = (b: any) =>
    buildQuestions(b, new Map(), new Set(), new Set(), { checklist: CHECKLIST } as any);
  // Every other required fact is given, so the question cap leaves room for the date.
  const filled: GivenValue[] = CHECKLIST.filter(
    (i) => i.required && !i.key.endsWith('title_document_date'),
  ).map((i) => ({
    key: i.key,
    value:
      i.options.length > 0 ? (i.kind === 'choices' ? [i.options[0]] : i.options[0]) : 'Some answer',
    source: 'user' as const,
  }));

  it('is marked blank_once_asked so the web app knows to send it back', () => {
    expect(itemOf(brief(full), 'title_document_date').blank_once_asked).toBe(true);
    expect(itemOf(brief(full), 'main_suit_relief').blank_once_asked).toBeUndefined();
  });

  it('before it is asked it is asked, and is not asked_blank', () => {
    const b = brief([...filled, ...full]);
    expect(itemOf(b, 'title_document_date').asked_blank).toBeUndefined();
    expect(questions(b).map((q: any) => q.key)).toContain(KEY);
  });

  it('with askedKeys it is asked_blank, not asked_empty, and never asked again', () => {
    const b = brief([...filled, ...full], { askedKeys: [KEY] });
    const it_ = itemOf(b, 'title_document_date');
    expect(it_.asked_blank).toBe(true);
    expect(it_.asked_empty).toBeUndefined();
    expect(it_.value).toBeNull();
    expect(questions(b).map((q: any) => q.key)).not.toContain(KEY);
  });

  it('a value given wins over askedKeys', () => {
    const b = brief(
      [...full, { key: 'title_document_date', value: '2020-05-04', source: 'user' }],
      {
        askedKeys: [KEY],
      },
    );
    const it_ = itemOf(b, 'title_document_date');
    expect(it_.value).toBe('2020-05-04');
    expect(it_.asked_blank).toBeUndefined();
  });

  it('it never blocks Confirm either way', () => {
    expect(brief(full).can_confirm).toBe(true);
    expect(brief(full, { askedKeys: [KEY] }).can_confirm).toBe(true);
  });

  it('askedKeys for other O.39 facts are ignored', () => {
    const b = brief(full, { askedKeys: ['suit_number', 'urgency_grounds'] });
    expect(b.items.some((i) => i.asked_blank)).toBe(false);
  });

  it('on a non-O.39 pack, askedKeys changes nothing', () => {
    const bail = loadRulePack('bail_regular')!;
    const args = {
      kind: { id: 'bail_regular', name: 'Regular Bail', court_document: true },
      checklist: buildChecklist(bail),
      values: [{ key: 'applicant_name', value: 'Ram Kumar', source: 'user' }],
      court: COURT,
    };
    const keys = args.checklist.map((i) => i.key);
    const plain = buildBrief(args as any);
    const withKeys = buildBrief({ ...args, askedKeys: keys } as any);
    expect(withKeys).toEqual(plain);
    expect(withKeys.items.some((i) => i.asked_blank || i.blank_once_asked)).toBe(false);
  });
});

// ── E. Routes ────────────────────────────────────────────────────────────────────────────
const USER_ID = '507f1f77bcf86cd799439629';
function headers() {
  return {
    'x-internal-secret': process.env.INTERNAL_SECRET!,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}
const ROUTE_COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' };
const ROUTE_VALUES = [
  { key: 'plaintiff_name', value: 'Ram Kumar' },
  { key: 'defendant_name', value: 'Shyam Lal' },
];

describe('POST /intake/brief/update: asked_keys and the required fields', () => {
  beforeEach(async () => {
    await createVerifiedUser({ _id: USER_ID, plan: 'free', planTier: 'free' });
  });
  const update = (body: Record<string, unknown>) =>
    request(app).post('/intake/brief/update').set(headers()).send(body);

  it('blocks Confirm with both signed lines when the fields are empty', async () => {
    const res = await update({ kind: O39, values: ROUTE_VALUES, court: ROUTE_COURT });
    expect(res.status).toBe(200);
    expect(res.body.brief.can_confirm).toBe(false);
    expect(res.body.brief.confirm_blockers).toContain('required_fields');
    expect(res.body.brief.confirm_message).toBe(`${SIGNED_RELIEF_EN}\n${SIGNED_RESTRAINT_EN}`);
    expect(mockMessagesStream).not.toHaveBeenCalled();
  });

  it('accepts asked_keys and marks title_document_date asked_blank', async () => {
    const res = await update({
      kind: O39,
      values: ROUTE_VALUES,
      court: ROUTE_COURT,
      asked_keys: ['title_document_date'],
    });
    expect(res.status).toBe(200);
    const found = res.body.brief.items.find((i: any) => i.key.endsWith('title_document_date'));
    expect(found.asked_blank).toBe(true);
    expect(found.asked_empty).toBeUndefined();
  });

  it('asked_keys is optional (default empty)', async () => {
    const res = await update({ kind: O39, values: ROUTE_VALUES, court: ROUTE_COURT });
    const found = res.body.brief.items.find((i: any) => i.key.endsWith('title_document_date'));
    expect(found.asked_blank).toBeUndefined();
  });

  it.each([
    ['a string', 'title_document_date'],
    ['a list of numbers', [1, 2]],
    ['an empty-string key', ['']],
    ['a key over 200 characters', ['a'.repeat(201)]],
    ['more than 200 keys', Array.from({ length: 201 }, (_, i) => `k${i}`)],
    ['an object', { a: 1 }],
  ])('rejects asked_keys as %s', async (_n, bad) => {
    const res = await update({
      kind: O39,
      values: ROUTE_VALUES,
      court: ROUTE_COURT,
      asked_keys: bad,
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /generate-from-brief: the brief_not_confirmed backstop still applies', () => {
  beforeEach(async () => {
    await createVerifiedUser({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
  });

  it('empty required fields: 400 brief_not_confirmed with the two lines, no model call', async () => {
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({ kind: O39, court: ROUTE_COURT, values: ROUTE_VALUES });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'brief_not_confirmed',
      message: `${SIGNED_RELIEF_EN}\n${SIGNED_RESTRAINT_EN}`,
      blockers: ['required_fields'],
    });
    expect(mockMessagesStream).not.toHaveBeenCalled();
  });

  it('a non-answer in restraint_sought is blocked too', async () => {
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: O39,
        court: ROUTE_COURT,
        values: [
          ...ROUTE_VALUES,
          { key: 'main_suit_relief', value: 'Declaration of title' },
          { key: 'restraint_sought', value: 'Not known' },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'brief_not_confirmed',
      message: SIGNED_RESTRAINT_EN,
      blockers: ['required_fields'],
    });
  });
});
