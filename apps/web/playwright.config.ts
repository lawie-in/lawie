/**
 * T-523: Playwright smoke and screenshot harness for apps/web. Chromium only.
 *
 * Rules (founder, Arjun, Priya; read before changing anything here):
 * - T-550 deny-by-default: the browser may reach only localhost / 127.0.0.1. e2e/fixtures.ts
 *   aborts every other host and FAILS the test that tried. The gateway is mocked at the network
 *   edge (http://localhost:4000, nothing listens there); no live services, no Anthropic calls.
 * - Local-only API: the dev server below is started with NEXT_PUBLIC_API_URL hard-set to
 *   http://localhost:4000; every other NEXT_PUBLIC_* key present in the shell AND every key the
 *   app reads (e2e/guards.ts APP_PUBLIC_ENV_KEYS) is blanked, as are the Sentry DSNs, so neither
 *   the shell nor a local .env file can set them (the cloud shell exports https://api.lawie.in
 *   and a real DSN). The preflight
 *   below throws before any browser or server starts if the API or base URL is not local
 *   (incident handoff/ops/incident-2026-10-21-stray-e2e-traffic.md).
 * - Never reuse a server: `reuseExistingServer` is always false. A leftover server on :3100 may
 *   have been started with another env (e.g. the shell's https://api.lawie.in), so a busy port
 *   fails the run loudly instead. Stop whatever holds :3100 and run again.
 * - Never run `playwright install`. Cloud sessions use the pre-installed browsers under
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers (chromium-1194, which is why @playwright/test is
 *   pinned to exactly 1.56.1). CI installs with `playwright install --with-deps chromium`.
 *   Set PW_CHROMIUM_PATH to point at a specific Chromium binary.
 * - Goldens (`toHaveScreenshot`) are generated and updated in CI only (linux, real fonts), and
 *   only for the shell and the landing page, never for anything showing model text. next/font
 *   fetches Google fonts from the Next SERVER (page.route never sees it); in a sandbox without
 *   that network the fonts fall back, so sandbox screenshots differ. Never commit goldens from a
 *   sandbox run (`test:e2e:update` is for CI).
 */
import { defineConfig, devices } from '@playwright/test';

import {
  E2E_API_URL,
  E2E_BASE_URL,
  E2E_WEB_PORT,
  assertLocalTargets,
  e2eWebServerEnv,
} from './e2e/guards';

const webServerEnv = e2eWebServerEnv(process.env);

// T-550 preflight: fails the run here, before any browser or server starts.
assertLocalTargets({ apiUrl: webServerEnv.NEXT_PUBLIC_API_URL, baseURL: E2E_BASE_URL });
if (webServerEnv.NEXT_PUBLIC_API_URL !== E2E_API_URL) {
  throw new Error('T-550 e2e preflight: the dev server API URL is not the mocked local origin.');
}

const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

/** Desktop Chrome, minus its viewport and scale (each project sets its own width). */
const chromium = {
  ...devices['Desktop Chrome'],
  deviceScaleFactor: 1,
  ...(executablePath ? { launchOptions: { executablePath } } : {}),
};

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  // Goldens live next to the specs, one folder per viewport project, no platform suffix:
  // they are generated in CI on linux only.
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  // One dev server compiles on demand; parallel first hits only slow it down.
  workers: process.env.CI ? 2 : 1,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: E2E_BASE_URL,
    serviceWorkers: 'block',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-390', use: { ...chromium, viewport: { width: 390, height: 844 } } },
    { name: 'tablet-768', use: { ...chromium, viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1280', use: { ...chromium, viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // A distinct port from `yarn dev` (3000), so the two never share Next's dev lock.
    // Resolved, not from PATH, so it works however the run is started (yarn, npx, CI).
    command: `node "${require.resolve('next/dist/bin/next')}" dev -p ${E2E_WEB_PORT}`,
    cwd: __dirname,
    url: E2E_BASE_URL,
    // Always false (T-550): never reuse a server whose env we did not set; a busy port fails.
    reuseExistingServer: false,
    // The first compile of a page is slow.
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: webServerEnv,
  },
});
