/**
 * T-528 (Rajesh's review of T-517), landing: one Wall ground with Line hairlines (no Wood section
 * bands), Brass Mark spine bands, plain step columns with brass roman numerals, sticky top bar and
 * anchor offsets, shelf containment and snap, dead focus-within gone. break-ui: Hindi with the
 * numerals and the 34px price, very large PLANS values, narrow container (class assertions;
 * jsdom has no layout).
 */
import { PLANS } from '@lawie/shared';

import { LandingPage } from '../LandingPage';

import {
  NightTopBar,
  NL_STICKY_BAR_CSS,
  NL_STICKY_BAR_HEIGHT,
} from '@/components/marketing/NightTopBar';
import { SECTION_IDS } from '@/components/marketing/nl-copy';
import { cleanupMounted, click, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

const cls = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const sections = () => qa('main > section');

type Mutable = { priceInr: number; inkPerCycle: number };
const solo = PLANS.solo_monthly as unknown as Mutable;
let savedSolo: Mutable;

beforeEach(() => {
  savedSolo = { priceInr: solo.priceInr, inkPerCycle: solo.inkPerCycle };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
});
afterEach(() => {
  cleanupMounted();
  solo.priceInr = savedSolo.priceInr;
  solo.inkPerCycle = savedSolo.inkPerCycle;
});

describe('T-528 item 2: one Wall ground, hairlines between sections', () => {
  it('no section carries a bg-nl-wood band; only the shelf ul keeps Wood', () => {
    mount(<LandingPage />);
    expect(sections().length).toBeGreaterThanOrEqual(6);
    for (const s of sections()) expect(cls(s)).not.toContain('bg-nl-wood');
    // Wood stays for skeleton lines (demo placeholders) and the footer divider ground; inside
    // main the only other Wood is the shelf.
    const wood = qa('main .bg-nl-wood').filter((e) => !e.hasAttribute('data-demo-line'));
    expect(wood).toHaveLength(1);
    expect(wood[0].tagName).toBe('UL');
    expect(wood[0].getAttribute('aria-label')).not.toBeNull();
  });

  it('every section after the first opens with border-t border-nl-line; the first does not', () => {
    mount(<LandingPage />);
    const [first, ...rest] = sections();
    expect(cls(first)).not.toContain('border-t');
    for (const s of rest)
      expect(cls(s)).toEqual(expect.arrayContaining(['border-t', 'border-nl-line']));
  });
});

describe('T-528 item 1: spine bands in Brass Mark', () => {
  it('both bands on every spine use bg-[var(--brass-mark)], never bg-nl-brass', () => {
    mount(<LandingPage />);
    const spines = qa('ul.bg-nl-wood > li');
    expect(spines.length).toBeGreaterThan(0);
    for (const li of spines) {
      const bands = qa('span[aria-hidden="true"]', li);
      expect(bands).toHaveLength(2);
      for (const b of bands) {
        expect(cls(b)).toContain('bg-[var(--brass-mark)]');
        expect(cls(b)).not.toContain('bg-nl-brass');
        expect(cls(b)).toContain('forced-colors:[background-color:CanvasText]');
      }
      expect(cls(li)).toContain('forced-colors:border-2');
    }
    expect(qa('ul.bg-nl-wood .bg-nl-brass')).toHaveLength(0);
  });
});

describe('T-528 item 4: steps are plain columns with brass roman numerals', () => {
  it('li have no border, card ground or padding; numerals are i, ii, iii, aria-hidden, brass-dark', () => {
    mount(<LandingPage />);
    const items = qa('#' + SECTION_IDS.how + ' ol > li');
    expect(items).toHaveLength(3);
    items.forEach((li, i) => {
      const c = cls(li);
      expect(c.filter((x) => /^(border|bg-|p-|p[xytrbl]-|shadow)/.test(x))).toEqual([]);
      const n = q('[data-step-numeral]', li)!;
      expect(n.textContent).toBe(['i', 'ii', 'iii'][i]);
      expect(n.getAttribute('aria-hidden')).toBe('true');
      expect(cls(n)).toContain('text-nl-brass-dark');
      expect(q('h3', li)).not.toBeNull();
    });
  });

  it('Hindi: the numerals stay Latin roman, one per step, and the headings are untouched', () => {
    mount(<LandingPage />);
    click(qa('button').find((b) => b.getAttribute('lang') === 'hi')!);
    const nums = qa('[data-step-numeral]').map((n) => n.textContent);
    expect(nums).toEqual(['i', 'ii', 'iii']);
    for (const li of qa('#' + SECTION_IDS.how + ' ol > li')) {
      expect(cls(li)).toContain('min-w-0');
      expect((q('h3', li)!.textContent ?? '').trim()).not.toBe('');
    }
  });
});

describe('T-528 item 5: sticky top bar and anchor offsets', () => {
  it('T-531: the bar is sticky at every width, above content, clear of the safe-area inset', () => {
    mount(<NightTopBar lang="en" onLangChange={() => undefined} />);
    const c = cls(q('header'));
    expect(c).toEqual(
      expect.arrayContaining(['sticky', 'top-0', 'z-30', 'pt-[env(safe-area-inset-top,0px)]']),
    );
    expect(c.some((x) => x.startsWith('min-[720px]:sticky'))).toBe(false);
  });

  it('no section carries a scroll-mt class; the bar supplies scroll-padding-top instead', () => {
    mount(<LandingPage />);
    expect(sections().length).toBeGreaterThanOrEqual(6);
    for (const s of sections()) expect(s.className).not.toMatch(/scroll-mt/);
    const marker = q('[data-nl-sticky-bar]')!;
    expect(marker).not.toBeNull();
    expect(cls(marker)).toContain('contents');
    const style = q('style', marker)!;
    expect(style.textContent).toContain('scroll-padding-top');
    expect(style.textContent).toBe(NL_STICKY_BAR_CSS);
    // T-531: one 64px row plus its 1px rule at every width; `wrapped` became `fallback`.
    expect(NL_STICKY_BAR_HEIGHT).toEqual({ fallback: 65 });
    expect(style.textContent).toContain(`${NL_STICKY_BAR_HEIGHT.fallback}px`);
    expect(style.textContent).toContain('var(--nl-bar-h,');
  });
});

describe('T-528 item 7a/7b: shelf', () => {
  it('contains overscroll, snaps to a spine, and has no focus-within class', () => {
    mount(<LandingPage />);
    const shelf = q('ul.bg-nl-wood')!;
    expect(cls(shelf)).toEqual(
      expect.arrayContaining([
        'overflow-x-auto',
        'overscroll-x-contain',
        'snap-x',
        'snap-mandatory',
        'scroll-px-nl-3',
        'border-b-[10px]',
      ]),
    );
    for (const li of qa('li', shelf)) {
      expect(cls(li)).toContain('snap-start');
      expect(li.className).not.toContain('focus-within');
    }
  });
});

describe('T-528 items 3 and break-ui on the landing plan cards', () => {
  it('price is Tiro 34/40, tabular, balanced, with no clipping or fixed-width classes', () => {
    mount(<LandingPage />);
    const prices = qa('[data-plan-price]');
    expect(prices).toHaveLength(2);
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

  it('a lakh-crore Solo price stays one text run in the 34px slot; nothing in the chain clips or pins width', () => {
    solo.priceInr = 123456789;
    solo.inkPerCycle = 99999999;
    mount(<LandingPage />);
    const card = q('[data-plan="solo"]')!;
    const price = q('[data-plan-price]', card)!;
    expect(price.textContent).toContain('₹12,34,56,789');
    // Wraps rather than overflows: no nowrap/truncate/overflow-hidden/fixed width on the price,
    // and the card is a min-w-0 flex child so a long run cannot push the grid wider.
    expect(price.className).not.toMatch(
      /whitespace-nowrap|truncate|overflow-|\bw-\[|\bh-\[|line-clamp/,
    );
    expect(cls(card)).toContain('min-w-0');
  });

  it('Hindi: the price slot still takes the Tiro 34/40 classes and the text is not NaN', () => {
    mount(<LandingPage />);
    click(qa('button').find((b) => b.getAttribute('lang') === 'hi')!);
    const prices = qa('[data-plan-price]');
    expect(prices).toHaveLength(2);
    for (const p of prices) {
      expect(cls(p)).toContain('text-[34px]');
      expect(p.textContent).not.toMatch(/undefined|NaN/);
      expect(p.textContent).toMatch(/₹/);
    }
  });

  it('narrow container: sections pad with px-nl-4, grids stay one column below 640px, page clips overflow', () => {
    mount(<LandingPage />);
    const ol = q('#' + SECTION_IDS.how + ' ol')!;
    expect(cls(ol)).toEqual(expect.arrayContaining(['grid-cols-1', 'min-[640px]:grid-cols-3']));
    for (const s of sections()) expect(s.className).toContain('px-nl-4');
    expect(q('.nl-root, [class*="overflow-x-clip"]')).not.toBeNull();
  });
});
