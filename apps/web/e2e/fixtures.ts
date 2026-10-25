/**
 * T-523: the shared Playwright fixture. Every spec imports `test` and `expect` from here, never
 * from '@playwright/test' directly.
 *
 * Rules (read playwright.config.ts's header too):
 * - T-550 deny-by-default: the auto `network` fixture routes every request of the test's browser
 *   context. localhost / 127.0.0.1 go through; every other host is aborted ('blockedbyclient')
 *   and recorded, and the test FAILS at the end if anything was blocked. Non-local WebSockets
 *   are closed and recorded the same way. Service workers are blocked. A context made with
 *   `browser.newContext()` is NOT covered: call `installNetworkGuard(ctx)` on it and
 *   `guard.assertClean()` before it closes.
 * - The gateway (http://localhost:4000) is mocked, never live. A request to it that no mock
 *   answers gets a 404 JSON and FAILS the test at the end ("unmocked API"), so specs say what
 *   the page needs. CORS preflights to it are answered 204.
 * - Never click the analytics consent "Accept" (it loads gtag from googletagmanager.com, which
 *   the guard blocks and so fails the test). Use `seedConsentDenied`.
 * - Never run `playwright install`; goldens are made in CI only.
 */
import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
} from '@playwright/test';

import { E2E_API_URL, E2E_BASE_URL, networkDecision } from './guards';
import { fakeJwt, type FakeUser } from './mocks/auth';
import type { ApiMocks, MockHandler, MockReply } from './mocks/reply';

const API_ORIGIN = new URL(E2E_API_URL).origin;
const APP_ORIGIN = new URL(E2E_BASE_URL).origin;

// ── CORS: the app on :3100 calls the mock gateway on :4000 cross-origin ──────────────────────

/** The CORS headers every mocked gateway response carries. */
export function corsHeaders(request?: Request): Record<string, string> {
  const asked = request?.headers()['access-control-request-headers'];
  return {
    'access-control-allow-origin': APP_ORIGIN,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': asked || 'authorization, content-type',
    'access-control-expose-headers': 'X-Run-Id',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function isApiUrl(url: URL): boolean {
  return url.origin === API_ORIGIN;
}

async function fulfillReply(route: Route, request: Request, reply: MockReply): Promise<void> {
  if (reply.delayMs && reply.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
  }
  const body = reply.body ?? (reply.json === undefined ? '' : JSON.stringify(reply.json));
  try {
    await route.fulfill({
      status: reply.status ?? 200,
      headers: {
        ...corsHeaders(request),
        'content-type': reply.contentType ?? 'application/json',
        ...reply.headers,
      },
      body,
    });
  } catch (err) {
    // The page went away during the delay: nothing is waiting for this reply.
    if (!/closed|Target page|has been closed/i.test(String(err))) throw err;
  }
}

// ── The network guard ────────────────────────────────────────────────────────────────────────

export interface NetworkGuard {
  /** `METHOD url` of every non-local request (or WebSocket) that was blocked. Must stay empty. */
  readonly blocked: string[];
  /** `METHOD path?query` of every gateway request no mock answered. Must stay empty. */
  readonly unmocked: string[];
  /** Throws (naming each offender) when anything was blocked or unmocked. */
  assertClean(): void;
}

/**
 * Installs the T-550 deny-by-default routes and the unmocked-gateway catch-all on a context.
 * Routes registered later run first, so these (registered first) are the last resort: specific
 * mocks from `mockApi` always win.
 */
export async function installNetworkGuard(context: BrowserContext): Promise<NetworkGuard> {
  const blocked: string[] = [];
  const unmocked: string[] = [];

  // 1. Deny by default: anything not local is aborted and recorded.
  await context.route('**/*', async (route, request) => {
    if (networkDecision(request.url()) === 'allow') return route.fallback();
    blocked.push(`${request.method()} ${request.url()}`);
    return route.abort('blockedbyclient');
  });

  // 2. The mock gateway: nothing listens on :4000, so whatever no mock answered lands here.
  await context.route(
    (url) => isApiUrl(url),
    async (route, request) => {
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: corsHeaders(request) });
      }
      const url = new URL(request.url());
      unmocked.push(`${request.method()} ${url.pathname}${url.search}`);
      return route.fulfill({
        status: 404,
        headers: { ...corsHeaders(request), 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'e2e_unmocked', path: url.pathname }),
      });
    },
  );

  // 3. WebSockets: local ones (Next's HMR) are untouched; any other host is closed unopened.
  await context.routeWebSocket(
    (url) => networkDecision(url.href) === 'block',
    (ws) => {
      blocked.push(`WS ${ws.url()}`);
      void ws.close({ code: 1008, reason: 'T-550: non-local host blocked by the e2e harness' });
    },
  );

  return {
    blocked,
    unmocked,
    assertClean() {
      const problems: string[] = [];
      if (blocked.length) {
        problems.push(
          `T-550: ${blocked.length} request(s) to a non-local host were blocked:\n  ` +
            blocked.join('\n  '),
        );
      }
      if (unmocked.length) {
        problems.push(
          `Unmocked API: ${unmocked.length} gateway request(s) had no mock (add them with ` +
            `mockApi):\n  ` +
            unmocked.join('\n  '),
        );
      }
      if (problems.length) throw new Error(problems.join('\n'));
    },
  };
}

// ── Gateway mocks ────────────────────────────────────────────────────────────────────────────

/** One call a mock answered, for asserting what the page sent. */
export interface MockedCall {
  method: string;
  path: string;
  search: string;
  params: Record<string, string>;
  /** The JSON request body, the raw text when it is not JSON, or null. */
  body: unknown;
}

interface CompiledMock {
  method: string | null;
  pattern: RegExp;
  names: string[];
  handler: MockHandler;
}

function compile(key: string, handler: MockHandler): CompiledMock {
  const m = /^(?:([A-Z]+)\s+)?(\/\S*)$/.exec(key.trim());
  if (!m) throw new Error(`mockApi: bad key "${key}" (want "GET /api/path" or "/api/path")`);
  const [, method, path] = m;
  const names: string[] = [];
  const source = path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        names.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { method: method ?? null, pattern: new RegExp(`^${source}$`), names, handler };
}

function readBody(request: Request): unknown {
  const raw = request.postData();
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Registers gateway mocks on a page or context and returns the list of calls they answered.
 * Later calls win over earlier ones for the same endpoint. A method that no mock lists for a
 * path falls through to the catch-all, which fails the test as unmocked.
 */
export async function mockApi(
  target: Page | BrowserContext,
  mocks: ApiMocks,
): Promise<MockedCall[]> {
  const compiled = Object.entries(mocks).map(([key, handler]) => compile(key, handler));
  const calls: MockedCall[] = [];
  const matching = (pathname: string) => compiled.filter((c) => c.pattern.test(pathname));

  await target.route(
    (url) => isApiUrl(url) && matching(url.pathname).length > 0,
    async (route, request) => {
      const url = new URL(request.url());
      const method = request.method();
      if (method === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: corsHeaders(request) });
      }
      const hit = matching(url.pathname).find((c) => c.method === null || c.method === method);
      if (!hit) return route.fallback();
      const values = hit.pattern.exec(url.pathname)?.slice(1) ?? [];
      const params: Record<string, string> = {};
      hit.names.forEach((name, i) => {
        params[name] = decodeURIComponent(values[i] ?? '');
      });
      calls.push({
        method,
        path: url.pathname,
        search: url.search,
        params,
        body: readBody(request),
      });
      const reply =
        typeof hit.handler === 'function' ? await hit.handler(request, params) : hit.handler;
      return fulfillReply(route, request, reply);
    },
  );
  return calls;
}

// ── Browser state seeding (localStorage / sessionStorage before the app's scripts run) ───────

interface SeedSpec {
  local?: Record<string, string>;
  session?: Record<string, string>;
  /** Seed once per tab (a sessionStorage marker), so the app's own later changes stick. */
  once?: string;
}

async function seedStorage(context: BrowserContext, spec: SeedSpec): Promise<void> {
  await context.addInitScript(
    ({ origin, local, session, once }) => {
      try {
        if (window.location.origin !== origin) return;
        const marker = once ? `__e2e_seeded:${once}` : null;
        if (marker && window.sessionStorage.getItem(marker)) return;
        for (const [k, v] of Object.entries(local)) window.localStorage.setItem(k, v);
        for (const [k, v] of Object.entries(session)) window.sessionStorage.setItem(k, v);
        if (marker) window.sessionStorage.setItem(marker, '1');
      } catch {
        // Storage unavailable: the app treats that as no stored state.
      }
    },
    { origin: APP_ORIGIN, local: spec.local ?? {}, session: spec.session ?? {}, once: spec.once },
  );
}

export interface FakeSession {
  accessToken: string;
  refreshToken: string;
}

/**
 * Signs the context in with an unsigned fake JWT (lib/auth.ts keys). Seeded once per tab, so a
 * sign-out in the test stays signed out. Pair with `mockApi(page, shellMocks())`.
 */
export async function seedAuth(
  context: BrowserContext,
  user: Partial<FakeUser> = {},
): Promise<FakeSession> {
  const session = { accessToken: fakeJwt(user, 'access'), refreshToken: fakeJwt(user, 'refresh') };
  await seedStorage(context, {
    once: 'auth',
    local: {
      lawie_access_token: session.accessToken,
      lawie_refresh_token: session.refreshToken,
    },
  });
  return session;
}

/** The theme preference (components/shell/theme.ts), seeded once per tab. */
export async function seedTheme(
  context: BrowserContext,
  theme: 'night' | 'daylight' | 'system',
): Promise<void> {
  await seedStorage(context, { once: 'theme', local: { 'lawie-theme': theme } });
}

/**
 * A current, synced "Decline" (components/AnalyticsConsent.tsx StoredConsent), so the consent
 * sheet stays closed and nothing is posted. Never accept in a test.
 */
export async function seedConsentDenied(context: BrowserContext): Promise<void> {
  const record = {
    v: 1,
    id: '00000000-0000-4000-8000-0000000e2e00',
    choice: 'denied',
    at: new Date().toISOString(),
    synced: true,
  };
  await seedStorage(context, {
    once: 'consent',
    local: { 'lawie.consent.analytics': JSON.stringify(record) },
  });
}

/** Skips the landing LogoSplash animation (components/marketing/LogoSplash.tsx). */
export async function seedSplashSeen(context: BrowserContext): Promise<void> {
  await seedStorage(context, { session: { lawie_splash_seen: '1' } });
}

// ── The test object ──────────────────────────────────────────────────────────────────────────

export interface E2EFixtures {
  /** The T-550 guard on this test's context (auto: installed for every test). */
  network: NetworkGuard;
}

export const test = base.extend<E2EFixtures>({
  serviceWorkers: 'block',
  network: [
    async ({ context }, use) => {
      const guard = await installNetworkGuard(context);
      await use(guard);
      // A leak or an unmocked endpoint fails the test, with the list in the message.
      expect(
        { blocked: guard.blocked, unmocked: guard.unmocked },
        'T-550: no non-local request and no unmocked gateway call may happen in a test',
      ).toEqual({ blocked: [], unmocked: [] });
    },
    { auto: true },
  ],
});

export { expect };
