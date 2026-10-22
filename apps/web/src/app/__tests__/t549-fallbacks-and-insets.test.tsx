// T-549 items 4, 5 and 7: the dvh fallback triple on every bottom sheet, the safe-area classes on
// the legacy Sidebar and dashboard top bar, and the phone menu's Sign in inset. Class strings are
// asserted (jsdom has no layout and no env() insets); real insets need a device.
import { readFileSync } from 'fs';
import { join } from 'path';

import { NightTopBar } from '@/components/marketing/NightTopBar';
import { SIGNIN_HREF } from '@/components/marketing/nl-copy';
import { ThemeProvider } from '@/components/shell/ThemeProvider';
import { Dialog } from '@/components/ui/Dialog';
import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const SRC = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const tokens = (s: string) => s.split(/\s+/).filter(Boolean);
const cls = (el: Element | null) => tokens(el!.getAttribute('class') ?? '');

const DVH_TRIPLE = ['max-h-[90vh]', 'max-h-[90dvh]', 'supports-[height:100dvh]:max-h-[90dvh]'];

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia();
});
afterEach(cleanupMounted);

describe('T-549 dvh fallback triple (iOS < 15.4)', () => {
  it('ui/Dialog renders the triple on its content', () => {
    mount(
      <Dialog
        open
        onOpenChange={() => undefined}
        title="Title"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={() => undefined}
      />,
    );
    const content = document.body.querySelector('[role="dialog"]')!;
    expect(cls(content)).toEqual(expect.arrayContaining(DVH_TRIPLE));
  });

  it('ui/Dialog keeps the vh class before the dvh class in the string (vh is the fallback)', () => {
    const src = read('components/ui/Dialog.tsx');
    expect(src.indexOf('max-h-[90vh]')).toBeGreaterThan(-1);
    expect(src.indexOf('max-h-[90vh]')).toBeLessThan(src.indexOf('max-h-[90dvh]'));
  });

  it('TopUpModal imports the shared sheet and tall-cap constants (the triple, both widths)', () => {
    const src = read('components/credits/TopUpModal.tsx');
    expect(src).toContain('DIALOG_SHEET_CLASS');
    expect(src).toContain('DIALOG_TALL_CAP_CLASS');
    expect(src).not.toMatch(/max-h-\[90dvh\]/); // it comes from the shared constant only
  });

  it('ConfirmCloseAccountDialog carries the triple on its panel', () => {
    const src = read('components/account/ConfirmCloseAccountDialog.tsx');
    const m = /className="([^"]*max-h-\[90dvh\][^"]*)"/.exec(src);
    expect(m).not.toBeNull();
    expect(tokens(m![1])).toEqual(expect.arrayContaining(DVH_TRIPLE));
  });

  it('no sheet is left with a lone dvh max-height and no vh fallback', () => {
    for (const rel of [
      'components/ui/Dialog.tsx',
      'components/credits/TopUpModal.tsx',
      'components/account/ConfirmCloseAccountDialog.tsx',
    ]) {
      const src = read(rel);
      if (/max-h-\[90dvh\]|calc\(100dvh-64px\)/.test(src)) {
        expect(src).toMatch(/max-h-\[90vh\]|calc\(100vh-64px\)/);
      }
    }
  });
});

describe('T-549 safe-area classes on the legacy shell', () => {
  it('Sidebar aside clears the left inset only (no top inset) and keeps the 200px column', () => {
    const src = read('components/dashboard/Sidebar.tsx');
    const m = /<aside className="([^"]+)"/.exec(src);
    expect(m).not.toBeNull();
    const c = tokens(m![1]);
    expect(c).toEqual(
      expect.arrayContaining([
        'pl-[env(safe-area-inset-left,0px)]',
        'w-[calc(200px+env(safe-area-inset-left,0px))]',
      ]),
    );
    expect(c).not.toContain('w-[200px]');
    expect(c.some((x) => x.startsWith('pt-[env('))).toBe(false);
    expect(m![1]).not.toContain('pt-[env(');
    expect(m![1]).not.toContain('safe-area-inset-top');
  });

  it('dashboard layout top bar clears the side insets; md and up drop the left one', () => {
    const src = read('app/dashboard/layout.tsx');
    const m = /className="([^"]*border-b border-slate-200 bg-white[^"]*)"/.exec(src);
    expect(m).not.toBeNull();
    const c = tokens(m![1]);
    expect(c).toEqual(
      expect.arrayContaining([
        'pl-[max(16px,env(safe-area-inset-left,0px))]',
        'pr-[max(16px,env(safe-area-inset-right,0px))]',
        'md:pl-4',
        'py-3',
      ]),
    );
    expect(c).not.toContain('px-4');
  });

  it('the dashboard wrapper keeps overflow-x-clip (sticky-safe) and never overflow-x-hidden', () => {
    const src = read('app/dashboard/layout.tsx');
    expect(src).toContain('overflow-x-clip');
    expect(src).not.toContain('overflow-x-hidden');
  });

  it('marketing.css (legacy SiteNav) clears the top and side insets', () => {
    const css = read('app/(marketing)/marketing.css').replace(/\s+/g, ' ');
    expect(css).toMatch(/\.site-nav\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top,\s*0px\)/);
    expect(css).toMatch(
      /\.nav-inner\s*\{[^}]*padding:\s*0 max\(32px,\s*env\(safe-area-inset-right,\s*0px\)\) 0 max\(32px,\s*env\(safe-area-inset-left,\s*0px\)\)/,
    );
    expect(css).toMatch(/\.nav-drawer\s*\{[^}]*max\(24px,\s*env\(safe-area-inset-top,\s*0px\)\)/);
  });
});

describe('T-549 phone menu inset alignment', () => {
  const bar = () => (
    <ThemeProvider>
      <NightTopBar showNav onLangChange={() => undefined} />
    </ThemeProvider>
  );

  it('the menu Sign in is px-nl-3 and the row Sign in is px-nl-2', () => {
    mount(bar());
    const rowLinks = qa(`a[href="${SIGNIN_HREF}"]`);
    expect(rowLinks).toHaveLength(1);
    expect(cls(rowLinks[0])).toContain('px-nl-2');
    expect(cls(rowLinks[0])).not.toContain('px-nl-3');

    click(q('[data-topbar-menu-trigger]'));
    const menu = q('[data-topbar-menu]')!;
    const inMenu = q(`a[href="${SIGNIN_HREF}"]`, menu)!;
    expect(cls(inMenu)).toContain('px-nl-3');
    expect(cls(inMenu)).not.toContain('px-nl-2');
    expect(cls(inMenu)).toContain('font-medium');
    // same 12px inset as the menu's nav links, so the text edges line up
    const navLink = q('nav a', menu)!;
    expect(cls(navLink)).toContain('px-nl-3');
  });

  it('the row keeps its px-nl-2 after the menu opens (720 and 1120 layouts unchanged)', () => {
    mount(bar());
    click(q('[data-topbar-menu-trigger]'));
    const outside = qa(`a[href="${SIGNIN_HREF}"]`).filter((a) => !a.closest('[data-topbar-menu]'));
    expect(outside).toHaveLength(1);
    expect(cls(outside[0])).toContain('px-nl-2');
  });

  it('uses no [&_a] override hack in the menu content', () => {
    expect(read('components/shell/TopBarMenu.tsx')).not.toContain('[&_a]');
  });
});
