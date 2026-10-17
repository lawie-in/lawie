// T-509 AC2 / AC3: the status card. Plan, state chip, Renews on / Ends on, Cancel link.
import { act } from 'react';

import { mount, cleanupMounted } from '@/components/ui/__tests__/nl-test-utils';

import { planDate } from '../planCopy';
import type { SubscriptionStatus } from '../subscriptionStatus';
import { SubscriptionStatusCard } from '../SubscriptionStatusCard';

afterEach(cleanupMounted);

const base: SubscriptionStatus = {
  tier: 'solo',
  state: 'active',
  status: 'active',
  renewsAt: '2026-10-14T10:00:00.000Z',
  cancelAtCycleEnd: false,
};
function card(s: Partial<SubscriptionStatus>, cancelledDate?: string | null) {
  const onCancel = jest.fn();
  const view = mount(
    <SubscriptionStatusCard
      status={{ ...base, ...s }}
      onCancel={onCancel}
      cancelledDate={cancelledDate}
    />,
  );
  return { ...view, onCancel };
}
const cancelBtn = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Cancel plan');

describe('T-509 SubscriptionStatusCard', () => {
  it('Active: plan, Active chip, Renews on {date}, a working Cancel plan', () => {
    const { container, onCancel } = card({});
    expect(container.textContent).toContain('Solo');
    expect(container.textContent).toContain('Active');
    expect(container.textContent).toContain('Renews on 14 Oct 2026');
    act(() => cancelBtn(container)!.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the Pro name for a Pro plan', () => {
    expect(card({ tier: 'pro' }).container.textContent).toContain('Pro');
  });

  it('cancelAtCycleEnd: Ends on {date}, no Renews on, no Cancel plan', () => {
    const { container } = card({ cancelAtCycleEnd: true });
    expect(container.textContent).toContain('Ends on 14 Oct 2026');
    expect(container.textContent).not.toContain('Renews on');
    expect(cancelBtn(container)).toBeUndefined();
  });

  it('raw status cancelled while state is still active: Ends on, no Cancel plan', () => {
    const { container } = card({ status: 'cancelled' });
    expect(container.textContent).toContain('Ends on 14 Oct 2026');
    expect(cancelBtn(container)).toBeUndefined();
  });

  it('raw status completed while state is still active: Ends on', () => {
    expect(card({ status: 'completed' }).container.textContent).toContain('Ends on 14 Oct 2026');
  });

  it('past_due: Payment failed chip, no Active chip', () => {
    const { container } = card({ state: 'past_due', status: 'halted' });
    expect(container.textContent).toContain('Payment failed');
    expect(container.textContent).not.toMatch(/\bActive\b/);
  });

  it('lapsed: Lapsed chip and "Choose a plan to start again.", no Cancel plan, no Renews on', () => {
    const { container } = card({ state: 'lapsed', status: 'cancelled' });
    expect(container.textContent).toContain('Lapsed');
    expect(container.textContent).toContain('Choose a plan to start again.');
    expect(container.textContent).not.toContain('Renews on');
    expect(cancelBtn(container)).toBeUndefined();
  });

  it('a free user has no card', () => {
    const { container } = card({ tier: 'free' });
    expect(container.querySelector('[data-testid="subscription-status"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows the inline cancel confirmation when given the date', () => {
    const { container } = card({ cancelAtCycleEnd: true }, '14 Oct 2026');
    expect(container.textContent).toContain('Your plan will end on 14 Oct 2026.');
  });

  it('formats dates as D Mon YYYY in IST (a late-evening UTC date rolls to the next IST day)', () => {
    expect(planDate('2026-10-14T10:00:00.000Z')).toBe('14 Oct 2026');
    expect(planDate('2026-10-14T20:00:00.000Z')).toBe('15 Oct 2026');
    expect(planDate('2026-01-05T00:00:00.000Z')).toBe('5 Jan 2026');
    expect(planDate(null)).toBe('');
  });
});
