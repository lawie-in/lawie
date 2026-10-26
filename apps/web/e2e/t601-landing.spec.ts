/**
 * T-601: the Reading Desk landing, on all three projects (390 / 768 / 1280) in both themes.
 * Covers Rajesh's acceptance checks 1, 2, 3 (drawers), 6 (no video section today) and parts of 7;
 * checks 4, 5, 7 (printed ratios, in jest), 8 are listed in the report as unit or manual.
 *
 * Harness rules (e2e/README.md): deny-by-default network (the fixture fails any non-local request
 * and any unmocked gateway call), reduced motion on by default, no committed goldens. LCP and CLS
 * are measured and ANNOTATED, never asserted.
 */
import { expect, test } from './fixtures';
import { THEMES, pageOverflow, seedVisitor, settle, type Theme } from './helpers';

const H1_EN = 'Describe the matter. Read the draft.';
const H1_HI = 'मामला बताइए। ड्राफ़्ट पढ़िए।';

async function openLanding(page: import('@playwright/test').Page, theme: Theme) {
  const consoleErrors: string[] = [];
  const requests: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: H1_EN })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await settle(page);
  return { consoleErrors, requests };
}

const drawers = (page: import('@playwright/test').Page) => page.locator('button[data-drawer]');
const panel = (page: import('@playwright/test').Page) => page.locator('[data-drawer-panel]');

for (const theme of THEMES) {
  test.describe(`t601 landing (${theme})`, () => {
    test.beforeEach(async ({ context }) => {
      await seedVisitor(context, theme);
    });

    test('one h1, the section ids exist, no horizontal overflow at the top', async ({ page }) => {
      await openLanding(page, theme);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('header')).toHaveCount(1);
      for (const id of ['how-it-works', 'documents', 'prices', 'faq']) {
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      }
      const o = await pageOverflow(page);
      expect(o.scrollWidth).toBeLessThanOrEqual(o.inner);
    });

    test('hero folio shows the finished state under reduced motion (acceptance 2)', async ({
      page,
    }) => {
      await openLanding(page, theme);
      const reduced = await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      expect(reduced).toBe(true);
      const folio = page.getByRole('figure', { name: 'Sample draft, fictional parties' });
      await expect(folio).toBeVisible();
      await expect(page.locator('[data-folio-phase]')).toHaveAttribute('data-folio-phase', 'done');
      await expect(page.locator('[data-folio-pct]')).toHaveText('54%');
      const written = page.locator('[data-folio-line]');
      await expect(written).toHaveCount(3);
      for (let i = 0; i < 3; i += 1) await expect(written.nth(i)).toBeVisible();
      await expect(page.locator('[data-folio-rest]')).toHaveCount(0);
      await expect(page.locator('[data-watermark]')).toBeVisible();
      await expect(page.locator('[data-watermark]')).toHaveAttribute('aria-hidden', 'true');
      // The finished text is also in the accessibility tree once.
      await expect(
        folio.getByRole('listitem').filter({ hasText: 'The applicant is a first-time accused' }),
      ).toHaveCount(1);
    });

    test('drawers: first open, one at a time, click and keyboard, panel visible and inside the viewport (acceptance 3)', async ({
      page,
    }) => {
      await openLanding(page, theme);
      const d = drawers(page);
      const n = await d.count();
      expect(n).toBeGreaterThanOrEqual(2);
      await expect(d.first()).toHaveAttribute('aria-expanded', 'true');
      for (let i = 1; i < n; i += 1)
        await expect(d.nth(i)).toHaveAttribute('aria-expanded', 'false');

      // Click: the second opens, the first closes.
      await d.nth(1).click();
      await expect(d.nth(1)).toHaveAttribute('aria-expanded', 'true');
      await expect(d.first()).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('[aria-expanded="true"][data-drawer]')).toHaveCount(1);

      const box = await panel(page).boundingBox();
      const vw = page.viewportSize()!.width;
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 0.5);
      await expect(panel(page)).toBeVisible();
      await expect(panel(page)).toHaveAttribute('role', 'region');

      // Keyboard: Enter on the focused third (or last) drawer, Space on another.
      const third = d.nth(Math.min(2, n - 1));
      await third.focus();
      await page.keyboard.press('Enter');
      await expect(third).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[aria-expanded="true"][data-drawer]')).toHaveCount(1);
      const first = d.first();
      await first.focus();
      await page.keyboard.press('Space');
      await expect(first).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[aria-expanded="true"][data-drawer]')).toHaveCount(1);
      // Every drawer points at the one panel; the panel follows the buttons in DOM order.
      const controls = await d.evaluateAll((els) =>
        els.map((e) => e.getAttribute('aria-controls')),
      );
      const panelId = await panel(page).getAttribute('id');
      expect(new Set(controls)).toEqual(new Set([panelId]));
      const after = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button[data-drawer]'));
        const p = document.querySelector('[data-drawer-panel]')!;
        return btns.every(
          (b) => !!(b.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING),
        );
      });
      expect(after).toBe(true);
    });

    test('no horizontal overflow with every drawer open in turn', async ({ page }) => {
      await openLanding(page, theme);
      const d = drawers(page);
      const n = await d.count();
      for (let i = 0; i < n; i += 1) {
        await d.nth(i).click();
        const o = await pageOverflow(page);
        expect({ i, over: o.scrollWidth > o.inner }).toEqual({ i, over: false });
      }
    });

    test('Hindi toggle swaps the h1 and category names; template titles stay English', async ({
      page,
    }) => {
      await openLanding(page, theme);
      const english = await panel(page).locator('li').first().innerText();
      const hi = page.locator('button[lang="hi"]').first();
      if (!(await hi.isVisible())) await page.locator('[data-topbar-menu-trigger]').click();
      await page.locator('button[lang="hi"]:visible').first().click();
      await expect(page.getByRole('heading', { level: 1, name: H1_HI })).toBeVisible();
      await expect(drawers(page).first().locator('span').first()).toHaveText(
        'आपराधिक: जमानत और हिरासत',
      );
      await expect(panel(page).locator('ul')).toHaveAttribute('lang', 'en');
      await expect(panel(page).locator('li').first()).toHaveText(english);
      const o = await pageOverflow(page);
      expect(o.scrollWidth).toBeLessThanOrEqual(o.inner);
    });

    test('top bar CTA is ghost at the top and after scrolling to the bottom (acceptance 1)', async ({
      page,
    }) => {
      await openLanding(page, theme);
      const bar = page.locator('header').first();
      const cta = bar.locator('a[href="/login?mode=signup"]:visible').first();
      const isBrassFill = () =>
        cta.evaluate(
          (a) =>
            a.classList.contains('bg-nl-brass') ||
            getComputedStyle(a).backgroundColor ===
              getComputedStyle(document.documentElement).getPropertyValue('--brass'),
        );
      await expect(cta).toBeVisible();
      expect(await isBrassFill()).toBe(false);
      const bg0 = await cta.evaluate((a) => getComputedStyle(a).backgroundColor);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(400);
      await expect(cta).toBeVisible();
      expect(await isBrassFill()).toBe(false);
      expect(await cta.evaluate((a) => getComputedStyle(a).backgroundColor)).toBe(bg0);
      // Never hidden, never swapped to a second control.
      await expect(bar.locator('a[href="/login?mode=signup"]:visible')).toHaveCount(1);
    });

    test('the hero CTA is the only brass-filled control in the first viewport (acceptance 1)', async ({
      page,
    }) => {
      await openLanding(page, theme);
      const filled = await page.evaluate(() => {
        const brass = getComputedStyle(document.querySelector('.nl-root')!)
          .getPropertyValue('--brass')
          .trim();
        const toRgb = (hex: string) => {
          const n = parseInt(hex.slice(1), 16);
          return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
        };
        const want = toRgb(brass);
        return Array.from(document.querySelectorAll('a, button'))
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.top < window.innerHeight && r.bottom > 0 && r.width > 0;
          })
          .filter((e) => getComputedStyle(e).backgroundColor === want)
          .map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim());
      });
      expect(filled).toEqual(['Start with 5 free Ink']);
    });

    test('no video and no samples sections exist today (acceptance 6)', async ({ page }) => {
      await openLanding(page, theme);
      await expect(page.locator('video')).toHaveCount(0);
      await expect(page.locator('[data-section="video"]')).toHaveCount(0);
      await expect(page.locator('[data-section="samples"]')).toHaveCount(0);
      await expect(page.locator('a[data-sample]')).toHaveCount(0);
    });

    test('no console errors and no request to a non-local host, the gateway or the model', async ({
      page,
    }) => {
      const seen = await openLanding(page, theme);
      await drawers(page).nth(1).click();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(500);
      expect(seen.consoleErrors).toEqual([]);
      for (const u of seen.requests) {
        const url = new URL(u);
        expect(['localhost', '127.0.0.1']).toContain(url.hostname);
        expect(url.port).not.toBe('4000');
        expect(u).not.toMatch(/anthropic|\/api\/(drafts?|generate|auth|billing)/i);
      }
    });

    test('anchors #prices and #faq are reachable from the top bar', async ({ page }) => {
      await openLanding(page, theme);
      for (const [name, id] of [
        ['Prices', 'prices'],
        ['FAQ', 'faq'],
      ] as const) {
        const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });
        if (await link.isVisible()) {
          await link.click();
        } else {
          await page.locator('[data-topbar-menu-trigger]').click();
          await page.locator('[data-topbar-menu] nav').getByRole('link', { name }).click();
        }
        await expect(page).toHaveURL(new RegExp(`#${id}$`));
        await expect(page.locator(`#${id}`)).toBeInViewport();
        // The sticky bar does not cover the section heading.
        const bar = await page.locator('header').first().boundingBox();
        const heading = await page.locator(`#${id} h2`).first().boundingBox();
        expect(heading!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1);
      }
    });

    test('focus is visible on the drawer buttons (keyboard)', async ({ page }) => {
      await openLanding(page, theme);
      const d = drawers(page).nth(1);
      await d.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(d).toBeFocused();
      const ring = await d.evaluate((e) => {
        const s = getComputedStyle(e);
        return {
          focusVisible: e.matches(':focus-visible'),
          outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
          shadow: s.boxShadow !== 'none',
        };
      });
      expect(ring.focusVisible).toBe(true);
      expect(ring.outline || ring.shadow).toBe(true);
    });

    test('tap targets: the CTA and every drawer are at least 44px', async ({ page }) => {
      await openLanding(page, theme);
      const cta = page
        .getByRole('main')
        .getByRole('link', { name: 'Start with 5 free Ink' })
        .first();
      const cb = await cta.boundingBox();
      expect(cb!.height).toBeGreaterThanOrEqual(44);
      const sizes = await drawers(page).evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { w: r.width, h: r.height };
        }),
      );
      for (const s of sizes) {
        expect(s.h).toBeGreaterThanOrEqual(44);
        expect(s.w).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test.describe('t601 landing: LCP and CLS (annotated, never asserted)', () => {
  test.beforeEach(async ({ context }) => {
    await seedVisitor(context, 'night');
  });

  test('measures the LCP element and CLS', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'tablet-768', 'measured at 390 and 1280 only');
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp?: string; __cls?: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1) as
          | (PerformanceEntry & { element?: Element; size?: number })
          | undefined;
        if (last) {
          const el = last.element;
          w.__lcp = `${el?.tagName ?? '?'}${el?.id ? '#' + el.id : ''}${
            el?.className && typeof el.className === 'string'
              ? '.' + el.className.split(' ')[0]
              : ''
          } ${(el?.textContent ?? '').trim().slice(0, 40)} size=${last.size}`;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (!e.hadRecentInput) w.__cls = (w.__cls ?? 0) + e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: H1_EN })).toBeVisible();
    await settle(page);
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const w = window as unknown as { __lcp?: string; __cls?: number };
      return { lcp: w.__lcp ?? 'none', cls: w.__cls ?? 0 };
    });
    testInfo.annotations.push({ type: 'LCP element', description: m.lcp });
    testInfo.annotations.push({ type: 'CLS', description: m.cls.toFixed(4) });
    // eslint-disable-next-line no-console
    console.info(
      `[T-601] ${testInfo.project.name}: LCP ${m.lcp}; CLS ${m.cls.toFixed(4)} (dev server)`,
    );
  });
});
