/**
 * T-563 (Arjun, reconciled with Ajay's ruling AJ-563, 22 Oct 2026) — pure helpers for the
 * develop-only test sign-up bypass. No I/O, no env reads: callers pass the values in.
 */

/** The production markers (Arjun): any one of them makes the box production. */
export interface ProductionBoxMarkers {
  RAZORPAY_KEY_GUARD?: string;
  SECRETS_ENV?: string;
  RAZORPAY_KEY_ID?: string;
}

/**
 * True when the box is production: RAZORPAY_KEY_GUARD=strict, or SECRETS_ENV=prod, or a live
 * Razorpay key (rzp_live_). Compared after trimming, case-insensitively, so an odd spelling of
 * a marker still counts as production (fails closed). SECRETS_ENV is checked even though
 * nothing sets it before T-534.
 */
export function isProductionBox(markers: ProductionBoxMarkers): boolean {
  const norm = (v: string | undefined): string => (v ?? '').trim().toLowerCase();
  return (
    norm(markers.RAZORPAY_KEY_GUARD) === 'strict' ||
    ['prod', 'production'].includes(norm(markers.SECRETS_ENV)) ||
    norm(markers.RAZORPAY_KEY_ID).startsWith('rzp_live_')
  );
}

/**
 * AJ-563-M1a — the terms version stored on a test account's consent record. A record with this
 * version is never real consent: never exported, counted or reported, and never satisfies a
 * real account's acceptance.
 */
export const TEST_CONSENT_VERSION = 'test-bypass';

/**
 * AJ-563-M1a — a Mongo filter that leaves out test consent records (and test accounts). Add it
 * to any consent-log export or DPDP-facing count.
 */
export function excludeTestConsentFilter(): Record<string, unknown> {
  return {
    termsVersion: { $ne: TEST_CONSENT_VERSION },
    acceptedVia: { $ne: 'test' },
    isTestAccount: { $ne: true },
  };
}

/**
 * AJ-563-M2 / Arjun reconciled 1 — the bypass applies only to a reserved test domain:
 * exactly @example.com or @example.org, or any domain under the .test TLD (RFC 2606).
 */
export function isReservedTestEmail(email: string): boolean {
  const addr = email.trim().toLowerCase();
  const at = addr.lastIndexOf('@');
  if (at <= 0 || addr.indexOf('@') !== at) return false;
  const domain = addr.slice(at + 1);
  if (domain === 'example.com' || domain === 'example.org') return true;
  return domain.endsWith('.test') && domain.length > '.test'.length && !domain.startsWith('.');
}

/** AJ-563-M3 — a test account's name must start with TEST (case-sensitive). */
export function isTestAccountName(name: string): boolean {
  return name.trim().startsWith('TEST');
}
