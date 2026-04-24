const ACCESS_TOKEN_KEY = 'lawie_access_token';
const REFRESH_TOKEN_KEY = 'lawie_refresh_token';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
}

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const payload = parseJwt(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() / 1000 > payload.exp;
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Returns the decoded user from the stored access token, or null if missing/expired. */
export function getSessionUser(): AuthUser | null {
  const token = getAccessToken();
  if (!token || isExpired(token)) return null;
  const payload = parseJwt(token);
  if (!payload) return null;
  return {
    id: payload.sub as string,
    email: payload.email as string,
    name: (payload.name as string) ?? (payload.email as string),
    role: payload.role as string,
    plan: (payload.plan as string) ?? 'free',
  };
}

/** True if there is a valid, non-expired access token in storage. */
export function isAuthenticated(): boolean {
  return getSessionUser() !== null;
}
