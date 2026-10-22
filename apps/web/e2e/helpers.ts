/**
 * T-523: small helpers shared by the flow and matrix specs. Nothing here reaches the network:
 * the gateway is mocked through e2e/fixtures.ts (mockApi) and the T-550 guard stays on.
 */
import path from 'path';

import type { BrowserContext, Page, TestInfo } from '@playwright/test';

import { mockApi, seedAuth, seedConsentDenied, seedSplashSeen, seedTheme, test } from './fixtures';
import { shells } from './mocks';
import type { FakeUser } from './mocks/auth';
import type { ApiMocks } from './mocks/reply';

export type Theme = 'night' | 'daylight';
export const THEMES: readonly Theme[] = ['night', 'daylight'];

/** The only project the long flow specs run on; the screenshot matrix runs on all three. */
export const FLOW_PROJECT = 'desktop-1280';

/**
 * Registers a beforeEach (for the enclosing describe, or the whole file at top level) that skips
 * the tests outside the named projects, with a reason the report shows.
 */
export function onlyOn(...projects: string[]): void {
  // Playwright reads the fixtures from the first parameter's destructuring pattern, so it must
  // be an object pattern even when empty.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !projects.includes(testInfo.project.name),
      `runs on ${projects.join(', ')} only; the screenshot matrix runs on all three`,
    );
  });
}

/** The long flow specs run on desktop-1280 only. Call once at the top of a flow spec. */
export function flowsOnDesktopOnly(): void {
  onlyOn(FLOW_PROJECT);
}

/** Seeds a signed-out visitor: consent already declined and synced, splash already seen. */
export async function seedVisitor(context: BrowserContext, theme: Theme = 'night'): Promise<void> {
  await seedConsentDenied(context);
  await seedSplashSeen(context);
  await seedTheme(context, theme);
}

export interface SignedInOptions {
  theme?: Theme;
  user?: Partial<FakeUser>;
  /** Gateway mocks for the signed-in shell. Default: a Free user with 5 Ink. */
  mocks?: ApiMocks;
}

/**
 * Seeds a signed-in browser (fake unsigned JWT, consent declined, theme) and answers the shell's
 * background calls. Returns the calls the shell mocks answered.
 */
export async function seedSignedIn(
  page: Page,
  context: BrowserContext,
  { theme = 'night', user, mocks = shells.free() }: SignedInOptions = {},
) {
  await seedConsentDenied(context);
  await seedSplashSeen(context);
  await seedTheme(context, theme);
  await seedAuth(context, user);
  return mockApi(page, mocks);
}

/** True when nothing makes the page scroll sideways. */
export async function pageOverflow(page: Page): Promise<{ scrollWidth: number; inner: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
}

/** Waits for the web fonts the page asked for (the sandbox falls back to system fonts). */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * Saves a full-page PNG under e2e/artefacts/<project>/<theme>/<name>.png (gitignored; CI uploads
 * the folder). These are artefacts for a human to look at, never compared against a baseline.
 */
export async function saveShot(
  page: Page,
  testInfo: TestInfo,
  theme: Theme | 'any',
  name: string,
): Promise<string> {
  await settle(page);
  const file = path.resolve(__dirname, 'artefacts', testInfo.project.name, theme, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/**
 * Hides the Next.js dev-mode error overlay and indicator, so a dev-only badge never ends up in a
 * screenshot. Only used for artefacts; it changes no app behaviour.
 */
export async function hideDevOverlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = 'nextjs-portal{display:none !important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });
}
