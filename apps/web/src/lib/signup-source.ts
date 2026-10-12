'use client';

import { useEffect } from 'react';

// T-242 — sign-up source (UTM). Ajay, handoff/legal/T-242-signup-source-signed.md:
//   1. sessionStorage only (cleared when the tab closes). No localStorage, no cookie.
//   2. Only utm_source, utm_medium, utm_campaign; each cut to 100 characters; drop any value with
//      an "@" or a run of 7 or more digits (may be an email address or phone number).
//   3. Never sent to Google Analytics or any third party; never logged (no console, no Sentry).
//   4. Sent to our own auth service only when an account is created.
// The auth service applies the same caps and drops (apps/auth/src/validators/auth.validator.ts,
// sanitizeUtmValue). Change both together.

export const SIGNUP_SOURCE_STORAGE_KEY = 'lawie_signup_utm';
export const UTM_VALUE_MAX_LENGTH = 100;
const UTM_PII_PATTERN = /@|\d{7,}/;

/** Field names the auth API takes (register body and /api/auth/google query). */
export interface SignupSource {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

const URL_KEYS: Record<keyof SignupSource, string> = {
  utmSource: 'utm_source',
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
};

/** One tag value, capped and filtered. Undefined for anything that must not be kept. */
export function sanitizeUtmValue(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  // Checked on the whole value, before the cut.
  if (!trimmed || UTM_PII_PATTERN.test(trimmed)) return undefined;
  const capped = trimmed.slice(0, UTM_VALUE_MAX_LENGTH).trim();
  return capped || undefined;
}

function sanitize(raw: Partial<Record<keyof SignupSource, unknown>>): SignupSource | null {
  const out: SignupSource = {};
  for (const key of Object.keys(URL_KEYS) as (keyof SignupSource)[]) {
    const value = sanitizeUtmValue(raw[key]);
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The tags in a query string, sanitized, or null when it carries none that survive. */
export function signupSourceFromSearch(search: string): SignupSource | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  return sanitize({
    utmSource: params.get(URL_KEYS.utmSource) ?? undefined,
    utmMedium: params.get(URL_KEYS.utmMedium) ?? undefined,
    utmCampaign: params.get(URL_KEYS.utmCampaign) ?? undefined,
  });
}

// ── Storage (every access in try/catch; blocked storage = nothing kept) ─────────────────────────

/**
 * Saves the tags of the current landing URL. A link with tags replaces what an earlier link left;
 * a URL without tags leaves the stored ones alone.
 */
export function captureSignupSource(search: string): void {
  const source = signupSourceFromSearch(search);
  if (!source) return;
  try {
    window.sessionStorage.setItem(SIGNUP_SOURCE_STORAGE_KEY, JSON.stringify(source));
  } catch {
    // Storage blocked: the sign-up is simply recorded without a source.
  }
}

/** The stored tags, sanitized again on read, or null. */
export function readSignupSource(): SignupSource | null {
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_SOURCE_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    return sanitize(value as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Removes the stored tags (after sign-up, condition 4: they belong to the account from then). */
export function clearSignupSource(): void {
  try {
    window.sessionStorage.removeItem(SIGNUP_SOURCE_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/**
 * The same URL with every utm_* parameter removed (path, other parameters and hash kept), or null
 * when it has none. Covers all utm_* keys, including ones we never keep and values we dropped.
 */
export function urlWithoutUtm(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const utmKeys = Array.from(new Set(Array.from(url.searchParams.keys()))).filter((k) =>
    k.toLowerCase().startsWith('utm_'),
  );
  if (utmKeys.length === 0) return null;
  for (const k of utmKeys) url.searchParams.delete(k);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
}

/**
 * T-242 (backs up Ajay condition 3): takes the tags out of the address bar once captured, so
 * they can't travel on in a page address (analytics, a shared or bookmarked link).
 */
export function removeUtmFromAddressBar(): void {
  try {
    const next = urlWithoutUtm(window.location.href);
    // null state, as Next's App Router expects for window.history calls (it keeps its own state).
    if (next !== null) window.history.replaceState(null, '', next);
  } catch {
    // History API unavailable or refused: the tags stay in the address bar; nothing else breaks.
  }
}

/**
 * Mounted once in app/layout.tsx so a tagged link to any page is caught. Renders nothing and
 * sends nothing anywhere.
 */
export function SignupSourceCapture(): null {
  useEffect(() => {
    captureSignupSource(window.location.search);
    removeUtmFromAddressBar();
  }, []);
  return null;
}
