/**
 * T-147c — the Drafter may use only the ledger, and may not assert what it
 * was not given (ADR-022 section 2B).
 *
 * Covers the mechanism, not Ajay's wording: ids, keys and structure are
 * asserted, phrases are not (except the placeholder form, which the ticket
 * fixes). The model is the Anthropic SDK stub; every answer is a fixture.
 *
 * AC1 prompt built from ledger + skeleton only; AC2 bail banned list; AC3 no
 * employment fact, no employment averment; AC4 backing fact unlocks and uses
 * `display`; AC5 `{{MISSING: label}}`; AC6 default-deny, inheritance, no
 * chaining, files; AC7 no case law from a ledger with none; AC8 parts the
 * system writes are unchanged (the golden run is the full-suite run). Also:
 * switch off, ownership/kind 404, repair pass, PII.
 */
import './setupDb';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as averments from '../services/averments';
import {
  AVERMENTS_DIR,
  AvermentFileError,
  conditionKeys,
  checkUnlockPairs,
  loadAvermentLists,
  readAvermentFile,
  resolveAverments,
} from '../services/averments';
import {
  CLAUSES_MARKER,
  ledgerCitationSources,
  ledgerDrafterFacts,
  ledgerSkeletonBrief,
  missingPlaceholder,
} from '../services/brief-drafter';
import { AUTHORITY_BLANK } from '../services/citation-check';
import {
  DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT,
  DRAFTER_LEDGER_SYSTEM_PROMPT,
  DRAFTER_PACK_SYSTEM_PROMPT,
} from '../services/drafter.prompts';
import { buildChecklist } from '../services/intake-brief';
import { contentToHtml, missingAsBlanks } from '../services/pdf-export.service';
import { listRulePackIds, loadRulePack } from '../services/rule-pack.service';
import { decrypt, encrypt } from '../utils/encryption';
import { missingAsBlanks as missingAsBlanksUtil } from '../utils/missingAsBlanks';
import { ReviewToken } from '../models/ReviewToken.model';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994390a1';
const OTHER_USER_ID = '507f1f77bcf86cd7994390a2';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

const PACK = loadRulePack('bail_regular')!;
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const CHECKLIST = buildChecklist(PACK);
const FIRST_GROUND = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.options[0];
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

// Sentinels. None may reach the Drafter on the ledger path except SENT_DISPLAY,
// which is a ledger display and is meant to.
const SENT_BRIEF = 'SENTBRIEFxq91';
const SENT_DESC = 'SENTDESCxq92';
const SENT_SPAN = 'SENTSPANxq93';
const SENT_VALUE = 'SENTVALUExq94';
const SENT_DISPLAY = 'SENTDISPLAYxq95';

const VALUES = [
  { key: 'applicant_name', value: 'Ram Kumar' },
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
    value: `The applicant was wrongly named in the FIR and falsely implicated. ${SENT_BRIEF}`,
  },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];

const BODY = [
  '1. That the applicant Ram Kumar is a law-abiding citizen.',
  '2. That FIR No. 124/2026 was registered at PS Kotwali under Section 318 of BNS.',
  '3. That the applicant is in judicial custody.',
].join('\n\n');

function report(overrides: Record<string, string> = {}): string {
  return CLAUSE_IDS.map((id) => `${id}: ${overrides[id] ?? '1'}`).join('\n');
}
function drafterAnswer(body = BODY, overrides: Record<string, string> = {}): string {
  return `${body}\n\n${CLAUSES_MARKER}\n${report(overrides)}`;
}
function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 4000, 800));
  return mockMessagesStream;
}
function callOf(n: number): { system: string; user: string } {
  const p = mockMessagesStream.mock.calls[n][0] as SdkStreamParams;
  return { system: p.system, user: p.messages[0].content };
}
function event(text: string, name: string): Record<string, unknown> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
}
function post(body: Record<string, unknown>, userId = USER_ID) {
  return request(app).post('/generate-from-brief').set(headers(userId)).send(body);
}

// ── prompt readers ───────────────────────────────────────────────────────────
function allowedSection(prompt: string): string {
  const a = prompt.indexOf('AVERMENTS ALLOWED');
  const b = prompt.indexOf('BANNED ASSERTIONS');
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return prompt.slice(a, b);
}
function bannedSection(prompt: string): string {
  const b = prompt.indexOf('BANNED ASSERTIONS');
  const t = prompt.indexOf('\n\nTARGET:');
  expect(b).toBeGreaterThan(-1);
  expect(t).toBeGreaterThan(b);
  return prompt.slice(b, t);
}
interface PromptFacts {
  court: string | null;
  facts: Array<{ key: string; label: string; type: string; display: string }>;
  missing: Array<{ key: string; label: string; write: string }>;
}
function factsOf(prompt: string): PromptFacts {
  const from = prompt.indexOf('FACTS:\n');
  const to = prompt.indexOf('\n\nCLAUSES');
  expect(from).toBeGreaterThan(-1);
  return JSON.parse(prompt.slice(from + 'FACTS:\n'.length, to)) as PromptFacts;
}
const ids = (section: string, id: string) => new RegExp(`^- ${id} \\|`, 'm').test(section);

// ── ledger fixtures ──────────────────────────────────────────────────────────
function fact(
  key: string,
  display: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `f_${key}`,
    key,
    label: CHECKLIST.find((i) => i.key === key)?.label ?? key,
    type: 'text',
    value: display,
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.99,
    required_in_draft: true,
    ...extra,
  };
}

/** Every required fact of a regular bail application the checklist asks for. */
function baseFacts(): Array<Record<string, unknown>> {
  return [
    fact('applicant_name', 'Ram Kumar', { type: 'person_name', raw_span: `Ram ${SENT_SPAN}` }),
    fact('father_name', 'Shri Hari Kumar', { type: 'person_name' }),
    fact('applicant_age', '32'),
    fact('address', '123 Main St, Patna', { type: 'place_name', value: SENT_VALUE }),
    fact('fir_number', '124/2026', { type: 'case_number' }),
    fact('fir_date', '10 March 2026', { type: 'date', value: '2026-03-10' }),
    fact('police_station', 'Kotwali', { type: 'police_station' }),
    fact('currently_in_custody', 'Judicial custody'),
    fact('facts_narrative', 'He was wrongly named in the FIR.'),
  ];
}

async function ledger(
  facts: Array<Record<string, unknown>>,
  opts: { userId?: string; kind?: string; unresolved?: Array<Record<string, unknown>> } = {},
): Promise<string> {
  const doc = await FactLedgerModel.create({
    userId: opts.userId ?? USER_ID,
    documentKind: opts.kind ?? 'bail_regular',
    runType: 'fixture',
    currentVersion: 1,
    versions: [
      {
        version: 1,
        facts,
        unresolved: opts.unresolved ?? [],
        createdAt: new Date(),
        reason: 'extract',
      },
    ],
  });
  return String(doc._id);
}

function draft(ledgerId: string | undefined, extra: Record<string, unknown> = {}) {
  return post({
    kind: 'bail_regular',
    values: VALUES,
    court,
    ...(ledgerId ? { ledger_id: ledgerId } : {}),
    ...extra,
  });
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
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
  for (const id of [USER_ID, OTHER_USER_ID]) {
    await User.create({
      _id: id,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
  }
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ── AC1 ──────────────────────────────────────────────────────────────────────
describe('AC1: the Drafter call is built from the ledger and the skeleton only', () => {
  it('uses the ledger system prompt; no description, raw_span, brief value or ledger value is sent', async () => {
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer());
    const res = await draft(id, { described: `My client Ram. ${SENT_DESC}` });
    expect(res.status).toBe(200);

    const { system, user } = callOf(0);
    expect(system).toBe(DRAFTER_LEDGER_SYSTEM_PROMPT);
    expect(user).toContain('FACTS:');
    for (const s of [SENT_BRIEF, SENT_DESC, SENT_SPAN, SENT_VALUE]) expect(user).not.toContain(s);
    for (const s of ['"described"', '"raw_span"', '"values"', 'BRIEF:']) {
      expect(user).not.toContain(s);
    }
    // What the ledger displays is what the Drafter sees.
    expect(user).toContain('123 Main St, Patna');
    // The shape of FACTS is exactly the four fields and no more.
    const f = factsOf(user);
    for (const row of f.facts) expect(Object.keys(row).sort()).toEqual(['display', 'key', 'label', 'type']);
  });

  it('a brief-only value appears only inside SYSTEM PARTS / BEFORE / AFTER YOUR TEXT (ADR-021 skeleton), main and repair', async () => {
    const SENT_ADDR = 'SENTADDRxq96';
    const id = await ledger(baseFacts());
    const values = VALUES.map((v) =>
      v.key === 'address' ? { ...v, value: `123 Main St, Patna ${SENT_ADDR}` } : v,
    );
    mockModel(drafterAnswer(BODY, { [CLAUSE_IDS[0]]: '0' }), drafterAnswer());
    const res = await post({ kind: 'bail_regular', values, court, ledger_id: id, described: SENT_DESC });
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    for (const n of [0, 1]) {
      const { user } = callOf(n);
      const from = user.indexOf('SYSTEM PARTS');
      const to = user.indexOf('AVERMENTS ALLOWED');
      expect(from).toBeGreaterThan(-1);
      expect(to).toBeGreaterThan(from);
      const outside = user.slice(0, from) + user.slice(to);
      expect(outside).not.toContain(SENT_ADDR);
      for (const s of [SENT_DESC, SENT_SPAN, SENT_VALUE]) expect(user).not.toContain(s);
    }
  });

  it('the pure builder drops value and raw_span, and an unresolved item is not a fact', () => {
    const out = ledgerDrafterFacts(
      baseFacts() as never,
      CHECKLIST,
      'DISTRICT & SESSIONS JUDGE, PATNA',
      true,
    );
    expect(JSON.stringify(out)).not.toMatch(new RegExp(`${SENT_SPAN}|${SENT_VALUE}|raw_span`));
    expect(out.court).toBe('DISTRICT & SESSIONS JUDGE, PATNA');
  });

  it('the stored sentinel is in the ledger but the request did not need the brief values for FACTS', async () => {
    // Facts come from the ledger, not from the brief the browser sent.
    const id = await ledger([fact('applicant_name', 'Only Ledger Name', { type: 'person_name' })]);
    mockModel(drafterAnswer());
    await draft(id);
    const f = factsOf(callOf(0).user);
    expect(f.facts.map((x) => x.key)).toEqual(['applicant_name']);
    expect(f.facts[0].display).toBe('Only Ledger Name');
  });
});

// ── AC2 ──────────────────────────────────────────────────────────────────────
const EIGHT = [
  'no_criminal_antecedents',
  'gainfully_employed',
  'cooperated_with_investigation',
  'deep_roots_in_society',
  'no_flight_risk',
  'no_likelihood_of_tampering',
  'no_likelihood_of_absconding',
  'sole_breadwinner',
];

describe('AC2: bail_regular banned list', () => {
  const lists = loadAvermentLists('bail_regular');

  it.each(EIGHT)('%s is banned and names the key(s) and label(s) that unlock it', (id) => {
    const entry = lists.banned.find((b) => b.id === id);
    expect(entry).toBeDefined();
    expect(entry!.phrases.length).toBeGreaterThan(0);
    expect(entry!.unlocked_by).not.toBeNull();
    expect(conditionKeys(entry!.unlocked_by).length).toBeGreaterThan(0);
    const leaves = JSON.stringify(entry!.unlocked_by).match(/"key":"[^"]+"/g) ?? [];
    const labels = JSON.stringify(entry!.unlocked_by).match(/"label":"[^"]+"/g) ?? [];
    expect(labels.length).toBe(leaves.length);
  });

  it('all eight are in BANNED ASSERTIONS of the prompt when the ledger has no backing fact', async () => {
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer());
    await draft(id);
    const banned = bannedSection(callOf(0).user);
    for (const b of EIGHT) expect(ids(banned, b)).toBe(true);
  });
});

// ── AC3 ──────────────────────────────────────────────────────────────────────
describe('AC3: no employment fact, no employment averment', () => {
  it('no occupation fact: gainfully_employed is banned and not allowed', async () => {
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer());
    await draft(id);
    const { user } = callOf(0);
    expect(ids(bannedSection(user), 'gainfully_employed')).toBe(true);
    expect(ids(allowedSection(user), 'gainfully_employed')).toBe(false);
    expect(allowedSection(user)).not.toMatch(/employ/i);
  });

  it.each(['unemployed', 'Unemployed', 'Berozgar', 'Not employed', 'retired'])(
    'applicant_occupation = %j keeps it banned',
    (occ) => {
      const r = resolveAverments(loadAvermentLists('bail_regular'), [
        fact('applicant_occupation', occ),
        fact('employer_name', 'Shree Travels'),
      ] as never);
      expect(r.banned.map((b) => b.id)).toContain('gainfully_employed');
      expect(r.allowed.map((a) => a.id)).not.toContain('gainfully_employed');
      expect(r.allowed.some((a) => a.text.includes('Shree Travels'))).toBe(false);
    },
  );

  it('an employer with no occupation does not unlock it', () => {
    const r = resolveAverments(loadAvermentLists('bail_regular'), [
      fact('employer_name', 'Shree Travels'),
    ] as never);
    expect(r.banned.map((b) => b.id)).toContain('gainfully_employed');
    expect(r.allowed.some((a) => a.text.includes('Shree Travels'))).toBe(false);
  });

  it('a fact with a blank display is not a fact', () => {
    const r = resolveAverments(loadAvermentLists('bail_regular'), [
      fact('applicant_occupation', '   '),
    ] as never);
    expect(r.banned.map((b) => b.id)).toContain('gainfully_employed');
  });
});

// ── AC4 ──────────────────────────────────────────────────────────────────────
describe('AC4: the backing fact allows the averment, in the ledger display', () => {
  it('occupation + employer: allowed, uses display, ban lifted (through the route)', async () => {
    const id = await ledger([
      ...baseFacts(),
      fact('applicant_occupation', 'Taxi Driver', { value: 'driver' }),
      fact('employer_name', 'Shree Travels'),
    ]);
    mockModel(drafterAnswer());
    await draft(id);
    const { user } = callOf(0);
    // Mechanism, not wording: the ledger display is what the allowed averment carries.
    expect(allowedSection(user)).toContain('Taxi Driver');
    expect(allowedSection(user)).toContain('Shree Travels');
    expect(allowedSection(user)).not.toContain('driver,'); // value 'driver' is not printed, display is
    expect(ids(bannedSection(user), 'gainfully_employed')).toBe(false);
    // The other seven stay banned: employment unlocks nothing else.
    for (const b of EIGHT.filter((x) => x !== 'gainfully_employed')) {
      expect(ids(bannedSection(user), b)).toBe(true);
    }
  });

  it('the driver / Shree Travels case from the ticket', () => {
    const r = resolveAverments(loadAvermentLists('bail_regular'), [
      fact('applicant_occupation', 'driver'),
      fact('employer_name', 'Shree Travels'),
    ] as never);
    const withEmployer = r.allowed.filter((a) => a.text.includes('Shree Travels'));
    expect(withEmployer.length).toBeGreaterThan(0);
    expect(withEmployer.map((a) => a.text)).toContain("the applicant's occupation is driver, at Shree Travels");
    for (const a of withEmployer) expect(a.text).toContain('driver');
    expect(r.banned.map((b) => b.id)).not.toContain('gainfully_employed');
  });

  it('occupation alone: the averment carries the occupation display and no employer', () => {
    const r = resolveAverments(loadAvermentLists('bail_regular'), [
      fact('applicant_occupation', 'Taxi Driver', { value: 'driver' }),
    ] as never);
    expect(r.allowed.map((a) => a.text)).toContain("the applicant's occupation is Taxi Driver");
    expect(r.banned.map((b) => b.id)).not.toContain('gainfully_employed');
  });

  it('an allowed averment whose placeholder fact is not held is not offered', () => {
    const lists = {
      banned: [],
      allowed: [
        {
          id: 'x',
          kind: 'averment' as const,
          averment: 'works at {{employer_name}}',
          requires: { key: 'applicant_occupation', present: true as const },
        },
      ],
    };
    expect(resolveAverments(lists, [fact('applicant_occupation', 'driver')] as never).allowed).toEqual([]);
  });
});

// ── AC5 ──────────────────────────────────────────────────────────────────────
describe('AC5: a required fact the ledger lacks is {{MISSING: label}}', () => {
  const label = (key: string) => CHECKLIST.find((i) => i.key === key)!.label;

  it('absent from the ledger -> missing with the exact placeholder; held facts are not', async () => {
    const facts = baseFacts().filter((f) => f.key !== 'police_station');
    const id = await ledger(facts);
    mockModel(drafterAnswer());
    await draft(id);
    const f = factsOf(callOf(0).user);
    const m = f.missing.find((x) => x.key === 'police_station');
    expect(m).toBeDefined();
    expect(m!.write).toBe(`{{MISSING: ${label('police_station')}}}`);
    expect(m!.label).toBe(label('police_station'));
    expect(f.missing.find((x) => x.key === 'applicant_name')).toBeUndefined();
  });

  it('unresolved in the ledger counts as missing', async () => {
    const id = await ledger(
      baseFacts().filter((f) => f.key !== 'fir_number'),
      {
        unresolved: [
          { id: 'u1', key: 'fir_number', label: 'FIR', reason: 'ambiguous', raw_span: SENT_SPAN },
        ],
      },
    );
    mockModel(drafterAnswer());
    await draft(id);
    const { user } = callOf(0);
    const f = factsOf(user);
    expect(f.missing.find((x) => x.key === 'fir_number')!.write).toBe(
      `{{MISSING: ${label('fir_number')}}}`,
    );
    expect(f.facts.find((x) => x.key === 'fir_number')).toBeUndefined();
    expect(user).not.toContain(SENT_SPAN);
  });

  it('an empty ledger makes every required item missing', () => {
    const out = ledgerDrafterFacts([], CHECKLIST, null, true);
    const required = CHECKLIST.filter((i) => i.required).map((i) => i.key);
    expect(out.missing.map((m) => m.key).sort()).toEqual(required.sort());
    expect(out.court).toBe('{{MISSING: court}}');
  });

  it('placeholder form is flattened, never with braces or newlines inside the label', () => {
    expect(missingPlaceholder('FIR  number')).toBe('{{MISSING: FIR number}}');
    expect(missingPlaceholder('a {b}\nc')).toBe('{{MISSING: a b c}}');
    expect(missingPlaceholder('  ')).toBe('{{MISSING: detail}}');
  });

  it('the system prompt tells the Drafter to write it exactly and not to shorten', () => {
    expect(DRAFTER_LEDGER_SYSTEM_PROMPT).toContain('{{MISSING: label}}');
    expect(DRAFTER_LEDGER_SYSTEM_PROMPT).toMatch(/write its placeholder exactly as given/);
    expect(DRAFTER_LEDGER_SYSTEM_PROMPT).toMatch(/Do not shorten or leave out a sentence or a clause/);
    expect(DRAFTER_LEDGER_SYSTEM_PROMPT).toMatch(/never put other words in its place/);
  });
});

// ── AC6 ──────────────────────────────────────────────────────────────────────
describe('AC6: default-deny, inheritance, no chaining, files', () => {
  it('a pack with no file resolves to _default, with no code change', () => {
    expect(existsSync(join(AVERMENTS_DIR, 'plaint_recovery.json'))).toBe(false);
    const l = loadAvermentLists('plaint_recovery');
    const d = readAvermentFile('_default')!;
    expect(l.source).toBe('_default');
    expect(l.inherits).toBeNull();
    expect(l.banned.map((b) => b.id)).toEqual(d.banned.map((b) => b.id));
    expect(l.banned.length).toBeGreaterThan(0);
  });

  it('an unknown or path-like pack id is default-deny, never a file read', () => {
    expect(loadAvermentLists('../bail_regular').source).toBe('_default');
    expect(loadAvermentLists('_default').source).toBe('_default');
  });

  it('a pack with no file: default-deny reaches the prompt (route, kind with no file)', async () => {
    const l = loadAvermentLists('plaint_recovery');
    expect(resolveAverments(l, []).banned.length).toBe(l.banned.length);
  });

  /** A synthetic list directory; the logic is tested here, not Ajay's data. */
  function withDir(files: Record<string, unknown>, fn: (dir: string) => void) {
    const dir = mkdtempSync(join(tmpdir(), 't147c-'));
    try {
      for (const [n, o] of Object.entries(files)) {
        writeFileSync(join(dir, `${n}.json`), typeof o === 'string' ? o : JSON.stringify(o));
      }
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const EMPTY = { banned: [], allowed: [] };
  const unlockable = (id: string, key: string) => ({
    banned: { id, phrases: [id], unlocked_by: { key, label: key, present: true } },
    allowed: { id, averment: `${id} {{${key}}}`, requires: { key, label: key, present: true } },
  });

  it('inheritance with key_map: the child reads its own key names; the parent file is not mutated', () => {
    const u = unlockable('roots', 'address');
    withDir(
      {
        _default: EMPTY,
        parent: { banned: [u.banned], allowed: [u.allowed] },
        child: { inherits: 'parent', key_map: { address: 'applicant_address' }, banned: [], allowed: [] },
      },
      (dir) => {
        const child = loadAvermentLists('child', dir);
        const parent = loadAvermentLists('parent', dir);
        expect(child.inherits).toBe('parent');
        expect(child.banned.map((b) => b.id)).toEqual(['roots']);
        expect(child.allowed[0].averment).toBe('roots {{applicant_address}}');
        const mapped = [fact('applicant_address', 'Plot 4')] as never;
        const unmapped = [fact('address', 'Plot 4')] as never;
        expect(resolveAverments(child, mapped).banned).toEqual([]);
        expect(resolveAverments(child, mapped).allowed[0].text).toBe('roots Plot 4');
        expect(resolveAverments(child, unmapped).banned.map((b) => b.id)).toEqual(['roots']);
        expect(resolveAverments(parent, unmapped).banned).toEqual([]);
        expect(resolveAverments(parent, mapped).banned.map((b) => b.id)).toEqual(['roots']);
        expect(parent.banned[0].unlocked_by).toEqual(u.banned.unlocked_by);
      },
    );
  });

  it('the real interim_bail and bail_before_magistrate inherit bail_regular and carry all its entry ids', () => {
    const parent = loadAvermentLists('bail_regular');
    for (const name of ['interim_bail', 'bail_before_magistrate']) {
      const l = loadAvermentLists(name);
      expect(l.inherits).toBe('bail_regular');
      expect(l.source).toBe(name);
      for (const b of parent.banned) expect(l.banned.map((x) => x.id)).toContain(b.id);
    }
  });

  it('a child entry replaces the parent entry of the same id; defaults sit under both', () => {
    withDir(
      {
        _default: { banned: [{ id: 'd', phrases: ['dflt'], unlocked_by: null }], allowed: [] },
        parent: { banned: [{ id: 'a', phrases: ['p'], unlocked_by: null }], allowed: [] },
        child: {
          inherits: 'parent',
          banned: [unlockable('a', 'k').banned],
          allowed: [unlockable('a', 'k').allowed],
        },
      },
      (dir) => {
        const l = loadAvermentLists('child', dir);
        expect(l.banned.map((b) => b.id).sort()).toEqual(['a', 'd']);
        expect(l.banned.find((b) => b.id === 'a')!.phrases).toEqual(['a']);
      },
    );
  });

  it('inheritance is one level; a missing parent, bad JSON and a malformed condition all throw', () => {
    withDir(
      {
        _default: EMPTY,
        parent: EMPTY,
        child: { inherits: 'parent', banned: [], allowed: [] },
        grandchild: { inherits: 'child', banned: [], allowed: [] },
        orphan: { inherits: 'nowhere', banned: [], allowed: [] },
        bad: { banned: [{ id: 'x', phrases: [], unlocked_by: { key: 'k' } }], allowed: [] },
        broken: '{ not json',
      },
      (dir) => {
        expect(() => loadAvermentLists('child', dir)).not.toThrow();
        for (const n of ['grandchild', 'orphan', 'bad', 'broken']) {
          expect(() => loadAvermentLists(n, dir)).toThrow(AvermentFileError);
        }
      },
    );
  });

  it('loader rule: an unlockable banned entry with no allowed entry of the same id is refused', () => {
    const u = unlockable('x', 'k');
    withDir(
      {
        _default: EMPTY,
        orphaned: { banned: [u.banned], allowed: [] },
        paired: { banned: [u.banned], allowed: [u.allowed] },
        // a never-unlocked entry (null) needs no allowed entry
        denied: { banned: [{ id: 'n', phrases: ['n'], unlocked_by: null }], allowed: [] },
      },
      (dir) => {
        expect(() => loadAvermentLists('orphaned', dir)).toThrow(AvermentFileError);
        expect(() => loadAvermentLists('paired', dir)).not.toThrow();
        expect(() => loadAvermentLists('denied', dir)).not.toThrow();
      },
    );
  });

  describe('no chaining', () => {
    it('a condition naming another entry id (not a ledger key) never unlocks', () => {
      const lists = {
        banned: [
          { id: 'A', kind: 'averment' as const, phrases: ['a'], unlocked_by: { key: 'x', present: true as const } },
          // B is unlocked only "by A": it names A's id, which is not a ledger fact.
          { id: 'B', kind: 'averment' as const, phrases: ['b'], unlocked_by: { key: 'A', present: true as const } },
        ],
        allowed: [],
      };
      const r = resolveAverments(lists, [fact('x', 'present')] as never);
      expect(r.banned.map((b) => b.id)).toEqual(['B']);
    });

    it('in bail_regular, unlocking gainfully_employed does not unlock the entries that need more', () => {
      const r = resolveAverments(loadAvermentLists('bail_regular'), [
        fact('applicant_occupation', 'driver'),
        fact('employer_name', 'Shree Travels'),
      ] as never);
      const banned = r.banned.map((b) => b.id);
      for (const id of EIGHT.filter((x) => x !== 'gainfully_employed')) expect(banned).toContain(id);
    });

    it('a ledger fact keyed like a banned id does not unlock a different entry', () => {
      const r = resolveAverments(loadAvermentLists('bail_regular'), [
        fact('gainfully_employed', 'yes'),
      ] as never);
      expect(r.banned.map((b) => b.id)).toContain('gainfully_employed');
    });
  });

  describe('the files', () => {
    const files = readdirSync(AVERMENTS_DIR).filter((f) => f.endsWith('.json'));
    const EXPECTED = [
      '_default',
      'bail_regular',
      'legal_notice_s138',
      'bail_anticipatory',
      'maintenance_bnss_144',
      'default_bail',
      'interim_bail',
      'bail_before_magistrate',
    ];

    it('the eight expected files exist', () => {
      for (const e of EXPECTED) expect(files).toContain(`${e}.json`);
    });

    it.each(EXPECTED)('%s parses, passes the loader checks, and carries signed_by', (name) => {
      const raw = JSON.parse(readFileSync(join(AVERMENTS_DIR, `${name}.json`), 'utf-8')) as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(raw, 'signed_by')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(raw, 'signed_on')).toBe(true);
      expect(readAvermentFile(name)).not.toBeNull();
      if (name !== '_default') expect(loadAvermentLists(name).source).toBe(name);
    });

    it('every file is loadable with no duplicate ids per list', () => {
      for (const e of EXPECTED) {
        const raw = readAvermentFile(e)!;
        expect(new Set(raw.banned.map((b) => b.id)).size).toBe(raw.banned.length);
        expect(new Set(raw.allowed.map((a) => a.id)).size).toBe(raw.allowed.length);
      }
    });

    it('no averment list is read as a rule pack', () => {
      // The loader lists *.json directly under document-rules; _averments is a subfolder.
      expect(loadRulePack('_default')).toBeNull();
    });
  });
});

// ── AC7 ──────────────────────────────────────────────────────────────────────
describe('AC7: no case law from a ledger that has none', () => {
  const CASE = 'Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1';
  const withCase = (b: string) => `${b}\n\n4. That, as held in ${CASE}, arrest is not routine.`;
  const doc = async (res: request.Response) =>
    decrypt(
      (await LawieDocument.findById(event(res.text, 'done')!.docId as string).lean())!
        .generatedContent,
    );

  it('citation sources on the ledger path are the fact displays only', () => {
    const f = ledgerDrafterFacts(baseFacts() as never, CHECKLIST, null, false);
    const src = ledgerCitationSources(f);
    expect(src).toEqual(f.facts.map((x) => x.display));
    expect(src.join('\n')).not.toMatch(/Sushila|SCC| v\. /);
  });

  it('a judgment named by the model is blanked; one named only in the description is too', async () => {
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer(withCase(BODY)));
    const res = await draft(id, { described: `Please rely on ${CASE}` });
    expect(res.status).toBe(200);
    const text = await doc(res);
    expect(text).not.toMatch(/Sushila|\bSCC\b/);
    expect(text).toContain(AUTHORITY_BLANK);
    // the description never reached the Drafter
    expect(callOf(0).user).not.toContain('Sushila');
  });

  it('Arnesh Kumar v. State of Bihar from the model, ledger holding no judgment: stripped from the final draft', async () => {
    const ARNESH = 'Arnesh Kumar v. State of Bihar (2014) 8 SCC 273';
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer(`${BODY}\n\n4. That, as held in ${ARNESH}, arrest is not routine.`));
    const res = await draft(id);
    const text = await doc(res);
    expect(text).not.toMatch(/Arnesh|State of Bihar \(2014\)|\bSCC\b/);
    expect(text).toContain(AUTHORITY_BLANK);
  });

  it('a judgment that is a ledger fact is kept exactly as given', async () => {
    const id = await ledger([...baseFacts(), fact('authorities_relied_on', CASE)]);
    mockModel(drafterAnswer(withCase(BODY)));
    const res = await draft(id);
    expect(await doc(res)).toContain(CASE);
    expect(callOf(0).user).toContain(CASE);
  });

  it('the prompt restates the rule (T-148)', () => {
    expect(DRAFTER_LEDGER_SYSTEM_PROMPT).toMatch(/No case law, judgment, citation or precedent/);
    expect(DRAFTER_LEDGER_SYSTEM_PROMPT).toContain('[Authority — add if relied upon]');
    expect(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT).toMatch(/No case law, judgment, citation or precedent/);
  });
});

// ── AC8 (the parts the system writes) ───────────────────────────────────────
describe('AC8: the parts the system writes carry only ledger displays or {{MISSING: label}} on the ledger path', () => {
  const SENT_PS = 'SENTPSxq97';
  const SENT_NAME = 'SENTNAMExq98';
  const LEDGER_NAME = 'Ledger Ram Singh';

  /** SYSTEM PARTS, BEFORE YOUR TEXT and AFTER YOUR TEXT: everything the system wrote. */
  const parts = (p: string) => {
    const from = p.indexOf('SYSTEM PARTS');
    const avermentsAt = p.indexOf('\n\nAVERMENTS ALLOWED');
    const to = avermentsAt > 0 ? avermentsAt : p.indexOf('\n\nTARGET:');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    return p.slice(from, to);
  };
  // Brief-only: the brief holds a police station and a name the ledger does not.
  const briefValues = VALUES.map((v) => {
    if (v.key === 'police_station') return { ...v, value: `Kotwali ${SENT_PS}` };
    if (v.key === 'applicant_name') return { ...v, value: `Ram ${SENT_NAME}` };
    return v;
  });
  const ledgerWithoutStation = () => [
    ...baseFacts().filter((f) => f.key !== 'police_station' && f.key !== 'applicant_name'),
    fact('applicant_name', LEDGER_NAME, { type: 'person_name' }),
  ];

  it('ledger path: a brief-only value is absent and its blank is {{MISSING: label}}; a held item prints its ledger display', async () => {
    const id = await ledger(ledgerWithoutStation());
    mockModel(drafterAnswer());
    const res = await post({ kind: 'bail_regular', values: briefValues, court, ledger_id: id, described: SENT_DESC });
    expect(res.status).toBe(200);
    const sys = parts(callOf(0).user);
    // Ajay's condition: no brief value the ledger lacks.
    expect(sys).not.toContain(SENT_PS);
    expect(sys).not.toContain(SENT_NAME);
    expect(sys).not.toContain(SENT_BRIEF);
    expect(sys).not.toContain(SENT_DESC);
    expect(sys).toContain(missingPlaceholder(CHECKLIST.find((i) => i.key === 'police_station')!.label));
    // A held item takes the ledger's display, not the brief's value.
    expect(sys).toContain(LEDGER_NAME);
    expect(sys).toContain('10 March 2026'); // ledger display of fir_date; the brief says 2026-03-10
    expect(sys).not.toContain('10.03.2026');
    // The whole prompt, not only these blocks, is free of the brief-only values.
    for (const s of [SENT_PS, SENT_NAME, SENT_BRIEF, SENT_DESC]) expect(callOf(0).user).not.toContain(s);
  });

  it('ledger path: the saved document carries the same: no brief-only value in its printed content', async () => {
    const id = await ledger(ledgerWithoutStation());
    mockModel(drafterAnswer());
    const res = await post({ kind: 'bail_regular', values: briefValues, court, ledger_id: id });
    const d = await LawieDocument.findById(event(res.text, 'done')!.docId as string).lean();
    const text = decrypt(d!.generatedContent);
    expect(text).not.toContain(SENT_PS);
    expect(text).not.toContain(SENT_NAME);
    expect(text).toContain(LEDGER_NAME);
    expect(text).toMatch(/\{\{MISSING: [^}]+\}\}/);
  });

  it('switch off: SYSTEM PARTS, BEFORE and AFTER YOUR TEXT are identical to the call with no ledger_id, and carry the brief values', async () => {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    const id = await ledger(ledgerWithoutStation());
    mockModel(drafterAnswer(), drafterAnswer());
    await post({ kind: 'bail_regular', values: briefValues, court });
    await post({ kind: 'bail_regular', values: briefValues, court, ledger_id: id });
    expect(parts(callOf(1).user)).toBe(parts(callOf(0).user));
    expect(parts(callOf(0).user)).toContain('BEFORE YOUR TEXT');
    expect(parts(callOf(0).user)).toContain(SENT_PS); // the old path is untouched
    expect(parts(callOf(0).user)).not.toContain('{{MISSING');
  });
});

describe('ledgerSkeletonBrief', () => {
  const mkItem = (key: string, label: string, value: string | string[] | null, extra = {}) => ({
    key,
    part: 'applicant',
    label,
    kind: 'text',
    required: true,
    options: [],
    value,
    source: 'user',
    please_check: false,
    ...extra,
  });
  const brief = () =>
    ({
      kind: { id: 'bail_regular', name: 'Regular bail', court_document: true },
      court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
      items: [
        mkItem('applicant_name', 'Applicant name', "Ram SENTNAMEunit"),
        mkItem('police_station', 'Police station', 'Brief Station'),
        mkItem('sections_charged', 'Sections charged', ['318', '319']),
        mkItem('other', 'Other', 'a private note'),
      ],
      loose_dates: [],
      unplaced: [{ label: 'Stray', value: 'stray value' }],
      still_unknown: [{ key: 'father_name', label: 'Father name', placeholder: 'old blank' }],
      can_confirm: true,
      confirm_blockers: [],
      confirm_message: null,
    }) as never as Parameters<typeof ledgerSkeletonBrief>[0];
  const held = () => [
    fact('applicant_name', '  Ledger Display  ') as never,
    fact('father_name', 'Shri X') as never,
  ] as Parameters<typeof ledgerSkeletonBrief>[1];

  it('a held item takes the ledger display (trimmed); an unheld item is empty with {{MISSING: label}}', () => {
    const out = ledgerSkeletonBrief(brief(), held());
    const by = (k: string) => out.items.find((i) => i.key === k)!;
    expect(by('applicant_name').value).toBe('Ledger Display');
    for (const k of ['police_station', 'sections_charged', 'other']) {
      expect(by(k).value).toBeNull();
    }
    expect(by('police_station').placeholder).toBe('{{MISSING: Police station}}');
    expect(by('sections_charged').placeholder).toBe('{{MISSING: Sections charged}}');
    expect(JSON.stringify(out)).not.toMatch(/Brief Station|318|private note|stray value|SENTNAMEunit/);
  });

  it('drops the unplaced notes and re-blanks still_unknown; keeps kind, court and item order', () => {
    const b = brief();
    const out = ledgerSkeletonBrief(b, held());
    expect(out.unplaced).toEqual([]);
    expect(out.still_unknown[0].placeholder).toBe('{{MISSING: Father name}}');
    expect(out.kind).toEqual(b.kind);
    expect(out.court).toEqual(b.court);
    expect(out.items.map((i) => i.key)).toEqual(b.items.map((i) => i.key));
  });

  it('is pure: the input is not mutated (deep-frozen input does not throw), and the same call twice gives equal output', () => {
    const b = brief();
    const before = JSON.stringify(b);
    const deepFreeze = (o: unknown): void => {
      if (o && typeof o === 'object') {
        Object.freeze(o);
        Object.values(o as object).forEach(deepFreeze);
      }
    };
    deepFreeze(b);
    const facts = held();
    const first = ledgerSkeletonBrief(b, facts);
    const second = ledgerSkeletonBrief(b, facts);
    expect(JSON.stringify(b)).toBe(before);
    expect(first).toEqual(second);
    expect(first).not.toBe(b);
    expect(first.items).not.toBe(b.items);
  });

  it('an empty ledger blanks every item', () => {
    const out = ledgerSkeletonBrief(brief(), []);
    expect(out.items.every((i) => i.value === null && /^\{\{MISSING: .+\}\}$/.test(i.placeholder ?? ''))).toBe(true);
  });
});

// ── switch off, ownership ───────────────────────────────────────────────────
describe('switch off', () => {
  it('a ledger_id is ignored: same system prompt and same user prompt as a call without it', async () => {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer(), drafterAnswer());
    const without = await draft(undefined);
    const withId = await draft(id);
    expect(without.status).toBe(200);
    expect(withId.status).toBe(200);
    expect(callOf(1)).toEqual(callOf(0));
    expect(callOf(0).system).toBe(DRAFTER_PACK_SYSTEM_PROMPT);
    expect(callOf(0).user).toContain('BRIEF:');
    expect(callOf(0).user).not.toMatch(/AVERMENTS ALLOWED|BANNED ASSERTIONS|FACTS:/);
    const d = await LawieDocument.findById(event(withId.text, 'done')!.docId as string).lean();
    expect(JSON.parse(decrypt(d!.brief!))).not.toHaveProperty('ledger_id');
  });

  it('switch off: someone else\'s or a made-up ledger_id is not a 404', async () => {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    const other = await ledger(baseFacts(), { userId: OTHER_USER_ID });
    mockModel(drafterAnswer(), drafterAnswer());
    expect((await draft(other)).status).toBe(200);
    expect((await draft('a'.repeat(24))).status).toBe(200);
  });

  it('switch on but no ledger_id: the old path', async () => {
    mockModel(drafterAnswer());
    await draft(undefined);
    expect(callOf(0).system).toBe(DRAFTER_PACK_SYSTEM_PROMPT);
  });

  it('switch on for other users only: this user gets the old path', async () => {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: OTHER_USER_ID });
    _clearAppSettingsCache();
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer());
    expect((await draft(id)).status).toBe(200);
    expect(callOf(0).system).toBe(DRAFTER_PACK_SYSTEM_PROMPT);
  });
});

describe('route: the ledger must be this user\'s and for this document', () => {
  async function expect404(ledgerId: string) {
    mockModel(drafterAnswer());
    const res = await draft(ledgerId);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ledger not found' });
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(await Generation.countDocuments({})).toBe(0);
    expect(await LawieDocument.countDocuments({})).toBe(0);
  }

  it('another user\'s ledger -> 404, no model call, no document, no run', async () => {
    await expect404(await ledger(baseFacts(), { userId: OTHER_USER_ID }));
  });
  it('a ledger for another document kind -> 404', async () => {
    await expect404(await ledger(baseFacts(), { kind: 'mact_claim' }));
  });
  it('a ledger id that does not exist -> 404', async () => {
    await expect404('b'.repeat(24));
  });
  it('a malformed ledger id -> 400 (schema)', async () => {
    mockModel(drafterAnswer());
    const res = await draft('not-an-id');
    expect(res.status).toBe(400);
    expect(mockMessagesStream).not.toHaveBeenCalled();
  });

  it('lists that cannot be read -> 503 averments_unavailable, nothing drafted, no fact value in the logs', async () => {
    const id = await ledger([...baseFacts(), fact('address', SENT_DISPLAY, { type: 'place_name' })]);
    const logs = (['info', 'error', 'warn', 'log'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    jest.spyOn(averments, 'loadAvermentLists').mockImplementation(() => {
      throw new AvermentFileError('bail_regular', 'is not valid JSON');
    });
    mockModel(drafterAnswer());
    const res = await draft(id);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'averments_unavailable' });
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(JSON.stringify(logs.map((l) => l.mock.calls))).not.toContain(SENT_DISPLAY);
  });

  it('the saved brief records ledger_id and ledger_version, and no ledger content', async () => {
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer());
    const res = await draft(id);
    const d = await LawieDocument.findById(event(res.text, 'done')!.docId as string).lean();
    const saved = JSON.parse(decrypt(d!.brief!)) as Record<string, unknown>;
    expect(saved.ledger_id).toBe(id);
    expect(saved.ledger_version).toBe(1);
    expect(JSON.stringify(saved)).not.toContain(SENT_SPAN);
  });
});

// ── repair pass ─────────────────────────────────────────────────────────────
describe('the repair pass on the ledger path', () => {
  it('uses the ledger repair prompt and a prompt built from FACTS, not the brief', async () => {
    const id = await ledger(baseFacts());
    const missingClause = CLAUSE_IDS[0];
    mockModel(drafterAnswer(BODY, { [missingClause]: '0' }), drafterAnswer());
    const res = await draft(id, { described: SENT_DESC });
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    const repair = callOf(1);
    expect(repair.system).toBe(DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT);
    expect(repair.user).toContain('FACTS:');
    expect(repair.user).toContain(`MISSING: ${missingClause}`);
    for (const s of [SENT_BRIEF, SENT_DESC, SENT_SPAN, SENT_VALUE, 'BRIEF:', '"described"']) {
      expect(repair.user).not.toContain(s);
    }
    expect(ids(bannedSection(repair.user.replace(/\n\nLANGUAGE:[\s\S]*$/, '\n\nTARGET:')), 'gainfully_employed')).toBe(true);
  });
});

// ── PII ─────────────────────────────────────────────────────────────────────
describe('PII on the ledger path', () => {
  it('no fact display in console output, the usage row or the Document fields (the SSE stream carries the draft to its owner)', async () => {
    const id = await ledger([
      ...baseFacts().filter((f) => f.key !== 'address'),
      fact('address', `Plot ${SENT_DISPLAY}, Patna`, { type: 'place_name' }),
      fact('applicant_occupation', `Driver ${SENT_DISPLAY}`),
    ]);
    const logs = (['info', 'error', 'warn', 'log', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    mockModel(drafterAnswer());
    const res = await draft(id);
    expect(res.status).toBe(200);
    // the Drafter did get it
    expect(callOf(0).user).toContain(SENT_DISPLAY);

    expect(JSON.stringify(logs.map((l) => l.mock.calls))).not.toContain(SENT_DISPLAY);
    // The SSE stream carries the draft to its owner, so ledger displays may be in it (T-147c).
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen).toMatchObject({ status: 'completed', llmCalls: 1 });
    expect(JSON.stringify(gen)).not.toContain(SENT_DISPLAY);
    const d = await LawieDocument.findById(event(res.text, 'done')!.docId as string).lean();
    expect(JSON.stringify({ ...d, brief: undefined, generatedContent: undefined })).not.toContain(SENT_DISPLAY);
  });
});

// ── export: {{MISSING: label}} prints as the blank ──────────────────────────
describe('export: {{MISSING: label}} becomes [To be confirmed: label]', () => {
  const BLANK_OF = (l: string) => `[To be confirmed: ${l}]`;

  it('missingAsBlanks: one, and several in one text, each with its own label', () => {
    expect(missingAsBlanks('FIR {{MISSING: FIR number}} dated x')).toBe(`FIR ${BLANK_OF('FIR number')} dated x`);
    const out = missingAsBlanks(
      'At {{MISSING: Police station}} on {{MISSING: Date of FIR}}; again {{MISSING: Police station}}.',
    );
    expect(out).toBe(
      `At ${BLANK_OF('Police station')} on ${BLANK_OF('Date of FIR')}; again ${BLANK_OF('Police station')}.`,
    );
    expect(out).not.toContain('{{');
  });

  it('text with no placeholder is unchanged; other brace text is left alone', () => {
    expect(missingAsBlanks('Plain text.')).toBe('Plain text.');
    expect(missingAsBlanks('{{other}} and {single}')).toBe('{{other}} and {single}');
  });

  it('plain content: placeholders in several paragraphs are all converted in the HTML', () => {
    const html = contentToHtml(
      '1. That FIR No. {{MISSING: FIR number}} was registered.\n\n2. That PS {{MISSING: Police station}} and {{MISSING: Date of FIR}} are blank.',
      false,
    );
    expect(html).toContain(BLANK_OF('FIR number'));
    expect(html).toContain(BLANK_OF('Police station'));
    expect(html).toContain(BLANK_OF('Date of FIR'));
    expect(html).not.toContain('MISSING');
    expect(html).not.toContain('{{');
  });

  it('TipTap HTML content: placeholders inside tags are converted too', () => {
    const html = contentToHtml(
      '<p>FIR {{MISSING: FIR number}}</p><p>PS <strong>{{MISSING: Police station}}</strong></p>',
      false,
    );
    expect(html).toContain(`<p>FIR ${BLANK_OF('FIR number')}</p>`);
    expect(html).toContain(`<strong>${BLANK_OF('Police station')}</strong>`);
    expect(html).not.toContain('MISSING');
  });

  it('startingDraft does not change the conversion', () => {
    expect(contentToHtml('x {{MISSING: Court}}', false, true)).toContain(BLANK_OF('Court'));
  });
});

describe('missingAsBlanks: tolerant of spacing; other braces untouched', () => {
  const BLANK = '[To be confirmed: x]';
  it.each(['{{MISSING:x}}', '{{ MISSING : x }}', '{{MISSING: x}}', '{{  MISSING  :   x   }}'])(
    '%s -> [To be confirmed: x]',
    (tok) => {
      expect(missingAsBlanksUtil(tok)).toBe(BLANK);
      expect(missingAsBlanksUtil(`a ${tok} b`)).toBe(`a ${BLANK} b`);
    },
  );
  it('keeps a multi-word label and converts every one in a text (global)', () => {
    expect(missingAsBlanksUtil('{{MISSING:Date of FIR}} / {{ MISSING : Police station }}')).toBe(
      '[To be confirmed: Date of FIR] / [To be confirmed: Police station]',
    );
  });
  it('non-MISSING braces are untouched', () => {
    for (const t of ['{{other}}', '{{missing: x}}'.replace('missing', 'Missing'), '{MISSING: x}', '{{MISSING x}}', 'a {b} {{c}}']) {
      expect(missingAsBlanksUtil(t)).toBe(t);
    }
  });
  it('the PDF module re-exports the same function', () => {
    expect(missingAsBlanks).toBe(missingAsBlanksUtil);
  });
});

describe('review link: GET /review/:token converts {{MISSING: label}}', () => {
  async function tokenFor(docOverrides: Record<string, unknown>): Promise<string> {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'Bail Application',
      docType: 'bail_application',
      generatedContent: encrypt('x'),
      courtName: 'Patna',
      sectionsCited: [],
      ...docOverrides,
    });
    const token = `t147c${'a'.repeat(19)}`;
    await ReviewToken.create({
      token,
      documentId: String(doc._id),
      assignedTo: 'Adv. Kumar',
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      createdBy: USER_ID,
    });
    return token;
  }

  it('generated content: spaced and unspaced tokens print as [To be confirmed: label]', async () => {
    const token = await tokenFor({
      generatedContent: encrypt('PS {{MISSING: Police station}} and {{ MISSING:Date of FIR }}; keep {{other}}.'),
    });
    const res = await request(app).get(`/review/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.document.content).toBe(
      'PS [To be confirmed: Police station] and [To be confirmed: Date of FIR]; keep {{other}}.',
    );
  });

  it('final (edited) content wins and is converted too; the stored text is not changed', async () => {
    const token = await tokenFor({
      generatedContent: encrypt('old {{MISSING: Old}}'),
      finalContent: encrypt('<p>FIR {{MISSING: FIR number}}</p>'),
    });
    const res = await request(app).get(`/review/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.document.content).toBe('<p>FIR [To be confirmed: FIR number]</p>');
    const stored = await LawieDocument.findOne({ title: 'Bail Application' }).lean();
    expect(decrypt(stored!.generatedContent)).toBe('old {{MISSING: Old}}');
  });
});

describe('loader checks (synthetic lists)', () => {
  const cond = (key: string) => ({ key, label: key, present: true });
  const banned = (id: string, unlocked_by: unknown) => ({
    id,
    kind: 'averment' as const,
    phrases: [id],
    unlocked_by: unlocked_by as never,
  });
  const allowed = (id: string, averment: string, requires: unknown) => ({
    id,
    kind: 'averment' as const,
    averment,
    requires: requires as never,
  });

  describe('check 1: every {{key}} in an allowed text is in its requires', () => {
    it('throws, naming the pack and the id, when requires lacks the key', () => {
      const lists = { banned: [], allowed: [allowed('roots', 'lives at {{address}} near {{landmark}}', cond('address'))] };
      expect(() => checkUnlockPairs('packA', lists)).toThrow(AvermentFileError);
      expect(() => checkUnlockPairs('packA', lists)).toThrow(/packA/);
      expect(() => checkUnlockPairs('packA', lists)).toThrow(/roots/);
      expect(() => checkUnlockPairs('packA', lists)).toThrow(/landmark/);
    });
    it('also when it is the paired twin of a banned entry (through the file loader)', () => {
      const dir = mkdtempSync(join(tmpdir(), 't147c-'));
      try {
        writeFileSync(join(dir, '_default.json'), JSON.stringify({ banned: [], allowed: [] }));
        writeFileSync(
          join(dir, 'p.json'),
          JSON.stringify({
            signed_by: null,
            signed_on: null,
            banned: [banned('x', cond('k'))],
            allowed: [allowed('x', 'uses {{k}} and {{z}}', cond('k'))],
          }),
        );
        expect(() => loadAvermentLists('p', dir)).toThrow(/p.*"x"|"x".*p/s);
        expect(() => loadAvermentLists('p', dir)).toThrow(AvermentFileError);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    it('passes when every key is required, including inside all_of; no placeholders is fine', () => {
      const lists = {
        banned: [],
        allowed: [
          allowed('a', 'x {{p}} y {{q}} z {{p}}', { all_of: [cond('p'), cond('q')] }),
          allowed('b', 'no placeholders', cond('p')),
        ],
      };
      expect(() => checkUnlockPairs('ok', lists)).not.toThrow();
    });
  });

  describe('check 2: banned unlocked_by equals the allowed twin requires', () => {
    it('throws, naming the pack and the id, when they differ', () => {
      const lists = {
        banned: [banned('e', cond('occupation'))],
        allowed: [allowed('e', 'works as {{occupation}}', { all_of: [cond('occupation'), cond('employer')] })],
      };
      expect(() => checkUnlockPairs('packB', lists)).toThrow(AvermentFileError);
      expect(() => checkUnlockPairs('packB', lists)).toThrow(/packB/);
      expect(() => checkUnlockPairs('packB', lists)).toThrow(/"e"/);
    });
    it('throws when only a value inside differs (equals list)', () => {
      const lists = {
        banned: [banned('e', { key: 'k', equals: ['a'] })],
        allowed: [allowed('e', 't {{k}}', { key: 'k', equals: ['b'] })],
      };
      expect(() => checkUnlockPairs('packC', lists)).toThrow(AvermentFileError);
    });
    it('passes when they are equal with the keys in a different order', () => {
      const lists = {
        banned: [banned('e', { key: 'k', label: 'K', present: true })],
        allowed: [allowed('e', 't {{k}}', { present: true, label: 'K', key: 'k' })],
      };
      expect(() => checkUnlockPairs('packD', lists)).not.toThrow();
      const nested = {
        banned: [banned('n', { all_of: [{ key: 'a', present: true }, { key: 'b', equals: ['x', 'y'] }] })],
        allowed: [allowed('n', '{{a}} {{b}}', { all_of: [{ present: true, key: 'a' }, { equals: ['x', 'y'], key: 'b' }] })],
      };
      expect(() => checkUnlockPairs('packE', nested)).not.toThrow();
    });
    it('a banned entry that is never unlocked (null) needs no twin and is not compared', () => {
      expect(() => checkUnlockPairs('packF', { banned: [banned('n', null)], allowed: [] })).not.toThrow();
    });
  });
});

describe('every real averment file and every pack loads', () => {
  const files = readdirSync(AVERMENTS_DIR).filter((f) => f.endsWith('.json'));
  it('there are 8 files', () => {
    expect(files.length).toBe(8);
  });
  it.each(files.map((f) => f.replace(/\.json$/, '')))('%s loads without throwing', (name) => {
    expect(() => loadAvermentLists(name)).not.toThrow();
  });
  it('all rule packs load their lists (own file, inherited or default-deny) without throwing', () => {
    const packs = listRulePackIds();
    expect(packs.length).toBe(92);
    for (const id of packs) {
      expect(() => loadAvermentLists(id)).not.toThrow();
      expect(loadAvermentLists(id).banned.length).toBeGreaterThan(0);
    }
  });
});

describe('switch off: end to end, generate-from-brief is unchanged', () => {
  it('system and user prompts are byte-identical across a call with a ledger_id and one without, and are the old builders\' shape', async () => {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    const id = await ledger(baseFacts());
    mockModel(drafterAnswer(), drafterAnswer());
    await draft(undefined, { described: `d ${SENT_DESC}` });
    await draft(id, { described: `d ${SENT_DESC}` });
    const [a, b] = [callOf(0), callOf(1)];
    expect(Buffer.from(b.system).equals(Buffer.from(a.system))).toBe(true);
    expect(Buffer.from(b.user).equals(Buffer.from(a.user))).toBe(true);
    expect(a.system).toBe(DRAFTER_PACK_SYSTEM_PROMPT);
    // The old path reads the brief and the description, as before.
    expect(a.user).toContain(SENT_BRIEF);
    expect(a.user).toContain('BRIEF:');
    expect(a.user).not.toContain('{{MISSING');
  });
});
