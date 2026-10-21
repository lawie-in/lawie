// T-517: the (marketing) layout. The old pages (about, faq, terms, privacy, ...) keep `.mk`, the
// legacy font variables and the LogoSplash; the Night Library pages ("/" and "/pricing") get none.
import { usePathname } from 'next/navigation';

import {
  isNightLibraryMarketingPath,
  MarketingFrame,
  NIGHT_LIBRARY_MARKETING_PATHS,
} from '@/components/marketing/MarketingFrame';
import { cleanupMounted, mount, q } from '@/components/ui/__tests__/nl-test-utils';

import MarketingLayout from '../layout';

jest.mock('@/components/marketing/LogoSplash', () => ({
  LogoSplash: () => <div data-testid="logo-splash" />,
}));

const at = (path: string | null) => (usePathname as jest.Mock).mockReturnValue(path);
afterEach(() => cleanupMounted());

const renderLayout = () =>
  mount(
    <MarketingLayout>
      <p data-testid="child">child</p>
    </MarketingLayout>,
  );

describe('MarketingFrame (T-517)', () => {
  it.each(['/about', '/faq', '/terms', '/privacy', '/refunds', '/tools', '/contact'])(
    '%s keeps .mk, the legacy fonts and LogoSplash',
    (path) => {
      at(path);
      renderLayout();
      const wrap = q('.mk');
      expect(wrap).not.toBeNull();
      // next/font is stubbed in Jest: each of the three fonts adds the class "variable".
      expect(wrap!.className.split(' ')).toEqual(['mk', 'variable', 'variable', 'variable']);
      expect(q('[data-testid="logo-splash"]')).not.toBeNull();
      expect(wrap!.contains(q('[data-testid="child"]'))).toBe(true);
    },
  );

  it.each(['/', '/pricing', '/pricing/'])(
    '%s has no .mk, no legacy fonts, no LogoSplash',
    (path) => {
      at(path);
      renderLayout();
      expect(q('.mk')).toBeNull();
      expect(q('[data-testid="logo-splash"]')).toBeNull();
      expect(document.body.innerHTML).not.toContain('variable');
      expect(q('[data-testid="child"]')).not.toBeNull();
    },
  );

  it('isNightLibraryMarketingPath: exactly / and /pricing; nulls are legacy', () => {
    expect([...NIGHT_LIBRARY_MARKETING_PATHS]).toEqual(['/', '/pricing']);
    expect(isNightLibraryMarketingPath('/pricing')).toBe(true);
    expect(isNightLibraryMarketingPath('/pricingx')).toBe(false);
    expect(isNightLibraryMarketingPath('/about')).toBe(false);
    expect(isNightLibraryMarketingPath(null)).toBe(false);
    expect(isNightLibraryMarketingPath(undefined)).toBe(false);
  });

  it('a client navigation from /about to / keeps the children mounted (same tree)', () => {
    at('/about');
    const m = mount(
      <MarketingFrame legacyClassName="x" splash={<i data-testid="s" />}>
        <b data-testid="kid" />
      </MarketingFrame>,
    );
    const kid = q('[data-testid="kid"]');
    at('/');
    m.rerender(
      <MarketingFrame legacyClassName="x" splash={<i data-testid="s" />}>
        <b data-testid="kid" />
      </MarketingFrame>,
    );
    expect(q('[data-testid="kid"]')).toBe(kid);
    expect(q('.mk')).toBeNull();
  });
});
