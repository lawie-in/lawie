/**
 * T-245a part 2: the law switch wired into the drafting engine.
 *
 * Expected strings are literals copied from handoff/legal/T-245-old-new-law-switch-signed.md
 * (Ajay 345bd24, Addenda 1-4: 2992891, d5a3005, 8e3167e, b99a51e), never built from the code
 * under test. The default_bail related-acts cases are in t251-default-bail.test.ts.
 */
import './setupDb';

import { readFileSync } from 'fs';
import { join } from 'path';

import { countBlanks, findBlanks } from '@lawie/shared';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { FactDiff } from '../models/FactDiff.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { createLedger } from '../services/fact-ledger.service';
import {
  LAW_SWITCH_FACT_KEYS,
  LAW_SWITCH_INPUT_KEYS,
  LAW_SWITCH_PACKS,
  P_TEXT,
  S_TEXT,
  lawSwitchInputFromCase,
  offenceBailableFromClassification,
} from '../services/law-switch';
import {
  buildAISystemPrompt,
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  renderTemplateSection,
  type CourtLookupData,
} from '../services/template-engine.service';
import { loadSkeleton } from '../services/rule-pack.service';
import { decrypt } from '../utils/encryption';
import type { DraftParagraphsOutput } from '../services/draft-renderer';
import type { Skeleton } from '../types/skeleton';
import { choice, fact, magistrateBase, PackId, regularBase } from './fixtures/t373';
import { sdkParseResponse } from './sdkStream';

const mockStream = jest.fn();
const mockParse = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub(
    (...args: unknown[]) => mockStream(...args),
    (...args: unknown[]) => mockParse(...args),
  ),
);

const SIGNED = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'handoff', 'legal', 'T-245-old-new-law-switch-signed.md'),
  'utf8',
);
const BNSS_CHOICE = 'BNSS and BSA';
const CRPC_CHOICE = 'CrPC and Evidence Act';
const NON_BAILABLE = "Non-bailable (within Magistrate's powers)";

// ── The switch's input from a case ──────────────────────────────────────────

describe('S_TEXT and P_TEXT are the signed text, byte for byte', () => {
  it('both appear verbatim in the signed file, in backticks', () => {
    expect(SIGNED).toContain('`' + S_TEXT + '`');
    expect(SIGNED).toContain('`' + P_TEXT + '`');
  });
});

describe('offenceBailableFromClassification', () => {
  it.each([
    ['Bailable', true],
    ['bailable', true],
    [NON_BAILABLE, false],
    ['non_bailable_within_magistrate_s_powers', false],
    ['', null],
    ['   ', null],
    ['Not sure', null],
    ['Non-bailable', null],
    [undefined, null],
    [null, null],
    [true, null],
    [42, null],
  ])('%j -> %j', (v, expected) => {
    expect(offenceBailableFromClassification(v)).toBe(expected);
  });
});

describe('lawSwitchInputFromCase', () => {
  const values = {
    procedure_code: CRPC_CHOICE,
    fir_date: '2023-05-01',
    offence_date: '2023-04-30',
    offence_classification: 'Bailable',
    unrelated: 'x',
  };

  it('reads procedure_code, fir_date and offence_date; the court from the courts-db type only', () => {
    expect(lawSwitchInputFromCase('bail_regular', values, 'sessions')).toEqual({
      templateId: 'bail_regular',
      procedureCode: CRPC_CHOICE,
      firDate: '2023-05-01',
      offenceDate: '2023-04-30',
      court: 'sessions_or_hc',
      offenceBailable: null,
    });
  });

  it('reads offence_classification for bail_before_magistrate only', () => {
    expect(lawSwitchInputFromCase('bail_before_magistrate', values, 'cjm')).toMatchObject({
      court: 'magistrate',
      offenceBailable: true,
    });
    expect(
      lawSwitchInputFromCase(
        'bail_before_magistrate',
        { ...values, offence_classification: NON_BAILABLE },
        'jmfc',
      ).offenceBailable,
    ).toBe(false);
    expect(
      lawSwitchInputFromCase(
        'bail_before_magistrate',
        { ...values, offence_classification: '' },
        'jmfc',
      ).offenceBailable,
    ).toBeNull();
  });

  it.each(['district_court', 'Sessions Court, Patna', '', undefined, null, 7])(
    'court type %j is unknown (the court is never guessed)',
    (ct) => {
      expect(lawSwitchInputFromCase('bail_regular', values, ct).court).toBeNull();
    },
  );

  it('the key lists are exactly the signed keys', () => {
    expect([...LAW_SWITCH_INPUT_KEYS]).toEqual([
      'procedure_code',
      'fir_date',
      'offence_date',
      'offence_classification',
    ]);
    expect([...LAW_SWITCH_FACT_KEYS]).toEqual([
      'governing_provision',
      'women_proviso',
      'notice_provision',
    ]);
  });
});

// ── buildPlaceholderContext: exact values ───────────────────────────────────

beforeEach(() => clearConfigCache());

function courtOf(courtType: string): CourtLookupData {
  return {
    designation: 'IN THE COURT OF TEST',
    city: 'Patna',
    caseNomenclature: 'Courts-list line No. 99',
    formattingRulesRef: 'bihar_district',
    courtType,
  };
}

describe('buildPlaceholderContext: bail_regular', () => {
  const ctx = (form: Record<string, unknown>) =>
    buildPlaceholderContext(
      loadTemplateConfig('bail_regular')!,
      { applicant_name: 'Ramesh Kumar', ...form },
      { advocateName: 'A' },
      courtOf('sessions'),
    );

  it('BNSS chosen (Court of Session): 483, 35(3), the BNSS do-not-cite', () => {
    const c = ctx({ procedure_code: BNSS_CHOICE });
    expect(c.governing_provision).toBe(
      'Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023',
    );
    expect(c.GOVERNING_PROVISION).toBe(
      'SECTION 483 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023',
    );
    expect(c.notice_provision).toBe('Section 35(3) of the BNSS');
    expect(c.do_not_cite).toBe('Do not cite Section 481 or Section 482');
    expect(c.women_proviso).toBeUndefined();
  });

  it('CrPC chosen, FIR 2023: 439, 41A, the CrPC do-not-cite (Addendum 3 #4)', () => {
    const c = ctx({ procedure_code: CRPC_CHOICE, fir_date: '2023-05-01' });
    expect(c.governing_provision).toBe('Section 439 of the Code of Criminal Procedure, 1973');
    expect(c.GOVERNING_PROVISION).toBe('SECTION 439 OF THE CODE OF CRIMINAL PROCEDURE, 1973');
    expect(c.notice_provision).toBe('Section 41A of the CrPC');
    expect(c.do_not_cite).toBe('Do not cite Section 437A or Section 438 of the CrPC');
  });

  it('CrPC chosen but FIR on or after 1 Jul 2024: forced to BNSS (Addendum 1 #8)', () => {
    const c = ctx({ procedure_code: CRPC_CHOICE, fir_date: '2024-07-01' });
    expect(c.governing_provision).toBe(
      'Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023',
    );
    expect(c.notice_provision).toBe('Section 35(3) of the BNSS');
  });

  it('no choice, FIR 2023: the both-forms blanks, upper-cased as a whole in the heading', () => {
    const c = ctx({ fir_date: '2023-05-01' });
    expect(c.governing_provision).toBe(
      '[To be confirmed: Section 439 of the CrPC or Section 483 of the BNSS]',
    );
    expect(c.GOVERNING_PROVISION).toBe(
      '[TO BE CONFIRMED: SECTION 439 OF THE CRPC OR SECTION 483 OF THE BNSS]',
    );
    expect(c.notice_provision).toBe(
      '[To be confirmed: Section 41A of the CrPC or Section 35(3) of the BNSS]',
    );
    expect(c.do_not_cite).toBe(
      'Do not cite Section 437A or 438 of the CrPC, or Section 481 or 482 of the BNSS',
    );
  });

  it('no choice and no FIR date gives the same blanks (a missing date is never assumed)', () => {
    expect(ctx({}).governing_provision).toBe(
      '[To be confirmed: Section 439 of the CrPC or Section 483 of the BNSS]',
    );
  });
});

describe('buildPlaceholderContext: bail_before_magistrate', () => {
  const cfg = () => loadTemplateConfig('bail_before_magistrate');
  const ctx = (form: Record<string, unknown>) =>
    buildPlaceholderContext(
      cfg()!,
      { applicant_name: 'Sunita Devi', offence_classification: NON_BAILABLE, ...form },
      { advocateName: 'A' },
      courtOf('cjm'),
    );

  it('BNSS, non-bailable: 480 and the 480(1) women proviso; no do-not-cite (bail_regular only)', () => {
    const c = ctx({ procedure_code: BNSS_CHOICE });
    expect(c.governing_provision).toBe(
      'Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023',
    );
    expect(c.women_proviso).toBe('the first proviso to Section 480(1) of the BNSS');
    expect(c.notice_provision).toBe('Section 35(3) of the BNSS');
    expect(c.do_not_cite).toBeUndefined();
  });

  it('CrPC, FIR 2023, non-bailable: 437 and the 437(1) proviso', () => {
    const c = ctx({ procedure_code: CRPC_CHOICE, fir_date: '2023-01-01' });
    expect(c.governing_provision).toBe('Section 437 of the Code of Criminal Procedure, 1973');
    expect(c.women_proviso).toBe('the first proviso to Section 437(1) of the CrPC');
    expect(c.notice_provision).toBe('Section 41A of the CrPC');
  });

  it('no choice: the both-forms blanks and the blank proviso (Addendum 1 #2)', () => {
    const c = ctx({});
    expect(c.governing_provision).toBe(
      '[To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS]',
    );
    expect(c.women_proviso).toBe(
      'the first proviso to [To be confirmed: Section 437(1) of the CrPC or Section 480(1) of the BNSS]',
    );
  });

  it('bailable, CrPC: 436 (Addendum 2 #4)', () => {
    const c = ctx({
      procedure_code: CRPC_CHOICE,
      fir_date: '2023-01-01',
      offence_classification: 'Bailable',
    });
    expect(c.governing_provision).toBe('Section 436 of the Code of Criminal Procedure, 1973');
  });

  it('bailable, BNSS: 478; classification unknown, BNSS: the 478-or-480 blank (Addendum 3 #5)', () => {
    expect(
      ctx({ procedure_code: BNSS_CHOICE, offence_classification: 'Bailable' }).governing_provision,
    ).toBe('Section 478 of the Bharatiya Nagarik Suraksha Sanhita, 2023');
    expect(
      ctx({ procedure_code: BNSS_CHOICE, offence_classification: '' }).governing_provision,
    ).toBe('[To be confirmed: Section 478 or Section 480 of the BNSS]');
  });
});

// ── System prompt rule 1 ────────────────────────────────────────────────────

describe('buildAISystemPrompt rule 1', () => {
  const OLD_RULE = 'NEVER reference old IPC, CrPC, or IEA section numbers.';

  it.each([...LAW_SWITCH_PACKS])('%s: rule 1 is the signed S-text and P-text', (id) => {
    const cfg = loadTemplateConfig(id);
    expect(cfg).not.toBeNull();
    const prompt = buildAISystemPrompt(cfg!);
    expect(prompt).toContain(S_TEXT);
    expect(prompt).toContain(P_TEXT);
    expect(prompt).not.toContain(OLD_RULE);
  });

  it('another template (rent_agreement) keeps the old rule and has neither text', () => {
    const prompt = buildAISystemPrompt(loadTemplateConfig('rent_agreement')!);
    expect(prompt).toContain(OLD_RULE);
    expect(prompt).not.toContain(S_TEXT);
    expect(prompt).not.toContain(P_TEXT);
  });
});

// ── No auto-convert, twin heading, blank detection ──────────────────────────

describe('the twins: no auto-convert for the bail packs (Addendum 1 #3)', () => {
  it.each(['bail_regular', 'bail_anticipatory'])(
    '%s: validation_rules.auto_convert_old_to_new is off',
    (id) => {
      // The brief and form paths skip the conversion for the six packs; the twins also say so.
      expect(loadTemplateConfig(id)!.validation_rules.auto_convert_old_to_new).toBeFalsy();
    },
  );
});

describe('the upper-cased blank in a twin heading is flagged like the lower-case one (Addendum 4 #2)', () => {
  const lower = '[To be confirmed: Section 439 of the CrPC or Section 483 of the BNSS]';
  const upper = '[TO BE CONFIRMED: SECTION 439 OF THE CRPC OR SECTION 483 OF THE BNSS]';

  it('findBlanks and countBlanks see one blank in each form, with the same span', () => {
    const a = findBlanks(`APPLICATION FOR REGULAR BAIL UNDER ${upper}`);
    const b = findBlanks(`Application for regular bail under ${lower}`);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].text).toBe(upper);
    expect(a[0].end - a[0].start).toBe(b[0].end - b[0].start);
    expect(countBlanks(`UNDER ${upper}`)).toBe(1);
  });

  it('the rendered twin heading (no choice) carries the upper-cased blank and it is flagged', () => {
    const cfg = loadTemplateConfig('bail_regular')!;
    const c = buildPlaceholderContext(
      cfg,
      { applicant_name: 'X' },
      { advocateName: 'A' },
      courtOf('sessions'),
    );
    const text = cfg.document_structure.sections
      .filter((s) => s.type === 'template')
      .map((s) => renderTemplateSection(s, c).content)
      .join('\n');
    expect(text).toContain('APPLICATION FOR REGULAR BAIL UNDER [TO BE CONFIRMED: ');
    const heading = findBlanks(text).filter((b) => b.text.startsWith('[TO BE CONFIRMED'));
    expect(heading).toHaveLength(1);
  });

  it('the marker regexes in the checks match the upper-case form (case-insensitive)', () => {
    // ai.service PLACEHOLDER_BLANK and fact-verifier MARKER_BLANK_RE are /…/gi.
    const read = (f: string) => readFileSync(join(__dirname, '..', 'services', f), 'utf8');
    expect(read('ai.service.ts')).toContain(
      'const PLACEHOLDER_BLANK = /\\[To be confirmed:[^\\]]*\\]|\\{\\{\\s*MISSING\\s*:[^}]*\\}\\}/gi;',
    );
    expect(read('fact-verifier.ts')).toContain(
      'const MARKER_BLANK_RE = /\\{\\{\\s*MISSING\\s*:[^}]*\\}\\}|\\[To be confirmed:[^\\]]*\\]/gi;',
    );
    const re = /\[To be confirmed:[^\]]*\]/gi;
    expect('UNDER [TO BE CONFIRMED: SECTION 439 OF THE CRPC]'.match(re)).toHaveLength(1);
  });
});

// ── The brief path (D1 route, real skeletons, SDK stubbed) ──────────────────

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994390d1';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const courtBody = { state: 'bihar', court_type: 'sessions', court: COURT_ID };
type Fact = ReturnType<typeof regularBase>[number];

const headers = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

describe('the brief path: D1 route with the law switch', () => {
  beforeEach(async () => {
    mockStream.mockReset();
    mockParse.mockReset();
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
    await User.create({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
  });

  const goodOutput = (skeleton: Skeleton, facts: Fact[]): DraftParagraphsOutput => {
    const held = new Set(facts.map((f) => f.key));
    return {
      paragraphs: skeleton.clauses.map((c) => {
        const refs = new Set<string>();
        for (const s of c.slots ?? []) refs.add(c.derived?.[s]?.from ?? s);
        for (const v of c.variants ?? []) for (const s of v.slots ?? []) refs.add(s);
        if (c.source === 'advocate' && c.slot) refs.add(c.slot);
        if (c.list && c.from) refs.add(c.from);
        return {
          clauseId: c.id,
          factRefs: [...refs].filter((r) => held.has(r)),
          text:
            c.source === 'advocate' && c.slot
              ? (facts.find((f) => f.key === c.slot)?.display ?? '')
              : '',
          items: [],
        };
      }),
    };
  };

  async function generate(packId: PackId, facts: Fact[]) {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput(loadSkeleton(packId)!, facts)));
    const ledger = await createLedger({
      userId: USER_ID,
      documentKind: packId,
      intakeId: 'i1',
      state: { facts, unresolved: [] },
    });
    const byKey = new Map<string, string[]>();
    for (const f of facts) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f.display]);
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: packId,
        values: [...byKey].map(([key, v]) => ({ key, value: v.length === 1 ? v[0] : v })),
        court: courtBody,
        ledger_id: String(ledger._id),
      });
    const blocks = res.text.split('\n\n').filter((b) => b.startsWith('event: done\n'));
    const done = blocks.length
      ? (JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, any>)
      : {};
    let body = '';
    if (done.docId)
      body = decrypt((await LawieDocument.findById(done.docId))!.generatedContent as string);
    const call = mockParse.mock.calls[0]?.[0] as
      | { messages?: Array<{ content: unknown }> }
      | undefined;
    return { status: res.status, body, prompt: JSON.stringify(call ?? {}) };
  }

  const withoutKeys = (facts: Fact[], ...keys: string[]) =>
    facts.filter((f) => !keys.includes(f.key));
  const oldFir = (extra: Fact[]): Fact[] => [
    ...withoutKeys(regularBase(), 'fir_date'),
    fact('fir_date', '2 June 2023', { type: 'date', value: '2023-06-02' }),
    choice('s35_notice_status', 'Not served', 'not_served'),
    ...extra,
  ];

  it('bail_regular, FIR 2023, CrPC chosen: Section 439 of the CrPC and the 41A notice, no MISSING', async () => {
    const r = await generate(
      'bail_regular',
      oldFir([fact('procedure_code', CRPC_CHOICE, { type: 'enum' })]),
    );
    expect(r.status).toBe(200);
    expect(r.body).toContain(
      'submits this application for regular bail under Section 439 of the Code of Criminal Procedure, 1973.',
    );
    expect(r.body).toContain(
      'No notice under Section 41A of the CrPC was served on the applicant before arrest.',
    );
    // No law-switch slot is a blank. (The fixture has no parent name: that one MISSING is not the law's.)
    expect(r.body).not.toMatch(/MISSING: (governing|Notice|GOVERNING)/);
    expect(r.body).not.toContain('To be confirmed: Section');
    expect(r.body).not.toContain('Bharatiya Nagarik Suraksha Sanhita');
    expect(r.body).not.toMatch(/\{[a-z_]+\}/);
  });

  it('the Drafter is sent the computed law facts, and a stored fact under those keys is dropped', async () => {
    const r = await generate(
      'bail_regular',
      oldFir([
        fact('procedure_code', CRPC_CHOICE, { type: 'enum' }),
        fact('governing_provision', 'Section 999 of a made-up code'),
        fact('notice_provision', 'Section 1 of nothing'),
        fact('women_proviso', 'a stored proviso'),
      ]),
    );
    expect(r.status).toBe(200);
    expect(r.body).not.toContain('Section 999');
    expect(r.body).not.toContain('Section 1 of nothing');
    expect(r.body).toContain('Section 439 of the Code of Criminal Procedure, 1973');
    // bail_regular has no women proviso: the stored one is dropped and none is computed.
    expect(r.body).not.toContain('a stored proviso');
  });

  it('a group-prefixed stored notice_provision is dropped too; the computed value wins', async () => {
    const r = await generate(
      'bail_regular',
      oldFir([
        fact('procedure_code', CRPC_CHOICE, { type: 'enum' }),
        fact('case.notice_provision', 'Section 7 of a stored act'),
        fact('case.governing_provision', 'Section 998 of another made-up code'),
      ]),
    );
    expect(r.status).toBe(200);
    expect(r.prompt).not.toContain('Section 7 of a stored act');
    expect(r.prompt).not.toContain('Section 998');
    expect(r.body).not.toContain('Section 7 of a stored act');
    expect(r.body).toContain(
      'No notice under Section 41A of the CrPC was served on the applicant before arrest.',
    );
  });

  it('bail_regular, FIR 2023, no choice: both-forms blanks, nothing assumed', async () => {
    const r = await generate('bail_regular', oldFir([]));
    expect(r.status).toBe(200);
    expect(r.body).toContain(
      'for regular bail under [To be confirmed: Section 439 of the CrPC or Section 483 of the BNSS].',
    );
    expect(r.body).toContain(
      'No notice under [To be confirmed: Section 41A of the CrPC or Section 35(3) of the BNSS] was served',
    );
  });

  it('bail_regular, FIR 2026, CrPC chosen: forced to BNSS', async () => {
    const r = await generate('bail_regular', [
      ...regularBase(),
      fact('procedure_code', CRPC_CHOICE, { type: 'enum' }),
    ]);
    expect(r.body).toContain('under Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023.');
  });

  it('bail_before_magistrate, CrPC chosen, FIR 2023, non-bailable: 437 and the 437(1) proviso', async () => {
    const r = await generate('bail_before_magistrate', [
      ...withoutKeys(magistrateBase(), 'fir_date'),
      fact('fir_date', '2 June 2023', { type: 'date', value: '2023-06-02' }),
      fact('procedure_code', CRPC_CHOICE, { type: 'enum' }),
    ]);
    expect(r.status).toBe(200);
    expect(r.body).toContain('Section 437 of the Code of Criminal Procedure, 1973');
    expect(r.body).toContain('first proviso to Section 437(1) of the CrPC');
    expect(r.body).not.toContain('Section 480(1) of the BNSS');
  });

  // ── CI 617: the verifier holds the server-computed law-switch facts ────────
  // The rendered proviso is a computed 'text' fact the verifier did not hold, so
  // "Section 480(1) of the BNSS" was flagged unsupported. Expected strings are the
  // signed literals (Addendum 1), not built from the code under test.

  /** The unsupported-section findings the D1 verifier logged for the last draft. */
  const sectionFindings = async (): Promise<string[]> =>
    (await FactDiff.find({ check: 'unsupported', entityType: 'section' }).lean()).map((r) =>
      r.draftValue ? decrypt(r.draftValue) : '',
    );
  const withNarrativeText = (facts: Fact[], text: string): Fact[] => [
    ...withoutKeys(facts, 'facts_narrative'),
    fact('facts_narrative', text, { raw_span: text }),
  ];

  it('bail_before_magistrate, woman, BNSS (FIR 2026): prints the 480(1) proviso, no section finding', async () => {
    const r = await generate('bail_before_magistrate', magistrateBase());
    expect(r.status).toBe(200);
    expect(r.body).toContain('first proviso to Section 480(1) of the BNSS');
    expect(r.body).toContain('Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023');
    expect(await sectionFindings()).toEqual([]);
  });

  it('bail_before_magistrate, woman, CrPC chosen with FIR 2023 (BNSS not forced): 437(1), no section finding', async () => {
    const r = await generate('bail_before_magistrate', [
      ...withoutKeys(magistrateBase(), 'fir_date'),
      fact('fir_date', '2 June 2023', { type: 'date', value: '2023-06-02' }),
      fact('procedure_code', CRPC_CHOICE, { type: 'enum' }),
    ]);
    expect(r.status).toBe(200);
    expect(r.body).toContain('first proviso to Section 437(1) of the CrPC');
    expect(await sectionFindings()).toEqual([]);
  });

  it('bail_before_magistrate, BNSS chosen, FIR 2023, woman: 480(1) printed, no section finding', async () => {
    const r = await generate('bail_before_magistrate', [
      ...withoutKeys(magistrateBase(), 'fir_date'),
      fact('fir_date', '2 June 2023', { type: 'date', value: '2023-06-02' }),
      fact('procedure_code', BNSS_CHOICE, { type: 'enum' }),
    ]);
    expect(r.status).toBe(200);
    expect(r.body).toContain('first proviso to Section 480(1) of the BNSS');
    expect(await sectionFindings()).toEqual([]);
  });

  it('negative: a section no fact holds (480(2) under BNSS) is still flagged', async () => {
    const r = await generate(
      'bail_before_magistrate',
      withNarrativeText(magistrateBase(), 'Bail is also sought under Section 480(2) of the BNSS.'),
    );
    expect(r.status).toBe(200);
    expect(r.body).toContain('first proviso to Section 480(1) of the BNSS');
    const found = await sectionFindings();
    expect(found.some((v) => /480\(2\)/.test(v))).toBe(true);
    expect(found.some((v) => /480\(1\)/.test(v))).toBe(false);
  });

  it('negative: 437(1) of the CrPC under BNSS is still flagged', async () => {
    const r = await generate(
      'bail_before_magistrate',
      withNarrativeText(magistrateBase(), 'Bail is also sought under Section 437(1) of the CrPC.'),
    );
    expect(r.status).toBe(200);
    expect(r.body).toContain('first proviso to Section 480(1) of the BNSS');
    const found = await sectionFindings();
    expect(found.some((v) => /437\(1\)/.test(v))).toBe(true);
  });

  it('a stored fact under a law-switch key holds no section: the computed value wins and 480(2) stays flagged', async () => {
    const r = await generate('bail_before_magistrate', [
      ...withNarrativeText(
        magistrateBase(),
        'Bail is also sought under Section 480(2) of the BNSS.',
      ),
      fact('women_proviso', 'the first proviso to Section 480(2) of the BNSS'),
      fact('case.governing_provision', 'Section 480(2) of the BNSS'),
    ]);
    expect(r.status).toBe(200);
    expect(r.body).toContain('first proviso to Section 480(1) of the BNSS');
    expect(r.body).not.toContain('first proviso to Section 480(2)');
    const found = await sectionFindings();
    expect(found.some((v) => /480\(2\)/.test(v))).toBe(true);
  });
});
