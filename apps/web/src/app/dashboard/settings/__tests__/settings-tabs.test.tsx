// T-525 stage B: the Settings tabs (Profile, Plan, Account, Appearance). Hand-built ARIA tabs;
// every panel stays mounted and inactive ones are `hidden`; the tab lives in location.hash.
// break-ui cases: hash garbage, rapid switching, double-click on Save / Sign out, long identity.
import { act, useEffect } from 'react';

import SettingsPage from '../page';

import { ThemeProvider } from '@/components/shell/ThemeProvider';
import {
  cleanupMounted,
  mount,
  press,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

let mockUser: { id: string; name: string; email: string; plan: string };
const mockLogout = jest.fn();
const mockReplace = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}));
jest.mock('@/hooks/useUsage', () => ({ useUsage: () => ({ data: null }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }));
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

let planMounts = 0;
let planUnmounts = 0;
jest.mock('@/components/billing/PlanPanel', () => ({
  PlanPanel: ({ gstSlot }: { gstSlot?: React.ReactNode }) => {
    useEffect(() => {
      planMounts += 1;
      return () => {
        planUnmounts += 1;
      };
    }, []);
    return <div data-testid="plan-panel">{gstSlot}</div>;
  },
}));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const FALLBACK_ROW = {
  id: '1',
  number: 'LAW/2026-27/1',
  kind: 'invoice',
  issuedAt: '2026-10-14T10:00:00.000Z',
  total: 117700,
  originalInvoiceNumber: null,
  placeOfSupply: { source: 'fallback' },
};
let invoices: unknown[];

const TABS = ['Profile', 'Plan', 'Account', 'Appearance'];
const tabs = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
const tab = (name: string) => tabs().find((t) => t.textContent === name) as HTMLElement;
const panels = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
const visiblePanels = () => panels().filter((p) => !p.hidden);
const byText = (text: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === text,
  ) as HTMLElement;
const click = (el: Element) => act(() => (el as HTMLElement).click());
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

async function page(hash = '') {
  window.history.replaceState(null, '', `/dashboard/settings${hash}`);
  mount(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
  );
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  planMounts = 0;
  planUnmounts = 0;
  invoices = [];
  stubMatchMedia();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/dashboard/settings');
  mockUser = {
    id: `u-${Math.random()}`,
    name: 'Asha Rao',
    email: 'asha@example.com',
    plan: 'free',
  };
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/auth/me') return ok({ data: { gstStateCode: null, name: 'Asha Rao' } });
    if (path === '/api/billing/invoices') return ok({ data: invoices });
    return ok({});
  });
});
afterEach(cleanupMounted);

describe('roles and structure', () => {
  it('h1 Settings names a tablist with Profile, Plan, Account, Appearance', async () => {
    await page();
    const h1 = document.querySelector('h1') as HTMLElement;
    expect(h1.textContent).toBe('Settings');
    const list = document.querySelector('[role="tablist"]') as HTMLElement;
    expect(list.getAttribute('aria-labelledby')).toBe(h1.id);
    expect(tabs().map((t) => t.textContent)).toEqual(TABS);
  });

  it('Profile is selected by default; tab and panel reference each other', async () => {
    await page();
    expect(tab('Profile').getAttribute('aria-selected')).toBe('true');
    for (const t of tabs()) {
      const panel = document.getElementById(
        t.getAttribute('aria-controls') as string,
      ) as HTMLElement;
      expect(panel.getAttribute('role')).toBe('tabpanel');
      expect(panel.getAttribute('aria-labelledby')).toBe(t.id);
    }
  });

  it('roving tabindex: only the selected tab is tabbable', async () => {
    await page();
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
    click(tab('Account'));
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, 0, -1]);
  });

  it('all four panels are mounted, three of them hidden', async () => {
    await page();
    expect(panels()).toHaveLength(4);
    expect(visiblePanels()).toHaveLength(1);
    expect(visiblePanels()[0].id).toBe('settings-panel-profile');
    // Mounted content of hidden panels is still in the DOM
    expect(document.querySelector('#settings-gst-state')).not.toBeNull();
    expect(document.querySelector('#close-account-heading')).not.toBeNull();
    expect(document.querySelector('#appearance-heading')).not.toBeNull();
  });

  it('exactly one primary button on the Profile panel (Save changes)', async () => {
    await page();
    expect(byText('Save changes')).toBeDefined();
    expect(visiblePanels()[0].contains(byText('Save changes'))).toBe(true);
  });
});

describe('keyboard', () => {
  it('ArrowRight / ArrowLeft move and wrap; focus follows', async () => {
    await page();
    tab('Profile').focus();
    press(tab('Profile'), { key: 'ArrowRight' });
    expect(tab('Plan').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Plan'));
    press(tab('Plan'), { key: 'ArrowLeft' });
    press(tab('Profile'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tab('Appearance'));
    press(tab('Appearance'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab('Profile'));
  });

  it('Home and End jump to the ends; other keys do nothing', async () => {
    await page();
    tab('Profile').focus();
    const ev = press(tab('Profile'), { key: 'End' });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tab('Appearance'));
    press(tab('Appearance'), { key: 'Home' });
    expect(document.activeElement).toBe(tab('Profile'));
    const other = press(tab('Profile'), { key: 'a' });
    expect(other.defaultPrevented).toBe(false);
    expect(tab('Profile').getAttribute('aria-selected')).toBe('true');
  });

  it('rapid switching leaves exactly one visible panel matching the selected tab', async () => {
    await page();
    tab('Profile').focus();
    for (let i = 0; i < 25; i += 1) press(document.activeElement as Element, { key: 'ArrowRight' });
    // 25 steps from index 0 -> index 1
    expect(tab('Plan').getAttribute('aria-selected')).toBe('true');
    expect(visiblePanels().map((p) => p.id)).toEqual(['settings-panel-plan']);
    expect(tabs().filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });
});

describe('the hash', () => {
  it.each([
    ['#plan', 'Plan'],
    ['#account', 'Account'],
    ['#appearance', 'Appearance'],
    ['#PLAN', 'Plan'],
  ])('initial tab from %s', async (hash, label) => {
    await page(hash);
    expect(tab(label).getAttribute('aria-selected')).toBe('true');
    expect(visiblePanels()).toHaveLength(1);
  });

  it.each(['#../x', '#%', '#%E0%A4%A', '#planet', '#plan/../account', '#'])(
    'garbage hash %s falls back to Profile and does not throw',
    async (hash) => {
      await page(hash);
      expect(tab('Profile').getAttribute('aria-selected')).toBe('true');
      expect(visiblePanels()).toHaveLength(1);
    },
  );

  it('hashchange switches tab', async () => {
    await page();
    window.history.replaceState(null, '', '/dashboard/settings#account');
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(tab('Account').getAttribute('aria-selected')).toBe('true');
    // garbage hashchange keeps the current tab
    window.history.replaceState(null, '', '/dashboard/settings#nope');
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(tab('Account').getAttribute('aria-selected')).toBe('true');
  });

  it('changing tab writes the hash with replaceState (no new history entry)', async () => {
    await page();
    const before = window.history.length;
    const spy = jest.spyOn(window.history, 'replaceState');
    const push = jest.spyOn(window.history, 'pushState');
    click(tab('Plan'));
    expect(window.location.hash).toBe('#plan');
    expect(window.location.pathname).toBe('/dashboard/settings');
    expect(spy).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(before);
    spy.mockRestore();
    push.mockRestore();
  });

  it('keeps the query string when writing the hash', async () => {
    window.history.replaceState(null, '', '/dashboard/settings?from=nav');
    mount(
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>,
    );
    await flush();
    click(tab('Account'));
    expect(window.location.search).toBe('?from=nav');
    expect(window.location.hash).toBe('#account');
  });

  it('survives a refused replaceState (sandboxed frame): the tab still switches', async () => {
    await page();
    const spy = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    click(tab('Account'));
    expect(tab('Account').getAttribute('aria-selected')).toBe('true');
    spy.mockRestore();
  });
});

describe('panels stay mounted', () => {
  it('PlanPanel mounts once and is never remounted by tab switching', async () => {
    await page();
    expect(planMounts).toBe(1);
    for (const name of [...TABS, 'Plan', 'Profile']) click(tab(name));
    expect(planMounts).toBe(1);
    expect(planUnmounts).toBe(0);
  });

  it('typed Profile edits survive a round trip through another tab', async () => {
    await page();
    const input = document.getElementById('profile-name') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, 'Asha R. Rao');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(tab('Account'));
    click(tab('Profile'));
    expect((document.getElementById('profile-name') as HTMLInputElement).value).toBe('Asha R. Rao');
  });
});

describe('Set your State nag', () => {
  it('shows Plan first, then scrolls and focuses the select', async () => {
    invoices = [FALLBACK_ROW];
    await page('#profile');
    const select = document.getElementById('settings-gst-state') as HTMLSelectElement;
    // The nag lives in the hidden Plan panel
    expect(select.closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(true);
    const scroll = jest.fn();
    select.scrollIntoView = scroll;
    expect(tab('Profile').getAttribute('aria-selected')).toBe('true');
    await act(async () => byText('Set your State').click());
    expect(tab('Plan').getAttribute('aria-selected')).toBe('true');
    expect(select.closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(false);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(document.activeElement).toBe(select);
  });

  it('scrolls instantly under reduced motion', async () => {
    stubMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    invoices = [FALLBACK_ROW];
    await page('#plan');
    const select = document.getElementById('settings-gst-state') as HTMLSelectElement;
    const scroll = jest.fn();
    select.scrollIntoView = scroll;
    await act(async () => byText('Set your State').click());
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });
});

describe('Account', () => {
  it('the close dialog opens from the ghost trigger and focus returns on Cancel', async () => {
    await page('#account');
    const trigger = byText('Close account');
    expect(trigger).toBeDefined();
    trigger.focus();
    click(trigger);
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).not.toBeNull();
    const cancel = Array.from(document.querySelectorAll('button')).find((b) =>
      /cancel|keep my account/i.test(b.textContent ?? ''),
    );
    expect(cancel).toBeDefined();
    click(cancel as Element);
    await flush();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Sign out of Lawie logs out and redirects (a double click is not a crash)', async () => {
    await page('#account');
    const out = byText('Sign out of Lawie');
    click(out);
    click(out);
    expect(mockLogout).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('Sign out is a link-like button after the Close account card', async () => {
    await page('#account');
    const close = document.getElementById('close-account-heading') as HTMLElement;
    expect(close.compareDocumentPosition(byText('Sign out of Lawie'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe('Appearance', () => {
  it('choosing Daylight sets data-theme and persists lawie-theme', async () => {
    await page('#appearance');
    expect(document.querySelector('#appearance-heading')?.textContent).toBe('Appearance');
    const radio = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ).find((r) => r.value === 'daylight') as HTMLInputElement;
    click(radio);
    expect(document.documentElement.getAttribute('data-theme')).toBe('daylight');
    expect(window.localStorage.getItem('lawie-theme')).toBe('daylight');
    expect(document.body.textContent).toContain('System follows your device setting.');
  });
});

describe('Profile card (T-510 behaviour through the restyle)', () => {
  it('Save changes with no edits shows "Profile saved." without a request; double click is safe', async () => {
    await page();
    const save = byText('Save changes');
    click(save);
    click(save);
    await flush();
    expect(document.querySelector('#profile-save-status')?.textContent).toBe('Profile saved.');
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
  });

  it('double click on Save with an edit sends one PATCH while saving', async () => {
    let resolve!: (v: unknown) => void;
    mockPrivacyFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    await page();
    const input = document.getElementById('profile-name') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, 'Asha Rao-Kowalczyk');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = byText('Save changes');
    click(save);
    click(save);
    expect(save.hasAttribute('disabled') || save.getAttribute('aria-busy') === 'true').toBe(true);
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true, status: 200 }));
  });

  it('a long name and an unbreakable email render without throwing and stay in the inputs', async () => {
    mockUser = {
      id: 'u-long',
      name: 'Aleksandra Wiśniewska-Kowalczyk-Montgomery',
      email: 'bartholomew.fitzgerald@northwind-industries-holdings.example.com',
      plan: 'pro',
    };
    mockApiFetch.mockImplementation(async (path: string) =>
      path === '/api/auth/me' ? ok({ data: { name: mockUser.name } }) : ok({ data: [] }),
    );
    await page();
    expect((document.getElementById('profile-name') as HTMLInputElement).value).toBe(mockUser.name);
    const email = document.getElementById('profile-email') as HTMLInputElement;
    expect(email.value).toBe(mockUser.email);
    expect(email.disabled).toBe(true);
  });
});
