/**
 * The 26 catalogue categories (T-239 table, Ajay's names, 12 Oct 2026; T-240).
 *
 * A template's `catalogueCategory` is one of these ids. It drives the library,
 * the filters, the seed (Mongo) and the web, and nothing else: the behaviour
 * value `TemplateConfig.category` (read from the rule file) is a different
 * field and is not changed by this list (Arjun, 12 Oct 2026).
 *
 * `id` is a stable slug: never rename one, because Mongo rows and saved
 * filters carry it. `name` is the display name, exactly as in T-239. `order`
 * is the T-239 row number, used to order the categories on screen.
 * Categories with no template yet (#9, #12, #19, #20, #25, #26) still belong here.
 */

export const CATALOGUE_CATEGORY_IDS = [
  'criminal_bail_custody',
  'criminal_complaints_police_trial',
  'criminal_appeals_revisions_quashing',
  'cheque_bounce_ni_act',
  'civil_plaints_suits',
  'civil_defence_interlocutory',
  'civil_appeals_revision_review_execution',
  'family_matrimonial',
  'succession_probate',
  'property_conveyancing',
  'rent_control_tenancy',
  'revenue_land_records',
  'consumer',
  'service_labour',
  'company_insolvency',
  'contracts_agreements',
  'writs_constitutional',
  'tax',
  'ip',
  'arbitration_commercial_courts',
  'rera',
  'mact',
  'notices_replies',
  'affidavits_court_forms',
  'rti',
  'banking_recovery_drt_sarfaesi',
] as const;

export type CatalogueCategoryId = (typeof CATALOGUE_CATEGORY_IDS)[number];

export interface CatalogueCategory {
  readonly id: CatalogueCategoryId;
  readonly name: string;
  readonly order: number;
}

const NAMES: Readonly<Record<CatalogueCategoryId, string>> = {
  criminal_bail_custody: 'Criminal: bail and custody',
  criminal_complaints_police_trial: 'Criminal: complaints, police, trial applications',
  criminal_appeals_revisions_quashing: 'Criminal: appeals, revisions, quashing',
  cheque_bounce_ni_act: 'Cheque bounce / NI Act',
  civil_plaints_suits: 'Civil: plaints and suits',
  civil_defence_interlocutory: 'Civil: defence and interlocutory',
  civil_appeals_revision_review_execution: 'Civil: appeals, revision, review, execution',
  family_matrimonial: 'Family and matrimonial',
  succession_probate: 'Succession and probate',
  property_conveyancing: 'Property and conveyancing',
  rent_control_tenancy: 'Rent control and tenancy',
  revenue_land_records: 'Revenue and land records',
  consumer: 'Consumer',
  service_labour: 'Service and labour',
  company_insolvency: 'Company and insolvency',
  contracts_agreements: 'Contracts and agreements',
  writs_constitutional: 'Writs and constitutional',
  tax: 'Tax',
  ip: 'IP',
  arbitration_commercial_courts: 'Arbitration and commercial courts',
  rera: 'RERA',
  mact: 'MACT',
  notices_replies: 'Notices and replies',
  affidavits_court_forms: 'Affidavits and court forms',
  rti: 'RTI',
  banking_recovery_drt_sarfaesi: 'Banking recovery: DRT and SARFAESI',
};

/** The 26 categories in T-239 order (frozen, entries frozen). */
export const CATALOGUE_CATEGORIES: readonly CatalogueCategory[] = Object.freeze(
  CATALOGUE_CATEGORY_IDS.map((id, i) => Object.freeze({ id, name: NAMES[id], order: i + 1 })),
);

const BY_ID: ReadonlyMap<string, CatalogueCategory> = new Map(
  CATALOGUE_CATEGORIES.map((c) => [c.id, c]),
);

/** True when `value` is one of the 26 category ids. */
export function isCatalogueCategoryId(value: unknown): value is CatalogueCategoryId {
  return typeof value === 'string' && BY_ID.has(value);
}

/** The category with this id, or `undefined` when the id is not one of the 26. */
export function catalogueCategory(id: string): CatalogueCategory | undefined {
  return BY_ID.get(id);
}
