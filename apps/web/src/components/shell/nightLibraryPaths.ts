// T-525: which /dashboard routes render inside the Night Library shell (app/dashboard/layout.tsx).
// Kept out of layout.tsx because a Next.js layout may only export the layout itself and route
// config. Pure, so it can be tested without rendering.
//
// Kunal (T-521) adds '/dashboard/new', '/dashboard/documents' and '/dashboard/templates' here
// when those routes are restyled; until then they keep the legacy shell. Once every route is in
// the list the legacy branch of the layout and components/dashboard/Sidebar.tsx can go (T-525
// acceptance criterion 3).

/** '/dashboard' matches exactly; every other entry matches itself and its sub-paths. */
export const NIGHT_LIBRARY_PATHS: readonly string[] = [
  '/dashboard',
  '/dashboard/settings',
  '/dashboard/payment',
];

/** The dashboard home: matched exactly, never as a prefix (that would take every route). */
const EXACT_ONLY = '/dashboard';

/**
 * Night Library routes whose page brings its own content container (max width and gutters).
 * Every other Night Library route gets the container from the layout, so nothing is padded twice.
 */
export const NIGHT_LIBRARY_SELF_CONTAINED_PATHS: readonly string[] = ['/dashboard'];

/** Next gives pathnames without a trailing slash (no `trailingSlash` config); strip one anyway. */
function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export function isNightLibraryPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const p = normalise(pathname);
  return NIGHT_LIBRARY_PATHS.some((base) =>
    base === EXACT_ONLY ? p === base : p === base || p.startsWith(`${base}/`),
  );
}

/** True when the layout should wrap the page in the shared Night Library content container. */
export function needsNightLibraryContainer(pathname: string | null): boolean {
  if (!isNightLibraryPath(pathname)) return false;
  return !NIGHT_LIBRARY_SELF_CONTAINED_PATHS.includes(normalise(pathname as string));
}
