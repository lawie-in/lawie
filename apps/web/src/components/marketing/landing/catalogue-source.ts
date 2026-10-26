// TEMPORARY FIXTURE until T-600 merges: replace with `import catalogue from '@/lib/landingCatalogue'` and delete this file
//
// T-601: the shape of apps/web/src/data/landing-catalogue.json (T-600 contract, Arjun) and a small
// stand-in so the coverage section can be built and tested before Vishal's generator lands. The
// ids, names and template titles are real (apps/drafting/src/config/catalogue, base batch, and the
// rule files' displayName); the selection is a subset, so the count is NOT the library's count.
// When T-600 merges: import `catalogue` and `headlineCount` from '@/lib/landingCatalogue' in
// ReadingDeskLanding and delete this file (keep the type import pointing at T-600's export).

export interface LandingCatalogueTemplate {
  id: string;
  name: string;
}

export interface LandingCatalogueCategory {
  id: string;
  name: string;
  order: number;
  templates: LandingCatalogueTemplate[];
}

export interface LandingCatalogue {
  generatedAt: string;
  /** Catalogue order; categories with no live template are left out by the generator. */
  categories: LandingCatalogueCategory[];
  /** Live templates only (Ajay, M-LP-15-06 / 15-08). */
  total: number;
}

/** TEMPORARY: T-600's `headlineCount`: the total rounded down to ten, with "+" (86 -> "80+"). */
export function headlineCount(total: number): string {
  return `${Math.floor(total / 10) * 10}+`;
}

/** TEMPORARY FIXTURE: four real categories, ten real templates, `total` = their count. */
export const TEMPORARY_CATALOGUE_FIXTURE: LandingCatalogue = {
  generatedAt: '2026-10-26T00:00:00.000Z',
  categories: [
    {
      id: 'criminal_bail_custody',
      name: 'Criminal: bail and custody',
      order: 1,
      templates: [
        { id: 'bail_regular', name: 'Regular Bail Application' },
        { id: 'bail_anticipatory', name: 'Anticipatory Bail Application' },
        { id: 'default_bail', name: 'Default Bail Application' },
        { id: 'bail_cancellation', name: 'Application for Cancellation of Bail' },
      ],
    },
    {
      id: 'cheque_bounce_ni_act',
      name: 'Cheque bounce / NI Act',
      order: 4,
      templates: [
        { id: 'legal_notice_s138', name: 'Legal Notice under Section 138 NI Act (Cheque Bounce)' },
      ],
    },
    {
      id: 'family_matrimonial',
      name: 'Family and matrimonial',
      order: 8,
      templates: [
        { id: 'maintenance_bnss_144', name: 'Maintenance Application (s.144 BNSS)' },
        { id: 'divorce_mutual_consent', name: 'Mutual Consent Divorce (s.13B HMA / s.28 SMA)' },
        { id: 'dv_act_complaint', name: 'Domestic Violence Act Application (s.12 PWDV)' },
      ],
    },
    {
      id: 'notices_replies',
      name: 'Notices and replies',
      order: 23,
      templates: [
        { id: 'legal_notice_breach_of_contract', name: 'Legal Notice — Breach of Contract' },
        {
          id: 'legal_notice_defamation',
          name: 'Legal Notice — Defamation (Civil / Criminal BNS 356)',
        },
      ],
    },
  ],
  total: 10,
};
