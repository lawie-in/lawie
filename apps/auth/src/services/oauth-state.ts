import crypto from 'crypto';

import { env } from '../config/env';
import { sanitizeUtm, UtmTags } from '../validators/auth.validator';

// T-319 (Arjun's spec at the end of T-306): PKCE-style binding for Google sign-in. The web app
// keeps a random verifier in sessionStorage and sends only its hash (the challenge). The challenge
// travels to Google and back inside an HMAC-signed state, is stored with the one-time code, and
// POST /oauth/exchange only hands out the tokens to the holder of the matching verifier.

/** Request property the /google/callback route sets once the state is verified. */
export const OAUTH_VERIFIED_STATE_KEY = 'lawieOAuthVerifiedState';

/** How long a signed state is accepted after /google issued it. */
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
// Small allowance for clocks that differ between auth instances.
const OAUTH_STATE_CLOCK_SKEW_MS = 60 * 1000;
// A real state is well under this; anything longer is refused before any HMAC work.
export const OAUTH_STATE_MAX_LENGTH = 1024;

// 32 bytes in base64url (no padding) are exactly 43 characters. Used for challenge and verifier.
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;

export interface OAuthState {
  /** Challenge: base64url(sha256(verifier)). */
  c: string;
  /** Referral code, already trimmed and upper-cased by /google. */
  r?: string;
  /** T-242: sign-up source tags (s = utm_source, m = utm_medium, c = utm_campaign), sanitized. */
  u?: OAuthStateUtm;
  /** Issued at, ms since epoch. */
  t: number;
}

/** T-242: short keys keep the signed state well under OAUTH_STATE_MAX_LENGTH. */
export interface OAuthStateUtm {
  s?: string;
  m?: string;
  c?: string;
}

function toStateUtm(tags: Parameters<typeof sanitizeUtm>[0]): OAuthStateUtm | undefined {
  const clean = sanitizeUtm(tags);
  const u: OAuthStateUtm = {
    ...(clean.utmSource ? { s: clean.utmSource } : {}),
    ...(clean.utmMedium ? { m: clean.utmMedium } : {}),
    ...(clean.utmCampaign ? { c: clean.utmCampaign } : {}),
  };
  return Object.keys(u).length > 0 ? u : undefined;
}

/** T-242: the state's tags back in the names the rest of auth uses. */
export function utmFromOAuthState(state: OAuthState | undefined): UtmTags | undefined {
  if (!state?.u) return undefined;
  return { utmSource: state.u.s, utmMedium: state.u.m, utmCampaign: state.u.c };
}

export function isBase64Url43(value: unknown): value is string {
  return typeof value === 'string' && BASE64URL_43.test(value);
}

// key = HMAC(JWT_SECRET, 'oauth-state-v1'). Derived per call so it follows the configured secret.
function stateKey(): Buffer {
  return crypto.createHmac('sha256', env.JWT_SECRET).update('oauth-state-v1').digest();
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', stateKey()).update(payload).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function buildState(challenge: string, referralCode: string | undefined, u?: OAuthStateUtm) {
  const body: OAuthState = {
    c: challenge,
    ...(referralCode ? { r: referralCode } : {}),
    ...(u ? { u } : {}),
    t: Date.now(),
  };
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/**
 * state = base64url(JSON {c, r?, u?, t}) + '.' + base64url(HMAC-SHA256(key, that base64url string)).
 * T-242: the tags are optional extras. If they would push the state past OAUTH_STATE_MAX_LENGTH
 * (possible only with long non-ASCII values), campaign, then medium, then all tags are dropped, so
 * the sign-in itself never fails because of them.
 */
export function createOAuthState(
  challenge: string,
  referralCode?: string,
  utm?: Parameters<typeof sanitizeUtm>[0],
): string {
  const u = utm ? toStateUtm(utm) : undefined;
  if (u) {
    const attempts: OAuthStateUtm[] = [u, { s: u.s, m: u.m }, { s: u.s }];
    for (const attempt of attempts) {
      const trimmed = toStateUtm({
        utmSource: attempt.s,
        utmMedium: attempt.m,
        utmCampaign: attempt.c,
      });
      if (!trimmed) continue;
      const state = buildState(challenge, referralCode, trimmed);
      if (state.length <= OAUTH_STATE_MAX_LENGTH) return state;
    }
  }
  return buildState(challenge, referralCode);
}

function parseStateUtm(raw: unknown): OAuthStateUtm | undefined | null {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { s, m, c } = raw as Record<string, unknown>;
  for (const v of [s, m, c]) if (v !== undefined && typeof v !== 'string') return null;
  // Signed by us, so already clean; sanitized again anyway (defence in depth).
  return toStateUtm({ utmSource: s, utmMedium: m, utmCampaign: c });
}

/** Returns the verified state, or null for a missing, malformed, tampered or expired one. */
export function verifyOAuthState(raw: unknown): OAuthState | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > OAUTH_STATE_MAX_LENGTH) {
    return null;
  }
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];
  if (!payload || !signature) return null;
  if (!constantTimeEqual(signature, sign(payload))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const { c, r, t, u: rawU } = parsed as Record<string, unknown>;
  if (!isBase64Url43(c)) return null;
  if (typeof t !== 'number' || !Number.isFinite(t)) return null;
  if (r !== undefined && (typeof r !== 'string' || !r)) return null;
  const u = parseStateUtm(rawU);
  if (u === null) return null;

  const age = Date.now() - t;
  if (age >= OAUTH_STATE_MAX_AGE_MS || age < -OAUTH_STATE_CLOCK_SKEW_MS) return null;

  return { c, t, ...(typeof r === 'string' ? { r } : {}), ...(u ? { u } : {}) };
}

/** base64url(sha256(verifier)), the challenge the web app sent for this verifier. */
export function challengeForVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/** Constant-time check of a verifier against a stored challenge. */
export function verifierMatchesChallenge(verifier: string, challenge: string): boolean {
  return constantTimeEqual(challengeForVerifier(verifier), challenge);
}

/** The verified state the callback route put on the request, if any. */
export function getVerifiedOAuthState(req: unknown): OAuthState | undefined {
  const value = (req as Record<string, unknown> | null | undefined)?.[OAUTH_VERIFIED_STATE_KEY];
  return value && typeof value === 'object' ? (value as OAuthState) : undefined;
}
