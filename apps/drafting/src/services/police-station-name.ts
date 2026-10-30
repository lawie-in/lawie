/**
 * The police-station name a template prints after its own "Police Station"
 * (T-638; Ajay, T-612 (6a) and (6b), amending AJ-2026-10-08-T139 C2).
 *
 * A leaf module with no imports, so the template engine and the annexures can
 * both use it without an import cycle. The ledger (`bareStationName`) and the
 * D1 renderer (`stripPoliceStationPrefix`) keep their own copies of the same
 * table. Matching data only: nothing here is ever printed.
 *
 * One marker is removed per stage, in this order:
 * 1. a trailing, else a leading `PS`, `P.S.`, `P S` or `Police Station`
 *    (any case), as a whole marker next to a separator;
 * 2. a trailing, else a leading `पुलिस स्टेशन` or `पुलिस थाना`, which is never
 *    part of a name;
 * 3. a leading `Thana` / `थाना` only when `:`, `-` or `–` follows it
 *    ("Thana: Kotwali"); a leading bare "Thana Bhawan" / "थाना भवन" keeps it;
 * 4. a trailing `Thana` / `थाना`, the last word with a name before it.
 *
 * A value that is only a marker, or a marker glued to the name ("KotwaliPS",
 * "Psalm Nagar", "Chaps"), is left as written.
 */

const PS_TRAIL = /[\s.:,\-–]+(?:police\s+station|p\.?\s*s\.?)\s*$/iu;
const PS_LEAD = /^(?:police\s+station|p\.?\s*s\.?)(?=[\s.:,\-–])[\s.:,\-–]*/iu;
const HINDI_TRAIL = /[\s.:,\-–]+(?:पुलिस\s+स्टेशन|पुलिस\s+थाना)\s*$/u;
const HINDI_LEAD = /^(?:पुलिस\s+स्टेशन|पुलिस\s+थाना)[\s.:,\-–]+/u;
const THANA_LEAD = /^(?:thana|थाना)\s*[:\-–]\s*/iu;
const THANA_TRAIL = /[\s.:,\-–]+(?:thana|थाना)\s*$/iu;

const TRAILING: readonly RegExp[] = [PS_TRAIL, HINDI_TRAIL, THANA_TRAIL];
const ONE_STAGE: readonly RegExp[] = [
  PS_TRAIL,
  PS_LEAD,
  HINDI_TRAIL,
  HINDI_LEAD,
  THANA_LEAD,
  THANA_TRAIL,
];

function firstStrip(value: string, table: readonly RegExp[]): string {
  const v = value.trim();
  for (const re of table) {
    const rest = v.replace(re, '').trim();
    if (rest !== v && rest !== '') return rest;
  }
  return v;
}

/** One stage of the table: at most one marker removed. */
export function stripStationMarkerOnce(value: string): string {
  return firstStrip(value, ONE_STAGE);
}

/**
 * A raw value typed into a template form: the table applied twice, as the
 * ledger stores and the renderer prints (T-612 (6b)3, option A). "PS PS
 * Kadamkuan" gives "Kadamkuan"; "PS Thana Bhawan" gives "Thana Bhawan".
 */
export function policeStationName(value: string): string {
  return stripStationMarkerOnce(stripStationMarkerOnce(value));
}

/** One trailing marker only (PS, P.S., P S, Police Station, पुलिस स्टेशन, पुलिस थाना, Thana, थाना). */
export function stripTrailingStationMarker(value: string): string {
  return firstStrip(value, TRAILING);
}
