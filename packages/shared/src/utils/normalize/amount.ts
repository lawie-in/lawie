/**
 * Amounts (T-147a criterion 2). `3 lakh`, `3 lakhs`, `3 lac`, `3L`,
 * `3,00,000`, `300000`, `३ लाख` and `तीन लाख` are all 300000 rupees, shown as
 * `Rs 3,00,000`. Crore, thousand, `k` and compounds (`1 crore 20 lakh`) work
 * the same way. Arithmetic is exact (BigInt paise), never floating point.
 */
import { asText, compareWith, devanagariToArabic, Normalized, Comparison, unresolved } from './common';

/** Powers of ten for each unit word. Keys are NFC lower case. */
const UNIT_WORDS: ReadonlyArray<readonly [readonly string[], number]> = [
  [['crore', 'crores', 'cr', 'cr.', 'करोड़', 'करोड'], 7],
  [['lakh', 'lakhs', 'lac', 'lacs', 'laakh', 'l', 'लाख'], 5],
  [['thousand', 'thousands', 'k', 'hazaar', 'hazar', 'hajar', 'हज़ार', 'हजार'], 3],
  [['hundred', 'sau', 'सौ'], 2],
];
const UNITS = new Map<string, number>(
  UNIT_WORDS.flatMap(([words, exp]) => words.map((w) => [w.normalize('NFC'), exp] as [string, number])),
);

/**
 * Number words, accepted only in front of a unit ("teen lakh", "डेढ़ लाख").
 * Each is [integer digits, fraction digits], so 1.5 stays exact.
 */
const NUMBER_WORD_LIST: ReadonlyArray<readonly [readonly string[], string, string]> = [
  [['one', 'ek', 'एक'], '1', ''],
  [['two', 'do', 'दो'], '2', ''],
  [['three', 'teen', 'तीन'], '3', ''],
  [['four', 'char', 'chaar', 'चार'], '4', ''],
  [['five', 'panch', 'paanch', 'पांच', 'पाँच'], '5', ''],
  [['six', 'chhah', 'chhe', 'छह', 'छः'], '6', ''],
  [['seven', 'saat', 'सात'], '7', ''],
  [['eight', 'aath', 'आठ'], '8', ''],
  [['nine', 'nau', 'नौ'], '9', ''],
  [['ten', 'das', 'दस'], '10', ''],
  [['dedh', 'derh', 'डेढ़', 'डेढ'], '1', '5'],
  [['dhai', 'adhai', 'ढाई', 'अढ़ाई'], '2', '5'],
];
const NUMBER_WORDS = new Map<string, readonly [string, string]>(
  NUMBER_WORD_LIST.flatMap(([words, int, frac]) =>
    words.map((w) => [w.normalize('NFC'), [int, frac] as const] as [string, readonly [string, string]]),
  ),
);

/** Words that may join two parts of a compound amount: "1 crore and 20 lakh". */
const JOINERS = new Set(['and', 'aur', 'और', 'evam', 'एवं']);

const CURRENCY_LEAD = /^(?:rs\.?|inr|₹|rupees?|rupaye|रु\.?|रुपये|रुपए|रुपया)\s*/u;
const CURRENCY_TAIL = /\s*(?:\/-|\/|-|rupees?|rupaye|rs\.?|inr|only|रुपये|रुपए|रुपया|मात्र)$/u;

const NUMBER_TOKEN = /^(\d[\d,]*)(?:\.(\d+))?$/;
const INDIAN_GROUPING = /^\d{1,2}(?:,\d{2})*,\d{3}$/;
const WESTERN_GROUPING = /^\d{1,3}(?:,\d{3})+$/;

const MAX_SAFE_PAISE = BigInt(Number.MAX_SAFE_INTEGER);

/** `300000` -> `3,00,000`: the last three digits, then groups of two. */
export function formatIndianDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) groups.unshift(rest);
  return `${groups.join(',')},${last3}`;
}

/** `Rs 3,00,000`, or `Rs 3,00,000.50` when there are paise. */
export function formatRupees(paise: bigint): string {
  const rupees = paise / 100n;
  const rem = paise % 100n;
  const head = `Rs ${formatIndianDigits(rupees.toString())}`;
  return rem === 0n ? head : `${head}.${rem.toString().padStart(2, '0')}`;
}

/** Integer and fraction digits of one number token, or null if it is not a number. */
function readNumber(token: string): { int: string; frac: string } | { error: 'bad_digit_grouping' } | null {
  const word = NUMBER_WORDS.get(token);
  if (word) return { int: word[0], frac: word[1] };
  const m = NUMBER_TOKEN.exec(token);
  if (!m) return null;
  const rawInt = m[1];
  if (rawInt.includes(',') && !INDIAN_GROUPING.test(rawInt) && !WESTERN_GROUPING.test(rawInt)) {
    return { error: 'bad_digit_grouping' };
  }
  return { int: rawInt.replace(/,/g, ''), frac: (m[2] ?? '').replace(/0+$/, '') };
}

/** Paise for `int.frac × 10^exp`, or null if that leaves a fraction of a paisa. */
function toPaise(int: string, frac: string, exp: number): bigint | null {
  const shift = exp + 2 - frac.length;
  if (shift < 0) return null;
  return BigInt(int + frac) * 10n ** BigInt(shift);
}

function stripCurrency(text: string): string {
  let s = text;
  for (let i = 0; i < 4; i += 1) {
    const next = s.replace(CURRENCY_LEAD, '').replace(CURRENCY_TAIL, '').trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * Normalise an amount to rupees. Total: junk, negatives, mixed digit grouping
 * and fractions of a paisa come back as an `unresolved` reason.
 */
export function normalizeAmount(input: unknown): Normalized<number> {
  const t = asText(input);
  if (!t.ok) return t;
  const s = stripCurrency(devanagariToArabic(t.text).normalize('NFC').toLowerCase().trim());
  if (s === '') return unresolved('empty', 'There is no number in the amount.');
  if (/^(?:-|minus\b|−)/u.test(s)) return unresolved('negative_amount', 'The amount is negative.');

  // "3l", "3lakh", "50k" -> "3 l", "3 lakh", "50 k".
  const spaced = s.replace(/(\d)(?=[^\d\s.,])/gu, '$1 ');
  const tokens = spaced.split(/\s+/).filter((tok) => tok !== '' && !JOINERS.has(tok));

  let total = 0n;
  let lastExp = Number.POSITIVE_INFINITY;
  let i = 0;
  while (i < tokens.length) {
    const num = readNumber(tokens[i]);
    if (num === null) return unresolved('unrecognised', `"${tokens[i]}" is not a number we can read.`);
    if ('error' in num) return unresolved(num.error, 'The commas are not Indian or international digit grouping.');
    const isWord = NUMBER_WORDS.has(tokens[i]);
    const unit = i + 1 < tokens.length ? UNITS.get(tokens[i + 1]) : undefined;
    if (unit === undefined) {
      // A bare number: only a plain numeral, and only as the last part.
      if (isWord || i + 1 < tokens.length) {
        return unresolved('unrecognised', 'The amount has a part we cannot read.');
      }
      // After a unit, a bare number must fill exactly the zeros that unit
      // leaves ("2 lakh 50000"). "3 lakh 50" could be Rs 3,00,050 or
      // 3.5 lakh, so it is not guessed.
      if (lastExp !== Number.POSITIVE_INFINITY && num.int.length !== lastExp) {
        return unresolved('unrecognised', 'The number after the unit could be read more than one way.');
      }
      const p = toPaise(num.int, num.frac, 0);
      if (p === null) return unresolved('fractional_paise', 'The amount has a fraction of a paisa.');
      total += p;
      i += 1;
      continue;
    }
    if (unit >= lastExp) return unresolved('unrecognised', 'The units of the amount are out of order.');
    const p = toPaise(num.int, num.frac, unit);
    if (p === null) return unresolved('fractional_paise', 'The amount has a fraction of a paisa.');
    total += p;
    lastExp = unit;
    i += 2;
  }
  if (total > MAX_SAFE_PAISE) return unresolved('amount_too_large', 'The amount is too large to hold exactly.');
  return { ok: true, value: Number(total) / 100, display: formatRupees(total) };
}

/** Equal when both normalise to the same number of paise. */
export function compareAmounts(a: unknown, b: unknown): Comparison {
  return compareWith(normalizeAmount, (v) => String(Math.round(v * 100)), a, b);
}
