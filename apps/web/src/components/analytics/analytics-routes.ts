// T-306: pure helpers for the GA helper (GoogleAnalytics.tsx). No React, so tests can call them.

export const GA_MEASUREMENT_ID = 'G-ZSMN1GPPB5';

// Public pages only. Deny by default: anything not listed (login, /auth/*, /dashboard/*,
// /admin/*, /review/*, ...) never loads gtag.js and never sends a page view.
export const ANALYTICS_ALLOWED_PATHS: readonly string[] = [
  '/',
  '/about',
  '/contact',
  '/faq',
  '/pricing',
  '/privacy',
  '/refunds',
  '/terms',
  '/tools',
  '/tools/bail-checker',
  '/tools/section-converter',
  '/tools/timeline-tracker',
];

/**
 * Exact match on the allowlist. One trailing slash is tolerated on a non-root path
 * ('/pricing/'); repeated slashes anywhere ('//', '/pricing//', '//pricing') never match.
 */
export function isAnalyticsRoute(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string' || pathname.length === 0) return false;
  if (pathname.includes('//')) return false;
  const normalised =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return ANALYTICS_ALLOWED_PATHS.includes(normalised);
}

/** origin + pathname only: drops query string, hash and any credentials. '' if unparseable. */
export function sanitizePageLocation(href: string): string {
  try {
    const url = new URL(href);
    return url.origin + url.pathname;
  } catch {
    return '';
  }
}
