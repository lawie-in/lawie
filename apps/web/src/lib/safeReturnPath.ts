/**
 * T-616: the page to go back to after a sign-in the session forced (`/login?next=...`).
 *
 * Only a same-site path is ever accepted, so `next` cannot become an open redirect: exactly one
 * leading "/", no "//" anywhere, no "." or ".." segment, no scheme or host, no backslash, no
 * encoded slash, backslash, dot or control character, no whitespace or control characters, at
 * most 512 characters, and never a sign-in or auth route (that would loop) or an API route.
 *
 * When a return path is BUILT from the current location, only the pathname is used: never the
 * query string, the hash or anything the user typed, so no matter text ever lands in a URL.
 */

export const MAX_RETURN_PATH_LENGTH = 512;
/** Per tab: the validated return path, kept across the Google redirect (never sent to Google). */
export const POST_LOGIN_PATH_KEY = 'lawie:post-login-path';

// Any C0 control character, DEL, any whitespace (including newlines and Unicode spaces).
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\s]/;

function pathOnly(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

/** The path if it is a safe same-site return path, else null. Never throws. */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_RETURN_PATH_LENGTH) return null;
  if (raw[0] !== '/') return null;
  // "//host" and "/\host" are protocol-relative to browsers.
  if (raw[1] === '/' || raw[1] === '\\') return null;
  if (raw.includes('\\')) return null;
  if (UNSAFE_CHARS.test(raw)) return null;
  // No encoded slash/backslash/dot/control tricks (e.g. "/%2F%2Fevil.example", "/%2e%2e//x").
  if (/%(2e|2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)) return null;
  // T-616 review: no "//" anywhere ("/x//evil.example", "/.//evil.example" resolves to the
  // pathname "//evil.example").
  if (raw.includes('//')) return null;

  const path = pathOnly(raw);
  // No "." or ".." segment: they can collapse into a protocol-relative path once resolved.
  if (path.split('/').some((seg) => seg === '.' || seg === '..')) return null;
  // A ":" in the path part could read as a scheme somewhere down the line: refuse it.
  if (path.includes(':')) return null;
  const lower = path.toLowerCase();
  const isUnder = (prefix: string) => lower === prefix || lower.startsWith(`${prefix}/`);
  if (isUnder('/login') || isUnder('/auth') || isUnder('/api')) return null;
  return raw;
}

/**
 * The sign-in URL for a guard that found no session: `/login?next=<pathname>` when the pathname
 * is a safe return path other than "/", else plain `/login`. Only the pathname is kept (query and hash dropped).
 */
export function buildLoginRedirect(pathname: string | null | undefined): string {
  const safe = typeof pathname === 'string' ? safeReturnPath(pathOnly(pathname)) : null;
  // "/" is the public home page: nothing to come back to, so plain /login (dashboard after).
  return safe && safe !== '/'
    ? `/login?${new URLSearchParams({ next: safe }).toString()}`
    : '/login';
}

/** Stores the validated return path for this tab (before the Google redirect). Never throws. */
export function rememberPostLoginPath(path: string | null): void {
  try {
    const safe = safeReturnPath(path);
    if (safe) sessionStorage.setItem(POST_LOGIN_PATH_KEY, safe);
    else sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  } catch {
    // Storage unavailable: the sign-in lands on the dashboard.
  }
}

/** Reads and removes this tab's stored return path; null if absent or not safe. Never throws. */
export function takePostLoginPath(): string | null {
  try {
    const raw = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
    sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
    return safeReturnPath(raw);
  } catch {
    return null;
  }
}
