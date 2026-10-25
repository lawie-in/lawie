/**
 * T-523: auth mocks. The web app never verifies a JWT: lib/auth.ts only base64-decodes the
 * payload (sub, email, name, role, plan, exp in seconds). So e2e tokens are UNSIGNED fakes
 * (the signature is a dummy word). They are useless against a real gateway, which verifies the
 * HMAC (incident 2026-10-21), and must never be sent to one; the fixture blocks non-local hosts.
 */

export type FakeRole = 'Admin' | 'Lawyer' | 'Client';

export interface FakeUser {
  sub: string;
  email: string;
  name: string;
  role: FakeRole;
  /** The token's plan claim (auth's UserPlan); the dashboard reads the tier from billing. */
  plan: 'free' | 'pro';
  /** Seconds from now until the token expires. Default one day. */
  expiresInSec: number;
}

export const DEFAULT_USER: FakeUser = {
  sub: 'e2e-user-0001',
  email: 'advocate@e2e.test',
  name: 'Asha Advocate',
  role: 'Lawyer',
  plan: 'free',
  expiresInSec: 24 * 60 * 60,
};

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** An unsigned header.payload.signature token the app can decode. */
export function fakeJwt(
  user: Partial<FakeUser> = {},
  type: 'access' | 'refresh' = 'access',
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  const u = { ...DEFAULT_USER, ...user };
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: u.sub,
    email: u.email,
    name: u.name,
    role: u.role,
    plan: u.plan,
    type,
    iat: nowSec,
    exp: nowSec + u.expiresInSec,
  };
  return `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}.e2e-unsigned`;
}

/** POST /api/auth/login, /register and /refresh success body. */
export function authTokens(user: Partial<FakeUser> = {}): {
  status: 'success';
  data: { accessToken: string; refreshToken: string };
} {
  return {
    status: 'success',
    data: { accessToken: fakeJwt(user, 'access'), refreshToken: fakeJwt(user, 'refresh') },
  };
}

/** GET /api/auth/me `data` (apps/auth getPrivacyStatus: privacy, verification, profile). */
export interface MeData {
  privacyVersion: string | null;
  currentPrivacyVersion: string;
  needsPrivacyAcceptance: boolean;
  summary?: string;
  emailVerified: boolean;
  hasGoogle: boolean;
  hasPassword: boolean;
  gstStateCode: string | null;
  name: string | null;
  phone: string | null;
  enrollmentNumber: string | null;
  barCouncil: string | null;
  barCouncilState: string | null;
  practiceAreas: string[];
  yearsOfExperience: number | null;
  courtsPractisedIn: string[];
  defaultCourt: string | null;
}

/** packages/shared/src/constants/privacy.ts CURRENT_PRIVACY_VERSION. */
export const E2E_PRIVACY_VERSION = '2026-10-15';

/**
 * GET /api/auth/me. Defaults: verified, privacy accepted (no prompt or banner covers the shell),
 * GST State set (no State nag in Settings).
 */
export function me(overrides: Partial<MeData> = {}): { status: 'success'; data: MeData } {
  return {
    status: 'success',
    data: {
      privacyVersion: E2E_PRIVACY_VERSION,
      currentPrivacyVersion: E2E_PRIVACY_VERSION,
      needsPrivacyAcceptance: false,
      emailVerified: true,
      hasGoogle: false,
      hasPassword: true,
      gstStateCode: '27',
      name: DEFAULT_USER.name,
      phone: null,
      enrollmentNumber: null,
      barCouncil: null,
      barCouncilState: null,
      practiceAreas: [],
      yearsOfExperience: null,
      courtsPractisedIn: [],
      defaultCourt: null,
      ...overrides,
    },
  };
}
