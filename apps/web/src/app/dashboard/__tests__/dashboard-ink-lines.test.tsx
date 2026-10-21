// T-372 (ADR-025 D3), carried over to the Night Library shelf (T-520): the dashboard shows Ink,
// never a document-count entitlement, and never shows a loading 0 as a balance.
import { useRouter } from 'next/navigation';

import {
  balanceBody,
  flush,
  healthy,
  mountPage,
  notOk,
  ok,
  PATHS,
  statusBody,
  summaryBody,
} from './page-test-setup';

import { NEVER, tile, tileText } from '@/components/dashboard/__tests__/dash-test-utils';
import { cleanupMounted, click, qa, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Asha Rao', email: 'a@example.com', plan: 'free' } }),
}));
jest.mock('@/components/credits/TopUpModal', () => ({
  TopUpModal: () => <div data-testid="topup-modal" />,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const push = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  (useRouter as jest.Mock).mockReturnValue({ push });
});
afterEach(cleanupMounted);

const inkTile = (c: HTMLElement) => tileText(c, 'Ink balance');

describe('T-372 Ink lines: free user with documents', () => {
  it('shows "12 Ink" in the Ink tile and no document-count entitlement anywhere', async () => {
    const { container } = await mountPage(mockApiFetch, healthy());
    expect(inkTile(container)).toContain('12 Ink');
    const all = container.textContent ?? '';
    expect(all).not.toMatch(/remaining/i);
    expect(all).not.toMatch(/free documents?/i);
    expect(all).not.toMatch(/documents\/month/i);
    expect(all).not.toMatch(/documents used/i);
    expect(all).not.toMatch(/\d+ of \d+ documents/i);
    expect(all).not.toContain('You have 12 Ink'); // the legacy sentence is gone
  });

  it('shows "0 Ink" for a real server balance of 0', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.balance]: async () => ok(balanceBody(0)) }),
    );
    expect(inkTile(container)).toContain('0 Ink');
  });

  it('leaves the balance out (label only) when the balance fetch fails', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.balance]: async () => notOk(500) }),
    );
    expect(inkTile(container)).toBe('Ink balance');
    expect(tile(container, 'Ink balance')!.querySelector('.nl-skeleton')).toBeNull();
  });

  // A rejecting balance request is not tested here: hooks/useCredits.refresh has try/finally with
  // no catch, so the mount-time `void refresh()` leaks an unhandled rejection (reported, not fixed).

  it('shows a skeleton, never "0 Ink", and no nudge while the balance is still loading', async () => {
    const { container } = await mountPage(mockApiFetch, healthy({ [PATHS.balance]: NEVER }));
    expect(inkTile(container)).toBe('Ink balance');
    expect(tile(container, 'Ink balance')!.querySelector('.nl-skeleton')).not.toBeNull();
    expect(container.querySelector('[data-low-ink]')).toBeNull();
    expect(container.textContent).not.toContain('0 Ink left');
  });

  it('is Ink, not a draft count: many drafts this month do not change the Ink line', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.summary]: async () => ok(summaryBody({ draftsThisMonth: 41 })) }),
    );
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month41');
    expect(inkTile(container)).toBe('Ink balance12 Ink');
  });
});

describe('T-372 Ink lines: empty shelf', () => {
  const emptyDocs = { [PATHS.documents]: async () => ok({ documents: [] }) };

  it('shows the signed empty state and the Ink balance, with no /month and no entitlement', async () => {
    const { container } = await mountPage(mockApiFetch, healthy(emptyDocs));
    expect(container.textContent).toContain('The shelf is empty');
    expect(inkTile(container)).toContain('12 Ink');
    expect(container.textContent).not.toContain('/month');
    expect(container.textContent).not.toMatch(/free documents?/i);
    expect(container.textContent).not.toMatch(/documents\/month/i);
  });

  it('shows "0 Ink" for a real server 0 alongside the empty state', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ ...emptyDocs, [PATHS.balance]: async () => ok(balanceBody(0)) }),
    );
    expect(container.textContent).toContain('The shelf is empty');
    expect(inkTile(container)).toContain('0 Ink');
  });

  it('drops the Ink figure when the balance is unknown but still shows the empty state', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ ...emptyDocs, [PATHS.balance]: async () => notOk(500) }),
    );
    expect(container.textContent).toContain('The shelf is empty');
    expect(inkTile(container)).toBe('Ink balance');
  });

  it('"Start your first draft" goes to /dashboard/new', async () => {
    const { container } = await mountPage(mockApiFetch, healthy(emptyDocs));
    click(qa('button', container).find((b) => b.textContent === 'Start your first draft')!);
    expect(push).toHaveBeenCalledWith('/dashboard/new');
  });
});

describe('zero Ink nudge on the page', () => {
  it('a Free user at 0 sees the signed "used your 5 Ink" line once the plan is known', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.balance]: async () => ok(balanceBody(0)),
        [PATHS.status]: async () => ok(statusBody()),
      }),
    );
    expect(container.querySelector('[data-low-ink]')!.textContent).toContain(
      'You have used your 5 Ink. Top up or choose a plan to keep drafting.',
    );
    await flush();
  });
});
