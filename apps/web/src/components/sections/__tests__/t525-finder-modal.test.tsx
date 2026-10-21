// T-525 round 3: the section finder yields to other modal dialogs, is truly modal below md
// (inert siblings, body scroll lock, all undone), and its tablist is named by the heading.
import { usePathname } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { SECTION_FINDER_OPEN_EVENT, SectionFinderPanel } from '../SectionFinderPanel';

import { Dialog } from '@/components/ui/Dialog';
import {
  cleanupMounted,
  mount,
  press,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

jest.mock('@/lib/apiFetch', () => ({
  apiFetch: async () => ({
    ok: true,
    status: 200,
    json: async () => ({ bookmarks: [], recent: [] }),
  }),
}));

const NARROW = '(max-width: 767.98px)';
const aside = () => document.querySelector('aside') as HTMLElement;
const isOpen = () => !aside().hasAttribute('inert');
const openEvent = () =>
  act(() => {
    window.dispatchEvent(new CustomEvent(SECTION_FINDER_OPEN_EVENT));
  });
const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

async function page(narrow = false) {
  const mm = stubMatchMedia({ [NARROW]: narrow });
  (usePathname as jest.Mock).mockReturnValue('/dashboard/documents');
  const m = mount(<SectionFinderPanel />);
  await flush();
  return { mm, ...m };
}

function otherDialog(modal = true): HTMLElement {
  const d = document.createElement('div');
  d.setAttribute('role', 'dialog');
  if (modal) d.setAttribute('aria-modal', 'true');
  document.body.appendChild(d);
  return d;
}

beforeEach(() => {
  window.localStorage.clear();
  document.body.style.overflow = '';
});
afterEach(() => {
  cleanupMounted();
  document.body.style.overflow = '';
});

describe('Escape already handled', () => {
  it('Escape with defaultPrevented leaves the finder open; a plain Escape closes it', async () => {
    await page();
    openEvent();
    expect(isOpen()).toBe(true);
    // a closer-to-target listener (as a Radix dialog does) claims the key first
    const claim = (e: Event) => e.preventDefault();
    document.body.addEventListener('keydown', claim);
    const ev = press(document.body, { key: 'Escape' });
    document.body.removeEventListener('keydown', claim);
    expect(ev.defaultPrevented).toBe(true);
    expect(isOpen()).toBe(true);
    press(document.body, { key: 'Escape' });
    expect(isOpen()).toBe(false);
  });
});

describe('another modal dialog owns the keyboard', () => {
  it.each([
    ['ctrlKey', { ctrlKey: true }],
    ['metaKey', { metaKey: true }],
  ])('%s + K is ignored while an aria-modal dialog exists outside the aside', async (_n, mod) => {
    await page();
    const d = otherDialog();
    const ev = press(document.body, { key: 'k', ...mod });
    expect(isOpen()).toBe(false);
    expect(ev.defaultPrevented).toBe(false); // browser default is not swallowed either
    d.remove();
    press(document.body, { key: 'k', ...mod });
    expect(isOpen()).toBe(true); // still works once the other dialog is gone
  });

  it('Ctrl+K does not close an open finder while another modal is up', async () => {
    await page();
    openEvent();
    const d = otherDialog();
    press(document.body, { key: 'k', ctrlKey: true });
    expect(isOpen()).toBe(true);
    d.remove();
    press(document.body, { key: 'k', ctrlKey: true });
    expect(isOpen()).toBe(false);
  });

  it('F11 mode toggle is ignored while another modal is up, and works without one', async () => {
    await page();
    openEvent();
    const before = aside().className;
    const d = otherDialog();
    const ignored = press(document.body, { key: 'F11' });
    expect(ignored.defaultPrevented).toBe(false);
    expect(aside().className).toBe(before);
    d.remove();
    press(document.body, { key: 'F11' });
    expect(aside().className).not.toBe(before);
  });

  it.each([
    ['dialog', 'dialog'],
    ['alertdialog', 'alertdialog'],
  ])(
    'a plain role=%s outside the aside (no aria-modal) blocks Ctrl/Cmd+K and F11',
    async (_n, role) => {
      await page();
      const d = document.createElement('div');
      d.setAttribute('role', role);
      document.body.appendChild(d);
      press(document.body, { key: 'k', ctrlKey: true });
      press(document.body, { key: 'k', metaKey: true });
      expect(isOpen()).toBe(false);
      openEvent();
      const before = aside().className;
      press(document.body, { key: 'F11' });
      expect(aside().className).toBe(before);
      d.remove();
      press(document.body, { key: 'k', ctrlKey: true });
      expect(isOpen()).toBe(false); // toggled closed now that nothing blocks it
    },
  );

  it('a real ui/Dialog blocks the shortcut while open and releases it on close', async () => {
    await page();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const dlg = (open: boolean) => (
      <Dialog
        open={open}
        onOpenChange={() => {}}
        title="T"
        confirmLabel="OK"
        cancelLabel="No"
        onConfirm={() => {}}
      />
    );
    act(() => root.render(dlg(true)));
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).not.toBeNull();
    press(document.body, { key: 'k', ctrlKey: true });
    expect(isOpen()).toBe(false);
    act(() => root.render(dlg(false)));
    press(document.body, { key: 'k', ctrlKey: true });
    expect(isOpen()).toBe(true);
    act(() => root.unmount());
  });

  it('an open Radix Popover (role=dialog) also blocks the shortcut (known side effect)', async () => {
    await page();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <Popover.Root open>
          <Popover.Trigger>t</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content>menu</Popover.Content>
          </Popover.Portal>
        </Popover.Root>,
      ),
    );
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    press(document.body, { key: 'k', ctrlKey: true });
    expect(isOpen()).toBe(false);
    act(() => root.unmount());
  });

  it("the finder's own overlay dialog (inside the aside) does not block its shortcuts", async () => {
    await page(true);
    openEvent();
    expect(aside().getAttribute('aria-modal')).toBe('true');
    press(document.body, { key: 'k', ctrlKey: true });
    expect(isOpen()).toBe(false);
  });
});

describe('overlay below 768px is modal', () => {
  function siblings() {
    const a = document.createElement('div');
    a.id = 'app-sibling';
    const b = document.createElement('div');
    b.id = 'already-inert';
    b.setAttribute('inert', '');
    document.body.append(a, b);
    return { a, b };
  }
  const inertIds = () =>
    Array.from(document.querySelectorAll('[inert]')).map((el) => el.id || el.tagName.toLowerCase());

  it('inerts siblings (not the backdrop), keeps pre-inert ones, locks body scroll, restores on close', async () => {
    document.body.style.overflow = 'scroll';
    const { a, b } = siblings();
    await page(true);
    expect(a.hasAttribute('inert')).toBe(false); // closed: nothing touched
    openEvent();
    const backdrop = document.querySelector('[data-finder-backdrop]') as HTMLElement;
    expect(backdrop).not.toBeNull();
    expect(aside().getAttribute('role')).toBe('dialog');
    expect(a.hasAttribute('inert')).toBe(true);
    expect(b.hasAttribute('inert')).toBe(true);
    expect(backdrop.hasAttribute('inert')).toBe(false);
    expect(aside().hasAttribute('inert')).toBe(false);
    expect(aside().contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    press(document.body, { key: 'Escape' });
    expect(a.hasAttribute('inert')).toBe(false);
    expect(b.hasAttribute('inert')).toBe(true); // was already inert: left alone
    expect(document.body.style.overflow).toBe('scroll');
    // closed again: only the pre-existing inert element and the closed aside remain inert
    expect(inertIds().sort()).toEqual(['already-inert', 'aside'].sort());
  });

  it('restores everything on unmount', async () => {
    const { a, b } = siblings();
    const { unmount } = await page(true);
    openEvent();
    expect(a.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(a.hasAttribute('inert')).toBe(false);
    expect(b.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('');
  });

  it('restores everything when the window grows to 768px or wider (panel stays open)', async () => {
    const { a, b } = siblings();
    const { mm } = await page(true);
    openEvent();
    expect(a.hasAttribute('inert')).toBe(true);
    mm.set(NARROW, false);
    expect(isOpen()).toBe(true);
    expect(aside().getAttribute('role')).toBeNull();
    expect(a.hasAttribute('inert')).toBe(false);
    expect(b.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('');
  });

  it('does not inert or lock scroll on a wide screen', async () => {
    const { a } = siblings();
    await page(false);
    openEvent();
    expect(isOpen()).toBe(true);
    expect(a.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('sibling of an ancestor is inerted too (nested layout), and restored', async () => {
    const wrap = document.createElement('main');
    wrap.id = 'wrap';
    const side = document.createElement('nav');
    side.id = 'side-nav';
    document.body.append(wrap);
    wrap.append(side);
    (usePathname as jest.Mock).mockReturnValue('/dashboard/documents');
    stubMatchMedia({ [NARROW]: true });
    const container = document.createElement('div');
    wrap.append(container);
    const root = createRoot(container);
    act(() => root.render(<SectionFinderPanel />));
    await flush();
    openEvent();
    expect(side.hasAttribute('inert')).toBe(true);
    press(document.body, { key: 'Escape' });
    expect(side.hasAttribute('inert')).toBe(false);
    act(() => root.unmount());
  });
});

describe('tablist name', () => {
  it('aria-labelledby on the tablist resolves to the "Section finder" heading', async () => {
    await page();
    const list = aside().querySelector('[role="tablist"]') as HTMLElement;
    const id = list.getAttribute('aria-labelledby') as string;
    expect(id).toBeTruthy();
    const h = document.getElementById(id) as HTMLElement;
    expect(h.tagName).toBe('H2');
    expect(h.textContent).toBe('Section finder');
    expect(aside().getAttribute('aria-labelledby')).toBe(id);
  });

  it('inline mode (no heading) leaves the tablist unlabelled rather than dangling', async () => {
    (usePathname as jest.Mock).mockReturnValue('/dashboard/documents');
    stubMatchMedia();
    mount(<SectionFinderPanel inline />);
    await flush();
    const list = document.querySelector('[role="tablist"]') as HTMLElement;
    const id = list.getAttribute('aria-labelledby');
    if (id) expect(document.getElementById(id)).not.toBeNull();
  });
});

describe('selected tab under forced-colors', () => {
  const FC = [
    'forced-colors:border-[color:Highlight]',
    'forced-colors:bg-[color:Highlight]',
    'forced-colors:text-[color:HighlightText]',
    'forced-colors:[forced-color-adjust:none]',
    'forced-colors:focus-visible:[outline-color:CanvasText]',
  ];
  const tabs = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
  const count = (el: HTMLElement) => FC.filter((c) => el.className.split(/\s+/).includes(c)).length;

  it('only the selected tab has all five classes, and it follows the selection', async () => {
    await page();
    openEvent();
    expect(tabs()).toHaveLength(3);
    const check = (sel: number) =>
      tabs().forEach((t, i) => {
        expect(t.getAttribute('aria-selected')).toBe(String(i === sel));
        expect(count(t)).toBe(i === sel ? 5 : 0);
      });
    check(0);
    act(() => tabs()[1].click());
    check(1);
    press(tabs()[1], { key: 'ArrowRight' });
    check(2);
    act(() => tabs()[0].click());
    check(0);
  });
});
