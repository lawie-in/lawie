/**
 * Entry lists of a signed skeleton (T-500, Arjun's format go of 16 Oct 2026).
 *
 * A list clause with `entry_texts` prints one signed template per entry of its
 * `from` ledger key. `entry_parse` names how one ledger value is read into
 * entries and what each entry supplies to the template's placeholders:
 *
 * - none: the whole value is one entry, `{entry}`.
 * - `enumerated`: a value written as "(1) … (2) …" ("(a)", "(i)") gives one
 *   entry per marker, in the advocate's order, `{entry}`.
 * - `dependant`: one entry per relation. Singular: `{relation}` and, when an
 *   age is written, `{age}` ("elderly mother aged 72 who depends on him" gives
 *   relation "elderly mother", age "72"). Plural (AJ-500-M1: two or more ages,
 *   a plural relation word, or a count of two or more): `{relations}` and,
 *   with two or more ages, `{ages}` ("a and b", "a, b and c").
 *
 * Deterministic and pure. Matching data only: nothing here is printed except
 * the advocate's own words, cut at the places named above.
 */

export type EntryParse = 'enumerated' | 'dependant';

/** The placeholders each reading supplies (`none` is no `entry_parse`). */
export const ENTRY_PLACEHOLDERS: Readonly<Record<EntryParse | 'none', readonly string[]>> = {
  none: ['entry'],
  enumerated: ['entry'],
  dependant: ['relation', 'age', 'relations', 'ages'],
};

export const ENTRY_PARSES: readonly EntryParse[] = ['enumerated', 'dependant'];

/** What one entry supplies: placeholder name to the advocate's words. */
export type EntryParts = Readonly<Record<string, string>>;

/** Trailing punctuation, and a trailing "and" / "or" left by a list, removed. */
function tidy(v: string): string {
  let out = v.trim();
  for (let i = 0; i < 4; i++) {
    const next = out
      .replace(/[\s.;,:]+$/u, '')
      .replace(/\s+(?:and|or)$/iu, '')
      .trim();
    if (next === out) break;
    out = next;
  }
  return out.replace(/^[\s.;,:]+/u, '').trim();
}

/** "(1)", "(2)", "(a)", "(iv)": a list marker. */
const ENUM_MARKER = /\(\s*(?:\d{1,2}|[a-z]|[ivx]{1,4})\s*\)/giu;

function enumerated(value: string): EntryParts[] {
  const marks = [...value.matchAll(ENUM_MARKER)];
  if (marks.length < 2) {
    const one = tidy(value);
    return one === '' ? [] : [{ entry: one }];
  }
  const out: EntryParts[] = [];
  const preface = tidy(value.slice(0, marks[0].index ?? 0));
  // Words before the first marker are kept as an entry, unless they only lead in to the list ("Grounds for bail:").
  if (preface !== '' && !/:\s*$/u.test(value.slice(0, marks[0].index ?? 0))) {
    out.push({ entry: preface });
  }
  marks.forEach((m, i) => {
    const from = (m.index ?? 0) + m[0].length;
    const to = i + 1 < marks.length ? (marks[i + 1].index ?? value.length) : value.length;
    const piece = tidy(value.slice(from, to));
    if (piece !== '') out.push({ entry: piece });
  });
  return out;
}

/** The person's words before a dependency clause ("who depends on him", "is dependent on the applicant"). */
const DEPENDENCY_CLAUSE =
  /\s*,?\s*\b(?:who\s+(?:is\s+|are\s+)?(?:wholly\s+|solely\s+|entirely\s+|fully\s+)?(?:depends?|dependent)|(?:is|are)\s+(?:wholly\s+|solely\s+|entirely\s+|fully\s+)?dependent|(?:wholly\s+|solely\s+|entirely\s+|fully\s+)?dependent\s+(?:on|upon)|depends?\s+(?:on|upon))\b.*$/isu;

/** "he has", "the applicant has": the subject before the person. */
const LEADING_SUBJECT = /^(?:(?:the\s+)?applicant|he|she)\s+(?:has|have)\s+/iu;

/** An article or possessive before the person. */
const LEADING_ARTICLE = /^(?:an?|the|his|her|their)\s+/iu;

/** One age: "72", "about 72". */
const ONE_AGE = String.raw`(?:about\s+|around\s+)?\d{1,3}`;

/**
 * A list of ages: "72", "10 and 12", "8, 10 and 12". A number followed by a
 * word other than years / old / respectively / a dependency clause starts the next person ("wife
 * aged 30 and 2 children"), not another age.
 */
const AGE_LIST = String.raw`${ONE_AGE}(?:\s*(?:,|\band\b)\s*${ONE_AGE}(?!\s*(?!(?:years?|yrs?|old|respectively|and|who|is|are|depends?|dependent)\b)\p{L}))*`;

/**
 * The ages as written: "aged 72", "aged about 72 years", "aged 10 and 12
 * years respectively", "72 years old", "10 and 12 years old", "(72)". The
 * first group is the age or the list of ages.
 */
const AGE_FORMS: readonly RegExp[] = [
  new RegExp(
    String.raw`,?\s*\b(?:aged|age)\s*(?:of\s+)?(${AGE_LIST})(?:\s*(?:years?|yrs?)\.?)?(?:\s+old)?(?:\s+respectively)?\b,?`,
    'iu',
  ),
  new RegExp(
    String.raw`,?\s*\b(${AGE_LIST})\s*(?:years?|yrs?)\.?\s*(?:old|of\s+age)(?:\s+respectively)?\b,?`,
    'iu',
  ),
  /\s*\(\s*(\d{1,3})\s*\)/u,
];

/**
 * Relation words that name more than one person (AJ-500-M1). Matching data
 * only: the advocate's own word is what prints.
 */
const PLURAL_RELATIONS: ReadonlySet<string> = new Set([
  'children',
  'kids',
  'sons',
  'daughters',
  'parents',
  'brothers',
  'sisters',
  'siblings',
  'grandchildren',
  'grandsons',
  'granddaughters',
  'grandparents',
  'nephews',
  'nieces',
  'twins',
  'dependants',
  'dependents',
]);

/** A count of two or more before the relation: "two sons", "2 children", "both parents". */
const PLURAL_COUNT = /^(?:both|two|three|four|five|six|seven|eight|nine|ten|[2-9]|[1-9]\d)\b/iu;

/** "a and b", "a, b and c": the ages as AJ-500-M1 prints them. */
function agesAsWritten(ages: readonly string[]): string {
  if (ages.length <= 1) return ages.join('');
  return `${ages.slice(0, -1).join(', ')} and ${ages[ages.length - 1]}`;
}

/** True when the relation names more than one person (AJ-500-M1). */
function namesSeveral(relation: string): boolean {
  const words = relation
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
  const head = words[words.length - 1] ?? '';
  return PLURAL_RELATIONS.has(head) || PLURAL_COUNT.test(relation.trim());
}

/**
 * One person, or one relation naming several persons, with what it supplies:
 * singular `{relation}` (+ `{age}`); plural `{relations}` (+ `{ages}`, "a and
 * b" / "a, b and c"). A plural relation with a single age keeps the age in its
 * own words, as written, since "respectively" needs one age per person.
 */
function dependantOne(piece: string): EntryParts | null {
  let v = piece.replace(DEPENDENCY_CLAUSE, '').trim();
  v = v.replace(LEADING_SUBJECT, '').replace(LEADING_ARTICLE, '').trim();
  let ages: string[] = [];
  let withoutAge = v;
  for (const re of AGE_FORMS) {
    const m = re.exec(v);
    if (!m) continue;
    ages = m[1]
      .split(/\s*(?:,|\band\b)\s*/iu)
      .map((a) => a.replace(/\s+/gu, ' ').trim())
      .filter((a) => a !== '');
    withoutAge = (v.slice(0, m.index) + ' ' + v.slice(m.index + m[0].length)).replace(/\s+/gu, ' ');
    break;
  }
  const relation = tidy(withoutAge);
  if (relation === '') return null;
  const several = ages.length >= 2 || namesSeveral(relation);
  if (!several) return ages.length === 1 ? { relation, age: ages[0] } : { relation };
  if (ages.length >= 2) return { relations: relation, ages: agesAsWritten(ages) };
  // One age for several persons: printed as written, inside the relation.
  return { relations: ages.length === 1 ? tidy(v) : relation };
}

/** Marks an age list so that splitting on "," and "and" leaves it whole. */
const AGE_GUARD = '\u0001';

function dependant(value: string): EntryParts[] {
  // The subject comes off first; each list of ages is kept whole; then one entry per relation.
  const kept: string[] = [];
  let whole = value
    .trim()
    .replace(LEADING_SUBJECT, '')
    .replace(/,\s*(?=(?:aged|age|who)\b)/giu, ' ');
  for (const re of AGE_FORMS.slice(0, 2)) {
    whole = whole.replace(new RegExp(re.source, 'giu'), (m) => {
      kept.push(m.replace(/^,/u, '').replace(/,$/u, ''));
      return ` ${AGE_GUARD}${kept.length - 1}${AGE_GUARD} `;
    });
  }
  const restore = (p: string): string =>
    p.replace(
      new RegExp(`${AGE_GUARD}(\\d+)${AGE_GUARD}`, 'gu'),
      (_m, i: string) => kept[Number(i)],
    );
  const people = whole
    .split(/\s*(?:;|,|\band\b)\s*/iu)
    .map((p) => restore(p).replace(/\s+/gu, ' ').trim())
    .filter((p) => /\p{L}/u.test(p));
  const out: EntryParts[] = [];
  for (const p of people) {
    const one = dependantOne(p);
    if (one) out.push(one);
  }
  return out;
}

/** One ledger value read into entries, by the clause's `entry_parse`. */
export function entryParts(parse: EntryParse | undefined, value: string): EntryParts[] {
  if (parse === 'enumerated') return enumerated(value);
  if (parse === 'dependant') return dependant(value);
  const one = tidy(value);
  return one === '' ? [] : [{ entry: one }];
}
