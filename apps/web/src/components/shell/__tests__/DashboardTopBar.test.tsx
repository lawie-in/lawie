// T-520: the dashboard top bar, its account menu and the offline banner.
import { act } from 'react';
import { usePathname } from 'next/navigation';

import { DashboardTopBar, DASHBOARD_NAV } from '../DashboardTopBar';
import { OFFLINE_BANNER_COPY, OfflineBanner } from '../OfflineBanner';
import { ThemeProvider } from '../ThemeProvider';

import { SECTION_FINDER_OPEN_EVENT } from '@/components/sections/SectionFinderPanel';
import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const mockLogout = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Asha Rao', email: 'asha@example.com', plan: 'free' },
    logout: mockLogout,
  }),
}));
let mockCredits = { balance: { totalInk: 12 }, loaded: true };
jest.mock('@/hooks/useCredits', () => ({ useCredits: () => mockCredits }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const trigger = () => q('button[aria-label="Asha Rao"]') as HTMLButtonElement;
const menu = () => q('[data-radix-popper-content-wrapper]');
const menuItem = (label: string) =>
  qa('button, a', menu() ?? document.body).find((e) => e.textContent === label) as HTMLElement;
const openMenu = () => click(trigger());
// Radix restores focus from a setTimeout(0) when the content unmounts.
const settleFocus = () => act(async () => new Promise<void>((r) => setTimeout(r, 10)));
const withTheme = (el: React.ReactElement) => <ThemeProvider>{el}</ThemeProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockCredits = { balance: { totalInk: 12 }, loaded: true };
  (usePathname as jest.Mock).mockReturnValue('/dashboard');
  stubMatchMedia();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-pref');
});
afterEach(cleanupMounted);

describe('DashboardTopBar bar', () => {
  it('is one header with the mark, the nav links and the avatar button', () => {
    mount(withTheme(<DashboardTopBar />));
    expect(qa('header')).toHaveLength(1);
    expect(q('header')!.getAttribute('data-variant')).toBe('signed-in');
    const nav = q('header nav')!;
    expect(qa('a', nav).map((a) => [a.textContent, a.getAttribute('href')])).toEqual(
      DASHBOARD_NAV.map((n) => [n.label, n.href]),
    );
    expect(DASHBOARD_NAV.map((n) => n.label)).toEqual([
      'Dashboard',
      'New document',
      'My documents',
      'Templates',
    ]);
    expect(trigger()).not.toBeNull();
    expect(trigger().textContent).toBe('AR');
  });

  it('marks the current page in the nav', () => {
    mount(withTheme(<DashboardTopBar />));
    const current = qa('header nav a[aria-current="page"]');
    expect(current.map((a) => a.textContent)).toEqual(['Dashboard']);
  });

  it('showThemeToggle is off: no second header row and no toggle on the bar', () => {
    mount(withTheme(<DashboardTopBar />));
    expect(q('[data-topbar-mobile-menu]')).toBeNull();
    expect(q('header fieldset')).toBeNull();
    expect(qa('input[type=radio]')).toHaveLength(0);
  });

  it('shows the Ink chip once the balance has loaded', () => {
    const { container } = mount(withTheme(<DashboardTopBar />));
    expect(q('header', container)!.textContent).toContain('12');
    expect(q('header', container)!.textContent).toMatch(/Ink/);
  });

  it('hides the Ink chip until a real balance has arrived (no loading 0)', () => {
    mockCredits = { balance: { totalInk: 0 }, loaded: false };
    const { container } = mount(withTheme(<DashboardTopBar />));
    expect(q('header', container)!.textContent).not.toMatch(/Ink/);
    expect(q('header', container)!.textContent).not.toMatch(/\b0\b/);
  });

  it('shows a real 0 balance once loaded', () => {
    mockCredits = { balance: { totalInk: 0 }, loaded: true };
    const { container } = mount(withTheme(<DashboardTopBar />));
    expect(q('header', container)!.textContent).toMatch(/0/);
    expect(q('header', container)!.textContent).toMatch(/Ink/);
  });

  it('hides the chip for a non-finite balance', () => {
    mockCredits = { balance: { totalInk: Number.NaN }, loaded: true };
    const { container } = mount(withTheme(<DashboardTopBar />));
    expect(q('header', container)!.textContent).not.toMatch(/NaN|Ink/);
  });
});

describe('account menu', () => {
  it('is closed at first and opens with the email, the entries and the theme toggle', () => {
    mount(withTheme(<DashboardTopBar />));
    expect(menu()).toBeNull();
    openMenu();
    expect(menu()).not.toBeNull();
    expect(menu()!.textContent).toContain('asha@example.com');
    for (const label of ['Section finder', 'Settings', 'Log out']) {
      expect(menuItem(label)).toBeTruthy();
    }
    expect(menuItem('Settings').getAttribute('href')).toBe('/dashboard/settings');
    const radios = qa('input[type=radio]', menu()!) as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(['night', 'daylight', 'system']);
    expect(menu()!.textContent).toMatch(/Night.*Daylight.*System/);
  });

  it('carries the nav links too (shown below 720px by CSS)', () => {
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    const links = qa('a', menu()!).map((a) => a.getAttribute('href'));
    for (const n of DASHBOARD_NAV) expect(links).toContain(n.href);
  });

  it('Log out calls logout once and closes the menu', () => {
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    click(menuItem('Log out'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it('Section finder dispatches the open event and closes the menu', () => {
    const seen = jest.fn();
    window.addEventListener(SECTION_FINDER_OPEN_EVENT, seen);
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    click(menuItem('Section finder'));
    window.removeEventListener(SECTION_FINDER_OPEN_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it('the menu is named by the user email (aria-labelledby on the content)', () => {
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    const content = q('[role=dialog]', menu()!) as HTMLElement;
    const id = content.getAttribute('aria-labelledby')!;
    expect(id).toBeTruthy();
    const label = document.getElementById(id)!;
    expect(label.tagName).toBe('P');
    expect(label.textContent).toBe('asha@example.com');
  });

  it('Escape closes the menu and returns focus to the avatar', async () => {
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    expect(menu()).not.toBeNull();
    act(() => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(menu()).toBeNull();
    await settleFocus();
    expect(document.activeElement).toBe(trigger());
  });

  it('Section finder: dispatches the event and focus is not forced back to the avatar', async () => {
    const seen = jest.fn();
    window.addEventListener(SECTION_FINDER_OPEN_EVENT, seen);
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    click(menuItem('Section finder'));
    window.removeEventListener(SECTION_FINDER_OPEN_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    await settleFocus();
    expect(document.activeElement).not.toBe(trigger());
  });

  it('after the Section finder close, a later Escape close returns focus to the avatar again', async () => {
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    click(menuItem('Section finder'));
    openMenu();
    act(() => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(menu()).toBeNull();
    await settleFocus();
    expect(document.activeElement).toBe(trigger());
  });

  it('Settings closes the menu', () => {
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    click(menuItem('Settings'));
    expect(menu()).toBeNull();
  });

  it('Log out and Section finder are not triggered by merely opening the menu', () => {
    const seen = jest.fn();
    window.addEventListener(SECTION_FINDER_OPEN_EVENT, seen);
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    window.removeEventListener(SECTION_FINDER_OPEN_EVENT, seen);
    expect(seen).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

describe('theme toggle in the menu', () => {
  const radio = (v: string) => q(`input[type=radio][value=${v}]`) as HTMLInputElement;
  const html = document.documentElement;

  it('follows the system by default (System selected, daylight when the system is light)', () => {
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    expect(radio('system').checked).toBe(true);
    expect(html.getAttribute('data-theme-pref')).toBe('system');
    expect(html.getAttribute('data-theme')).toBe('daylight');
  });

  it('follows a dark system by default', () => {
    stubMatchMedia({ '(prefers-color-scheme: dark)': true });
    mount(withTheme(<DashboardTopBar />));
    expect(html.getAttribute('data-theme')).toBe('night');
    expect(html.getAttribute('data-theme-pref')).toBe('system');
  });

  it('Night and Daylight change data-theme and are stored under lawie-theme', () => {
    mount(withTheme(<DashboardTopBar />));
    openMenu();
    click(radio('night'));
    expect(html.getAttribute('data-theme')).toBe('night');
    expect(html.getAttribute('data-theme-pref')).toBe('night');
    expect(window.localStorage.getItem('lawie-theme')).toBe('night');
    expect(radio('night').checked).toBe(true);

    click(radio('daylight'));
    expect(html.getAttribute('data-theme')).toBe('daylight');
    expect(window.localStorage.getItem('lawie-theme')).toBe('daylight');

    click(radio('system'));
    expect(html.getAttribute('data-theme-pref')).toBe('system');
    expect(window.localStorage.getItem('lawie-theme')).toBe('system');
  });

  it('a stored choice is restored on the next visit', () => {
    window.localStorage.setItem('lawie-theme', 'night');
    mount(withTheme(<DashboardTopBar />));
    expect(html.getAttribute('data-theme')).toBe('night');
    openMenu();
    expect(radio('night').checked).toBe(true);
  });

  it('System follows a live change of the device setting', () => {
    const mm = stubMatchMedia();
    mount(withTheme(<DashboardTopBar />));
    expect(html.getAttribute('data-theme')).toBe('daylight');
    mm.set('(prefers-color-scheme: dark)', true);
    expect(html.getAttribute('data-theme')).toBe('night');
  });
});

describe('OfflineBanner', () => {
  const setOnline = (v: boolean) =>
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: v });
  afterEach(() => setOnline(true));

  it('renders nothing while online', () => {
    setOnline(true);
    const { container } = mount(<OfflineBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the signed line as a status when the browser starts offline', () => {
    setOnline(false);
    const { container } = mount(<OfflineBanner />);
    const banner = q('[role=status]', container)!;
    expect(OFFLINE_BANNER_COPY).toBe('You are offline. Reconnect to keep working.');
    expect(banner.textContent).toBe('You are offline. Reconnect to keep working.');
    expect(banner.getAttribute('data-kind')).toBe('offline');
  });

  it('follows the offline and online events', () => {
    setOnline(true);
    const { container } = mount(<OfflineBanner />);
    expect(q('[role=status]', container)).toBeNull();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(q('[role=status]', container)!.textContent).toBe(OFFLINE_BANNER_COPY);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(q('[role=status]', container)).toBeNull();
  });

  it('stops listening after unmount', () => {
    setOnline(true);
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const m = mount(<OfflineBanner />);
    m.unmount();
    const added = add.mock.calls.filter(([t]) => t === 'online' || t === 'offline');
    const removed = remove.mock.calls.filter(([t]) => t === 'online' || t === 'offline');
    expect(added).toHaveLength(2);
    expect(removed).toHaveLength(2);
    add.mockRestore();
    remove.mockRestore();
  });
});
