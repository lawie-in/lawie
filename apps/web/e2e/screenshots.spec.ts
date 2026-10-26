/**
 * T-523 AC2, AC6: the screenshot matrix. Runs on all three projects (390, 768, 1280 px) in both
 * themes. Every state saves a full-page PNG to e2e/artefacts/<project>/<theme>/<name>.png
 * (gitignored; CI uploads them) and asserts its landmark is visible and that the page does not
 * scroll sideways.
 *
 * Goldens (toHaveScreenshot) exist ONLY for the shell and the landing page, and ONLY when
 * E2E_GOLDENS=1 (CI). They are never taken for a screen with model text (draft ready, generating,
 * the brief). A sandbox run has no baselines and skips them.
 */
import type { BrowserContext, Page } from '@playwright/test';

import { expect, mockApi, test } from './fixtures';
import { E2E_BASE_URL } from './guards';
import {
  THEMES,
  hideDevOverlay,
  pageOverflow,
  saveShot,
  seedSignedIn,
  seedVisitor,
  type Theme,
} from './helpers';
import {
  briefResponse,
  documents,
  generateReply,
  intakeEnabled,
  json,
  shellMocks,
  shells,
  templateConfigs,
} from './mocks';
import type { ApiMocks } from './mocks';

const goldens = process.env.E2E_GOLDENS === '1';

const newDraftMocks = (): ApiMocks => ({
  'GET /api/documents/intake/enabled': json(intakeEnabled()),
  'GET /api/documents/template-configs': json(templateConfigs()),
  'POST /api/documents/intake/brief': json(briefResponse()),
  'POST /api/documents/generate-from-brief': generateReply(undefined, { delayMs: 0 }),
});

async function noSideways(page: Page): Promise<void> {
  const { scrollWidth, inner } = await pageOverflow(page);
  expect(scrollWidth, `page scrolls sideways (${scrollWidth} > ${inner})`).toBeLessThanOrEqual(
    inner,
  );
}

async function shellIn(
  page: Page,
  context: BrowserContext,
  theme: Theme,
  mocks: ApiMocks = shells.free(),
): Promise<void> {
  await seedSignedIn(page, context, { theme, mocks });
}

async function openShell(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Your shelf' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Plan and renewal' })).toBeVisible();
  // Wait for the data, not a timer: the Ink tile and the shelf have arrived.
  await expect(page.getByText('Regular bail application').first()).toBeVisible();
}

async function openDescribe(page: Page): Promise<void> {
  await page.goto('/dashboard/new');
  await expect(
    page.getByRole('heading', { level: 1, name: 'What do you need to draft?' }),
  ).toBeVisible();
}

for (const theme of THEMES) {
  test.describe(`screenshots: ${theme}`, () => {
    test(`landing`, async ({ page, context }, testInfo) => {
      await seedVisitor(context, theme);
      await page.goto('/');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Describe the matter. Read the draft.' }),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'landing');
    });

    test(`login`, async ({ page, context }, testInfo) => {
      await seedVisitor(context, theme);
      await page.goto('/login?mode=signin');
      await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'login');
    });

    test(`dashboard shell (Free)`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme);
      await openShell(page);
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'shell-free');
    });

    test(`dashboard shell: zero Ink`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme, shells.zeroInk());
      await openShell(page);
      await expect(page.getByText(/You have used your 5 Ink/)).toBeVisible();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'shell-zero-ink');
    });

    test(`dashboard shell: past_due`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme, shells.pastDue());
      await openShell(page);
      await expect(page.getByRole('group', { name: 'Plan and renewal' })).toContainText(
        'Payment failed',
      );
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'shell-past-due');
    });

    test(`dashboard shell: ends-at`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme, shells.endsAt());
      await openShell(page);
      await expect(page.getByRole('group', { name: 'Plan and renewal' })).toContainText(/Ends on/);
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'shell-ends-at');
    });

    test(`dashboard shell: empty shelf`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme, shellMocks({ documents: [] }));
      await page.goto('/dashboard');
      await expect(page.getByText('The shelf is empty')).toBeVisible();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'shell-empty');
    });

    test(`new draft: describe step`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme);
      await mockApi(page, newDraftMocks());
      await openDescribe(page);
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'new-draft-describe');
    });

    test(`documents list`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme, {
        ...shells.free(),
        'GET /api/documents': json(documents()),
      });
      await page.goto('/dashboard/documents');
      await expect(page.getByRole('link', { name: 'Regular bail application' })).toBeVisible();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'documents');
    });

    test(`settings: plan`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme);
      await page.goto('/dashboard/settings#plan');
      await expect(page.getByRole('button', { name: 'Choose Solo' })).toBeVisible();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'settings-plan');
    });

    test(`draft ready`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme);
      await mockApi(page, newDraftMocks());
      await openDescribe(page);
      await page.getByLabel('Your matter').fill('Recover Rs 2,50,000 owed by Mehta Traders.');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Check your brief' })).toBeVisible();
      await page.getByRole('button', { name: 'Confirm brief and continue' }).click();
      await expect(page.getByText('Your draft is ready.')).toBeVisible();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'draft-ready');
    });

    test(`app error page`, async ({ page, context }, testInfo) => {
      // A malformed documents payload (a row with no docType) makes the documents list throw
      // while rendering, which app/error.tsx catches. No source change needed.
      await hideDevOverlay(page);
      await shellIn(page, context, theme, {
        ...shells.free(),
        'GET /api/documents': json({
          documents: [
            { _id: 'doc_bad', title: 'Broken row', status: 'draft', createdAt: '2026-10-20' },
          ],
        }),
      });
      await page.goto('/dashboard/documents');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Something went wrong on our side' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'error-page');
    });

    test(`root loading folio`, async ({ page, context }, testInfo) => {
      test.fixme(
        true,
        'app/loading.tsx is not reachable without a src change: a client navigation with its RSC request held keeps the previous page (router transition), and a first load cannot be delayed at the Next server from page.route. Needs a test-only route or a slow server component.',
      );
      await hideDevOverlay(page);
      await seedVisitor(context, theme);
      // Hold the router's server-component request for /login until the shot is taken.
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(`${E2E_BASE_URL}/login**`, async (route) => {
        if (route.request().headers()['rsc']) await gate;
        await route.fallback();
      });
      await page.goto('/');
      try {
        await page
          .getByRole('main')
          .getByRole('link', { name: 'Start with 5 free Ink' })
          .first()
          .click();
        await expect(page.getByText('Loading', { exact: true })).toBeAttached();
        await noSideways(page);
        await saveShot(page, testInfo, theme, 'loading-folio');
      } finally {
        release();
      }
    });

    test(`forced colours: shell`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme);
      await page.emulateMedia({ forcedColors: 'active' });
      await openShell(page);
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'forced-colours-shell');
    });

    test(`forced colours: new draft`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme);
      await mockApi(page, newDraftMocks());
      await page.emulateMedia({ forcedColors: 'active' });
      await openDescribe(page);
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'forced-colours-new-draft');
    });

    test(`200% text: shell`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme);
      await openShell(page);
      await page.addStyleTag({ content: 'html{font-size:200% !important}' });
      await expect(page.getByRole('heading', { level: 1, name: 'Your shelf' })).toBeVisible();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'text-200-shell');
    });

    test(`200% text: new draft`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme);
      await mockApi(page, newDraftMocks());
      await openDescribe(page);
      await page.addStyleTag({ content: 'html{font-size:200% !important}' });
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'text-200-new-draft');
    });

    test(`top bar at 719 and 720 px`, async ({ page, context }, testInfo) => {
      await shellIn(page, context, theme);
      const nav = page.getByRole('navigation', { name: 'Dashboard' });
      await page.setViewportSize({ width: 720, height: 900 });
      await openShell(page);
      await expect(nav).toBeVisible();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'topbar-720');

      await page.setViewportSize({ width: 719, height: 900 });
      await expect(nav).toBeHidden();
      await noSideways(page);
      await saveShot(page, testInfo, theme, 'topbar-719');
    });
  });
}

test.describe('goldens (shell and landing only; CI only)', () => {
  for (const theme of THEMES) {
    test(`golden: landing (${theme})`, async ({ page, context }) => {
      test.skip(!goldens, 'goldens are generated in CI only (E2E_GOLDENS=1)');
      await seedVisitor(context, theme);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page).toHaveScreenshot(`landing-${theme}.png`, { fullPage: true });
    });

    test(`golden: dashboard shell (${theme})`, async ({ page, context }) => {
      test.skip(!goldens, 'goldens are generated in CI only (E2E_GOLDENS=1)');
      await shellIn(page, context, theme);
      await openShell(page);
      await expect(page).toHaveScreenshot(`shell-${theme}.png`, {
        fullPage: true,
        // The date line changes every day.
        mask: [page.getByText(/^[A-Z][a-z]+day, \d{1,2} [A-Z][a-z]+ \d{4}$/)],
      });
    });
  }
});
