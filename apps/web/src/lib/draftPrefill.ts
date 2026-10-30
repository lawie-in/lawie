/**
 * T-521/T-565 item 40: the sessionStorage key for the matter text the dashboard command bar
 * leaves for the describe step. One definition, shared by the writer
 * (components/dashboard/DashboardCommandBar.tsx), the reader (components/intake/initialQuery.ts)
 * and the session code (lib/auth.ts), which removes it on sign-out and when a new session starts.
 * No imports, so lib/auth.ts can use it without pulling in components.
 */
export const DRAFT_PREFILL_KEY = 'lawie:draft-prefill';

/**
 * T-608: longest description, one definition for the dashboard box, the prefill reader and the
 * New document page. Must match the server (apps/drafting INTAKE_LIMITS.descriptionMax).
 */
export const DESCRIPTION_MAX = 4000;

/**
 * T-608: `text` cut to at most `max` UTF-16 units (what the page's textarea counts), at a code
 * point boundary: a surrogate pair that would straddle the limit is dropped, never split.
 * Same as `text.slice(0, max)` for text with no astral characters.
 */
export function capToLimit(text: string, max: number = DESCRIPTION_MAX): string {
  let units = 0;
  let out = '';
  for (const ch of text) {
    if (units + ch.length > max) break;
    units += ch.length;
    out += ch;
  }
  return out;
}
