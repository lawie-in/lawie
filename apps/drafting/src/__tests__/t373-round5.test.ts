/**
 * T-373 round 5 (commit 3e30746), no database, no model:
 *  - sameAsRawSpan: the advocate's own words, folded, are never a fallback
 *  - amountsInText: sums of money by value (Indian or international grouping)
 *  - statedByValueIn: the one shared rule for a date or amount the advocate wrote
 *  - keepsToFact end to end: a verbatim amount and date are kept, a changed amount falls back
 *  - stripPoliceStationPrefix and the renderer's police_station slot (the ledger keeps the raw words)
 */
import './setupEnv';

import type { LedgerFact } from '@lawie/shared';

import {
  amountsInText,
  DraftParagraphsOutput,
  packOptionIds,
  POLICE_STATION_PREFIXES,
  renderDraft,
  sameAsRawSpan,
  skeletonValueLists,
  statedByValueIn,
  stripPoliceStationPrefix,
} from '../services/draft-renderer';
import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { fact, loadFixtureSkeleton, PackId, regularBase } from './fixtures/t373';

function render(packId: PackId, facts: LedgerFact[], texts: Record<string, string> = {}) {
  const pack = loadRulePack(packId)!;
  const skeleton = loadFixtureSkeleton(packId);
  const lists = loadAvermentLists(packId);
  const held = new Set(facts.map((f) => f.key));
  const output: DraftParagraphsOutput = {
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
          texts[c.id] ??
          (c.source === 'advocate' && c.slot
            ? (facts.find((f) => f.key === c.slot)?.display ?? '')
            : ''),
        items: [],
      };
    }),
  };
  const result = renderDraft({
    skeleton,
    output,
    facts,
    labels: Object.fromEntries(buildChecklist(pack).map((i) => [i.key, i.label])),
    clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
    optionIds: packOptionIds(pack.facts),
    valueLists: skeletonValueLists(skeleton, lists),
    verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
  });
  const status = (id: string): string | undefined =>
    result.rendered.find((r) => r.clauseId === id)?.status;
  const text = (id: string): string | undefined =>
    result.paragraphs.find((p) => p.clauseId === id)?.text;
  return { result, status, text };
}

const withNarrative = (raw: string, display = raw): LedgerFact[] => [
  ...regularBase().filter((f) => f.key !== 'facts_narrative'),
  fact('facts_narrative', display, { raw_span: raw }),
];

// ── sameAsRawSpan ───────────────────────────────────────────────────────────

describe('round 5: sameAsRawSpan', () => {
  const RAW = 'He is accused in a civil dispute, of 2 Mar 2025.';
  it('the same words are the same', () => {
    expect(sameAsRawSpan(RAW, RAW)).toBe(true);
  });
  it.each([
    ['case', 'HE IS ACCUSED IN A CIVIL DISPUTE, OF 2 MAR 2025.'],
    ['spacing', '  He   is accused\n in a civil dispute,   of 2 Mar 2025. '],
    ['punctuation', 'He is accused in a civil dispute of 2 Mar 2025'],
    [
      'curly punctuation and a full stop swapped',
      'He is accused in a civil dispute; of 2 Mar 2025!',
    ],
  ])('folds %s', (_k, text) => {
    expect(sameAsRawSpan(text, RAW)).toBe(true);
  });
  it('a different word, number or order is not the same', () => {
    expect(sameAsRawSpan('He is accused in a civil dispute, of 3 Mar 2025.', RAW)).toBe(false);
    expect(sameAsRawSpan('He is accused in a criminal dispute, of 2 Mar 2025.', RAW)).toBe(false);
    expect(sameAsRawSpan('Of 2 Mar 2025, he is accused in a civil dispute.', RAW)).toBe(false);
    expect(sameAsRawSpan(`${RAW} He is poor.`, RAW)).toBe(false);
  });
  it('empty text, or punctuation only, is never the same, even against an empty raw_span', () => {
    expect(sameAsRawSpan('', '')).toBe(false);
    expect(sameAsRawSpan('...', '!!')).toBe(false);
    expect(sameAsRawSpan('', RAW)).toBe(false);
  });
  it('end to end: the advocate words returned as given are ok, no fallback, whatever the banned list says', () => {
    // A bare restatement is printed first, before the verifier or the entity checks run.
    const raw = 'He is accused in a dispute that is civil, of 2 Mar 2025.';
    const { status, result, text } = render('bail_regular', withNarrative(raw), {
      facts: 'he is accused in a dispute that is civil, of 2 mar 2025',
    });
    expect(status('facts')).toBe('ok');
    expect(result.fallbacks).toEqual([]);
    expect(text('facts')).toContain('he is accused in a dispute that is civil, of 2 mar 2025');
  });
});

// ── amountsInText ───────────────────────────────────────────────────────────

describe('round 5: amountsInText', () => {
  it.each([
    ['Rs 8,00,000', [800000]],
    ['Rs 800000', [800000]],
    ['Rs. 8,00,000', [800000]],
    ['₹8,00,000', [800000]],
    ['₹ 8,00,000', [800000]],
    ['INR 8,00,000', [800000]],
    ['inr 800000', [800000]],
    ['rs 800,000', [800000]],
    ['Rs 8,00,000.50', [800000.5]],
    ['He paid Rs 50,000 and then Rs 1,25,000 more.', [50000, 125000]],
  ])('%s', (text, want) => {
    expect(amountsInText(text)).toEqual(want);
  });

  it('Indian, plain and international grouping of one sum are the same value', () => {
    const a = amountsInText('Rs 8,00,000')[0];
    expect(amountsInText('Rs 800000')[0]).toBe(a);
    expect(amountsInText('₹8,00,000')[0]).toBe(a);
    expect(amountsInText('INR 800,000')[0]).toBe(a);
  });
  it('a changed amount differs', () => {
    expect(amountsInText('Rs 9,00,000')[0]).not.toBe(amountsInText('Rs 8,00,000')[0]);
    expect(amountsInText('Rs 80,000')[0]).not.toBe(amountsInText('Rs 8,00,000')[0]);
  });
  it('a figure with no currency marker, or a word that merely ends in rs, is not an amount', () => {
    expect(amountsInText('8,00,000')).toEqual([]);
    expect(amountsInText('He is 34 years old')).toEqual([]);
    expect(amountsInText('the doors 500 metres away')).toEqual([]);
    expect(amountsInText('')).toEqual([]);
  });
});

// ── statedByValueIn ─────────────────────────────────────────────────────────

describe('round 5: statedByValueIn', () => {
  type Finding = Parameters<ReturnType<typeof statedByValueIn>>[0];
  const amount = (draftValue: string | null): Finding => ({
    check: 'unsupported',
    entityType: 'amount',
    draftValue,
  });
  const date = (draftValue: string | null): Finding => ({
    check: 'unsupported',
    entityType: 'date',
    draftValue,
  });

  it('an amount the raw_span states, by value, is stated', () => {
    const stated = statedByValueIn(['He paid Rs 8,00,000 to the seller.']);
    expect(stated(amount('Rs 8,00,000'))).toBe(true);
    expect(stated(amount('Rs 800000'))).toBe(true);
    expect(stated(amount('₹8,00,000'))).toBe(true);
  });
  it('a date the raw_span states, by value, is stated', () => {
    const stated = statedByValueIn(['The deal of 2 Mar 2025 failed.']);
    expect(stated(date('2 March 2025'))).toBe(true);
    expect(stated(date('2nd March 2025'))).toBe(true);
  });
  it('all values in the raw_spans: true; one that is not: false', () => {
    const stated = statedByValueIn(['Rs 50,000 on 2 Mar 2025', 'Rs 1,25,000 on 5 May 2026']);
    expect(stated(amount('Rs 50,000 and Rs 1,25,000'))).toBe(true);
    expect(stated(amount('Rs 50,000 and Rs 2,00,000'))).toBe(false);
    expect(stated(date('2 March 2025 and 5 May 2026'))).toBe(true);
    expect(stated(date('2 March 2025 and 6 May 2026'))).toBe(false);
  });
  it('the spans are pooled: a value in any one of the raw_spans counts', () => {
    const stated = statedByValueIn(['no figures here', 'Rs 7,00,000']);
    expect(stated(amount('Rs 700000'))).toBe(true);
  });
  it('a changed amount or date is not stated', () => {
    const stated = statedByValueIn(['Rs 8,00,000 on 2 Mar 2025']);
    expect(stated(amount('Rs 9,00,000'))).toBe(false);
    expect(stated(date('3 March 2025'))).toBe(false);
  });
  it('a finding that is not an unsupported date or amount is never stated', () => {
    const stated = statedByValueIn(['Rs 8,00,000 on 2 Mar 2025 by Suresh']);
    expect(stated({ check: 'unsupported', entityType: 'name', draftValue: 'Suresh' })).toBe(false);
    expect(stated({ check: 'unsupported', entityType: 'phrase', draftValue: 'Rs 8,00,000' })).toBe(
      false,
    );
    expect(stated({ check: 'mutation', entityType: 'amount', draftValue: 'Rs 8,00,000' })).toBe(
      false,
    );
    expect(stated({ check: 'banned', entityType: 'date', draftValue: '2 March 2025' })).toBe(false);
    expect(stated({ check: 'dropped', entityType: 'amount', draftValue: 'Rs 8,00,000' })).toBe(
      false,
    );
  });
  it('no draftValue, or a draftValue with no date or amount in it, is not stated', () => {
    const stated = statedByValueIn(['Rs 8,00,000 on 2 Mar 2025']);
    expect(stated(amount(null))).toBe(false);
    expect(stated(amount(''))).toBe(false);
    expect(stated(amount('a large sum'))).toBe(false);
    expect(stated(date('some day'))).toBe(false);
  });
  it('no raw_spans at all: nothing is stated', () => {
    expect(statedByValueIn([])(amount('Rs 8,00,000'))).toBe(false);
    expect(statedByValueIn([''])(date('2 March 2025'))).toBe(false);
  });
});

// ── keepsToFact through the renderer ────────────────────────────────────────

describe("round 5: keepsToFact keeps the advocate's own amount and date", () => {
  const RAW =
    'He is accused in a civil dispute: he paid Rs 8,00,000 to the seller on 2 Mar 2025 and the deal failed.';

  it('a rephrase with the same amount and date (the date in the full month) is ok', () => {
    const { status, result, text } = render('bail_regular', withNarrative(RAW), {
      facts:
        'He is accused in a civil dispute, in which he paid Rs 8,00,000 to the seller on 2 March 2025 and the deal failed.',
    });
    expect(status('facts')).toBe('ok');
    expect(result.fallbacks).toEqual([]);
    expect(text('facts')).toContain('Rs 8,00,000');
  });
  it('FINDING (pinned, conservative): the same amount regrouped as Rs 800000 still falls back, because ownWordsAlteredEntity compares digits as text; statedByValueIn alone would accept it', () => {
    const { status, result } = render('bail_regular', withNarrative(RAW), {
      facts:
        'He is accused in a civil dispute, in which he paid Rs 800000 to the seller on 2 March 2025 and the deal failed.',
    });
    expect(status('facts')).toBe('fallback');
    expect(result.fallbacks).toEqual([{ clauseId: 'facts', reason: 'unverified' }]);
  });
  it('the amount in rupee-sign form is kept', () => {
    const { status } = render('bail_regular', withNarrative(RAW), {
      facts:
        'He is accused in a civil dispute where he paid ₹8,00,000 to the seller on 2 March 2025 and the deal failed.',
    });
    expect(status('facts')).toBe('ok');
  });
  it('a changed amount falls back to the raw_span, verbatim', () => {
    const { status, result, text } = render('bail_regular', withNarrative(RAW), {
      facts:
        'He is accused in a civil dispute, in which he paid Rs 9,00,000 to the seller on 2 March 2025 and the deal failed.',
    });
    expect(status('facts')).toBe('fallback');
    expect(result.fallbacks).toEqual([{ clauseId: 'facts', reason: 'unverified' }]);
    expect(text('facts')).toContain(RAW);
    expect(text('facts')).not.toContain('9,00,000');
  });
  it('an amount added that the raw_span never stated falls back', () => {
    const { status } = render('bail_regular', withNarrative(RAW), {
      facts:
        'He is accused in a civil dispute: he paid Rs 8,00,000 to the seller on 2 March 2025, and a further Rs 50,000 later, and the deal failed.',
    });
    expect(status('facts')).toBe('fallback');
  });
  it('a changed date beside a kept amount falls back', () => {
    const { status } = render('bail_regular', withNarrative(RAW), {
      facts:
        'He is accused in a civil dispute, in which he paid Rs 8,00,000 to the seller on 3 March 2025 and the deal failed.',
    });
    expect(status('facts')).toBe('fallback');
  });
});

// ── Police station prefix ───────────────────────────────────────────────────

describe('round 5: stripPoliceStationPrefix', () => {
  it.each([
    ['PS Kadamkuan', 'Kadamkuan'],
    ['ps kadamkuan', 'kadamkuan'],
    ['P.S. Kadamkuan', 'Kadamkuan'],
    ['P S Kadamkuan', 'Kadamkuan'],
    ['P.S Kadamkuan', 'Kadamkuan'],
    ['Police Station Kadamkuan', 'Kadamkuan'],
    ['POLICE STATION KADAMKUAN', 'KADAMKUAN'],
    ['police station: Hazratganj', 'Hazratganj'],
    ['Police Station - Hazratganj', 'Hazratganj'],
    ['Thana-Kotwali', 'Kotwali'],
    ['Thana Kotwali', 'Kotwali'],
    ['  PS   Gomti Nagar  ', 'Gomti Nagar'],
    ['PS: Sherghati', 'Sherghati'],
  ])('%j -> %j', (input, want) => {
    expect(stripPoliceStationPrefix(input)).toBe(want);
  });

  it.each([
    ['Kadamkuan'],
    ['Gomti Nagar'],
    ['Psalm Nagar'],
    ['Pskov Road'],
    ['Station Road'],
    ['Police Colony'],
    ['Thanabhawan'],
    ['PSKadamkuan'],
  ])('%j is left as it is', (input) => {
    expect(stripPoliceStationPrefix(input)).toBe(input);
  });

  it('a bare prefix with no name after it is left (nothing to print instead)', () => {
    expect(stripPoliceStationPrefix('PS')).toBe('PS');
    expect(stripPoliceStationPrefix('Police Station')).toBe('Police Station');
    expect(stripPoliceStationPrefix('P.S.')).toBe('P.S.');
  });
  it('every label is removed (T-500)', () => {
    // Ajay AJ-500-M1 / T-500: labels are removed as often as they are there, so the name is left alone.
    expect(stripPoliceStationPrefix('PS PS Kadamkuan')).toBe('Kadamkuan');
  });
  it('the prefix data is the four forms', () => {
    expect(POLICE_STATION_PREFIXES.map((w) => w.join(' '))).toEqual([
      'police station',
      'p s',
      'ps',
      'thana',
    ]);
  });
});

describe('round 5: the renderer fills police_station stripped, the ledger keeps the raw words', () => {
  const stationFacts = (display: string): LedgerFact[] => [
    ...regularBase().filter((f) => f.key !== 'police_station'),
    fact('police_station', display, { type: 'police_station' }),
  ];

  it.each([
    ['PS Kadamkuan', 'Kadamkuan'],
    ['P.S. Kadamkuan', 'Kadamkuan'],
    ['Police Station Kadamkuan', 'Kadamkuan'],
    ['Thana-Kotwali', 'Kotwali'],
    ['Kotwali', 'Kotwali'],
  ])('%j prints as "Police Station %s", never doubled', (display, printed) => {
    const facts = stationFacts(display);
    const before = JSON.stringify(facts);
    const { result } = render('bail_regular', facts);
    expect(result.body).toContain(`Police Station ${printed}`);
    expect(result.body).not.toMatch(/Police Station\s+(?:PS|P\.S\.?|Police Station|Thana)\b/i);
    // The renderer never writes back: the ledger facts still hold what the advocate said.
    expect(JSON.stringify(facts)).toBe(before);
    expect(facts.find((f) => f.key === 'police_station')!.display).toBe(display);
  });

  it('a name that only starts like a prefix prints whole', () => {
    const { result } = render('bail_regular', stationFacts('Psalm Nagar'));
    expect(result.body).toContain('Police Station Psalm Nagar');
  });
});
