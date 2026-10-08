/**
 * T-157 (AJ-2026-10-08-T157): the state line has no slash, {state} comes from
 * the court's state, and fallback court rules keep the chosen court's own
 * designation.
 */
import './setupEnv';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  CourtLookupData,
  SIGNED_DOCUMENT_TYPES,
  buildPlaceholderContext,
  clearConfigCache,
  documentSide,
  loadCourtRule,
  loadTemplateConfig,
  renderTemplateSection,
} from '../services/template-engine.service';

const BLANK_STATE = '[To be confirmed: name of the State]';
const BLANK_DESIGNATION = '[To be confirmed: court designation]';
const CRIMINAL_TYPE = SIGNED_DOCUMENT_TYPES.find((t) => documentSide(t) === 'criminal')!;

function ctxFor(ref: string, over: Partial<CourtLookupData> = {}) {
  const courtData: CourtLookupData = {
    designation: 'IN THE COURT OF SESSIONS JUDGE, PATNA',
    city: 'Patna',
    caseNomenclature: '',
    formattingRulesRef: ref,
    courtRule: loadCourtRule(ref)!,
    ...over,
  };
  return buildPlaceholderContext(
    loadTemplateConfig(CRIMINAL_TYPE)!,
    { applicant_name: 'A B' },
    { advocateName: 'Test Adv', enrollmentNumber: 'X/001/2026' },
    courtData,
  );
}

beforeEach(() => clearConfigCache());

describe('T-157 stateLine: {state} from the court state', () => {
  it('has a criminal signed type to test with', () => {
    expect(CRIMINAL_TYPE).toBeTruthy();
  });

  it('a State: "State of Bihar", no slash, no literal {state}', () => {
    const line = ctxFor('sessions_generic', { state: 'Bihar' }).state_respondent;
    expect(line).toBe('State of Bihar');
    expect(line).not.toMatch(/\{|\//);
  });

  it('empty state: visible blank', () => {
    expect(ctxFor('sessions_generic', { state: '' }).state_respondent).toBe(BLANK_STATE);
  });

  it('state absent: visible blank', () => {
    expect(ctxFor('sessions_generic').state_respondent).toBe(BLANK_STATE);
  });

  it.each(['Ladakh (UT)', 'Jammu & Kashmir', 'Chandigarh'])(
    'Union Territory %s: blank, never "State of"',
    (state) => {
      const line = ctxFor('district_court_generic', { state }).state_respondent;
      expect(line).toBe(BLANK_STATE);
      expect(line).not.toMatch(/State of/);
    },
  );

  it.each([
    'Delhi',
    'New Delhi',
    'NCT of Delhi',
    'National Capital Territory of Delhi',
    'Union Territory of Delhi',
    '  nEW   dELHI ',
    'DELHI',
  ])('Delhi variant %j: "State (NCT of Delhi)", no "State of"', (state) => {
    const line = ctxFor('district_court_generic', { state }).state_respondent;
    expect(line).toBe('State (NCT of Delhi)');
    expect(line).not.toMatch(/State of/);
  });

  it('a string that only contains Delhi is not Delhi: falls through to "State of {state}"', () => {
    const line = ctxFor('district_court_generic', { state: 'Delhi Cantonment Board' })
      .state_respondent;
    expect(line).not.toBe('State (NCT of Delhi)');
    expect(line).toBe('State of Delhi Cantonment Board');
  });

  it('Puducherry: visible blank', () => {
    expect(ctxFor('district_court_generic', { state: 'Puducherry' }).state_respondent).toBe(
      BLANK_STATE,
    );
  });

  it('Bihar rule prints "State of Bihar" with no district or slash', () => {
    const line = ctxFor('bihar_district', { state: 'Bihar' }).state_respondent;
    expect(line).toBe('State of Bihar');
  });
});

describe('T-157 courtHeading: fallback rules', () => {
  it.each(['sessions_generic', 'district_court_generic', 'labour_court'])(
    '%s: the chosen court designation wins over the rule line',
    (ref) => {
      const ctx = ctxFor(ref, { designation: 'IN THE COURT OF ADDITIONAL SESSIONS JUDGE, PATNA' });
      expect(ctx.court_header).toBe('IN THE COURT OF ADDITIONAL SESSIONS JUDGE, PATNA');
      expect(ctx.court_designation).toBe('ADDITIONAL SESSIONS JUDGE, PATNA');
    },
  );

  it.each(['sessions_generic', 'district_court_generic', 'labour_court'])(
    '%s: a court designation with a slash prints the blank',
    (ref) => {
      const ctx = ctxFor(ref, { designation: 'SESSIONS JUDGE / ADDITIONAL SESSIONS JUDGE' });
      expect(ctx.court_header).toBe(BLANK_DESIGNATION);
      expect(ctx.court_designation).toBe(BLANK_DESIGNATION);
    },
  );

  it('sessions_generic: no court designation gives the rule line, with no slash', () => {
    const rule = loadCourtRule('sessions_generic')!;
    expect(rule.designation).not.toMatch(/ \/ /);
    const ctx = ctxFor('sessions_generic', { designation: '' });
    // Rule line plus the court's city; no slash.
    expect(ctx.court_header).toBe('IN THE COURT OF SESSIONS JUDGE, PATNA');
    expect(ctx.court_designation).toBe('SESSIONS JUDGE, PATNA');
  });

  it('labour_court: no court designation gives the rule line', () => {
    expect(loadCourtRule('labour_court')!.designation).toBe('BEFORE THE LABOUR COURT');
  });
});

/**
 * Criterion 3: regular bail (bail_regular) cause title, stubbed model (the
 * cause_title section is a template section, so no model call is involved).
 */
describe('T-157 criterion 3: bail_regular cause title', () => {
  function causeTitle(ref: string, designation: string, city: string, state: string): string {
    const cfg = loadTemplateConfig('bail_regular')!;
    const courtData: CourtLookupData = {
      designation,
      city,
      caseNomenclature: '',
      formattingRulesRef: ref,
      courtRule: loadCourtRule(ref)!,
      state,
    };
    const ctx = buildPlaceholderContext(
      cfg,
      { applicant_name: 'A B' },
      { advocateName: 'Test Adv', enrollmentNumber: 'X/001/2026' },
      courtData,
    );
    const section = cfg.document_structure.sections.find((s) => s.section_id === 'cause_title')!;
    return renderTemplateSection(section, ctx).content;
  }

  it.each([
    ['bihar_district', 'IN THE COURT OF SESSIONS JUDGE, PATNA', 'Patna', 'Bihar', 'State of Bihar'],
    [
      'jharkhand_district',
      'IN THE COURT OF SESSIONS JUDGE, RANCHI',
      'Ranchi',
      'Jharkhand',
      'State of Jharkhand',
    ],
  ])('%s: prints the signed state line, no slash, no placeholder', (ref, des, city, state, line) => {
    const title = causeTitle(ref, des, city, state);
    expect(title).toContain(line);
    expect(title).not.toContain(`${line} through`);
    expect(title).not.toMatch(/ \/ /);
    expect(title).not.toContain('{');
  });
});

/**
 * Criterion 2: no " / " either-or in any court-rule file's printed fields:
 * `designation`, `cause_title_format`, every `party_designation.*` and every
 * `prayer_language.*`. `_meta`, `notes` and guidance prose are exempt.
 *
 * NAMED_EXCEPTIONS pins "<file>|<field path>" to the EXACT current value, so
 * any new or changed slash in the same field still fails. Never skipped.
 */
const RULES_DIR = join(__dirname, '../config/court-rules');
const SLASH = / \/ /;

const NAMED_EXCEPTIONS: Record<string, string> = {
  // T-158 (AJ-2026-10-08-T158-A1, -T157-A2): drt, nclt, labour_court and
  // tribunal_generic are slash-free and no longer listed.
  // NOT in the handoff list; found by this scan. T-149 (AJ-2026-10-07-T149): the raw
  // civil/criminal label pair is resolved to one label per side via
  // party_designation_by_side at render (t149-party-labels.test.ts). Report to lead.
  'up_district.json|party_designation.petitioner': 'Plaintiff (civil) / Applicant (criminal)',
  'up_district.json|party_designation.respondent': 'Defendant (civil) / Opposite Party (criminal)',
  'delhi_district.json|party_designation.petitioner': 'Plaintiff (civil) / Applicant (criminal)',
  'delhi_district.json|party_designation.respondent':
    'Defendant (civil) / Opposite Party (criminal)',
  // NOT in the handoff list; found by this scan. Not a party label: a note that no
  // State party applies. Not in Ajay's T-157 table; ask Ajay / T-158.
  'family_court.json|party_designation.state': 'Not applicable (civil / personal law proceedings)',
};

function printedFields(rule: Record<string, unknown>): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [
    ['designation', rule.designation],
    ['cause_title_format', rule.cause_title_format],
  ];
  for (const group of ['party_designation', 'prayer_language']) {
    const obj = rule[group];
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        out.push([`${group}.${k}`, v]);
      }
    }
  }
  // T-158 (AJ-2026-10-08-T158-A2): the verification text is printed too.
  out.push(['verification_format', rule.verification_format]);
  // T-158: a matter type (NCLT: IBC vs Companies Act) replaces the cause title,
  // party labels and verification, so those are scanned as well.
  const overrides = rule.matter_type_overrides;
  if (overrides && typeof overrides === 'object') {
    for (const [type, o] of Object.entries(overrides as Record<string, Record<string, unknown>>)) {
      out.push([`matter_type_overrides.${type}.cause_title_format`, o.cause_title_format]);
      out.push([`matter_type_overrides.${type}.verification_format`, o.verification_format]);
      const pd = o.party_designation;
      if (pd && typeof pd === 'object') {
        for (const [k, v] of Object.entries(pd as Record<string, unknown>)) {
          out.push([`matter_type_overrides.${type}.party_designation.${k}`, v]);
        }
      }
    }
  }
  return out;
}

describe('T-157 criterion 2: no " / " in printed court-rule fields', () => {
  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith('.json'));

  it('finds the court-rule files', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files)('%s', (file) => {
    const rule = JSON.parse(readFileSync(join(RULES_DIR, file), 'utf-8'));
    const bad: string[] = [];
    for (const [field, value] of printedFields(rule)) {
      if (typeof value !== 'string' || !SLASH.test(value)) continue;
      if (NAMED_EXCEPTIONS[`${file}|${field}`] === value) continue;
      bad.push(`${field}: ${JSON.stringify(value)}`);
    }
    expect(bad).toEqual([]);
  });

  it('every named exception still exists with its exact value (no stale entries)', () => {
    for (const [key, value] of Object.entries(NAMED_EXCEPTIONS)) {
      const [file, field] = key.split('|');
      const rule = JSON.parse(readFileSync(join(RULES_DIR, file), 'utf-8'));
      expect(Object.fromEntries(printedFields(rule))[field]).toBe(value);
    }
  });
});
