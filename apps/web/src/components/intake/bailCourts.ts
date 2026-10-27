/**
 * T-425 (Ajay 69c8cbe): shared by the brief's CourtPicker and the classic form
 * (DynamicFormRenderer), so both offer only courts where a bail pack lies.
 */

/**
 * The bail packs, by exact id. For these the court lists are asked for with
 * `template=<id>`, so the server leaves out courts where the pack does not lie.
 * Must match BAIL_TEMPLATE_IDS in apps/drafting/src/routes/courts.routes.ts.
 */
export const BAIL_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  'bail_regular',
  'bail_anticipatory',
  'bail_before_magistrate',
  'default_bail',
  'interim_bail',
  'bail_cancellation',
]);

/** True for one of the six bail packs. */
export function isBailTemplate(templateId: string | null | undefined): boolean {
  return typeof templateId === 'string' && BAIL_TEMPLATE_IDS.has(templateId);
}

/**
 * T-482 (Ajay 16 Oct 2026): maintenance_bnss_144 asks for its court lists with
 * `template=<id>` too: a Family Court where one is listed, otherwise a JMFC. The server's
 * `family_court` type exists only in this scope. Must match the maintenance entry of
 * TEMPLATE_COURT_FILTER in apps/drafting/src/routes/courts.routes.ts.
 */
export const MAINTENANCE_TEMPLATE_ID = 'maintenance_bnss_144';

/**
 * True when the brief's court lists are scoped by `template=<id>` in the generic
 * state + type + court picker: the bail packs (T-425) and maintenance (T-482).
 */
export function isScopedCourtTemplate(templateId: string | null | undefined): boolean {
  return (
    isBailTemplate(templateId) ||
    templateId === MAINTENANCE_TEMPLATE_ID ||
    templateId === 'temporary_injunction_o39'
  );
}

/** T-425 (AC3): added to a saved choice the scoped list no longer offers. */
export const NOT_OFFERED_SUFFIX = ' (not offered for this document)';

/** T-425 (AC3): names for a saved court type the scoped /types list leaves out. */
export const SAVED_TYPE_NAMES: Readonly<Record<string, string>> = {
  cjm: 'Chief Judicial Magistrate',
  jmfc: 'Judicial Magistrate First Class',
  district_court: 'District Court',
  civil_court: 'Civil Court (Senior Division)',
  consumer_commission: 'Consumer Commission',
  supreme_court: 'Supreme Court',
  tribunal: 'Tribunal',
  // T-482: the maintenance scope's derived type.
  family_court: 'Family Court',
};
