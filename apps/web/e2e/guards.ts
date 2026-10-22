/**
 * T-523 / T-550: the local-only rules for the Playwright harness, as plain functions.
 *
 * No Playwright import here: playwright.config.ts runs these before any browser or dev server
 * starts, and e2e/harness.spec.ts unit-tests them. Background: the 21 Oct 2026 stray-traffic
 * incident (handoff/ops/incident-2026-10-21-stray-e2e-traffic.md), where a browser check built
 * with NEXT_PUBLIC_API_URL=https://api.lawie.in sent real requests to the develop box.
 *
 * The only hosts a test may talk to are `localhost` and `127.0.0.1`. Everything else is denied.
 */

/** The only hostnames a test may reach (the Next dev server and the mocked gateway). */
export const LOCAL_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1'];

/** The port the e2e dev server listens on (not 3000, so it never clashes with `yarn dev`). */
export const E2E_WEB_PORT = 3100;
/** The app under test. */
export const E2E_BASE_URL = `http://localhost:${E2E_WEB_PORT}`;
/**
 * The gateway origin the app is built against in e2e runs. Nothing listens there: every
 * request to it is answered by the fixture's mocks (e2e/fixtures.ts) or fails the test.
 */
export const E2E_API_URL = 'http://localhost:4000';

/** Schemes that never touch the network (the deny rule lets these through). */
const NON_NETWORK_PROTOCOLS: readonly string[] = ['data:', 'blob:', 'about:'];

/** True for `localhost` or `127.0.0.1` (case-insensitive). */
export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.includes(hostname.toLowerCase());
}

/** True when the URL parses and its host is local. Unparseable input is not local. */
export function isLocalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return isLocalHostname(parsed.hostname);
}

/** True for data:, blob: and about: URLs, which carry no network request. */
export function isNonNetworkUrl(url: string): boolean {
  return NON_NETWORK_PROTOCOLS.some((p) => url.toLowerCase().startsWith(p));
}

/**
 * The deny-by-default decision for one browser request: `allow` for local hosts and
 * non-network schemes, `block` for every other host (and for anything that does not parse).
 */
export function networkDecision(url: string): 'allow' | 'block' {
  if (isNonNetworkUrl(url)) return 'allow';
  return isLocalUrl(url) ? 'allow' : 'block';
}

export interface LocalTargets {
  /** The NEXT_PUBLIC_API_URL the dev server is started with. */
  apiUrl: string | undefined;
  /** Playwright's `use.baseURL`. */
  baseURL: string | undefined;
}

/**
 * Preflight (T-550): throws unless both the API URL and the base URL are http(s) URLs on a
 * local host. playwright.config.ts calls this at load time, so a bad value fails the run before
 * any browser or server starts.
 */
export function assertLocalTargets({ apiUrl, baseURL }: LocalTargets): void {
  const check = (name: string, value: string | undefined) => {
    if (!value) {
      throw new Error(`T-550 e2e preflight: ${name} is not set; it must be a localhost URL.`);
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`T-550 e2e preflight: ${name} is not a valid URL: ${value}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`T-550 e2e preflight: ${name} must be http(s), got ${parsed.protocol}`);
    }
    if (!isLocalHostname(parsed.hostname)) {
      throw new Error(
        `T-550 e2e preflight: ${name} host "${parsed.hostname}" is not local ` +
          `(allowed: ${LOCAL_HOSTNAMES.join(', ')}). E2E runs never point at a hosted API ` +
          '(incident 2026-10-21).',
      );
    }
  };
  check('NEXT_PUBLIC_API_URL', apiUrl);
  check('baseURL', baseURL);
}

/**
 * The environment the e2e `next dev` is started with, on top of the caller's environment
 * (Playwright merges `webServer.env` over process.env). Every NEXT_PUBLIC_* the shell exports
 * is blanked, then the API URL is hard-set to the local mock origin; Sentry DSNs and the auth
 * token are blanked and Next telemetry is off, so neither the browser bundle nor the dev server
 * is pointed at a hosted service by the developer's or the cloud session's shell.
 */
export function e2eWebServerEnv(
  parentEnv: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of Object.keys(parentEnv)) {
    if (key.startsWith('NEXT_PUBLIC_')) env[key] = '';
  }
  return {
    ...env,
    NEXT_PUBLIC_API_URL: E2E_API_URL,
    NEXT_PUBLIC_SENTRY_DSN: '',
    SENTRY_DSN: '',
    SENTRY_AUTH_TOKEN: '',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
