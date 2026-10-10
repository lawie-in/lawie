/**
 * Names, places, courts and police stations (T-147a criterion 6).
 *
 * `value` is a comparison key only: case-, space- and punctuation-folded,
 * Devanagari digits read as Arabic. For police stations the station markers
 * `PS`, `P.S.`, `P S`, `Thana`, `थाना` and `Police Station` are folded away
 * too, so `PS Kotwali` and `Kotwali P.S.` compare equal.
 *
 * `display` is the advocate's input character for character. Nothing here
 * corrects, completes or transliterates a name: `Kotwli` stays `Kotwli`,
 * and `कोतवाली` does not equal `Kotwali`.
 */
import { asText, compareWith, devanagariToArabic, Normalized, Comparison, unresolved } from './common';

/** Lower-case words, punctuation and spacing removed. */
function words(text: string): string[] {
  return devanagariToArabic(text)
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w !== '');
}

/** The station markers, as word sequences after `words()`. Longest first. */
const STATION_MARKERS: readonly (readonly string[])[] = [
  ['police', 'station'],
  ['पुलिस', 'स्टेशन'],
  ['पुलिस', 'थाना'],
  ['p', 's'],
  ['ps'],
  ['thana'],
  ['thaana'],
  ['थाना'],
].map((m) => m.map((w) => w.normalize('NFKC')));

function startsWith(ws: string[], marker: readonly string[]): boolean {
  return marker.length < ws.length && marker.every((w, i) => ws[i] === w);
}

function endsWith(ws: string[], marker: readonly string[]): boolean {
  const off = ws.length - marker.length;
  return off > 0 && marker.every((w, i) => ws[off + i] === w);
}

/**
 * The station's own words with one marker removed, from one end only. A
 * trailing marker is taken first; a leading one only if there is no trailing
 * one. So in "Thana Bhawan PS" the marker is "PS" and "Thana" stays part of
 * the name, matching "PS Thana Bhawan". Never strips a marker that would
 * leave no words (startsWith/endsWith require a word to remain).
 */
function stationWords(ws: string[]): string[] {
  const tail = STATION_MARKERS.find((m) => endsWith(ws, m));
  if (tail) return ws.slice(0, ws.length - tail.length);
  const lead = STATION_MARKERS.find((m) => startsWith(ws, m));
  if (lead) return ws.slice(lead.length);
  return ws;
}

function keyed(input: unknown, fold: (ws: string[]) => string[]): Normalized<string> {
  const t = asText(input);
  if (!t.ok) return t;
  const ws = fold(words(t.text));
  if (ws.length === 0) return unresolved('empty', 'There are no letters or digits in the name.');
  return { ok: true, value: ws.join(''), display: t.text };
}

const same = (ws: string[]): string[] => ws;
const isMarker = (ws: string[]): boolean =>
  STATION_MARKERS.some((m) => m.length === ws.length && m.every((w, i) => ws[i] === w));
/** A station name given as only markers ("PS", "PS Thana") has no station words left. */
const station = (ws: string[]): string[] => {
  if (isMarker(ws)) return [];
  const rest = stationWords(ws);
  return isMarker(rest) ? [] : rest;
};

/** The comparison key of any proper noun. Exported for T-147d. */
export function nameKey(input: unknown): Normalized<string> {
  return keyed(input, same);
}

export function normalizePersonName(input: unknown): Normalized<string> {
  return keyed(input, same);
}

export function normalizePlaceName(input: unknown): Normalized<string> {
  return keyed(input, same);
}

export function normalizeCourt(input: unknown): Normalized<string> {
  return keyed(input, same);
}

export function normalizePoliceStation(input: unknown): Normalized<string> {
  return keyed(input, station);
}

export function compareNames(a: unknown, b: unknown): Comparison {
  return compareWith(nameKey, (v) => v, a, b);
}

export function comparePoliceStations(a: unknown, b: unknown): Comparison {
  return compareWith(normalizePoliceStation, (v) => v, a, b);
}
