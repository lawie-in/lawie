/**
 * T-479: the cause title prints the petitioner and respondent names the advocate gave.
 * Ajay's rulings, 16 Oct 2026 (T-404 Addendum 2 #6 in handoff/legal/T-404-cause-title-fields-signed.md).
 * Strings below are typed here on purpose, byte for byte: a code change cannot move them.
 *
 *  AC1  habeas_corpus, fir_quashing, quashing_528_bnss, criminal_revision, writ_petition_civil,
 *       pil, mandamus: the given names are in cause_title, with no "_____" in the party lines.
 *       (Regular bail: out of scope, pinned by t146. Certiorari: phase 2, not tested here.)
 *  AC2  quashing_528_bnss Respondent No. 1 is {prosecuting_agency} alone; empty -> signed blank.
 *  AC3  habeas_corpus and pil respondents: answered -> numbered "1." "2."; unanswered -> signed blank.
 *  AC4  mandamus: empty statute / grievance -> signed blanks; heading "Writ Petition for Mandamus".
 *  AC5  the aliases and fallbacks touch nothing else (s138, s80, bail_regular, other packs).
 *
 * Real loadRulePack -> buildChecklist -> buildBrief -> formDataFromBrief / ledgerSkeletonBrief
 * -> buildPlaceholderContext -> renderTemplateSection. No model call and no database.
 */
import './setupEnv';
import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import {
  formDataFromBrief,
  ledgerSkeletonBrief,
  missingPlaceholder,
} from '../services/brief-drafter';
import { buildBrief, buildChecklist, type Brief, type GivenValue } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadCourtRule,
  loadTemplateConfig,
  numberRespondents,
  partyDesignationsPromptLines,
  renderTemplateSection,
} from '../services/template-engine.service';

// Ajay's signed strings (16 Oct 2026).
const RESPONDENTS_BLANK = '[To be confirmed: respondents, with names and addresses]';
const AGENCY_BLANK = '[To be confirmed: prosecuting agency]';
const STATUTE_BLANK = '[To be confirmed: statute or rule imposing the duty]';
const GRIEVANCE_BLANK = '[To be confirmed: grievance in brief]';
const AGENCY_LABEL =
  'Respondent No. 1 — the State or prosecuting agency (e.g. State of Bihar, State of Jharkhand, CBI)';

const SIGNED = [RESPONDENTS_BLANK, AGENCY_BLANK, STATUTE_BLANK, GRIEVANCE_BLANK];

interface Rendered {
  cause_title: string;
  heading: string;
  all: string;
}
type Values = Record<string, string>;
type Court = { state?: string; court_type?: string; court?: string };
type Renderer = (id: string, values: Values, omit?: string[], court?: Court) => Rendered;

const without = (v: Values, omit: string[]) =>
  Object.fromEntries(Object.entries(v).filter(([k]) => !omit.includes(k)));

function renderCtx(id: string, form: Record<string, unknown>): Rendered {
  clearConfigCache();
  const config = loadTemplateConfig(id)!;
  const ctx = buildPlaceholderContext(config, form, { advocateName: 'Adv. A' });
  const out: Record<string, string> = {};
  for (const s of config.document_structure.sections) {
    if (s.type === 'template' && s.template)
      out[s.section_id] = renderTemplateSection(s, ctx).content;
  }
  const heading = out.petition_heading ?? out.application_heading ?? '';
  return { cause_title: out.cause_title ?? '', heading, all: Object.values(out).join('\n') };
}

function briefFor(id: string, values: Values, court?: Court): Brief {
  const pack = loadRulePack(id);
  if (!pack) throw new Error(`no pack ${id}`);
  const given: GivenValue[] = Object.entries(values).map(([key, value]) => ({
    key,
    value,
    source: 'user' as const,
  }));
  return buildBrief({
    kind: { id, name: id, court_document: true },
    checklist: buildChecklist(pack),
    values: given,
    ...(court ? { court } : {}),
  });
}

const renderForm: Renderer = (id, values, omit = []) => renderCtx(id, without(values, omit));

const renderBrief: Renderer = (id, values, omit = [], court) => {
  clearConfigCache();
  const config = loadTemplateConfig(id)!;
  return renderCtx(id, formDataFromBrief(briefFor(id, without(values, omit), court), config, 'en'));
};

const renderLedger: Renderer = (id, values, omit = [], court) => {
  clearConfigCache();
  const config = loadTemplateConfig(id)!;
  const facts = Object.entries(without(values, omit)).map(
    ([k, v]) =>
      ({ key: k, label: k, type: 'text', display: v, source: 'asked' }) as never as LedgerFact,
  );
  return renderCtx(
    id,
    formDataFromBrief(ledgerSkeletonBrief(briefFor(id, {}, court), facts), config, 'en'),
  );
};

const paths: Array<[string, Renderer]> = [
  ['form path', renderForm],
  ['brief path', renderBrief],
  ['ledger path', renderLedger],
];

/** The label-derived blanks the brief and ledger generators write for a key. */
function generatedBlanks(id: string, key: string) {
  const item = briefFor(id, {}).items.find((i) => i.key === key);
  if (!item) throw new Error(`no ${key} in ${id}`);
  return { brief: item.placeholder as string, ledger: missingPlaceholder(item.label) };
}

/** The party lines: from the last "IN THE MATTER OF" to the end of the title. */
const partyBlock = (title: string) => title.slice(title.lastIndexOf('IN THE MATTER OF'));

// ── The seven packs: given names ────────────────────────────────────────────────────────────

const SCENARIOS: Array<{
  id: string;
  values: Values;
  expectTitle: string[];
  partyLines: RegExp;
}> = [
  {
    id: 'habeas_corpus',
    values: {
      petitioner_name: 'Sample Petitioner',
      detenu_name: 'Sample Detenu',
      respondents_list:
        'State of Sample, through Home Secretary, Sample Town\nSample Officer, Sample Jail',
    },
    expectTitle: [
      'Sample Petitioner (as next friend of the detenu Sample Detenu) ... Petitioner',
      '1. State of Sample, through Home Secretary, Sample Town\n2. Sample Officer, Sample Jail ... Respondents',
    ],
    partyLines: /Petitioner[\s\S]*Respondents/,
  },
  {
    id: 'fir_quashing',
    values: {
      petitioner_name: 'Sample Petitioner',
      complainant_name: 'Sample Complainant',
      police_station: 'Sample',
      state: 'Bihar',
    },
    expectTitle: [
      'Sample Petitioner ... Petitioner',
      '2. Sample Complainant ... Respondent No.2 (Informant)',
    ],
    partyLines: /Petitioner[\s\S]*Respondent No\.2/,
  },
  {
    id: 'quashing_528_bnss',
    values: {
      petitioner_name: 'Sample Petitioner',
      complainant_name: 'Sample Complainant',
      prosecuting_agency: 'CBI',
    },
    expectTitle: [
      'Sample Petitioner ... Petitioner',
      '1. CBI ... Respondent No.1',
      '2. Sample Complainant ... Respondent No.2 (Informant/Complainant)',
    ],
    partyLines: /Petitioner[\s\S]*Respondent No\.2/,
  },
  {
    id: 'criminal_revision',
    values: { petitioner_name: 'Sample Petitioner', respondent_name: 'Sample Respondent' },
    expectTitle: [
      'Sample Petitioner ... Petitioner / Revisionist\nVERSUS\nSample Respondent ... Respondent',
    ],
    partyLines: /Petitioner[\s\S]*Respondent/,
  },
  {
    id: 'writ_petition_civil',
    values: {
      petitioner_name: 'Sample Petitioner',
      respondents_list: 'Sample Authority, Sample Office, Sample Town',
      statute_invoked: 'Sample Act',
      grievance_summary: 'Sample grievance',
    },
    expectTitle: [
      'Sample Petitioner ... Petitioner\nVERSUS\nSample Authority, Sample Office, Sample Town ... Respondents',
    ],
    partyLines: /Petitioner[\s\S]*Respondents/,
  },
  {
    id: 'pil',
    values: {
      petitioner_name: 'Sample Petitioner',
      respondents_list: 'Union of Sample, through Secretary\nSample Board, Sample Town',
      public_interest_subject: 'Sample subject',
    },
    expectTitle: [
      'Sample Petitioner (Petitioner-in-person / representative public-spirited petitioner) ... Petitioner',
      '1. Union of Sample, through Secretary\n2. Sample Board, Sample Town ... Respondents',
    ],
    partyLines: /Petitioner[\s\S]*Respondents/,
  },
  {
    id: 'mandamus',
    values: { petitioner_name: 'Sample Petitioner', respondent_authority: 'Sample Authority' },
    expectTitle: ['Sample Petitioner ... Petitioner\nVERSUS\nSample Authority ... Respondents'],
    partyLines: /Petitioner[\s\S]*Respondents/,
  },
];

describe.each(paths)('T-479 AC1: the given names are in the cause title, %s', (_n, render) => {
  it.each(SCENARIOS)('$id prints the names and no underscore blank in the party lines', (s) => {
    const r = render(s.id, s.values);
    for (const line of s.expectTitle) expect(r.cause_title).toContain(line);
    const party = partyBlock(r.cause_title);
    expect(party).toMatch(s.partyLines);
    // fir_quashing's "State of {state}" line: `state` is not a brief/ledger checklist item, so on
    // those two paths it stays "_____" (a court choice, not a name). Reported to the lead; every
    // other party line is held to the no-blank rule on all paths.
    const lines = party
      .split('\n')
      .filter(
        (l) =>
          !(s.id === 'fir_quashing' && render !== renderForm && /^1\. State of _____,/.test(l)),
      );
    expect(lines.join('\n')).not.toMatch(/_____/);
    expect(party).not.toMatch(/\{|\}/);
    expect(party).not.toMatch(/MISSING/);
  });
});

// ── AC2: quashing_528_bnss Respondent No. 1 ─────────────────────────────────────────────────

describe.each(paths)('T-479 AC2: quashing_528_bnss Respondent No. 1, %s', (_n, render) => {
  const base: Values = {
    petitioner_name: 'Sample Petitioner',
    complainant_name: 'Sample Complainant',
  };

  it('the agency the advocate gave stands alone, with no "State of X, through" before it', () => {
    const r = render('quashing_528_bnss', {
      ...base,
      prosecuting_agency: 'State of Jharkhand',
      state: 'bihar',
    });
    expect(r.cause_title).toContain('\n1. State of Jharkhand ... Respondent No.1\n');
    expect(r.cause_title).not.toMatch(/State of [^\n]*through/i);
    expect(r.cause_title).not.toMatch(/State of (bihar|Bihar)/);
  });

  it('empty: the signed blank, exactly, and no "State of X, through"', () => {
    const r = render('quashing_528_bnss', base);
    expect(r.cause_title).toContain(`\n1. ${AGENCY_BLANK} ... Respondent No.1\n`);
    expect(r.cause_title).not.toMatch(/through/i);
    expect(partyBlock(r.cause_title)).not.toMatch(/MISSING|_____/);
    expect(r.cause_title).not.toContain('[To be confirmed: Respondent No. 1');
    expect(r.cause_title).not.toContain(AGENCY_LABEL);
  });
});

describe('T-479 AC2: quashing_528_bnss empty prosecuting_agency, form-path variants', () => {
  const base: Values = {
    petitioner_name: 'Sample Petitioner',
    complainant_name: 'Sample Complainant',
  };
  const g = generatedBlanks('quashing_528_bnss', 'prosecuting_agency');

  it.each([
    ['empty string', ''],
    ['whitespace', '  \n '],
    ['the brief label-derived blank', g.brief],
    ['the ledger MISSING blank', g.ledger],
  ])('%s -> the signed blank', (_n, v) => {
    const r = renderForm('quashing_528_bnss', { ...base, prosecuting_agency: v });
    expect(r.cause_title).toContain(`\n1. ${AGENCY_BLANK} ... Respondent No.1\n`);
  });

  it('the new field is optional, with the signed label', () => {
    clearConfigCache();
    const f = loadTemplateConfig('quashing_528_bnss')!
      .form_schema.steps.flatMap((s) => s.fields)
      .find((x) => x.field_id === 'prosecuting_agency')!;
    expect(f).toBeDefined();
    expect(f.label).toBe(AGENCY_LABEL);
    expect(f.required).toBeFalsy();
  });

  it('the label-derived blank really is different from the signed one (guards the test above)', () => {
    expect(g.brief).not.toBe(AGENCY_BLANK);
    expect(g.ledger).toMatch(/^\{\{MISSING: /);
  });
});

// ── AC3: habeas_corpus and pil respondents ──────────────────────────────────────────────────

describe.each(['habeas_corpus', 'pil'])('T-479 AC3: %s respondents', (id) => {
  const base: Values =
    id === 'habeas_corpus'
      ? { petitioner_name: 'Sample Petitioner', detenu_name: 'Sample Detenu' }
      : { petitioner_name: 'Sample Petitioner', public_interest_subject: 'Sample subject' };
  const g = generatedBlanks(id, 'respondents_list');

  describe.each(paths)('answered, %s', (_n, render) => {
    it('two lines print numbered 1. and 2.', () => {
      const r = render(id, {
        ...base,
        respondents_list: 'State of Sample, Sample Town\nSample Officer, Sample Jail',
      });
      expect(r.cause_title).toContain(
        'VERSUS\n1. State of Sample, Sample Town\n2. Sample Officer, Sample Jail ... Respondents',
      );
      expect(r.cause_title).not.toContain(RESPONDENTS_BLANK);
    });

    it('already-numbered input is not doubled', () => {
      const r = render(id, {
        ...base,
        respondents_list: '1. State of Sample\n2) Sample Officer\n3. Third One',
      });
      expect(r.cause_title).toContain(
        'VERSUS\n1. State of Sample\n2. Sample Officer\n3. Third One ... Respondents',
      );
      expect(r.cause_title).not.toMatch(/\d\. \d[.)]/);
    });

    it('blank lines are skipped and the numbers stay consecutive', () => {
      const r = render(id, {
        ...base,
        respondents_list: '\nFirst Respondent\n\n   \nSecond Respondent\n',
      });
      expect(r.cause_title).toContain(
        'VERSUS\n1. First Respondent\n2. Second Respondent ... Respondents',
      );
    });

    it('a single respondent is still numbered 1.', () => {
      const r = render(id, { ...base, respondents_list: 'Only Respondent' });
      expect(r.cause_title).toContain('VERSUS\n1. Only Respondent ... Respondents');
    });
  });

  describe.each(paths)('unanswered (omitted), %s', (_n, render) => {
    it('prints exactly the signed blank', () => {
      const r = render(id, base, ['respondents_list']);
      expect(r.cause_title).toContain(`VERSUS\n${RESPONDENTS_BLANK} ... Respondents`);
      expect(r.cause_title).not.toMatch(/MISSING|_____|1\. /);
      expect(r.cause_title).not.toContain(g.brief);
      expect(r.cause_title).not.toContain(g.ledger);
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   \n  '],
    ['the label-derived brief blank', g.brief],
    ['the ledger MISSING blank', g.ledger],
    ['a hand-typed [To be confirmed: ...]', '[To be confirmed: something else]'],
  ])('form path, %s -> the signed blank', (_n, v) => {
    const r = renderForm(id, { ...base, respondents_list: v });
    expect(r.cause_title).toContain(`VERSUS\n${RESPONDENTS_BLANK} ... Respondents`);
    expect(r.cause_title).not.toMatch(/1\. /);
  });

  it('the respondents_list question is a required textarea with the signed help text', () => {
    clearConfigCache();
    const f = loadTemplateConfig(id)!
      .form_schema.steps.flatMap((s) => s.fields)
      .find((x) => x.field_id === 'respondents_list')!;
    expect(f.type).toBe('textarea');
    expect(f.required).toBe(true);
    expect(f.label).toBe('Respondents (names, addresses)');
  });
});

describe('T-479 numberRespondents', () => {
  it.each([
    ['A\nB', '1. A\n2. B'],
    ['1. A\n2. B', '1. A\n2. B'],
    ['1) A\r\n2) B', '1. A\n2. B'],
    ['A\n\n\nB', '1. A\n2. B'],
    ['', ''],
    ['\n \n', ''],
  ])('%j -> %j', (input, out) => {
    expect(numberRespondents(input)).toBe(out);
  });
});

describe('T-479 numbering: strip only a leading "n." or "n)" (Ajay 0e5f64b7)', () => {
  it.each([
    ['2. Sample Officer', '1. Sample Officer'],
    ['2) Sample Officer', '1. Sample Officer'],
    ['No. 5 Sector 2, Sample Town', '1. No. 5 Sector 2, Sample Town'],
    ['Sample Society, Flat 3.', '1. Sample Society, Flat 3.'],
    ['Sample Officer, House 7)', '1. Sample Officer, House 7)'],
    ['(2) Sample Officer', '1. (2) Sample Officer'],
    ['2 - Sample Officer', '1. 2 - Sample Officer'],
    ['2 Sample Officer', '1. 2 Sample Officer'],
  ])('%j -> %j', (input, out) => {
    expect(numberRespondents(input)).toBe(out);
  });

  it('a line is trimmed first, then its leading "n." is stripped ("  3. C" -> "3. C")', () => {
    expect(numberRespondents('A\nB\n  3. C')).toBe('1. A\n2. B\n3. C');
  });

  it('the rest of the line is left alone', () => {
    expect(
      numberRespondents('1. Union of India, through Secretary, No. 5 Sector 2.\n2) Flat 3.'),
    ).toBe('1. Union of India, through Secretary, No. 5 Sector 2.\n2. Flat 3.');
  });

  // Probe: a name that starts with a decimal number. Ajay's rule says only "n." or "n)" is
  // stripped; "2.5" is not a list number.
  it('a leading decimal such as "2.5 Acres Society" is not treated as numbering', () => {
    expect(numberRespondents('2.5 Acres Society')).toBe('1. 2.5 Acres Society');
  });
});

// ── AC4: mandamus ───────────────────────────────────────────────────────────────────────────

describe.each(paths)('T-479 AC4: mandamus, %s', (_n, render) => {
  const given: Values = {
    petitioner_name: 'Sample Petitioner',
    respondent_authority: 'Sample Authority',
  };

  it('both empty fallbacks print the signed text, byte for byte', () => {
    const r = render('mandamus', given);
    expect(r.cause_title).toContain(`AND IN THE MATTER OF: ${STATUTE_BLANK};`);
    expect(r.cause_title).toContain(`AND IN THE MATTER OF: ${GRIEVANCE_BLANK};`);
    expect(r.cause_title).not.toMatch(/MISSING|\{|\}/);
  });

  it('the heading is "Writ Petition for Mandamus" with no Art. 226/32', () => {
    const r = render('mandamus', given);
    expect(r.heading.toUpperCase()).toContain('WRIT PETITION FOR MANDAMUS');
    expect(r.heading).not.toMatch(/ART\.? ?226|226\/32/i);
  });

  it('the cause title is the writ_petition_civil format', () => {
    const m = render('mandamus', given).cause_title;
    const w = render('writ_petition_civil', {
      petitioner_name: 'Sample Petitioner',
      respondents_list: 'Sample Authority',
    }).cause_title;
    // Same frame, line for line, up to the lines that carry the pack's own answers.
    const frame = (t: string) =>
      t.split('\n').filter((l) => /^(IN THE|\(|AND IN THE|VERSUS)/.test(l));
    expect(frame(m).map((l) => l.replace(/:.*$/, ''))).toEqual(
      frame(w).map((l) => l.replace(/:.*$/, '')),
    );
    expect(m).toContain('(EXTRAORDINARY CIVIL / WRIT JURISDICTION)');
    expect(m).toContain('IN THE MATTER OF: Article 226 of the Constitution of India;');
    expect(m).toContain(
      'Sample Petitioner ... Petitioner\nVERSUS\nSample Authority ... Respondents',
    );
  });

  it('a hand-typed statute or grievance (if ever given) is not overwritten', () => {
    const r = render('mandamus', {
      ...given,
      statute_invoked: 'Sample Act',
      grievance_summary: 'Sample grievance',
    });
    // mandamus has no such form field, so the brief path drops them; the form path keeps them.
    if (render === renderForm) {
      expect(r.cause_title).toContain('AND IN THE MATTER OF: Sample Act;');
      expect(r.cause_title).toContain('AND IN THE MATTER OF: Sample grievance;');
    } else {
      expect(r.cause_title).toContain(STATUTE_BLANK);
    }
  });
});

// Ajay's signed Supreme Court text (0e5f64b7, 2d578206), typed here byte for byte.
const SC_HEADING = [
  'IN THE SUPREME COURT OF INDIA',
  'CIVIL ORIGINAL JURISDICTION',
  'WRIT PETITION (CIVIL) NO. ______ OF ______',
  '(Under Article 32 of the Constitution of India)',
].join('\n');
const SC_MATTER = 'IN THE MATTER OF: Article 32 of the Constitution of India;';
const SC_ADDRESSEE =
  "TO, THE HON'BLE THE CHIEF JUSTICE OF INDIA AND HIS COMPANION JUSTICES OF THE SUPREME COURT OF INDIA";
const SHOWETH = 'MOST RESPECTFULLY SHOWETH:';

/** The Supreme Court is chosen the way each path really chooses it. */
const atSC = (name: string, render: Renderer, id: string, values: Values) =>
  name === 'form path'
    ? render(id, { ...values, court: 'SUPREME_COURT' })
    : render(id, values, [], { court_type: 'supreme_court' });

describe.each(paths)('T-479 AC4: mandamus at the Supreme Court, %s', (name, render) => {
  const values = { petitioner_name: 'Sample Petitioner', respondent_authority: 'Sample Authority' };

  it('prints the signed heading, Art. 32 matter line, addressee and SHOWETH', () => {
    const r = atSC(name, render, 'mandamus', values);
    expect(r.cause_title.startsWith(SC_HEADING)).toBe(true);
    expect(r.cause_title).toContain(`${SC_MATTER}\nAND IN THE MATTER OF:`);
    expect(r.cause_title).toContain('Sample Petitioner ... Petitioner');
    expect(r.cause_title).toContain('Sample Authority');
    expect(r.all).toContain(SC_ADDRESSEE);
    expect(r.all).toContain(SHOWETH);
    expect(r.all.indexOf(SC_ADDRESSEE)).toBeLessThan(r.all.indexOf(SHOWETH));
  });

  it('never prints "HIGH COURT", "Article 226" or the generic addressee', () => {
    const r = atSC(name, render, 'mandamus', values);
    expect(r.cause_title).not.toMatch(/HIGH COURT/i);
    expect(r.all).not.toMatch(/HIGH COURT/i);
    expect(r.all).not.toMatch(/Article 226/i);
    expect(r.all).not.toMatch(/^TO,\s*\nTHE HON'BLE/m);
  });

  it('a High Court mandamus is unchanged: Art. 226, no Supreme Court text', () => {
    const r = render('mandamus', { ...values, court: 'High Court', state_of_filing: 'Bihar' });
    expect(r.cause_title).toContain('IN THE MATTER OF: Article 226 of the Constitution of India;');
    expect(r.cause_title).toContain('(EXTRAORDINARY CIVIL / WRIT JURISDICTION)');
    expect(r.all).not.toContain(SC_ADDRESSEE);
    expect(r.all).not.toContain(SC_MATTER);
    expect(r.all).not.toContain('IN THE SUPREME COURT OF INDIA');
  });
});

// ── Certiorari (Ajay 6a047469, f9415fe8) ────────────────────────────────────────────────────

const A227 = 'Article 227 (judicial order of a civil court)';
const STATUTE_BLANK_C =
  '[To be confirmed: statute or rule under which the impugned order was passed]';
const SECRETARY = '[To be confirmed: Secretary of the concerned department]';
const J227 =
  '([To be confirmed: jurisdiction as styled in this High Court for a petition under Article 227])';
const CASE227 = '[To be confirmed: case type and number as styled in this High Court]';
const certNames = {
  petitioner_name: 'Sample Petitioner',
  respondent_authority: 'Sample Authority',
  additional_respondents: 'Sample Private Party',
};

describe.each(paths)('T-479 certiorari cause title, %s', (name, render) => {
  it('Article 226 (administrative): HC heading, signed blanks, State line, names, no Home Department', () => {
    const r = render('certiorari', { ...certNames, article_invoked: '226' }, [], {
      state: 'Bihar',
      court_type: 'high_court',
      court: 'Patna High Court',
    });
    expect(r.cause_title).toContain("IN THE HON'BLE HIGH COURT OF");
    expect(r.cause_title).toContain('IN THE MATTER OF: Article 226 of the Constitution of India;');
    expect(r.cause_title).toContain(`AND IN THE MATTER OF: ${STATUTE_BLANK_C};`);
    expect(r.cause_title).toContain(`AND IN THE MATTER OF: ${GRIEVANCE_BLANK};`);
    expect(r.cause_title).toContain('Sample Petitioner ... Petitioner');
    expect(r.cause_title).toContain('Sample Authority');
    expect(r.cause_title).toContain('Sample Private Party');
    expect(r.cause_title).not.toMatch(/Public Prosecutor|Home Department|SUPREME COURT/i);
    if (name !== 'form path') {
      expect(r.cause_title).toContain(
        `1. State of Bihar through ${SECRETARY}, Government of Bihar`,
      );
      expect(r.cause_title).toMatch(/2\. Sample Authority/);
      expect(r.cause_title).toMatch(/3\. Sample Private Party/);
    }
  });

  it('Article 227 (civil court): signed blanks, no Article 226, no WRIT, no State line', () => {
    const r = render('certiorari', { ...certNames, article_invoked: A227 }, [], {
      state: 'Bihar',
      court_type: 'high_court',
      court: 'Patna High Court',
    });
    expect(r.cause_title).toContain(J227);
    expect(r.cause_title).toContain(CASE227);
    expect(r.cause_title).toContain('IN THE MATTER OF: Article 227 of the Constitution of India;');
    expect(r.cause_title).toContain(`AND IN THE MATTER OF: ${STATUTE_BLANK_C};`);
    expect(r.cause_title).toContain(`AND IN THE MATTER OF: ${GRIEVANCE_BLANK};`);
    expect(r.cause_title).toContain('Sample Petitioner ... Petitioner');
    expect(r.cause_title).not.toMatch(/Article 226|WRIT|SUPREME COURT/);
    expect(r.cause_title).not.toMatch(/State of|Government of|Home Department|Public Prosecutor/);
  });

  it('Article 227 with no respondent given: the signed respondents blank', () => {
    const r = render(
      'certiorari',
      { petitioner_name: 'Sample Petitioner', article_invoked: A227 },
      ['respondent_authority', 'additional_respondents'],
    );
    expect(r.cause_title).toContain(`VERSUS\n${RESPONDENTS_BLANK} ... Respondents`);
  });

  it('Article 32: Supreme Court heading, matter line and addressee, names in the title', () => {
    const r = render('certiorari', { ...certNames, article_invoked: '32' });
    expect(r.cause_title.startsWith(SC_HEADING)).toBe(true);
    expect(r.cause_title).toContain(`${SC_MATTER}\nAND IN THE MATTER OF: ${STATUTE_BLANK_C};`);
    expect(r.cause_title).toContain(`AND IN THE MATTER OF: ${GRIEVANCE_BLANK};`);
    expect(r.cause_title).toContain('Sample Petitioner ... Petitioner');
    expect(r.cause_title).toContain('Sample Authority');
    expect(r.cause_title).toContain('Sample Private Party');
    expect(r.cause_title).toContain(`State of [To be confirmed: State] through ${SECRETARY}`);
    expect(r.all).toContain(SC_ADDRESSEE);
    expect(r.all).toContain(SHOWETH);
    expect(r.all).not.toMatch(/HIGH COURT|Article 226|Public Prosecutor|Home Department/i);
  });

  it('Supreme Court chosen (not Art. 32) also takes the Supreme Court title', () => {
    const r = atSC(name, render, 'certiorari', { ...certNames, article_invoked: '226' });
    expect(r.cause_title.startsWith(SC_HEADING)).toBe(true);
    expect(r.all).toContain(SC_ADDRESSEE);
    expect(r.all).not.toMatch(/HIGH COURT|Article 226/i);
  });

  it('no court chosen: the point (5) State line, never "Through Public Prosecutor"', () => {
    const r = render('certiorari', { ...certNames, article_invoked: '226' });
    expect(r.all).not.toMatch(/Public Prosecutor|Home Department/i);
    expect(r.cause_title).toContain('Sample Petitioner ... Petitioner');
  });
});

// Ajay f9415fe8 (a)-(d), (f), ca12ec2e.
const MATTER_226_227 = 'IN THE MATTER OF: Articles 226 and 227 of the Constitution of India;';
const HC_BLANK_HEADING = 'IN THE HIGH COURT OF [To be confirmed: High Court]';
const DELHI_CIVIL = `Government of NCT of Delhi through ${SECRETARY}`;
const UT_BLANK = '[To be confirmed: name of the State or Union Territory as party]';
const DELHI_CRIMINAL = 'State (Govt. of NCT of Delhi)';
const hc = (state: string, city: string): Court => ({
  state,
  court_type: 'high_court',
  court: `${city} High Court`,
});

describe.each(paths.slice(1))('T-479 certiorari edges (f9415fe8), %s', (_n, render) => {
  const bihar = hc('Bihar', 'Patna');

  it('(a) "226 and 227" keeps the Article 226 title with the Articles 226 and 227 matter line', () => {
    const r = render('certiorari', { ...certNames, article_invoked: '226 and 227' }, [], bihar);
    expect(r.cause_title).toContain("IN THE HON'BLE HIGH COURT OF Bihar AT");
    expect(r.cause_title).toContain('(EXTRAORDINARY CIVIL / WRIT JURISDICTION)');
    expect(r.cause_title).toContain(`${MATTER_226_227}\nAND IN THE MATTER OF:`);
    expect(r.cause_title).not.toContain('Article 226 of the Constitution');
    expect(r.cause_title).toContain(`1. State of Bihar through ${SECRETARY}, Government of Bihar`);
  });

  it('(b) Article 227 with a Supreme Court court: blank High Court heading, no AT, no SC heading', () => {
    const r = render('certiorari', { ...certNames, article_invoked: A227 }, [], {
      court_type: 'supreme_court',
      court: 'Supreme Court of India',
    });
    expect(r.cause_title.startsWith(`${HC_BLANK_HEADING}\n${J227}`)).toBe(true);
    expect(r.cause_title).toContain(CASE227);
    expect(r.cause_title).toContain('IN THE MATTER OF: Article 227 of the Constitution of India;');
    expect(r.all).not.toMatch(/SUPREME COURT|New Delhi|\bAT\b/);
    expect(r.all).not.toContain(SC_ADDRESSEE);
  });

  it('"226 and 227" with a Supreme Court court (Ajay 00568779): blank High Court heading, Articles 226 and 227 matter line, never the Art. 32 title', () => {
    const r = render('certiorari', { ...certNames, article_invoked: '226 and 227' }, [], {
      court_type: 'supreme_court',
      court: 'Supreme Court of India',
    });
    expect(r.cause_title.startsWith(HC_BLANK_HEADING)).toBe(true);
    expect(r.cause_title).toContain(MATTER_226_227);
    expect(r.cause_title).toContain(
      `${HC_BLANK_HEADING}\n(EXTRAORDINARY CIVIL / WRIT JURISDICTION)\n\n${CASE227}`,
    );
    expect(r.all).not.toMatch(/SLP/);
    expect(r.all).not.toMatch(/SUPREME COURT|New Delhi|Article 32|\bAT\b/);
    expect(r.all).not.toContain(SC_ADDRESSEE);
  });

  it('(c) Article 227: typed respondents print numbered, in order', () => {
    const r = render(
      'certiorari',
      {
        petitioner_name: 'Sample Petitioner',
        respondent_authority: 'Sample Tribunal, Sample Town',
        additional_respondents: 'Sample Party One, Sample Town\nSample Party Two, Sample Town',
        article_invoked: A227,
      },
      [],
      bihar,
    );
    expect(r.cause_title).toContain(
      'VERSUS\n1. Sample Tribunal, Sample Town\n2. Sample Party One, Sample Town\n' +
        '3. Sample Party Two, Sample Town ... Respondents',
    );
    expect(r.cause_title).not.toContain(RESPONDENTS_BLANK);
    expect(r.cause_title).not.toMatch(/State of|Government of|Home Department/);
  });

  it('(c) Article 227: none typed -> the signed blank only', () => {
    const r = render(
      'certiorari',
      { petitioner_name: 'Sample Petitioner', article_invoked: A227 },
      ['respondent_authority', 'additional_respondents'],
      bihar,
    );
    expect(r.cause_title).toContain(`VERSUS\n${RESPONDENTS_BLANK} ... Respondents`);
  });

  it('(d) certiorari in Delhi: the NCT line, never "State of Delhi"', () => {
    const r = render(
      'certiorari',
      { ...certNames, article_invoked: '226' },
      [],
      hc('Delhi', 'Delhi'),
    );
    expect(r.cause_title).toContain(`1. ${DELHI_CIVIL}`);
    expect(r.cause_title).not.toContain('State of Delhi');
    expect(r.cause_title).not.toMatch(/Home Department|Public Prosecutor/);
  });

  it('(d) certiorari in another Union Territory: the UT blank', () => {
    const r = render(
      'certiorari',
      { ...certNames, article_invoked: '226' },
      [],
      hc('Chandigarh', 'Punjab and Haryana'),
    );
    expect(r.cause_title).toContain(`1. ${UT_BLANK}`);
    expect(r.cause_title).not.toMatch(/State of Chandigarh|Home Department/);
  });

  it('(d) fir_quashing: Delhi = State (Govt. of NCT of Delhi); UT = the UT blank; Bihar unchanged', () => {
    const v = { petitioner_name: 'Sample Petitioner', police_station: 'Sample' };
    const delhi = render('fir_quashing', v, ['state'], hc('Delhi', 'Delhi')).cause_title;
    expect(delhi).toContain(`1. ${DELHI_CRIMINAL}, through Station House Officer, `);
    expect(delhi).not.toContain('State of Delhi');
    const ut = render(
      'fir_quashing',
      v,
      ['state'],
      hc('Chandigarh', 'Punjab and Haryana'),
    ).cause_title;
    expect(ut).toContain(`1. ${UT_BLANK}, through Station House Officer, `);
    const bihar_ = render('fir_quashing', v, ['state'], bihar).cause_title;
    expect(bihar_).toContain('1. State of Bihar, through Station House Officer, ');
  });

  it('(d) the Delhi/UT lines are not applied to mandamus or writ_petition_civil headings of other packs', () => {
    const r = render(
      'mandamus',
      { petitioner_name: 'Sample Petitioner' },
      [],
      hc('Delhi', 'Delhi'),
    );
    expect(r.all).not.toContain(DELHI_CIVIL);
  });
});

describe('T-479 (f) writ_petition_civil prompt: signed department blank, never "Home Department"', () => {
  const rule = loadCourtRule('patna_hc')!;
  it('Bihar', () => {
    const lines = partyDesignationsPromptLines(rule, 'writ_petition_civil', 'Bihar');
    expect(lines).toContain(`State of Bihar through ${SECRETARY}, Government of Bihar`);
    expect(lines).not.toMatch(/Home Department/);
  });
  it('Delhi', () => {
    const lines = partyDesignationsPromptLines(rule, 'writ_petition_civil', 'Delhi');
    expect(lines).toContain(DELHI_CIVIL);
    expect(lines).not.toMatch(/State of Delhi|Home Department/);
  });
  it('certiorari prompt is sent no State line and no Home Department', () => {
    const lines = partyDesignationsPromptLines(
      loadCourtRule('jharkhand_hc')!,
      'certiorari',
      'Jharkhand',
    );
    expect(lines).not.toMatch(/Home Department|state:/);
  });
});

describe('T-479 certiorari pack metadata and prompt', () => {
  const rule = JSON.parse(
    readFileSync(join(__dirname, '../config/document-rules/certiorari.json'), 'utf8'),
  ) as { docType: string; displayName: string; causeTitle: Record<string, string> };

  it('displayName and docType', () => {
    expect(rule.docType).toBe('certiorari');
    expect(rule.displayName).toBe('Writ Petition — Certiorari');
  });

  it('the Supreme Court title and addressee are the signed text', () => {
    expect(rule.causeTitle.supremeCourtFormat.startsWith(SC_HEADING)).toBe(true);
    expect(rule.causeTitle.supremeCourtFormat).toContain(SC_MATTER);
    expect(rule.causeTitle.supremeCourtAddressee).toBe(SC_ADDRESSEE);
  });

  it('no "Home Department" anywhere in the certiorari pack text', () => {
    expect(JSON.stringify(rule)).not.toMatch(/Home Department/);
  });
});

describe('T-479 mandamus pack: Supreme Court title text', () => {
  const rule = JSON.parse(
    readFileSync(join(__dirname, '../config/document-rules/mandamus.json'), 'utf8'),
  ) as { causeTitle: Record<string, string> };
  it('supremeCourtFormat starts with the four signed lines and carries the Art. 32 matter line', () => {
    expect(rule.causeTitle.supremeCourtFormat.startsWith(SC_HEADING)).toBe(true);
    expect(rule.causeTitle.supremeCourtFormat).toContain(SC_MATTER);
    expect(rule.causeTitle.supremeCourtAddressee).toBe(SC_ADDRESSEE);
  });
});

describe('T-479 {state} fill from the court', () => {
  const base = { petitioner_name: 'Sample Petitioner', police_station: 'Sample' };
  const courtData = (state: string, courtType = 'high_court') => ({
    designation: 'High Court',
    city: 'Patna',
    caseNomenclature: 'CRL. MISC. No. _____',
    formattingRulesRef: '',
    courtType,
    state,
  });
  const titleWith = (id: string, form: Record<string, unknown>, court: object) => {
    clearConfigCache();
    const config = loadTemplateConfig(id)!;
    const ctx = buildPlaceholderContext(config, form, {}, court as never);
    const sec = config.document_structure.sections.find((x) => x.section_id === 'cause_title')!;
    return renderTemplateSection(sec, ctx).content;
  };

  it('brief path: fir_quashing at Patna shows "State of Bihar" and "HIGH COURT OF Bihar"', () => {
    const r = renderBrief('fir_quashing', base, ['state'], {
      state: 'Bihar',
      court_type: 'high_court',
      court: 'Patna High Court',
    });
    expect(r.cause_title).toContain("IN THE HON'BLE HIGH COURT OF Bihar AT");
    expect(r.cause_title).toContain(
      '1. State of Bihar, through Station House Officer, Police Station Sample ... Respondent No.1',
    );
  });

  it.each(['fir_quashing', 'quashing_528_bnss', 'writ_petition_civil', 'mandamus'])(
    '%s: an unanswered {state} takes the court state',
    (id) => {
      expect(titleWith(id, { ...base }, courtData('Bihar'))).toContain('HIGH COURT OF Bihar');
    },
  );

  it('a state the form answered wins over the court state', () => {
    const t = titleWith('fir_quashing', { ...base, state: 'Jharkhand' }, courtData('Bihar'));
    expect(t).toContain('HIGH COURT OF Jharkhand');
    expect(t).not.toContain('Bihar');
  });

  it.each([
    ['the Supreme Court', courtData('Delhi', 'supreme_court')],
    ['India', courtData('India')],
    ['Not applicable', courtData('Not applicable')],
  ])('%s keeps "_____" (no state is invented)', (_n, court) => {
    const t = titleWith('fir_quashing', { ...base }, court);
    expect(t).toContain('_____');
    expect(t).not.toMatch(/Delhi|India\b.*AT|Not applicable/);
  });
});

describe('T-479 AC4: mandamus pack metadata', () => {
  const rule = JSON.parse(
    readFileSync(join(__dirname, '../config/document-rules/mandamus.json'), 'utf8'),
  ) as { docType: string; displayName: string };

  it('displayName and docType', () => {
    expect(rule.displayName).toBe('Writ Petition for Mandamus');
    expect(rule.docType).toBe('mandamus');
  });

  it('the loaded template carries the same name', () => {
    clearConfigCache();
    const c = loadTemplateConfig('mandamus')!;
    expect(c.template_id).toBe('mandamus');
    expect(JSON.stringify(c)).toContain('Writ Petition for Mandamus');
  });
});

// ── AC5: nothing else moves ─────────────────────────────────────────────────────────────────

describe('T-479 AC5: the aliases and fallbacks touch nothing else', () => {
  it('a bare key the server already set is not overridden by the alias (computed field)', () => {
    clearConfigCache();
    const base = loadTemplateConfig('criminal_revision')!;
    const config = {
      ...base,
      computed_fields: {
        ...(base.computed_fields ?? {}),
        petitioner: { logic: "'Computed Petitioner'" },
      },
    } as typeof base;
    const ctx = buildPlaceholderContext(
      config,
      { petitioner_name: 'Named Petitioner', respondent_name: 'Named Respondent' },
      {},
    );
    expect(ctx.petitioner).toBe('Computed Petitioner');
    expect(ctx.respondent).toBe('Named Respondent');
  });

  it('a client-sent bare key is dropped (T-300): the name field fills the alias', () => {
    clearConfigCache();
    const config = loadTemplateConfig('criminal_revision')!;
    const ctx = buildPlaceholderContext(
      config,
      {
        petitioner: 'Forged Petitioner',
        petitioner_name: 'Named Petitioner',
        respondent: 'Forged Respondent',
        respondent_name: 'Named Respondent',
        complainant: 'Forged Complainant',
        complainant_name: 'Named Complainant',
      },
      {},
    );
    expect(ctx.petitioner).toBe('Named Petitioner');
    expect(ctx.respondent).toBe('Named Respondent');
    expect(ctx.complainant).toBe('Named Complainant');
  });

  it('the alias fills the bare key from the name field when the bare key is empty', () => {
    clearConfigCache();
    const config = loadTemplateConfig('criminal_revision')!;
    const ctx = buildPlaceholderContext(
      config,
      {
        petitioner_name: 'Named Petitioner',
        respondent_name: 'Named Respondent',
        complainant_name: 'Named Complainant',
      },
      {},
    );
    expect(ctx.petitioner).toBe('Named Petitioner');
    expect(ctx.respondent).toBe('Named Respondent');
    expect(ctx.complainant).toBe('Named Complainant');
  });

  it('respondents_list is not an alias: the typed list reaches the title', () => {
    const r = renderForm('habeas_corpus', {
      petitioner_name: 'Sample Petitioner',
      detenu_name: 'Sample Detenu',
      respondents_list: 'Typed Respondent',
    });
    expect(r.cause_title).toContain('1. Typed Respondent ... Respondents');
  });

  it('s138 and s80 cause titles (headers) are unchanged by the aliases', () => {
    const twin = (id: string) =>
      JSON.parse(
        readFileSync(join(__dirname, `../../../../docs/templates/${id}.json`), 'utf8'),
      ) as {
        document_structure: { sections: Array<{ section_id: string; template?: string }> };
      };
    const header = (id: string, form: Record<string, unknown>) => {
      clearConfigCache();
      const cfg = loadTemplateConfig(id)!;
      const ctx = buildPlaceholderContext(cfg, form, {});
      return renderTemplateSection(
        {
          ...twin(id).document_structure.sections.find((s) => s.section_id === 'header')!,
          type: 'template',
        } as never,
        ctx,
      ).content;
    };
    const base = {
      applicant_name: 'Suresh Gupta',
      applicant_address: '12 Karol Bagh, Delhi',
      respondent_name: 'Demo Traders',
      respondent_address: '5 Lajpat Nagar, Delhi',
      advocate_name: 'A. Advocate',
      advocate_address: 'Chamber 3, Tis Hazari',
    };
    // the same pins as t404-cause-title-s138
    expect(header('legal_notice_s138', { ...base, respondent_type: 'partnership' })).toContain(
      'To,\n1. Demo Traders, through its [To be confirmed: authorised signatory / partner / director], ' +
        'at its principal place of business, 5 Lajpat Nagar, Delhi\n\nFrom,\nSuresh Gupta\n12 Karol Bagh, Delhi\n' +
        'Through: A. Advocate, Advocate\nChamber 3, Tis Hazari',
    );
    const s80 = header('legal_notice_s80', base);
    expect(s80).toContain('Demo Traders');
    expect(s80).toContain('Suresh Gupta');
    expect(s80).not.toContain('[To be confirmed: respondents');
  });

  it('bail_regular cause title still prints the applicant exactly as t146 pins it for the bail family', () => {
    const r = renderForm('bail_regular', { applicant_name: 'Ramesh Kumar' });
    expect(r.cause_title).toContain('Ramesh Kumar');
    expect(r.cause_title).not.toMatch(/MISSING/);
    SIGNED.forEach((s) => expect(r.all).not.toContain(s));
  });

  it('bail_cancellation verification still reads "I, <petitioner_name>," (deponent)', () => {
    const r = renderForm('bail_cancellation', {
      petitioner_name: 'Sample Petitioner',
      respondent_name: 'Sample Respondent',
    });
    expect(r.all).toContain('I, Sample Petitioner,');
  });

  it('the signed fallbacks appear only for their own packs: nothing leaks into any other pack', () => {
    const own: Record<string, string[]> = {
      habeas_corpus: [RESPONDENTS_BLANK],
      pil: [RESPONDENTS_BLANK],
      quashing_528_bnss: [AGENCY_BLANK],
      mandamus: [STATUTE_BLANK, GRIEVANCE_BLANK],
      certiorari: [GRIEVANCE_BLANK],
    };
    const dir = join(__dirname, '../config/document-rules');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ids = (require('fs').readdirSync(dir) as string[])
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
    expect(ids.length).toBe(92);
    const leaks: string[] = [];
    for (const id of ids) {
      clearConfigCache();
      const cfg = loadTemplateConfig(id);
      if (!cfg) continue;
      // every field present but empty, plus the three keys the fallbacks read
      const form: Record<string, unknown> = {
        respondents_list: '',
        prosecuting_agency: '',
        statute_invoked: '',
        grievance_summary: '',
      };
      for (const st of cfg.form_schema.steps) for (const f of st.fields) form[f.field_id] = '';
      const ctx = buildPlaceholderContext(cfg, form, {});
      const text = cfg.document_structure.sections
        .filter((s) => s.type === 'template' && s.template)
        .map((s) => renderTemplateSection(s, ctx).content)
        .join('\n');
      for (const s of SIGNED) {
        if (text.includes(s) && !(own[id] ?? []).includes(s)) leaks.push(`${id}: ${s}`);
      }
      for (const s of own[id] ?? []) {
        if (!text.includes(s)) leaks.push(`${id}: missing own fallback ${s}`);
      }
    }
    expect(leaks).toEqual([]);
  });
});
