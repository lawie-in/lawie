// T-520: the dashboard layout. Only /dashboard gets the Night Library shell; every other
// dashboard route keeps the legacy shell exactly as it was.
import { usePathname, useRouter } from 'next/navigation';

import DashboardLayout from '../layout';

import { ThemeProvider } from '@/components/shell/ThemeProvider';
import {
  cleanupMounted,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

let mockAuth: {
  user: { id: string; name: string; email: string; plan: string } | null;
  isLoading: boolean;
  logout: jest.Mock;
};
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({
    balance: { totalInk: 12 },
    loaded: true,
    loading: false,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/components/credits/HeaderCreditPill', () => ({
  HeaderCreditPill: () => <div data-testid="legacy-credit-pill" />,
}));
jest.mock('@/components/dashboard/Sidebar', () => ({
  __esModule: true,
  default: () => <aside data-testid="legacy-sidebar" />,
}));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  __esModule: true,
  default: () => <div data-testid="privacy-prompt" />,
  PrivacyAcceptedStatus: () => <div data-testid="privacy-status" />,
}));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  __esModule: true,
  default: () => <div data-testid="verify-prompt" />,
}));
jest.mock('@/components/sections/SectionFinderPanel', () => ({
  SectionFinderPanel: () => <div data-testid="section-finder" />,
  SECTION_FINDER_OPEN_EVENT: 'lawie:openSectionFinder',
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const replace = jest.fn();
const USER = { id: 'u1', name: 'Asha Rao', email: 'asha@example.com', plan: 'free' };

function page(path: string, auth: Partial<typeof mockAuth> = {}) {
  mockAuth = { user: USER, isLoading: false, logout: jest.fn(), ...auth };
  (usePathname as jest.Mock).mockReturnValue(path);
  return mount(
    <ThemeProvider>
      <DashboardLayout>
        <div data-testid="child">page</div>
      </DashboardLayout>
    </ThemeProvider>,
  );
}
const tid = (id: string) => q(`[data-testid=${id}]`);

beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace });
});
afterEach(cleanupMounted);

describe('/dashboard: the Night Library shell', () => {
  it('renders nl-root with the top bar, banners, finder, prompts and the page', () => {
    const { container } = page('/dashboard');
    expect(q('.nl.nl-root', container)).not.toBeNull();
    expect(q('header[data-variant=signed-in]', container)).not.toBeNull();
    expect(tid('verify-prompt')).not.toBeNull();
    expect(tid('section-finder')).not.toBeNull();
    expect(tid('privacy-prompt')).not.toBeNull();
    expect(tid('privacy-status')).not.toBeNull();
    expect(tid('child')).not.toBeNull();
    // none of the legacy chrome
    expect(tid('legacy-sidebar')).toBeNull();
    expect(tid('legacy-credit-pill')).toBeNull();
    expect(q('button[aria-label="Open menu"]', container)).toBeNull();
  });

  it('has one header row (no mobile theme row) because the toggle lives in the menu', () => {
    const { container } = page('/dashboard');
    expect(qa('header', container)).toHaveLength(1);
    expect(q('[data-topbar-mobile-menu]', container)).toBeNull();
  });

  it('main#dashboard-main exists, is the page landmark, and is programmatically focusable only', () => {
    const { container } = page('/dashboard');
    const main = q('main#dashboard-main', container) as HTMLElement;
    expect(main).not.toBeNull();
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(qa('main', container)).toHaveLength(1);
    expect(main.contains(tid('child'))).toBe(true);
    main.focus();
    expect(document.activeElement).toBe(main);
  });

  it('does not scroll sideways at 360px: the shell clips horizontal overflow and shrinks', () => {
    const { container } = page('/dashboard');
    const root = q('.nl-root', container) as HTMLElement;
    // T-531: `clip`, not `hidden`. `hidden` makes the shell a scroll container, so the sticky top
    // bar could not pin to the viewport.
    expect(root.className.split(/\s+/)).toContain('overflow-x-clip');
    expect(root.className).not.toContain('overflow-x-hidden');
    expect((q('main', container) as HTMLElement).className).toContain('min-w-0');
  });

  it('signed out: a spinner, no page, the privacy prompt still mounted, and a redirect to /login', () => {
    const { container } = page('/dashboard', { user: null });
    expect(tid('child')).toBeNull();
    expect(q('header', container)).toBeNull();
    expect(tid('privacy-prompt')).not.toBeNull();
    expect(q('.nl-root', container)).not.toBeNull();
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('still loading: the spinner and the privacy prompt, no redirect yet', () => {
    const { container } = page('/dashboard', { user: null, isLoading: true });
    expect(tid('child')).toBeNull();
    expect(tid('privacy-prompt')).not.toBeNull();
    expect(q('.nl-root', container)).not.toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('signed in does not redirect', () => {
    page('/dashboard');
    expect(replace).not.toHaveBeenCalled();
  });
});

describe.each([
  '/dashboard/documents',
  '/dashboard/new',
  '/dashboard/documents/abc',
  '/dashboard/templates',
  '/dashboard/settings-x',
])('%s: the legacy shell, unchanged', (path) => {
  it('has the sidebar, credit pill, mobile menu button and no nl-root or Night Library bar', () => {
    const { container } = page(path);
    expect(tid('legacy-sidebar')).not.toBeNull();
    expect(tid('legacy-credit-pill')).not.toBeNull();
    expect(q('button[aria-label="Open menu"]', container)).not.toBeNull();
    expect(q('.nl-root', container)).toBeNull();
    expect(q('header[data-variant]', container)).toBeNull();
    expect(tid('child')).not.toBeNull();
  });

  it('keeps main#dashboard-main (tabIndex -1), the finder and the privacy prompts', () => {
    const { container } = page(path);
    const main = q('main#dashboard-main', container) as HTMLElement;
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(main.contains(tid('child'))).toBe(true);
    expect(tid('section-finder')).not.toBeNull();
    expect(tid('verify-prompt')).not.toBeNull();
    expect(tid('privacy-prompt')).not.toBeNull();
    expect(tid('privacy-status')).not.toBeNull();
  });

  it('signed out: legacy spinner, privacy prompt mounted, redirect to /login', () => {
    const { container } = page(path, { user: null });
    expect(tid('child')).toBeNull();
    expect(tid('legacy-sidebar')).toBeNull();
    expect(q('.animate-spin', container)).not.toBeNull();
    expect(q('.nl-root', container)).toBeNull();
    expect(tid('privacy-prompt')).not.toBeNull();
    expect(replace).toHaveBeenCalledWith('/login');
  });
});

describe.each(['/dashboard/settings', '/dashboard/settings/', '/dashboard/payment/success'])(
  '%s: the Night Library shell with the shared container',
  (path) => {
    it('renders nl-root, the Night top bar and no legacy chrome', () => {
      const { container } = page(path);
      expect(q('.nl.nl-root', container)).not.toBeNull();
      expect(q('header[data-variant=signed-in]', container)).not.toBeNull();
      expect(tid('legacy-sidebar')).toBeNull();
      expect(tid('legacy-credit-pill')).toBeNull();
      expect(q('button[aria-label="Open menu"]', container)).toBeNull();
      expect(q('main#dashboard-main', container)?.getAttribute('tabindex')).toBe('-1');
      expect(tid('section-finder')).not.toBeNull();
      expect(tid('privacy-prompt')).not.toBeNull();
    });

    it('wraps the page in exactly one max-w-[1180px] container', () => {
      const { container } = page(path);
      const wrappers = qa('[class*="max-w-[1180px]"]', container);
      expect(wrappers).toHaveLength(1);
      expect(wrappers[0].contains(tid('child'))).toBe(true);
      expect(wrappers[0].className).toContain('mx-auto');
    });

    it('signed out: redirects to /login without the page', () => {
      page(path, { user: null });
      expect(tid('child')).toBeNull();
      expect(replace).toHaveBeenCalledWith('/login');
    });
  },
);

describe('/dashboard brings its own container (not padded twice)', () => {
  it('has no layout wrapper around the page', () => {
    const { container } = page('/dashboard');
    expect(qa('[class*="max-w-[1180px]"]', container)).toHaveLength(0);
  });
});

describe('path matching', () => {
  it('a null pathname falls back to the legacy shell', () => {
    mockAuth = { user: USER, isLoading: false, logout: jest.fn() };
    (usePathname as jest.Mock).mockReturnValue(null);
    mount(
      <DashboardLayout>
        <div data-testid="child" />
      </DashboardLayout>,
    );
    expect(tid('legacy-sidebar')).not.toBeNull();
  });
});
