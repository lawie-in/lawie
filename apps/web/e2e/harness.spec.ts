/**
 * T-523: proves the harness itself (the product flow specs are separate). Three things:
 * (a) the T-550 guard blocks and records a non-local request, and its check throws;
 * (b) the preflight guard rejects a non-local API or base URL, and the dev server env is local;
 * (c) the landing page renders against the mocked gateway with nothing blocked.
 *
 * Probes use the reserved `.invalid` TLD (RFC 2606), which never resolves, so even a broken
 * guard could not reach a real host.
 */
import {
  APP_PUBLIC_ENV_KEYS,
  E2E_API_URL,
  E2E_BASE_URL,
  assertLocalTargets,
  e2eWebServerEnv,
  networkDecision,
} from './guards';
import {
  expect,
  installNetworkGuard,
  mockApi,
  seedConsentDenied,
  seedSplashSeen,
  seedTheme,
  test,
} from './fixtures';
import { fakeJwt, json, subscribeReply } from './mocks';

const PROBE = 'https://leak-probe.invalid/collect';

test.describe('harness: T-550 network guard', () => {
  test('blocks and records a non-local request; assertClean throws', async ({ browser }) => {
    // A separate context, so the deliberate leak does not fail this test through the auto
    // fixture. It runs the same installNetworkGuard the fixture uses.
    const context = await browser.newContext();
    try {
      const guard = await installNetworkGuard(context);
      const page = await context.newPage();
      await page.setContent('<!doctype html><title>probe</title>');

      const outcome = await page.evaluate(async (url) => {
        try {
          await fetch(url, { method: 'POST', body: 'x' });
          return 'reached';
        } catch {
          return 'failed';
        }
      }, PROBE);

      expect(outcome).toBe('failed');
      expect(guard.blocked).toEqual([`POST ${PROBE}`]);
      expect(() => guard.assertClean()).toThrow(/T-550: 1 request\(s\) to a non-local host/);
    } finally {
      await context.close();
    }
  });

  test('records an unmocked gateway call and answers a mocked one with CORS', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const guard = await installNetworkGuard(context);
      const page = await context.newPage();
      const calls = await mockApi(page, { 'GET /api/e2e/ping': json({ ok: true }) });
      // An app-origin page, so the calls to :4000 are real cross-origin requests with
      // Authorization (preflighted). The document itself is fulfilled, not served by Next.
      await page.route(`${E2E_BASE_URL}/__e2e_blank`, (route) =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }),
      );
      await page.goto(`${E2E_BASE_URL}/__e2e_blank`);

      const result = await page.evaluate(async (api) => {
        const headers = { Authorization: 'Bearer e2e', 'Content-Type': 'application/json' };
        const ok = await fetch(`${api}/api/e2e/ping`, { headers }).then((r) => r.json());
        const missing = await fetch(`${api}/api/e2e/missing?x=1`, { headers }).then(
          (r) => r.status,
        );
        return { ok, missing };
      }, E2E_API_URL);

      expect(result).toEqual({ ok: { ok: true }, missing: 404 });
      expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/e2e/ping']);
      expect(guard.blocked).toEqual([]);
      expect(guard.unmocked).toEqual(['GET /api/e2e/missing?x=1']);
      expect(() => guard.assertClean()).toThrow(/Unmocked API: 1 gateway request/);
    } finally {
      await context.close();
    }
  });
});

test.describe('harness: preflight and builders (no browser)', () => {
  test('assertLocalTargets rejects non-local URLs', () => {
    expect(() =>
      assertLocalTargets({ apiUrl: 'https://api.lawie.in', baseURL: E2E_BASE_URL }),
    ).toThrow(/NEXT_PUBLIC_API_URL host "api.lawie.in" is not local/);
    expect(() =>
      assertLocalTargets({ apiUrl: E2E_API_URL, baseURL: 'https://develop.lawie.in' }),
    ).toThrow(/baseURL host "develop.lawie.in" is not local/);
    expect(() => assertLocalTargets({ apiUrl: undefined, baseURL: E2E_BASE_URL })).toThrow(
      /not set/,
    );
    expect(() =>
      assertLocalTargets({ apiUrl: 'http://127.0.0.1:4000', baseURL: E2E_BASE_URL }),
    ).not.toThrow();
  });

  test('the dev server env is local whatever the shell exports', () => {
    const env = e2eWebServerEnv({
      NEXT_PUBLIC_API_URL: 'https://api.lawie.in',
      NEXT_PUBLIC_SENTRY_DSN: 'https://key@o0.ingest.example.invalid/1',
      NEXT_PUBLIC_SOMETHING_ELSE: 'https://elsewhere.invalid',
      SENTRY_DSN: 'https://key@o0.ingest.example.invalid/2',
    });
    expect(env.NEXT_PUBLIC_API_URL).toBe('http://localhost:4000');
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe('');
    expect(env.NEXT_PUBLIC_SOMETHING_ELSE).toBe('');
    expect(env.SENTRY_DSN).toBe('');
    expect(env.NEXT_TELEMETRY_DISABLED).toBe('1');

    // Every key the app reads is set even when the shell does not export it, so a local .env
    // file cannot fill it (@next/env never overrides a key already in the environment).
    const bare = e2eWebServerEnv({});
    for (const key of APP_PUBLIC_ENV_KEYS) {
      expect(bare[key], key).toBe(key === 'NEXT_PUBLIC_API_URL' ? 'http://localhost:4000' : '');
    }
    expect(bare.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME).toBe('');
  });

  test('networkDecision and the local-only builders', () => {
    expect(networkDecision('http://localhost:3100/_next/x.js')).toBe('allow');
    expect(networkDecision('http://127.0.0.1:4000/api/x')).toBe('allow');
    expect(networkDecision('data:image/png;base64,AA==')).toBe('allow');
    expect(networkDecision('https://api.lawie.in/api/auth/consent')).toBe('block');
    expect(networkDecision('https://www.googletagmanager.com/gtag/js')).toBe('block');
    expect(networkDecision('http://localhost.evil.invalid/')).toBe('block');
    expect(networkDecision('not a url')).toBe('block');
    expect(() => subscribeReply('https://rzp.io/i/abc')).toThrow(/must be a local URL/);

    const [, payload, signature] = fakeJwt({ plan: 'pro' }).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      plan: string;
      exp: number;
    };
    expect(claims.plan).toBe('pro');
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    expect(signature).toBe('e2e-unsigned');
  });
});

test.describe('harness: landing page', () => {
  test('renders "/" against the mocked gateway with nothing blocked', async ({
    page,
    context,
    network,
  }) => {
    await seedConsentDenied(context);
    await seedSplashSeen(context);
    await seedTheme(context, 'daylight');

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'daylight');
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page).toHaveTitle(/Lawie/i);
    await page.waitForLoadState('networkidle');

    expect(network.blocked).toEqual([]);
  });
});
