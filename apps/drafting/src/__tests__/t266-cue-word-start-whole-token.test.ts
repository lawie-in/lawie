/**
 * T-266 (Ajay, 12 Oct 2026) — cue matching.
 * AC1: a Latin cue entry matches at the start of a word ("ground" is not in "background").
 * AC2: a FIR number matches as a whole token (no adjacent digit, no "/").
 * AC3: nothing else changes (Devanagari stays a substring; "submitted" stays weak).
 *
 * Pure tests of findMissingClauses, driven the way t200-missing-clause-check.test.ts does.
 */
import { CLAUSES_MARKER, findMissingClauses, splitDrafterOutput } from '../services/brief-drafter';
import type { Brief } from '../services/intake-brief';
import { loadRulePack, RulePack, RulePackClause } from '../services/rule-pack.service';

function clause(id: string): RulePackClause {
  return {
    id,
    title: `Title of ${id}`,
    detail: null,
    fixedText: null,
    required: true,
    appliesWhen: null,
    statutoryBasis: null,
    parts: [],
    extra: {},
  };
}

const BASE = loadRulePack('bail_regular') as RulePack;

const briefWithFir = (value: string, placeholder?: string): Brief =>
  ({
    items: [{ key: 'fir_number', value, ...(placeholder ? { placeholder } : {}) }],
    still_unknown: [],
  }) as unknown as Brief;

/** The reasons for one clause of the real-id bail_regular pack, reported at paragraph 1. */
function reasons(id: string, text: string, brief?: Brief, packId = 'bail_regular') {
  const pack: RulePack = { ...BASE, id: packId, mandatoryClauses: [clause(id)] };
  const out = splitDrafterOutput(`1. ${text}\n\n${CLAUSES_MARKER}\n${id}: 1`);
  return findMissingClauses(pack, out, [], { brief }).map((m) => m.reason);
}
const MISSING = ['clause_not_in_paragraph'];

const custody = (t: string) => reasons('custody_status', t);
const grounds = (t: string) => reasons('grounds', t);
const undertaking = (t: string) => reasons('no_flight_risk', t);
const earlier = (t: string) => reasons('earlier_applications', t);
const fir = (value: string, t: string) => reasons('fir_details', t, briefWithFir(value));

describe('T-266 AC1: a Latin cue entry matches at the start of a word', () => {
  it('"ground" does not match "background": the grounds clause is reported', () => {
    expect(grounds('The background of the case is set out.')).toEqual(MISSING);
    expect(grounds('Some backgrounds apply.')).toEqual(MISSING);
  });

  it('"ground" matches "ground", "grounds" and "Grounds" (no end boundary, case-insensitive)', () => {
    expect(grounds('That the ground is stated.')).toEqual([]);
    expect(grounds('That the grounds are stated.')).toEqual([]);
    expect(grounds('GROUNDS of bail.')).toEqual([]);
    expect(grounds('Groundless claims.')).toEqual([]);
  });

  it('"jail" does not match "injail"; "arrest" does not match "unarrested"', () => {
    expect(custody('He was injail.')).toEqual(MISSING);
    expect(custody('He remains unarrested.')).toEqual(MISSING);
    expect(custody('He is in jail.')).toEqual([]);
    expect(custody('He was arrested on 3 March.')).toEqual([]);
  });

  it('a digit before the entry also stops a match', () => {
    expect(custody('Item 9jail noted.')).toEqual(MISSING);
  });

  it('"undertak" still matches "undertaking" and "undertakes"', () => {
    expect(undertaking('He gives an undertaking to the Court.')).toEqual([]);
    expect(undertaking('He undertakes to appear.')).toEqual([]);
    expect(undertaking('He gave a counterundertaking.')).toEqual(MISSING);
  });

  it('a word start after "-", "[", "(", a quote, or the start of the paragraph still matches', () => {
    expect(grounds('pre-ground work')).toEqual([]);
    expect(grounds('[ground] one')).toEqual([]);
    expect(grounds('(grounds) one')).toEqual([]);
    expect(grounds('"grounds" one')).toEqual([]);
    expect(grounds('grounds are these')).toEqual([]);
    expect(custody('arrest memo')).toEqual([]);
  });

  it('a multi-word entry matches case-insensitively with extra spaces and line breaks', () => {
    expect(earlier('To be confirmed:   whether any EARLIER  bail application was filed.')).toEqual(
      [],
    );
    expect(earlier('To be confirmed:\nwhether any earlier\nbail application was filed.')).toEqual(
      [],
    );
  });

  it('the earlier-application list entries are word-start too', () => {
    expect(earlier('Bail is sought. It is a preprior matter.')).toEqual(MISSING);
    expect(earlier('Bail is sought. A prior matter exists.')).toEqual([]);
    expect(earlier('Bail is sought. The earlier matter was heard.')).toEqual([]);
  });

  it('works the same on the other packs that carry the cue', () => {
    expect(reasons('grounds', 'The background.', undefined, 'bail_before_magistrate')).toEqual(
      MISSING,
    );
    expect(reasons('grounds', 'The grounds.', undefined, 'bail_before_magistrate')).toEqual([]);
    expect(reasons('custody', 'He is injail.', undefined, 'bail_before_magistrate')).toEqual(
      MISSING,
    );
    expect(reasons('undertakings', 'An undertaking.', undefined, 'interim_bail')).toEqual([]);
  });
});

describe('T-266 AC2: a FIR number matches as a whole token', () => {
  it('FIR "12": a date, "112" or "123" alone is reported missing', () => {
    expect(fir('12', 'Registered on 12/03/2026.')).toEqual(MISSING);
    expect(fir('12', 'Registered on 03/12/2026.')).toEqual(MISSING);
    expect(fir('12', 'FIR No. 112 was registered.')).toEqual(MISSING);
    expect(fir('12', 'FIR No. 123 was registered.')).toEqual(MISSING);
  });

  it('FIR "12" as its own token matches, also before a comma, a full stop or the end', () => {
    expect(fir('12', 'FIR No. 12 was registered.')).toEqual([]);
    expect(fir('12', 'FIR No. 12, registered.')).toEqual([]);
    expect(fir('12', 'registered as FIR No. 12.')).toEqual([]);
    expect(fir('12', '12')).toEqual([]);
    expect(fir('12', '(12) registered')).toEqual([]);
  });

  it('FIR "124/2026" matches as a whole token', () => {
    expect(fir('124/2026', 'FIR No. 124/2026 was registered.')).toEqual([]);
    expect(fir('124/2026', 'FIR No. 124/2026, registered.')).toEqual([]);
    expect(fir('124/2026', 'FIR No. 124/2026.')).toEqual([]);
  });

  it('FIR "124/2026" does not match inside "1124/2026", "124/20267" or "124/2026/1"', () => {
    expect(fir('124/2026', 'FIR No. 1124/2026 was registered.')).toEqual(MISSING);
    expect(fir('124/2026', 'FIR No. 124/20267 was registered.')).toEqual(MISSING);
    expect(fir('124/2026', 'FIR No. 124/2026/1 was registered.')).toEqual(MISSING);
    expect(fir('124/2026', 'FIR No. 5/124/2026 was registered.')).toEqual(MISSING);
  });

  it('a clean match elsewhere in the paragraph is enough', () => {
    expect(fir('12', 'On 12/03/2026 FIR No. 12 was registered.')).toEqual([]);
  });

  it('the FIR value is matched literally, not as a pattern', () => {
    expect(fir('1.2', 'FIR No. 1x2 was registered.')).toEqual(MISSING);
    expect(fir('1.2', 'FIR No. 1.2 was registered.')).toEqual([]);
    expect(fir('1+2', 'FIR No. 1+2 was registered.')).toEqual([]);
  });

  it('the FIR cue works the same on the other packs', () => {
    const b = briefWithFir('12');
    expect(reasons('fir_details', 'On 12/03/2026.', b, 'bail_anticipatory')).toEqual(MISSING);
    expect(reasons('fir_details', 'FIR 12 filed.', b, 'bail_anticipatory')).toEqual([]);
    expect(reasons('fir_particulars', 'On 12/03/2026.', b, 'bail_before_magistrate')).toEqual(
      MISSING,
    );
    expect(reasons('fir_particulars', 'FIR 12 filed.', b, 'bail_before_magistrate')).toEqual([]);
  });

  it('an unknown FIR still matches its own blank placeholder text (intended)', () => {
    const b = briefWithFir('', '[FIR number]');
    expect(reasons('fir_details', 'That FIR [FIR number] was registered.', b)).toEqual([]);
    expect(reasons('fir_details', 'That FIR was registered.', b)).toEqual(MISSING);
  });

  it('an empty or blank value never matches, and neither does a missing brief', () => {
    expect(fir('', 'FIR No. 124/2026 was registered.')).toEqual(MISSING);
    expect(fir('   ', 'Any text at all.')).toEqual(MISSING);
    expect(reasons('fir_details', 'FIR No. 124/2026 registered.')).toEqual(MISSING);
  });
});

describe('T-266 AC3: nothing else changes', () => {
  it('Devanagari custody cues still match as substrings, both spellings of गिरफ्तार', () => {
    expect(custody('आवेदक को गिरफ़्तार किया गया।')).toEqual([]);
    expect(custody('आवेदक को गिरफ्तार किया गया।')).toEqual([]);
    expect(custody('वह हिरासत में है।')).toEqual([]);
    expect(custody('उसकी अभिरक्षा जारी है।')).toEqual([]);
    expect(custody('वह जेल में है।')).toEqual([]);
    expect(custody('आवेदक एक नागरिक है।')).toEqual(MISSING);
  });

  it('a Devanagari cue inside a longer word still matches (the old behaviour is kept)', () => {
    expect(custody('वह पुलिसहिरासतकक्ष में है।')).toEqual([]);
    expect(custody('वह जेलखाना में है।')).toEqual([]);
    expect(grounds('यहआधारहीन नहीं है।')).toEqual([]);
  });

  it('a Devanagari cue next to Latin letters or digits still matches', () => {
    expect(custody('abcजेल9')).toEqual([]);
  });

  it('Devanagari grounds, undertaking and earlier-application cues still match', () => {
    expect(grounds('निवेदन है कि जमानत दी जाए।')).toEqual([]);
    expect(grounds('आधार ये हैं।')).toEqual([]);
    expect(undertaking('आवेदक आश्वासन देता है।')).toEqual([]);
    expect(undertaking('आवेदक वचन देता है।')).toEqual([]);
    expect(earlier('पूर्व में कोई जमानत आवेदन नहीं।')).toEqual([]);
    expect(earlier('पूर्व में कोई आवेदन नहीं।')).toEqual(MISSING);
  });

  it('"submitted" stays a (weak) grounds cue', () => {
    expect(grounds('It is respectfully submitted.')).toEqual([]);
    expect(grounds('Submitted for consideration.')).toEqual([]);
    expect(grounds('The papers were resubmitted.')).toEqual(MISSING);
  });

  it('"before" is unchanged: still an earlier-application cue when "bail" is present (T-241 drops it)', () => {
    expect(earlier("Bail is sought before this Hon'ble Court.")).toEqual([]);
    expect(earlier('Bail is sought. It was heard beforehand.')).toEqual([]);
    expect(earlier('Bail is sought. It was unbefore the Court.')).toEqual(MISSING);
  });

  it('"before" is not a cue on the standard (anticipatory, magistrate) lists', () => {
    expect(
      reasons(
        'earlier_applications',
        'Bail is sought before this Court.',
        undefined,
        'bail_anticipatory',
      ),
    ).toEqual(MISSING);
  });
});
