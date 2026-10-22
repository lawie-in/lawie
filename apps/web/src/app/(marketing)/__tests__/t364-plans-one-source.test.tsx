// T-364 AC3/AC4: one source of plan data (PLANS in @lawie/shared). The pricing page, the home
// cards, the paywall, the upgrade-success modal and the Settings plan list all show the numbers
// billing's GET /plans serves (billing builds that response from the same PLANS).
import { PLANS } from '@lawie/shared';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PlanChooser } from '@/components/billing/PlanChooser';
import { PaywallModal } from '@/components/credits/PaywallModal';
import { UpgradeSuccessModal } from '@/components/credits/UpgradeSuccessModal';
import { type SubscriptionPlan } from '@/lib/plans';

import HomePage from '../page';
import { metadata as pricingMetadata } from '../pricing/layout';
import PricingPage from '../pricing/page';

jest.mock('@/components/marketing/SiteNav', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/SiteFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/FloatCta', () => ({ __esModule: true, default: () => null }));

const mockFetchPlans = jest.fn();
jest.mock('@/lib/plans', () => ({
  ...jest.requireActual('@/lib/plans'),
  fetchPlans: () => mockFetchPlans(),
}));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  usePrivacyDescribedBy: () => undefined,
  // T-436: the State picker waits for acceptance through this.
  onPrivacyAccepted: () => () => {},
}));
// T-436: PlanUpgrade renders a State picker, which reads the signed-in user (none here).
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  VerifyEmailCard: () => null,
  useNeedsEmailVerification: () => false,
}));
jest.mock('@/components/credits/TopUpModal', () => ({ TopUpModal: () => null }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PlanId = keyof typeof PLANS;
const IDS = ['solo_monthly', 'solo_yearly', 'pro_monthly', 'pro_yearly'] as const;

/** What billing's GET /plans serves for subscriptions: PLANS plus the id. */
const servedPlan = (id: PlanId): SubscriptionPlan => ({ id, ...PLANS[id] });
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(el: ReactElement): string {
  act(() => root.render(el));
  return container.textContent ?? '';
}

async function renderAsync(el: ReactElement): Promise<string> {
  await act(async () => {
    root.render(el);
  });
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
  return container.textContent ?? '';
}

describe('T-364 PLANS pinned', () => {
  it('has the four SKUs with the agreed numbers', () => {
    expect(Object.keys(PLANS)).toEqual([...IDS]);
    expect(PLANS.solo_monthly.priceInr).toBe(799);
    expect(PLANS.solo_yearly.priceInr).toBe(7990);
    expect(PLANS.pro_monthly.priceInr).toBe(1999);
    expect(PLANS.pro_yearly.priceInr).toBe(19990);
    expect(IDS.map((id) => PLANS[id].inkPerCycle)).toEqual([50, 50, 150, 150]);
  });
});

describe('T-364 pricing page', () => {
  it('monthly view shows the PLANS prices and Ink, with no yearly teaser (T-398 hold)', () => {
    const text = render(<PricingPage />);
    expect(text).toContain(`${inr(PLANS.solo_monthly.priceInr)} a month`);
    expect(text).toContain(`${inr(PLANS.pro_monthly.priceInr)} a month`);
    expect(text).toContain('₹799 a month');
    expect(text).toContain('₹1,999 a month');
    expect(text).toContain(`${PLANS.solo_monthly.inkPerCycle} Ink a month`);
    expect(text).toContain(`${PLANS.pro_monthly.inkPerCycle} Ink a month`);
    expect(text).toContain('50 Ink a month');
    expect(text).toContain('150 Ink a month');
  });

  it('T-398 yearly is held: no toggle, no yearly price or text anywhere', () => {
    const text = render(<PricingPage />);
    expect(container.querySelector('button[data-period="yearly"]')).toBeNull();
    expect(container.querySelector('.price-toggle')).toBeNull();
    expect(container.querySelector('.pricing-toggle-row')).toBeNull();
    expect(text).not.toMatch(/year/i);
    expect(text).not.toMatch(/yearly|annual/i);
    expect(text).not.toMatch(/save 2 months/i);
    expect(text).not.toMatch(/saved/i);
    expect(text).not.toContain(inr(PLANS.solo_yearly.priceInr));
    expect(text).not.toContain(inr(PLANS.pro_yearly.priceInr));
    expect(text).not.toContain('7,990');
    expect(text).not.toContain('19,990');
    expect(text).not.toContain('1,598');
    expect(text).not.toContain('3,998');
  });

  const card = (id: string) => container.querySelector(`[data-plan="${id}"]`) as HTMLElement;

  it('T-517 Pro card: PLANS price, Ink line, three includes, button (T-398 strings)', () => {
    render(<PricingPage />);
    const pro = card('pro');
    expect(pro).not.toBeNull();
    expect(pro.textContent).toContain(`${inr(PLANS.pro_monthly.priceInr)} a month`);
    expect(pro.textContent).toContain(`${PLANS.pro_monthly.inkPerCycle} Ink a month`);
    const rows = Array.from(pro.querySelectorAll('li')).map((l) => l.textContent?.trim());
    expect(rows).toEqual([
      'Everything in Solo',
      'Ink refills every month',
      'Top-up packs available anytime',
    ]);
    expect(pro.textContent).not.toContain('Everything in Solo, plus');
    expect(pro.querySelector('a')?.textContent?.trim()).toBe('Sign up to choose Pro');
  });

  it('T-517 Free and Solo cards: buttons, price, no yearly line', () => {
    render(<PricingPage />);
    expect(card('free').querySelector('a')?.textContent?.trim()).toBe('Start with 5 free Ink');
    expect(card('solo').querySelector('a')?.textContent?.trim()).toBe('Sign up to choose Solo');
    expect(card('solo').textContent).toContain(`${inr(PLANS.solo_monthly.priceInr)} a month`);
    expect(card('solo').textContent).not.toMatch(/year/i);
    expect(card('pro').textContent).not.toMatch(/year/i);
    expect(
      Array.from(container.querySelectorAll('[data-plan]')).map((e) => e.getAttribute('data-plan')),
    ).toEqual(['free', 'solo', 'pro']);
  });

  it('metadata description carries the Solo price and Ink from PLANS', () => {
    const d = String(pricingMetadata.description);
    expect(d).toContain(`Solo at ${inr(PLANS.solo_monthly.priceInr)}/month`);
    expect(d).toContain(`${PLANS.solo_monthly.inkPerCycle} Ink/month`);
    expect(d).toContain('Solo at ₹799/month for 50 Ink/month');
    expect(d).not.toMatch(/unlimited/i);
  });
});

describe('T-364 Settings plan list equals the pricing page (the /plans cross-check)', () => {
  it.each(IDS)('%s: Settings shows the price and Ink the pricing page shows', async (id) => {
    const served = servedPlan(id);
    mockFetchPlans.mockResolvedValue({ subscriptions: IDS.map(servedPlan), topups: [] });

    // Pricing page. Yearly is held (T-398): the page shows monthly prices only, so a yearly SKU
    // is checked for NOT appearing on the page; monthly SKUs must match Settings exactly.
    const pricingText = render(<PricingPage />);
    if (served.cycle === 'yearly') {
      expect(pricingText).not.toContain(inr(served.priceInr));
    } else {
      expect(pricingText).toContain(`${inr(served.priceInr)} a month`);
      expect(pricingText).toContain(`${served.inkPerCycle} Ink a month`);
    }
    act(() => root.unmount());
    container.remove();

    // Settings plan list for the same SKU.
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // T-509: the Settings plan chooser lists monthly plans only (yearly hidden, T-399), in the
    // same price and Ink as the pricing page, from the same /plans payload.
    const settingsText = await renderAsync(
      <PlanChooser
        plans={IDS.map(servedPlan).filter((p) => p.cycle === 'monthly')}
        current="free"
        switchDate=""
        pendingPlanId={null}
        onChoose={() => {}}
        onSwitch={() => {}}
      />,
    );
    if (served.cycle === 'yearly') {
      expect(settingsText).not.toContain(inr(served.priceInr));
    } else {
      expect(settingsText).toContain(`${inr(served.priceInr)} a month`);
      expect(settingsText).toContain(`${served.inkPerCycle} Ink a month`);
    }
    expect(settingsText).not.toMatch(/unlimited/i);
    expect(settingsText).not.toContain('₹799 Unlimited');
  });
});

describe('T-364 home, paywall, upgrade-success', () => {
  it('home shows the Free and Solo cards from PLANS and no Pro; Pro is on pricing', () => {
    const text = render(<HomePage />).replace(/\s+/g, ' ');
    expect(text).toContain(`${inr(PLANS.solo_monthly.priceInr)} a month`);
    expect(text).toContain(`${PLANS.solo_monthly.inkPerCycle} Ink a month`);
    expect(text).toContain('₹799 a month');
    expect(text).toContain('50 Ink a month');
    expect(
      Array.from(container.querySelectorAll('[data-plan]')).map((e) => e.getAttribute('data-plan')),
    ).toEqual(['free', 'solo']);
    expect(container.querySelector('[data-plan="pro"]')).toBeNull();
    expect(text).not.toMatch(/\bPro\b/);
    expect(text).not.toContain('₹1,999');
    expect(text).not.toContain('150 Ink');
    expect(text).not.toMatch(/unlimited/i);
    act(() => root.unmount());
    root = createRoot(container);
    render(<PricingPage />);
    expect(container.querySelector('[data-plan="pro"]')).not.toBeNull();
  });

  it('PaywallModal shows the Solo Ink and price from PLANS', () => {
    const text = render(
      <PaywallModal documentLabel="Bail application" cost={2} balance={0} onClose={() => {}} />,
    );
    expect(text).toContain(
      `${PLANS.solo_monthly.inkPerCycle} Ink / mo · ${inr(PLANS.solo_monthly.priceInr)}`,
    );
    expect(text).toContain('50 Ink / mo · ₹799');
    expect(text).not.toMatch(/unlimited/i);
  });

  it('UpgradeSuccessModal shows the Ink for each tier from PLANS', () => {
    const solo = render(
      <UpgradeSuccessModal planLabel="Solo" inkPerCycle={50} renewsOn="1 Nov" onClose={() => {}} />,
    );
    expect(solo).toContain(`${PLANS.solo_monthly.inkPerCycle} Ink a month`);
    expect(solo).not.toMatch(/unlimited/i);
    act(() => root.unmount());
    root = createRoot(container);
    const pro = render(
      <UpgradeSuccessModal planLabel="Pro" inkPerCycle={150} renewsOn="1 Nov" onClose={() => {}} />,
    );
    expect(pro).toContain(`${PLANS.pro_monthly.inkPerCycle} Ink a month`);
    expect(pro).toContain('150 Ink a month');
    expect(pro).not.toMatch(/unlimited/i);
  });

  it('no page says "Unlimited"', () => {
    expect(render(<PricingPage />)).not.toMatch(/unlimited/i);
    act(() => root.unmount());
    root = createRoot(container);
    expect(render(<HomePage />)).not.toMatch(/unlimited/i);
  });
});
