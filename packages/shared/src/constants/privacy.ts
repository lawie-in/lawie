/**
 * T-343 — the privacy policy version every user must have accepted, and the signed one-line
 * summary shown in the re-acceptance prompt for each version. Single source of truth: auth
 * (sign-up, GET /me, POST /me/privacy-acceptance) and the requireCurrentPrivacy middleware
 * (drafting, billing) all import from here.
 *
 * History of the value (moved here from apps/auth/src/models/User.model.ts by T-343):
 * - T-234: set by Ajay's rulings (T-234 consent ruling, 11 Oct 2026, and Addendum 3,
 *   12 Oct 2026, in handoff/legal/T-234-login-copy-signed.md). Maintained by hand, not read
 *   from the page.
 * - T-308 changed /privacy text but not its "Last updated" (already 12 October 2026).
 * - T-242 (Ajay, 12 Oct 2026): '2026-10-12b' because §1 and §6 changed again on that date.
 *
 * Bump this when "Last updated" on /privacy changes, with Ajay's sign-off, and add the signed
 * summary for the new version to PRIVACY_VERSION_SUMMARIES in the same change.
 * Versions are opaque strings: compare them with === / !== only, never parse them as dates.
 */
export const CURRENT_PRIVACY_VERSION = '2026-10-12b';

/** T-343 (Arjun, 12 Oct 2026) — the 403 body's `error` value on a blocked action. */
export const PRIVACY_REACCEPT_REQUIRED = 'privacy_reaccept_required';

/**
 * T-343 — signed one-line summary ({summary}, string P2 in
 * handoff/legal/T-343-privacy-reaccept-signed.md) per privacy version. LEGAL CONTENT: each
 * entry is signed by Ajay together with the policy change it belongs to. Never add an entry
 * without his signed text, and never fall back to generic text: a version with no entry here
 * shows no prompt (Ajay, T-343 §1 and §3).
 */
export const PRIVACY_VERSION_SUMMARIES: Readonly<Record<string, string>> = Object.freeze({
  // Ajay, T-343 legal Addendum 1 (3b9f53d, 12 Oct 2026). Byte for byte; do not edit.
  '2026-10-12b':
    'We now explain how Google Analytics works on our public pages, and that we keep the campaign link a new account came from.',
});

/** The signed summary for a version, or undefined when there is none (no prompt). */
export function getPrivacyVersionSummary(version: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(PRIVACY_VERSION_SUMMARIES, version)
    ? PRIVACY_VERSION_SUMMARIES[version]
    : undefined;
}
