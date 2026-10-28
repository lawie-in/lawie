/**
 * T-523 AC1, AC6: the signed-in dashboard shell ("Your shelf") against the mocked gateway.
 * Flow specs run on desktop-1280; the breakpoint test sets its own viewport widths.
 */
import { expect, mockApi, test } from './fixtures';
import { flowsOnDesktopOnly, seedSignedIn } from './helpers';
import {
  balances,
  documents,
  E2E_TEMPLATES,
  intakeEnabled,
  json,
  shellMocks,
  shells,
  statuses,
  templateConfigs,
} from './mocks';

flowsOnDesktopOnly();

test.describe('dashboard shell: Free user', () => {
  test('shows the Ink pill, the command bar, recent documents and the KPI tiles', async ({
    page,
    context,
  }) => {
    await seedSignedIn(page, context);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { level: 1, name: 'Your shelf' })).toBeVisible();
    await expect(page.getByText('Hello, Asha Advocate')).toBeVisible();
    await expect(page.getByRole('banner').getByText(/5\s*Ink/)).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'What do you need to draft?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draft', exact: true })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Recent documents' })).toBeVisible();
    await expect(page.getByText('Regular bail application').first()).toBeVisible();

    for (const tile of [
      'Ink balance',
      'Drafts this month',
      'Draft and finalised',
      'Plan and renewal',
      'Ink used this month',
      'Drafts by type',
    ]) {
      await expect(page.getByRole('group', { name: tile })).toBeVisible();
    }
    await expect(page.getByText('Free plan, no renewal')).toBeVisible();
  });

  test('an empty shelf shows the first-time state', async ({ page, context }) => {
    await seedSignedIn(page, context, { mocks: shellMocks({ documents: [] }) });
    await page.goto('/dashboard');
    await expect(page.getByText('The shelf is empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start your first draft' })).toBeVisible();
  });

  test('zero Ink shows the Free-plan message', async ({ page, context }) => {
    await seedSignedIn(page, context, { mocks: shells.zeroInk() });
    await page.goto('/dashboard');
    await expect(
      page.getByText('You have used your 5 Ink. Top up or choose a plan to keep drafting.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Top up' })).toBeVisible();
  });
});

test.describe('dashboard shell: paid plans', () => {
  test('Solo shows the plan and renewal tile', async ({ page, context }) => {
    await seedSignedIn(page, context, { mocks: shells.solo() });
    await page.goto('/dashboard');
    await expect(page.getByText(/^Solo, renews on /)).toBeVisible();
    await expect(page.getByRole('banner').getByText(/50\s*Ink/)).toBeVisible();
  });

  test('Pro shows the plan and renewal tile', async ({ page, context }) => {
    await seedSignedIn(page, context, { mocks: shells.pro() });
    await page.goto('/dashboard');
    await expect(page.getByText(/^Pro, renews on /)).toBeVisible();
    await expect(page.getByRole('banner').getByText(/150\s*Ink/)).toBeVisible();
  });

  test('past_due shows Payment failed on the plan tile', async ({ page, context }) => {
    await seedSignedIn(page, context, { mocks: shells.pastDue() });
    await page.goto('/dashboard');
    await expect(page.getByRole('group', { name: 'Plan and renewal' })).toContainText(
      'Payment failed',
    );
  });

  test('a plan that ends at the period end shows the Ends on line', async ({ page, context }) => {
    await seedSignedIn(page, context, { mocks: shells.endsAt() });
    await page.goto('/dashboard');
    await expect(page.getByRole('group', { name: 'Plan and renewal' })).toContainText(
      /Ends on .*2026/,
    );
  });
});

test.describe('dashboard shell: top bar and command bar', () => {
  test('the top bar nav collapses below 720 px and shows from 720 px', async ({
    page,
    context,
  }) => {
    await seedSignedIn(page, context);
    await page.setViewportSize({ width: 720, height: 900 });
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Dashboard' });
    await expect(nav).toBeVisible();

    await page.setViewportSize({ width: 719, height: 900 });
    await expect(nav).toBeHidden();
    // The links move into the account menu.
    await page.getByRole('button', { name: 'Asha Advocate' }).click();
    await expect(page.getByRole('link', { name: 'My documents' })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      i: window.innerWidth,
    }));
    expect(overflow.w).toBeLessThanOrEqual(overflow.i);
  });

  test('Draft writes the prefill key, opens /dashboard/new and the text is not submitted', async ({
    page,
    context,
  }) => {
    await seedSignedIn(page, context);
    await mockApi(page, {
      'GET /api/documents/intake/enabled': json(intakeEnabled()),
      'GET /api/documents/template-configs': json(templateConfigs()),
    });
    // Record what is written to sessionStorage (the key is removed once /dashboard/new reads it).
    await page.addInitScript(() => {
      const w = window as unknown as { __writes: Array<[string, string]> };
      w.__writes = [];
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === 'lawie:draft-prefill') w.__writes.push([k, v]);
        return orig.call(this, k, v);
      };
    });
    const text = 'A bail application for a client arrested on Tuesday. First offence.';
    await page.goto('/dashboard');
    await page.getByRole('combobox', { name: 'What do you need to draft?' }).fill(text);
    await page.getByRole('button', { name: 'Draft', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard\/new$/);
    await expect(page.getByLabel('Your matter')).toHaveValue(text);
    // Still on the describe step: nothing was submitted (no brief mock exists, so a POST fails).
    await expect(
      page.getByRole('heading', { level: 1, name: 'What do you need to draft?' }),
    ).toBeVisible();
    // T-630 B: the page reads and clears the key, then saves the textarea back under the same key
    // 500 ms after typing pauses (so a reload keeps it). Every write is the same text, never more.
    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem('lawie:draft-prefill')))
      .toBe(text);
    const writes = await page.evaluate(
      () => (window as unknown as { __writes: Array<[string, string]> }).__writes,
    );
    expect(writes[0]).toEqual(['lawie:draft-prefill', text]);
    for (const w of writes) expect(w).toEqual(['lawie:draft-prefill', text]);
  });

  test('a suggested chip with text typed opens /dashboard/new with the kind and no text in the URL', async ({
    page,
    context,
  }) => {
    await seedSignedIn(page, context);
    await mockApi(page, {
      'GET /api/documents/intake/enabled': json(intakeEnabled()),
      // The chip sends kind=bail_regular, so the mocked library lists that template too.
      'GET /api/documents/template-configs': json(
        templateConfigs([
          ...E2E_TEMPLATES,
          {
            template_id: 'bail_regular',
            display_name: 'Regular Bail',
            category: 'Criminal',
            description: 'Regular bail before a Sessions Court.',
            plan_access: 'free',
            credits_cost: 1,
          },
        ]),
      ),
    });
    // Record what is written to the prefill key and every URL the app pushes. The describe page
    // drops ?kind= from the address bar once it has applied it (it must not preset twice on a
    // reload), and reads then clears the key, so both are observed at navigation time.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __writes: Array<[string, string]>;
        __pushed: string[];
      };
      w.__writes = [];
      w.__pushed = [];
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === 'lawie:draft-prefill') w.__writes.push([k, v]);
        return orig.call(this, k, v);
      };
      const push = History.prototype.pushState;
      History.prototype.pushState = function (
        state: unknown,
        title: string,
        url?: string | URL | null,
      ) {
        if (url !== null && url !== undefined) w.__pushed.push(String(url));
        return push.call(this, state, title, url);
      };
    });
    const text = 'Bail application for Ravi';
    await page.goto('/dashboard');
    await page.getByRole('combobox', { name: 'What do you need to draft?' }).fill(text);
    await page.getByRole('option', { name: 'Bail application', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard\/new(\?kind=bail_regular)?$/);
    // T-630 B: the landing page shows the typed text AND the kind preset (its heading).
    await expect(page.getByLabel('Your matter')).toHaveValue(text);
    await expect(page.getByRole('heading', { level: 1, name: 'Regular Bail' })).toBeVisible();
    // The page drops ?kind= once it has applied it: the settled URL has no query at all.
    await expect(page).toHaveURL(/\/dashboard\/new$/);
    const state = await page.evaluate(() => {
      const w = window as unknown as { __writes: Array<[string, string]>; __pushed: string[] };
      return { writes: w.__writes, pushed: w.__pushed };
    });
    // The kind is the only query param; the typed text never enters the URL.
    expect(state.pushed).toContain('/dashboard/new?kind=bail_regular');
    for (const url of state.pushed) expect(url).not.toMatch(/Ravi|q=|%20/);
    expect(page.url()).not.toContain('Ravi');
    expect(page.url()).not.toContain('q=');
    // The text travels in sessionStorage only; later writes are the describe page saving it back.
    expect(state.writes[0]).toEqual(['lawie:draft-prefill', text]);
    for (const w of state.writes) expect(w).toEqual(['lawie:draft-prefill', text]);
  });

  test('T-630 B: text typed on /dashboard/new survives a reload', async ({ page, context }) => {
    await seedSignedIn(page, context);
    await mockApi(page, {
      'GET /api/documents/intake/enabled': json(intakeEnabled()),
      'GET /api/documents/template-configs': json(templateConfigs()),
    });
    const text = 'Typed on the new page about a cheque that bounced for Meena';
    await page.goto('/dashboard/new');
    const box = page.getByLabel('Your matter');
    await box.fill(text);
    // The save waits for typing to pause (500 ms); poll for it rather than sleeping blind.
    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem('lawie:draft-prefill')), {
        timeout: 5000,
      })
      .toBe(text);
    await page.reload();
    await expect(page.getByLabel('Your matter')).toHaveValue(text);
    expect(page.url()).not.toContain('Meena');
  });

  test('the theme toggle switches html[data-theme]', async ({ page, context }) => {
    await seedSignedIn(page, context, {
      theme: 'night',
      mocks: shellMocks({ balance: balances.free(), status: statuses.free() }),
    });
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

    await page.getByRole('button', { name: 'Asha Advocate' }).click();
    await page.getByRole('radio', { name: 'Daylight' }).check({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'daylight');

    await page.getByRole('radio', { name: 'Night' }).check({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  });
});

test.describe('dashboard shell: documents list', () => {
  test('lists the mocked documents', async ({ page, context }) => {
    await seedSignedIn(page, context, {
      mocks: { ...shellMocks(), 'GET /api/documents': json(documents()) },
    });
    await page.goto('/dashboard/documents');
    await expect(page.getByRole('heading', { level: 1, name: 'My documents' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Regular bail application' })).toBeVisible();
  });
});
