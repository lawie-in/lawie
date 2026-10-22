// T-520: the KPI tiles (spec 03, copy 3.3/3.4).
import { act } from 'react';

import { ShelfKpis, typeLabel, type ShelfKpisProps } from '../ShelfKpis';
import type { LoadStatus } from '../useDashboardData';

import { flush, parsedSummary, RENEWS_ISO, RENEWS_TEXT, tile, tileText } from './dash-test-utils';

import type { SubscriptionStatus } from '@/components/billing/subscriptionStatus';
import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

beforeEach(() => {
  stubMatchMedia();
  // /api/auth/me: a verified account, so the low-Ink nudge (T-565 item 33) can show.
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { emailVerified: true } }),
  });
});
afterEach(cleanupMounted);

const planOf = (over: Partial<SubscriptionStatus> = {}): SubscriptionStatus => ({
  status: 'active',
  tier: 'solo',
  renewsAt: RENEWS_ISO,
  state: 'active',
  cancelAtCycleEnd: false,
  ...over,
});

function props(over: Partial<ShelfKpisProps> = {}): ShelfKpisProps {
  return {
    ink: { loaded: true, loading: false, totalInk: 12, monthlyAllotment: 0 },
    summary: { data: parsedSummary(), status: 'ready' as LoadStatus },
    plan: { data: planOf({ tier: 'free', status: null, renewsAt: null }), status: 'ready' },
    nudgeDismissed: false,
    onDismissNudge: jest.fn(),
    onTopUp: jest.fn(),
    ...over,
  };
}
const render = (over: Partial<ShelfKpisProps> = {}) => {
  const p = props(over);
  const m = mount(<ShelfKpis {...p} />);
  return { ...m, p };
};
const loadingSummary = { data: null, status: 'loading' as LoadStatus };
const errorSummary = { data: null, status: 'error' as LoadStatus };

const LABELS = [
  'Ink balance',
  'Drafts this month',
  'Draft and finalised',
  'Plan and renewal',
  'Ink used this month',
  'Drafts by type',
];

describe('the tiles on the grid', () => {
  it('renders the six KPI tiles with the signed labels and no time-saved tile', () => {
    const { container } = render();
    expect(qa('h2', container).map((h) => h.textContent)).toEqual(LABELS);
    expect(container.textContent).not.toMatch(/time saved|hours saved|saved/i);
  });
});

describe('tile 1: Ink balance', () => {
  it('shows "{n} Ink" once a real balance has arrived, with the inkwell', () => {
    const { container } = render();
    expect(tileText(container, 'Ink balance')).toContain('12 Ink');
    expect(tile(container, 'Ink balance')!.querySelector('svg')).not.toBeNull();
  });

  it('shows a real 0 balance as "0 Ink" (it is loaded)', () => {
    const { container } = render({
      ink: { loaded: true, loading: false, totalInk: 0, monthlyAllotment: 0 },
    });
    expect(tileText(container, 'Ink balance')).toContain('0 Ink');
  });

  it('shows a skeleton and no number while the balance is loading', () => {
    const { container } = render({
      ink: { loaded: false, loading: true, totalInk: 0, monthlyAllotment: 0 },
    });
    const t = tile(container, 'Ink balance')!;
    expect(t.querySelector('.nl-skeleton')).not.toBeNull();
    expect(t.textContent).toBe('Ink balance');
    expect(q('svg', t)).toBeNull();
  });

  it('shows only the label when the balance failed (not loaded, not loading)', () => {
    const { container } = render({
      ink: { loaded: false, loading: false, totalInk: 0, monthlyAllotment: 0 },
    });
    expect(tile(container, 'Ink balance')!.textContent).toBe('Ink balance');
    expect(tile(container, 'Ink balance')!.querySelector('.nl-skeleton')).toBeNull();
  });

  it('never shows a NaN balance as a number', () => {
    const { container } = render({
      ink: { loaded: true, loading: false, totalInk: Number.NaN, monthlyAllotment: 0 },
    });
    expect(tile(container, 'Ink balance')!.textContent).not.toMatch(/NaN/);
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it('is Ink, never a draft or document count (AC4)', () => {
    const { container } = render({
      summary: { data: parsedSummary({ draftsThisMonth: 99 }), status: 'ready' },
    });
    const t = tileText(container, 'Ink balance');
    expect(t).toContain('12 Ink');
    expect(t).not.toContain('99');
    expect(t).not.toMatch(/draft|document|remaining|\/month/i);
  });
});

describe('tiles 3, 4, 6, 7: skeleton while loading, never a zero', () => {
  it.each(['Drafts this month', 'Draft and finalised', 'Ink used this month', 'Drafts by type'])(
    '%s shows a skeleton and no digit while the summary loads',
    (label) => {
      const { container } = render({ summary: loadingSummary });
      const t = tile(container, label)!;
      expect(t.querySelector('.nl-skeleton')).not.toBeNull();
      expect(t.textContent).toBe(label);
      expect(t.textContent).not.toMatch(/\d/);
    },
  );

  it('has no "0" text node anywhere in tiles 3, 4, 6 and 7 before the summary arrives', () => {
    const { container } = render({ summary: loadingSummary });
    for (const label of [
      'Drafts this month',
      'Draft and finalised',
      'Ink used this month',
      'Drafts by type',
    ]) {
      const walker = document.createTreeWalker(tile(container, label)!, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        expect(walker.currentNode.textContent).not.toMatch(/\b0\b/);
      }
    }
    expect(container.textContent).not.toContain('No drafts yet');
  });

  it('only the label after a failed first load (no skeleton, no zero)', () => {
    const { container } = render({ summary: errorSummary });
    for (const label of [
      'Drafts this month',
      'Draft and finalised',
      'Ink used this month',
      'Drafts by type',
    ]) {
      expect(tile(container, label)!.textContent).toBe(label);
      expect(tile(container, label)!.querySelector('.nl-skeleton')).toBeNull();
    }
  });

  it('keeps the last values when a reload is in flight or has failed', () => {
    for (const status of ['loading', 'error'] as LoadStatus[]) {
      const { container, unmount } = render({ summary: { data: parsedSummary(), status } });
      expect(tileText(container, 'Drafts this month')).toContain('7');
      expect(tile(container, 'Drafts this month')!.querySelector('.nl-skeleton')).toBeNull();
      unmount();
    }
  });

  it('a real zero from the server is shown as 0, not a skeleton', () => {
    const { container } = render({
      summary: {
        data: parsedSummary({
          draftsThisMonth: 0,
          inkUsedThisMonth: 0,
          byType: {},
          statusCounts: { draft: 0, finalised: 0, exported: 0 },
        }),
        status: 'ready',
      },
    });
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month0');
    expect(tileText(container, 'Draft and finalised')).toContain(
      '0 draft, 0 finalised or exported (all time)',
    );
    expect(tileText(container, 'Ink used this month')).toContain('0 Ink');
    expect(tileText(container, 'Drafts by type')).toContain('No drafts yet');
  });
});

describe('tile 3, 4, 6, 7: ready values', () => {
  it('tile 3 shows the month count', () => {
    const { container } = render();
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month7');
  });

  it('tile 4 adds exported to finalised: "{a} draft, {b} finalised or exported (all time)"', () => {
    const { container } = render({
      summary: {
        data: parsedSummary({ statusCounts: { draft: 3, finalised: 2, exported: 4 } }),
        status: 'ready',
      },
    });
    expect(tileText(container, 'Draft and finalised')).toBe(
      'Draft and finalised3 draft, 6 finalised or exported (all time)',
    );
  });

  it('tile 6 shows "{used} Ink" with no meter on a plan with no allotment (Free)', () => {
    const { container } = render();
    const t = tile(container, 'Ink used this month')!;
    expect(t.textContent).toContain('9 Ink');
    expect(t.querySelector('[style*="width"]')).toBeNull();
  });

  it('tile 6 shows a meter scaled to the allotment when there is one', () => {
    const { container } = render({
      ink: { loaded: true, loading: false, totalInk: 41, monthlyAllotment: 50 },
      summary: { data: parsedSummary({ inkUsedThisMonth: 10 }), status: 'ready' },
    });
    const fill = tile(container, 'Ink used this month')!.querySelector(
      '[style*="width"]',
    ) as HTMLElement;
    expect(fill.style.width).toBe('20%');
  });

  it('tile 6 meter is clamped at 100% when usage exceeds the allotment', () => {
    const { container } = render({
      ink: { loaded: true, loading: false, totalInk: 1, monthlyAllotment: 50 },
      summary: { data: parsedSummary({ inkUsedThisMonth: 80 }), status: 'ready' },
    });
    const fill = tile(container, 'Ink used this month')!.querySelector(
      '[style*="width"]',
    ) as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('tile 6 has no meter until the balance has loaded (allotment unknown)', () => {
    const { container } = render({
      ink: { loaded: false, loading: true, totalInk: 0, monthlyAllotment: 50 },
    });
    expect(tile(container, 'Ink used this month')!.querySelector('[style*="width"]')).toBeNull();
  });

  it('tile 7 shows the top three types by count, largest first, with a bar each', () => {
    const { container } = render({
      summary: {
        data: parsedSummary({
          byType: { plaint: 1, bail_regular: 5, legal_notice: 3, written_statement: 2 },
        }),
        status: 'ready',
      },
    });
    const items = qa('li', tile(container, 'Drafts by type')!);
    expect(items.map((li) => li.textContent)).toEqual([
      'Bail regular5',
      'Legal notice3',
      'Written statement2',
    ]);
    const widths = items.map(
      (li) => (li.querySelector('[style*="width"]') as HTMLElement).style.width,
    );
    expect(widths).toEqual(['100%', '60%', '40%']);
  });

  it('tile 7 breaks count ties by name so the order is stable', () => {
    const { container } = render({
      summary: { data: parsedSummary({ byType: { zeta: 2, alpha: 2 } }), status: 'ready' },
    });
    expect(qa('li', tile(container, 'Drafts by type')!).map((li) => li.textContent)).toEqual([
      'Alpha2',
      'Zeta2',
    ]);
  });

  it('tile 7 says "No drafts yet" when there are none', () => {
    const { container } = render({
      summary: { data: parsedSummary({ byType: {} }), status: 'ready' },
    });
    expect(tileText(container, 'Drafts by type')).toContain('No drafts yet');
    expect(qa('li', tile(container, 'Drafts by type')!)).toHaveLength(0);
  });
});

describe('tile 5: Plan and renewal', () => {
  const t5 = (container: HTMLElement) => tileText(container, 'Plan and renewal');

  it('Free: "Free plan, no renewal"', () => {
    const { container } = render();
    expect(t5(container)).toContain('Free plan, no renewal');
    expect(t5(container)).not.toContain('renews on');
  });

  it.each([
    ['solo', 'Solo'],
    ['pro', 'Pro'],
  ] as const)('paid active %s: "{plan}, renews on {date}"', (tier, name) => {
    const { container } = render({ plan: { data: planOf({ tier }), status: 'ready' } });
    expect(t5(container)).toContain(`${name}, renews on ${RENEWS_TEXT}`);
    expect(t5(container)).not.toContain('Payment failed');
    expect(t5(container)).not.toMatch(/₹|unlimited/i);
  });

  it('cancelAtCycleEnd shows the plan with "Ends on {date}" and no "renews on"', () => {
    const { container } = render({
      plan: { data: planOf({ tier: 'pro', cancelAtCycleEnd: true }), status: 'ready' },
    });
    expect(t5(container)).toContain('Pro');
    expect(t5(container)).toContain(`Ends on ${RENEWS_TEXT}`);
    expect(t5(container)).not.toContain('renews on');
  });

  it('a plan cancelled at Razorpay but still inside its period shows "Ends on", not "renews on"', () => {
    const { container } = render({
      plan: { data: planOf({ tier: 'solo', status: 'cancelled' }), status: 'ready' },
    });
    expect(t5(container)).toContain('Solo');
    expect(t5(container)).toContain(`Ends on ${RENEWS_TEXT}`);
    expect(t5(container)).not.toContain('renews on');
  });

  it('past_due keeps the plan line and adds the "Payment failed" chip', () => {
    const { container } = render({
      plan: { data: planOf({ tier: 'solo', state: 'past_due' }), status: 'ready' },
    });
    expect(t5(container)).toContain(`Solo, renews on ${RENEWS_TEXT}`);
    expect(t5(container)).toContain('Payment failed');
  });

  it('a paid plan with no renewal date shows just the plan name (no "renews on")', () => {
    const { container } = render({
      plan: { data: planOf({ tier: 'pro', renewsAt: null }), status: 'ready' },
    });
    expect(t5(container)).toBe('Plan and renewalPro');
  });

  it('a lapsed plan reads as Free', () => {
    const { container } = render({
      plan: { data: planOf({ tier: 'pro', state: 'lapsed', status: 'expired' }), status: 'ready' },
    });
    expect(t5(container)).toContain('Free plan, no renewal');
  });

  it('shows a skeleton while loading and only the label after an error (no invented plan)', () => {
    const loading = render({ plan: { data: null, status: 'loading' } });
    expect(
      tile(loading.container, 'Plan and renewal')!.querySelector('.nl-skeleton'),
    ).not.toBeNull();
    expect(t5(loading.container)).toBe('Plan and renewal');
    loading.unmount();
    const failed = render({ plan: { data: null, status: 'error' } });
    expect(t5(failed.container)).toBe('Plan and renewal');
    expect(tile(failed.container, 'Plan and renewal')!.querySelector('.nl-skeleton')).toBeNull();
  });
});

describe('low-Ink nudge (copy 3.3)', () => {
  const nudge = (c: ParentNode) => c.querySelector('[data-low-ink]');
  // T-565 item 33: the nudge waits for GET /api/auth/me to confirm a verified account.
  const inkTile = async (ink: number, over: Partial<ShelfKpisProps> = {}) => {
    const r = render({
      ink: { loaded: true, loading: false, totalInk: ink, monthlyAllotment: 0 },
      ...over,
    });
    await flush();
    return r;
  };

  it('shows below 3 Ink: 2.5 shows, 2 shows', async () => {
    for (const n of [2.5, 2, 1]) {
      const { container, unmount } = await inkTile(n);
      expect(nudge(container)).not.toBeNull();
      expect(nudge(container)!.textContent).toContain(
        `${n} Ink left. You see the Ink cost before you generate.`,
      );
      unmount();
    }
  });

  it('does not show at exactly 3 Ink, nor above', async () => {
    for (const n of [3, 3.5, 12]) {
      const { container, unmount } = await inkTile(n);
      expect(nudge(container)).toBeNull();
      unmount();
    }
  });

  it('does not show before the balance is known (a loading 0 must not nudge)', async () => {
    const { container } = render({
      ink: { loaded: false, loading: true, totalInk: 0, monthlyAllotment: 0 },
    });
    await flush();
    expect(nudge(container)).toBeNull();
  });

  it('zero on Free: the signed "used your 5 Ink" line', async () => {
    const { container } = await inkTile(0);
    expect(nudge(container)!.textContent).toContain(
      'You have used your 5 Ink. Top up or choose a plan to keep drafting.',
    );
  });

  it('zero on a paid plan with a renewal date: the refill line with the date', async () => {
    const { container } = await inkTile(0, {
      plan: { data: planOf({ tier: 'pro' }), status: 'ready' },
    });
    expect(nudge(container)!.textContent).toContain(
      `You have no Ink left. It refills on ${RENEWS_TEXT}, or you can top up now.`,
    );
  });

  it('zero on a paid plan with no date falls back to the low line', async () => {
    const { container } = await inkTile(0, {
      plan: { data: planOf({ tier: 'pro', renewsAt: null }), status: 'ready' },
    });
    expect(nudge(container)!.textContent).toContain('0 Ink left.');
  });

  describe('zero Ink on a paid tier: the refill line only for a plan that will renew', () => {
    const LOW0 = '0 Ink left. You see the Ink cost before you generate.';
    const zero = (data: SubscriptionStatus | null, status: LoadStatus = 'ready') =>
      inkTile(0, { plan: { data, status } });
    const text = (c: ParentNode) => nudge(c)!.querySelector('p')!.textContent;

    it('active and renewing: the refill line with the date', async () => {
      const { container } = await zero(planOf({ tier: 'pro' }));
      expect(text(container)).toBe(
        `You have no Ink left. It refills on ${RENEWS_TEXT}, or you can top up now.`,
      );
    });

    it.each([
      ['cancelled at the cycle end', { cancelAtCycleEnd: true }],
      ['status cancelled', { status: 'cancelled' }],
      ['status completed', { status: 'completed' }],
      ['past due', { state: 'past_due' as const }],
    ])('%s: the Low line, no refill promise', async (_n, over) => {
      const { container } = await zero(planOf({ tier: 'solo', ...over }));
      expect(text(container)).toBe(LOW0);
      expect(container.textContent).not.toMatch(/refills/);
    });

    it('no plan data (loading or failed): the Low line, no refill promise', async () => {
      for (const status of ['loading', 'error'] as LoadStatus[]) {
        const { container, unmount } = await zero(null, status);
        expect(text(container)).toBe(LOW0);
        expect(container.textContent).not.toMatch(/refills/);
        unmount();
      }
    });

    it('Free zero line is unchanged', async () => {
      const { container } = await zero(planOf({ tier: 'free', status: null, renewsAt: null }));
      expect(text(container)).toBe(
        'You have used your 5 Ink. Top up or choose a plan to keep drafting.',
      );
    });
  });

  it('Top up, See plans and Not now are wired', async () => {
    const { container, p } = await inkTile(1);
    const buttons = qa('button', nudge(container)!);
    const topUp = buttons.find((b) => b.textContent === 'Top up')!;
    click(topUp);
    expect(p.onTopUp).toHaveBeenCalledTimes(1);
    const plans = qa('a', nudge(container)!).find(
      (a) => a.textContent === 'See plans',
    ) as HTMLAnchorElement;
    expect(plans.getAttribute('href')).toBe('/dashboard/settings');
    click(buttons.find((b) => b.textContent === 'Not now')!);
    expect(p.onDismissNudge).toHaveBeenCalledTimes(1);
  });

  it('is hidden once dismissed (nudgeDismissed)', async () => {
    const { container } = await inkTile(1, { nudgeDismissed: true });
    expect(nudge(container)).toBeNull();
    expect(tileText(container, 'Ink balance')).toContain('1 Ink');
  });
});

describe('typeLabel (tile 7 labels)', () => {
  it.each([
    ['bail_regular', 'Bail regular'],
    ['plaint', 'Plaint'],
    ['written_statement', 'Written statement'],
    ['  legal_notice ', 'Legal notice'],
    ['', ''],
  ])('%j -> %j', (id, label) => {
    expect(typeLabel(id)).toBe(label);
  });

  it('only capitalises the first letter; the rest is untouched', () => {
    expect(typeLabel('rent_ACT_case')).toBe('Rent ACT case');
  });

  it('is plain text, not a CSS capitalize class', () => {
    const { container } = render();
    expect(tile(container, 'Drafts by type')!.querySelector('.capitalize')).toBeNull();
  });
});

describe('tile skeleton motion', () => {
  const setVisibility = (v: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: v });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  };
  afterEach(() => setVisibility('visible'));

  it('the pulse pauses while the tab is hidden and resumes when it returns', () => {
    const { container } = render({ summary: loadingSummary });
    const bar = () =>
      tile(container, 'Drafts this month')!.querySelector('.nl-skeleton') as HTMLElement;
    expect(bar().style.animationPlayState).toBe('running');
    setVisibility('hidden');
    expect(bar().style.animationPlayState).toBe('paused');
    setVisibility('visible');
    expect(bar().style.animationPlayState).toBe('running');
  });

  it('a tile skeleton never prints its own "Still working…" (the page shows it once)', () => {
    jest.useFakeTimers();
    const { container } = render({ summary: loadingSummary });
    act(() => {
      jest.advanceTimersByTime(9000);
    });
    expect(container.textContent).not.toContain('Still working');
    jest.useRealTimers();
  });
});
