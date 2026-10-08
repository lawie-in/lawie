/**
 * T-105 — the brief (ADR-021 sections 3.2 to 3.4; rules signed by Ajay in T-127).
 *
 * No model call and no database: the checklist, the checks on what the model
 * read, the date rules, the questions and the confirm rule.
 */
import {
  Brief,
  buildBrief,
  buildChecklist,
  buildQuestions,
  carriesDateKind,
  checklistLines,
  checkRead,
  checkUserValue,
  ChecklistItem,
  dateKindsIn,
  datesReadByCode,
  FIXED_KEYS,
  fixedChecklist,
  GivenValue,
  hasCourtSignal,
  isCourtDocument,
  namesSupremeCourt,
  readGuidedBrief,
  statedDates,
  wordedQuestions,
} from '../services/intake-brief';
import { datesInText } from '../services/intake-text';
import { listRulePackIds, loadRulePack, RulePack } from '../services/rule-pack.service';

function pack(id: string): RulePack {
  const p = loadRulePack(id);
  if (!p) throw new Error(`no pack ${id}`);
  return p;
}

function item(list: ChecklistItem[], key: string): ChecklistItem {
  const found = list.find((i) => i.key === key);
  if (!found) throw new Error(`no item ${key}`);
  return found;
}

const BAIL = buildChecklist(pack('bail_regular'));
const bailKind = { id: 'bail_regular', name: 'Regular Bail Application', court_document: true };

function read(checklist: ChecklistItem[], text: string, entries: unknown[], extra = {}) {
  return checkRead(checklist, text, { outcome: 'read', read: entries, ...extra });
}

function fromDescription(key: string, value: string | string[], quote = ''): GivenValue {
  return { key, value, quote, source: 'description' };
}

describe('which packs are court documents (T-127, section 2.1)', () => {
  it('60 of the 92 packs, and a new pack is one until listed otherwise', () => {
    const ids = listRulePackIds();
    expect(ids.filter(isCourtDocument)).toHaveLength(60);
    expect(isCourtDocument('a_pack_added_later')).toBe(true);
  });

  it.each(['bail_regular', 'plaint_recovery', 'vakalatnama', 'writ_petition_civil', 'divorce_hma'])(
    '%s is a court document',
    (id) => expect(isCourtDocument(id)).toBe(true),
  );

  it.each([
    'nda',
    'sale_deed',
    'legal_notice_s138',
    'rent_agreement',
    'affidavit_identity',
    'will',
  ])('%s is not', (id) => expect(isCourtDocument(id)).toBe(false));
});

describe('the checklist', () => {
  it('builds for every pack, with unique keys and a placeholder-ready label', () => {
    for (const id of listRulePackIds()) {
      const list = buildChecklist(pack(id));
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list.map((i) => i.key)).size).toBe(list.length);
      for (const i of list) expect(i.label.length).toBeGreaterThan(0);
    }
  });

  it('leaves the court out on a court document: the court picker covers it', () => {
    const keys = BAIL.map((i) => i.key);
    for (const forum of ['court', 'state', 'district', 'court_type', 'language']) {
      expect(keys).not.toContain(forum);
    }
  });

  it('keeps the same facts on a document that has no court', () => {
    const rent = buildChecklist(pack('rent_agreement'));
    expect(rent.some((i) => i.key === 'state')).toBe(
      pack('rent_agreement').facts.some((f) => f.name === 'state'),
    );
  });

  it('never lets the model read a court or a district; the police station is read like any text fact (ADR-019 rule 4.1.2 as amended by AJ-2026-10-08-T139)', () => {
    expect(item(BAIL, 'police_station').modelReadable).toBe(true);
    expect(checklistLines(BAIL).some((l) => l.startsWith('police_station |'))).toBe(true);
    const cancel = buildChecklist(pack('bail_cancellation'));
    expect(item(cancel, 'granting_court').modelReadable).toBe(false);
  });

  it('every court document has a required party name, so the confirm rule can bite', () => {
    for (const id of listRulePackIds().filter(isCourtDocument)) {
      const list = buildChecklist(pack(id));
      expect([id, list.some((i) => i.partyName && i.required)]).toEqual([id, true]);
    }
  });

  it('sorts facts into the parts of the brief', () => {
    expect(item(BAIL, 'applicant_name')).toMatchObject({ part: 'parties', partyName: true });
    expect(item(BAIL, 'father_name')).toMatchObject({ part: 'parties', partyName: false });
    expect(item(BAIL, 'applicant_age')).toMatchObject({ part: 'parties', partyName: false });
    expect(item(BAIL, 'fir_number')).toMatchObject({ part: 'numbers', kind: 'text' });
    expect(item(BAIL, 'sections_charged')).toMatchObject({ part: 'numbers', kind: 'list' });
    expect(item(BAIL, 'fir_date')).toMatchObject({ part: 'dates', kind: 'date', dateKind: 'fir' });
    expect(item(BAIL, 'custody_since')).toMatchObject({ part: 'dates', dateKind: 'custody' });
    expect(item(BAIL, 'facts_narrative')).toMatchObject({ part: 'facts', kind: 'narrative' });
    expect(item(BAIL, 'currently_in_custody').kind).toBe('choice');
    const recovery = buildChecklist(pack('plaint_recovery'));
    expect(item(recovery, 'principal_amount')).toMatchObject({ part: 'numbers', kind: 'amount' });
    expect(item(recovery, 'defendant_response').part).toBe('facts');
  });

  it('a date that is always asked, or one of two of a kind, is never read by the model', () => {
    const recovery = buildChecklist(pack('plaint_recovery'));
    expect(item(recovery, 'limitation_start_date')).toMatchObject({
      kind: 'date',
      modelReadable: false,
    });
    const appeal = buildChecklist(pack('criminal_appeal'));
    expect(item(appeal, 'judgment_date')).toMatchObject({ dateKind: null, modelReadable: false });
    expect(item(appeal, 'sentence_date')).toMatchObject({ dateKind: null, modelReadable: false });
  });

  it('a fact named like a date but not one is plain text', () => {
    const rent = buildChecklist(pack('rent_agreement'));
    expect(item(rent, 'rent_due_date').kind).not.toBe('date');
  });

  describe('fixed items (T-127, section 2.2)', () => {
    it('are left out where the pack has its own fact', () => {
      const keys = BAIL.map((i) => i.key);
      expect(keys).not.toContain(FIXED_KEYS.firstParty);
      expect(keys).not.toContain(FIXED_KEYS.facts);
      // bail_regular has a prayer template: the pack fixes what is asked.
      expect(keys).not.toContain(FIXED_KEYS.relief);
    });

    it('a notice with no narrative fact is asked what happened', () => {
      const notice = buildChecklist(pack('legal_notice_eviction'));
      expect(item(notice, FIXED_KEYS.facts)).toMatchObject({
        required: true,
        label: 'What happened, in order',
      });
    });

    it('an agreement is never asked what happened or what is asked for', () => {
      const nda = buildChecklist(pack('nda'));
      expect(nda.map((i) => i.key)).not.toContain(FIXED_KEYS.relief);
      const facts = nda.find((i) => i.key === FIXED_KEYS.facts);
      if (facts)
        expect(facts).toMatchObject({
          required: false,
          label: 'Anything else the document should say',
        });
    });

    it('with no pack there are four, and the other party is required only on a court document', () => {
      expect(fixedChecklist(true).map((i) => [i.key, i.required])).toEqual([
        [FIXED_KEYS.firstParty, true],
        [FIXED_KEYS.otherParty, true],
        [FIXED_KEYS.facts, true],
        [FIXED_KEYS.relief, true],
      ]);
      expect(item(fixedChecklist(false), FIXED_KEYS.otherParty).required).toBe(false);
    });
  });

  it('gives the model one line per readable fact: id | what | kind | required | allowed values', () => {
    const lines = checklistLines(BAIL);
    expect(lines).toContain('fir_number | FIR Number | text | required');
    expect(lines).toContain('fir_date | Date of FIR | date | required');
    expect(lines.find((l) => l.startsWith('currently_in_custody |'))).toMatch(
      /\| choice \| required \| Yes — Judicial custody; Yes — Police custody; No — anticipating arrest$/,
    );
    expect(lines.every((l) => !l.includes('\n'))).toBe(true);
  });
});

describe('what the model read is checked against the user’s own words', () => {
  const TEXT =
    'My client Ram Kumar, son of Shri Hari Kumar, aged 32, was arrested in FIR No. 124/2026 ' +
    'under sections 103 and 61 BNS. He is in judicial custody.';

  it('keeps a value that sits inside its own quote', () => {
    const r = read(BAIL, TEXT, [
      { id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' },
      { id: 'fir_number', value: '124/2026', quote: 'FIR No. 124/2026' },
      { id: 'applicant_age', value: 32, quote: 'aged 32' },
      { id: 'sections_charged', value: ['103', '61'], quote: 'under sections 103 and 61 BNS' },
    ]);
    expect(r.dropped).toEqual([]);
    expect(r.values.get('applicant_name')).toEqual({
      value: 'Ram Kumar',
      quote: 'My client Ram Kumar',
    });
    expect(r.values.get('applicant_age')?.value).toBe('32');
    // The act the quote names is put back on the last section, as written (T-139).
    expect(r.values.get('sections_charged')?.value).toEqual(['103', '61 BNS']);
  });

  it.each([
    [
      'a quote that is not in the description',
      { id: 'applicant_name', value: 'Ram Kumar', quote: 'the accused Ram Kumar' },
      'no_matching_quote',
    ],
    ['no quote at all', { id: 'applicant_name', value: 'Ram Kumar' }, 'no_matching_quote'],
    [
      'a name from another sentence',
      { id: 'applicant_name', value: 'Shri Hari Kumar', quote: 'My client Ram Kumar' },
      'not_in_quote',
    ],
    [
      'words the user did not write',
      { id: 'applicant_name', value: 'Ramesh Kumar', quote: 'My client Ram Kumar' },
      'not_own_words',
    ],
    [
      'a number that is only part of another',
      { id: 'applicant_age', value: '3', quote: 'aged 32' },
      'not_in_quote',
    ],
    [
      'a section that is not in the quote',
      { id: 'sections_charged', value: ['103', '302'], quote: 'under sections 103 and 61 BNS' },
      'not_in_quote',
    ],
    [
      'a choice that is not on the list',
      { id: 'currently_in_custody', value: 'In jail', quote: 'He is in judicial custody' },
      'option',
    ],
    [
      'a police station that is not in its own quote',
      { id: 'police_station', value: 'Kotwali', quote: 'My client Ram Kumar' },
      'not_own_words',
    ],
  ])('drops %s', (_name, entry, reason) => {
    const r = read(BAIL, TEXT, [entry]);
    expect(r.values.size).toBe(0);
    expect(r.dropped).toEqual([{ key: (entry as { id: string }).id, reason }]);
  });

  it('drops an id that is not on the checklist, without repeating it', () => {
    const r = read(BAIL, TEXT, [
      { id: 'court', value: 'Sessions Court, Patna', quote: 'My client Ram Kumar' },
    ]);
    expect(r.values.size).toBe(0);
    expect(r.dropped).toEqual([{ key: '(not on the checklist)', reason: 'not_on_checklist' }]);
  });

  it('keeps a choice by its listed wording, whatever the case', () => {
    const r = read(BAIL, TEXT, [
      {
        id: 'currently_in_custody',
        value: 'yes — judicial custody',
        quote: 'He is in judicial custody',
      },
    ]);
    expect(r.values.get('currently_in_custody')?.value).toBe('Yes — Judicial custody');
  });

  it('two different values for one fact: neither is kept (ADR-019 rule 4.1.5)', () => {
    const twice = read(BAIL, `${TEXT} His age is 34.`, [
      { id: 'applicant_age', value: '32', quote: 'aged 32' },
      { id: 'applicant_age', value: '34', quote: 'His age is 34' },
    ]);
    expect(twice.values.has('applicant_age')).toBe(false);
    expect(twice.dropped).toEqual([{ key: 'applicant_age', reason: 'conflict' }]);

    const flagged = read(BAIL, TEXT, [{ id: 'applicant_age', value: '32', quote: 'aged 32' }], {
      conflicts: ['applicant_age'],
    });
    expect(flagged.values.has('applicant_age')).toBe(false);
  });

  it('a malformed answer reads as nothing', () => {
    expect(checkRead(BAIL, TEXT, null).values.size).toBe(0);
    expect(checkRead(BAIL, TEXT, { read: 'no' }).values.size).toBe(0);
    expect(checkRead(BAIL, TEXT, { read: [null, 7, { value: 'x' }] }).values.size).toBe(0);
  });
});

describe('dates: what a date is the date of (T-127, section 6)', () => {
  it('reads Hindi month names and Devanagari digits', () => {
    expect(datesInText('15 मार्च 2026 को')).toEqual(['2026-03-15']);
    expect(datesInText('दिनांक १०/०९/२०२६')).toEqual(['2026-09-10']);
    expect(datesInText('FIR No. 124/2026')).toEqual([]);
  });

  it('knows the cues of a kind, as whole words', () => {
    expect(carriesDateKind('arrested on 15/03/2026', 'arrest')).toBe(true);
    expect(carriesDateKind('FIR No. 124/2026', 'fir')).toBe(false); // no tie cue
    expect(carriesDateKind('FIR No. 124/2026 dated 10/03/2026', 'fir')).toBe(true);
    expect(carriesDateKind('we confirm the first date', 'fir')).toBe(false); // "fir" inside other words
    expect(carriesDateKind('प्राथमिकी दिनांक 08/09/2026 को दर्ज हुई', 'fir')).toBe(true);
    expect(dateKindsIn('giraftar kiya 10/09/2026 ko')).toEqual(['arrest']);
  });

  describe('the three texts in T-105', () => {
    const magistrate = buildChecklist(pack('bail_before_magistrate')); // has fir_date and arrest_date

    it('"arrested on 15/03/2026 in FIR No. 124/2026": a date of arrest and no FIR date', () => {
      const text = 'arrested on 15/03/2026 in FIR No. 124/2026';
      // The model tries the same date for both.
      const r = read(magistrate, text, [
        { id: 'fir_date', value: '2026-03-15', quote: text },
        { id: 'arrest_date', value: '2026-03-15', quote: 'arrested on 15/03/2026' },
      ]);
      expect(r.values.get('arrest_date')?.value).toBe('2026-03-15');
      expect(r.values.has('fir_date')).toBe(false);
      expect(r.dropped).toEqual([{ key: 'fir_date', reason: 'no_meaning_in_quote' }]);
    });

    it('"arrested by Sadar Thana Police on 25th August 2026": a date of arrest and no FIR date', () => {
      const text = 'arrested by Sadar Thana Police on 25th August 2026';
      const r = read(magistrate, text, [{ id: 'fir_date', value: '2026-08-25', quote: text }]);
      expect(r.values.has('fir_date')).toBe(false);
      // The model did not return the arrest date. The code reads it under the same rule.
      const byCode = datesReadByCode(magistrate, text, r.values);
      expect([...byCode.entries()]).toEqual([
        ['arrest_date', { value: '2026-08-25', quote: text }],
      ]);
    });

    it('"FIR No. 124/2026 dated 10/03/2026, arrested on 15/03/2026": both', () => {
      const text = 'FIR No. 124/2026 dated 10/03/2026, arrested on 15/03/2026';
      const r = read(magistrate, text, [
        { id: 'fir_date', value: '2026-03-10', quote: 'FIR No. 124/2026 dated 10/03/2026' },
        { id: 'arrest_date', value: '2026-03-15', quote: 'arrested on 15/03/2026' },
      ]);
      expect(r.values.get('fir_date')?.value).toBe('2026-03-10');
      expect(r.values.get('arrest_date')?.value).toBe('2026-03-15');
      expect(r.dropped).toEqual([]);
      // And with nothing from the model at all, the code reads the same two.
      const byCode = datesReadByCode(magistrate, text, new Map());
      expect(byCode.get('fir_date')?.value).toBe('2026-03-10');
      expect(byCode.get('arrest_date')?.value).toBe('2026-03-15');
    });

    it('on a document with no arrest fact, the date of arrest is kept with its meaning and not placed', () => {
      // bail_regular has fir_date and custody_since, and no date of arrest.
      const text =
        'My brother was arrested by Sadar Thana Police on 25th August 2026 from lajpat market.';
      const r = read(BAIL, text, [
        { id: 'fir_date', value: '2026-08-25', quote: text.slice(0, -1) },
      ]);
      const brief = buildBrief({ kind: bailKind, checklist: BAIL, values: [], description: text });
      expect(r.values.size).toBe(0);
      expect(brief.items.find((i) => i.key === 'fir_date')?.value).toBeNull();
      expect(brief.loose_dates).toEqual([
        { value: '2026-08-25', kind: 'arrest', meaning: 'Date of arrest' },
      ]);
    });
  });

  it.each([
    [
      'two dates in the quote',
      'FIR No. 124/2026 dated 10/03/2026, arrested on 15/03/2026',
      '2026-03-10',
      'two_dates_in_quote',
    ],
    [
      'a date that is not the one in the quote',
      'FIR dated 10/03/2026',
      '2026-03-11',
      'not_in_quote',
    ],
    ['a quote with no date', 'FIR was registered', '2026-03-10', 'not_in_quote'],
    ['a value that is not a date', 'FIR dated 10/03/2026', '10/03/2026', 'type'],
  ])('drops %s', (_name, quote, value, reason) => {
    const r = read(BAIL, `${quote}.`, [{ id: 'fir_date', value, quote }]);
    expect(r.dropped).toEqual([{ key: 'fir_date', reason }]);
  });

  it('a quote that carries the cues of two kinds on the checklist is asked, not placed', () => {
    const text = 'The FIR is dated and he is in custody since 10/03/2026';
    const r = read(BAIL, text, [{ id: 'custody_since', value: '2026-03-10', quote: text }]);
    expect(r.dropped).toEqual([{ key: 'custody_since', reason: 'two_meanings_in_quote' }]);
  });

  it('one date is never used for two facts from the same words', () => {
    const magistrate = buildChecklist(pack('bail_before_magistrate'));
    const quote = 'arrested on 15/03/2026';
    const r = read(magistrate, `${quote}.`, [
      { id: 'arrest_date', value: '2026-03-15', quote },
      { id: 'fir_date', value: '2026-03-15', quote },
    ]);
    expect([...r.values.keys()]).toEqual(['arrest_date']);
  });

  it('one date may stand for two facts when the description says so for both', () => {
    const magistrate = buildChecklist(pack('bail_before_magistrate'));
    const text = 'FIR was registered on 15/03/2026. He was arrested on 15/03/2026.';
    const r = read(magistrate, text, [
      { id: 'fir_date', value: '2026-03-15', quote: 'FIR was registered on 15/03/2026' },
      { id: 'arrest_date', value: '2026-03-15', quote: 'He was arrested on 15/03/2026' },
    ]);
    expect([...r.values.keys()].sort()).toEqual(['arrest_date', 'fir_date']);
  });

  it('a date the model may not read is dropped even with a good quote', () => {
    const recovery = buildChecklist(pack('plaint_recovery'));
    const quote = 'limitation runs from 01/02/2024';
    const r = read(recovery, quote, [{ id: 'limitation_start_date', value: '2024-02-01', quote }]);
    expect(r.dropped).toEqual([{ key: 'limitation_start_date', reason: 'not_readable' }]);
  });

  describe('dates read by code', () => {
    it.each([
      [
        'He was married on 12 May 2019 and they separated on 3 June 2023.',
        [
          ['2019-05-12', 'marriage'],
          ['2023-06-03', 'separation'],
        ],
      ],
      [
        'मेरे भाई को 10 सितंबर 2026 को गिरफ्तार कर लिया। प्राथमिकी दिनांक 08/09/2026 को दर्ज हुई।',
        [
          ['2026-09-08', 'fir'],
          ['2026-09-10', 'arrest'],
        ],
      ],
      [
        'mere bhai ko 10/09/2026 ko giraftar kiya aur FIR 08/09/2026 ko darj hui',
        [
          ['2026-09-08', 'fir'],
          ['2026-09-10', 'arrest'],
        ],
      ],
      ['The hearing is on 15th March, 2026.', [['2026-03-15', 'hearing']]],
      // Two dates in one clause, or no cue: no meaning. The user is asked.
      [
        'Notice dated 01.03.2026 was served on 05.03.2026.',
        [
          ['2026-03-01', null],
          ['2026-03-05', null],
        ],
      ],
      ['It happened around 02/02/2026.', [['2026-02-02', 'incident']]],
      ['See you on 02/02/2026.', [['2026-02-02', null]]],
    ])('%s', (text, expected) => {
      expect(statedDates(text).map((d) => [d.value, d.kind])).toEqual(expected);
    });

    it('the same date under two meanings in two places is not given either', () => {
      const text = 'He was arrested on 15/03/2026. The cheque was presented on 15/03/2026.';
      expect(statedDates(text).map((d) => [d.value, d.kind])).toEqual([['2026-03-15', null]]);
    });

    it('never overrides a date already placed, and never fills two facts with one date', () => {
      const magistrate = buildChecklist(pack('bail_before_magistrate'));
      const text = 'FIR was registered on 10/03/2026. He was arrested on 15/03/2026.';
      const already = new Map([['fir_date', { value: '2026-03-15', quote: 'x' }]]);
      const byCode = datesReadByCode(magistrate, text, already);
      // fir_date is taken; 15/03 is already placed, so arrest_date is left to be asked.
      expect([...byCode.keys()]).toEqual([]);
    });
  });
});

describe('the brief', () => {
  const TEXT = 'My client Ram Kumar was arrested on 15/03/2026 in FIR No. 124/2026.';
  const values = [
    fromDescription('applicant_name', 'Ram Kumar', 'My client Ram Kumar'),
    fromDescription('fir_number', '124/2026', 'FIR No. 124/2026'),
  ];
  const court = { state: 'Bihar', court_type: 'sessions', court: 'Sessions Court, Patna' };

  it('has the same parts for every document', () => {
    for (const id of ['bail_regular', 'nda', 'legal_notice_eviction']) {
      const p = pack(id);
      const b = buildBrief({
        kind: { id, name: p.name, court_document: isCourtDocument(id) },
        checklist: buildChecklist(p),
        values: [],
      });
      expect(Object.keys(b).sort()).toEqual([
        'can_confirm',
        'confirm_blockers',
        'confirm_message',
        'court',
        'items',
        'kind',
        'loose_dates',
        'still_unknown',
        'unplaced',
      ]);
      for (const i of b.items)
        expect(['parties', 'facts', 'dates', 'numbers', 'relief']).toContain(i.part);
    }
  });

  it('marks what was read from the description "please check", and not what the user typed', () => {
    const b = buildBrief({
      kind: bailKind,
      checklist: BAIL,
      values: [...values, { key: 'father_name', value: 'Hari Kumar', source: 'user' }],
    });
    const byKey = new Map(b.items.map((i) => [i.key, i]));
    expect(byKey.get('applicant_name')).toMatchObject({
      value: 'Ram Kumar',
      source: 'description',
      please_check: true,
      quote: 'My client Ram Kumar',
    });
    expect(byKey.get('father_name')).toMatchObject({
      value: 'Hari Kumar',
      source: 'user',
      please_check: false,
    });
    expect(byKey.get('father_name')?.quote).toBeUndefined();
    expect(byKey.get('fir_date')).toMatchObject({
      value: null,
      source: null,
      please_check: false,
      meaning: 'Date of FIR',
    });
  });

  it('lists the required facts that are missing, each with the blank the draft will use', () => {
    const b = buildBrief({ kind: bailKind, checklist: BAIL, values });
    const unknown = new Map(b.still_unknown.map((u) => [u.key, u.placeholder]));
    expect(unknown.get('fir_date')).toBe('[To be confirmed: date of FIR]');
    expect(unknown.get('police_station')).toBe('[To be confirmed: police station]');
    expect(unknown.has('applicant_name')).toBe(false);
    // An optional fact is never "still unknown".
    expect(unknown.has('custody_since')).toBe(false);
  });

  it('the court is never filled by the model: it is empty until the user chooses it', () => {
    const b = buildBrief({
      kind: bailKind,
      checklist: BAIL,
      values: [...values, fromDescription('court', 'Sessions Court, Patna', 'x')],
      description: TEXT,
    });
    expect(b.court).toEqual({ state: null, court_type: null, court: null });
    expect(b.items.some((i) => i.key === 'court')).toBe(false);
  });

  describe('confirming (decision D2)', () => {
    it('a court document cannot be confirmed without the court and the parties', () => {
      const none = buildBrief({ kind: bailKind, checklist: BAIL, values: [] });
      expect(none).toMatchObject({
        can_confirm: false,
        confirm_blockers: ['court', 'parties'],
        confirm_message: 'Choose the court and add the parties to continue.',
      });
      const noCourt = buildBrief({ kind: bailKind, checklist: BAIL, values });
      expect(noCourt).toMatchObject({
        can_confirm: false,
        confirm_blockers: ['court'],
        confirm_message: 'Choose the court to continue.',
      });
      const noParty = buildBrief({ kind: bailKind, checklist: BAIL, values: [], court });
      expect(noParty).toMatchObject({
        can_confirm: false,
        confirm_blockers: ['parties'],
        confirm_message: expect.stringMatching(/^Add the name of the applicant.* to continue\.$/),
      });
      // The exact line, with a label this test controls (T-127, section 7.2).
      const own: ChecklistItem[] = [
        { ...item(BAIL, 'applicant_name'), label: 'Applicant Full Name' },
      ];
      expect(
        buildBrief({ kind: bailKind, checklist: own, values: [], court }).confirm_message,
      ).toBe('Add the name of the applicant to continue.');
      const half = buildBrief({
        kind: bailKind,
        checklist: BAIL,
        values,
        court: { ...court, court: null },
      });
      expect(half.can_confirm).toBe(false);
    });

    it('with the court and the parties it can be confirmed, whatever else is missing', () => {
      const b = buildBrief({ kind: bailKind, checklist: BAIL, values, court });
      expect(b).toMatchObject({ can_confirm: true, confirm_blockers: [], confirm_message: null });
      expect(b.still_unknown.length).toBeGreaterThan(5);
    });

    it('a document that is not for a court can always be confirmed', () => {
      const p = pack('nda');
      const b = buildBrief({
        kind: { id: 'nda', name: p.name, court_document: false },
        checklist: buildChecklist(p),
        values: [],
      });
      expect(b).toMatchObject({ can_confirm: true, confirm_message: null });
      expect(b.still_unknown.length).toBeGreaterThan(0);
    });
  });

  describe('changing the kind of document', () => {
    it('keeps every value that the new kind also has, and loses nothing else', () => {
      const anticipatory = pack('bail_anticipatory');
      const carried: GivenValue[] = [
        ...values,
        { key: 'custody_since', value: '2026-03-15', source: 'user', label: 'In custody since' },
        { key: 'no_such_fact', value: 'kept anyway', source: 'user' },
      ];
      const b = buildBrief({
        kind: { id: anticipatory.id, name: anticipatory.name, court_document: true },
        checklist: buildChecklist(anticipatory),
        values: carried,
        court,
      });
      const byKey = new Map(b.items.map((i) => [i.key, i]));
      expect(b.kind.id).toBe('bail_anticipatory');
      expect(byKey.get('applicant_name')?.value).toBe('Ram Kumar');
      expect(byKey.get('fir_number')?.value).toBe('124/2026');
      expect(b.court).toEqual(court);
      // Anticipatory bail has no "in custody since". The value is kept, shown, and not placed.
      expect(b.unplaced).toEqual(
        expect.arrayContaining([
          { label: 'In custody since', value: '2026-03-15' },
          { label: 'no such fact', value: 'kept anyway' },
        ]),
      );
      // "Still unknown" is worked out again for the new kind.
      expect(b.still_unknown.every((u) => byKey.has(u.key))).toBe(true);
    });

    it('carries a value across when the key moved into a group but the fact name is the same', () => {
      const list: ChecklistItem[] = [{ ...item(BAIL, 'fir_number'), key: 'case.fir_number' }];
      const b = buildBrief({ kind: bailKind, checklist: list, values });
      expect(b.items[0]).toMatchObject({ key: 'case.fir_number', value: '124/2026' });
    });

    it('a value that does not fit the new fact is kept unplaced, not forced in', () => {
      const b = buildBrief({
        kind: bailKind,
        checklist: BAIL,
        values: [{ key: 'fir_date', value: 'last Monday', source: 'user' }],
      });
      expect(b.items.find((i) => i.key === 'fir_date')?.value).toBeNull();
      expect(b.unplaced).toEqual([{ label: 'fir date', value: 'last Monday' }]);
    });
  });

  it('what the user typed wins over what was read', () => {
    const b = buildBrief({
      kind: bailKind,
      checklist: BAIL,
      values: [...values, { key: 'applicant_name', value: 'Ram Kumar Singh', source: 'user' }],
    });
    expect(b.items.find((i) => i.key === 'applicant_name')).toMatchObject({
      value: 'Ram Kumar Singh',
      source: 'user',
      please_check: false,
    });
  });

  it.each([
    ['fir_date', '2026-03-10', null],
    ['fir_date', '10/03/2026', 'Give the date as YYYY-MM-DD.'],
    ['fir_date', '2026-02-30', 'Give the date as YYYY-MM-DD.'],
    ['applicant_age', '32', null],
    ['applicant_age', 'thirty', 'Give a number.'],
    ['currently_in_custody', 'no — anticipating arrest', null],
    ['currently_in_custody', 'maybe', 'Choose from the list.'],
    ['sections_charged', ['103', '61'], null],
    ['sections_charged', [], 'Give at least one value.'],
    ['applicant_name', '', 'This cannot be empty.'],
    ['applicant_name', 'x'.repeat(501), 'Keep this under 500 characters.'],
  ])('checks a typed value: %s = %p', (key, value, expected) => {
    expect(checkUserValue(item(BAIL, key), value)).toBe(expected);
  });
});

describe('questions (T-127, section 2.5)', () => {
  function briefWith(values: GivenValue[]): Brief {
    return buildBrief({ kind: bailKind, checklist: BAIL, values });
  }

  it('asks at most 5 a round for 2 rounds, names of parties first, a party’s details last', () => {
    const q = buildQuestions(briefWith([]), new Map());
    expect(q).toHaveLength(10);
    expect(q.map((x) => x.round)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    expect(q.map((x) => x.key)).toEqual([
      'applicant_name',
      'fir_number',
      'fir_date',
      'sections_charged',
      'police_station',
      'currently_in_custody',
      'facts_narrative',
      'grounds_for_bail',
      'father_name',
      'applicant_age',
    ]);
  });

  it('never asks for something already given, or for an optional fact', () => {
    const q = buildQuestions(
      briefWith([
        fromDescription('applicant_name', 'Ram Kumar'),
        fromDescription('fir_number', '124/2026'),
      ]),
      new Map(),
    );
    const keys = q.map((x) => x.key);
    expect(keys).not.toContain('applicant_name');
    expect(keys).not.toContain('fir_number');
    expect(keys).not.toContain('custody_since');
    expect(keys).not.toContain('additional_context');
  });

  it('uses the model’s wording, but only the code decides which questions are asked', () => {
    const worded = wordedQuestions({
      questions: [
        { id: 'fir_date', question: 'On what date was the FIR registered?' },
        { id: 'applicant_name', question: 'x' }, // too short to be a question
        { id: 'court', question: 'Which court will this be filed in?' }, // not on the checklist
        { id: 'custody_since', question: 'Since when is he in custody?' }, // optional
        { id: 7, question: 'ignored' },
      ],
    });
    const q = buildQuestions(briefWith([]), worded);
    const byKey = new Map(q.map((x) => [x.key, x.question]));
    expect(byKey.get('fir_date')).toBe('On what date was the FIR registered?');
    expect(byKey.get('applicant_name')).toBe(`Please give: ${item(BAIL, 'applicant_name').label}.`);
    expect(byKey.has('court')).toBe(false);
    expect(byKey.has('custody_since')).toBe(false);
  });

  it('a question carries what the screen needs to take the answer', () => {
    const q = buildQuestions(briefWith([]), new Map());
    expect(q.find((x) => x.key === 'fir_date')).toMatchObject({ kind: 'date', label: 'FIR Date' });
    expect(q.find((x) => x.key === 'currently_in_custody')?.options).toHaveLength(3);
  });

  it('with nothing missing there are no questions', () => {
    const all = BAIL.filter((i) => i.required).map((i): GivenValue => {
      const value =
        i.kind === 'date'
          ? '2026-03-10'
          : i.kind === 'choice'
            ? i.options[0]
            : i.kind === 'choices'
              ? [i.options[0]]
              : i.kind === 'list'
                ? ['103']
                : i.kind === 'number'
                  ? '32'
                  : 'given';
      return { key: i.key, value, source: 'user' };
    });
    expect(buildQuestions(briefWith(all), new Map())).toEqual([]);
  });
});

describe('a request with no rule pack', () => {
  const TEXT =
    'I, Suresh Prasad, own shop no. 4 in Boring Road, Patna. I want to give consent to Mohan Traders ' +
    'to use it as their registered office. They started using it on 01/04/2026.';

  it('keeps only what the user’s own words support', () => {
    const reading = readGuidedBrief(
      {
        purpose: 'consent for use of premises',
        from: 'Suresh Prasad',
        to: 'Mohan Traders',
        court_or_authority: 'Registrar of Companies, Patna',
        facts: [
          { text: 'The owner owns shop no. 4.', source: 'own shop no. 4 in Boring Road, Patna' },
          { text: 'The rent is Rs. 10,000.', source: 'rent of Rs. 10,000 per month' },
        ],
        requests: [
          'give consent to Mohan Traders to use it as their registered office',
          'waive the rent',
        ],
        dates: ['01/04/2026'],
        sections_given: [],
        unknowns: ['the period of consent'],
      },
      TEXT,
      false,
    );
    const byKey = new Map(reading.values.map((v) => [v.key, v.value]));
    expect(byKey.get(FIXED_KEYS.firstParty)).toBe('Suresh Prasad');
    expect(byKey.get(FIXED_KEYS.otherParty)).toBe('Mohan Traders');
    // A fact is kept as the user's own words, and the invented one is dropped.
    expect(byKey.get(FIXED_KEYS.facts)).toBe('own shop no. 4 in Boring Road, Patna');
    expect(byKey.get(FIXED_KEYS.relief)).toBe(
      'give consent to Mohan Traders to use it as their registered office',
    );
    expect(reading.dropped).toBe(1);
    expect(reading.unknowns).toEqual([
      'a detail we could not find in your words',
      'the period of consent',
    ]);
    expect(JSON.stringify(reading)).not.toContain('10,000');
    expect(JSON.stringify(reading)).not.toContain('Registrar');
  });

  it('a name the user did not write is dropped', () => {
    const reading = readGuidedBrief(
      { from: 'Suresh Kumar Prasad', to: 'Mohan Traders' },
      TEXT,
      false,
    );
    expect(reading.values.map((v) => v.key)).toEqual([FIXED_KEYS.otherParty]);
  });

  it('on a court document the court never comes from the model', () => {
    const reading = readGuidedBrief(
      { from: 'Suresh Prasad', court_or_authority: 'Patna' },
      TEXT,
      true,
    );
    expect(reading.values.map((v) => v.key)).toEqual([FIXED_KEYS.firstParty]);
  });

  it('survives a malformed brief', () => {
    for (const bad of [null, 'text', [], { facts: 'no', requests: 7, unknowns: [3, null] }]) {
      expect(readGuidedBrief(bad, TEXT, true).values).toEqual([]);
    }
  });

  it('knows a court signal in English and Hindi, and a section of a code', () => {
    expect(hasCourtSignal('Draft a bail application for my client.')).toBe(true);
    expect(hasCourtSignal('मेरे भाई की जमानत की अर्जी')).toBe(true);
    expect(hasCourtSignal('He was booked under section 103 BNS.')).toBe(true);
    expect(hasCourtSignal(TEXT)).toBe(false);
    // "suit" inside "suitable" and "stay" inside "staying" are not signals.
    expect(hasCourtSignal('A suitable letter for a guest staying at my flat.')).toBe(false);
  });

  it('knows a request for the Supreme Court (T-107, section 3)', () => {
    expect(namesSupremeCourt('Draft a transfer petition before the Supreme Court of India.')).toBe(
      true,
    );
    expect(namesSupremeCourt('सर्वोच्च न्यायालय में याचिका')).toBe(true);
    expect(namesSupremeCourt('Draft a bail application for the High Court.')).toBe(false);
  });
});
