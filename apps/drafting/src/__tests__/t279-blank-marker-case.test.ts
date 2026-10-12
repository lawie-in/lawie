/**
 * T-279 (Ajay, 12 Oct): the three places that know the blanks are
 * case-insensitive on the MARKER WORDS only; the fixed text stays exact.
 *
 *  1. fact-verifier: MARKER_BLANK_RE ({{MISSING:..}}, [To be confirmed:..]) is /gi,
 *     FIXED_BLANK_RE ([Section — verify before filing], [Authority — add if relied
 *     upon], ___) is /g. Both are module-private; they are reached through
 *     verifyDraft (extractEntities' claim loop and buildSources' skeletonText).
 *  2. countMissingPlaceholders counts {{MISSING: ..}} in any case, and only that.
 *  3. brief-drafter BLANK_LINE: a whole line "[to be confirmed: x]" in any case is
 *     not a C4 "part that may not belong". There is no note stripper, so "survives"
 *     means: no C4 warning, and the line is still in the draft.
 *
 * Pure functions only: no model call, no database.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { loadAvermentLists } from '../services/averments';
import { checkOneDocument, packTexts } from '../services/brief-drafter';
import type { SystemText } from '../services/brief-drafter';
import {
  countMissingPlaceholders,
  verifyDraft,
  type FactViolation,
  type VerifierInput,
} from '../services/fact-verifier';
import { loadRulePack } from '../services/rule-pack.service';

// ── Fixtures ────────────────────────────────────────────────────────────────

interface Fixture {
  pack: string;
  ledger: { facts: never[]; unresolved: never[] };
  skeleton: string[];
  body: string;
}
const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 't147d', `${name}.json`), 'utf8')) as Fixture;

const S138 = fixture('s138-notice');

function inputOf(body: string, skeleton: string[] = S138.skeleton): VerifierInput {
  return {
    body,
    facts: S138.ledger.facts,
    unresolved: S138.ledger.unresolved,
    lists: loadAvermentLists(S138.pack),
    skeleton,
    packText: packTexts(loadRulePack(S138.pack)!),
  };
}

const CLEAN = [
  '1. That you, Demo Traders, issued a cheque dated 01.09.2026 for Rs 3,00,000 drawn on HDFC Bank, Karol Bagh in favour of my client.',
  '2. That my client presented the said cheque for encashment on 15.09.2026.',
  '3. That the said cheque was returned unpaid.',
].join('\n\n');

// Entity findings: 'unsupported' (not in facts) or 'mutation' (the ledger holds a different value).
const unsupported = (vs: readonly FactViolation[]) => vs.filter((v) => v.check !== 'dropped');

// ── Place 1a: extractEntities — a blank span is never an entity ─────────────

describe('T-279 place 1a: marker blanks in the body are never entities (extractEntities)', () => {
  // Each blank has an entity-shaped label inside it; read as text, the label
  // would be an unsupported date / amount / section / station.
  const LABELS = [
    '05 March 2025',
    'Rs 9,99,999',
    'Section 302 of the Indian Penal Code, 1860',
    'Police Station Gomti Nagar',
  ];
  const MARKERS: Array<[string, (label: string) => string]> = [
    ['[To be confirmed: ...] (as written)', (l) => `[To be confirmed: ${l}]`],
    ['[to be confirmed: ...] (lower)', (l) => `[to be confirmed: ${l}]`],
    ['[To Be Confirmed: ...] (Title)', (l) => `[To Be Confirmed: ${l}]`],
    ['[TO BE CONFIRMED: ...] (upper)', (l) => `[TO BE CONFIRMED: ${l}]`],
    ['{{MISSING: ...}} (upper)', (l) => `{{MISSING: ${l}}}`],
    ['{{missing: ...}} (lower)', (l) => `{{missing: ${l}}}`],
    ['{{Missing: ...}} (Title)', (l) => `{{Missing: ${l}}}`],
  ];

  it('the control: the same labels as bare text ARE reported as unsupported entities', () => {
    for (const l of LABELS) {
      const vs = unsupported(verifyDraft(inputOf(`${CLEAN}\n\n4. That it happened on ${l}.`)));
      expect({ l, found: vs.length > 0 }).toEqual({ l, found: true });
    }
  });

  it('the clean draft with no blank has no findings', () => {
    expect(verifyDraft(inputOf(CLEAN))).toEqual([]);
  });

  it.each(MARKERS)('%s: the label inside is not read as an entity or claim', (_n, wrap) => {
    for (const l of LABELS) {
      const body = `${CLEAN}\n\n4. That the matter stood listed on ${wrap(l)}.`;
      const vs = verifyDraft(inputOf(body));
      expect({ l, vs: vs.map((v) => [v.check, v.entityType]) }).toEqual({ l, vs: [] });
    }
  });

  it('lower and Title case give exactly the findings that upper case gives', () => {
    const body = (m: string) => `${CLEAN}\n\n4. That ${m} paid Rs 7,50,000 to the noticee.`;
    const strip = (vs: FactViolation[]) => vs.map((v) => [v.check, v.entityType, v.reason]);
    const upper = strip(verifyDraft(inputOf(body('[TO BE CONFIRMED: name of payer]'))));
    expect(upper.length).toBeGreaterThan(0); // the real amount is still found
    expect(strip(verifyDraft(inputOf(body('[to be confirmed: name of payer]'))))).toEqual(upper);
    expect(strip(verifyDraft(inputOf(body('[To Be Confirmed: name of payer]'))))).toEqual(upper);
    expect(strip(verifyDraft(inputOf(body('{{missing: name of payer}}'))))).toEqual(upper);
  });
});

// ── Place 1b: buildSources — skeleton blanks become a space ─────────────────

describe('T-279 place 1b: blanks in the skeleton are replaced with a space (buildSources)', () => {
  // The skeleton holds "Police Station Gomti <blank> Nagar". With the blank
  // taken out the skeleton reads "Gomti Nagar" and supports the body's station;
  // with the blank left in, its words sit between Gomti and Nagar.
  const BODY = `${CLEAN}\n\n4. That the matter was noted at Police Station Gomti Nagar.`;
  const skeletonWith = (blank: string) => [...S138.skeleton, `Police Station Gomti ${blank} Nagar`];
  const stationFound = (blank: string) =>
    verifyDraft(inputOf(BODY, skeletonWith(blank))).some(
      (v) => v.check === 'unsupported' && v.entityType === 'police_station',
    );

  it('the control: words (not a blank) between Gomti and Nagar do not support the station', () => {
    expect(stationFound('Qux')).toBe(true); // "Gomti Qux Nagar" is not "Gomti Nagar"
  });

  it.each([
    '[To be confirmed: drawer]',
    '[to be confirmed: drawer]',
    '[To Be Confirmed: drawer]',
    '[TO BE CONFIRMED: drawer]',
    '{{MISSING: drawer}}',
    '{{missing: drawer}}',
    '{{Missing: drawer}}',
    '[Section — verify before filing]',
    '[Authority — add if relied upon]',
    '___',
  ])('"%s" in the skeleton is taken out, so it supports the station', (blank) => {
    expect(stationFound(blank)).toBe(false);
  });

  it.each(['[section — verify before filing]', '[authority — add if relied upon]'])(
    'fixed text is exact: "%s" in lower case stays in the skeleton, as before the change',
    (blank) => {
      expect(stationFound(blank)).toBe(true);
    },
  );
});

// ── Place 2: countMissingPlaceholders ───────────────────────────────────────

describe('T-279 place 2: countMissingPlaceholders', () => {
  it('counts {{MISSING}} in any case: upper, lower and spaced Title', () => {
    expect(countMissingPlaceholders('{{MISSING: a}} {{missing: b}} {{ Missing : c}}')).toBe(3);
  });

  it('upper case is unchanged', () => {
    expect(countMissingPlaceholders('{{MISSING: a}}')).toBe(1);
    expect(countMissingPlaceholders('{{MISSING: a}} and {{MISSING: b}}')).toBe(2);
    expect(countMissingPlaceholders('no blanks here')).toBe(0);
  });

  it('does not count [to be confirmed: x] in any case (MISSING only)', () => {
    expect(countMissingPlaceholders('[to be confirmed: x]')).toBe(0);
    expect(countMissingPlaceholders('[To be confirmed: x] [TO BE CONFIRMED: y]')).toBe(0);
    expect(countMissingPlaceholders('[to be confirmed: x] {{missing: y}}')).toBe(1);
  });
});

// ── Place 4: present() in check 2 (dropped) ─────────────────────────────────

describe('T-279 place 4: a ledger fact whose display is a {{MISSING}} blank counts as present', () => {
  const factWith = (display: string) => ({
    id: 'f9',
    key: 'witness_name',
    label: 'Witness',
    type: 'person_name',
    value: 'zzz',
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.9,
    required_in_draft: true,
  });
  const dropped = (display: string) =>
    verifyDraft({
      ...inputOf(CLEAN),
      facts: [...S138.ledger.facts, factWith(display)] as never[],
    }).filter((v) => v.check === 'dropped' && v.ledgerKey === 'witness_name');

  it('the control: a real required fact that the draft leaves out is reported as dropped', () => {
    expect(dropped('Bholanath Pandey')).toHaveLength(1);
  });

  it.each([
    '{{MISSING: witness}}',
    '{{missing: witness}}',
    '{{Missing: witness}}',
    '{{ missing : witness}}',
  ])('"%s" is present, so it is not reported as dropped', (display) => {
    expect(dropped(display)).toEqual([]);
  });
});

// ── Place 3: brief-drafter BLANK_LINE in checkOneDocument ───────────────────

describe('T-279 place 3: a whole-line blank is not a C4 "part that may not belong"', () => {
  const SYSTEM: SystemText = {
    before: 'THE HONOURABLE COURT\n\nMOST RESPECTFULLY SHOWETH',
    after: 'PRAYER\n\nIt is prayed that bail be granted.',
    headings: ['PRAYER'],
  };
  const bodyWith = (line: string) =>
    [
      '1. That the applicant was arrested on 12.09.2026.',
      '2. That the applicant has been in custody since 13.09.2026.',
      line,
      '3. That the applicant is the only earning member of his family.',
    ].join('\n\n');
  const warnings = (line: string) => checkOneDocument(bodyWith(line), SYSTEM, 'Bail application');
  const partWarnings = (line: string) =>
    warnings(line).filter((w) => w.message.includes('may not belong'));

  it('the control: a plain bracketed note raises the warning, so the check is live here', () => {
    const w = partWarnings('[a note]');
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain('[a note]');
  });

  it.each([
    '[To be confirmed: x]',
    '[to be confirmed: x]',
    '[To Be Confirmed: x]',
    '[TO BE CONFIRMED: x]',
  ])('"%s" raises no C4, and the line is still in the draft', (line) => {
    expect(warnings(line)).toEqual([]);
    expect(bodyWith(line)).toContain(`\n\n${line}\n\n`);
  });

  it.each(['[Section — verify before filing]', '[Authority — add if relied upon]'])(
    'the exact fixed blank "%s" raises no C4',
    (line) => {
      expect(warnings(line)).toEqual([]);
    },
  );

  it.each([
    '[section — verify before filing]',
    '[authority — add if relied upon]',
    '[a note]',
    '[to be confirmed x]',
  ])('"%s" (not a blank) still raises the warning, as before', (line) => {
    const w = partWarnings(line);
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain(line);
  });
});
