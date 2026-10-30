/**
 * The signed confirm lines (LEGAL CONTENT, Ajay): T-629, the O.39 required
 * fields that block Confirm; T-661, the per-pack signed ask lines
 * (PACK_CONFIRM_MESSAGES, below).
 *
 * Signed in handoff/legal/T-613-o39-injunction-signed.md:
 *   §(g)   the flag on main_suit_relief and restraint_sought, and the EN and HI
 *          messages (byte for byte);
 *   §(i)5  only EN is served or rendered; HI waits for the Hindi mechanism;
 *   §(j)2  every blocking message shows, one per line, in the order court,
 *          parties, main_suit_relief, restraint_sought;
 *   §(j)3  a non-answer (case-insensitive, trimmed, alone) counts as empty.
 * Signed in handoff/legal/T-511-copy-rulings-ajay.md, AJ-644-M1 (T-644):
 *          plaintiff_name and defendant_name, with their EN and HI messages
 *          (byte for byte), in the §(j)2 parties position, plaintiff first.
 * And T-611 FR-5 / FR-5a: one file, imported by intake-brief.ts and (after
 * T-637) by the form route, so the strings are never duplicated.
 *
 * Pure: no I/O, no imports, so any route can call it.
 */

/**
 * §(j)2: the field order of the messages, after the court: the parties
 * (T-644, AJ-644-M1: plaintiff before defendant), then main_suit_relief,
 * restraint_sought.
 */
export const O39_REQUIRED_FIELDS = [
  'plaintiff_name',
  'defendant_name',
  'main_suit_relief',
  'restraint_sought',
] as const;

export type O39RequiredField = (typeof O39_REQUIRED_FIELDS)[number];

/** §(g): the signed messages. EN is served; HI is kept for the Hindi mechanism (§(i)5). */
export const O39_CONFIRM_MESSAGES: Readonly<
  Record<O39RequiredField, { readonly en: string; readonly hi: string }>
> = {
  // T-644: signed in AJ-644-M1 (handoff/legal/T-511-copy-rulings-ajay.md, 84311835).
  plaintiff_name: {
    en: "Add the plaintiff's name to continue.",
    hi: 'आगे बढ़ने के लिए वादी का नाम जोड़िए।',
  },
  defendant_name: {
    en: "Add the defendant's name to continue.",
    hi: 'आगे बढ़ने के लिए प्रतिवादी का नाम जोड़िए।',
  },
  main_suit_relief: {
    en: 'Add the relief sought in the main suit to continue.',
    hi: 'आगे बढ़ने के लिए मुख्य वाद में माँगी गई राहत जोड़िए।',
  },
  restraint_sought: {
    en: 'Add the acts the defendant should be restrained from, to continue.',
    hi: 'आगे बढ़ने के लिए वे कार्य जोड़िए जिनसे प्रतिवादी को रोका जाना है।',
  },
};

/** §(j)3: answers that count as empty for these fields (case-insensitive, trimmed, alone). */
export const O39_NON_ANSWERS: readonly string[] = [
  'Not known',
  'unknown',
  'NA',
  'N/A',
  'nil',
  'none',
  '-',
  '?',
  'नहीं पता',
  'पता नहीं',
];

function fold(v: string): string {
  return v.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

const NON_ANSWERS = new Set(O39_NON_ANSWERS.map(fold));

/**
 * AJ-683-M2 (handoff/legal/T-511-copy-rulings-ajay.md; replaces the AJ-671-M1
 * list) and AJ-671-M2 (temporal fillers): the courtesy/filler tail words and
 * phrases, byte for byte as signed. A phrase strips as a whole. Dropped from
 * the END of a value for the non-answer check only, never from what is stored.
 */
export const COURTESY_TAIL_WORDS: readonly string[] = [
  'sir',
  'sirji',
  'ji',
  'jee',
  'madam',
  "ma'am",
  'maam',
  'mam',
  'saab',
  'saheb',
  'sahab',
  'sahib',
  'bhai',
  'bhaiya',
  'bhaiyya',
  'didi',
  'please',
  'pls',
  'plz',
  'yaar',
  'ok',
  'okay',
  'जी',
  'सर',
  'साहब',
  'साहेब',
  'मैडम',
  'भाई',
  'भैया',
  'दीदी',
  'कृपया',
  // AJ-671-M2: temporal fillers, stripped the same way.
  'yet',
  'as yet',
  'abhi',
  'abhi tak',
  'as of now',
  'at present',
  'currently',
  'for now',
  'अभी',
  'अभी तक',
];

const COURTESY_TAIL = COURTESY_TAIL_WORDS.map((w) => w.normalize('NFC').toLowerCase()).sort(
  (x, y) => y.length - x.length,
);

/** End punctuation and spaces, allowed between and after tail words. */
const TAIL_GAP = /[\s.,!?;:।॥…]+$/u;

/**
 * AJ-683-M2: the value without one or more trailing courtesy words (whole
 * words, case-insensitive, optional end punctuation between and after them),
 * for the non-answer check only. "pata nahi sir ji" -> "pata nahi",
 * "Not known bhai." -> "Not known", "Ramesh Bhai" -> "Ramesh" (still a name,
 * so it passes). A value made only of tail words ("Sir") comes back unchanged:
 * it is not a non-answer by itself. "Ji Ram" is unchanged: tail words only.
 */
export function stripCourtesyTail(value: string): string {
  // Whitespace collapsed so a phrase ("abhi  tak") matches as one.
  let rest = value.normalize('NFC').replace(/\s+/g, ' ');
  let stripped = false;
  for (;;) {
    const body = rest.replace(TAIL_GAP, '');
    const lower = body.toLowerCase();
    // The cut below is by length; if lower-casing changed it, strip nothing more.
    if (lower.length !== body.length) break;
    const word = COURTESY_TAIL.find(
      (w) =>
        lower.endsWith(w) &&
        (lower.length === w.length ||
          !/[\p{L}\p{M}\p{N}']/u.test(lower[lower.length - w.length - 1])),
    );
    if (word === undefined) break;
    rest = body.slice(0, body.length - word.length);
    stripped = true;
  }
  if (!stripped) return value;
  const out = rest.replace(TAIL_GAP, '').trim();
  return out === '' ? value : out;
}

/**
 * §(j)3: true when the value gives nothing: null, blank, an empty list, or a
 * non-answer from the list as the whole value. A list is empty when every
 * entry is.
 */
export function isEmptyOrNonAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.every(isEmptyOrNonAnswer);
  if (typeof value !== 'string') return false;
  const folded = fold(value);
  return folded === '' || NON_ANSWERS.has(folded);
}

/**
 * AJ-668-M5, M5b, M5c, M5d: what may follow a §(j)3 non-answer at the start
 * of a party name: optional whitespace, then an opening bracket, a comma, a
 * semicolon or a colon; or (M5d) a full stop that ends the value or is
 * followed by whitespace and then a non-letter (any script: `\p{L}`), so
 * `nil.` and `nil. (see below)` block while `Na. Muthukumar` stays a name; or
 * (M5c) whitespace and then a hyphen or an en dash, so `Na-Young Kim` and
 * `Nil-Kanth` stay names while `N/A - to be traced` blocks. A bare `-` is a
 * non-answer by equality. A space then a word does not count (M5b replaces
 * M5's "space"), so `Not Known Traders` stays a name.
 */
export const NON_ANSWER_TAIL = /^(\s*[(,;:]|\s*\.(?:$|\s+[^\p{L}\s])|\s+[-–])/u;

/**
 * AJ-668-M5, M5b (handoff/legal/T-511-copy-rulings-ajay.md), party-name fields
 * only: true when isEmptyOrNonAnswer is, or when the value (trimmed,
 * case-insensitive) begins with a non-answer from O39_NON_ANSWERS followed by
 * NON_ANSWER_TAIL. Never inside a word: `Nilesh` is not `nil`, `Nagendra` is
 * not `NA`, `Unknownia` is not `unknown`. A list is a non-answer when every
 * entry is.
 *
 * AJ-668c-M6: for the check only, one leading role label (LEADING_ROLE_LABEL)
 * is stripped first and M5 to M5d apply to what remains, so `Defendant: Not
 * known` and a bare `Defendant` block, while `Respondent: Not Known Traders`
 * stays a name. The stored and printed value is never changed.
 */
export function isPartyNonAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(isPartyNonAnswer);
  if (isEmptyOrNonAnswer(value)) return true;
  if (typeof value !== 'string') return false;
  const folded = fold(value);
  if (startsWithNonAnswer(folded)) return true;
  const label = LEADING_ROLE_LABEL.exec(folded);
  if (label === null) return false;
  const rest = folded.slice(label[0].length);
  return isEmptyOrNonAnswer(rest) || startsWithNonAnswer(rest);
}

/** AJ-668-M5 to M5d on a folded value: a non-answer then NON_ANSWER_TAIL. */
function startsWithNonAnswer(folded: string): boolean {
  for (const answer of NON_ANSWERS) {
    if (folded.startsWith(answer) && NON_ANSWER_TAIL.test(folded.slice(answer.length))) {
      return true;
    }
  }
  return false;
}

/**
 * AJ-668c-M6 (handoff/legal/T-511-copy-rulings-ajay.md): the role labels, as
 * whole words on a folded value (case-insensitive, whitespace collapsed),
 * singular or plural. English, Hindi (with -गण) and Hinglish, as listed.
 */
const ROLE_LABEL_WORDS = [
  'plaintiffs?',
  'defendants?',
  'applicants?',
  'petitioners?',
  'respondents?',
  'complainants?',
  'accused',
  'appellants?',
  'opposite part(?:y|ies)',
  'part(?:y|ies)',
  'names?',
  '(?:वादी|प्रतिवादी|आवेदक|याचिकाकर्ता|प्रत्यर्थी|परिवादी|शिकायतकर्ता|अभियुक्त|आरोपी|विपक्षी|नाम)(?:-?\\s?गण)?',
  'vadi',
  'prativadi',
  'aavedak',
  'avedak',
  'abhiyukt',
  'aaropi',
  'aropi',
].join('|');

/** AJ-668c-M6 numbering after a label: `No.`/`No`/`#`/`संख्या`/`नं.` plus digits, or bare digits. */
const ROLE_LABEL_NUMBER = '(?:\\s*(?:(?:no\\.?|#|संख्या|नं\\.)\\s*)?\\d+)?';

/** AJ-668c-M6 abbreviations: P, D, R or A followed directly by a number (P1, D-2). */
const ROLE_LABEL_ABBREVIATION = '[pdra]-?\\d+';

/**
 * AJ-668c-M6: one leading role label, with an optional leading "the" and its
 * numbering, then the separator: whitespace, or optional whitespace, one of
 * `:` `-` `–` `—`, optional whitespace. At the end of the value it is a bare
 * label, which blocks (a role is not a name).
 */
const LEADING_ROLE_LABEL = new RegExp(
  `^(?:the\\s+)?(?:(?:${ROLE_LABEL_WORDS})${ROLE_LABEL_NUMBER}|${ROLE_LABEL_ABBREVIATION})(?:\\s*[:\\-–—]\\s*|\\s+|$)`,
  'u',
);

/**
 * AJ-668-M5, M5b: the party-name keys among the guarded fields. The ledger
 * (ledgerGivenKeys) reads these with isPartyNonAnswer, pack-neutral per
 * AJ-655-M1; the other guarded keys keep isEmptyOrNonAnswer.
 */
export function isPartyNameGuardedField(key: string): boolean {
  return key === 'plaintiff_name' || key === 'defendant_name';
}

/**
 * AJ-668-M5a (LEGAL CONTENT, Ajay): signed confirm lines for one generic
 * brief field, keyed by its item key (FIXED_KEYS.otherParty in intake-brief.ts).
 * Its label starts with "The", and the T-127 line would end "addressed to to
 * continue", so this field has its own signed line. EN only, as signed.
 */
export const GENERIC_PARTY_LINE_OVERRIDES: Readonly<Record<string, string>> = {
  'fixed.other_party':
    'Add the name of the person or authority this is against or addressed to, to continue.',
};

/**
 * Pack-neutral, key only: true for a field id on the O.39 list, in any pack.
 * AJ-655-M1 (T-655, handoff/legal/T-511-copy-rulings-ajay.md): "A non-answer is no fact on every path and in every pack (FR-9, M3)."
 * The fact ledger (ledgerGivenKeys) uses this so that a non-answer on one of
 * these keys counts as not given in every pack. Do not pack-scope it.
 */
export function isNoFactGuardedField(key: string): key is O39RequiredField {
  return (O39_REQUIRED_FIELDS as readonly string[]).includes(key);
}

/** T-666: the pack whose required fields these are. */
const O39_PACK_ID = 'temporary_injunction_o39';

/**
 * T-666: pack-scoped. True for a field that has a signed O.39 message here,
 * on the O.39 pack only: the same field id in another pack is not O.39-required.
 */
export function isO39RequiredField(packId: string | null, key: string): key is O39RequiredField {
  return packId === O39_PACK_ID && isNoFactGuardedField(key);
}

/**
 * T-668: the packs where a required party name that is a §(j)3 non-answer
 * (O39_NON_ANSWERS) counts as missing at confirm, as on O.39.
 * AJ-668-M1 (handoff/legal/T-511-copy-rulings-ajay.md): the plaint packs plus
 * replication and written_statement; party-name fields only; bail/applicant
 * names are out (T-671); the existing list and lines, no new strings. The form
 * route is in (AJ-668-M2, AJ-668-M3): form-ledger formRequiredFieldBlock uses
 * this list too.
 */
export const NON_ANSWER_PARTY_PACKS: readonly string[] = [
  'plaint_declaration',
  'plaint_eviction',
  'plaint_injunction',
  'plaint_recovery',
  'plaint_specific_performance',
  'plaint_partition',
  'replication',
  'written_statement',
];

/** T-668 (AJ-668-M1): true for a pack on NON_ANSWER_PARTY_PACKS. */
export function isNonAnswerPartyPack(packId: string | null): boolean {
  return packId !== null && NON_ANSWER_PARTY_PACKS.includes(packId);
}

/**
 * The required fields still empty (or a non-answer), in §(j)2 order, each
 * with its signed EN message. `values` is keyed by field id. AJ-668-M5e: the
 * party names (plaintiff_name, defendant_name) use isPartyNonAnswer, so a
 * non-answer with a tail blocks; main_suit_relief and restraint_sought keep
 * the exact isEmptyOrNonAnswer.
 */
export function requiredFieldBlockers(
  values: Readonly<Record<string, unknown>>,
): Array<{ key: O39RequiredField; en: string }> {
  return O39_REQUIRED_FIELDS.filter((key) =>
    (isPartyNameGuardedField(key) ? isPartyNonAnswer : isEmptyOrNonAnswer)(values[key]),
  ).map((key) => ({
    key,
    en: O39_CONFIRM_MESSAGES[key].en,
  }));
}

/**
 * T-661: signed ask lines for fields outside O.39, keyed by pack id, then by
 * field id (LEGAL CONTENT, Ajay). A per-pack map, since the same field id can
 * have a different signed line in another pack (O.39 has its own
 * defendant_name line above). EN is served; HI is kept for the Hindi
 * mechanism, as for O.39.
 *
 * Signed in handoff/legal/T-650-party-fields-signed.md:
 *   (3g) plaint_partition other_defendants;
 *   (3h) plaint_partition defendant_name (replaces the interim generic line
 *        built from the label).
 * replication and written_statement have no signed ask lines, so they keep
 * the generic T-127 line.
 */
export const PACK_CONFIRM_MESSAGES: Readonly<
  Record<string, Readonly<Record<string, { readonly en: string; readonly hi: string }>>>
> = {
  plaint_partition: {
    // (3g)
    other_defendants: {
      en: 'Say whether there are other defendants to continue.',
      hi: 'आगे बढ़ने के लिए बताइए कि क्या अन्य प्रतिवादी भी हैं।',
    },
    // (3h)
    defendant_name: {
      en: 'Add the name of Defendant No. 1 to continue.',
      hi: 'आगे बढ़ने के लिए प्रतिवादी संख्या 1 का नाम जोड़िए।',
    },
  },
};

/** T-661: the signed line for a field in a pack, or null when none is signed. */
export function signedConfirmMessage(
  packId: string | null,
  fieldId: string,
): { readonly en: string; readonly hi: string } | null {
  if (packId === null) return null;
  const pack = Object.prototype.hasOwnProperty.call(PACK_CONFIRM_MESSAGES, packId)
    ? PACK_CONFIRM_MESSAGES[packId]
    : undefined;
  if (pack === undefined || !Object.prototype.hasOwnProperty.call(pack, fieldId)) return null;
  return pack[fieldId];
}
