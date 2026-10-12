/**
 * T-263: how a case name is matched and removed (Ajay's rule AJ-2026-10-12-T263
 * and its addendum of 12 Oct 2026). Pure checks of services/citation-check.ts.
 * Invented names only.
 *
 * Not pinned on purpose (open questions to Ajay): the 250-character and
 * blank-line search guard, a reporterless "A v. B" before a bare reporter in
 * the same sentence, and "Ram v. Shyam and Mohan Rao v. State of Kerala
 * (2019) 4 SCC 12 apply." (known open case against the property check).
 */
import { AUTHORITY_BLANK, removeUngivenCitations } from '../services/citation-check';

const VERSUS_BEFORE_BLANK = new RegExp(
  String.raw`(?:^|[\s(])(?:versus|vs\.?|v\.?)[\s,]*${AUTHORITY_BLANK.replace(/[[\]—]/g, '\\$&')}`,
  'i',
);

/**
 * Property check, applied to every output: no `v.`, `vs.` or `versus` stands
 * directly before a blank unless the advocate wrote that name (it is then in
 * `given` as a whole).
 */
function expectNoVersusBeforeBlank(out: string, given: string[] = []): void {
  const hit = VERSUS_BEFORE_BLANK.exec(out);
  if (!hit) return;
  const around = out.slice(Math.max(0, hit.index - 80), hit.index + hit[0].length);
  const wrote = given.some(
    (g) => g.length > 0 && around.includes(g.split(AUTHORITY_BLANK)[0].trim()),
  );
  expect({ out, wrote }).toEqual({ out, wrote: true });
}

function run(text: string, given: string[] = []) {
  const res = removeUngivenCitations(text, given);
  expectNoVersusBeforeBlank(res.text, given);
  return res;
}

const BLANK = AUTHORITY_BLANK;

describe('T-263 rows of the failing table are blanked in full, name and reporter', () => {
  const rows: Array<[string, string]> = [
    [
      'comma in party 2',
      'Mohan Rao v. Union of India, Ministry of Law and Justice (2016) 7 SCC 221',
    ],
    ['ampersand', 'Mohan Rao v. State of Bihar & Ors. (2019) 4 SCC 12'],
    ['alias and @', 'Ravi Nair alias Ravindran @ Ravi v. State of Kerala (2019) 4 SCC 12'],
    ['bracket and commas', 'Latha Devi (I) v. Home Secretary, State of Kerala, (1980) 1 SCC 81'],
    ['Ltd., Jamshedpur,', 'R. Mohan v. Tata Steel Ltd., Jamshedpur, 2010 SCC OnLine SC 1'],
    ['Dept., before reporter', 'K.M. Rao v. State of Kerala, Home Dept., (2019) 4 SCC 12'],
    ['titles on both sides', 'Dr. S. Rao vs. Smt. P. Devi, Collector (2019) 4 SCC 12'],
    ['line break', 'Mohan Rao v. Union of India, Ministry of Law and Justice\n(2016) 7 SCC 221'],
    ['versus and DRI comma', 'M. Ravindran versus Intelligence Officer, DRI, 2021 SCC OnLine SC 1'],
  ];
  it.each(rows)('%s', (_label, citation) => {
    const res = run(`It was held in ${citation} and so on.`);
    expect(res.text).toBe(`It was held in ${BLANK} and so on.`);
    expect(res.removed).toBe(1);
  });

  it.each(rows)('%s (at the start of the text)', (_label, citation) => {
    const res = run(`${citation} was relied on.`);
    expect(res.text).toBe(`${BLANK} was relied on.`);
  });
});

describe('T-263 names that begin with an initial', () => {
  const names = ['M. Rao', 'M Rao', 'K.M. Rao', 'K. M. Rao', 'A.K. Rao'];
  const versus = ['v.', 'vs.', 'vs', 'versus'];
  const cases = names.flatMap((n) => versus.map((v) => [n, v] as const));
  it.each(cases)('"%s" %s State of Kerala', (name, v) => {
    const res = run(`As held in ${name} ${v} State of Kerala (2019) 4 SCC 12, bail is granted.`);
    expect(res.text).toBe(`As held in ${BLANK}, bail is granted.`);
    expect(res.removed).toBe(1);
  });
  it.each(cases)('initial on the second side: State of Kerala %s "%s"', (name, v) => {
    const res = run(`As held in State of Kerala ${v} ${name} (2019) 4 SCC 12, bail is granted.`);
    expect(res.text).toBe(`As held in ${BLANK}, bail is granted.`);
  });
});

describe('T-263 titles', () => {
  const titles = ['Dr.', 'Smt.', 'Md.'];
  it.each(titles)('%s on the first side', (t) => {
    const res = run(`As held in ${t} Rao v. State of Kerala (2019) 4 SCC 12, bail is granted.`);
    expect(res.text).toBe(`As held in ${BLANK}, bail is granted.`);
  });
  it.each(titles)('%s on the second side', (t) => {
    const res = run(`As held in Mohan Rao v. ${t} Devi (2019) 4 SCC 12, bail is granted.`);
    expect(res.text).toBe(`As held in ${BLANK}, bail is granted.`);
  });
  it.each(titles)('%s on both sides', (t) => {
    const res = run(`As held in ${t} Rao vs. ${t} Devi (2019) 4 SCC 12, bail is granted.`);
    expect(res.text).toBe(`As held in ${BLANK}, bail is granted.`);
  });
});

describe('T-263 text around the citation stays', () => {
  it('a sentence that ends before the name is kept, and so is the text after', () => {
    const res = run(
      'The Court held so. Mohan Rao v. Union of India, Home Dept. (2016) 7 SCC 221 is cited.',
    );
    expect(res.text).toBe(`The Court held so. ${BLANK} is cited.`);
    expect(res.text).toContain('The Court held so.');
    expect(res.text).toContain('is cited.');
  });

  it('a lead word before the name is kept', () => {
    const res = run(
      'See Mohan Rao v. Union of India, Ministry of Law and Justice (2016) 7 SCC 221.',
    );
    expect(res.text).toBe(`See ${BLANK}.`);
    expect(res.text.startsWith('See ')).toBe(true);
  });

  it('a lead word before an initial name is kept', () => {
    const res = run('See K.M. Rao v. State of Kerala, Home Dept., (2019) 4 SCC 12 on this.');
    expect(res.text).toBe(`See ${BLANK} on this.`);
  });

  it('a full stop after an abbreviation inside party 2 does not end the name', () => {
    const res = run(
      'The point is in R. Mohan v. Tata Steel Ltd., Jamshedpur, 2010 SCC OnLine SC 1.',
    );
    expect(res.text).toBe(`The point is in ${BLANK}.`);
  });

  it('the previous sentence is kept when it ends in a word of three or more letters', () => {
    const res = run(
      'The case arose in Bihar. Mohan Rao v. State of Kerala (2019) 4 SCC 12 held so.',
    );
    expect(res.text).toBe(`The case arose in Bihar. ${BLANK} held so.`);
  });
});

describe('T-263 what the advocate gave is untouched (T-148 (b))', () => {
  const full = 'Mohan Rao v. Union of India, Ministry of Law and Justice (2016) 7 SCC 221';

  it('both name and reporter given: kept exactly as written', () => {
    const res = run(`As held in ${full} the Court agreed.`, [`Please rely on ${full}.`]);
    expect(res.text).toBe(`As held in ${full} the Court agreed.`);
    expect(res.removed).toBe(0);
  });

  it('both given, name with initials and a comma: kept exactly as written', () => {
    const c = 'K.M. Rao v. State of Kerala, Home Dept., (2019) 4 SCC 12';
    const res = run(`As held in ${c} the Court agreed.`, [`Rely on ${c}`]);
    expect(res.text).toBe(`As held in ${c} the Court agreed.`);
    expect(res.removed).toBe(0);
  });

  it('name given, reporter not: the name stays and the reporter is blanked', () => {
    const res = run(`As held in ${full} the Court agreed.`, [
      'Rely on Mohan Rao v. Union of India, Ministry of Law and Justice.',
    ]);
    expect(res.text).toContain(`Mohan Rao v. Union of India, Ministry of Law and Justice ${BLANK}`);
    expect(res.text).not.toContain('SCC');
    expect(res.text.startsWith('As held in ')).toBe(true);
    expect(res.text.endsWith(' the Court agreed.')).toBe(true);
  });

  it('only party 1 given: party 1 stays, party 2 and the reporter are blanked', () => {
    const res = run(
      'As held in Mohan Rao v. State of Bihar & Ors. (2019) 4 SCC 12 the Court agreed.',
      ['Rely on the judgment of Mohan Rao Esq.'],
    );
    expect(res.text).not.toContain('Bihar');
    expect(res.text).not.toContain('SCC');
    expect(res.text).toContain(BLANK);
  });

  it('reporter given, no name before it: the advocate reporter is kept as written', () => {
    const res = run('The rule is in (2019) 4 SCC 12 as well.', ['Rely on (2019) 4 SCC 12']);
    expect(res.text).toBe('The rule is in (2019) 4 SCC 12 as well.');
  });
});

describe('T-263 unchanged by this ticket (rule 7)', () => {
  it('a reporter with no versus word: the reporter alone is blanked', () => {
    const res = run('See Mohan Rao on this (2019) 4 SCC 12 point.');
    expect(res.text).toContain('See Mohan Rao on this');
    expect(res.text).not.toContain('SCC');
  });

  it('a versus word with no reporter: the text is unchanged', () => {
    const text = 'Mohan Rao v. State of Kerala was a case about bail.';
    const res = run(text);
    expect(res.text).toBe(text);
    expect(res.removed).toBe(0);
  });

  it('a list marker "(v)" is not a versus word', () => {
    const res = run('The grounds are: (v) Mohan Rao v. State of Kerala (2019) 4 SCC 12 applies.');
    expect(res.text).toContain('(v)');
    expect(res.text).toContain(BLANK);
    expect(res.text).not.toContain('Mohan Rao');
  });
});

describe('T-263 property check', () => {
  it('the helper catches a name left beside a blank', () => {
    expect(() => expectNoVersusBeforeBlank(`In Rao v. ${BLANK} held`)).toThrow();
    expect(() => expectNoVersusBeforeBlank(`In Rao vs ${BLANK} held`)).toThrow();
    expect(() => expectNoVersusBeforeBlank(`In Rao versus, ${BLANK} held`)).toThrow();
  });
  it('the helper lets through text the advocate wrote', () => {
    expect(() =>
      expectNoVersusBeforeBlank(`In Rao v. State of Kerala ${BLANK}`, ['Rao v. State of Kerala']),
    ).not.toThrow();
  });
});

describe('T-263 Addendum 2 (Ajay, Q1 to Q3)', () => {
  it('Q1: a versus word in an earlier paragraph (blank line) is not reached', () => {
    const res = run('Ram v. Shyam was argued\n\nThe Court in (2019) 4 SCC 12 held so.');
    expect(res.text).toContain('Ram v. Shyam was argued');
    expect(res.text).not.toContain('SCC');
    expect(res.text).toContain('held so.');
  });

  it('Q1: a versus word more than 250 characters before the reporter is not reached', () => {
    const filler = 'and the learned counsel went on to submit at some length that '.repeat(6);
    expect(filler.length).toBeGreaterThan(250);
    const res = run(`Ram v. Shyam ${filler}as in (2019) 4 SCC 12 held so.`);
    expect(res.text).toContain('Ram v. Shyam');
    expect(res.text).toContain('as in');
    expect(res.text).not.toContain('SCC');
  });

  it('Q2: a reporterless "A v. B" before a bare reporter in another sentence stays', () => {
    const res = run('Ram v. Shyam was argued. The Court in (2019) 4 SCC 12 held so.');
    expect(res.text).toBe(`Ram v. Shyam was argued. The Court in ${BLANK} held so.`);
  });

  it('Q2: a full stop followed by a bracket is not a sentence end, so the blank is wide', () => {
    const res = run('Ram v. Shyam was argued. (2020) 5 SCC 1 applies.');
    expect(res.text).toBe(`${BLANK} applies.`);
  });

  it('Q3: two names and a reporter only on the second: both go', () => {
    const res = run('Ram v. Shyam and Mohan Rao v. State of Kerala (2019) 4 SCC 12 apply.');
    expect(res.text).toBe(`${BLANK} apply.`);
  });

  it('Q3: v, vs and versus never end a sentence while walking back', () => {
    for (const v of ['v', 'v.', 'vs', 'vs.', 'versus']) {
      const res = run(`Ram ${v} Shyam and Mohan Rao ${v} State of Kerala (2019) 4 SCC 12 apply.`);
      expect(res.text).toBe(`${BLANK} apply.`);
    }
  });
});

describe('T-263 known edge: ten-token limit lands just after a versus word', () => {
  // FINDING (source: services/citation-check.ts): output is "Ram v. [blank] apply.", which breaks the
  // property check. it.failing: passes while the gap exists and breaks when it is fixed. Needs Ajay's call.
  it.failing(
    'a first party of ten tokens after an earlier "v." leaves no versus word before the blank',
    () => {
      const res = run(
        'Ram v. Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa v. State of Kerala (2019) 4 SCC 12 apply.',
      );
      expect(res.text).not.toContain('SCC');
    },
  );
});
