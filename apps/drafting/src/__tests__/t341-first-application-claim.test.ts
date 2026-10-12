/**
 * T-341 — a draft that says "no earlier bail application" while the advocate
 * has not confirmed it gets a warning (never a block); one who gave an earlier
 * application gets the second text (Ajay's ruling 2).
 *
 * The phrases, the unlock words and the averment sentence are read from the
 * signed _averments files at test time (loadAvermentLists, inheritance
 * included). The two warning texts are the ticket's and the packet's, retyped
 * here on purpose: they are the contract and must not follow the source.
 * The model is the Anthropic SDK stub; every answer is a fixture.
 */
import './setupDb';

import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { loadAvermentLists } from '../services/averments';
import {
  CLAUSES_MARKER,
  FIRST_APPLICATION_CONTRADICTED,
  FIRST_APPLICATION_UNCONFIRMED,
  checkBriefIsUsed,
  checkFirstApplicationClaim,
  ledgerSkeletonBrief,
} from '../services/brief-drafter';
import { Brief, BriefItem, buildBrief, buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { sdkAnswer } from './sdkStream';

jest.setTimeout(30_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// The exact texts: ticket AC3 and Ajay's ruling 2 (12 Oct 2026).
const TEXT_1 =
  'The draft says no earlier bail application was made, but this was not confirmed. Check before filing.';
const TEXT_2 =
  'The draft says no earlier bail application was made, but the details you gave list an earlier bail application. Correct the draft before filing.';

const PROTECTED = 'earlier_bail_applications';
const FIRST = 'first_bail_application';
const PACKS = [
  'bail_regular',
  'bail_anticipatory',
  'interim_bail',
  'bail_before_magistrate',
  'default_bail',
] as const;
const REAL_APPLICATION = 'rejected by the JMFC, Dhanbad on 22.09.2026';

const listsOf = (pack: string) => {
  const l = loadAvermentLists(pack);
  const banned = l.banned.find((b) => b.id === FIRST)!;
  const allowed = l.allowed.find((a) => a.id === FIRST)!;
  return {
    phrases: banned.phrases,
    averment: allowed.averment,
    nones: (allowed.requires as { equals: string[] }).equals,
  };
};

type V = { key: string; value: string | string[]; source: 'description' | 'user' };
function brief(pack: string, values: V[], holdPack = pack): Brief {
  const rp = loadRulePack(pack)!;
  const hold = listsOf(holdPack).nones;
  return buildBrief({
    kind: { id: pack, name: pack, court_document: true },
    checklist: buildChecklist(rp),
    values,
    holdNone: hold,
  }) as Brief;
}
const itemOf = (b: Brief) => b.items.find((i) => i.key === PROTECTED) as BriefItem;
/** A sentence of a draft that holds the words, with other text around it. */
const draftWith = (words: string) =>
  `1. That the applicant is in custody.\n\n2. That ${words}.\n\n3. That the applicant will not flee.`;
const warn = (text: string, b: Brief) => checkFirstApplicationClaim(text, b);
const messages = (text: string, b: Brief) => warn(text, b).map((w) => w.message);

describe('T-341 the exported texts are the exact wording', () => {
  it('AC3 and Ajay ruling 2, character for character', () => {
    expect(FIRST_APPLICATION_UNCONFIRMED).toBe(TEXT_1);
    expect(FIRST_APPLICATION_CONTRADICTED).toBe(TEXT_2);
  });
});

describe.each(PACKS)('T-341 checkFirstApplicationClaim, %s', (pack) => {
  const L = listsOf(pack);
  const phrase = L.phrases[0];
  const unconfirmed = () => brief(pack, [{ key: PROTECTED, value: 'None', source: 'description' }]);
  const absent = () => brief(pack, []);
  const typed = (v: string) => brief(pack, [{ key: PROTECTED, value: v, source: 'user' }]);

  it('reads its phrases from the signed file: the pack has a list, and an allowed sentence', () => {
    expect(L.phrases.length).toBeGreaterThan(0);
    expect(L.averment.length).toBeGreaterThan(0);
    expect(L.nones).toEqual(expect.arrayContaining(['none', 'koi nahi']));
  });

  it('precondition: a description-read "None" is marked unconfirmed in the brief', () => {
    expect(itemOf(unconfirmed())).toMatchObject({ value: 'None', unconfirmed: true });
  });

  it.each(listsOf(pack).phrases)(
    'AC1 unconfirmed description "None" + phrase %j -> text 1',
    (p) => {
      const w = warn(draftWith(p), unconfirmed());
      expect(w).toHaveLength(1);
      expect(w[0].message).toBe(TEXT_1);
      expect(w[0].type).toBe('fact_alteration');
    },
  );

  it('AC1 item absent from the brief + phrase -> text 1', () => {
    const b = absent();
    b.items = b.items.filter((i) => i.key !== PROTECTED);
    expect(messages(draftWith(phrase), b)).toEqual([TEXT_1]);
  });

  it('AC1 item present with no value + phrase -> text 1', () => {
    expect(itemOf(absent()).value).toBeNull();
    expect(messages(draftWith(phrase), absent())).toEqual([TEXT_1]);
  });

  it.each(['None', 'koi nahi', 'NIL.', 'Koi  Nahi'])(
    'confirmed (user) %j + phrase -> no warning',
    (v) => {
      const b = typed(v);
      expect(itemOf(b).unconfirmed).toBeUndefined();
      expect(warn(draftWith(phrase), b)).toEqual([]);
    },
  );

  it('every confirmed "none" word of the signed file gives no warning', () => {
    for (const v of L.nones) expect(warn(draftWith(phrase), typed(v))).toEqual([]);
  });

  it('confirmed real application + phrase -> text 2 (Ajay ruling 2)', () => {
    const w = warn(draftWith(phrase), typed(REAL_APPLICATION));
    expect(w).toHaveLength(1);
    expect(w[0].message).toBe(TEXT_2);
    expect(w[0].type).toBe('fact_alteration');
  });

  it('a real application read from the description (not typed) + phrase -> text 1, it is not confirmed', () => {
    const b = brief(pack, [{ key: PROTECTED, value: REAL_APPLICATION, source: 'description' }]);
    expect(messages(draftWith(phrase), b)).toEqual([TEXT_1]);
  });

  it('no phrase in the draft -> no warning, in every state of the fact', () => {
    const text = draftWith('the applicant has deep roots in society');
    for (const b of [unconfirmed(), absent(), typed('None'), typed(REAL_APPLICATION)]) {
      expect(warn(text, b)).toEqual([]);
    }
  });

  it('whole words: a plural "applications" does not match the singular phrase', () => {
    const plural = `${phrase.replace(/application\b/, 'applications')}`;
    if (plural === phrase) return; // the phrase does not end in the English word (Hindi phrases)
    expect(warn(draftWith(plural), unconfirmed())).toEqual([]);
  });

  it('whole words: a phrase glued to other letters does not match', () => {
    expect(warn(draftWith(`x${phrase}`), unconfirmed())).toEqual([]);
    expect(warn(draftWith(`${phrase}s`), unconfirmed())).toEqual([]);
  });

  it('case and spacing are folded', () => {
    const odd = phrase.toUpperCase().replace(/ /g, '  \n ');
    expect(messages(draftWith(odd), unconfirmed())).toEqual([TEXT_1]);
  });

  it('the allowed averment sentence alone is a phrase -> warning', () => {
    expect(messages(draftWith(L.averment), unconfirmed())).toEqual([TEXT_1]);
    expect(warn(draftWith(L.averment), typed('None'))).toEqual([]);
    expect(messages(draftWith(L.averment), typed(REAL_APPLICATION))).toEqual([TEXT_2]);
  });

  it('at most one warning, however many phrases the draft holds', () => {
    const all = draftWith([...L.phrases, L.averment].join('. That '));
    expect(warn(all, unconfirmed())).toHaveLength(1);
    expect(warn(all, typed(REAL_APPLICATION))).toHaveLength(1);
    expect(warn(all, typed('None'))).toHaveLength(0);
  });

  it('checkBriefIsUsed carries the warning (the hook the route uses)', () => {
    const msgs = checkBriefIsUsed(draftWith(phrase), unconfirmed()).map((w) => w.message);
    expect(msgs.filter((m) => m === TEXT_1)).toHaveLength(1);
    const clean = checkBriefIsUsed(draftWith(phrase), typed('None')).map((w) => w.message);
    expect(clean).not.toContain(TEXT_1);
    expect(clean).not.toContain(TEXT_2);
  });
});

describe('T-341 pack specifics', () => {
  it('bail_anticipatory has its own phrase list (not the regular one), and it is the one read', () => {
    const own = listsOf('bail_anticipatory').phrases;
    const reg = listsOf('bail_regular').phrases;
    expect(own).not.toEqual(reg);
    const only = own.find((p) => !reg.includes(p))!;
    const b = brief('bail_anticipatory', []);
    expect(messages(draftWith(only), b)).toEqual([TEXT_1]);
    // a regular-only phrase is not a phrase of the anticipatory pack
    const regOnly = reg.find((p) => !own.includes(p) && !own.some((o) => p.includes(o)))!;
    expect(warn(draftWith(regOnly), b)).toEqual([]);
  });

  it('the allowed averment is inherited by bail_anticipatory (inheritance included)', () => {
    expect(loadAvermentLists('bail_anticipatory').allowed.some((a) => a.id === FIRST)).toBe(true);
  });

  it('a non-bail pack (legal_notice_s138) -> no warning, whatever the draft says', () => {
    const rp = loadRulePack('legal_notice_s138')!;
    const b = buildBrief({
      kind: { id: 'legal_notice_s138', name: 'x', court_document: false },
      checklist: buildChecklist(rp),
      values: [],
    }) as Brief;
    const text = draftWith(
      [...listsOf('bail_regular').phrases, listsOf('bail_regular').averment].join('. That '),
    );
    expect(warn(text, b)).toEqual([]);
  });

  it('a brief with no pack id -> no warning', () => {
    const b = brief('bail_regular', []);
    b.kind = { ...b.kind, id: null as unknown as string };
    expect(warn(draftWith(listsOf('bail_regular').phrases[0]), b)).toEqual([]);
  });

  it('list value (set on the item directly): every entry must be a "none" value; one real application -> text 2', () => {
    const p = listsOf('bail_regular').phrases[0];
    const withList = (value: string[]) => {
      const b = brief('bail_regular', [{ key: PROTECTED, value: 'None', source: 'user' }]);
      itemOf(b).value = value;
      return b;
    };
    expect(warn(draftWith(p), withList(['None', 'Nil']))).toEqual([]);
    expect(messages(draftWith(p), withList(['None', REAL_APPLICATION]))).toEqual([TEXT_2]);
    expect(messages(draftWith(p), withList([REAL_APPLICATION, 'None']))).toEqual([TEXT_2]);
    expect(messages(draftWith(p), withList(['', '  ']))).toEqual([TEXT_1]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Documented behaviour for Ajay to decide (developer's finding)
// ═════════════════════════════════════════════════════════════════════════════
describe('T-341 KNOWN FALSE CONTRADICTION (pinned current behaviour, for Ajay to decide)', () => {
  it('a confirmed typed value that itself holds a phrase is not a "none" value -> text 2 today', () => {
    // The advocate types "this is the first bail application" as the answer. That is a
    // statement of no earlier application, yet it is not in the signed equals list, so
    // the check reads it as an earlier application and says "details you gave list an
    // earlier bail application". If Ajay wants this to pass quietly, this test changes.
    const pack = 'bail_regular';
    const L = listsOf(pack);
    const b = brief(pack, [{ key: PROTECTED, value: L.phrases[0], source: 'user' }]);
    expect(itemOf(b).unconfirmed).toBeUndefined();
    expect(messages(draftWith(L.phrases[0]), b)).toEqual([TEXT_2]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Ledger ON, unit: the skeleton brief's source follows the ledger fact
// ═════════════════════════════════════════════════════════════════════════════
describe('T-341 ledger ON: ledgerSkeletonBrief and the check', () => {
  const pack = 'bail_regular';
  const phrase = listsOf(pack).phrases[0];
  const fact = (source: 'asked' | 'user', display: string) =>
    ({
      id: `f-${source}`,
      key: PROTECTED,
      label: PROTECTED,
      type: 'text',
      value: display,
      display,
      raw_span: display,
      source,
      confidence: 1,
      required_in_draft: false,
    }) as never;
  const held = () => brief(pack, [{ key: PROTECTED, value: 'None', source: 'description' }]);

  it('an asked fact -> source user -> no warning', () => {
    const out = ledgerSkeletonBrief(held(), [fact('asked', 'None')]);
    expect(itemOf(out)).toMatchObject({ value: 'None', source: 'user' });
    expect(warn(draftWith(phrase), out)).toEqual([]);
  });

  it('an asked fact that lists a real application -> text 2', () => {
    const out = ledgerSkeletonBrief(held(), [fact('asked', REAL_APPLICATION)]);
    expect(messages(draftWith(phrase), out)).toEqual([TEXT_2]);
  });

  it('a fact read from the description (ledger source "user") -> source description -> text 1', () => {
    const out = ledgerSkeletonBrief(held(), [fact('user', 'None')]);
    expect(itemOf(out).source).toBe('description');
    expect(messages(draftWith(phrase), out)).toEqual([TEXT_1]);
  });

  it('no fact -> value null, no source -> text 1', () => {
    const out = ledgerSkeletonBrief(held(), []);
    expect(itemOf(out)).toMatchObject({ value: null, source: null });
    expect(messages(draftWith(phrase), out)).toEqual([TEXT_1]);
  });

  it('a typed fact and a description fact together: not every entry typed -> not confirmed', () => {
    const out = ledgerSkeletonBrief(held(), [fact('asked', 'None'), fact('user', 'None')]);
    expect(itemOf(out).source).toBe('description');
    expect(messages(draftWith(phrase), out)).toEqual([TEXT_1]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Through /generate-from-brief
// ═════════════════════════════════════════════════════════════════════════════
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994391c3';
const INTAKE_MODEL = 'claude-haiku-4-5-20251001';
const DRAFT_MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const headers = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
const PACK = loadRulePack('bail_regular')!;
const CL = buildChecklist(PACK);
const FIRST_GROUND = CL.find((i) => i.key === 'grounds_for_bail')!.options[0];
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const MATCH_BAIL = JSON.stringify({
  template_id: 'bail_regular',
  confidence: 'high',
  alternatives: [],
  is_legal_drafting: true,
  is_court_document: true,
  label: 'legal document',
  category: 'other',
});
const reception = (items: Array<[string, string, string]>) =>
  JSON.stringify({
    outcome: 'read',
    read: items.map(([id, value, quote]) => ({ id, value, quote })),
    conflicts: [],
    questions: [],
  });
const extraction = (...facts: Array<Record<string, unknown>>) => JSON.stringify({ facts });

function event(text: string, name: string): Record<string, unknown> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
}
type W = { type: string; message: string };
const warningsOf = (text: string) =>
  ((event(text, 'warning')?.warnings ?? []) as W[]).map((w) => w.message);

function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
}

async function setup(ledger: boolean) {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.intake_model', value: INTAKE_MODEL });
  await AppSetting.create({ key: 'ai.drafting_model', value: DRAFT_MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  if (ledger) await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  for (const m of [INTAKE_MODEL, DRAFT_MODEL]) {
    await AppSetting.create({
      key: `ai.rates.${m}`,
      value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
    });
  }
  await Court.create({
    courtId: COURT_ID,
    name: 'District & Sessions Court, Patna',
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    courtType: 'sessions',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  });
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
}
afterEach(() => jest.restoreAllMocks());

const BASE_VALUES = [
  { key: 'applicant_name', value: 'Ram Kumar', source: 'description' },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  {
    key: 'facts_narrative',
    value:
      'The applicant was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];
const bodyWith = (earlier: string) =>
  [
    `1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a law-abiding citizen. He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and ${earlier}.`,
    '2. That FIR No. 124/2026 dated 10.03.2026 was registered at PS Kotwali under Section 318 of BNS.',
    '3. That the applicant is in judicial custody. He was wrongly named in the FIR and falsely implicated due to a family land dispute.',
    '4. That the applicant has deep roots in society and will not flee from justice.',
  ].join('\n\n');
const answerWith = (earlier: string) =>
  `${bodyWith(earlier)}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((i) => `${i}: 1`).join('\n')}`;
const PHRASE = listsOf('bail_regular').phrases[0];

function generate(earlier: V | null, answer: string, extra: Record<string, unknown> = {}) {
  mockModel(answer);
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: 'bail_regular',
      court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
      values: [...BASE_VALUES, ...(earlier ? [earlier] : [])],
      ...extra,
    });
}
const none = (source: 'description' | 'user', value = 'None'): V => ({
  key: PROTECTED,
  value,
  source,
});
const t341 = (msgs: string[]) => msgs.filter((m) => m === TEXT_1 || m === TEXT_2);

describe('T-341 ledger OFF through /generate-from-brief', () => {
  beforeEach(() => setup(false));

  it('AC1/AC2 description "None" (unconfirmed) + phrase -> text 1 in the warning event, draft returned, starting draft', async () => {
    const res = await generate(none('description'), answerWith(PHRASE));
    expect(res.status).toBe(200);
    expect(t341(warningsOf(res.text))).toEqual([TEXT_1]);
    const done = event(res.text, 'done')!;
    expect(done.docId).toBeTruthy();
    expect(done.complete).toBe(true);
    expect(done.startingDraft).toBe(true);
    expect(done.startingDraftLabel).toBeTruthy();
    expect(res.text).toContain(PHRASE); // not blocked, not removed
    expect(event(res.text, 'error')).toBeNull();
  });

  it('no earlier-applications item at all + phrase -> text 1', async () => {
    const res = await generate(null, answerWith(PHRASE));
    expect(res.status).toBe(200);
    expect(t341(warningsOf(res.text))).toEqual([TEXT_1]);
    expect(event(res.text, 'done')!.docId).toBeTruthy();
  });

  it('AC4 confirmed: user "None" + phrase -> no T-341 warning', async () => {
    const res = await generate(none('user'), answerWith(PHRASE));
    expect(res.status).toBe(200);
    expect(t341(warningsOf(res.text))).toEqual([]);
    expect(event(res.text, 'done')!.docId).toBeTruthy();
  });

  it('user "None" + the allowed averment sentence -> no T-341 warning', async () => {
    const res = await generate(none('user'), answerWith(listsOf('bail_regular').averment));
    expect(t341(warningsOf(res.text))).toEqual([]);
  });

  it('user real application + phrase -> text 2, draft returned', async () => {
    const res = await generate(none('user', REAL_APPLICATION), answerWith(PHRASE));
    expect(res.status).toBe(200);
    expect(t341(warningsOf(res.text))).toEqual([TEXT_2]);
    expect(event(res.text, 'done')!.docId).toBeTruthy();
  });

  it('description "None" but the draft has no phrase -> no T-341 warning', async () => {
    const res = await generate(
      none('description'),
      answerWith('the earlier bail applications are stated in the brief'),
    );
    expect(res.status).toBe(200);
    expect(t341(warningsOf(res.text))).toEqual([]);
  });

  it('AC4 paraphrase: description "no bail application was made before", no value read, Drafter writes a phrase -> text 1', async () => {
    // t336: Reception drops a paraphrase read as "None" (value not in the quote), so the
    // brief reaches the Drafter with no value; the model may still write the phrase.
    mockModel(
      MATCH_BAIL,
      reception([
        ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'],
        [PROTECTED, 'None', 'no bail application was made before'],
      ]),
    );
    const desc = 'My client Ram Kumar, FIR No. 124/2026. no bail application was made before.';
    const described = await request(app)
      .post('/intake/brief')
      .set(headers())
      .send({ description: desc });
    expect(described.status).toBe(200);
    const it_ = described.body.brief.items.find((i: BriefItem) => i.key === PROTECTED);
    expect(it_.value).toBeNull();
    // the same brief goes to the draft, with the description kept
    const res = await generate(null, answerWith(PHRASE), { described: desc });
    expect(res.status).toBe(200);
    expect(t341(warningsOf(res.text))).toEqual([TEXT_1]);
    expect(event(res.text, 'done')!.docId).toBeTruthy();
  });
});

describe('T-341 ledger ON through /generate-from-brief', () => {
  beforeEach(() => setup(true));

  const DESC =
    'My client Ram Kumar, aged 32, FIR No. 124/2026 at Kotwali police station. Earlier bail applications: None.';
  const READ_NONE = reception([
    ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'],
    [PROTECTED, 'None', 'Earlier bail applications: None'],
  ]);
  const F_NAME = { key: 'applicant_name', span: 'Ram Kumar', confidence: 0.99 };
  const F_NONE = { key: PROTECTED, span: 'None', confidence: 0.99 };

  async function ledgerId() {
    mockModel(MATCH_BAIL, READ_NONE, extraction(F_NAME, F_NONE));
    const res = await request(app).post('/intake/brief').set(headers()).send({ description: DESC });
    expect(res.status).toBe(200);
    return res.body.ledger.ledger_id as string;
  }

  const post = (id: string, values: Array<Record<string, unknown>>, answer: string) => {
    mockModel(answer);
    return request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: 'bail_regular',
        court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
        ledger_id: id,
        values,
      });
  };
  const SOME = [
    { key: 'applicant_name', value: 'Ram Kumar' },
    { key: 'fir_number', value: '124/2026' },
  ];

  it('AC2 description-read "None" never confirmed: the fact verifier takes the phrase out first, so there is nothing to warn about, and the banner names it', async () => {
    const id = await ledgerId();
    const res = await post(id, SOME, answerWith(PHRASE));
    expect(res.status).toBe(200);
    const done = event(res.text, 'done')!;
    expect(done.docId).toBeTruthy();
    expect(event(res.text, 'error')).toBeNull();
    // Stripping does not hide the case: the delivered text holds no phrase, and the
    // advocate is told by the verifier's banner instead.
    const sections = JSON.stringify(event(res.text, 'template_sections'));
    expect(sections).not.toContain(PHRASE);
    expect(JSON.stringify(done.factCheck)).toContain('Earlier bail applications');
    expect(done.startingDraft).toBe(true);
    expect(t341(warningsOf(res.text))).toEqual([]);
  });
});
