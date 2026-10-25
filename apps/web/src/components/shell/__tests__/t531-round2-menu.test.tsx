// T-531 round 2: TopBar `menuBelow`, the menu's S3 (no self-reopen after going wide then narrow)
// and S4 (a link click or Enter does not send focus back to the trigger; Escape does), and the
// z-[60] layer (Rajesh M1): TopBarMenu, AccountMenu and Dialog above the consent sheet (z-55),
// below the toast viewport (z-100). jsdom has no layout; classes and matchMedia stand in.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';

import AnalyticsConsent from '../../AnalyticsConsent';
import { DashboardTopBar } from '../DashboardTopBar';
import { ThemeProvider } from '../ThemeProvider';
import { TopBar } from '../TopBar';
import { TOP_BAR_MENU_HIDE, TopBarMenu } from '../TopBarMenu';

import { Dialog } from '@/components/ui/Dialog';
import { ToastProvider } from '@/components/ui/Toast';
import {
  cleanupMounted,
  click,
  mount,
  press,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Asha Rao', email: 'asha@x.in', plan: 'free' },
    logout: jest.fn(),
  }),
}));
jest.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({ balance: { totalInk: 5 }, loaded: true }),
}));

const TRIGGER = '[data-topbar-menu-trigger]';
const MENU = '[data-topbar-menu]';
const trigger = () => q(TRIGGER) as HTMLButtonElement;
const cls = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const settle = () => act(async () => new Promise<void>((r) => setTimeout(r, 10)));
const Q1120 = '(min-width: 1120px)';
const Q720 = '(min-width: 720px)';

beforeEach(() => {
  localStorage.clear();
  (usePathname as jest.Mock).mockReturnValue('/dashboard');
});
afterEach(cleanupMounted);

const withTheme = (el: React.ReactElement) => <ThemeProvider>{el}</ThemeProvider>;

describe('TopBar menuBelow', () => {
  it('defaults to 720: trigger min-[720px]:hidden, desktop toggle hidden min-[720px]:block, query 720', () => {
    const mm = stubMatchMedia();
    mount(withTheme(<TopBar variant="signed-out" />));
    expect(cls(trigger())).toContain('min-[720px]:hidden');
    const bar = qa('header fieldset')[0].parentElement!;
    expect(cls(bar)).toEqual(expect.arrayContaining(['hidden', 'min-[720px]:block']));
    expect(mm.listenerCount(Q720)).toBeGreaterThan(0);
  });

  it('menuBelow={1120}: trigger min-[1120px]:hidden, desktop toggle hidden min-[1120px]:block, query 1120', () => {
    const mm = stubMatchMedia();
    mount(withTheme(<TopBar variant="signed-out" menuBelow={1120} />));
    expect(cls(trigger())).toContain('min-[1120px]:hidden');
    expect(cls(trigger())).not.toContain('min-[720px]:hidden');
    const bar = qa('header fieldset')[0].parentElement!;
    expect(cls(bar)).toEqual(expect.arrayContaining(['hidden', 'min-[1120px]:block']));
    expect(cls(bar)).not.toContain('min-[720px]:block');
    expect(mm.listenerCount(Q1120)).toBeGreaterThan(0);
    expect(mm.listenerCount(Q720)).toBe(0);
  });

  it('menuBelow={1120}: at 720-1119 the menu still opens (the 720 query does not close it)', () => {
    stubMatchMedia({ [Q720]: true, [Q1120]: false });
    mount(withTheme(<TopBar variant="signed-out" menuBelow={1120} />));
    click(trigger());
    expect(q(MENU)).not.toBeNull();
  });

  it('TOP_BAR_MENU_HIDE maps each width to its query and its full class string', () => {
    expect(TOP_BAR_MENU_HIDE[720]).toEqual({ query: Q720, className: 'min-[720px]:hidden' });
    expect(TOP_BAR_MENU_HIDE[1120]).toEqual({ query: Q1120, className: 'min-[1120px]:hidden' });
  });
});

describe('TopBarMenu S3: it never reopens by itself', () => {
  const menu = (
    <ThemeProvider>
      <TopBarMenu label="Menu" hideFrom={1120}>
        <a href="#x">X</a>
      </TopBarMenu>
    </ThemeProvider>
  );

  it('open, then wide, then narrow again: it stays closed', () => {
    const mm = stubMatchMedia({ [Q1120]: false });
    mount(menu);
    click(trigger());
    expect(q(MENU)).not.toBeNull();
    mm.set(Q1120, true);
    expect(q(MENU)).toBeNull();
    mm.set(Q1120, false);
    expect(q(MENU)).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    // And one click opens it normally afterwards.
    click(trigger());
    expect(q(MENU)).not.toBeNull();
  });

  it('while wide the trigger does nothing, and does not arm a later open', () => {
    const mm = stubMatchMedia({ [Q1120]: true });
    mount(menu);
    click(trigger());
    click(trigger());
    expect(q(MENU)).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    mm.set(Q1120, false);
    expect(q(MENU)).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('same at the default 720 width (portrait, landscape, portrait)', () => {
    const mm = stubMatchMedia({ [Q720]: false });
    mount(
      <ThemeProvider>
        <TopBarMenu label="Menu">
          <p>x</p>
        </TopBarMenu>
      </ThemeProvider>,
    );
    click(trigger());
    mm.set(Q720, true);
    mm.set(Q720, false);
    expect(q(MENU)).toBeNull();
  });
});

describe('TopBarMenu S4: focus after closing', () => {
  const render = () => {
    stubMatchMedia();
    mount(
      withTheme(
        <TopBarMenu label="Menu">
          <a id="faq-link" href="#faq">
            FAQ
          </a>
          <button type="button" id="plain">
            plain
          </button>
        </TopBarMenu>,
      ),
    );
    trigger().focus();
  };
  // jsdom does not implement navigation; keep the click from logging a not-implemented error.
  const noNav = () => q('#faq-link')!.addEventListener('click', (e) => e.preventDefault());

  it('a link click closes the menu and focus does NOT return to the trigger', async () => {
    render();
    click(trigger());
    await settle();
    noNav();
    (q('#faq-link') as HTMLElement).focus();
    click(q('#faq-link'));
    await settle();
    expect(q(MENU)).toBeNull();
    expect(document.activeElement).not.toBe(trigger());
  });

  it('Enter on a link (keyboard activation) does NOT return focus to the trigger', async () => {
    render();
    click(trigger());
    await settle();
    noNav();
    const link = q('#faq-link') as HTMLElement;
    link.focus();
    // A real browser turns Enter on a focused link into a click; jsdom does not, so dispatch both.
    press(link, { key: 'Enter' });
    click(link);
    await settle();
    expect(q(MENU)).toBeNull();
    expect(document.activeElement).not.toBe(trigger());
  });

  it('Escape closes the menu and focus DOES return to the trigger', async () => {
    render();
    click(trigger());
    await settle();
    press(document.activeElement ?? document.body, { key: 'Escape' });
    await settle();
    expect(q(MENU)).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('after a link close, a later Escape close still restores focus (the flag is cleared)', async () => {
    render();
    click(trigger());
    await settle();
    noNav();
    click(q('#faq-link'));
    await settle();
    trigger().focus();
    click(trigger());
    await settle();
    press(document.activeElement ?? document.body, { key: 'Escape' });
    await settle();
    expect(q(MENU)).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

describe('z-[60] layer (Rajesh M1): above consent (55), below toast (100)', () => {
  const z = (el: Element | null) => {
    const m = cls(el).find((c) => /^z-\[\d+\]$/.test(c));
    return m ? Number(m.slice(3, -1)) : NaN;
  };

  async function consentZ(): Promise<number> {
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 204 }),
    );
    (usePathname as jest.Mock).mockReturnValue('/pricing');
    sessionStorage.clear();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => root.render(<AnalyticsConsent />));
    await act(async () => {
      await Promise.resolve();
    });
    const value = z(container.querySelector('section'));
    act(() => root.unmount());
    container.remove();
    document.body.removeAttribute('data-consent-open');
    return value;
  }

  function toastZ(): number {
    mount(
      <ToastProvider closeLabel="Close" viewportLabel="Notifications">
        <p>page</p>
      </ToastProvider>,
    );
    const vp = qa('body *').find(
      (e) => cls(e).includes('fixed') && !Number.isNaN(z(e)) && z(e) > 90,
    );
    return z(vp ?? null);
  }

  it('TopBarMenu content, AccountMenu content, Dialog overlay and Dialog content are all z-[60]', () => {
    stubMatchMedia();
    mount(withTheme(<TopBar variant="signed-out" />));
    click(trigger());
    expect(z(q(MENU))).toBe(60);
    cleanupMounted();

    mount(withTheme(<DashboardTopBar />));
    click(q('button[aria-label="Asha Rao"]'));
    expect(z(q('[data-radix-popper-content-wrapper] > *'))).toBe(60);
    cleanupMounted();

    mount(
      <Dialog
        open
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
        title="Sure?"
        confirmLabel="Yes"
        cancelLabel="No"
      />,
    );
    expect(z(q('[role=dialog]'))).toBe(60);
    const overlay = qa('body > *, body > * > *').find(
      (e) => cls(e).includes('bg-black/50') && cls(e).includes('inset-0'),
    );
    expect(z(overlay ?? null)).toBe(60);
  });

  it('60 is above the consent sheet (55) and the bar (30), and below the toast viewport (100)', async () => {
    const consent = await consentZ();
    const toast = toastZ();
    expect(consent).toBe(55);
    expect(toast).toBe(100);
    expect(consent).toBeLessThan(60);
    expect(60).toBeLessThan(toast);
    stubMatchMedia();
    cleanupMounted();
    mount(withTheme(<TopBar variant="signed-out" sticky />));
    expect(z(q('header'))).toBeNaN(); // the bar uses the unbracketed z-30 class
    expect(cls(q('header'))).toContain('z-30');
  });
});
