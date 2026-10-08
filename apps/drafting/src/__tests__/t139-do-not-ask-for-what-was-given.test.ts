/**
 * T-139 — the questions cover only what the description did not say.
 * Legal sign-off: AJ-2026-10-08-T139.
 *
 * No model call and no database. The Reception answer is stubbed as the entries
 * the real one returned in Anushka's run 1 (baseline file, 6 Oct 2026).
 *
 * Criterion 1 (the five descriptions), 2 (given means known), 3 (amount in
 * words), 4 (IPC note), 6 (T-121/T-150/T-134 stay green: the other suites).
 * Criterion 5 is the web round counter: apps/web has no jest config, not tested here.
 * Criterion 7 (real-model run) is not a unit test.
 */
import fs from 'fs';
import path from 'path';

import {
  Brief,
  buildBrief,
  buildChecklist,
  buildQuestions,
  checkRead,
  ChecklistItem,
  datesReadByCode,
  GivenValue,
  IPC_AFTER_1_JULY_2024_NOTE,
} from '../services/intake-brief';
import {
  amountInWords,
  sameAmountWords,
  withAmountInWords,
} from '../services/intake-text';
import { loadRulePack } from '../services/rule-pack.service';
import { stripStationSuffix } from '../services/template-engine.service';

function checklistOf(id: string): ChecklistItem[] {
  const p = loadRulePack(id);
  if (!p) throw new Error(`no pack ${id}`);
  return buildChecklist(p);
}

const BAIL = checklistOf('bail_regular');
const S138 = checklistOf('legal_notice_s138');
const bailKind = { id: 'bail_regular', name: 'Regular Bail Application', court_document: true };
const s138Kind = { id: 'legal_notice_s138', name: 'Legal Notice s138', court_document: false };

/** Read, check, place and ask: the path /intake/brief takes, minus the model. */
function run(
  checklist: ChecklistItem[],
  kind: typeof bailKind,
  description: string,
  entries: unknown[],
): { brief: Brief; asked: string[]; dropped: Array<{ key: string; reason: string }> } {
  const r = checkRead(checklist, description, { outcome: 'read', read: entries });
  const values = new Map([...r.values, ...datesReadByCode(checklist, description, r.values)]);
  const dropped = [
    ...r.dropped,
    ...withAmountInWords(
      checklist.map((i) => i.key),
      values,
    ),
  ];
  const given: GivenValue[] = [...values].map(([key, v]) => ({
    key,
    value: v.value,
    quote: v.quote,
    source: 'description',
  }));
  const brief = buildBrief({ kind, checklist, values: given, description });
  return { brief, asked: buildQuestions(brief, new Map()).map((q) => q.key), dropped };
}

function valueOf(brief: Brief, key: string): string | string[] | null | undefined {
  return brief.items.find((i) => i.key === key)?.value;
}

function unknownKeys(brief: Brief): string[] {
  return brief.still_unknown.map((u) => u.key);
}

describe('T-139 criterion 1: the police station, read from the description', () => {
  it.each([
    ['Saraidhela PS', 'My client was arrested by Saraidhela PS in FIR 11/2026.', 'Saraidhela PS'],
    ['PS Kaiserbagh', 'FIR 22/2026 was registered at PS Kaiserbagh against my client.', 'PS Kaiserbagh'],
    [
      'Civil Lines thana Gaya',
      'mere client ko police ne utha liya, FIR Civil Lines thana Gaya mein hai.',
      'Civil Lines thana Gaya',
    ],
    ['Kankarbagh PS', 'The case is registered at Kankarbagh PS, Patna.', 'Kankarbagh PS'],
  ])('reads "%s", shows it as known and does not ask it', (_n, text, quote) => {
    const r = run(BAIL, bailKind, text, [{ id: 'police_station', value: quote, quote }]);
    expect(r.dropped).toEqual([]);
    const item = r.brief.items.find((i) => i.key === 'police_station');
    expect(item).toMatchObject({ value: quote, source: 'description', please_check: true });
    expect(unknownKeys(r.brief)).not.toContain('police_station');
    expect(r.asked).not.toContain('police_station');
  });

  it('reads the station when the model gives only the name and the cue stands next to it in the quote', () => {
    const text = 'FIR registered at PS Kaiserbagh against my client.';
    const r = run(BAIL, bailKind, text, [
      { id: 'police_station', value: 'Kaiserbagh', quote: 'registered at PS Kaiserbagh' },
    ]);
    expect(valueOf(r.brief, 'police_station')).toBe('Kaiserbagh');
    expect(r.asked).not.toContain('police_station');
  });

  it.each([
    ['a district alone', 'My client lives in Gaya and was arrested.', 'Gaya', 'in Gaya'],
    ['a locality alone', 'The incident took place at Kankarbagh, Patna.', 'Kankarbagh', 'at Kankarbagh'],
    [
      'a name that is not in the quote',
      'FIR registered at Kotwali PS.',
      'Kotwali',
      'FIR registered',
    ],
  ])('does not take %s for a police station, and asks it', (_n, text, value, quote) => {
    const r = run(BAIL, bailKind, text, [{ id: 'police_station', value, quote }]);
    expect(r.dropped).toEqual([expect.objectContaining({ key: 'police_station' })]);
    expect(valueOf(r.brief, 'police_station')).toBeNull();
    expect(unknownKeys(r.brief)).toContain('police_station');
    expect(r.asked).toContain('police_station');
  });

  it('a district alone is dropped for the reason not_a_station', () => {
    const r = run(BAIL, bailKind, 'He lives in Gaya.', [
      { id: 'police_station', value: 'Gaya', quote: 'He lives in Gaya' },
    ]);
    expect(r.dropped).toEqual([{ key: 'police_station', reason: 'not_a_station' }]);
  });

  it('still never reads the court or the district', () => {
    const cancel = checklistOf('bail_cancellation');
    expect(cancel.find((i) => i.key === 'granting_court')?.modelReadable).toBe(false);
  });
});

describe('T-139 criterion 1c: no "PS P.S." doubling at render', () => {
  it.each([
    ['Saraidhela PS', 'Saraidhela'],
    ['Kankarbagh P.S.', 'Kankarbagh'],
    ['Civil Lines thana', 'Civil Lines'],
    ['Kotwali Police Station', 'Kotwali'],
    ['Kotwali, PS', 'Kotwali'],
    ['Kotwali', 'Kotwali'],
  ])('strips the trailing station word from "%s"', (value, expected) => {
    expect(stripStationSuffix(value)).toBe(expected);
  });

  it('leaves a value that is only the station word as it is', () => {
    expect(stripStationSuffix('PS')).toBe('PS');
  });

  it('does not cut a name that merely ends in the letters ps', () => {
    expect(stripStationSuffix('Chaps')).toBe('Chaps');
  });

  it('a bail draft prints "P.S. Saraidhela", never the station word twice', () => {
    // Imported late: the template engine needs the test env.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./setupEnv');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadAllDocRules } = require('../services/template-promoter');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const engine = require('../services/template-engine.service');
    const { configs, byFile } = loadAllDocRules();
    const bail = configs.get(byFile.get('bail_before_magistrate.json').template_id);
    for (const station of ['Saraidhela PS', 'PS Kaiserbagh', 'Kankarbagh P.S.', 'Civil Lines thana']) {
      const ctx = engine.buildPlaceholderContext(bail, { police_station: station }, {});
      const printed = ctx.police_station as string;
      expect(printed).not.toMatch(/(^|\s)(p\.?\s?s\.?|thana|police station)(\s|$)/i);
      const all = bail.document_structure.sections
        .filter((s: { type: string; template?: string }) => s.type === 'template' && s.template)
        .map((s: unknown) => engine.renderTemplateSection(s, ctx).content)
        .join('\n');
      expect(all).not.toMatch(/(P\.?S\.?|Police Station)[\s,:]+(PS|P\.S\.|Police Station)\b/i);
    }
  });
});

describe('T-139 criterion 1: sections', () => {
  const sections = (value: unknown, quote: string, text = quote) =>
    run(BAIL, bailKind, text, [{ id: 'sections_charged', value, quote }]);

  it('"303(2) and 317(2) BNS" is read as both sections, with the act kept, and not asked', () => {
    const text = 'FIR 33/2026 under sections 303(2) and 317(2) BNS was registered.';
    const quote = 'under sections 303(2) and 317(2) BNS';
    for (const value of [['303(2) and 317(2) BNS'], ['303(2)', '317(2)'], ['303(2) BNS', '317(2) BNS']]) {
      const r = sections(value, quote, text);
      expect(r.dropped).toEqual([]);
      const got = valueOf(r.brief, 'sections_charged') as string[];
      expect(got.join(' ')).toContain('303(2)');
      expect(got.join(' ')).toContain('317(2)');
      expect(got.join(' ')).toMatch(/BNS/);
      expect(unknownKeys(r.brief)).not.toContain('sections_charged');
      expect(r.asked).not.toContain('sections_charged');
    }
  });

  it('splits on a comma and on an ampersand', () => {
    expect(sections(['303(2), 317(2) BNS'], 'sections 303(2), 317(2) BNS').dropped).toEqual([]);
    expect(sections(['303(2) & 317(2) BNS'], 'sections 303(2) & 317(2) BNS').dropped).toEqual([]);
  });

  it('"303" is not "303(2)": a section without its sub-section is not in the quote', () => {
    const r = sections(['303'], 'under sections 303(2) and 317(2) BNS');
    expect(r.dropped).toEqual([{ key: 'sections_charged', reason: 'not_in_quote' }]);
    expect(r.asked).toContain('sections_charged');
  });

  it('"303(2)" is not "303" either', () => {
    const r = sections(['303(2)'], 'under section 303 BNS');
    expect(r.dropped).toEqual([{ key: 'sections_charged', reason: 'not_in_quote' }]);
  });

  it('one bad token fails the whole list', () => {
    const r = sections(['303(2)', '317(2)', '420'], 'under sections 303(2) and 317(2) BNS');
    expect(r.dropped).toEqual([{ key: 'sections_charged', reason: 'not_in_quote' }]);
    expect(valueOf(r.brief, 'sections_charged')).toBeNull();
  });

  it('never assumes BNS: no act in the quote, none added', () => {
    const r = sections(['303(2)', '317(2)'], 'under sections 303(2) and 317(2)');
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['303(2)', '317(2)']);
  });

  it('an act the model names and the quote does not is not kept', () => {
    const r = sections(['303(2) BNS'], 'under section 303(2)');
    expect(r.dropped).toEqual([{ key: 'sections_charged', reason: 'act_not_in_quote' }]);
  });

  it('two acts in the quote and none in the value: the code does not pick one', () => {
    const r = sections(['103'], 'sections 103 BNS and 302 IPC');
    expect(r.dropped).toEqual([{ key: 'sections_charged', reason: 'two_acts_in_quote' }]);
  });
});

describe('T-139 criterion 1: the dates', () => {
  it('"came back unpaid on 15 September 2026" is the date of dishonour, read and not asked', () => {
    const text =
      'Cheque no. 000123 for Rs 2,40,000 came back unpaid on 15 September 2026 from the drawee bank.';
    const r = run(S138, s138Kind, text, []);
    expect(valueOf(r.brief, 'dishonour_date')).toBe('2026-09-15');
    expect(unknownKeys(r.brief)).not.toContain('dishonour_date');
    expect(r.asked).not.toContain('dishonour_date');
  });

  it.each([
    'It was returned dishonoured on 15 September 2026',
    'It bounced on 15 September 2026',
    'The dishonour memo dated 15 September 2026 says insufficient funds',
  ])('also reads: %s', (phrase) => {
    const r = run(S138, s138Kind, `Cheque no. 000123 was given to my client. ${phrase}.`, []);
    expect(valueOf(r.brief, 'dishonour_date')).toBe('2026-09-15');
  });

  it('a bare "the amount remains unpaid" gives no date of dishonour', () => {
    const r = run(S138, s138Kind, 'The amount remains unpaid. Cheque no. 000123 was given on 1 July 2026.', []);
    expect(valueOf(r.brief, 'dishonour_date')).toBeNull();
    expect(r.asked).toContain('dishonour_date');
  });

  it('a date with no word that says what it is the date of is not the date of dishonour', () => {
    const r = run(S138, s138Kind, 'The amount remains unpaid since 15 September 2026.', []);
    expect(valueOf(r.brief, 'dishonour_date')).toBeNull();
  });

  it('"FIR No. 211/2026 dated 30 Sept 2026" is the date of the FIR, read and not asked', () => {
    const text = 'My client is accused in FIR No. 211/2026 dated 30 Sept 2026 at Saraidhela PS.';
    const r = run(BAIL, bailKind, text, []);
    expect(valueOf(r.brief, 'fir_date')).toBe('2026-09-30');
    expect(r.asked).not.toContain('fir_date');
  });
});

describe('T-139 criterion 3: the amount in words', () => {
  it.each([
    ['2,40,000', 'Rupees Two Lakh Forty Thousand only'],
    ['Rs 2,40,000', 'Rupees Two Lakh Forty Thousand only'],
    ['Rs. 2,40,000/-', 'Rupees Two Lakh Forty Thousand only'],
    ['240000', 'Rupees Two Lakh Forty Thousand only'],
    ['1,25,50,075', 'Rupees One Crore Twenty Five Lakh Fifty Thousand Seventy Five only'],
    ['15,000.50', 'Rupees Fifteen Thousand and Paise Fifty only'],
    ['99,99,99,999', 'Rupees Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine only'],
    ['1', 'Rupees One only'],
    ['100', 'Rupees One Hundred only'],
    ['1,00,000', 'Rupees One Lakh only'],
    ['10,00,00,000', 'Rupees Ten Crore only'],
    ['12.05', 'Rupees Twelve and Paise Five only'],
    ['15,000.00', 'Rupees Fifteen Thousand only'],
  ])('amountInWords(%s)', (figures, words) => {
    expect(amountInWords(figures)).toBe(words);
  });

  it.each(['', 'abc', '0', '0.50', '-5', '1.234', '2 lakh'])('amountInWords(%j) is null', (figures) => {
    expect(amountInWords(figures)).toBeNull();
  });

  it('compares the advocate’s words loosely and not the amount', () => {
    const derived = 'Rupees Two Lakh Forty Thousand only';
    expect(sameAmountWords('Rs. Two Lakhs Forty Thousand Only', derived)).toBe(true);
    expect(sameAmountWords('two lakh forty-thousand', derived)).toBe(true);
    expect(sameAmountWords('Rupees Two Lakh Fifty Thousand only', derived)).toBe(false);
  });

  const text = 'Cheque no. 000123 for Rs 2,40,000 was dishonoured.';
  const figures = { id: 'cheque_amount', value: '2,40,000', quote: 'for Rs 2,40,000' };

  it('figures given: the words are derived, shown as known and never asked', () => {
    const r = run(S138, s138Kind, text, [figures]);
    expect(valueOf(r.brief, 'cheque_amount')).toBe('2,40,000');
    expect(valueOf(r.brief, 'amount_in_words')).toBe('Rupees Two Lakh Forty Thousand only');
    expect(unknownKeys(r.brief)).not.toContain('amount_in_words');
    expect(r.asked).not.toContain('amount_in_words');
    expect(r.asked).not.toContain('cheque_amount');
  });

  it('the advocate’s matching words are kept as they wrote them', () => {
    const t = `${text} That is Rupees Two Lakh Forty Thousand Only.`;
    const words = {
      id: 'amount_in_words',
      value: 'Rupees Two Lakh Forty Thousand Only',
      quote: 'Rupees Two Lakh Forty Thousand Only',
    };
    const r = run(S138, s138Kind, t, [figures, words]);
    expect(valueOf(r.brief, 'amount_in_words')).toBe('Rupees Two Lakh Forty Thousand Only');
    expect(r.dropped).toEqual([]);
  });

  it('differing advocate words are a conflict: both dropped, both asked, code does not pick', () => {
    const t = `${text} That is Rupees Two Lakh Fifty Thousand only.`;
    const words = {
      id: 'amount_in_words',
      value: 'Rupees Two Lakh Fifty Thousand only',
      quote: 'Rupees Two Lakh Fifty Thousand only',
    };
    const r = run(S138, s138Kind, t, [figures, words]);
    expect(r.dropped).toEqual(
      expect.arrayContaining([
        { key: 'cheque_amount', reason: 'conflict' },
        { key: 'amount_in_words', reason: 'conflict' },
      ]),
    );
    expect(valueOf(r.brief, 'cheque_amount')).toBeNull();
    expect(valueOf(r.brief, 'amount_in_words')).toBeNull();
    // Asked: both are back under "still unknown" (the question list itself is capped at ten).
    expect(unknownKeys(r.brief)).toEqual(expect.arrayContaining(['cheque_amount', 'amount_in_words']));
  });

  it('no figures read (or they failed the check): no words are made up', () => {
    const r = run(S138, s138Kind, text, [{ id: 'cheque_amount', value: '3,40,000', quote: 'for Rs 2,40,000' }]);
    expect(valueOf(r.brief, 'cheque_amount')).toBeNull();
    expect(valueOf(r.brief, 'amount_in_words')).toBeNull();
    expect(unknownKeys(r.brief)).toContain('amount_in_words');
  });

  it('only cheque_amount is derived: another amount fact gets no words', () => {
    const values = new Map([['loan_amount', { value: '1,00,000', quote: 'Rs 1,00,000' }]]);
    expect(withAmountInWords(['loan_amount', 'loan_amount_in_words'], values)).toEqual([]);
    expect(values.size).toBe(1);
  });
});

describe('T-139 criterion 4: IPC on a matter dated on or after 1 July 2024', () => {
  const ipc = (date: string | null, extra: Partial<ChecklistItem>[] = []) => {
    const checklist = [...BAIL, ...extra.map((e) => ({ ...BAIL[0], ...e }) as ChecklistItem)];
    const values: GivenValue[] = [
      { key: 'sections_charged', value: ['379 IPC'], source: 'description', quote: 'u/s 379 IPC' },
    ];
    if (date) values.push({ key: 'fir_date', value: date, source: 'description', quote: 'x' });
    return buildBrief({ kind: bailKind, checklist, values });
  };
  const sectionsItem = (b: Brief) => b.items.find((i) => i.key === 'sections_charged');

  it('the note is Ajay’s text', () => {
    expect(IPC_AFTER_1_JULY_2024_NOTE).toBe(
      'If the offence was committed on or after 1 July 2024, the Bharatiya Nyaya Sanhita, 2023 (BNS) applies, not the Indian Penal Code (IPC). Check the sections before you file.',
    );
  });

  it.each(['2024-07-01', '2026-03-15'])('fires for IPC with an FIR dated %s', (date) => {
    const item = sectionsItem(ipc(date));
    expect(item).toMatchObject({ please_check: true, note: IPC_AFTER_1_JULY_2024_NOTE });
    // Warn only: the value stays as the advocate wrote it.
    expect(item?.value).toEqual(['379 IPC']);
  });

  it('does not fire before 1 July 2024', () => {
    expect(sectionsItem(ipc('2024-06-30'))?.note).toBeUndefined();
  });

  it('does not fire with no date at all', () => {
    expect(sectionsItem(ipc(null))?.note).toBeUndefined();
  });

  it('does not fire for BNS', () => {
    const b = buildBrief({
      kind: bailKind,
      checklist: BAIL,
      values: [
        { key: 'sections_charged', value: ['303(2) BNS'], source: 'description', quote: 'x' },
        { key: 'fir_date', value: '2026-03-15', source: 'description', quote: 'x' },
      ],
    });
    expect(sectionsItem(b)?.note).toBeUndefined();
  });

  it('uses the offence date when there is one, before the FIR date', () => {
    const offence = {
      key: 'offence_date',
      label: 'Date of offence',
      kind: 'date' as const,
      required: false,
      dateKind: 'incident',
    };
    const build = (offenceDate: string, firDate: string) =>
      buildBrief({
        kind: bailKind,
        checklist: [...BAIL, { ...BAIL[0], ...offence } as ChecklistItem],
        values: [
          { key: 'sections_charged', value: ['379 IPC'], source: 'description', quote: 'x' },
          { key: 'offence_date', value: offenceDate, source: 'description', quote: 'x' },
          { key: 'fir_date', value: firDate, source: 'description', quote: 'x' },
        ],
      });
    // Offence in 2023, FIR in 2026: IPC is right, no note.
    expect(sectionsItem(build('2023-05-01', '2026-03-15'))?.note).toBeUndefined();
    // Offence in 2025, FIR date earlier-looking: the offence date decides.
    expect(sectionsItem(build('2025-01-10', '2024-01-01'))?.note).toBe(IPC_AFTER_1_JULY_2024_NOTE);
  });

  it('never blocks Confirm', () => {
    const without = buildBrief({ kind: bailKind, checklist: BAIL, values: [] });
    const withNote = ipc('2026-03-15');
    expect(withNote.confirm_blockers).toEqual(without.confirm_blockers);
    expect(withNote.can_confirm).toBe(without.can_confirm);
    expect(withNote.confirm_blockers).not.toContain('sections_charged');
  });
});

describe('T-139: the Reception prompt', () => {
  it('has Ajay’s FIR-quote line', () => {
    const src = fs.readFileSync(path.join(__dirname, '../services/intake.prompts.ts'), 'utf8');
    expect(src).toContain(
      'The quote for a date must include the words that say what it is the date of, even when they come before the date. "FIR No. 211/2026 dated 30 Sept 2026" gives the date of the FIR: quote "FIR No. 211/2026 dated 30 Sept 2026", not "dated 30 Sept 2026".',
    );
  });
});

// ── Round 2: AJ-2026-10-08-T139-diff (code review) ──────────────────────────

describe('T-139 round 2, Blocker 1: the station check applies to every police-station key', () => {
  const stationItem = BAIL.find((i) => i.key === 'police_station') as ChecklistItem;
  const withKey = (key: string): ChecklistItem[] => [{ ...stationItem, key }];
  const read = (key: string, value: string, quote: string, text: string) =>
    checkRead(withKey(key), text, { outcome: 'read', read: [{ id: key, value, quote }] });

  it.each(['fir_police_station', 'police_station_name', 'police_station', 'ps_name', 'thana'])(
    'key %s: "in Gaya" is dropped as not_a_station',
    (key) => {
      const r = read(key, 'Gaya', 'He lives in Gaya', 'He lives in Gaya.');
      expect(r.dropped).toEqual([{ key, reason: 'not_a_station' }]);
      expect(r.values.has(key)).toBe(false);
    },
  );

  it.each(['fir_police_station', 'police_station_name'])('key %s: "Saraidhela PS" is kept', (key) => {
    const r = read(key, 'Saraidhela PS', 'Saraidhela PS', 'FIR at Saraidhela PS.');
    expect(r.dropped).toEqual([]);
    expect(r.values.get(key)?.value).toBe('Saraidhela PS');
  });

  it('pins the accepted risk: "Gaya P.S. Kotwali" with value "Gaya" passes', () => {
    const r = read('police_station', 'Gaya', 'Gaya P.S. Kotwali', 'FIR at Gaya P.S. Kotwali.');
    expect(r.dropped).toEqual([]);
    expect(r.values.get('police_station')?.value).toBe('Gaya');
  });
});

describe('T-139 round 2: every template with {police_station} writes a station word next to it', () => {
  const dirs = [
    path.join(__dirname, '../config/document-rules'),
    path.join(__dirname, '../../../../docs/templates'),
  ];
  const STATION_BEFORE =
    /(?:p\.?\s?s\.?|thana|police\s+station|थाना|पुलिस\s+स्टेशन)[\s,:]*$/i;
  const STATION_AFTER = /^[\s,:]*(?:p\.?\s?s\.?|thana|police\s+station|थाना|पुलिस\s+स्टेशन)(?![A-Za-z])/i;

  const files = dirs.flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(dir, f))
      .filter((p) => fs.readFileSync(p, 'utf8').includes('{police_station}')),
  );

  it('finds the templates that use the placeholder, including docs/templates', () => {
    expect(files.length).toBeGreaterThan(0);
    const names = files.map((p) => path.basename(p));
    expect(names).toContain('bail_regular.json');
    expect(names).toContain('bail_anticipatory.json');
  });

  it.each(files)('%s: each {police_station} has a station word next to it', (file) => {
    const text = JSON.parse(fs.readFileSync(file, 'utf8'), (_k, v) => v);
    const flat = JSON.stringify(text).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    const bad: string[] = [];
    let at = flat.indexOf('{police_station}');
    while (at >= 0) {
      const before = flat.slice(Math.max(0, at - 40), at);
      const after = flat.slice(at + '{police_station}'.length, at + '{police_station}'.length + 40);
      if (!STATION_BEFORE.test(before) && !STATION_AFTER.test(after)) bad.push(before + '{police_station}' + after);
      at = flat.indexOf('{police_station}', at + 1);
    }
    expect(bad).toEqual([]);
  });
});

describe('T-139 round 2, small 1: Hindi station suffix', () => {
  it.each([
    ['कोतवाली थाना', 'कोतवाली'],
    ['कोतवाली पुलिस स्टेशन', 'कोतवाली'],
    ['थाना', 'थाना'],
    ['पुलिस स्टेशन', 'पुलिस स्टेशन'],
  ])('stripStationSuffix(%s) is %s', (value, expected) => {
    expect(stripStationSuffix(value)).toBe(expected);
  });
});

describe('T-139 round 2, Blockers 2 and 3: the act put back on sections', () => {
  const sections = (value: unknown, quote: string) =>
    run(BAIL, bailKind, quote, [{ id: 'sections_charged', value, quote }]);

  it('Blocker 2: "25 Arms Act" is not given the BNS; dropped as act_unclear and asked', () => {
    const r = sections(['303(2)', '317(2)', '25 Arms Act'], 'u/s 303(2), 317(2) BNS and 25 Arms Act');
    expect(r.dropped).toEqual([{ key: 'sections_charged', reason: 'act_unclear' }]);
    expect(r.asked).toContain('sections_charged');
    expect(JSON.stringify(valueOf(r.brief, 'sections_charged'))).not.toMatch(/Arms Act BNS/i);
  });

  it('Blocker 3: "302 IPC and 103 BNS" with ["302 IPC","103"] is dropped as two_acts_in_quote', () => {
    const r = sections(['302 IPC', '103'], '302 IPC and 103 BNS');
    expect(r.dropped).toEqual([{ key: 'sections_charged', reason: 'two_acts_in_quote' }]);
    expect(r.asked).toContain('sections_charged');
  });

  it('Blocker 3: ["302 IPC","103 BNS"] is kept', () => {
    const r = sections(['302 IPC', '103 BNS'], '302 IPC and 103 BNS');
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['302 IPC', '103 BNS']);
  });

  it('["303(2)","317(2) BNS"] against "303(2) and 317(2) BNS" is kept exactly', () => {
    const r = sections(['303(2)', '317(2) BNS'], '303(2) and 317(2) BNS');
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['303(2)', '317(2) BNS']);
  });

  it('a quote with no act: kept, no act added', () => {
    const r = sections(['303(2)', '317(2)'], 'u/s 303(2), 317(2)');
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['303(2)', '317(2)']);
  });

  it('a bare list under one act still gets the act back, including "498A"', () => {
    const r = sections(['498A'], 'under section 498A IPC');
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['498A IPC']);
  });
});

describe('T-139 round 2, small 2: amount words not in Latin script', () => {
  it('"2,40,000" with Hindi words: both kept as read, no conflict, nothing derived, both Please check', () => {
    const text = 'Cheque for Rs 2,40,000 (दो लाख चालीस हज़ार) was dishonoured.';
    const r = run(S138, s138Kind, text, [
      { id: 'cheque_amount', value: '2,40,000', quote: 'Rs 2,40,000' },
      { id: 'amount_in_words', value: 'दो लाख चालीस हज़ार', quote: '(दो लाख चालीस हज़ार)' },
    ]);
    expect(r.dropped.filter((d) => d.reason === 'conflict')).toEqual([]);
    const figures = r.brief.items.find((i) => i.key === 'cheque_amount');
    const words = r.brief.items.find((i) => i.key === 'amount_in_words');
    expect(figures?.value).toBe('2,40,000');
    expect(words?.value).toBe('दो लाख चालीस हज़ार');
    expect(JSON.stringify(words?.value)).not.toMatch(/Rupees/);
    expect(figures?.please_check).toBe(true);
    expect(words?.please_check).toBe(true);
  });
});

describe('T-139 round 3, A1: Hindi leading station word, through the render', () => {
  function bailCtx(station: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./setupEnv');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadAllDocRules } = require('../services/template-promoter');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const engine = require('../services/template-engine.service');
    const { configs, byFile } = loadAllDocRules();
    const bail = configs.get(byFile.get('bail_before_magistrate.json').template_id);
    return { engine, bail, ctx: engine.buildPlaceholderContext(bail, { police_station: station }, {}) };
  }

  it.each([
    // AJ-2026-10-08-T139-final-2, item 1: we may add words to the advocate's
    // station name, never remove part of it. A bare leading थाना + one word stays.
    ['थाना कोतवाली', 'थाना कोतवाली'],
    ['पुलिस स्टेशन कोतवाली', 'कोतवाली'],
    ['पुलिस थाना कोतवाली', 'कोतवाली'],
    ['थाना', 'थाना'],
    ['कोतवाली थाना', 'कोतवाली'],
    ['थाना कोतवाली थाना', 'थाना कोतवाली'],
  ])('"%s" prints as "%s"', (value, expected) => {
    expect(bailCtx(value).ctx.police_station).toBe(expected);
  });

  it('a bail draft for "थाना कोतवाली" keeps the whole name (final-2 item 1: a doubled "Police Station थाना कोतवाली" is accepted)', () => {
    const { engine, bail, ctx } = bailCtx('थाना कोतवाली');
    const all = bail.document_structure.sections
      .filter((s: { type: string; template?: string }) => s.type === 'template' && s.template)
      .map((s: unknown) => engine.renderTemplateSection(s, ctx).content)
      .join('\n');
    expect(all).toMatch(/थाना\s+कोतवाली/);
    expect(all).not.toMatch(/Police Station[\s,:]+(Police Station|PS|P\.S\.)/i);
    expect(all).not.toMatch(/(P\.?S\.?|Police Station)[\s,:]+(PS|P\.S\.|Police Station)\b/i);
  });
});

describe('T-139 round 3, A2: each section token must carry the act written next to it', () => {
  const check = (quote: string, value: string[]) =>
    run(BAIL, bailKind, quote, [{ id: 'sections_charged', value, quote }]);
  const mismatch = (quote: string, value: string[]) => {
    const r = check(quote, value);
    expect(r.dropped).toEqual([{ key: 'sections_charged', reason: 'act_mismatch' }]);
    expect(r.asked).toContain('sections_charged');
  };
  const kept = (quote: string, value: string[]) => {
    const r = check(quote, value);
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(value);
  };

  it('"302 IPC and 103 BNS" with ["302 IPC","103 IPC"] is dropped', () => {
    mismatch('302 IPC and 103 BNS', ['302 IPC', '103 IPC']);
  });
  it('"302 IPC and 103 BNS" with ["302 IPC","103 BNS"] is kept', () => {
    kept('302 IPC and 103 BNS', ['302 IPC', '103 BNS']);
  });
  it('"Sections 302, 307 IPC and 103 BNS": all three right is kept', () => {
    kept('Sections 302, 307 IPC and 103 BNS', ['302 IPC', '307 IPC', '103 BNS']);
  });
  it('"Sections 302, 307 IPC and 103 BNS": ["307 BNS"] is dropped', () => {
    mismatch('Sections 302, 307 IPC and 103 BNS', ['307 BNS']);
  });
  it('Hindi act before the numbers: right acts kept', () => {
    kept('भा.न्या.सं. की धारा 103 एवं IPC की धारा 302', ['103 BNS', '302 IPC']);
  });
  it('Hindi act before the numbers: ["103 IPC"] dropped', () => {
    mismatch('भा.न्या.सं. की धारा 103 एवं IPC की धारा 302', ['103 IPC']);
  });
  it('"302 and 103 IPC/BNS" is dropped, nothing guessed', () => {
    mismatch('302 and 103 IPC/BNS', ['302 IPC', '103 BNS']);
  });
  it('one occurrence cannot be used twice: ["302 IPC","302 IPC"] is dropped', () => {
    mismatch('302 IPC and 103 BNS', ['302 IPC', '302 IPC']);
  });
  it('"302 IPC, 103 BNS" with the right acts is kept', () => {
    kept('302 IPC, 103 BNS', ['302 IPC', '103 BNS']);
  });
  it('a single-act quote is unchanged: right acts kept, bare numbers still pass', () => {
    kept('Sections 302, 307 IPC', ['302 IPC', '307 IPC']);
    const r = check('Sections 302, 307 IPC', ['302', '307']);
    expect(r.dropped).toEqual([]);
    // The act goes back on the last token only (existing behaviour, not changed in round 3).
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['302', '307 IPC']);
  });
  it('single Hindi-named act: ["103"] gets the act added back as written', () => {
    const r = check('भा.न्या.सं. की धारा 103', ['103']);
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['103 भा.न्या.सं.']);
  });
});

describe('T-139 round 4, C1: a section number needs the act the quote ties to it', () => {
  const check = (quote: string, value: string[]) =>
    run(BAIL, bailKind, quote, [{ id: 'sections_charged', value, quote }]);
  const dropped = (quote: string, value: string[], reason: string) => {
    const r = check(quote, value);
    expect(r.dropped).toEqual([{ key: 'sections_charged', reason }]);
    expect(r.asked).toContain('sections_charged');
  };

  it('"u/s 302 IPC and 25 Arms Act" with ["302","25"] is act_unclear', () => {
    dropped('u/s 302 IPC and 25 Arms Act', ['302', '25'], 'act_unclear');
  });
  it('"25 Arms Act r/w 302 IPC" with ["25","302"] fails (Ajay probe)', () => {
    const r = check('25 Arms Act r/w 302 IPC', ['25', '302']);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].key).toBe('sections_charged');
    expect(r.asked).toContain('sections_charged');
  });
  it('the same quote with ["25 IPC"] is act_unclear', () => {
    dropped('u/s 302 IPC and 25 Arms Act', ['25 IPC'], 'act_unclear');
  });
  it('"u/s 498A IPC and 3/4 Dowry Prohibition Act" with ["498A","4"] is act_unclear', () => {
    dropped('u/s 498A IPC and 3/4 Dowry Prohibition Act', ['498A', '4'], 'act_unclear');
  });
  it('Hindi IPC and BNS with bare ["302","103"] fails as two_acts_in_quote (two acts named, bare tokens)', () => {
    dropped('भा.दं.सं. की धारा 302 एवं भा.न्या.सं. की धारा 103', ['302', '103'], 'two_acts_in_quote');
  });
  it.each([
    ['302/34 IPC', ['302/34 IPC']],
    ['Sec. 302 IPC', ['Sec. 302 IPC']],
  ])('"%s" is kept', (quote, value) => {
    const r = check(quote, value);
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(value);
  });
  it('"u/s 302 IPC" with ["302"] becomes ["302 IPC"]', () => {
    const r = check('u/s 302 IPC', ['302']);
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['302 IPC']);
  });
});

describe('T-139 round 4, C2: station prefix and suffix', () => {
  it.each([
    ['थाना भवन', 'थाना भवन'],
    ['कोतवाली पुलिस थाना', 'कोतवाली'],
    ['पुलिस थाना कोतवाली', 'कोतवाली'],
    ['थाना भवन थाना', 'थाना भवन'],
    ['Thana Bhawan PS', 'Thana Bhawan'],
    ['थाना सिविल लाइन्स', 'सिविल लाइन्स'], // Ajay accepted this risk
  ])('"%s" prints as "%s"', (value, expected) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./setupEnv');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadAllDocRules } = require('../services/template-promoter');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const engine = require('../services/template-engine.service');
    const { configs, byFile } = loadAllDocRules();
    const bail = configs.get(byFile.get('bail_before_magistrate.json').template_id);
    expect(engine.buildPlaceholderContext(bail, { police_station: value }, {}).police_station).toBe(expected);
  });
});

describe('T-139 round 4, C3: a reason for return is not a date of dishonour', () => {
  it('"issued stop payment instructions on 5 Mar" does not give a dishonour date', () => {
    const r = run(
      S138,
      s138Kind,
      'Cheque no. 000123 was given to my client. The drawer issued stop payment instructions on 5 March 2026.',
      [],
    );
    expect(valueOf(r.brief, 'dishonour_date')).toBeNull();
    expect(r.asked).toContain('dishonour_date');
  });
  it('"came back unpaid" still gives one', () => {
    const r = run(S138, s138Kind, 'Cheque no. 000123 came back unpaid on 5 March 2026.', []);
    expect(valueOf(r.brief, 'dishonour_date')).toBe('2026-03-05');
  });
});

describe('T-139 round 4: Hindi IPC names get the 1 July 2024 note', () => {
  it.each([
    ['भा.दं.सं. की धारा 302', '302 भा.दं.सं.'],
    ['भारतीय दंड संहिता की धारा 302', '302 भारतीय दंड संहिता'],
  ])('"%s" on a matter dated 2026', (quote, value) => {
    const b = buildBrief({
      kind: bailKind,
      checklist: BAIL,
      values: [
        { key: 'sections_charged', value: [value], source: 'description', quote },
        { key: 'fir_date', value: '2026-03-15', source: 'description', quote: 'x' },
      ],
    });
    const item = b.items.find((i) => i.key === 'sections_charged');
    expect(item).toMatchObject({ please_check: true, note: IPC_AFTER_1_JULY_2024_NOTE });
  });
});

describe('T-139 round 4, final-2 item 2: joiners between section numbers', () => {
  const check = (quote: string, value: string[]) =>
    run(BAIL, bailKind, quote, [{ id: 'sections_charged', value, quote }]);

  it('(i) "302 r/w 34 IPC" keeps both sections under IPC', () => {
    const r = check('302 r/w 34 IPC', ['302', '34 IPC']);
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['302', '34 IPC']);
  });
  it('(ii) "धारा 302 सपठित 34 भा.दं.सं." keeps both', () => {
    const r = check('धारा 302 सपठित 34 भा.दं.सं.', ['302', '34 भा.दं.सं.']);
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['302', '34 भा.दं.सं.']);
  });
  it.each([
    ['302 R/W 34 IPC'],
    ['302 r.w. 34 IPC'],
    ['302 read with 34 IPC'],
    ['धारा 302 पठित 34 IPC'],
  ])('"%s" keeps both sections', (quote) => {
    const r = check(quote, ['302', '34 IPC']);
    expect(r.dropped).toEqual([]);
    expect(valueOf(r.brief, 'sections_charged')).toEqual(['302', '34 IPC']);
  });
  it.each([[['420', '66D']], [['420 IPC', '66D IPC']], [['66D IPC']]])(
    '(iii) "420 IPC r/w 66D IT Act" with %j is act_unclear, never "66D IPC"',
    (value) => {
      const r = check('420 IPC r/w 66D IT Act', value);
      expect(r.dropped).toEqual([{ key: 'sections_charged', reason: 'act_unclear' }]);
      expect(JSON.stringify(valueOf(r.brief, 'sections_charged') ?? null)).not.toContain('66D IPC');
    },
  );
});
