// T-531 AC6 and break-ui on the dashboard bar: the named nav landmark, a long user name and a
// large Ink balance. jsdom cannot measure overflow; the checks are on the classes that prevent it.
import { usePathname } from 'next/navigation';

import { DashboardTopBar } from '../DashboardTopBar';
import { ThemeProvider } from '../ThemeProvider';

import { DASHBOARD_NAV_LABEL } from '@/components/marketing/nl-copy';
import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const LONG_NAME = 'Aleksandra Wiśniewska-Kowalczyk Venkataraghavan Subramaniam';
const LONG_EMAIL = 'aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com';
let mockUser: { id: string; name: string; email: string; plan: string } = {
  id: 'u1',
  name: LONG_NAME,
  email: LONG_EMAIL,
  plan: 'free',
};
const mockCredits = { balance: { totalInk: 99999 }, loaded: true };
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn() }),
}));
jest.mock('@/hooks/useCredits', () => ({ useCredits: () => mockCredits }));

beforeEach(() => {
  (usePathname as jest.Mock).mockReturnValue('/dashboard');
  stubMatchMedia();
  localStorage.clear();
});
afterEach(cleanupMounted);

const render = () =>
  mount(
    <ThemeProvider>
      <DashboardTopBar />
    </ThemeProvider>,
  );

describe('dashboard nav landmark (AC6)', () => {
  it('is one <nav> named "Dashboard" with its four links, hidden below 720px', () => {
    render();
    const navs = qa('header nav');
    expect(navs).toHaveLength(1);
    expect(navs[0].getAttribute('aria-label')).toBe(DASHBOARD_NAV_LABEL.en);
    expect(navs[0].getAttribute('aria-label')).toBe('Dashboard');
    expect(qa('a', navs[0])).toHaveLength(4);
    expect(navs[0].className.split(/\s+/)).toEqual(
      expect.arrayContaining(['hidden', 'min-[720px]:flex']),
    );
  });
});

describe('dashboard bar is sticky (AC1)', () => {
  it('renders sticky top-0 z-30 and publishes --nl-bar-h from the ResizeObserver, removing it on unmount', () => {
    const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    const observed: Element[] = [];
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {}
    };
    const spy = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({ height: 65 }) as DOMRect);
    try {
      const m = render();
      const header = q('header')!;
      expect(header.className.split(/\s+/)).toEqual(
        expect.arrayContaining(['sticky', 'top-0', 'z-30']),
      );
      expect(observed).toEqual([header]);
      expect(document.documentElement.style.getPropertyValue('--nl-bar-h')).toBe('65px');
      m.unmount();
      expect(document.documentElement.style.getPropertyValue('--nl-bar-h')).toBe('');
    } finally {
      spy.mockRestore();
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
    }
  });
});

describe('break-ui: dashboard bar worst case', () => {
  it('a 60-character name shows as two initials in a fixed 44px avatar and names the button', () => {
    render();
    const b = q(`button[aria-label="${LONG_NAME}"]`) as HTMLButtonElement;
    expect(b).not.toBeNull();
    expect(b.textContent).toBe('AW');
    expect(b.className).toMatch(/\bh-11\b/);
    expect(b.className).toMatch(/\bw-11\b/);
    expect(b.className).toContain('shrink-0');
  });

  it('a long email wraps inside the capped menu (break-all, width min(320px, 100vw - 32px))', () => {
    render();
    click(q(`button[aria-label="${LONG_NAME}"]`));
    const menu = q('[data-radix-popper-content-wrapper] > *')!;
    expect(menu.className).toContain('w-[min(320px,calc(100vw-32px))]');
    const email = qa('p', menu).find((p) => p.textContent === LONG_EMAIL)!;
    expect(email.className).toContain('break-all');
  });

  it('a one-letter name and an empty name fall back without "undefined"', () => {
    mockUser = { ...mockUser, name: 'J', email: 'j@x.in' };
    render();
    expect(q('button[aria-label="J"]')!.textContent).toBe('J');
    cleanupMounted();
    mockUser = { ...mockUser, name: '', email: 'jo@x.in' };
    render();
    expect(q('button[aria-label="jo@x.in"]')!.textContent).toBe('J');
    mockUser = { id: 'u1', name: LONG_NAME, email: LONG_EMAIL, plan: 'free' };
  });

  it('the Ink chip with 99,999 stays on one line (nowrap) and in the row, grouped en-IN (T-544)', () => {
    render();
    const chip = q('header [data-variant="brass"]')!;
    expect(chip.className).toContain('whitespace-nowrap');
    expect(chip.textContent).toContain('99,999');
    expect(chip.textContent).not.toContain('99999');
    expect(chip.textContent).toMatch(/Ink$/);
    expect(chip.textContent).not.toMatch(/undefined|NaN/);
  });
});
