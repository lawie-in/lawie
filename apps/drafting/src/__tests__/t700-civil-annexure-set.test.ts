/**
 * T-700 (Ajay, AJ-700, AJ-700a, AJ-700b), with T-689d: the civil annexure sets and the one
 * court-type helper.
 *
 * Expectations are typed by hand from the rulings (handoff/legal/T-511-copy-rulings-ajay.md),
 * not captured from the code. Pure: buildAnnexuresHtml needs no Chromium or database.
 */
import './setupEnv';

import {
  annexureCourtType,
  annexureSetFor,
  buildAnnexuresHtml,
} from '../services/annexures.service';

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-30T06:30:00Z'));
});
afterAll(() => {
  jest.useRealTimers();
});

const CRIMINAL_FORM: Record<string, unknown> = {
  court_id: 'jharkhand_hc',
  applicant_name: 'Priya Devi',
  father_name: 'Mohan Lal',
  applicant_age: 28,
  applicant_address: 'HB-47 Harmu, Ranchi',
  respondent_name: 'State of Jharkhand',
  fir_number: '045/2025',
  fir_date: '20.01.2025',
  police_station: 'Ranchi Sadar PS',
  sections_charged: ['528'],
};

function build(
  packId: string,
  courtType: string | undefined,
  form: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  return buildAnnexuresHtml({
    formData: { court_id: 'jharkhand_hc', place: 'Patna', ...form, template_id: packId },
    bodyParaCount: 12,
    advocateName: 'Adv. Test',
    rulePackId: packId,
    ...(courtType !== undefined ? { courtType } : {}),
    ...extra,
  });
}

type Built = ReturnType<typeof build>;
const part = (b: Built, heading: string) => b.parts.find((p) => p.heading === heading)?.html ?? '';
const headings = (b: Built) => b.parts.map((p) => p.heading);
const labels = (b: Built) => b.parts.map((p) => p.label.replace('ANNEXURE ', '')).join('');
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const indexRows = (b: Built) =>
  [
    ...part(b, 'Index of Documents Annexed').matchAll(
      /<tr><td>(\d+)\.<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g,
    ),
  ].map((m) => [m[2], m[3]]);
const memoRows = (b: Built) =>
  [
    ...part(b, 'Memo of Parties').matchAll(
      /<tr>\s*<td>([^<]*)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g,
    ),
  ].map((m) => ({ label: m[1].trim(), cell: text(m[2]).trim() }));

const LEAK = /\bFIR\b|arrest|applicant/i;

// ── AJ-700 (1): the written statement (Anushka's run-5h case) ────────────────

describe('T-700 AC1: a written statement (the run-5h acceptance case)', () => {
  const ws = (court: string, form = {}) =>
    build('written_statement', court, {
      client_role: 'defendant',
      defendant_name: 'Dev Kumar',
      ...form,
    });

  it.each(['high_court', 'district_court'])(
    'before %s: no FIR, arrest or Applicant text anywhere',
    (court) => {
      const b = ws(court, { court_id: court === 'high_court' ? 'jharkhand_hc' : 'delhi_district' });
      expect(b.html).not.toMatch(LEAK);
      expect(b.html).not.toContain('Copy of FIR');
      expect(b.html).not.toContain('Petitioner');
    },
  );

  it('is Memo, List of Dates, Index, Verification: A to D, no Synopsis, no affidavit, no Vakalatnama or court fee page', () => {
    const b = ws('high_court');
    expect(headings(b)).toEqual([
      'Memo of Parties',
      'List of Dates and Chronology of Events',
      'Index of Documents Annexed',
      'VERIFICATION',
    ]);
    expect(labels(b)).toBe('ABCD');
  });

  it('the Memo roles are Plaintiff then Defendant, the missing plaintiff a placeholder (AJ-700a (3))', () => {
    const rows = memoRows(ws('high_court'));
    expect(rows.map((r) => r.label)).toEqual(['Plaintiff', 'Defendant']);
    expect(rows[0].cell).toBe('[To be confirmed: name of the Plaintiff]');
    expect(rows[1].cell).toContain('Dev Kumar');
  });

  it('the Index: Nature line first, the pleading, the Order VIII Rule 1A list, then the rest (AJ-700b A)', () => {
    const b = ws('high_court');
    expect(part(b, 'Index of Documents Annexed')).toContain(
      '<h2>Index of Documents Annexed</h2>\n  <br>\n  <p><strong>Nature of matter:</strong> Written Statement (Order VIII CPC)</p>\n  <table>',
    );
    expect(indexRows(b).map((r) => r[0])).toEqual([
      'Written Statement (Order VIII CPC)',
      'Memo of Parties',
      'List of Dates and Chronology',
      'Index of Documents Annexed',
      'Verification',
      'List of documents relied on (Order VIII Rule 1A CPC)',
      'Documents as annexed by the advocate',
      'Vakalatnama',
      'Court fee',
    ]);
    expect(indexRows(b)[0][1]).toBe('___________');
    expect(indexRows(b)[7][1]).toBe('___________');
    expect(indexRows(b)[8][1]).toBe('___________');
  });

  it('the verification is by the defendant, the pack template byte for byte, the pleading named', () => {
    const v = part(ws('high_court'), 'VERIFICATION');
    expect(v).toContain(
      'do hereby verify that the contents of paragraphs ___ to ___ of the above Written Statement are true to my personal knowledge',
    );
    expect(v).toContain('I, Dev Kumar, ');
    expect(v).toContain('Verified at Patna on this 30 October 2026.<br><br>Defendant</p>');
    expect(v).not.toMatch(/Applicant|Petitioner|deponent/i);
  });

  it('the List of Dates holds no FIR or arrest line, only the advocate row when no date is known (AJ-700a (7))', () => {
    const d = part(ws('high_court'), 'List of Dates and Chronology of Events');
    expect(d).toContain('[Advocate to add further dates as appropriate before filing.]');
    expect(d).not.toMatch(LEAK);
  });

  it('brief dates print with their labels; "Not known" and blank dates are skipped, order kept', () => {
    const b = build(
      'written_statement',
      'high_court',
      { client_role: 'defendant' },
      {
        briefDates: [
          { date_of: 'Date of agreement', date: '2024-03-01' },
          { date_of: 'Date of notice', date: 'Not known' },
          { date_of: 'Date of suit', date: '' },
          { date_of: 'Date of summons', date: '2025-02-10' },
        ],
      },
    );
    const d = part(b, 'List of Dates and Chronology of Events');
    expect(d).toContain('Date of agreement');
    expect(d).toContain('Date of summons');
    expect(d).not.toContain('Date of notice');
    expect(d).not.toContain('Date of suit');
    expect(d.indexOf('Date of agreement')).toBeLessThan(d.indexOf('Date of summons'));
  });
});

// ── AJ-700 (1), (3): the other civil documents ───────────────────────────────

describe('T-700 AC2: the other civil documents', () => {
  it('a replication is the pleading set, with no list-of-documents row (AJ-700b D)', () => {
    const b = build('replication', 'high_court', {
      client_role: 'plaintiff',
      client_name: 'Raj Mehta',
    });
    expect(headings(b)).toEqual([
      'Memo of Parties',
      'List of Dates and Chronology of Events',
      'Index of Documents Annexed',
      'VERIFICATION',
    ]);
    expect(b.html).not.toMatch(LEAK);
    expect(indexRows(b).map((r) => r[0])).not.toContain(
      'List of documents relied on (Order VIII Rule 1A CPC)',
    );
    expect(indexRows(b).map((r) => r[0])).not.toContain(
      'List of documents relied on (Order VII Rule 14 CPC)',
    );
    expect(memoRows(b).map((r) => r.label)).toEqual(['Plaintiff', 'Defendant']);
  });

  it('a plaint has the Order VII Rule 14 list, Plaintiff/Defendant, no FIR or Applicant text', () => {
    const b = build('plaint_recovery', 'district_court', {
      plaintiff_name: 'Raj Mehta',
      defendant_name: 'Kiran Bose',
      court_id: 'delhi_district',
    });
    expect(indexRows(b).map((r) => r[0])).toContain(
      'List of documents relied on (Order VII Rule 14 CPC)',
    );
    expect(indexRows(b).map((r) => r[0])).not.toContain(
      'List of documents relied on (Order VIII Rule 1A CPC)',
    );
    expect(
      indexRows(b)
        .map((r) => r[0])
        .slice(-2),
    ).toEqual(['Vakalatnama', 'Court fee']);
    expect(memoRows(b).map((r) => r.label)).toEqual(['Plaintiff', 'Defendant']);
    expect(b.html).not.toMatch(LEAK);
    expect(part(b, 'VERIFICATION')).toContain('Plaintiff');
  });

  it('a counter affidavit: Memo and Index only, no affidavit, no court fee, Vakalatnama as a row (AJ-700 (3))', () => {
    const b = build('counter_affidavit', 'high_court');
    expect(headings(b)).toEqual(['Memo of Parties', 'Index of Documents Annexed']);
    expect(indexRows(b).map((r) => r[0])).toContain('Vakalatnama');
    expect(
      indexRows(b)
        .map((r) => r[0])
        .join('|'),
    ).not.toMatch(/Court fee|Affidavit/);
  });

  it('any other civil pack (an NCLT IBC application) gets only the Memo and the Index', () => {
    const b = build('ibc_application', 'tribunal', { court_id: 'nclt' });
    expect(headings(b)).toEqual(['Memo of Parties', 'Index of Documents Annexed']);
    expect(
      indexRows(b)
        .map((r) => r[0])
        .join('|'),
    ).not.toMatch(/Court fee/);
  });

  it('the set is chosen per pack: criminal, pleading, o39, sided, civil_other', () => {
    expect(annexureSetFor('bail_regular')).toBe('criminal');
    expect(annexureSetFor('writ_petition_criminal')).toBe('criminal');
    expect(annexureSetFor('written_statement')).toBe('pleading');
    expect(annexureSetFor('replication')).toBe('pleading');
    expect(annexureSetFor('plaint_recovery')).toBe('pleading');
    expect(annexureSetFor('temporary_injunction_o39')).toBe('o39');
    expect(annexureSetFor('counter_affidavit')).toBe('sided');
    expect(annexureSetFor('rejoinder_affidavit')).toBe('sided');
    expect(annexureSetFor('mandamus')).toBe('civil_other');
    expect(annexureSetFor(undefined)).toBe('civil_other');
    expect(annexureSetFor('t700_no_such_pack')).toBe('civil_other');
  });

  it('the Memo lists several parties as "Plaintiff No. n" / "Defendant No. n" with names as given (AJ-700a (3), AJ-700b C)', () => {
    const b = build(
      'plaint_recovery',
      'district_court',
      { court_id: 'delhi_district' },
      {
        partyValues: {
          plaintiff_name: ['Raj Mehta', 'Sita Mehta'],
          defendant_name: ['Kiran Bose', ''],
        },
      },
    );
    const rows = memoRows(b);
    expect(rows.map((r) => r.label)).toEqual([
      'Plaintiff No. 1',
      'Plaintiff No. 2',
      'Defendant No. 1',
      'Defendant No. 2',
    ]);
    expect(rows[0].cell).toContain('Raj Mehta');
    expect(rows[1].cell).toContain('Sita Mehta');
    expect(rows[2].cell).toContain('Kiran Bose');
    expect(rows[3].cell).toContain('[To be confirmed: name of the Defendant]');
  });

  it('plaint_partition: the Memo prints "Defendant", never the form hint (AJ-700b H)', () => {
    const b = build('plaint_partition', 'district_court', {
      court_id: 'delhi_district',
      plaintiff_name: 'Raj Mehta',
      defendant_name: 'Kiran Bose',
    });
    expect(memoRows(b).map((r) => r.label)).toEqual(['Plaintiff', 'Defendant']);
    expect(b.html).not.toContain('all coparceners');
    expect(b.html).not.toContain('co-sharers');
  });
});

// ── AJ-700 (3), AJ-700b B: the O.39 application ──────────────────────────────

describe('T-700 AC2: the O.39 application', () => {
  const o39 = (courtId = 'jharkhand_hc', courtType = 'high_court') =>
    build('temporary_injunction_o39', courtType, {
      court_id: courtId,
      plaintiff_name: 'A Kumar',
      client_name: 'A Kumar',
      client_role: 'plaintiff',
    });

  it('is Memo, Index, Affidavit (A to C); no List of Dates without dates; court fee a row only', () => {
    const b = o39();
    expect(headings(b)).toEqual(['Memo of Parties', 'Index of Documents Annexed', 'Affidavit']);
    expect(
      indexRows(b)
        .map((r) => r[0])
        .slice(-2),
    ).toEqual(['Vakalatnama', 'Court fee']);
    expect(b.html).not.toMatch(/\bFIR\b|arrest/i);
  });

  it('the Memo roles are Plaintiff/Applicant and Defendant/Non-Applicant (T-613 (a))', () => {
    expect(memoRows(o39()).map((r) => r.label)).toEqual([
      'Plaintiff/Applicant',
      'Defendant/Non-Applicant',
    ]);
  });

  it('the affidavit is by the plaintiff/applicant, lines 2-5 say "application" (AJ-700b B)', () => {
    const a = part(o39(), 'Affidavit');
    expect(a).toContain(
      '1. That I am the above-named Plaintiff/Applicant in the accompanying matter and am well acquainted with the facts of the case.',
    );
    expect(a).toContain(
      '2. That the facts stated in the accompanying application are true and correct to the best of my knowledge and belief.',
    );
    expect(a).toContain(
      '3. That no material fact has been concealed or misstated in the accompanying application.',
    );
    expect(a).toContain(
      '4. That the Annexures filed along with the accompanying application are true copies of the originals.',
    );
    expect(a).toContain(
      '5. That this affidavit is being affirmed in support of the accompanying application.',
    );
    expect(a).not.toContain('petition/application');
    expect(a).not.toContain('Applicant/Petitioner');
  });

  it('the affidavit ends with the court rule verification, role Plaintiff/Applicant, noun "application" (High Court rule bytes)', () => {
    const a = part(o39(), 'Affidavit');
    expect(a).toContain(
      '<p>I, A Kumar, the above-named Plaintiff/Applicant, do hereby solemnly affirm and state that the contents of paragraphs 1 to 12 of the above application are true and correct to the best of my knowledge and belief and nothing material has been concealed therefrom.<br><br>Verified at Patna on this 30 October 2026.<br><br>DEPONENT</p>',
    );
  });

  it('the affidavit verification on a trial court rule (bihar_district) uses its own wording, same role and noun', () => {
    const a = part(o39('bihar_district', 'district_court'), 'Affidavit');
    expect(a).toContain(
      '<p>I, A Kumar, the above-named Plaintiff/Applicant, do hereby verify that the contents of the above application are true and correct to the best of my knowledge and belief and nothing material has been concealed therefrom.<br><br>Verified at Patna on this 30 October 2026.<br><br>DEPONENT</p>',
    );
  });
});

// ── AJ-700 rule 0: criminal packs keep their set ─────────────────────────────

describe('T-700: the criminal set is unchanged apart from the allowed changes', () => {
  it('a bail application before a High Court: A to G with Synopsis, FIR lines, Applicant/Petitioner affidavit', () => {
    const b = build('bail_regular', 'high_court', CRIMINAL_FORM);
    expect(headings(b)).toEqual([
      'Memo of Parties',
      'Synopsis',
      'List of Dates and Chronology of Events',
      'Index of Documents Annexed',
      'Vakalatnama',
      'Court Fee Paid Statement',
      'Affidavit',
    ]);
    expect(part(b, 'Synopsis')).toContain('Applicant/Petitioner: Priya Devi');
    expect(part(b, 'Affidavit')).toContain(
      '1. That I am the above-named Applicant/Petitioner in the accompanying matter',
    );
    expect(part(b, 'Affidavit')).toContain('petition/application');
    expect(text(b.html)).toContain('Copy of FIR');
    expect(part(b, 'Court Fee Paid Statement')).toContain('Process fee');
    // Nature of matter is now on the Index too, and still in the Synopsis
    expect(part(b, 'Index of Documents Annexed')).toContain(
      '<br>\n  <p><strong>Nature of matter:</strong> Regular Bail Application</p>',
    );
  });

  it('a bail application before sessions: A to F, no Synopsis, the court fee loses Process fee and Miscellaneous is item 2 (AJ-700a (4))', () => {
    const b = build('bail_regular', 'sessions', { ...CRIMINAL_FORM, court_id: 'sessions_generic' });
    expect(labels(b)).toBe('ABCDEF');
    const fee = part(b, 'Court Fee Paid Statement');
    expect(fee).not.toContain('Process fee');
    expect(fee).toContain('<tr><td>2.</td><td>Miscellaneous (if any)</td>');
    // no whitespace-only line where the row was (AJ-700b I)
    expect(fee).not.toMatch(/\n[ \t]+\n/);
    expect(fee).toMatch(/<td>Court Fee Stamp \/ DD \/ Online<\/td><\/tr>\n {4}<tr><td>2\./);
  });

  it('writ_petition_criminal gets the criminal set with Petitioner, never Applicant (AJ-700a (2))', () => {
    const b = build('writ_petition_criminal', 'high_court', {
      ...CRIMINAL_FORM,
      petitioner_name: 'Priya Devi',
    });
    expect(headings(b)).toContain('Affidavit');
    expect(headings(b)).toContain('Synopsis');
    expect(part(b, 'Synopsis')).toContain('Petitioner: ');
    expect(part(b, 'Affidavit')).toContain('the above-named Petitioner');
    expect(b.html).not.toMatch(/applicant/i);
    expect(indexRows(b).map((r) => r[0])).toContain('Identity and Address Proof of Petitioner');
  });
});

// ── AJ-700b E: the Synopsis on civil packs ───────────────────────────────────

describe('T-700 AJ-700b E: no criminal wording in a civil Synopsis', () => {
  it('an HC plaint: "Plaintiff:" and "plaint", no FIR line, no Applicant/Petitioner, no "petition/application"', () => {
    const b = build('plaint_recovery', 'high_court', {
      plaintiff_name: 'Raj Mehta',
      defendant_name: 'Kiran Bose',
    });
    const s = part(b, 'Synopsis');
    if (s) {
      expect(s).toContain('Plaintiff: Raj Mehta');
      expect(s).toContain('seeking relief as set out in the accompanying plaint.');
      expect(s).not.toMatch(/FIR|Applicant|petition/);
    }
    expect(b.html).not.toMatch(LEAK);
  });

  it('an HC civil writ: "Petitioner:" and "petition", no FIR line, no Applicant', () => {
    const b = build('writ_petition_civil', 'high_court', {
      petitioner_name: 'Raj Mehta',
      respondent_name: 'State',
    });
    const s = part(b, 'Synopsis');
    expect(s).toContain('Petitioner: Raj Mehta');
    expect(s).toContain('The petitioner has approached');
    expect(s).toContain('the accompanying petition.');
    expect(s).not.toMatch(/FIR|Applicant|petition\/application/);
  });

  it.each(['divorce_mutual_consent', 'consumer_complaint', 'temporary_injunction_o39'])(
    '%s before a High Court: no Synopsis (no signed role and noun)',
    (id) => {
      const b = build(id, 'high_court');
      expect(headings(b)).not.toContain('Synopsis');
      expect(b.html).not.toContain('As required by High Court Practice');
    },
  );
});

// ── T-689d: one court-type helper ────────────────────────────────────────────

describe('T-689d: Annexure B and the court fee always agree on the court type', () => {
  it('annexureCourtType: chosen court, then form, then doc, then court rule; blanks skipped, none trimmed', () => {
    expect(
      annexureCourtType({
        courtData: { courtType: 'sessions' },
        formCourtType: 'high_court',
        docCourtType: 'supreme_court',
        rulesCourtType: 'tribunal',
      }),
    ).toBe('sessions');
    expect(
      annexureCourtType({
        formCourtType: 'high_court',
        docCourtType: 'sessions',
        rulesCourtType: 'tribunal',
      }),
    ).toBe('high_court');
    expect(annexureCourtType({ docCourtType: 'sessions', rulesCourtType: 'high_court' })).toBe(
      'sessions',
    );
    expect(annexureCourtType({ rulesCourtType: 'high_court' })).toBe('high_court');
    expect(
      annexureCourtType({
        courtData: { courtType: '' },
        formCourtType: '  ',
        docCourtType: '\t',
        rulesCourtType: 'high_court',
      }),
    ).toBe('high_court');
    expect(annexureCourtType({ formCourtType: ' high_court ' })).toBe(' high_court ');
    expect(annexureCourtType({ formCourtType: 42, docCourtType: null })).toBeUndefined();
    expect(annexureCourtType({})).toBeUndefined();
  });

  it('an HC document with no form court_type and no courtType: the court rule says High Court, so Synopsis and Process fee both appear', () => {
    const b = build('bail_regular', undefined, CRIMINAL_FORM);
    expect(CRIMINAL_FORM).not.toHaveProperty('court_type');
    expect(headings(b)).toContain('Synopsis');
    expect(part(b, 'Court Fee Paid Statement')).toContain('Process fee');
  });

  it('a stale doc.courtType with a trial court chosen: the route passes the chosen court type, so neither appears', () => {
    const chosen = annexureCourtType({
      courtData: { courtType: 'sessions' },
      docCourtType: 'high_court',
    });
    const b = build('bail_regular', chosen, { ...CRIMINAL_FORM, court_id: 'jharkhand_hc' });
    expect(headings(b)).not.toContain('Synopsis');
    expect(part(b, 'Court Fee Paid Statement')).not.toContain('Process fee');
  });

  // supreme_court is not in the list: it gets the Synopsis but the existing HC-only test
  // (courtType includes "high_court") gives it no Process fee row; see the report, Deferred.
  it.each(['high_court', 'high_court_bench', 'sessions', 'district_court'])(
    'for %s the Synopsis and the Process fee row are both present or both absent',
    (ct) => {
      const b = build('bail_regular', ct, CRIMINAL_FORM);
      const hasSynopsis = headings(b).includes('Synopsis');
      const hasProcessFee = part(b, 'Court Fee Paid Statement').includes('Process fee');
      expect(hasProcessFee).toBe(hasSynopsis);
    },
  );
});

// ── AJ-700-BC (3): a court-rule role never prints a (civil) / (criminal) pair ─

describe('T-700 AJ-700-BC (3): Memo roles from the court rule', () => {
  const PAIR = /\(civil\)|\(criminal\)/;
  const roleCells = (b: Built) =>
    [...part(b, 'Memo of Parties').matchAll(/<tr>\s*<td>([^<]*)<\/td>/g)].map((m) => m[1].trim());

  it.each(['delhi_district', 'up_district'])(
    'vakalatnama at %s (civil): the respondent role is "Defendant"',
    (court) => {
      const b = build('vakalatnama', 'district_court', { court_id: court });
      expect(part(b, 'Memo of Parties')).toContain('<td>Defendant</td>');
      expect(b.html).not.toMatch(PAIR);
    },
  );

  it.each(['delhi_district', 'up_district'])(
    'a criminal pack at %s: the respondent role is "Opposite Party"',
    (court) => {
      for (const pack of ['discharge_application', 'criminal_revision']) {
        const b = build(pack, 'district_court', { ...CRIMINAL_FORM, court_id: court });
        expect(annexureSetFor(pack)).toBe('criminal');
        expect(part(b, 'Memo of Parties')).toContain('<td>Opposite Party</td>');
        expect(b.html).not.toMatch(PAIR);
      }
    },
  );

  it.each([
    ['counter_affidavit', 'jharkhand_hc', 'high_court'],
    ['rejoinder_affidavit', 'jharkhand_hc', 'high_court'],
    ['counter_affidavit', 'delhi_district', 'district_court'],
    ['rejoinder_affidavit', 'up_district', 'district_court'],
  ])(
    '%s at %s with no client_side: both roles are "[To be confirmed: role]", never Applicant',
    (pack, court, ct) => {
      const b = build(pack, ct, { court_id: court });
      expect(roleCells(b)).toEqual(['[To be confirmed: role]', '[To be confirmed: role]']);
      expect(part(b, 'Memo of Parties')).not.toMatch(/applicant/i);
      expect(b.html).not.toMatch(PAIR);
    },
  );

  it.each(['counter_affidavit', 'rejoinder_affidavit'])(
    '%s with client_side set: still Petitioner / Respondent',
    (pack) => {
      for (const side of ['petitioner', 'respondent']) {
        const b = build(pack, 'district_court', {
          court_id: 'delhi_district',
          client_side: side,
          petitioner_name: 'Nita Lal',
          respondent_name: 'Mohan Lal',
        });
        expect(roleCells(b)).toEqual(['Petitioner', 'Respondent']);
        expect(b.html).not.toContain('[To be confirmed: role]');
      }
    },
  );
});
