/**
 * T-334 — "none filed" answers (Section A) and draft phrasings that claim no earlier bail
 * application (Section B), signed by Ajay (CLO), 12 Oct 2026 (Addendum 1; hashes signed at 9b484ee).
 *
 * The lines are read from the signed md at test time (handoff/legal/T-334-none-filed-phrasings-
 * signed.md); no legal wording is retyped here. Packs and lists are read from the real
 * _averments files. The model is the Anthropic SDK stub; every answer is a fixture.
 */
import './setupDb';

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  AvermentCondition,
  AvermentLists,
  conditionHolds,
  factEntriesByKey,
  loadAvermentLists,
  resolveAverments,
} from '../services/averments';
import {
  CLAUSES_MARKER,
  checkFirstApplicationClaim,
  FIRST_APPLICATION_UNCONFIRMED,
  packTexts,
} from '../services/brief-drafter';
import { verifyDraft } from '../services/fact-verifier';
import { applyEdit } from '../services/fact-ledger.service';
import { Brief, buildBrief, buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
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

const REPO = join(__dirname, '..', '..', '..', '..');
const AVERMENTS = join(REPO, 'apps', 'drafting', 'src', 'config', 'document-rules', '_averments');
const SIGNED_MD = join(REPO, 'handoff', 'legal', 'T-334-none-filed-phrasings-signed.md');

/** The first ```text block after the heading that starts with `heading`. */
function block(md: string, heading: string): string[] {
  const from = md.indexOf(heading);
  if (from < 0) throw new Error(`signed md has no "${heading}"`);
  const m = /```text\n([\s\S]*?)\n```/.exec(md.slice(from));
  if (!m) throw new Error(`no text block after "${heading}"`);
  return m[1].split('\n').filter((l) => l.trim() !== '');
}
const MD = readFileSync(SIGNED_MD, 'utf8').replace(/\r\n/g, '\n');
const SECTION_A = block(MD, '## A.');
const SECTION_B = block(MD, '## B.');

const PROTECTED = 'earlier_bail_applications';
const FIRST = 'first_bail_application';
const PACKS = [
  'bail_regular',
  'bail_anticipatory',
  'interim_bail',
  'bail_before_magistrate',
  'default_bail',
] as const;
const REAL_APPLICATION = 'rejected by Sessions Court on 2 Sep';

// ═════════════════════════════════════════════════════════════════════════════
// The signed md and the files
// ═════════════════════════════════════════════════════════════════════════════
describe('T-334 the signed lines', () => {
  it('Section A has 23 lines and Section B has 12 (Ajay)', () => {
    expect(SECTION_A).toHaveLength(23);
    expect(SECTION_B).toHaveLength(12);
    expect(new Set(SECTION_A).size).toBe(23);
    expect(new Set(SECTION_B).size).toBe(12);
  });

  it('the two lines Ajay left out on purpose are in neither list', () => {
    for (const out of ['pehli baar', 'nahi lagayi']) {
      expect(SECTION_A).not.toContain(out);
      expect(SECTION_B).not.toContain(out);
    }
  });
});

describe('T-334 the _averments hashes are the ones Ajay signed', () => {
  // Ajay, T-334 Addendum 1, signed 9b484ee on develop_staging (recomputed by him at a8e516a).
  // bail_regular re-recorded by T-245a, approved by Ajay in Addendum 5 (41a4b27), for the Addendum 2 #1 diff only
  // (the notice_provision condition and averment). Old value 14bc53c3…0b04.
  const SIGNED: Record<string, string> = {
    bail_regular: 'df163457bd78cd19698d968d8e80a278fd738590aa779018c6ab25202f1fa923',
    bail_anticipatory: '270a841d242ef26fc74859cfa94b4bf6feb414bbf0a01ffb32f1a7ae8caa83de',
    default_bail: '2e882516bf7c5ad8f35edace6fbc53b5c264112fc9f4005a06b5878e78bdc96d',
  };
  it.each(Object.keys(SIGNED))('%s.json', (id) => {
    const sha = createHash('sha256')
      .update(readFileSync(join(AVERMENTS, `${id}.json`)))
      .digest('hex');
    expect(sha).toBe(SIGNED[id]);
  });
});

type Equals = string[];
const equalsOf = (c: AvermentCondition | null): Equals => (c as { equals: Equals }).equals;
const notInOf = (c: AvermentCondition): string[] => (c as { not_in: string[] }).not_in;
const firstBanned = (l: AvermentLists) => l.banned.find((b) => b.id === FIRST)!;
const firstAllowed = (l: AvermentLists) => l.allowed.find((a) => a.id === FIRST)!;
const earlierAllowed = (l: AvermentLists) => l.allowed.find((a) => a.id === PROTECTED);

describe.each(PACKS)('T-334 the lists of %s', (pack) => {
  const L = loadAvermentLists(pack);

  it('loads (every banned/allowed pair is checked on load)', () => {
    expect(L.banned.length).toBeGreaterThan(0);
    expect(firstBanned(L)).toBeDefined();
    expect(firstAllowed(L)).toBeDefined();
  });

  it('the banned unlock list and the allowed requires list are identical', () => {
    expect(equalsOf(firstBanned(L).unlocked_by)).toEqual(equalsOf(firstAllowed(L).requires));
  });

  it('every Section A line is in both lists, as the last 23 entries, in the signed order', () => {
    for (const list of [equalsOf(firstBanned(L).unlocked_by), equalsOf(firstAllowed(L).requires)]) {
      expect(list.slice(-SECTION_A.length)).toEqual(SECTION_A);
    }
  });

  it('every Section B line is in the phrases, as the last 12 entries, in the signed order', () => {
    expect(firstBanned(L).phrases.slice(-SECTION_B.length)).toEqual(SECTION_B);
  });

  it('earlier_bail_applications excludes every Section A line (where the pack has the entry)', () => {
    const e = earlierAllowed(L);
    if (!e) {
      expect(pack).toBe('default_bail'); // default_bail has no earlier_bail_applications entry
      return;
    }
    expect(notInOf(e.requires).slice(-SECTION_A.length)).toEqual(SECTION_A);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC2: a Section A answer counts as "none filed"
// ═════════════════════════════════════════════════════════════════════════════
const CL = buildChecklist(loadRulePack('bail_regular')!);
const answered = (text: string) => {
  const r = applyEdit(
    { facts: [], unresolved: [] } as never,
    CL.find((i) => i.key === PROTECTED),
    { key: PROTECTED, text, fromQuestion: true },
    2026,
  );
  return r.next ? r.next.facts : [];
};

describe.each(PACKS)('T-334 AC2 a Section A answer is "none filed", %s', (pack) => {
  const L = loadAvermentLists(pack);

  it.each(SECTION_A)('%j: first_bail_application unlocks, no earlier-applications line', (line) => {
    const facts = answered(line);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ key: PROTECTED, source: 'asked' });
    const entries = factEntriesByKey(facts);
    expect(conditionHolds(firstBanned(L).unlocked_by, entries)).toBe(true);
    expect(conditionHolds(firstAllowed(L).requires, entries)).toBe(true);
    const e = earlierAllowed(L);
    if (e) expect(conditionHolds(e.requires, entries)).toBe(false);

    const out = resolveAverments(L, facts);
    expect(out.allowed.map((a) => a.id)).toContain(FIRST);
    expect(out.allowed.map((a) => a.id)).not.toContain(PROTECTED);
    expect(out.banned.map((b) => b.id)).not.toContain(FIRST);
    expect(out.allowed.map((a) => a.text).join('\n')).not.toMatch(
      /earlier bail applications .*are:/i,
    );
  });

  it(`"${REAL_APPLICATION}" still prints as an earlier application`, () => {
    const facts = answered(REAL_APPLICATION);
    expect(facts).toHaveLength(1);
    const entries = factEntriesByKey(facts);
    expect(conditionHolds(firstBanned(L).unlocked_by, entries)).toBe(false);
    const out = resolveAverments(L, facts);
    expect(out.allowed.map((a) => a.id)).not.toContain(FIRST);
    expect(out.banned.map((b) => b.id)).toContain(FIRST);
    if (earlierAllowed(L)) {
      const printed = out.allowed.find((a) => a.id === PROTECTED)!;
      expect(printed.text).toMatch(/earlier bail applications .*are:/i);
      expect(printed.text).toContain(REAL_APPLICATION);
    } else {
      expect(pack).toBe('default_bail');
    }
  });

  it('the two lines left out on purpose do not unlock "none filed"', () => {
    for (const word of ['pehli baar', 'nahi lagayi']) {
      expect(conditionHolds(firstBanned(L).unlocked_by, factEntriesByKey(answered(word)))).toBe(
        false,
      );
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC2: a Section B phrasing without a confirmed "none"
// ═════════════════════════════════════════════════════════════════════════════
const draftWith = (words: string) =>
  `1. That the applicant is in custody.\n\n2. That ${words}.\n\n3. That the applicant will not flee.`;

describe.each(PACKS)('T-334 AC2 a Section B phrasing in the draft, %s', (pack) => {
  const L = loadAvermentLists(pack);
  const verify = (body: string, facts: ReturnType<typeof answered>) =>
    verifyDraft({
      body,
      facts,
      unresolved: [],
      lists: L,
      skeleton: [],
      packText: packTexts(loadRulePack(pack)!),
    });

  it.each(SECTION_B)('%j without a confirmed "none" is stripped by the verifier', (line) => {
    const vs = verify(draftWith(line), []);
    const banned = vs.filter((v) => v.check === 'banned' && v.bannedEntryId === FIRST);
    expect(banned.length).toBeGreaterThan(0);
  });

  it.each(SECTION_B)('%j with the ledger off raises the T-341 warning', (line) => {
    const b = buildBrief({
      kind: { id: pack, name: pack, court_document: true },
      checklist: buildChecklist(loadRulePack(pack)!),
      values: [{ key: PROTECTED, value: 'None', source: 'description' }],
      holdNone: equalsOf(firstAllowed(L).requires),
    }) as Brief;
    const w = checkFirstApplicationClaim(draftWith(line), b);
    expect(w.map((x) => x.message)).toEqual([FIRST_APPLICATION_UNCONFIRMED]);
  });

  it('control: with a confirmed "none" the verifier lets the phrasings stand', () => {
    const facts = answered(SECTION_A[0]);
    for (const line of SECTION_B) {
      const vs = verify(draftWith(line), facts).filter((v) => v.bannedEntryId === FIRST);
      expect(vs).toEqual([]);
    }
  });

  it(`control: with "${REAL_APPLICATION}" confirmed, the phrasing is still stripped`, () => {
    const vs = verify(draftWith(SECTION_B[0]), answered(REAL_APPLICATION));
    expect(vs.some((v) => v.check === 'banned' && v.bannedEntryId === FIRST)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC2 through /generate-from-brief, ledger on
// ═════════════════════════════════════════════════════════════════════════════
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994391d4';
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
const reception = JSON.stringify({
  outcome: 'read',
  read: [{ id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' }],
  conflicts: [],
  questions: [],
});
const extraction = JSON.stringify({
  facts: [{ key: 'applicant_name', span: 'Ram Kumar', confidence: 0.99 }],
});
const DESC = 'My client Ram Kumar, aged 32, FIR No. 124/2026 at Kotwali police station.';

function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
}
function event(text: string, name: string): Record<string, unknown> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
}

async function setup() {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.intake_model', value: INTAKE_MODEL });
  await AppSetting.create({ key: 'ai.drafting_model', value: DRAFT_MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
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

const draftAnswer = (earlierWords: string) =>
  [
    '1. That the applicant Ram Kumar is in custody in this matter, the grounds are submitted below, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.',
    `2. That ${earlierWords}.`,
    '3. That the applicant has deep roots in society and will not flee from justice.',
    '',
    CLAUSES_MARKER,
    ...CLAUSE_IDS.map((i) => `${i}: 1`),
  ].join('\n');

describe('T-334 AC2 through /generate-from-brief, ledger on', () => {
  beforeEach(setup);
  afterEach(() => jest.restoreAllMocks());

  async function ledgerWith(answer: string): Promise<string> {
    mockModel(MATCH_BAIL, reception, extraction);
    const described = await request(app)
      .post('/intake/brief')
      .set(headers())
      .send({ description: DESC });
    expect(described.status).toBe(200);
    const id = described.body.ledger.ledger_id as string;
    const upd = await request(app)
      .post('/intake/brief/update')
      .set(headers())
      .send({
        kind: 'bail_regular',
        ledger_id: id,
        values: [],
        ledger_edits: [{ key: PROTECTED, text: answer, from_question: true }],
      });
    expect(upd.status).toBe(200);
    return id;
  }
  const generate = (id: string, answer: string) => {
    mockModel(answer);
    return request(app)
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
  };
  const promptUser = () =>
    (mockMessagesStream.mock.calls[0][0] as SdkStreamParams).messages[0].content as string;
  const FIRST_TEXT = loadAvermentLists('bail_regular').allowed.find(
    (a) => a.id === FIRST,
  )!.averment;
  const PHRASE_B = SECTION_B[0];

  it.each(['none filed', 'koi bail nahi', 'कोई नहीं'])(
    'typed %j: the Drafter is offered "no other bail application", no earlier-applications line, and the Section B phrasing is not stripped',
    async (line) => {
      expect(SECTION_A).toContain(line);
      const id = await ledgerWith(line);
      const res = await generate(id, draftAnswer(PHRASE_B));
      expect(res.status).toBe(200);
      expect(event(res.text, 'error')).toBeNull();
      const user = promptUser();
      expect(user).toContain(FIRST_TEXT);
      expect(user).not.toMatch(/earlier bail applications in this matter are:/i);
      const done = event(res.text, 'done')!;
      expect(done.docId).toBeTruthy();
      expect(JSON.stringify(done.factCheck ?? null)).not.toContain('Earlier bail applications');
      expect(JSON.stringify(event(res.text, 'template_sections'))).toContain(PHRASE_B);
    },
  );

  it(`typed "${REAL_APPLICATION}": the earlier application is offered, "none" is not, and the Section B phrasing is stripped`, async () => {
    const id = await ledgerWith(REAL_APPLICATION);
    const res = await generate(id, draftAnswer(PHRASE_B));
    expect(res.status).toBe(200);
    const user = promptUser();
    expect(user).toMatch(/earlier bail applications in this matter are:/i);
    expect(user).toContain(REAL_APPLICATION);
    expect(user).not.toContain(FIRST_TEXT);
    expect(JSON.stringify(event(res.text, 'template_sections'))).not.toContain(PHRASE_B);
    expect(JSON.stringify(event(res.text, 'done')!.factCheck)).toContain(
      'Earlier bail applications',
    );
  });
});

describe('T-373: this suite ran the legacy path', () => {
  it('the skeleton loader was consulted and returned null, so d1SkeletonFor gave null and the drafts above took the legacy text stream', () => {
    // If the loader mock were removed, bail packs would take D1 (messages.parse) and this stays 0 or the
    // tests above fail; either way the mock is not silently load-bearing.
    expect(mockSkeletonLookups.length).toBeGreaterThan(0);
  });
});
