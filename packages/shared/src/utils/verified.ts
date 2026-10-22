/**
 * T-522 (Arjun ruling 6, 22 Oct 2026): the one "is this user's email verified" check, on a plain
 * object so packages/shared needs no mongoose. Same rule as T-223's billing guard: a verified
 * address, or a Google account (the provider has verified the address), or a linked googleId.
 */
export interface VerifiedFields {
  emailVerified?: boolean | null;
  authProvider?: string | null;
  googleId?: string | null;
}

export function isVerified(user: VerifiedFields | null | undefined): boolean {
  if (!user) return false;
  if (user.emailVerified === true) return true;
  if (user.authProvider === 'google') return true;
  return typeof user.googleId === 'string' && user.googleId.length > 0;
}

/** The 403 body's `error` value when an unverified user tries a fenced action (T-223). */
export const EMAIL_VERIFICATION_REQUIRED = 'email_verification_required';
