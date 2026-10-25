/**
 * T-578: the document editor's focus (full-screen) mode and the fold. Runs on all three projects
 * (390, 768, 1280) in both themes, 768px-tall viewport (the design note's reference).
 *
 * Pass/fail measure (Rajesh, 23 Oct): the editor ROOT box, i.e. the toolbar's top edge. The
 * .ProseMirror top is recorded as an annotation and never fails the test.
 * The document is mocked at the gateway edge (T-550); nothing real is contacted. No goldens are
 * taken: screenshots go to e2e/artefacts/ only.
 */
import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  THEMES,
  hideDevOverlay,
  pageOverflow,
  saveShot,
  seedSignedIn,
  type Theme,
} from './helpers';
import { json, shells } from './mocks';

const LABEL = 'Starting draft — review before use · not court-verified';
const DISCLAIMER =
  'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.';
const HELP = 'Prepared from the details you entered.';

const paras = Array.from(
  { length: 40 },
  (_, i) => `<p>Paragraph ${i + 1}. The petitioner submits that the matter is fit for relief.</p>`,
).join('');

const docBody = () => ({
  _id: 'd1',
  title: 'Regular bail application',
  docType: 'bail_application',
  courtType: 'high_court',
  courtName: 'Patna High Court',
  content: `<p>Opening line</p>${paras}`,
  status: 'draft',
  sectionsCited: [],
  filingChecklist: ['Court fee stamp'],
  checklistState: [false],
  exportedAs: [],
  version: 1,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  courtDocument: true,
  hasParty: true,
  startingDraft: true,
  startingDraftLabel: LABEL,
  disclaimer: DISCLAIMER,
});

async function openDoc(page: Page, theme: Theme, context: Parameters<typeof seedSignedIn>[1]) {
  await hideDevOverlay(page);
  const mocks = {
    ...shells.free(),
    'GET /api/documents/:id': json(docBody()),
    'PATCH /api/documents/:id': json({ version: 2, updatedAt: '2026-10-23T00:00:00Z' }),
  };
  const calls = await seedSignedIn(page, context, { theme, mocks });
  await page.goto('/dashboard/documents/d1');
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await expect(page.getByText(DISCLAIMER, { exact: true })).toBeVisible();
  return calls;
}

const toggle = (page: Page) => page.locator('button[aria-pressed]');
/** The editor root: the toolbar's parent (control -> right group -> toolbar -> root). */
const editorRoot = (page: Page): Locator => toggle(page).locator('xpath=../../..');

async function topOf(loc: Locator): Promise<number> {
  return loc.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
}

/** WCAG 2.x contrast of two computed rgb() colours. */
function rgb(c: string): [number, number, number] {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  if (!m) throw new Error(`not rgb: ${c}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function lum([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function noSideways(page: Page): Promise<void> {
  const { scrollWidth, inner } = await pageOverflow(page);
  expect(scrollWidth, `page scrolls sideways (${scrollWidth} > ${inner})`).toBeLessThanOrEqual(
    inner,
  );
}

for (const theme of THEMES) {
  test.describe(`T-578 editor focus mode: ${theme}`, () => {
    test(`fold, notes, focus mode open and close`, async ({ page, context }, testInfo) => {
      const width = testInfo.project.use.viewport!.width;
      await page.setViewportSize({ width, height: 768 });
      const calls = await openDoc(page, theme, context);

      // Fold: the editor root's top (pass/fail), and the .ProseMirror top (recorded only).
      const rootTop = await topOf(editorRoot(page));
      const pmTop = await topOf(page.locator('.ProseMirror'));
      const limit = width >= 1280 ? 220 : 300;
      testInfo.annotations.push({
        type: 'T-578 tops',
        description: `${testInfo.project.name} ${theme}: editor root ${rootTop.toFixed(1)}px (limit ${limit}), .ProseMirror ${pmTop.toFixed(1)}px`,
      });
      console.log(
        `T-578 ${testInfo.project.name} ${theme}: root=${rootTop.toFixed(1)} pm=${pmTop.toFixed(1)} limit=${limit}`,
      );
      expect(rootTop, `editor root top ${rootTop} > ${limit}`).toBeLessThanOrEqual(limit);

      // Notes: byte-identical text, both visible without scrolling, not truncated, 4.5:1.
      const notes = page.getByRole('note');
      await expect(notes).toHaveCount(2);
      await expect(notes.nth(0)).toHaveText(LABEL);
      await expect(notes.nth(1)).toHaveText(DISCLAIMER);
      for (const n of [notes.nth(0), notes.nth(1)]) {
        await expect(n).toBeInViewport({ ratio: 1 });
        const clipped = await n.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
        expect(clipped, 'a note line is truncated').toBe(false);
        const { color, bg } = await n.evaluate((el) => {
          const p = el.tagName === 'P' ? el : (el.querySelector('p') ?? el);
          let bgEl: Element | null = p;
          let bgc = 'rgba(0, 0, 0, 0)';
          while (bgEl) {
            bgc = getComputedStyle(bgEl).backgroundColor;
            if (!/rgba\(0, 0, 0, 0\)|transparent/.test(bgc)) break;
            bgEl = bgEl.parentElement;
          }
          return { color: getComputedStyle(p).color, bg: bgc };
        });
        expect(ratio(color, bg), `contrast ${color} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }

      // Annexures: exactly one region; at lg it is in the right rail (right of the editor).
      const region = page.getByRole('region', { name: 'Annexures' });
      await expect(region).toHaveCount(1);
      const rb = (await region.boundingBox())!;
      const eb = (await editorRoot(page).boundingBox())!;
      if (width >= 1024) expect(rb.x).toBeGreaterThanOrEqual(eb.x + eb.width - 1);
      else expect(rb.y + rb.height).toBeLessThanOrEqual(eb.y + 1);

      await noSideways(page);
      await saveShot(page, testInfo, theme, 't578-doc-normal');

      // Open with the control.
      // Rajesh round 2: the accessible name is fixed; aria-pressed carries the state; the title swaps.
      await expect(toggle(page)).toHaveAttribute('aria-label', 'Focus mode');
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(toggle(page)).toHaveAttribute('title', 'Focus mode');
      await expect(page.getByRole('note')).toHaveCount(2);
      await page.locator('.ProseMirror').click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('X');
      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute('aria-label', 'Focus mode');
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(toggle(page)).toHaveAttribute('title', 'Exit focus mode');
      await expect(page.getByRole('button', { name: 'Focus mode' })).toHaveCount(1);
      // Layout settles a frame or two after the click (fade-in): poll, never read once.
      const vp = page.viewportSize()!;
      await expect
        .poll(
          async () => {
            const b = await editorRoot(page).boundingBox();
            return b && [b.x, b.y, Math.round(b.width), Math.round(b.height)].join(',');
          },
          { message: 'the editor root fills the window' },
        )
        .toBe(`0,0,${vp.width},${vp.height}`);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.overflow))
        .toBe('hidden');
      await noSideways(page);

      // The control is 44x44; the footer is the disclaimer, pinned at the bottom, fully visible.
      await expect
        .poll(async () => {
          const b = await toggle(page).boundingBox();
          return !!b && b.width >= 44 && b.height >= 44;
        })
        .toBe(true);
      const footer = editorRoot(page).getByRole('note');
      await expect(footer).toHaveCount(1);
      await expect(footer).toHaveText(DISCLAIMER);
      await expect(footer).toBeInViewport({ ratio: 1 });
      await expect
        .poll(async () => {
          const b = await footer.boundingBox();
          return b ? b.y + b.height : 0;
        })
        .toBeGreaterThan(vp.height - 4);
      expect(await footer.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(false);

      // Still visible after scrolling the canvas; the draft keeps the typed X.
      await page.locator('.ProseMirror').evaluate((el) => {
        let p: HTMLElement | null = el as HTMLElement;
        while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement;
        p?.scrollTo(0, p.scrollHeight);
      });
      await expect(footer).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.ProseMirror')).toContainText('X');
      await saveShot(page, testInfo, theme, 't578-doc-focus');

      // Autosave carries on, and its state shows in the toolbar in focus mode.
      await page.locator('.ProseMirror').click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('Y');
      await expect(editorRoot(page)).toContainText('Saved', { timeout: 10_000 });
      expect(calls.filter((c) => c.method === 'PATCH').length).toBeGreaterThanOrEqual(1);

      // Close with the control: focus back on it, scroll lock off, edits kept, footer gone.
      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute('aria-label', 'Focus mode');
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(toggle(page)).toHaveAttribute('title', 'Focus mode');
      await expect(toggle(page)).toBeFocused();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.overflow))
        .not.toBe('hidden');
      await expect(page.getByRole('note')).toHaveCount(2);
      await expect(page.locator('.ProseMirror')).toContainText('XY');

      // Open again and close with Escape from inside the editor.
      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
      await page.locator('.ProseMirror').click();
      await page.keyboard.press('Escape');
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(toggle(page)).toBeFocused();
      await expect(page.locator('.ProseMirror')).toContainText('XY');
      await noSideways(page);
    });
  });
}

/** Is document.activeElement inside the editor root (the focus-mode layer)? */
const focusInside = (root: Locator) =>
  root.evaluate((el) => !!document.activeElement && el.contains(document.activeElement));

for (const theme of THEMES) {
  test.describe(`T-578 focus mode keyboard: ${theme}`, () => {
    test(`Tab and Shift+Tab never leave the layer`, async ({ page, context }, testInfo) => {
      const width = testInfo.project.use.viewport!.width;
      await page.setViewportSize({ width, height: 768 });
      await openDoc(page, theme, context);
      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
      const root = editorRoot(page);
      await page.locator('.ProseMirror').click();

      const seen = new Set<string>();
      const id = () =>
        page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          return a
            ? `${a.tagName}|${a.getAttribute('title') ?? ''}|${a.className.toString().slice(0, 30)}`
            : 'none';
        });
      // 30 each way: more than the number of controls, so the wrap is exercised at both ends.
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab');
        expect(await focusInside(root), `Tab #${i + 1} left the layer`).toBe(true);
        seen.add(await id());
      }
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Shift+Tab');
        expect(await focusInside(root), `Shift+Tab #${i + 1} left the layer`).toBe(true);
        seen.add(await id());
      }
      // The sweep reached both the focus control and the editor (so it really wrapped around).
      expect([...seen].some((s) => s.includes('|Exit focus mode|'))).toBe(true);
      expect([...seen].some((s) => s.includes('contenteditable') || s.startsWith('DIV|'))).toBe(
        true,
      );
      // From the first control, Shift+Tab goes to the editor, not outside the layer.
      await page.locator('button[title="Undo"]').focus();
      await page.keyboard.press('Shift+Tab');
      expect(await focusInside(root)).toBe(true);
      await expect(page.locator('.ProseMirror')).toBeFocused();
      // From the editor (last), Tab goes to the first control.
      await page.keyboard.press('Tab');
      await expect(page.locator('button[title="Undo"]')).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    });

    test(`Ctrl+K closes the layer and the section finder shows, focused`, async ({
      page,
      context,
    }, testInfo) => {
      const width = testInfo.project.use.viewport!.width;
      await page.setViewportSize({ width, height: 768 });
      await openDoc(page, theme, context);
      await page.locator('.ProseMirror').click();
      await page.keyboard.type('Z');
      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
      await page.locator('.ProseMirror').click();
      await page.keyboard.press('Control+k');

      // The layer is gone at once: scroll lock off, toggle unpressed, editor back in the page.
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.overflow))
        .not.toBe('hidden');
      await expect(page.locator('[data-focus-mode="open"]')).toHaveCount(0);

      // The finder is open, visible, in the viewport, on top, and focus is in its search box.
      const search = page.getByPlaceholder('e.g. 302 IPC · 103 BNS · 154 CrPC');
      await expect(search).toBeVisible();
      await expect(search).toBeInViewport({ ratio: 1 });
      await expect(search).toBeFocused();
      const onTop = await search.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      });
      expect(onTop, 'the finder search box is covered by something').toBe(true);
      const aside = page.locator('aside:not([inert])').filter({ has: search });
      const ab = (await aside.boundingBox())!;
      const vp = page.viewportSize()!;
      expect(ab.width).toBeGreaterThan(200);
      expect(ab.x + ab.width).toBeLessThanOrEqual(vp.width + 1);
      await saveShot(page, testInfo, theme, 't578-finder-after-ctrl-k');

      // Edits are kept.
      await page.keyboard.press('Escape');
      // Closed, the drawer slides away (still rendered, inert and aria-hidden).
      await expect(aside).toHaveCount(0);
      await expect(page.locator('.ProseMirror')).toContainText('Z');
    });

    test(`focus-mode autosave text has 4.5:1 against its background`, async ({
      page,
      context,
    }, testInfo) => {
      const width = testInfo.project.use.viewport!.width;
      await page.setViewportSize({ width, height: 768 });
      await openDoc(page, theme, context);
      await toggle(page).click();
      const root = editorRoot(page);
      const measure = async (label: RegExp) => {
        const span = root.locator('span.text-xs', { hasText: label });
        await expect(span).toBeVisible();
        return span.evaluate((el) => {
          let bgEl: Element | null = el;
          let bg = 'rgba(0, 0, 0, 0)';
          while (bgEl) {
            bg = getComputedStyle(bgEl).backgroundColor;
            if (!/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) break;
            bgEl = bgEl.parentElement;
          }
          return { color: getComputedStyle(el).color, bg };
        });
      };
      // Idle (version) text, then the Saved text after an edit.
      const idle = await measure(/^\s*v\d+/);
      const idleRatio = ratio(idle.color, idle.bg);
      await page.locator('.ProseMirror').click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('S');
      const saved = await measure(/Saved/);
      const savedRatio = ratio(saved.color, saved.bg);
      console.log(
        `T-578 save-state contrast ${testInfo.project.name} ${theme}: idle ${idleRatio.toFixed(2)} (${idle.color} on ${idle.bg}), saved ${savedRatio.toFixed(2)} (${saved.color} on ${saved.bg})`,
      );
      expect(idleRatio, `idle ${idle.color} on ${idle.bg}`).toBeGreaterThanOrEqual(4.5);
      expect(savedRatio, `saved ${saved.color} on ${saved.bg}`).toBeGreaterThanOrEqual(4.5);
    });
  });
}

/** The finder remembers it was open (localStorage); clear it so it never leaks into a later test. */
const clearFinderMemory = (page: Page) =>
  page
    .evaluate(() => window.localStorage.removeItem('lawie.sectionFinder.open'))
    .catch(() => undefined);

type Spot = 'wall' | 'footer' | 'toolbar';

/**
 * A point on a blank part of the layer, computed from the live boxes (nothing hard-coded):
 * the Wall = the canvas beside the sheet (.ProseMirror), the footer text, or a toolbar gap.
 * Returns null when this width leaves no such blank point (e.g. the sheet fills a 390 screen).
 */
async function blankPoint(page: Page, spot: Spot): Promise<{ x: number; y: number } | null> {
  const root = editorRoot(page);
  return root.evaluate((rootEl, which) => {
    const interactive = 'button,a,input,select,textarea,label,[contenteditable],[tabindex="0"],svg';
    const ok = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return (
        !!hit &&
        rootEl.contains(hit) &&
        hit !== document.body &&
        !hit.closest(interactive) &&
        !hit.closest('.ProseMirror')
      );
    };
    const pm = document.querySelector('.ProseMirror')!.getBoundingClientRect();
    if (which === 'footer') {
      const note = rootEl.querySelector('[role="note"]');
      if (!note) return null;
      const r = note.getBoundingClientRect();
      const p = note.tagName === 'P' ? note : (note.querySelector('p') ?? note);
      const range = document.createRange();
      range.selectNodeContents(p);
      const t = range.getBoundingClientRect();
      const pt = { x: t.left + Math.min(20, t.width / 2), y: t.top + t.height / 2 };
      return r.height > 0 && ok(pt.x, pt.y) ? pt : null;
    }
    if (which === 'toolbar') {
      const bar = rootEl.querySelector('button[aria-pressed]')!.parentElement!.parentElement!;
      const b = bar.getBoundingClientRect();
      for (let y = b.top + 2; y < b.bottom - 1; y += 3)
        for (let x = b.left + 2; x < b.right - 1; x += 3) if (ok(x, y)) return { x, y };
      return null;
    }
    // wall: scan a coarse grid over the layer, below the toolbar and above the footer, and keep
    // a point that is outside the sheet's box.
    const toolbarBottom = rootEl
      .querySelector('button[aria-pressed]')!
      .parentElement!.parentElement!.getBoundingClientRect().bottom;
    const rr = rootEl.getBoundingClientRect();
    for (let y = toolbarBottom + 12; y < rr.bottom - 80; y += 24) {
      for (let x = rr.left + 4; x < rr.right - 4; x += 6) {
        const outsideSheet = x < pm.left - 2 || x > pm.right + 2;
        if (outsideSheet && ok(x, y)) return { x, y };
      }
    }
    return null;
  }, spot);
}

for (const theme of THEMES) {
  test.describe(`T-578 focus mode after a blank click: ${theme}`, () => {
    for (const spot of ['wall', 'footer', 'toolbar'] as const) {
      for (const phase of ['tab', 'escape', 'ctrl-k'] as const) {
        test(`${spot} click, then ${phase}`, async ({ page, context }, testInfo) => {
          const width = testInfo.project.use.viewport!.width;
          // The wall beside the sheet only exists where the sheet does not fill the screen; the
          // footer and toolbar spots run at every width, the wall spot where a point is found.
          await page.setViewportSize({ width, height: 768 });
          await openDoc(page, theme, context);
          try {
            await toggle(page).click();
            await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
            const root = editorRoot(page);
            await expect(root).toHaveAttribute('data-focus-mode', 'open');
            // Let the fade-in finish so the boxes are final.
            await expect
              .poll(async () => {
                const b = await root.boundingBox();
                return b && Math.round(b.height);
              })
              .toBe(page.viewportSize()!.height);

            let pt: { x: number; y: number } | null = null;
            await expect
              .poll(async () => (pt = await blankPoint(page, spot)) !== null || spot === 'wall', {
                timeout: 3000,
              })
              .toBe(true);
            if (!pt) {
              testInfo.annotations.push({
                type: 'T-578 blank click',
                description: `${testInfo.project.name}: no wall beside the sheet at ${width}px; skipped`,
              });
              test.skip(true, `no blank wall beside the sheet at ${width}px`);
              return;
            }
            const { x, y } = pt as { x: number; y: number };
            await page.mouse.click(x, y);

            // Real click on blank space: focus stays in the layer (on its root), never <body>.
            expect(
              await focusInside(root),
              `blank ${spot} click dropped focus out of the layer`,
            ).toBe(true);
            expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
            await expect(page.locator('body')).not.toBeFocused();

            if (phase === 'tab') {
              for (let i = 0; i < 20; i++) {
                await page.keyboard.press('Tab');
                expect(await focusInside(root), `Tab #${i + 1} left the layer`).toBe(true);
              }
              // A fresh blank click so Shift+Tab also starts from the root.
              await page.mouse.click(x, y);
              for (let i = 0; i < 20; i++) {
                await page.keyboard.press('Shift+Tab');
                expect(await focusInside(root), `Shift+Tab #${i + 1} left the layer`).toBe(true);
              }
              await expect(root).toHaveAttribute('data-focus-mode', 'open');
              expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe(
                'hidden',
              );
            } else if (phase === 'escape') {
              await page.keyboard.press('Escape');
              await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
              await expect(page.locator('[data-focus-mode="open"]')).toHaveCount(0);
              await expect(toggle(page)).toBeFocused();
              await expect
                .poll(() => page.evaluate(() => document.documentElement.style.overflow))
                .not.toBe('hidden');
            } else {
              await page.keyboard.press('Control+k');
              await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
              await expect(page.locator('[data-focus-mode="open"]')).toHaveCount(0);
              await expect
                .poll(() => page.evaluate(() => document.documentElement.style.overflow))
                .not.toBe('hidden');
              const search = page.getByPlaceholder('e.g. 302 IPC · 103 BNS · 154 CrPC');
              await expect(search).toBeVisible();
              await expect(search).toBeInViewport({ ratio: 1 });
              await expect(search).toBeFocused();
              // Nothing covers it: the topmost element at its centre is the input itself.
              const topIsInput = await search.evaluate((el) => {
                const r = el.getBoundingClientRect();
                return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
              });
              expect(topIsInput, 'something covers the finder search box').toBe(true);
              const vp = page.viewportSize()!;
              const aside = page.locator('aside:not([inert])').filter({ has: search });
              const ab = (await aside.boundingBox())!;
              expect(ab.x + ab.width).toBeLessThanOrEqual(vp.width + 1);
              await page.keyboard.press('Escape');
              await expect(aside).toHaveCount(0);
            }
          } finally {
            await clearFinderMemory(page);
          }
        });
      }
    }
  });
}

test.describe('T-578 Annexures row widths', () => {
  test('44px high at 520 and 600 with the help line hidden but still describing the button; shown at 640', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-768', 'sets its own widths; run once');
    await openDoc(page, 'daylight', context);
    for (const w of [520, 600, 639, 640]) {
      await page.setViewportSize({ width: w, height: 768 });
      const region = page.getByRole('region', { name: 'Annexures' });
      await expect(region).toHaveCount(1);
      const h = (await region.boundingBox())!.height;
      expect(Math.round(h), `row height at ${w}`).toBe(44);
      const btn = region.getByRole('button', { name: 'Create annexures' });
      const id = await btn.getAttribute('aria-describedby');
      expect(id).toBeTruthy();
      const help = page.locator(`[id="${id}"]`);
      if (w < 640) await expect(help).toBeHidden();
      else await expect(help).toBeVisible();
      await expect(help).toHaveText(HELP);
      await noSideways(page);
    }
  });
});
