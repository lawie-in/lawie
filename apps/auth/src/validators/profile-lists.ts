// ── T-507: allowed values for the PATCH /me profile fields ───────────────────────────────────
// Arjun's ruling (17 Oct 2026): practiceAreas takes values from this list ONLY. Kept in auth
// (not @lawie/shared) on purpose; change it here, with a new ruling.

export const PRACTICE_AREAS = [
  'Criminal',
  'Civil',
  'Family and matrimonial',
  'Property and land',
  'Cheque bounce (NI Act)',
  'Writs and constitutional',
  'Consumer',
  'Labour and service',
  'Corporate and commercial',
  'Tax',
  'Other',
] as const;
export type PracticeArea = (typeof PRACTICE_AREAS)[number];

export const PRACTICE_AREAS_MAX = 10;

/** Court ids (courtsPractisedIn, defaultCourt): lower-case letters, digits and "_", 2-80 long. */
export const COURT_ID_RE = /^[a-z0-9_]{2,80}$/;
export const COURTS_PRACTISED_IN_MAX = 20;

export const NAME_MAX = 100;
export const ENROLLMENT_NUMBER_MAX = 50;
export const BAR_COUNCIL_MAX = 100;
export const YEARS_OF_EXPERIENCE_MAX = 70;

/** Same as the User model's phone match. */
export const PHONE_RE = /^\+91\d{10}$/;

/** No HTML in free text: any "<" or ">" is refused. */
export const HTML_CHARS_RE = /[<>]/;
