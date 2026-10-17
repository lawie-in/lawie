// T-509 AC1 / AC5: the plan chooser. Free, Solo, Pro (monthly), prices and Ink from the catalogue,
// yearly hidden, signed button copy, the right planId, the switch route when a plan is live.
import { act } from 'react';

import { mount, cleanupMounted } from '@/components/ui/__tests__/nl-test-utils';
import type { SubscriptionPlan } from '@/lib/plans';

import { PlanChooser, PlanChooserSkeleton } from '../PlanChooser';

const PLANS: SubscriptionPlan[] = [
  { id: 'pro_yearly', tier: 'pro', cycle: 'yearly', priceInr: 19990, inkPerCycle: 150 },
  { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
  { id: 'solo_yearly', tier: 'solo', cycle: 'yearly', priceInr: 7990, inkPerCycle: 50 },
  { id: 'solo_monthly', tier: 'solo', cycle: 'monthly', priceInr: 799, inkPerCycle: 50 },
];

afterEach(cleanupMounted);

function chooser(over: Partial<React.ComponentProps<typeof PlanChooser>> = {}) {
  const onChoose = jest.fn();
  const onSwitch = jest.fn();
  const view = mount(
    <PlanChooser
      plans={PLANS}
      current="free"
      switchDate=""
      pendingPlanId={null}
      onChoose={onChoose}
      onSwitch={onSwitch}
      {...over}
    />,
  );
  return { ...view, onChoose, onSwitch };
}
const buttons = (c: HTMLElement) => Array.from(c.querySelectorAll('button'));
const btn = (c: HTMLElement, t: string) => buttons(c).find((b) => b.textContent?.trim() === t);
const card = (c: HTMLElement, tier: string) => c.querySelector(`[data-tier="${tier}"]`)!;

describe('T-509 PlanChooser', () => {
  it('shows Free, Solo and Pro in that order with the signed lines', () => {
    const { container } = chooser();
    const tiers = Array.from(container.querySelectorAll('[data-tier]')).map((e) =>
      e.getAttribute('data-tier'),
    );
    expect(tiers).toEqual(['free', 'solo', 'pro']);
    expect(card(container, 'free').textContent).toContain('Free');
    expect(card(container, 'free').textContent).toContain('₹0');
    expect(card(container, 'free').textContent).toContain(
      '5 Ink on sign-up, once your email is verified (one time)',
    );
    expect(card(container, 'solo').textContent).toContain('₹799 a month');
    expect(card(container, 'solo').textContent).toContain('50 Ink a month');
    expect(card(container, 'pro').textContent).toContain('₹1,999 a month');
    expect(card(container, 'pro').textContent).toContain('150 Ink a month');
  });

  it('hides yearly plans (T-399)', () => {
    const { container } = chooser();
    expect(container.textContent).not.toMatch(/year|19,990|7,990/i);
  });

  it('follows the catalogue, not constants', () => {
    const { container } = chooser({
      plans: [
        { id: 'solo_monthly', tier: 'solo', cycle: 'monthly', priceInr: 899, inkPerCycle: 60 },
        { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 2499, inkPerCycle: 200 },
      ],
    });
    expect(container.textContent).toContain('₹899 a month');
    expect(container.textContent).toContain('60 Ink a month');
    expect(container.textContent).toContain('₹2,499 a month');
    expect(container.textContent).toContain('200 Ink a month');
    expect(container.textContent).not.toContain('799');
  });

  it('a free user: Current plan on Free, Choose Solo and Choose Pro on the paid cards', () => {
    const { container } = chooser();
    expect(card(container, 'free').textContent).toContain('Current plan');
    expect(card(container, 'free').getAttribute('aria-current')).toBe('true');
    expect(btn(container, 'Choose Solo')).toBeDefined();
    expect(btn(container, 'Choose Pro')).toBeDefined();
  });

  it('Choose Solo and Choose Pro each pass their own plan (solo_monthly / pro_monthly)', () => {
    const { container, onChoose } = chooser();
    act(() => btn(container, 'Choose Solo')!.click());
    expect(onChoose).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'solo_monthly' }));
    act(() => btn(container, 'Choose Pro')!.click());
    expect(onChoose).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'pro_monthly' }));
    expect(onChoose).toHaveBeenCalledTimes(2);
  });

  it('while one subscribe call is in flight both Choose buttons are disabled', () => {
    const { container } = chooser({ pendingPlanId: 'solo_monthly' });
    expect(buttons(container).every((b) => b.disabled)).toBe(true);
  });

  it('a Solo user: Current plan on Solo, Free plan on Free, Upgrade to Pro opens the switch route', () => {
    const { container, onSwitch, onChoose } = chooser({
      current: 'solo',
      switchDate: '14 Oct 2026',
    });
    expect(card(container, 'solo').textContent).toContain('Current plan');
    expect(card(container, 'free').textContent).toContain('Free plan');
    expect(card(container, 'free').textContent).not.toContain('Current plan');
    expect(btn(container, 'Choose Pro')).toBeUndefined();
    act(() => btn(container, 'Upgrade to Pro')!.click());
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('a Pro user: Switch to Solo opens the switch route, never subscribe', () => {
    const { container, onSwitch, onChoose } = chooser({
      current: 'pro',
      switchDate: '14 Oct 2026',
    });
    expect(card(container, 'pro').textContent).toContain('Current plan');
    act(() => btn(container, 'Switch to Solo')!.click());
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('shows no signed-copy dead ends: with a paid plan live and no end date, no switch buttons', () => {
    const { container } = chooser({ current: 'pro', switchDate: '' });
    expect(btn(container, 'Switch to Solo')).toBeUndefined();
  });

  it('skeleton: three busy cards and no prices or buttons', () => {
    const { container } = mount(<PlanChooserSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(container.textContent).not.toContain('₹');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
