/**
 * The one police-station strip (T-500, Arjun's go of 16 Oct 2026). Every place
 * that prints a police station after its own "Police Station" / "P.S." / "PS"
 * reads the value through `policeStationName`: the D1 renderer (body), the
 * template engine (cause title, prayer) and the annexures.
 *
 * Rules:
 * - Ajay, T-334 Addendum 2 and T-500 (088fc4f7): the label words ("Police
 *   Station", "P.S.", "PS", "Thana", and the Hindi पुलिस थाना, थाना, पुलिस
 *   स्टेशन of AJ-2026-10-08-T139) are removed from the front and the end of the
 *   value, so the label never prints twice.
 * - Ajay, 2e536158 point (5) as narrowed by AJ-500-M1 (c0d21891): a place
 *   the advocate marked with District, Distt. or Zila prints as
 *   ", District {district}"; any other place prints as written (a seat town
 *   is not a district); nothing is dropped. No court list is read.
 *
 * Matching data only. The ledger and the brief keep the advocate's words.
 */
/**
 * Ajay (T-334 Addendum 2): the English label forms, as word sequences. Matching
 * data only, never printed.
 */
export const POLICE_STATION_PREFIXES: ReadonlyArray<readonly string[]> = [
  ['police', 'station'],
  ['p', 's'],
  ['ps'],
  ['thana'],
];

/** A station word ending a value, with what separates it from the name before it. */
const STATION_SUFFIX =
  /[\s,]+(?:p\.?\s?s\.?|thana|police\s+station|पुलिस\s+थाना|थाना|पुलिस\s+स्टेशन)\s*$/i;

/** The Hindi leading labels (AJ-2026-10-08-T139), as regex fragments. */
const HINDI_PREFIXES = ['पुलिस\\s+स्टेशन', 'पुलिस\\s+थाना', 'थाना'];

/**
 * AJ-2026-10-08-T139 1(c): a trailing PS, P.S., thana, police station,
 * पुलिस थाना, थाना or पुलिस स्टेशन is removed. A value that is only the station
 * word is left as it is. (Moved from template-engine.service.ts unchanged.)
 */
export function stripStationSuffix(value: string): string {
  const stripped = value.replace(STATION_SUFFIX, '').trim();
  return stripped === '' ? value : stripped;
}

/**
 * SCRUM-63: one leading prefix (regex fragment) removed, or the value as it is
 * when none matched or nothing would be left (AJ-2026-10-08-T139-A1). Moved
 * from template-engine.service.ts unchanged.
 */
function stripLeadingPrefix(value: string, prefixes: string[]): string {
  for (const prefix of prefixes) {
    const re = new RegExp(`^${prefix}[\\s.]+`, 'i');
    if (re.test(value)) {
      const stripped = value.replace(re, '').trim();
      if (stripped === '') return value;
      // AJ-2026-10-08-T139-final C2: a leading bare थाना may be part of the
      // station's name ("थाना भवन"). It is kept when the rest is one word, or
      // when a station word also ends the value.
      if (prefix === 'थाना' && (!/\s/.test(stripped) || STATION_SUFFIX.test(value))) return value;
      return stripped;
    }
  }
  return value;
}

/** The words of a text with their positions; "." ":" "," "-" and spaces separate words. */
function stationWords(v: string): Array<{ word: string; start: number; end: number }> {
  return [...v.matchAll(/[^\s.:,-]+/gu)].map((m) => ({
    word: m[0].toLowerCase(),
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}

/**
 * The English labels removed from the front and the end of one part, as often
 * as one is there. Whole words only: "PSKadamkuan", "Psalm Nagar" and
 * "Station Road" keep their words. A part that is a label and nothing else
 * becomes "".
 */
function stripEnglishLabels(part: string, keepLeadingThana: boolean): string {
  let v = part.trim();
  for (let changed = true; changed && v !== ''; ) {
    changed = false;
    const words = stationWords(v);
    for (const label of POLICE_STATION_PREFIXES) {
      const n = label.length;
      if (words.length < n) continue;
      // AJ-2026-10-08-T139-final C2, as for थाना: a leading "Thana" is part of the name
      // ("Thana Bhawan PS") when a station word also ends the value.
      const leadingKept = keepLeadingThana && n === 1 && label[0] === 'thana';
      if (!leadingKept && label.every((w, i) => words[i].word === w)) {
        v = words.length === n ? '' : v.slice(words[n].start).trim();
        changed = true;
        break;
      }
      if (label.every((w, i) => words[words.length - n + i].word === w)) {
        v = words.length === n ? '' : v.slice(0, words[words.length - n - 1].end).trim();
        changed = true;
        break;
      }
    }
  }
  return v;
}

/** One comma part with every label removed (English, then Hindi), until nothing changes. */
function stripPart(part: string): string {
  let v = part.trim();
  const words = stationWords(v);
  const endsWithLabel =
    STATION_SUFFIX.test(v) ||
    POLICE_STATION_PREFIXES.some(
      (l) =>
        words.length > l.length && l.every((w, i) => words[words.length - l.length + i].word === w),
    );
  for (let i = 0; i < 8; i++) {
    const next = stripStationSuffix(
      stripLeadingPrefix(stripEnglishLabels(v, endsWithLabel), HINDI_PREFIXES),
    );
    if (next === v) break;
    v = next;
  }
  return v;
}

/** The district markers Ajay names (AJ-500-M1): District, Distt., Zila. Matching data only. */
const DISTRICT_WORD = '(?:district|distt|zila)';

/** "Distt. Patna", "Zila Patna", "District: Patna": the marker before the place. */
const MARKER_BEFORE = new RegExp(`^${DISTRICT_WORD}\\b\\.?[\\s.:-]*(\\S.*)$`, 'i');

/** "Patna District", "Patna Zila": the marker after the place. */
const MARKER_AFTER = new RegExp(`^(\\S.*?)\\s+${DISTRICT_WORD}\\.?$`, 'i');

/** "Kadamkuan Distt. Patna" in one part: the station, then the marker and the place. */
const MARKER_INSIDE = new RegExp(`^(\\S.*?)\\s+${DISTRICT_WORD}\\b\\.?[\\s.:-]*(\\S.*)$`, 'i');

/**
 * The parts of a stripped value with the district marked as Ajay ruled
 * (AJ-500-M1, c0d21891): a place the advocate marked with District, Distt. or
 * Zila prints as "District {place}"; any other place prints as written (a seat
 * town is not a district). Nothing is dropped.
 */
function withDistrict(parts: string[]): string[] {
  const out: string[] = [];
  parts.forEach((p, i) => {
    if (i === 0) {
      const inside = MARKER_INSIDE.exec(p);
      if (inside) {
        out.push(inside[1].trim(), `District ${inside[2].trim()}`);
        return;
      }
      out.push(p);
      return;
    }
    const m = MARKER_BEFORE.exec(p) ?? MARKER_AFTER.exec(p);
    out.push(m ? `District ${m[1].trim()}` : p);
  });
  return out;
}

/**
 * The police-station value as it prints after the signed "Police Station":
 * every label removed from each comma part; a place the advocate marked as a
 * district (District, Distt., Zila) printed as "District {place}"; any other
 * place as written; nothing dropped. A value that is a label and nothing else
 * is left as it is (nothing to print instead).
 *
 * "Kadamkuan Police Station, Distt. Patna" gives "Kadamkuan, District Patna";
 * "Kadamkuan Police Station, Patna" gives "Kadamkuan, Patna".
 */
export function policeStationName(value: string): string {
  const v = value.trim();
  const parts = v
    .split(',')
    .map(stripPart)
    .filter((p) => p !== '');
  if (parts.length === 0) return v;
  return withDistrict(parts).join(', ');
}
