/**
 * T-629: the O.39 required fields that block Confirm (LEGAL CONTENT, Ajay).
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

/** True for a field that has a signed message here. */
export function isO39RequiredField(key: string): key is O39RequiredField {
  return (O39_REQUIRED_FIELDS as readonly string[]).includes(key);
}

/**
 * The required fields still empty (or a non-answer), in §(j)2 order, each
 * with its signed EN message. `values` is keyed by field id.
 */
export function requiredFieldBlockers(
  values: Readonly<Record<string, unknown>>,
): Array<{ key: O39RequiredField; en: string }> {
  return O39_REQUIRED_FIELDS.filter((key) => isEmptyOrNonAnswer(values[key])).map((key) => ({
    key,
    en: O39_CONFIRM_MESSAGES[key].en,
  }));
}
