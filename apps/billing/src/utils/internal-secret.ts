import crypto from 'crypto';

/**
 * T-438: constant-time check of the inbound internal secret, as
 * internalSecretMatches in routes/internal.routes.ts. Both sides are hashed to
 * 32 bytes first, so timingSafeEqual never sees unequal lengths and the length
 * does not leak. False for non-string input (a repeated header arrives as an
 * array), an empty value, or when no secret is configured (fails closed).
 */
export function internalSecretMatches(provided: unknown, expected: string | undefined): boolean {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}
