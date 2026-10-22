/**
 * T-517 break-ui (worst-case data) on the landing and pricing pages: Hindi with every string,
 * zero / extreme / missing PLANS values (the only data these pages take), a missing grievance
 * officer env, a narrow container (class assertions; jsdom has no layout), rapid clicks.
 */
import { PLANS } from '@lawie/shared';

import PricingPage from '@/app/(marketing)/pricing/page';
import { LandingPage } from '../LandingPage';

import { landingCopy, monthlyInk, monthlyPrice, planCards } from '@/components/marketing/nl-copy';
import { cleanupMounted, click, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

const ENV_KEY = 'NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME';
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const NEVER = /undefined|NaN|\[object|\bnull\b/;
const hiButton = () => qa('button').find((b) => b.getAttribute('lang') === 'hi')!;
const enButton = () => qa('button').find((b) => b.getAttribute('lang') === 'en')!;

let savedEnv: string | undefined;
type Mutable = { priceInr: number; inkPerCycle: number };
const solo = PLANS.solo_monthly as unknown as Mutable;
let savedSolo: Mutable;

beforeEach(() => {
  savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  savedSolo = { priceInr: solo.priceInr, inkPerCycle: solo.inkPerCycle };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
});
afterEach(() => {
  cleanupMounted();
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
  solo.priceInr = savedSolo.priceInr;
  solo.inkPerCycle = savedSolo.inkPerCycle;
});

describe('break-ui: Hindi mode, every string', () => {
  it('landing in Hindi renders no undefined / NaN / [object] and no empty headings, links or buttons', () => {
    mount(<LandingPage />);
    click(hiButton());
    expect(norm(document.body.textContent)).not.toMatch(NEVER);
    for (const h of qa('h1, h2, h3')) expect(norm(h.textContent)).not.toBe('');
    for (const el of qa('a, button')) {
      const name = norm(el.textContent) || el.getAttribute('aria-label') || '';
      expect(name).not.toBe('');
    }
    // Devanagari text is not clipped by a fixed height or line clamp on headings.
    for (const h of qa('h1, h2, h3')) {
      expect(h.className).not.toMatch(/\bh-\d|line-clamp|overflow-hidden/);
    }
  });

  it('every Hindi landing string is defined and non-empty (deep walk of landingCopy("hi"))', () => {
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'string') {
        expect({ path, v: v.trim() }).not.toEqual({ path, v: '' });
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object')
        Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
      else expect({ path, v }).toBeNull(); // undefined / null / number would fail here
    };
    walk(landingCopy('hi'), 'hi');
    walk(landingCopy('en'), 'en');
  });

  it('rapid EN/HI toggling 20 times ends consistent: one h1, lang matches the pressed button', () => {
    mount(<LandingPage />);
    for (let i = 0; i < 20; i++) click(i % 2 === 0 ? hiButton() : enButton());
    // 20 clicks, the last on EN.
    expect(qa('h1')).toHaveLength(1);
    expect(q('.nl-root')!.getAttribute('lang')).toBe('en');
    expect(enButton().getAttribute('aria-pressed')).toBe('true');
    expect(hiButton().getAttribute('aria-pressed')).toBe('false');
    click(hiButton());
    expect(q('.nl-root')!.getAttribute('lang')).toBe('hi');
  });

  it('rapid clicks on FAQ questions keep aria-expanded and the panels in step', () => {
    mount(<LandingPage />);
    const btns = () => qa('button[aria-expanded]');
    expect(btns().length).toBeGreaterThan(0);
    const start = btns()[0].getAttribute('aria-expanded') === 'true';
    for (let i = 0; i < 9; i++) click(btns()[0]); // odd number of clicks flips the start state
    expect(btns()[0].getAttribute('aria-expanded')).toBe(String(!start));
    const last = btns().length - 1;
    const lastStart = btns()[last].getAttribute('aria-expanded') === 'true';
    for (let i = 0; i < 4; i++) click(btns()[last]); // even number returns it
    expect(btns()[last].getAttribute('aria-expanded')).toBe(String(lastStart));
    // Never two panels open at once if the accordion is single-open; at least never mismatched.
    for (const b of btns()) {
      const panel = document.getElementById(b.getAttribute('aria-controls') ?? '');
      if (panel)
        expect(panel.hasAttribute('hidden')).toBe(b.getAttribute('aria-expanded') === 'false');
    }
    expect(norm(document.body.textContent)).not.toMatch(NEVER);
  });
});

describe('break-ui: zero, extreme and missing PLANS data', () => {
  it('price formatting: zero, lakh-scale (en-IN grouping) and one', () => {
    expect(monthlyPrice(0)).toBe('₹0 a month');
    expect(monthlyPrice(100000)).toBe('₹1,00,000 a month');
    expect(monthlyPrice(1299, 'hi')).toBe('₹1,299 प्रति माह');
    expect(monthlyInk(1)).toBe('1 Ink a month');
    expect(monthlyInk(0, 'hi')).toBe('0 Ink प्रति माह');
  });

  it('zero price and zero Ink in PLANS render as ₹0 / 0 Ink on landing, with no NaN', () => {
    solo.priceInr = 0;
    solo.inkPerCycle = 0;
    mount(<LandingPage />);
    const text = norm(document.body.textContent);
    expect(text).toContain('₹0 a month');
    expect(text).toContain('0 Ink a month');
    expect(text).not.toMatch(NEVER);
    expect(qa('[data-plan]')).toHaveLength(2);
  });

  it('huge values do not break the card: the grouped price is one text run', () => {
    solo.priceInr = 12345678;
    solo.inkPerCycle = 9999999;
    expect(planCards('en').solo.price).toBe('₹1,23,45,678 a month');
    mount(<LandingPage />);
    expect(norm(q('[data-plan="solo"]')!.textContent)).toContain('₹1,23,45,678 a month');
  });

  it('a missing price (undefined in PLANS, schema-breaking) throws in planCards: no guard, so the page would not render', () => {
    // Recorded so a later guard is a visible change. Real PLANS is a typed constant, so this is
    // Fragile, not Broken: nothing in the web app can produce it at runtime today.
    solo.priceInr = undefined as unknown as number;
    expect(() => planCards('en')).toThrow(TypeError);
  });

  it('pricing page at zero Ink still renders the three cards and the top-up line', () => {
    solo.inkPerCycle = 0;
    mount(<PricingPage />);
    expect(qa('[data-plan]').map((e) => e.getAttribute('data-plan'))).toEqual([
      'free',
      'solo',
      'pro',
    ]);
    expect(norm(q('[data-plan="solo"]')!.textContent)).toContain('0 Ink a month');
  });
});

describe('break-ui: missing env, narrow container, repeated clicks', () => {
  it('no grievance officer env: the fallback line, never "undefined", on the landing and pricing', () => {
    mount(<LandingPage />);
    expect(norm(q('[data-grievance-line]')!.textContent)).toBe(
      'For complaints, write to contact@lawie.in.',
    );
    cleanupMounted();
    mount(<PricingPage />);
    expect(norm(q('footer')!.textContent)).not.toMatch(NEVER);
  });

  it('a very long officer name wraps inside the footer line (no nowrap, a capped measure)', () => {
    process.env[ENV_KEY] = 'Subramaniam Venkataraghavan Krishnamurthy-Ramachandran Iyer';
    mount(<LandingPage />);
    const line = q('[data-grievance-line]')!;
    expect(norm(line.textContent)).toContain('Krishnamurthy-Ramachandran');
    expect(line.className).not.toContain('whitespace-nowrap');
    expect(line.className).toContain('max-w-[60ch]');
  });

  it('320px: both pages clip horizontal overflow, the plan grid is one column below 640px, the hero image/folio is shrinkable', () => {
    mount(<LandingPage />);
    expect(q('.nl-root')!.className).toContain('overflow-x-clip');
    expect(q('.nl-root')!.className).toContain('min-h-[100svh]');
    cleanupMounted();
    mount(<PricingPage />);
    expect(q('.nl-root')!.className).toContain('overflow-x-clip');
    const grid = q('[data-plan="free"]')!.parentElement!;
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('min-[640px]:grid-cols-2');
    // T-531: there is no second mobile row. The nav links are in the phone menu by design, in a
    // landmark named "Main"; the bar itself carries none of them below 1120px.
    expect(q('[data-topbar-mobile-menu]')).toBeNull();
    expect(qa('header nav a').length).toBe(4);
    expect(q('header nav')!.className.split(/\s+/)).toContain('hidden');
    click(q('[data-topbar-menu-trigger]'));
    const menuLinks = qa('[data-topbar-menu] nav[aria-label="Main"] a');
    expect(menuLinks).toHaveLength(4);
  });

  it('round-2 polish: no decorative 01/02/03 labels; FAQ marker is an svg, not a "+" glyph', () => {
    mount(<LandingPage />);
    const steps = q('section[aria-labelledby="steps-heading"]')!;
    expect(steps.querySelector('ol')).not.toBeNull();
    expect(norm(steps.textContent)).not.toMatch(/\b0[123]\b/);
    for (const b of qa('button[aria-expanded]')) {
      expect(b.querySelector('svg')).not.toBeNull();
      expect(norm(b.textContent).endsWith('+')).toBe(false);
    }
  });

  it('round-2 polish: link buttons grow with min-h-[44px] instead of a fixed h-11 (large text cannot clip)', () => {
    mount(<LandingPage />);
    const cta = qa('a').find((a) => a.getAttribute('href')?.startsWith('/login?mode=signup'))!;
    expect(cta.className).toContain('min-h-[44px]');
    expect(cta.className).not.toMatch(/(^|\s)h-11(\s|$)/);
  });

  it('repeated clicks on the sign-up call to action (an anchor) do not change the page state', () => {
    mount(<LandingPage />);
    const before = document.body.innerHTML;
    const cta = qa('a').find((a) => a.getAttribute('href')?.startsWith('/login?mode=signup'))!;
    cta.addEventListener('click', (e) => e.preventDefault());
    for (let i = 0; i < 10; i++) click(cta);
    expect(document.body.innerHTML).toBe(before);
  });
});
