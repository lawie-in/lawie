// T-517 round 3: the pricing outline has no skipped level (h1, then h2 plan names, then h2 FAQ),
// and the plan cards carry no shadow.
import { cleanupMounted, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

import PricingPage from '../pricing/page';

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
});
afterEach(() => cleanupMounted());

describe('pricing outline (round 3)', () => {
  it('headings in order: h1, three plan h2s, then the FAQ h2; no skipped level', () => {
    mount(<PricingPage />);
    const hs = qa('h1,h2,h3,h4,h5,h6').map((h) => h.tagName);
    expect(hs.slice(0, 4)).toEqual(['H1', 'H2', 'H2', 'H2']);
    expect(qa('[data-plan] h3')).toHaveLength(0);
    expect(hs[4]).toBe('H2'); // the FAQ heading follows the plans
    expect(qa('h1')).toHaveLength(1);
    const levels = hs.map((t) => Number(t[1]));
    levels.slice(1).forEach((l, i) => expect(l - levels[i]).toBeLessThanOrEqual(1));
  });

  it('each plan name is the h2 inside its own card', () => {
    mount(<PricingPage />);
    expect(qa('[data-plan]').map((c) => c.querySelector('h2')?.textContent)).toEqual([
      'Free',
      'Solo',
      'Pro',
    ]);
  });

  it('plan cards have no shadow; the plan buttons are ghost (no hover halo)', () => {
    mount(<PricingPage />);
    for (const card of qa('[data-plan]')) {
      expect(card.className).not.toMatch(/shadow-/);
      expect(card.querySelector('a')!.className).not.toContain('shadow-nl-halo');
    }
    expect(q('h1')).not.toBeNull();
  });
});
