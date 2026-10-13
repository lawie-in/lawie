/**
 * T-336 — a description-read "None" on earlier bail applications is re-asked
 * as a confirm question and is not averred until confirmed, with the ledger
 * off as well as on (T-190 AC8 had the ledger path only).
 *
 * The equals-list words are read from the averments file at test time; no
 * legal wording is retyped here. The model is the Anthropic SDK stub; every
 * answer is a fixture.
 */
import './setupDb';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  checkBriefIsUsed,
  drafterBrief,
  formDataFromBrief,
  ledgerSkeletonBrief,
} from '../services/brief-drafter';
import { Brief, BriefItem, buildBrief, buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

jest.setTimeout(30_000);

// T-373: these tests drive the legacy (text-stream) path. The signed skeletons are on by default, so the
// loader is pinned to null here; every lookup is counted so the last test can show the mock was reached.
const mockSkeletonLookups: string[] = [];
jest.mock('../services/rule-pack.service', () => ({
  ...jest.requireActual('../services/rule-pack.service'),
  loadSkeleton: (packId: string) => {
    mockSkeletonLookups.push(packId);
    return null;
  },
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const PROTECTED = 'earlier_bail_applications';
const PACK = loadRulePack('bail_regular')!;
const CL = buildChecklist(PACK);
const TEMPLATE = loadTemplateConfig('bail_regular')!;
const NONES = (
  loadAvermentLists('bail_regular').allowed.find((a) => a.id === 'first_bail_application')!
    .requires as { equals: string[] }
).equals;
const REAL_APPLICATION = 'rejected by the JMFC, Dhanbad on 22.09.2026';
const KIND = { id: 'bail_regular', name: 'bail_regular', court_document: true };

type V = { key: string; value: string | string[]; source: 'description' | 'user'; quote?: string };
const build = (values: V[], holdNone: readonly string[] | null = NONES) =>
  buildBrief({ kind: KIND, checklist: CL, values, ...(holdNone ? { holdNone } : {}) }) as Brief;
const item = (b: Brief, key = PROTECTED) => b.items.find((i) => i.key === key) as BriefItem;

// ═════════════════════════════════════════════════════════════════════════════
// Unit: buildBrief with holdNone
// ═════════════════════════════════════════════════════════════════════════════
describe('T-336 buildBrief marks a description-read "none" unconfirmed', () => {
  it('the equals list is read and has more than "none" in it', () => {
    expect(NONES).toEqual(expect.arrayContaining(['none', 'nil', 'koi nahi']));
  });

  it.each(NONES)('description-read %j is marked; the value stays, with please_check', (w) => {
    const it_ = item(build([{ key: PROTECTED, value: w, source: 'description', quote: w }]));
    expect(it_.unconfirmed).toBe(true);
    expect(it_.value).toBe(w);
    expect(it_.please_check).toBe(true);
  });

  it.each(['None', 'NONE', ' none. ', 'Nil.', 'Koi  Nahi'])(
    'case and punctuation are folded: %j',
    (w) => {
      expect(item(build([{ key: PROTECTED, value: w, source: 'description' }])).unconfirmed).toBe(
        true,
      );
    },
  );

  it.each(NONES)('a user-typed %j is not marked', (w) => {
    const it_ = item(build([{ key: PROTECTED, value: w, source: 'user' }]));
    expect(it_.unconfirmed).toBeUndefined();
    expect(it_.value).toBe(w);
  });

  it('a description "None" followed by a user "None" is not marked (later entry wins)', () => {
    const b = build([
      { key: PROTECTED, value: 'None', source: 'description' },
      { key: PROTECTED, value: 'None', source: 'user' },
    ]);
    expect(item(b).unconfirmed).toBeUndefined();
    expect(item(b).value).toBe('None');
  });

  it('a user value, then a description "None" later, is marked (the later one wins)', () => {
    const b = build([
      { key: PROTECTED, value: 'None', source: 'user' },
      { key: PROTECTED, value: 'None', source: 'description' },
    ]);
    expect(item(b).unconfirmed).toBe(true);
  });

  it('a real application text read from the description is never marked', () => {
    const it_ = item(build([{ key: PROTECTED, value: REAL_APPLICATION, source: 'description' }]));
    expect(it_.unconfirmed).toBeUndefined();
    expect(it_.value).toBe(REAL_APPLICATION);
  });

  it('other keys holding "None" from the description are not marked', () => {
    const b = build([
      { key: 'antecedents', value: 'None', source: 'description' },
      { key: 'applicant_name', value: 'None', source: 'description' },
      { key: PROTECTED, value: 'None', source: 'description' },
    ]);
    for (const i of b.items) {
      if (i.key === PROTECTED) expect(i.unconfirmed).toBe(true);
      else expect(i.unconfirmed).toBeUndefined();
    }
  });

  it('with no holdNone given nothing is marked (callers that do not pass it are unchanged)', () => {
    const b = build([{ key: PROTECTED, value: 'None', source: 'description' }], null);
    expect(b.items.some((i) => i.unconfirmed)).toBe(false);
  });

  it('an empty holdNone marks nothing (also not on an empty-string entry)', () => {
    const b = build([{ key: PROTECTED, value: '', source: 'description' }], ['', ' ']);
    expect(item(b).unconfirmed).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Unit: what the Drafter gets
// ═════════════════════════════════════════════════════════════════════════════
describe('T-336 the Drafter and the checks treat an unconfirmed value as unknown', () => {
  const held = () => build([{ key: PROTECTED, value: 'None', source: 'description' }]);

  it('drafterBrief: not a fact; listed under unknown with its placeholder', () => {
    const b = held();
    const parts = drafterBrief(b, 'DISTRICT COURT');
    const label = item(b).label;
    expect(parts.facts.map((f) => f.key)).not.toContain(PROTECTED);
    expect(JSON.stringify(parts)).not.toContain('"None"');
    expect(parts.unknown).toContainEqual({ what: label, blank: item(b).placeholder });
  });

  it('drafterBrief: a confirmed (user) "None" is a fact and not in unknown', () => {
    const b = build([{ key: PROTECTED, value: 'None', source: 'user' }]);
    const parts = drafterBrief(b, 'DISTRICT COURT');
    expect(parts.facts).toContainEqual(expect.objectContaining({ key: PROTECTED, value: 'None' }));
    expect(parts.unknown.map((u) => u.what)).not.toContain(item(b).label);
  });

  it('formDataFromBrief gives the unconfirmed item its placeholder, not "None"', () => {
    const b = held();
    const data = formDataFromBrief(b, TEMPLATE, 'en');
    expect(data[PROTECTED]).toBe(item(b).placeholder);
    const confirmed = build([{ key: PROTECTED, value: 'None', source: 'user' }]);
    expect(formDataFromBrief(confirmed, TEMPLATE, 'en')[PROTECTED]).toBe('None');
  });

  it('checkBriefIsUsed: no "could not find" warning for the unconfirmed item', () => {
    const b = held();
    const label = item(b).label;
    const warnings = checkBriefIsUsed('1. That the applicant seeks bail.', b);
    expect(warnings.map((w) => w.message).join('\n')).not.toContain(label);
    expect(warnings.some((w) => (w.details as { field?: string })?.field === label)).toBe(false);
  });

  it('checkBriefIsUsed: a confirmed value absent from the draft IS still reported (the skip is narrow)', () => {
    // A real application text is a fact; leaving it out is found.
    const b = build([{ key: PROTECTED, value: REAL_APPLICATION, source: 'description' }]);
    const label = item(b).label;
    const warnings = checkBriefIsUsed('1. That the applicant seeks bail.', b);
    expect(warnings.some((w) => (w.details as { field?: string })?.field === label)).toBe(true);
  });

  it('ledgerSkeletonBrief output carries no `unconfirmed` on any item', () => {
    const b = held();
    expect(item(b).unconfirmed).toBe(true); // the input does carry it
    const out = ledgerSkeletonBrief(b, []);
    for (const i of out.items)
      expect(Object.prototype.hasOwnProperty.call(i, 'unconfirmed')).toBe(false);
    expect(JSON.stringify(out)).not.toContain('unconfirmed');
    // and the input is not changed
    expect(item(b).unconfirmed).toBe(true);
  });

  it('ledgerSkeletonBrief with a ledger fact for the key: value from the ledger, no mark', () => {
    const fact = {
      id: 'f1',
      key: PROTECTED,
      label: PROTECTED,
      type: 'text',
      value: 'None',
      display: 'None',
      raw_span: 'None',
      source: 'asked',
      confidence: 1,
      required_in_draft: false,
    } as never;
    const out = ledgerSkeletonBrief(held(), [fact]);
    expect(item(out).value).toBe('None');
    expect(item(out).unconfirmed).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Through the routes
// ═════════════════════════════════════════════════════════════════════════════
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const RULES = join(__dirname, '..', 'config', 'document-rules');
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
function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
}
type Q = { key: string; question: string; confirm?: boolean; source?: string };
type RItem = { key: string; value: unknown; unconfirmed?: boolean; please_check: boolean };

const DESC =
  'My client Ram Kumar, aged 32, FIR No. 124/2026 at Kotwali police station. ' +
  'Earlier bail applications: None.';
const READ_NONE = reception([
  ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'],
  [PROTECTED, 'None', 'Earlier bail applications: None'],
]);
const F_NAME = { key: 'applicant_name', span: 'Ram Kumar', confidence: 0.99 };
const F_NONE = { key: PROTECTED, span: 'None', confidence: 0.99 };

const describe_ = (description = DESC) =>
  request(app).post('/intake/brief').set(headers()).send({ description });
const update = (values: Array<Record<string, unknown>>) =>
  request(app).post('/intake/brief/update').set(headers()).send({ kind: 'bail_regular', values });
const itemOf = (items: RItem[]) => items.find((i) => i.key === PROTECTED)!;

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

const FIRST_GROUND = CL.find((i) => i.key === 'grounds_for_bail')!.options[0];
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
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
// A body that covers the pack's clauses (as documents.generate-from-brief.test.ts does),
// with the earlier-applications words left as a slot filled per test.
const bodyWith = (earlier: string) =>
  [
    `1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a law-abiding citizen. He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and ${earlier}.`,
    '2. That FIR No. 124/2026 dated 10.03.2026 was registered at PS Kotwali under Section 318 of BNS.',
    '3. That the applicant is in judicial custody. He was wrongly named in the FIR and falsely implicated due to a family land dispute.',
    '4. That the applicant has deep roots in society and will not flee from justice.',
  ].join('\n\n');
const BODY = bodyWith('the earlier bail applications are stated in the brief');
const blankOf = () =>
  (JSON.parse(read(join(RULES, 'bail_regular.json'))).promptInstructions as string[])
    .join('\n')
    .match(/\[To be confirmed: whether any earlier bail application[^\]]*\]/)![0];

function generate(
  source: 'description' | 'user',
  value = 'None',
  extra: Record<string, unknown> = {},
  answer = `${BODY}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((i) => `${i}: 1`).join('\n')}`,
) {
  mockModel(answer);
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: 'bail_regular',
      court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
      values: [...BASE_VALUES, { key: PROTECTED, value, source }],
      ...extra,
    });
}
const promptOf = () => {
  const p = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
  return { system: p.system as string, user: p.messages[0].content as string };
};
/** The BRIEF block of the Drafter prompt, parsed. */
const briefIn = (user: string) => {
  const from = user.indexOf('BRIEF:\n') + 'BRIEF:\n'.length;
  const to = user.indexOf('\n\nCLAUSES (', from);
  return JSON.parse(user.slice(from, to)) as {
    facts: Array<{ key: string; value: unknown }>;
    unknown: Array<{ what: string; blank: string }>;
  };
};

describe('T-336 ledger OFF through the routes', () => {
  beforeEach(() => setup(false));

  it('AC1 /intake/brief: description-read "None" -> confirm question first, brief item unconfirmed', async () => {
    mockModel(MATCH_BAIL, READ_NONE);
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(res.body.ledger).toBeUndefined();
    const it_ = itemOf(res.body.brief.items);
    expect(it_).toMatchObject({ value: 'None', unconfirmed: true, please_check: true });
    const q = res.body.questions as Q[];
    const asked = q.filter((x) => x.key === PROTECTED);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ confirm: true, source: 'pack' });
    expect(q.filter((x) => x.confirm)).toHaveLength(1);
    expect(q[0].key).toBe(PROTECTED);
  });

  it('AC1 /intake/brief: a real application text read from the description is not asked again', async () => {
    mockModel(
      MATCH_BAIL,
      reception([
        ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'],
        [PROTECTED, REAL_APPLICATION, REAL_APPLICATION],
      ]),
    );
    const res = await describe_(`My client Ram Kumar. His application was ${REAL_APPLICATION}.`);
    expect(res.status).toBe(200);
    const it_ = itemOf(res.body.brief.items);
    expect(it_.unconfirmed).toBeUndefined();
    expect(it_.value).toBe(REAL_APPLICATION);
    const q = res.body.questions as Q[];
    expect(q.map((x) => x.key)).not.toContain(PROTECTED);
    expect(q.some((x) => x.confirm)).toBe(false);
  });

  it('a paraphrase read as "None" (value not in the quote) is dropped by Reception: no value, no confirm, the key is asked as an ordinary question', async () => {
    mockModel(
      MATCH_BAIL,
      reception([
        ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'],
        [PROTECTED, 'None', 'no bail application was made before'],
      ]),
    );
    const res = await describe_(
      'My client Ram Kumar, FIR No. 124/2026. no bail application was made before.',
    );
    expect(res.status).toBe(200);
    const it_ = itemOf(res.body.brief.items);
    expect(it_.value).toBeNull();
    expect(it_.unconfirmed).toBeUndefined();
    const asked = (res.body.questions as Q[]).filter((x) => x.key === PROTECTED);
    expect(asked).toHaveLength(1);
    expect(asked[0].confirm).toBeUndefined();
  });

  it('/intake/brief/update keeps the mark for a description value, drops it for a user value', async () => {
    const kept = await update([{ key: PROTECTED, value: 'None', source: 'description' }]);
    expect(kept.status).toBe(200);
    expect(itemOf(kept.body.brief.items)).toMatchObject({ value: 'None', unconfirmed: true });
    const cleared = await update([
      { key: PROTECTED, value: 'None', source: 'description' },
      { key: PROTECTED, value: 'None', source: 'user' },
    ]);
    expect(itemOf(cleared.body.brief.items).unconfirmed).toBeUndefined();
    const typed = await update([{ key: PROTECTED, value: 'None', source: 'user' }]);
    expect(itemOf(typed.body.brief.items)).toMatchObject({ value: 'None' });
    expect(itemOf(typed.body.brief.items).unconfirmed).toBeUndefined();
  });

  it('AC2 /generate-from-brief, source description: no fact for the key; listed under unknown with its placeholder', async () => {
    const res = await generate('description');
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1); // no verifier / repair call on this path
    const { user } = promptOf();
    const b = briefIn(user);
    expect(b.facts.map((f) => f.key)).not.toContain(PROTECTED);
    const label = itemOf(
      (await update([{ key: PROTECTED, value: 'None', source: 'description' }])).body.brief.items,
    ) as unknown as { label: string; placeholder: string };
    expect(b.unknown).toContainEqual({ what: label.label, blank: label.placeholder });
    // the "None" is not given as a fact anywhere in the BRIEF
    expect(JSON.stringify(b.facts)).not.toMatch(/"value":\s*"None"/);
    // the averment's text is not in the prompt as a fact
    const avermentText = loadAvermentLists('bail_regular').allowed.find(
      (a) => a.id === 'first_bail_application',
    )!.averment;
    expect(user).not.toContain(avermentText);
    expect(user).not.toContain('first_bail_application');
    // the pack's own rule for the blank is what the Drafter is told
    expect(user).toContain(blankOf());
  });

  it('AC2 same flow, source user "None": it is a fact and not under unknown', async () => {
    const res = await generate('user');
    expect(res.status).toBe(200);
    const b = briefIn(promptOf().user);
    expect(b.facts).toContainEqual(expect.objectContaining({ key: PROTECTED, value: 'None' }));
    expect(b.unknown.map((u) => u.what).join('\n')).not.toMatch(/earlier bail/i);
  });

  it('AC2 source description with a real application text: it is a fact', async () => {
    const res = await generate('description', REAL_APPLICATION);
    expect(res.status).toBe(200);
    const b = briefIn(promptOf().user);
    expect(b.facts).toContainEqual(
      expect.objectContaining({ key: PROTECTED, value: REAL_APPLICATION }),
    );
  });

  it('fact verifier (non-ledger): is not run; a draft with the blank on the earlier-applications line passes with no extra model call', async () => {
    // The verifier is ledger-only (ai.service.ts: `if (ledgerInput && input.ledger)`).
    const blank = blankOf();
    const answer = `${bodyWith(blank)}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((i) => `${i}: 1`).join('\n')}`;
    const res = await generate('description', 'None', {}, answer);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(res.text).toContain('To be confirmed: whether any earlier bail application');
    expect(res.text).not.toMatch(/could not find this from your brief in the draft: Earlier bail/i);
  });
});

describe('T-336 ledger ON through the routes (T-190 AC8 unchanged)', () => {
  beforeEach(() => setup(true));

  it('AC1 /intake/brief: description-read "None": no ledger fact; the question is first with confirm', async () => {
    mockModel(MATCH_BAIL, READ_NONE, extraction(F_NAME, F_NONE));
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(itemOf(res.body.brief.items).value).toBe('None');
    expect(res.body.ledger.facts.map((f: { key: string }) => f.key)).not.toContain(PROTECTED);
    const q = res.body.questions as Q[];
    expect(q[0]).toMatchObject({ key: PROTECTED, confirm: true, source: 'pack' });
    expect(q.filter((x) => x.confirm)).toHaveLength(1);
  });

  it('a skipped confirm leaves the B4 blank in the Drafter prompt and no fact for the key', async () => {
    mockModel(MATCH_BAIL, READ_NONE, extraction(F_NAME, F_NONE));
    const id = (await describe_()).body.ledger.ledger_id as string;
    mockModel(`${BODY}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((i) => `${i}: 1`).join('\n')}`);
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: 'bail_regular',
        court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
        ledger_id: id,
        values: [
          { key: 'applicant_name', value: 'Ram Kumar' },
          { key: 'fir_number', value: '124/2026' },
        ],
      });
    expect(res.status).toBe(200);
    const { system, user } = promptOf();
    expect(system + user).toContain(blankOf());
    expect(user).not.toMatch(/"key":\s*"earlier_bail_applications"/);
    expect(user).not.toContain('unconfirmed');
    const banned = user.slice(user.indexOf('BANNED ASSERTIONS'), user.indexOf('\n\nTARGET:'));
    expect(banned).toMatch(/^- first_bail_application \|/m);
  });
});

describe('T-373: this suite ran the legacy path', () => {
  it('the skeleton loader was consulted and returned null, so d1SkeletonFor gave null and the drafts above took the legacy text stream', () => {
    // If the loader mock were removed, bail packs would take D1 (messages.parse) and this stays 0 or the
    // tests above fail; either way the mock is not silently load-bearing.
    expect(mockSkeletonLookups.length).toBeGreaterThan(0);
  });
});
