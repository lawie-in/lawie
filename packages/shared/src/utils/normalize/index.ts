/**
 * The Fact Ledger normalizer (ADR-022 section 2A, T-147a). No LLM, no
 * network, no clock. Every function is pure and total: junk input returns an
 * `unresolved` reason, never a throw.
 */
export { devanagariToArabic } from './common';
export type { Normalized, Comparison } from './common';
export { normalizeAmount, compareAmounts, formatIndianDigits, formatRupees } from './amount';
export { normalizeDate, compareDates, formatIndianDate, MONTH_NAMES } from './date';
export type { DateOptions } from './date';
export {
  nameKey,
  normalizePersonName,
  normalizePlaceName,
  normalizeCourt,
  normalizePoliceStation,
  compareNames,
  comparePoliceStations,
} from './name';
export { normalizeSectionRef, compareSectionRefs } from './section';
export { normalizeCaseNumber, compareCaseNumbers } from './case-number';
export * from './confidence';
