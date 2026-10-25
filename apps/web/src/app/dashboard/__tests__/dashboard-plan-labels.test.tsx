// T-370 (plan label rules), carried over to the Night Library shelf (T-520): the plan and its
// renewal come from billing's status (T-508), never from constants; prices and "unlimited" never
// appear; an unknown plan is left out, not guessed.
import { useRouter } from 'next/navigation';

import { balanceBody, healthy, mountPage, notOk, ok, PATHS, statusBody } from './page-test-setup';

import {
  NEVER,
  RENEWS_ISO,
  RENEWS_TEXT,
  tile,
  tileText,
} from '@/components/dashboard/__tests__/dash-test-utils';
import { cleanupMounted, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Asha Rao', email: 'a@example.com', plan: 'pro' } }),
}));
jest.mock('@/components/credits/TopUpModal', () => ({ TopUpModal: () => null }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
});
afterEach(cleanupMounted);

const planTile = (c: HTMLElement) => tileText(c, 'Plan and renewal');
const withStatus = (body: unknown) => healthy({ [PATHS.status]: async () => ok(body) });

describe('T-370 plan tile: Free user', () => {
  it('reads "Free plan, no renewal"; no price, no upgrade price, no unlimited', async () => {
    const { container } = await mountPage(mockApiFetch, withStatus(statusBody()));
    expect(planTile(container)).toBe('Plan and renewalFree plan, no renewal');
    expect(container.textContent).not.toContain('₹');
    expect(container.textContent).not.toMatch(/unlimited/i);
    expect(container.textContent).not.toMatch(/Upgrade to Pro/);
  });

  it('a user whose subscription lapsed reads as Free, whatever the auth plan says', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      withStatus(statusBody({ tier: 'pro', state: 'lapsed', status: 'expired' })),
    );
    expect(planTile(container)).toContain('Free plan, no renewal');
  });
});

describe('T-370 plan tile: paid user', () => {
  it('Pro: "Pro, renews on {date}" from the status; no Ink figure invented, no unlimited', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      withStatus(statusBody({ tier: 'pro', status: 'active', renewsAt: RENEWS_ISO })),
    );
    expect(planTile(container)).toBe(`Plan and renewalPro, renews on ${RENEWS_TEXT}`);
    expect(container.textContent).not.toMatch(/unlimited/i);
    expect(container.textContent).not.toContain('₹');
    expect(container.textContent).not.toMatch(/150 Ink|Ink\/month|Ink a month/);
  });

  it('Solo: "Solo, renews on {date}"', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      withStatus(statusBody({ tier: 'solo', status: 'active', renewsAt: RENEWS_ISO })),
    );
    expect(planTile(container)).toContain(`Solo, renews on ${RENEWS_TEXT}`);
  });

  it('the renewal date follows the status, not a constant', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      withStatus(
        statusBody({ tier: 'pro', status: 'active', renewsAt: '2027-01-02T10:00:00.000Z' }),
      ),
    );
    expect(planTile(container)).toContain('renews on 2 Jan 2027');
    expect(planTile(container)).not.toContain(RENEWS_TEXT);
  });

  it('cancelAtCycleEnd: plan name and "Ends on {date}", no renewal', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      withStatus(
        statusBody({ tier: 'pro', status: 'active', renewsAt: RENEWS_ISO, cancelAtCycleEnd: true }),
      ),
    );
    expect(planTile(container)).toContain('Pro');
    expect(planTile(container)).toContain(`Ends on ${RENEWS_TEXT}`);
    expect(planTile(container)).not.toContain('renews on');
  });

  it('past_due: still the plan, with the "Payment failed" chip', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      withStatus(
        statusBody({ tier: 'solo', status: 'halted', state: 'past_due', renewsAt: RENEWS_ISO }),
      ),
    );
    expect(planTile(container)).toContain('Solo');
    expect(planTile(container)).toContain('Payment failed');
  });

  it('Ink balance and plan are independent: a Pro balance does not show a plan tile for Free', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.balance]: async () => ok(balanceBody(150, 150)),
        [PATHS.status]: async () =>
          ok(statusBody({ tier: 'pro', status: 'active', renewsAt: RENEWS_ISO })),
      }),
    );
    expect(tileText(container, 'Ink balance')).toContain('150 Ink');
    expect(planTile(container)).toContain('Pro, renews on');
  });
});

describe('T-370 plan tile: unknown plan', () => {
  it('shows a skeleton and no plan name while the status is loading', async () => {
    const { container } = await mountPage(mockApiFetch, healthy({ [PATHS.status]: NEVER }));
    expect(planTile(container)).toBe('Plan and renewal');
    expect(tile(container, 'Plan and renewal')!.querySelector('.nl-skeleton')).not.toBeNull();
    expect(container.textContent).not.toContain('₹');
  });

  it.each([
    ['a non-OK reply', async () => notOk(500)],
    ['a network error', () => Promise.reject(new Error('offline'))],
    ['a body without the envelope', async () => ok({ tier: 'pro', state: 'active' })],
    ['an unknown tier', async () => ok(statusBody({ tier: 'platinum' as never }))],
  ])('shows only the label after %s: no guessed plan, no price', async (_n, reply) => {
    const { container } = await mountPage(mockApiFetch, healthy({ [PATHS.status]: reply }));
    expect(planTile(container)).toBe('Plan and renewal');
    expect(tile(container, 'Plan and renewal')!.querySelector('.nl-skeleton')).toBeNull();
    expect(container.textContent).not.toMatch(/Pro|Solo|Free plan|₹|unlimited/);
    // no plan data after a failed status: the page says so with the signed error line, while
    // the tile itself keeps only its label and the other tiles still show
    expect(container.textContent).toContain(
      'Could not load your shelf. Your connection looks slow.',
    );
    expect(container.textContent).toContain('Retry');
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month7');
  });
});
