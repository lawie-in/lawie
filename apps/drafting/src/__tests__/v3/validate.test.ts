/**
 * T-683 phase 1: services/v3/validate.ts, Ajay's test list (run5-rulings-ajay.md,
 * "T-683: v3 Extractor, complete rule") on real packs. Pure: no model, no DB.
 * Fictional data only ("Sample Person" names).
 */
import { CONFIDENCE_FLOORS } from '@lawie/shared';

import { buildChecklist, ChecklistItem } from '../../services/intake-brief';
import { loadRulePack } from '../../services/rule-pack.service';
import {
  findQuote,
  isDerivedKey,
  QUOTE_MAX,
  validateExtraction,
  ValidateAnswer,
} from '../../services/v3/validate';

const TODAY = '2026-10-29';

const checklistCache = new Map<string, ChecklistItem[]>();
function checklist(packId: string): ChecklistItem[] {
  let c = checklistCache.get(packId);
  if (!c) {
    const pack = loadRulePack(packId);
    if (!pack) throw new Error(`no pack ${packId}`);
    c = buildChecklist(pack);
    checklistCache.set(packId, c);
  }
  return c;
}

interface F {
  key: string;
  value: unknown;
  quote: string;
  confidence?: number;
  source?: 'description' | 'answer';
  turn?: number;
}

const fact = (f: F) => ({
  key: f.key,
  source: f.source ?? 'description',
  turn: f.turn ?? 0,
  quote: f.quote,
  value: f.value,
  confidence: 'confidence' in f ? f.confidence : 0.95,
});

function run(
  packId: string,
  model: { facts?: F[]; non_answers?: F[]; unresolved?: string[] },
  ctx: { description?: string; answers?: ValidateAnswer[]; checklist?: ChecklistItem[] } = {},
) {
  return validateExtraction(
    {
      facts: (model.facts ?? []).map(fact),
      non_answers: (model.non_answers ?? []).map(fact),
      unresolved: model.unresolved ?? [],
    },
    {
      checklist: ctx.checklist ?? checklist(packId),
      description: ctx.description ?? '',
      answers: ctx.answers ?? [],
      today: TODAY,
    },
  );
}

const valueOf = (out: ReturnType<typeof run>, key: string) =>
  out.result.candidates.find((c) => c.key === key)?.value;

describe('T-683 validate: Anushka run-5 Hinglish bail inputs (T-676 AC1, AC2)', () => {
  const answers: ValidateAnswer[] = [
    {
      turn: 1,
      askedKeys: ['antecedents', 'recovery_status', 'dependants', 'police_station'],
      text: 'Pehle koi criminal case? नहीं. Koi recovery nahi hui. ek chhota bachcha hai. थाना Govindpura',
    },
  ];

  it('reads each as an English fact, with the user quote kept apart from the value', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'antecedents',
            value: 'The applicant has no previous criminal case.',
            quote: 'Pehle koi criminal case? नहीं.',
            source: 'answer',
            turn: 1,
          },
          {
            key: 'recovery_status',
            value: 'No recovery was made from the applicant.',
            quote: 'Koi recovery nahi hui',
            source: 'answer',
            turn: 1,
          },
          {
            key: 'dependants',
            value: 'The applicant has one small child.',
            quote: 'ek chhota bachcha hai',
            source: 'answer',
            turn: 1,
          },
        ],
      },
      { answers },
    );
    expect(valueOf(out, 'antecedents')).toBe('The applicant has no previous criminal case.');
    expect(valueOf(out, 'recovery_status')).toBe('No recovery was made from the applicant.');
    expect(valueOf(out, 'dependants')).toBe('The applicant has one small child.');
    const q = out.result.candidates.find((c) => c.key === 'antecedents')!;
    expect(q.source).toEqual({ kind: 'answer', turn: 1, quote: 'Pehle koi criminal case? नहीं.' });
    // The Devanagari never reaches the value.
    for (const c of out.result.candidates) expect(String(c.value)).not.toMatch(/[ऀ-ॿ]/u);
  });

  it('rejects a value that copies the Devanagari raw', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'antecedents',
            value: 'Pehle koi criminal case? नहीं.',
            quote: 'Pehle koi criminal case? नहीं.',
            source: 'answer',
            turn: 1,
          },
        ],
      },
      { answers },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.bad_value).toBe(1);
    expect(out.result.unresolved).toContain('antecedents');
  });

  it('a bare नहीं on an optional-when-present key is a non-answer (no fact)', () => {
    const items = checklist('bail_regular');
    expect(items.find((i) => i.key === 'dependants')?.askWhenEmpty).toBe(true);
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'dependants',
            value: 'No dependants.',
            quote: 'नहीं',
            source: 'answer',
            turn: 2,
          },
        ],
      },
      { answers: [{ turn: 2, askedKeys: ['dependants'], text: 'नहीं' }] },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.nonAnswers).toEqual([{ key: 'dependants', quote: 'नहीं' }]);
  });
});

describe('T-683 validate: police station (T-612 (6))', () => {
  const text = 'थाना Govindpura';
  const ans: ValidateAnswer[] = [{ turn: 1, askedKeys: ['police_station'], text }];

  it('a Devanagari station marker is cleaned: थाना X gives X', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'police_station',
            value: 'Thana: Govindpura',
            quote: text,
            source: 'answer',
            turn: 1,
          },
        ],
      },
      { answers: ans },
    );
    expect(valueOf(out, 'police_station')).toBe('Govindpura');
  });

  it('the plain station name is kept as given', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          { key: 'police_station', value: 'Govindpura', quote: text, source: 'answer', turn: 1 },
        ],
      },
      { answers: ans },
    );
    expect(valueOf(out, 'police_station')).toBe('Govindpura');
  });

  it('"Police Station" and "PS" markers on the model value are stripped once', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'police_station',
            value: 'Govindpura Police Station',
            quote: 'Govindpura Police Station',
            source: 'description',
          },
        ],
      },
      { description: 'FIR lodged at Govindpura Police Station on 02.03.2026.' },
    );
    expect(valueOf(out, 'police_station')).toBe('Govindpura');
  });

  it('a Devanagari value is never kept (transliterate, never copy)', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          { key: 'police_station', value: 'गोविंदपुरा', quote: text, source: 'answer', turn: 1 },
        ],
      },
      { answers: ans },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.unresolved).toContain('police_station');
  });

  it('पता नहीं for the police station is a non-answer, not a fact', () => {
    const out = run(
      'bail_regular',
      {
        non_answers: [
          { key: 'police_station', value: null, quote: 'पता नहीं', source: 'answer', turn: 3 },
        ],
      },
      { answers: [{ turn: 3, askedKeys: ['police_station'], text: 'पता नहीं' }] },
    );
    expect(out.result.nonAnswers).toEqual([{ key: 'police_station', quote: 'पता नहीं' }]);
    expect(out.result.candidates).toEqual([]);
  });
});

describe('T-683 validate: dates (day-first ISO; ambiguous gives no fact)', () => {
  const key = 'arrest_date';

  it('a day-first Indian date gives ISO', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key, value: '2026-03-05', quote: 'arrested on 05.03.2026' }] },
      { description: 'The applicant was arrested on 05.03.2026 and remains in jail.' },
    );
    expect(valueOf(out, key)).toBe('2026-03-05');
  });

  it('a bare day-first date with slashes gives ISO, not month-first', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key, value: '2026-03-05', quote: '05/03/2026' }] },
      { description: 'Arrest date 05/03/2026 per memo.' },
    );
    expect(valueOf(out, key)).toBe('2026-03-05');
    const wrong = run(
      'bail_regular',
      { facts: [{ key, value: '2026-05-03', quote: '05/03/2026' }] },
      { description: 'Arrest date 05/03/2026 per memo.' },
    );
    expect(wrong.result.candidates).toEqual([]);
  });

  it('a two-digit year gives no fact, and the key goes to unresolved', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key, value: '2026-03-12', quote: '12/3/26' }] },
      { description: 'He was arrested on 12/3/26 by the police.' },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.unresolved).toEqual([key]);
    expect(out.dropped.bad_value).toBe(1);
  });

  it('a date with no year gives no fact', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key, value: '2026-03-12', quote: '12 March' }] },
      { description: 'He was arrested on 12 March near the bus stand.' },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.unresolved).toEqual([key]);
  });

  it('a date in words with a year inside a longer quote is read', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key, value: '2026-03-12', quote: 'arrested on 12 March 2026' }] },
      { description: 'He was arrested on 12 March 2026 near the bus stand.' },
    );
    expect(valueOf(out, key)).toBe('2026-03-12');
  });

  it('a year the quote does not hold is rejected even inside a longer quote', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key, value: '2026-03-12', quote: 'arrested on 12 March' }] },
      { description: 'He was arrested on 12 March near the bus stand.' },
    );
    expect(out.result.candidates).toEqual([]);
  });

  it('a date in 2099 is rejected (range): a past-event date after today', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key, value: '2099-03-05', quote: '05.03.2099' }] },
      { description: 'Arrest date 05.03.2099 as noted.' },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.bad_value).toBe(1);
  });

  it('a non-ISO model date and an impossible day are rejected', () => {
    const a = run(
      'bail_regular',
      { facts: [{ key, value: '05.03.2026', quote: '05.03.2026' }] },
      { description: 'Arrest date 05.03.2026.' },
    );
    expect(a.result.candidates).toEqual([]);
    const b = run(
      'bail_regular',
      { facts: [{ key, value: '2026-02-31', quote: '31.02.2026' }] },
      { description: 'Arrest date 31.02.2026.' },
    );
    expect(b.result.candidates).toEqual([]);
  });
});

describe('T-683 validate: amounts (rupees; words read by code, P3)', () => {
  const key = 'cheque_amount';

  it('an amount in words gives rupees', () => {
    const out = run(
      'legal_notice_s138',
      { facts: [{ key, value: 300000, quote: 'teen lakh rupees' }] },
      { description: 'The drawer issued a cheque for teen lakh rupees to my client.' },
    );
    expect(valueOf(out, key)).toBe(300000);
    expect(out.result.candidates[0].type).toBe('money');
  });

  it('a figure with Indian grouping gives rupees', () => {
    const out = run(
      'legal_notice_s138',
      { facts: [{ key, value: 300000, quote: 'Rs 3,00,000' }] },
      { description: 'Cheque for Rs 3,00,000 was dishonoured.' },
    );
    expect(valueOf(out, key)).toBe(300000);
  });

  it('a figure the quote does not give is rejected (model arithmetic)', () => {
    const out = run(
      'legal_notice_s138',
      { facts: [{ key, value: 350000, quote: 'teen lakh rupees' }] },
      { description: 'The drawer issued a cheque for teen lakh rupees to my client.' },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.unresolved).toContain(key);
  });

  it('a negative or zero amount is rejected (range)', () => {
    for (const v of [-300000, 0]) {
      const out = run(
        'legal_notice_s138',
        { facts: [{ key, value: v, quote: 'Rs 3,00,000' }] },
        { description: 'Cheque for Rs 3,00,000 was dishonoured.' },
      );
      expect(out.result.candidates).toEqual([]);
      expect(out.dropped.bad_value).toBe(1);
    }
  });

  it('a non-numeric amount is rejected', () => {
    const out = run(
      'legal_notice_s138',
      { facts: [{ key, value: 'three lakh', quote: 'Rs 3,00,000' }] },
      { description: 'Cheque for Rs 3,00,000 was dishonoured.' },
    );
    expect(out.result.candidates).toEqual([]);
  });
});

describe('T-683 validate: the quote', () => {
  const description = 'Sample Person 1 was arrested on 05.03.2026 at Kotwali and is in jail.';

  it('a quote that is not a substring of the text is rejected, the fact with it', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          { key: 'arrest_date', value: '2026-03-05', quote: 'arrested on 05.03.2026 by the SHO' },
        ],
      },
      { description },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.span_not_found).toBe(1);
  });

  it('a quote taken from another turn than it names is rejected', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'arrest_date',
            value: '2026-03-05',
            quote: 'arrested on 05.03.2026',
            source: 'answer',
            turn: 1,
          },
        ],
      },
      { description, answers: [{ turn: 1, askedKeys: ['arrest_date'], text: 'no idea' }] },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.span_not_found).toBe(1);
  });

  it('an answer turn that does not exist is rejected', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'arrest_date',
            value: '2026-03-05',
            quote: '05.03.2026',
            source: 'answer',
            turn: 9,
          },
        ],
      },
      { description },
    );
    expect(out.dropped.no_source).toBe(1);
  });

  it('whitespace collapse is the only slack', () => {
    const text = 'arrested on\n  05.03.2026 at Kotwali';
    expect(findQuote(text, 'arrested on 05.03.2026')).not.toBeNull();
    expect(findQuote(text, 'ARRESTED on 05.03.2026')).toBeNull();
    expect(findQuote(text, 'arrested on 5.3.2026')).toBeNull();
  });

  it('an NFC quote against NFD text is accepted, and the reverse', () => {
    const nfc = 'थाना कोतवाऩी'; // ऩ composed (U+0929)
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    for (const [text, quote] of [
      [nfd, nfc],
      [nfc, nfd],
    ]) {
      const out = run(
        'bail_regular',
        { facts: [{ key: 'police_station', value: 'Kotwani', quote, source: 'answer', turn: 1 }] },
        { answers: [{ turn: 1, askedKeys: ['police_station'], text }] },
      );
      expect(valueOf(out, 'police_station')).toBe('Kotwani');
      // The stored quote is the NFC form.
      expect(out.result.candidates[0].source.quote).toBe(nfc);
    }
  });

  it('a quote longer than 200 characters is rejected', () => {
    const filler = 'the applicant is a resident of the same locality for many years '.repeat(5);
    const text = `${filler}arrested on 05.03.2026`;
    expect(text.length).toBeGreaterThan(QUOTE_MAX);
    const out = run(
      'bail_regular',
      { facts: [{ key: 'arrest_date', value: '2026-03-05', quote: text }] },
      { description: text },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.quote_too_long).toBe(1);
    expect(findQuote(text, text)).toBeNull();
  });

  it('a quote of exactly 200 characters is allowed', () => {
    const lead = 'x'.repeat(200 - ' arrested on 05.03.2026'.length);
    const quote = `${lead} arrested on 05.03.2026`;
    expect(quote.length).toBe(200);
    expect(findQuote(quote, quote)).toBe(quote);
  });

  it('a missing or empty quote is rejected', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key: 'arrest_date', value: '2026-03-05', quote: '   ' }] },
      { description },
    );
    expect(out.dropped.no_quote).toBe(1);
  });
});

describe('T-683 validate: non-answers (rule 4)', () => {
  it('"Not known" as a defendant goes to nonAnswers {key, quote}, never to a fact', () => {
    const out = run(
      'temporary_injunction_o39',
      {
        facts: [
          {
            key: 'defendant_name',
            value: 'Not known',
            quote: 'Not known',
            source: 'answer',
            turn: 1,
          },
        ],
      },
      { answers: [{ turn: 1, askedKeys: ['defendant_name'], text: 'Not known' }] },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.nonAnswers).toEqual([{ key: 'defendant_name', quote: 'Not known' }]);
  });

  it('a party non-answer with a tail ("Not known (to be traced)") is a non-answer', () => {
    const out = run(
      'temporary_injunction_o39',
      {
        facts: [
          {
            key: 'defendant_name',
            value: 'Not known (to be traced)',
            quote: 'Not known (to be traced)',
            source: 'answer',
            turn: 1,
          },
        ],
      },
      { answers: [{ turn: 1, askedKeys: ['defendant_name'], text: 'Not known (to be traced)' }] },
    );
    expect(out.result.nonAnswers).toEqual([
      { key: 'defendant_name', quote: 'Not known (to be traced)' },
    ]);
    expect(out.result.candidates).toEqual([]);
  });

  it('is never reassigned to another key', () => {
    // The model files the non-answer under a key the user was not asked about.
    const out = run(
      'temporary_injunction_o39',
      {
        non_answers: [
          { key: 'plaintiff_name', value: null, quote: 'Not known', source: 'answer', turn: 1 },
        ],
        facts: [
          {
            key: 'plaintiff_name',
            value: 'Not known',
            quote: 'Not known',
            source: 'answer',
            turn: 1,
          },
        ],
      },
      { answers: [{ turn: 1, askedKeys: ['defendant_name'], text: 'Not known' }] },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.nonAnswers).toEqual([]);
    expect(out.dropped.non_answer_not_asked).toBe(2);
  });

  it('a non-answer the model names that code does not read as one is not recorded', () => {
    const out = run(
      'temporary_injunction_o39',
      {
        non_answers: [
          {
            key: 'defendant_name',
            value: null,
            quote: 'Sample Person 2',
            source: 'answer',
            turn: 1,
          },
        ],
      },
      { answers: [{ turn: 1, askedKeys: ['defendant_name'], text: 'Sample Person 2' }] },
    );
    expect(out.result.nonAnswers).toEqual([]);
    expect(out.dropped.not_a_non_answer).toBe(1);
    expect(out.result.unresolved).toEqual(['defendant_name']);
  });

  it('पता नहीं goes to nonAnswers', () => {
    const out = run(
      'temporary_injunction_o39',
      {
        non_answers: [
          { key: 'defendant_name', value: null, quote: 'पता नहीं', source: 'answer', turn: 2 },
        ],
      },
      { answers: [{ turn: 2, askedKeys: ['defendant_name'], text: 'पता नहीं' }] },
    );
    expect(out.result.nonAnswers).toEqual([{ key: 'defendant_name', quote: 'पता नहीं' }]);
  });

  it('a real name that starts like a non-answer stays a name', () => {
    const out = run(
      'temporary_injunction_o39',
      {
        facts: [
          {
            key: 'defendant_name',
            value: 'Nilesh Sample',
            quote: 'Nilesh Sample',
            source: 'answer',
            turn: 1,
          },
        ],
      },
      { answers: [{ turn: 1, askedKeys: ['defendant_name'], text: 'Nilesh Sample' }] },
    );
    expect(valueOf(out, 'defendant_name')).toBe('Nilesh Sample');
    expect(out.result.nonAnswers).toEqual([]);
  });
});

describe('T-683 validate: restraint sought (O.39, T-613 (j)7(b))', () => {
  it('a restraint described only as past acts gives empty: the model gives nothing, and nothing appears', () => {
    const description =
      'Plaintiff Sample Person 1 sues Sample Person 2. The defendant dug a trench on the plaintiff plot on 02.09.2026 and cut two trees.';
    const out = run(
      'temporary_injunction_o39',
      { facts: [], unresolved: ['restraint_sought'] },
      { description },
    );
    expect(out.result.candidates.find((c) => c.key === 'restraint_sought')).toBeUndefined();
    expect(out.result.unresolved).toEqual(['restraint_sought']);
  });

  it('a stated restraint is kept as an English fact', () => {
    const description =
      'Plaintiff seeks that the defendant be stopped from raising any wall on the plot.';
    const out = run(
      'temporary_injunction_o39',
      {
        facts: [
          {
            key: 'restraint_sought',
            value: 'The defendant be restrained from raising any wall on the plot.',
            quote: 'the defendant be stopped from raising any wall on the plot',
          },
        ],
      },
      { description },
    );
    expect(valueOf(out, 'restraint_sought')).toBe(
      'The defendant be restrained from raising any wall on the plot.',
    );
  });
});

describe('T-683 validate: yes/no (O.39 ex_parte_sought)', () => {
  const key = 'ex_parte_sought';
  const yn = (text: string, value: string) =>
    run(
      'temporary_injunction_o39',
      { facts: [{ key, value, quote: text, source: 'answer', turn: 1 }] },
      { answers: [{ turn: 1, askedKeys: [key], text }] },
    );

  it.each(['नहीं', 'nahi', 'nahin', 'koi nahi', 'Nahi.'])('%s gives No', (text) => {
    expect(valueOf(yn(text, 'no'), key)).toBe('No');
  });

  it.each(['हाँ', 'haan', 'Haan ji'])('%s gives Yes', (text) => {
    expect(valueOf(yn(text, 'yes'), key)).toBe('Yes');
  });

  it('the model cannot flip the signed word: नहीं read as yes gives no fact', () => {
    const out = yn('नहीं', 'yes');
    expect(out.result.candidates).toEqual([]);
    const out2 = yn('haan', 'no');
    expect(out2.result.candidates).toEqual([]);
  });

  it('both a yes word and a no word give no fact', () => {
    const out = yn('haan lekin nahi', 'yes');
    expect(out.result.candidates).toEqual([]);
    expect(out.result.unresolved).toEqual([key]);
  });

  it('a value that is not yes or no is rejected', () => {
    expect(yn('haan', 'maybe').result.candidates).toEqual([]);
  });

  it('a "no" word inside another word does not count', () => {
    // "nahin" inside "nahinahi" is not a signed word; the model reading stands for plain prose.
    const out = yn('nahinahi', 'no');
    expect(out.result.candidates.length === 0 || valueOf(out, key) === 'No').toBe(true);
  });
});

describe('T-683 validate: confidence floors', () => {
  const description = 'FIR number 112/2026 was registered at Kotwali on 05.03.2026.';

  it('0.59 means ask: no fact, key unresolved', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          { key: 'fir_number', value: '112/2026', quote: 'FIR number 112/2026', confidence: 0.59 },
        ],
      },
      { description },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.unresolved).toEqual(['fir_number']);
    expect(out.dropped.low_confidence).toBe(1);
  });

  it('the floor is the higher of 0.6 and the v2 per-type floor: at the floor it is kept, just under it is asked', () => {
    // fir_number is a case number; applicant_occupation is plain text.
    const floorCase = Math.max(0.6, CONFIDENCE_FLOORS.case_number);
    const at = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'fir_number',
            value: '112/2026',
            quote: 'FIR number 112/2026',
            confidence: floorCase,
          },
        ],
      },
      { description },
    );
    expect(valueOf(at, 'fir_number')).toBe('112/2026');
    const under = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'fir_number',
            value: '112/2026',
            quote: 'FIR number 112/2026',
            confidence: floorCase - 0.01,
          },
        ],
      },
      { description },
    );
    expect(under.result.candidates).toEqual([]);
    expect(under.result.unresolved).toEqual(['fir_number']);
    const floorText = Math.max(0.6, CONFIDENCE_FLOORS.text);
    const text = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'applicant_occupation',
            value: 'Mason',
            quote: 'works as a mason',
            confidence: floorText,
          },
        ],
      },
      { description: 'Sample Person 1 works as a mason in the town.' },
    );
    expect(valueOf(text, 'applicant_occupation')).toBe('Mason');
  });

  it('a date at 0.89 means ask (the v2 date floor is 0.9)', () => {
    const low = run(
      'bail_regular',
      { facts: [{ key: 'fir_date', value: '2026-03-05', quote: '05.03.2026', confidence: 0.89 }] },
      { description },
    );
    expect(low.result.candidates).toEqual([]);
    expect(low.result.unresolved).toEqual(['fir_date']);
    const ok = run(
      'bail_regular',
      { facts: [{ key: 'fir_date', value: '2026-03-05', quote: '05.03.2026', confidence: 0.9 }] },
      { description },
    );
    expect(valueOf(ok, 'fir_date')).toBe('2026-03-05');
  });

  it('an amount at 0.89 means ask', () => {
    const out = run(
      'legal_notice_s138',
      { facts: [{ key: 'cheque_amount', value: 300000, quote: 'Rs 3,00,000', confidence: 0.89 }] },
      { description: 'Cheque for Rs 3,00,000 was dishonoured.' },
    );
    expect(out.result.candidates).toEqual([]);
  });

  it.each([1.2, -0.1, 'high', null, Number.NaN])('a bad confidence %p is rejected', (c) => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'fir_number',
            value: '112/2026',
            quote: 'FIR number 112/2026',
            confidence: c as number,
          },
        ],
      },
      { description },
    );
    expect(out.result.candidates).toEqual([]);
  });
});

describe('T-683 validate: conflicts', () => {
  it('two different values for one key go to conflicts, never a guess', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          { key: 'fir_number', value: '112/2026', quote: 'FIR number 112/2026' },
          {
            key: 'fir_number',
            value: '121/2026',
            quote: 'FIR no 121/2026',
            source: 'answer',
            turn: 1,
          },
        ],
      },
      {
        description: 'FIR number 112/2026 was registered.',
        answers: [{ turn: 1, askedKeys: ['fir_number'], text: 'FIR no 121/2026' }],
      },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.conflicts).toHaveLength(1);
    expect(out.result.conflicts[0].key).toBe('fir_number');
    expect(out.result.conflicts[0].values.map((v) => v.value).sort()).toEqual([
      '112/2026',
      '121/2026',
    ]);
  });

  it('the same value twice is one candidate', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          { key: 'fir_number', value: '112/2026', quote: 'FIR number 112/2026', confidence: 0.7 },
          {
            key: 'fir_number',
            value: '112/2026',
            quote: 'FIR no 112/2026',
            source: 'answer',
            turn: 1,
            confidence: 0.9,
          },
        ],
      },
      {
        description: 'FIR number 112/2026 was registered.',
        answers: [{ turn: 1, askedKeys: ['fir_number'], text: 'FIR no 112/2026' }],
      },
    );
    expect(out.result.conflicts).toEqual([]);
    expect(out.result.candidates).toHaveLength(1);
    expect(out.result.candidates[0].confidence).toBe(0.9);
  });

  it('a later-turn list that differs from the earlier one is a conflict, not a merge', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'sections_charged',
            value: ['303(2)', '115(2)'],
            quote: 'sections 303(2) and 115(2)',
          },
          {
            key: 'sections_charged',
            value: ['303(2)', '351(3)'],
            quote: 'sections 303(2) and 351(3)',
            source: 'answer',
            turn: 2,
          },
        ],
      },
      {
        description: 'Case under sections 303(2) and 115(2) of BNS.',
        answers: [
          {
            turn: 2,
            askedKeys: ['sections_charged'],
            text: 'Correction: sections 303(2) and 351(3)',
          },
        ],
      },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.conflicts).toHaveLength(1);
    expect(out.result.conflicts[0].values).toHaveLength(2);
  });

  it('the same list in another order is not a conflict', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'sections_charged',
            value: ['303(2)', '115(2)'],
            quote: 'sections 303(2) and 115(2)',
          },
          {
            key: 'sections_charged',
            value: ['115(2)', '303(2)'],
            quote: 'sections 115(2) and 303(2)',
            source: 'answer',
            turn: 2,
          },
        ],
      },
      {
        description: 'Case under sections 303(2) and 115(2) of BNS.',
        answers: [{ turn: 2, askedKeys: ['sections_charged'], text: 'sections 115(2) and 303(2)' }],
      },
    );
    expect(out.result.conflicts).toEqual([]);
    expect(out.result.candidates).toHaveLength(1);
  });
});

describe('T-683 validate: section numbers are kept (T-677)', () => {
  it('alphanumeric and parenthesised section numbers survive as given', () => {
    const description = 'FIR under sections 303(2), 115(2) and 351(3) of the BNS.';
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'sections_charged',
            value: ['303(2)', '115(2)', '351(3)'],
            quote: 'sections 303(2), 115(2) and 351(3)',
          },
        ],
      },
      { description },
    );
    expect(valueOf(out, 'sections_charged')).toEqual(['303(2)', '115(2)', '351(3)']);
  });

  it('an alphanumeric section (148A) and a bare 138 survive as given', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          { key: 'sections_charged', value: ['148A', '138'], quote: 'sections 148A and 138' },
        ],
      },
      { description: 'Matter under sections 148A and 138 as noted by the clerk.' },
    );
    expect(valueOf(out, 'sections_charged')).toEqual(['148A', '138']);
  });

  it('a number the quote does not hold is not invented into a list', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'sections_charged',
            value: ['303(2)', '109'],
            quote: 'sections 303(2) and 115(2)',
          },
        ],
      },
      { description: 'FIR under sections 303(2) and 115(2) of the BNS.' },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.unresolved).toContain('sections_charged');
  });
});

describe('T-683 validate: type and range rejection, and the closed key list', () => {
  const description = 'Applicant Sample Person 1, age 34, FIR 112/2026.';

  it('a key not on the pack list is dropped (not_on_list)', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key: 'invented_key', value: 'x', quote: 'Sample Person 1' }] },
      { description },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.not_on_list).toBe(1);
  });

  it('a number field takes whole digits from the quote only', () => {
    const ok = run(
      'bail_regular',
      { facts: [{ key: 'applicant_age', value: 34, quote: 'age 34' }] },
      { description },
    );
    expect(valueOf(ok, 'applicant_age')).toBe('34');
    const bad = run(
      'bail_regular',
      { facts: [{ key: 'applicant_age', value: 35, quote: 'age 34' }] },
      { description },
    );
    expect(bad.result.candidates).toEqual([]);
    const neg = run(
      'bail_regular',
      { facts: [{ key: 'applicant_age', value: -34, quote: 'age 34' }] },
      { description },
    );
    expect(neg.result.candidates).toEqual([]);
  });

  it('a choice must be one of the allowed values', () => {
    const d = 'The investigation is still going on.';
    const ok = run(
      'bail_regular',
      {
        facts: [
          { key: 'investigation_status', value: 'Under investigation', quote: 'still going on' },
        ],
      },
      { description: d },
    );
    expect(valueOf(ok, 'investigation_status')).toBe('Under investigation');
    const bad = run(
      'bail_regular',
      { facts: [{ key: 'investigation_status', value: 'Almost done', quote: 'still going on' }] },
      { description: d },
    );
    expect(bad.result.candidates).toEqual([]);
  });

  it('a court or an always-asked date is never read from the description', () => {
    const item = checklist('bail_regular').find((i) => !i.modelReadable && i.kind === 'date')!;
    const out = run(
      'bail_regular',
      { facts: [{ key: item.key, value: '2026-03-05', quote: '05.03.2026' }] },
      { description: 'Offence on 05.03.2026.' },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.not_model_readable).toBe(1);
  });

  it('garbage input never throws', () => {
    for (const bad of [null, undefined, 'x', 5, [], { facts: 'no' }, { facts: [null, 3, {}] }]) {
      const out = validateExtraction(bad, {
        checklist: checklist('bail_regular'),
        description: '',
        answers: [],
      });
      expect(out.result.candidates).toEqual([]);
    }
  });
});

describe('T-683 validate: derived keys are not read from the model (Arjun T-683 §5, T-682 invariant 6)', () => {
  it('isDerivedKey knows custody_since_derived and amount_in_words, also with a prefix', () => {
    expect(isDerivedKey('custody_since_derived')).toBe(true);
    expect(isDerivedKey('amount_in_words')).toBe(true);
    expect(isDerivedKey('some.pack.amount_in_words')).toBe(true);
    expect(isDerivedKey('cheque_amount')).toBe(false);
    expect(isDerivedKey('custody_since')).toBe(false);
  });

  it('a model value for amount_in_words is dropped as not_on_list, though the key is on the s.138 checklist', () => {
    expect(checklist('legal_notice_s138').some((i) => i.key === 'amount_in_words')).toBe(true);
    const out = run(
      'legal_notice_s138',
      {
        facts: [
          {
            key: 'amount_in_words',
            value: 'Rupees Three Lakh only',
            quote: 'teen lakh rupees',
          },
        ],
      },
      { description: 'The cheque was for teen lakh rupees.' },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.not_on_list).toBe(1);
    expect(out.result.unresolved).toEqual([]);
  });

  it('a model value for custody_since_derived is dropped as not_on_list', () => {
    const synthetic: ChecklistItem = {
      ...checklist('bail_regular').find((i) => i.key === 'custody_since')!,
      key: 'custody_since_derived',
    };
    const out = run(
      'bail_regular',
      {
        facts: [{ key: 'custody_since_derived', value: '2026-03-05', quote: '05.03.2026' }],
      },
      {
        description: 'Arrested on 05.03.2026.',
        checklist: [...checklist('bail_regular'), synthetic],
      },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.dropped.not_on_list).toBe(1);
  });

  it('a derived key is dropped on every path: non-answers and the model unresolved list too', () => {
    const out = run(
      'legal_notice_s138',
      {
        non_answers: [
          { key: 'amount_in_words', value: null, quote: 'Not known', source: 'answer', turn: 1 },
        ],
        unresolved: ['amount_in_words'],
      },
      { answers: [{ turn: 1, askedKeys: ['amount_in_words'], text: 'Not known' }] },
    );
    expect(out.result.nonAnswers).toEqual([]);
    expect(out.result.unresolved).toEqual([]);
    expect(out.dropped.not_on_list).toBe(1);
  });

  it('validate does not derive custody-since: only stated facts are emitted (Arjun §5)', () => {
    // Arrest date and a "since then in jail" phrase: validate emits arrest_date only.
    const description = 'Sample Person 1 was arrested on 05.03.2026. Tab se jail mein hai.';
    const out = run(
      'bail_regular',
      {
        facts: [
          { key: 'arrest_date', value: '2026-03-05', quote: 'arrested on 05.03.2026' },
          { key: 'custody_since', value: '2026-03-05', quote: 'Tab se jail mein hai' },
        ],
      },
      { description },
    );
    expect(out.result.candidates.map((c) => c.key)).toEqual(['arrest_date']);
    expect(out.result.candidates.some((c) => c.key === 'custody_since')).toBe(false);
    expect(out.result.candidates.some((c) => isDerivedKey(c.key))).toBe(false);
  });

  it('custody_since with no date in its quote gives no value and goes to unresolved', () => {
    const out = run(
      'bail_regular',
      { facts: [{ key: 'custody_since', value: '2026-03-05', quote: 'tab se jail mein hai' }] },
      { description: 'Sample Person 1 was arrested on 05.03.2026 and tab se jail mein hai.' },
    );
    expect(out.result.candidates).toEqual([]);
    expect(out.result.unresolved).toEqual(['custody_since']);
    expect(out.dropped.bad_value).toBe(1);
  });

  it('custody_since stated with its own date is a fact the user can give', () => {
    const out = run(
      'bail_regular',
      {
        facts: [
          {
            key: 'custody_since',
            value: '2026-03-05',
            quote: 'in judicial custody since 05.03.2026',
          },
        ],
      },
      { description: 'Sample Person 1 is in judicial custody since 05.03.2026.' },
    );
    expect(valueOf(out, 'custody_since')).toBe('2026-03-05');
  });
});
