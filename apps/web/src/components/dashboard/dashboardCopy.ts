/**
 * T-520: dashboard ("Your shelf") strings. Every string is signed copy, byte for byte, from
 * handoff/copy/T-511-copy-v1.md sections 3 and 5, except draftAndFinalisedOrExportedValue (signed
 * as AJ-520-M1; see its comment). Nothing else is invented; where the copy has no string, the
 * element is left out (see the T-520 report).
 */
export const DASHBOARD_COPY = {
  // 3.1 Greeting and date
  greeting: (name: string) => `Hello, ${name}`,
  title: 'Your shelf',
  // 3.2 First-time empty state
  emptyHeading: 'The shelf is empty',
  emptyBody: 'Describe your first matter and Lawie will write a first draft for you to review.',
  emptyAction: 'Start your first draft',
  // 3.3 Low-Ink nudge
  lowInk: (n: number) => `${n} Ink left. You see the Ink cost before you generate.`,
  zeroInkPlan: (date: string) =>
    `You have no Ink left. It refills on ${date}, or you can top up now.`,
  zeroInkFree: 'You have used your 5 Ink. Top up or choose a plan to keep drafting.',
  topUp: 'Top up',
  seePlans: 'See plans',
  notNow: 'Not now',
  // 3.4 Section labels (the eight items)
  inkBalance: 'Ink balance',
  inkValue: (n: number | string) => `${n} Ink`,
  recentDocuments: 'Recent documents',
  viewAll: 'View all',
  draftsThisMonth: 'Drafts this month',
  draftAndFinalised: 'Draft and finalised',
  /**
   * Signed: AJ-520-M1 (handoff/legal/T-511-copy-rulings-ajay.md; pre-Anushka review item 46,
   * T-565). It replaces copy 3.4's `{a} draft, {b} finalised` so the count is true: b = finalised
   * + exported documents, and "(all time)" because the T-506 statusCounts are all-time.
   */
  draftAndFinalisedOrExportedValue: (a: number, b: number) =>
    `${a} draft, ${b} finalised or exported (all time)`,
  planAndRenewal: 'Plan and renewal',
  planRenews: (plan: string, date: string) => `${plan}, renews on ${date}`,
  freePlanNoRenewal: 'Free plan, no renewal',
  inkUsedThisMonth: 'Ink used this month',
  inkUsedValue: (used: number | string) => `${used} Ink`,
  draftsByType: 'Drafts by type',
  draftsByTypeEmpty: 'No drafts yet',
  // 3.6 Tile states
  error: 'Could not load your shelf. Your connection looks slow.',
  retry: 'Retry',
  // 5 Still working (after 8 s)
  stillWorking: 'Still working…',
} as const;

/** Copy 3.3: the nudge shows below 3 Ink. */
export const LOW_INK_THRESHOLD = 3;

/** Spine labels: an exported document is a finalised one (copy 3.4 has draft and finalised only). */
export const SPINE_STATUS_LABEL = {
  draft: 'draft',
  finalised: 'finalised',
} as const;
