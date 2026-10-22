/**
 * T-528 on /pricing: one Wall ground with a Line hairline (no Wood band), plan price in Tiro 34/40,
 * three columns from 1024px. break-ui: very large PLANS values, Hindi-safe price slot, narrow grid.
 */
import { PLANS } from '@lawie/shared';

import PricingPage from '../pricing/page';

import { cleanupMounted, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

const cls = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

type Mutable = { priceInr: number; inkPerCycle: number };
const solo = PLANS.solo_monthly as unknown as Mutable;
let saved: Mutable;

beforeEach(() => {
  saved = { priceInr: solo.priceInr, inkPerCycle: solo.inkPerCycle };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
});
afterEach(() => {
  cleanupMounted();
  solo.priceInr = saved.priceInr;
  solo.inkPerCycle = saved.inkPerCycle;
});

describe('T-528 /pricing', () => {
  it('no section is a Wood band; the FAQ section opens with the Line hairline', () => {
    mount(<PricingPage />);
    const sections = qa('main > section');
    expect(sections.length).toBeGreaterThanOrEqual(2);
    for (const s of sections) expect(cls(s)).not.toContain('bg-nl-wood');
    expect(cls(sections[0])).not.toContain('border-t');
    for (const s of sections.slice(1)) {
      expect(cls(s)).toEqual(expect.arrayContaining(['border-t', 'border-nl-line']));
    }
    expect(qa('main .bg-nl-wood')).toHaveLength(0);
  });

  it('the plan grid is one column, two from 640px and three from 1024px (not 900px)', () => {
    mount(<PricingPage />);
    const grid = q('[data-plan]')!.parentElement!;
    expect(cls(grid)).toEqual(
      expect.arrayContaining([
        'grid-cols-1',
        'min-[640px]:grid-cols-2',
        'min-[1024px]:grid-cols-3',
      ]),
    );
    expect(cls(grid)).not.toContain('min-[900px]:grid-cols-3');
    expect(qa('[data-plan]', grid)).toHaveLength(3);
  });

  it('every plan price is Tiro 34/40 with tabular figures and the data-plan-price hook', () => {
    mount(<PricingPage />);
    const prices = qa('[data-plan-price]');
    expect(prices).toHaveLength(3);
    for (const p of prices) {
      expect(cls(p)).toEqual(
        expect.arrayContaining([
          'font-nl-display',
          'text-[34px]',
          'leading-[40px]',
          'font-normal',
          'tabular-nums',
          '[text-wrap:balance]',
        ]),
      );
      expect(cls(p)).not.toContain('nl-h2');
    }
  });

  it('break-ui: a nine-digit Solo price stays whole, can wrap, and cannot widen the grid', () => {
    solo.priceInr = 123456789;
    solo.inkPerCycle = 99999999;
    mount(<PricingPage />);
    const card = q('[data-plan="solo"]')!;
    const price = q('[data-plan-price]', card)!;
    expect(price.textContent).toContain('₹12,34,56,789');
    expect(price.textContent).not.toMatch(/undefined|NaN/);
    expect(price.className).not.toMatch(
      /whitespace-nowrap|truncate|overflow-|\bw-\[|\bh-\[|line-clamp/,
    );
    expect(cls(card)).toContain('min-w-0');
  });
});
