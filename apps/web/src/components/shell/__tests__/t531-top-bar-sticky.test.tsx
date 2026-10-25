// T-531 AC1, AC3, AC5, AC6: the shell TopBar's single sticky row, its live `--nl-bar-h`, its
// safe-area paddings and its nav landmark gate. jsdom has no layout and no ResizeObserver, so the
// observer is a stub and the height comes from a stubbed getBoundingClientRect.
import { act } from 'react';

import { NL_BAR_HEIGHT_VAR, TopBar } from '../TopBar';
import { ThemeProvider } from '../ThemeProvider';

import {
  cleanupMounted,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const cls = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const root = () => document.documentElement;

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(public cb: ResizeObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.cb([], this as unknown as ResizeObserver);
  }
}

let height = 65;
let rectSpy: jest.SpyInstance;
const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

beforeEach(() => {
  stubMatchMedia();
  FakeObserver.instances = [];
  height = 65;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeObserver;
  rectSpy = jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({ height }) as DOMRect);
  root().style.removeProperty(NL_BAR_HEIGHT_VAR);
});
afterEach(() => {
  cleanupMounted();
  rectSpy.mockRestore();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
  root().style.removeProperty(NL_BAR_HEIGHT_VAR);
});

const withTheme = (el: React.ReactElement) => <ThemeProvider>{el}</ThemeProvider>;

describe('--nl-bar-h (live sticky bar height)', () => {
  it('is named --nl-bar-h', () => {
    expect(NL_BAR_HEIGHT_VAR).toBe('--nl-bar-h');
  });

  it('a sticky bar sets it on <html> to the measured height and observes the header', () => {
    mount(withTheme(<TopBar variant="signed-out" sticky />));
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('65px');
    expect(FakeObserver.instances).toHaveLength(1);
    expect(FakeObserver.instances[0].observed).toEqual([q('header')]);
  });

  it('follows a resize: ceil of the border-box height (fractional heights round up)', () => {
    mount(withTheme(<TopBar variant="signed-out" sticky />));
    height = 112.4; // e.g. a notch inset appears after rotation
    act(() => FakeObserver.instances[0].fire());
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('113px');
    height = 65;
    act(() => FakeObserver.instances[0].fire());
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('65px');
  });

  it('removes it and disconnects the observer on unmount', () => {
    const m = mount(withTheme(<TopBar variant="signed-out" sticky />));
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('65px');
    m.unmount();
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('');
    expect(root().style.cssText).not.toContain('--nl-bar-h');
    expect(FakeObserver.instances[0].disconnected).toBe(true);
  });

  it('a bar that is not sticky never sets it and never observes', () => {
    mount(withTheme(<TopBar variant="signed-out" />));
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('');
    expect(FakeObserver.instances).toHaveLength(0);
    expect(q('header')!.hasAttribute('data-sticky')).toBe(false);
  });

  it('without ResizeObserver it still publishes once (and cleans up)', () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
    const m = mount(withTheme(<TopBar variant="signed-out" sticky />));
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('65px');
    m.unmount();
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('');
  });

  it('turning sticky off removes the property; turning it on sets it', () => {
    const m = mount(withTheme(<TopBar variant="signed-out" sticky />));
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('65px');
    m.rerender(withTheme(<TopBar variant="signed-out" />));
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('');
    m.rerender(withTheme(<TopBar variant="signed-out" sticky />));
    expect(root().style.getPropertyValue('--nl-bar-h')).toBe('65px');
  });
});

describe('TopBar sticky and safe area (AC1, AC3)', () => {
  it('sticky pins at every width: sticky top-0 z-30, with no breakpoint prefix', () => {
    mount(withTheme(<TopBar variant="signed-out" sticky />));
    const c = cls(q('header'));
    expect(c).toEqual(expect.arrayContaining(['sticky', 'top-0', 'z-30']));
    expect(c.filter((x) => x.includes('sticky'))).toEqual(['sticky']);
    expect(q('header')!.getAttribute('data-sticky')).toBe('true');
  });

  it('pads the top and both sides by the safe-area insets (16px, 32px from 900px)', () => {
    mount(withTheme(<TopBar variant="signed-out" />));
    const c = cls(q('header'));
    expect(c).toEqual(
      expect.arrayContaining([
        'pt-[env(safe-area-inset-top,0px)]',
        'pl-[max(16px,env(safe-area-inset-left,0px))]',
        'pr-[max(16px,env(safe-area-inset-right,0px))]',
        'min-[900px]:pl-[max(32px,env(safe-area-inset-left,0px))]',
        'min-[900px]:pr-[max(32px,env(safe-area-inset-right,0px))]',
      ]),
    );
  });

  it('is one 64px row at every width, with the bar itself having no mobile second row', () => {
    mount(withTheme(<TopBar variant="signed-out" />));
    const header = q('header')!;
    expect(header.children).toHaveLength(1);
    expect(cls(header.firstElementChild)).toContain('min-h-[64px]');
    expect(q('[data-topbar-mobile-menu]')).toBeNull();
  });

  it('the phone action shows below 720px only, the actions from 720px', () => {
    mount(
      withTheme(
        <TopBar
          variant="signed-out"
          phoneAction={<a href="/s">Start free</a>}
          actions={<a href="/in">Sign in</a>}
        />,
      ),
    );
    const phone = q('a[href="/s"]')!.parentElement!;
    expect(cls(phone)).toContain('min-[720px]:hidden');
    expect(cls(phone)).not.toContain('hidden');
    expect(cls(q('a[href="/in"]')!.parentElement)).toEqual(
      expect.arrayContaining(['hidden', 'min-[720px]:flex']),
    );
  });

  it('signed in: the Ink chip is in the row at every width, and phoneAction is ignored', () => {
    mount(
      withTheme(
        <TopBar
          variant="signed-in"
          inkChip={<span data-testid="chip">99,999 Ink</span>}
          phoneAction={<a href="/s">Start free</a>}
        />,
      ),
    );
    const chip = q('[data-testid=chip]')!;
    expect(chip.textContent).toBe('99,999 Ink');
    expect(cls(chip.parentElement)).not.toContain('hidden');
    expect(q('a[href="/s"]')).toBeNull();
  });
});

describe('TopBar nav landmark (AC6): rendered only when it has links', () => {
  const links = (
    <>
      <a href="#a">A</a>
      <a href="#b">B</a>
    </>
  );

  it('no nav prop: no <nav> at all (no empty unnamed landmark)', () => {
    mount(withTheme(<TopBar variant="signed-out" />));
    expect(qa('nav')).toHaveLength(0);
  });

  it.each([null, undefined, false, ''])('nav={%p}: no <nav>', (v) => {
    mount(withTheme(<TopBar variant="signed-out" nav={v as React.ReactNode} navLabel="Main" />));
    expect(qa('nav')).toHaveLength(0);
    cleanupMounted();
  });

  it('with links: one <nav>, named by navLabel, holding the links', () => {
    mount(withTheme(<TopBar variant="signed-out" nav={links} navLabel="Main" />));
    const navs = qa('nav');
    expect(navs).toHaveLength(1);
    expect(navs[0].getAttribute('aria-label')).toBe('Main');
    expect(qa('a', navs[0]).map((a) => a.textContent)).toEqual(['A', 'B']);
  });

  it('the gate sits on the <nav>: hidden below 720 by default, from 720 with flex', () => {
    mount(withTheme(<TopBar variant="signed-out" nav={links} navLabel="Main" />));
    const c = cls(q('nav'));
    expect(c).toEqual(expect.arrayContaining(['hidden', 'min-[720px]:flex']));
    expect(c).not.toContain('flex');
  });

  it('navFrom={1120}: the whole <nav> is hidden (display:none) until 1120, so 720-1119 has no landmark', () => {
    mount(withTheme(<TopBar variant="signed-out" nav={links} navLabel="Main" navFrom={1120} />));
    const c = cls(q('nav'));
    expect(c).toEqual(expect.arrayContaining(['hidden', 'min-[1120px]:flex']));
    expect(c.some((x) => x.startsWith('min-[720px]:'))).toBe(false);
    expect(c).not.toContain('flex');
  });
});
