// T-517 AC1-AC3: the Night Library pricing page: Free / Solo / Pro from PLANS, no yearly, the
// signed intro, top-up and GST lines (AJ-511-M2, M7, M8; AJ-517-M5), the theme toggle.
import { PLANS } from '@lawie/shared';

import { PRICES_INTRO, TOP_UP_LINE } from '@/components/marketing/nl-copy';
import { cleanupMounted, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

import { metadata as pricingMetadata } from '../pricing/layout';
import PricingPage from '../pricing/page';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const GST_FAQ =
  'Yes. Prices shown include GST. After each payment we email you a GST tax invoice from Lawie, and you can download it from your account.';

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
});
afterEach(() => cleanupMounted());

const plan = (id: string) => q(`[data-plan="${id}"]`) as HTMLElement;
const text = () => norm(document.body.textContent);

describe('pricing footer', () => {
  it('keeps the Cookie settings button', () => {
    mount(<PricingPage />);
    expect(norm(q('footer button')!.textContent)).toBe('Cookie settings');
  });
});

describe('pricing page (T-517)', () => {
  it('shows Free, Solo and Pro cards in that order, with one h1', () => {
    mount(<PricingPage />);
    expect(qa('[data-plan]').map((e) => e.getAttribute('data-plan'))).toEqual([
      'free',
      'solo',
      'pro',
    ]);
    expect(qa('h1').map((h) => h.textContent)).toEqual(['Ink and prices']);
  });

  it('Free: ₹0, the one-time Ink line, includes and the button', () => {
    mount(<PricingPage />);
    const t = norm(plan('free').textContent);
    expect(t).toContain('₹0');
    expect(t).toContain('5 Ink on sign-up, once your email is verified (one time)');
    expect(t).not.toContain('(lifetime)');
    expect(qa('li', plan('free')).map((l) => norm(l.textContent))).toEqual([
      'Every document type on Lawie',
      'Every line of the draft is yours to change',
      'PDF / DOCX export',
    ]);
    expect(qa('a', plan('free'))[0].textContent).toBe('Start with 5 free Ink');
    expect(qa('a', plan('free'))[0].getAttribute('href')).toBe('/login?mode=signup');
  });

  it('Solo and Pro: prices and Ink from PLANS in the "a month" form', () => {
    mount(<PricingPage />);
    expect(norm(plan('solo').textContent)).toContain(`${inr(PLANS.solo_monthly.priceInr)} a month`);
    expect(norm(plan('solo').textContent)).toContain(
      `${PLANS.solo_monthly.inkPerCycle} Ink a month`,
    );
    expect(norm(plan('pro').textContent)).toContain(`${inr(PLANS.pro_monthly.priceInr)} a month`);
    expect(norm(plan('pro').textContent)).toContain(`${PLANS.pro_monthly.inkPerCycle} Ink a month`);
    expect(norm(plan('pro').textContent)).toContain('More Ink each month');
    expect(qa('a', plan('solo'))[0].textContent).toBe('Sign up to choose Solo');
    expect(qa('a', plan('pro'))[0].textContent).toBe('Sign up to choose Pro');
    expect(text()).toContain('₹799 a month');
    expect(text()).toContain('50 Ink a month');
  });

  it('has no yearly, annual, toggle, "unlimited", "/month" or lifetime wording', () => {
    mount(<PricingPage />);
    expect(text()).not.toMatch(/year|annual|unlimited|lifetime|save 2 months/i);
    expect(text()).not.toContain('/month');
    expect(text()).not.toContain(inr(PLANS.solo_yearly.priceInr));
    expect(text()).not.toContain(inr(PLANS.pro_yearly.priceInr));
    expect(q('[data-period]')).toBeNull();
    expect(q('[role="switch"]')).toBeNull();
  });

  it('intro carries M2 (failed draft uses no Ink) and cost-before; top-up carries M8', () => {
    mount(<PricingPage />);
    expect(text()).toContain(PRICES_INTRO.en);
    expect(text()).toContain('If a draft fails to generate, no Ink is used.');
    expect(text()).toContain('You see the Ink cost before you generate.');
    expect(text()).toContain(TOP_UP_LINE.en);
    expect(text()).toContain('Top-up Ink does not expire while your account is open.');
    expect(text()).toContain(
      'Need more? Top-up packs: ₹65 for 3 Ink, ₹199 for 10 Ink, ₹499 for 28 Ink.',
    );
  });

  it('carries the GST FAQ byte for byte and only that FAQ; the old FAQs are gone', () => {
    mount(<PricingPage />);
    expect(qa('button[aria-expanded]').map((b) => norm(b.textContent).replace(/\+$/, ''))).toEqual([
      'Is GST included?',
    ]);
    const panel = q('[role="region"]') as HTMLElement;
    expect(panel.textContent).toBe(GST_FAQ);
    expect(panel.hidden).toBe(false);
    expect(text()).not.toContain('What is Ink?');
    expect(text()).not.toContain('Most documents use 2 Ink');
    expect(text()).not.toContain('2 Ink');
  });

  it('shows "Prices include GST." under the cards', () => {
    mount(<PricingPage />);
    expect(text()).toContain('Prices include GST.');
  });

  it('has the theme toggle in the top bar and the mobile row', () => {
    mount(<PricingPage />);
    expect(qa('header fieldset').length).toBeGreaterThanOrEqual(2);
    expect(q('[data-topbar-mobile-menu] fieldset')).not.toBeNull();
    expect(
      qa('header fieldset input[type="radio"]').map((r) => (r as HTMLInputElement).value),
    ).toEqual(['night', 'daylight', 'system', 'night', 'daylight', 'system']);
  });

  it('has the footer with the grievance line, and no old SiteNav/SiteFooter', () => {
    mount(<PricingPage />);
    expect(q('[data-grievance-line]')).not.toBeNull();
    expect(q('.mk')).toBeNull();
  });

  it('metadata: Solo price and Ink from PLANS, no "unlimited"', () => {
    const d = String(pricingMetadata.description);
    expect(d).toContain(`Solo at ${inr(PLANS.solo_monthly.priceInr)}/month`);
    expect(d).not.toMatch(/unlimited/i);
  });
});
