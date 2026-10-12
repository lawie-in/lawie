/**
 * T-263: how a case name is matched and removed (Ajay's rule AJ-2026-10-12-T263
 * and its addendum of 12 Oct 2026). Pure checks of services/citation-check.ts.
 * Invented names only.
 *
 * Also pins Ajay's Addenda 1 to 7 (c765ae7, 0e452b6, ac4dcae, d7f4f1b, Q7
 * Addendum 5, Addendum 6 = 3c551da: Q8a unclosed bracket, Q8b slash name
 * words, and Addendum 7 = 485d836: a slash name word may carry a trailing comma). Addenda 1 to 4: the
 * abbreviation rule for sentence ends (Addendum 1), the 250-character and
 * blank-line search limit, the reporterless "A v. B" before a bare reporter and
 * the two-names case (Addendum 2, Q1 to Q3), "no versus word before a blank
 * after any cut" (Addendum 3, Q4), versus words in any case and "K. V. Rao"
 * (Addendum 4, Q5), and the sentence ends ? ! danda and double danda (Q6).
 * Addendum 5 (Q7): a mark glued between two words is a word break. Addendum 6:
 * an unclosed ( or [ in party 1 is a limit (Q8a); M/s, s/o, d/o, w/o, r/o, h/o,
 * S/o, D/o, W/o, R/o are name words (Q8b).
 */
import { AUTHORITY_BLANK, removeUngivenCitations } from '../services/citation-check';

const BLANK_RE = AUTHORITY_BLANK.replace(/[[\]—]/g, '\\$&');
const VERSUS_BEFORE_BLANK = new RegExp(
  String.raw`(?:^|[\s(])(versus|vs\.?|v\/s|v\.?)[\s,]*${BLANK_RE}`,
  'i',
);
// Addendum 4, Q5: capital V / V. after an initial or a title is an initial, not a versus word.
const INITIAL_OR_TITLE_BEFORE =
  /(?:^|[\s(])(?:[A-Z]{1,2}\.?|Dr\.?|Smt\.?|Shri|Sri|Md\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?|Kum\.?)\s+$/;

/**
 * Property check, applied to every output: no versus word (any case, v/s, V and
 * V. except after an initial or title) stands directly before a blank unless
 * the advocate wrote that name (it is then in `given` as a whole).
 */
function expectNoVersusBeforeBlank(out: string, given: string[] = []): void {
  const hit = VERSUS_BEFORE_BLANK.exec(out);
  if (!hit) return;
  const word = hit[1];
  if (/^V\.?$/.test(word)) {
    const before = out.slice(0, hit.index + hit[0].indexOf(word));
    if (INITIAL_OR_TITLE_BEFORE.test(before)) return;
  }
  const around = out.slice(Math.max(0, hit.index - 80), hit.index + hit[0].length);
  const wrote = given.some(
    (g) => g.length > 0 && around.includes(g.split(AUTHORITY_BLANK)[0].trim()),
  );
  expect({ out, wrote }).toEqual({ out, wrote: true });
}

/**
 * Addendum 5 (Q7): no part of a name stands beside a blank. The text right
 * before a blank must end at a word break, and the word before it must not
 * carry a mark (? ! , ; :) glued between two letters or digits.
 */
function expectNoNameFragmentBesideBlank(out: string, given: string[] = []): void {
  if (given.length > 0) return; // advocate-written text may legitimately stay
  let from = 0;
  for (;;) {
    const at = out.indexOf(AUTHORITY_BLANK, from);
    if (at < 0) return;
    from = at + AUTHORITY_BLANK.length;
    const before = out.slice(0, at);
    const lastWord = before.split(/\s+/).filter(Boolean).pop() ?? '';
    const glued = /[\p{L}\p{N}][?!,;:][\p{L}\p{N}]/u.test(lastWord);
    // A blank may follow an opening bracket or quote only when that opener stands alone
    // (a space or the start of text before it): "([blank])" (Addendum 6), not "Bihar([blank]".
    const fused =
      before.length > 0 && !/\s$/.test(before) && !/(?:^|\s)[(["\u201c\u2018']+$/.test(before);
    // Addendum 6 (Q8a): an opening bracket or quote glued to a capital letter is the start of a name part.
    const opener = /[([\u201c\u2018"']+\p{Lu}\S*$/u.test(lastWord);
    expect({ out, glued, fused, opener }).toEqual({
      out,
      glued: false,
      fused: false,
      opener: false,
    });
  }
}

function run(text: string, given: string[] = []) {
  const res = removeUngivenCitations(text, given);
  expectNoVersusBeforeBlank(res.text, given);
  expectNoNameFragmentBesideBlank(res.text, given);
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
    expect(res.text).toBe(`As held in Mohan Rao ${BLANK} the Court agreed.`);
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
    for (const v of [
      'Vs',
      'Vs.',
      'VS',
      'VS.',
      'Versus',
      'VERSUS',
      'V/s',
      'v/s',
      'V/S',
      'V',
      'V.',
    ]) {
      expect(() => expectNoVersusBeforeBlank(`In Ram ${v} ${BLANK} held`)).toThrow();
    }
  });
  it('the helper lets an initial or title V through', () => {
    expect(() => expectNoVersusBeforeBlank(`In K. V. ${BLANK} held`)).not.toThrow();
    expect(() => expectNoVersusBeforeBlank(`In Dr. V. ${BLANK} held`)).not.toThrow();
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
  // Ajay's Q4, 12 Oct 2026: after any cut, no versus word may stand directly before a blank.
  it('a first party of ten tokens after an earlier "v." leaves no versus word before the blank', () => {
    const res = run(
      'Ram v. Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa v. State of Kerala (2019) 4 SCC 12 apply.',
    );
    expect(res.text).toBe(`${BLANK} apply.`);
  });
});

describe('T-263 Q4: the cut extends back past a versus word', () => {
  const LONG = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa';

  it('the earlier sentence is kept', () => {
    const res = run(`The Court held so. Ram v. ${LONG} v. State of Kerala (2019) 4 SCC 12 apply.`);
    expect(res.text).toBe(`The Court held so. ${BLANK} apply.`);
  });

  it('a line start stops the walk', () => {
    const res = run(
      `Earlier text here.\nRam v.\nMohan Rao v. State of Kerala (2019) 4 SCC 12 apply.`,
    );
    expect(res.text.startsWith('Earlier text here.\n')).toBe(true);
    expect(res.text).not.toContain('SCC');
    expect(res.text).not.toContain('Mohan Rao');
  });

  it('a versus word split from its name by a line break is still taken in', () => {
    const res = run('Ram v.\nMohan Rao v. State of Kerala (2019) 4 SCC 12 apply.');
    expect(res.text).toBe(`${BLANK} apply.`);
  });

  it('T-148 (b): the advocate gave the long first party, so the name stays and only the reporter is blanked', () => {
    const res = run(`Ram v. ${LONG} v. State of Kerala (2019) 4 SCC 12 apply.`, [
      'Rely on Iota Kappa v. State of Kerala',
    ]);
    expect(res.text).toContain('Iota Kappa');
    expect(res.text).not.toContain('SCC');
    expect(res.text).toContain(BLANK);
  });
});

describe('T-263 Q4 round 2: party-1 walk starts before the 250-character bound', () => {
  const P2 = 'State of Kerala '.repeat(15).slice(0, 246).trim();
  const LONG = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa';

  it('reviewer example: "v." line-split, then a long party 2 with no sentence end', () => {
    const res = run(`Ram v.\nMohan Rao v. ${P2} (2019) 4 SCC 12 apply.`);
    expect(res.text).toBe(`${BLANK} apply.`);
  });

  it('ten tokens plus a long party 2', () => {
    const res = run(`Ram v. ${LONG} v. ${P2} (2019) 4 SCC 12 apply.`);
    expect(res.text).toBe(`${BLANK} apply.`);
  });

  it('an earlier sentence is kept with a long party 2', () => {
    const res = run(`The Court held so. Ram v. ${LONG} v. ${P2} (2019) 4 SCC 12 apply.`);
    expect(res.text).toBe(`The Court held so. ${BLANK} apply.`);
  });

  it('the previous citation is still a limit', () => {
    const res = run(
      `The text in Ram v. Shyam (2018) 1 SCC 1 held Ram v. ${LONG} v. ${P2} (2019) 4 SCC 12 apply.`,
    );
    // The cut goes back to the previous citation's end (a wide blank is safe), never into it.
    expect(res.text).toBe(`The text in ${BLANK} ${BLANK} apply.`);
    expect(res.removed).toBe(2);
  });
});

describe('T-263 Q5 (Addendum 4): versus words in any case', () => {
  const forms = ['Vs', 'Vs.', 'VS', 'VS.', 'Versus', 'VERSUS', 'V/s', 'v/s', 'V/S', 'V', 'V.'];
  it.each(forms)('"Mohan Rao %s State of Kerala"', (v) => {
    const res = run(`As held in Mohan Rao ${v} State of Kerala (2019) 4 SCC 12, bail.`);
    expect(res.text).toBe(`As held in ${BLANK}, bail.`);
    expect(res.removed).toBe(1);
  });

  it('K. V. Rao v. State of Kerala blanks in full', () => {
    const res = run('K. V. Rao v. State of Kerala (2019) 4 SCC 12 applies.');
    expect(res.text).toBe(`${BLANK} applies.`);
  });

  it('K. V. Rao is read as one name: given by the advocate, the name stays and the reporter is blanked', () => {
    const res = run('As held in K. V. Rao v. State of Kerala (2019) 4 SCC 12, bail.', [
      'Rely on K. V. Rao v. State of Kerala.',
    ]);
    expect(res.text).toBe(`As held in K. V. Rao v. State of Kerala ${BLANK}, bail.`);
  });

  it('K. V. Rao as the only party given: the name stays, the rest is blanked', () => {
    const res = run('As held in K. V. Rao v. State of Kerala (2019) 4 SCC 12, bail.', [
      'Rely on K. V. Rao.',
    ]);
    expect(res.text).toContain('K. V. Rao');
    expect(res.text).not.toContain('SCC');
    expect(res.text).toContain(BLANK);
  });

  it('Dr. V. Rao given: the name stays and the reporter is blanked', () => {
    const res = run('As held in Dr. V. Rao v. State of Kerala (2019) 4 SCC 12, bail.', [
      'Rely on Dr. V. Rao v. State of Kerala.',
    ]);
    expect(res.text).toBe(`As held in Dr. V. Rao v. State of Kerala ${BLANK}, bail.`);
  });

  it('Dr. V. Rao v. State of Kerala, not given, blanks in full', () => {
    const res = run('Dr. V. Rao v. State of Kerala (2019) 4 SCC 12 applies.');
    expect(res.text).toBe(`${BLANK} applies.`);
  });

  it('"Ram V. Shyam (2019) 4 SCC 12" is read as a case name', () => {
    const res = run('Ram V. Shyam (2019) 4 SCC 12 applies.');
    expect(res.text).toBe(`${BLANK} applies.`);
  });

  it('two names with Vs. and a reporter on the second: both go', () => {
    const res = run('Ram Vs. Shyam and Mohan Rao Vs. State of Kerala (2019) 4 SCC 12 apply.');
    expect(res.text).toBe(`${BLANK} apply.`);
  });
});

describe('T-263 Q6 (Addendum 4): ? ! danda and double danda end a sentence', () => {
  it.each(['?', '!', '\u0964', '\u0965'])(
    '%s ends the same sentence limit (Q2) and the walk',
    (m) => {
      const res = run(
        `Is Ram v. Shyam argued${m} Mohan Rao v. State of Kerala (2019) 4 SCC 12 applies.`,
      );
      expect(res.text).toBe(`Is Ram v. Shyam argued${m} ${BLANK} applies.`);
    },
  );

  it.each(['?', '!', '\u0964', '\u0965'])(
    '%s at the end of text before a bare reporter (Q2)',
    (m) => {
      const res = run(`Ram v. Shyam was argued${m} The Court in (2019) 4 SCC 12 held so.`);
      expect(res.text).toBe(`Ram v. Shyam was argued${m} The Court in ${BLANK} held so.`);
    },
  );

  it('a Hindi sentence ending in danda followed by an English case name keeps the Hindi sentence', () => {
    const hindi =
      '\u0905\u0926\u093e\u0932\u0924 \u0928\u0947 \u0915\u0939\u093e \u0939\u0948\u0964';
    const res = run(`${hindi} Mohan Rao v. State of Kerala (2019) 4 SCC 12 applies.`);
    expect(res.text).toBe(`${hindi} ${BLANK} applies.`);
  });

  it('"Shyam?(2019) 4 SCC 12" with no space: not a sentence end, blank is wide', () => {
    const res = run('Ram v. Shyam?(2019) 4 SCC 12 applies.');
    expect(res.text).toBe(`${BLANK} applies.`);
  });
});

describe('T-263 Q7 (Addendum 5): marks glued between two words are a word break', () => {
  const TAIL = 'State of Kerala (2019) 4 SCC 12 applies.';
  const rows: Array<[string, string, string]> = [
    ['Ajay example', `Held in Shyam?Mohan Rao v. ${TAIL}`, `Held in ${BLANK} applies.`],
    ['? after versus party', `Ram v. Shyam?Mohan Rao v. ${TAIL}`, `${BLANK} applies.`],
    ['!', `Held Shyam!Mohan Rao v. ${TAIL}`, `${BLANK} applies.`],
    ['comma', `Ram v. Shyam,Mohan Rao v. ${TAIL}`, `${BLANK} applies.`],
    ['full stop', `Held in Shyam.Mohan Rao v. ${TAIL}`, `Held in ${BLANK} applies.`],
    ['semicolon', `Held in Shyam;Mohan Rao v. ${TAIL}`, `Held in ${BLANK} applies.`],
    ['colon', `Held in Shyam:Mohan Rao v. ${TAIL}`, `Held in ${BLANK} applies.`],
    ['Ram v. + semicolon', `Ram v. Shyam;Mohan Rao v. ${TAIL}`, `${BLANK} applies.`],
    ['Ram v. + colon', `Ram v. Shyam:Mohan Rao v. ${TAIL}`, `${BLANK} applies.`],
    ['Ram v. + !', `Ram v. Shyam!Mohan Rao v. ${TAIL}`, `${BLANK} applies.`],
    ['lower-case word before the mark', `Held in shyam?Mohan Rao v. ${TAIL}`, `${BLANK} applies.`],
    [
      'with a space after the comma',
      `Held in Shyam, Mohan Rao v. ${TAIL}`,
      `Held in ${BLANK} applies.`,
    ],
    [
      'bracket with a glued comma is not split',
      'Mohan Rao v. State (NCT,Delhi) (2019) 4 SCC 12 applies.',
      `${BLANK} applies.`,
    ],
    [
      'lower-case word and ten tokens',
      'held in shyam?Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa v. State (2019) 4 SCC 12 applies.',
      `held in ${BLANK} applies.`,
    ],
  ];
  it.each(rows)('%s', (_label, input, expected) => {
    const res = run(input);
    expect(res.text).toBe(expected);
    expect(res.removed).toBe(1);
  });

  it('the Q7 check itself catches a fragment beside a blank', () => {
    expect(() =>
      expectNoNameFragmentBesideBlank(`Held in Shyam?Mohan ${BLANK} applies.`),
    ).toThrow();
    expect(() =>
      expectNoNameFragmentBesideBlank(`Held in Shyam,Mohan ${BLANK} applies.`),
    ).toThrow();
    expect(() => expectNoNameFragmentBesideBlank(`Held in ${BLANK} applies.`)).not.toThrow();
  });

  it('the check catches an opening bracket glued to a capital before a blank (Addendum 6)', () => {
    expect(() =>
      expectNoNameFragmentBesideBlank(`the principle (Arnesh ${BLANK} applies.`),
    ).toThrow();
    expect(() =>
      expectNoNameFragmentBesideBlank(`the principle [Arnesh ${BLANK} applies.`),
    ).toThrow();
    expect(() =>
      expectNoNameFragmentBesideBlank(`the principle (${BLANK}) applies.`),
    ).not.toThrow();
    expect(() =>
      expectNoNameFragmentBesideBlank(`the principle (see ${BLANK}) applies.`),
    ).not.toThrow();
    expect(() =>
      expectNoNameFragmentBesideBlank(`the principle ("${BLANK}) applies.`),
    ).not.toThrow();
    expect(() => expectNoNameFragmentBesideBlank(`${BLANK} applies.`)).not.toThrow();
  });

  it('the check catches an opener fused to the text before it, or a quoted name part', () => {
    expect(() => expectNoNameFragmentBesideBlank(`In Bihar(${BLANK}) applies.`)).toThrow();
    expect(() => expectNoNameFragmentBesideBlank(`In Arnesh"${BLANK} applies.`)).toThrow();
    expect(() => expectNoNameFragmentBesideBlank(`In "Arnesh ${BLANK} applies.`)).toThrow();
    expect(() => expectNoNameFragmentBesideBlank(`In (“Arnesh ${BLANK} applies.`)).toThrow();
    expect(() => expectNoNameFragmentBesideBlank(`In 'Arnesh ${BLANK} applies.`)).toThrow();
  });

  it('advocate-written text is exempt from the check', () => {
    expect(() => expectNoNameFragmentBesideBlank(`In (The ${BLANK}`, ['In (The'])).not.toThrow();
  });
});

describe('T-263 Q8a (Addendum 6): an unclosed ( or [ is a limit of party 1', () => {
  const CITE = 'Arnesh Kumar v. State of Bihar, (2014) 8 SCC 273';
  const rows: Array<[string, string, string]> = [
    [
      'round 2 regression: round bracket',
      `the principle (${CITE}) applies.`,
      `the principle (${BLANK}) applies.`,
    ],
    ['square bracket', `the principle [${CITE}] applies.`, `the principle [${BLANK}] applies.`],
    [
      'one-word first party',
      'the principle (Ravindran v. Intelligence Officer, (2021) 2 SCC 485) applies.',
      `the principle (${BLANK}) applies.`,
    ],
    [
      'straight quote right after the bracket opens a quotation',
      'the principle ("Arnesh Kumar v. State of Bihar", (2014) 8 SCC 273) applies.',
      `the principle ("${BLANK}) applies.`,
    ],
    [
      'lead word after the bracket stays',
      `the principle (see ${CITE}) applies.`,
      `the principle (see ${BLANK}) applies.`,
    ],
    [
      'closed bracket "(NCT of Delhi)" in party 1 is walked over',
      'In Latha Devi (NCT of Delhi) v. State of Kerala (2019) 4 SCC 12 held.',
      `In ${BLANK} held.`,
    ],
    [
      'closed bracket "(I)" in party 1 is walked over',
      'That in Latha Devi (I) v. Home Secretary (2019) 4 SCC 12 held.',
      `That in ${BLANK} held.`,
    ],
  ];
  it.each(rows)('%s', (_label, input, expected) => {
    const res = run(input);
    expect(res.text).toBe(expected);
    expect(res.removed).toBe(1);
  });

  it('T-148 (b): the advocate gave "Arnesh Kumar", so it stays and the rest is blanked', () => {
    const res = run(`the principle (${CITE}) applies.`, ['Rely on Arnesh Kumar.']);
    expect(res.text).toBe(`the principle (Arnesh Kumar ${BLANK}) applies.`);
    expect(res.text).not.toContain('SCC');
  });
});

describe('T-263 Q8b (Addendum 6): slash name words are name words', () => {
  it('M/s. as the first word of party 1', () => {
    const res = run('M/s. Tata Steel Ltd. v. State of Bihar (2019) 4 SCC 12 applies.');
    expect(res.text).toBe(`${BLANK} applies.`);
  });

  it('M/s. does not end a sentence, so the walk goes through it', () => {
    const res = run('As held in M/s. Tata Steel Ltd. v. State of Bihar (2019) 4 SCC 12, bail.');
    expect(res.text).toBe(`As held in ${BLANK}, bail.`);
  });

  it('M/s. Tata Steel Ltd. v. ..., bail. (no reporter glued to the name)', () => {
    const res = run('As held in M/s. Tata Steel Ltd. v. State of Bihar, (2019) 4 SCC 12, bail.');
    expect(res.text).toBe(`As held in ${BLANK}, bail.`);
  });

  it.each(['s/o', 'd/o', 'w/o', 'r/o', 'h/o', 'S/o', 'D/o', 'W/o', 'R/o'])(
    'relation word "%s" inside party 1',
    (w) => {
      const res = run(`As held in Ram ${w} Shyam Lal v. State of Bihar (2019) 4 SCC 12, bail.`);
      expect(res.text).toBe(`As held in ${BLANK}, bail.`);
      expect(res.removed).toBe(1);
    },
  );
  // Ajay's amendment to Addendum 6: any case, with or without a final full stop.
  it.each(['S/O', 'D/O', 'W/O', 'R/O', 'H/O', 'H/o', 'h/O', 'S/O.', 's/o.'])(
    'any-case relation word "%s" inside party 1',
    (w) => {
      const res = run(`As held in Ram ${w} Shyam Lal v. State of Bihar (2019) 4 SCC 12, bail.`);
      expect(res.text).toBe(`As held in ${BLANK}, bail.`);
      expect(res.removed).toBe(1);
    },
  );

  it.each(['M/S', 'M/S.', 'm/s', 'm/s.', 'M/s'])('any-case "%s" at the start of party 1', (w) => {
    const res = run(`${w} Tata Steel Ltd. v. State of Bihar (2019) 4 SCC 12 applies.`);
    expect(res.text).toBe(`${BLANK} applies.`);
  });

  it('M/S. does not end a sentence while walking back', () => {
    const res = run('As held in M/S. Tata Steel Ltd. v. State of Bihar (2019) 4 SCC 12, bail.');
    expect(res.text).toBe(`As held in ${BLANK}, bail.`);
  });
  // Addendum 7 (485d836): a slash name word may carry a trailing comma.
  it('Addendum 7: "Ram S/O, Shyam Lal v. …"', () => {
    const res = run('Held in Ram S/O, Shyam Lal v. State of Bihar (2019) 4 SCC 12 applies.');
    expect(res.text).toBe(`Held in ${BLANK} applies.`);
  });

  it.each(['s/o,', 'M/s,', 'D/O,', 'w/o,', 'R/o,', 'h/o,'])(
    'Addendum 7: relation word "%s" with a comma inside party 1',
    (w) => {
      const res = run(`As held in Ram ${w} Shyam Lal v. State of Bihar (2019) 4 SCC 12, bail.`);
      expect(res.text).toBe(`As held in ${BLANK}, bail.`);
      expect(res.removed).toBe(1);
    },
  );

  it('Addendum 7: "M/s, Tata Steel Ltd. v. …" at the start', () => {
    const res = run('M/s, Tata Steel Ltd. v. State of Bihar (2019) 4 SCC 12 applies.');
    expect(res.text).toBe(`${BLANK} applies.`);
  });
});
