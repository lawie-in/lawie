// T-524: the root layout's viewport export: two theme-color entries, one per colour scheme.
import { THEME_COLOR } from '@/components/shell/theme';

import { viewport } from '../layout';

jest.mock('@/components/AnalyticsConsent', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/signup-source', () => ({ SignupSourceCapture: () => null }));

describe('root layout viewport (T-524)', () => {
  it('themeColor is the dark and light Wall colours, each scoped to its scheme', () => {
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: dark)', color: '#0E1A17' },
      { media: '(prefers-color-scheme: light)', color: '#F3EFE4' },
    ]);
  });

  it('uses the same constants the ThemeProvider writes', () => {
    const list = viewport.themeColor as { media: string; color: string }[];
    expect(list.find((e) => /dark/.test(e.media))!.color).toBe(THEME_COLOR.night);
    expect(list.find((e) => /light/.test(e.media))!.color).toBe(THEME_COLOR.daylight);
  });

  it("every entry has a media query (the unscoped one is the ThemeProvider's job)", () => {
    for (const e of viewport.themeColor as { media?: string }[]) expect(e.media).toBeTruthy();
  });
});
