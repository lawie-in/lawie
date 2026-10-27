// T-616 test helper (not a test file): obviously fake, unsigned JWTs built at runtime, so no
// token-looking literal ever sits in the repo (the pre-commit secret scan).
function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export interface FakeJwtOptions {
  /** Seconds from now (Date.now at call time) until exp; negative = already expired. */
  expiresInSec?: number;
  /** Absolute iat/exp in seconds, overriding the relative option. */
  iat?: number;
  exp?: number;
  sub?: string;
  email?: string;
  name?: string;
  role?: string;
  plan?: string;
  /** Makes two tokens with otherwise identical claims differ. */
  nonce?: string;
}

export function fakeJwt(opts: FakeJwtOptions = {}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = opts.exp ?? nowSec + (opts.expiresInSec ?? 900);
  return [
    b64url({ alg: 'none', typ: 'JWT' }),
    b64url({
      sub: opts.sub ?? 'user-1',
      email: opts.email ?? 'asha@example.com',
      name: opts.name ?? 'Asha',
      role: opts.role ?? 'User',
      plan: opts.plan ?? 'free',
      iat: opts.iat ?? nowSec,
      exp,
      jti: opts.nonce ?? Math.random().toString(36).slice(2),
    }),
    'fakesig',
  ].join('.');
}

export const ACCESS = 'lawie_access_token';
export const REFRESH = 'lawie_refresh_token';

export function jsonRes(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

export function refreshOk(access: string, refresh: string): Response {
  return jsonRes(200, { data: { accessToken: access, refreshToken: refresh } });
}
