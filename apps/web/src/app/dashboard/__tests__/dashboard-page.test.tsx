// T-520: the "Your shelf" page: header, eight items, states, Retry, nudge wiring.
import { act } from 'react';
import { useRouter } from 'next/navigation';

import {
  advance,
  balanceBody,
  docsBody,
  flush,
  healthy,
  mountPage,
  notOk,
  ok,
  PATHS,
  routeApi,
  summaryBody,
} from './page-test-setup';

import { NEVER, tile, tileText } from '@/components/dashboard/__tests__/dash-test-utils';
import {
  cleanupMounted,
  click,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Asha Rao', email: 'a@example.com', plan: 'free' } }),
}));
const mockTopUpClose = jest.fn();
jest.mock('@/components/credits/TopUpModal', () => ({
  TopUpModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="topup-modal">
      <button
        type="button"
        onClick={() => {
          mockTopUpClose();
          onClose();
        }}
      >
        close-topup
      </button>
    </div>
  ),
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
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
});

const ERROR_LINE = 'Could not load your shelf. Your connection looks slow.';
const calls = (path: string) => mockApiFetch.mock.calls.filter(([p]) => p === path).length;
const btn = (c: ParentNode, label: string) =>
  qa('button', c).find((b) => b.textContent === label) as HTMLElement;

describe('header', () => {
  it('greets by name, titles the page and shows the IST date line', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-20T20:00:00Z'),
      doNotFake: ['nextTick', 'queueMicrotask'],
    });
    const { container } = await mountPage(mockApiFetch, healthy());
    expect(container.textContent).toContain('Hello, Asha Rao');
    expect(q('h1', container)!.textContent).toBe('Your shelf');
    // 20:00Z is already 21 Oct 01:30 in India
    expect(container.textContent).toContain('Wednesday, 21 October 2026');
  });
});

describe('the eight items', () => {
  it('shows tiles 1, 3, 4, 5, 6, 7, the shelf (2) and the command bar (8); no time-saved tile', async () => {
    const { container } = await mountPage(mockApiFetch, healthy());
    const heads = qa('h2', container).map((h) => h.textContent);
    expect(heads).toEqual([
      'Ink balance',
      'Drafts this month',
      'Draft and finalised',
      'Plan and renewal',
      'Ink used this month',
      'Drafts by type',
      'Recent documents',
    ]);
    expect(q('[role=combobox]', container)).not.toBeNull();
    expect(container.textContent).toContain('What do you need to draft?');
    expect(container.textContent).not.toMatch(/saved/i);
    expect(qa('a[href^="/dashboard/documents/"]', container)).toHaveLength(3);
  });

  it('fills the tiles from the summary', async () => {
    const { container } = await mountPage(mockApiFetch, healthy());
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month7');
    expect(tileText(container, 'Draft and finalised')).toContain('3 draft,');
    expect(tileText(container, 'Ink used this month')).toContain('9 Ink');
    expect(tileText(container, 'Drafts by type')).toContain('Bail regular4');
  });

  it('asks each endpoint once on first load', async () => {
    await mountPage(mockApiFetch, healthy());
    expect(calls(PATHS.summary)).toBe(1);
    expect(calls(PATHS.documents)).toBe(1);
    expect(calls(PATHS.status)).toBe(1);
    expect(calls(PATHS.balance)).toBe(1);
  });
});

describe('loading', () => {
  it('shows skeleton tiles and three skeleton spines, with no zero, while the data is slow', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.summary]: NEVER, [PATHS.documents]: NEVER }),
    );
    for (const l of [
      'Drafts this month',
      'Draft and finalised',
      'Ink used this month',
      'Drafts by type',
    ]) {
      expect(tile(container, l)!.querySelector('.nl-skeleton')).not.toBeNull();
      expect(tileText(container, l)).not.toMatch(/\d/);
    }
    expect(qa('li .nl-skeleton', container)).toHaveLength(3);
    expect(container.textContent).not.toContain('No drafts yet');
    expect(container.textContent).not.toContain('The shelf is empty');
    expect(container.textContent).not.toContain(ERROR_LINE);
  });

  it('says "Still working…" once, after 8 seconds of first loading, and not before', async () => {
    jest.useFakeTimers();
    const { container } = await mountPage(mockApiFetch, healthy({ [PATHS.summary]: NEVER }));
    expect(container.textContent).not.toContain('Still working…');
    await advance(7900);
    expect(container.textContent).not.toContain('Still working…');
    await advance(200);
    const text = container.textContent ?? '';
    expect(text.split('Still working…')).toHaveLength(2);
  });

  it('does not say "Still working…" when the data arrives in time', async () => {
    jest.useFakeTimers();
    const { container } = await mountPage(mockApiFetch, healthy());
    await advance(9000);
    expect(container.textContent).not.toContain('Still working…');
  });
});

describe('error and Retry', () => {
  it('a failed summary shows the signed error line with Retry; tiles keep only labels', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.summary]: async () => notOk(500) }),
    );
    expect(container.textContent).toContain(ERROR_LINE);
    expect(btn(container, 'Retry')).toBeTruthy();
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month');
    // the shelf is independent of the summary
    expect(qa('a[href^="/dashboard/documents/"]', container)).toHaveLength(3);
  });

  it('a failed documents list shows the error as well', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.documents]: () => Promise.reject(new Error('offline')) }),
    );
    expect(container.textContent).toContain(ERROR_LINE);
    expect(container.textContent).not.toContain('The shelf is empty');
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month7');
  });

  it('a failed Ink balance (non-OK) shows the error line and Retry; Retry reloads and clears it', async () => {
    let balCall = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.balance]: async () => (++balCall === 1 ? notOk(500) : ok(balanceBody(12))),
      }),
    );
    expect(container.textContent).toContain(ERROR_LINE);
    expect(btn(container, 'Retry')).toBeTruthy();
    expect(tile(container, 'Ink balance')!.textContent).toBe('Ink balance');
    click(btn(container, 'Retry'));
    await flush();
    expect(calls(PATHS.balance)).toBe(2);
    expect(container.textContent).not.toContain(ERROR_LINE);
    expect(tileText(container, 'Ink balance')).toContain('12 Ink');
  });

  it('Retry reloads summary, documents, plan and Ink; the error clears when they succeed', async () => {
    let docsCall = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.documents]: async () => (++docsCall === 1 ? notOk(503) : ok(docsBody(2))),
      }),
    );
    expect(container.textContent).toContain(ERROR_LINE);
    click(btn(container, 'Retry'));
    await flush();
    expect(calls(PATHS.summary)).toBe(2);
    expect(calls(PATHS.documents)).toBe(2);
    expect(calls(PATHS.status)).toBe(2);
    expect(calls(PATHS.balance)).toBe(2);
    expect(container.textContent).not.toContain(ERROR_LINE);
    expect(qa('a[href^="/dashboard/documents/"]', container)).toHaveLength(2);
  });

  it('tiles keep their last values when Retry fails again', async () => {
    let sumCall = 0;
    let docsCall = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.summary]: async () =>
          ++sumCall === 1 ? ok(summaryBody({ draftsThisMonth: 7 })) : notOk(500),
        [PATHS.documents]: async () => (++docsCall === 1 ? notOk(500) : ok(docsBody(1))),
      }),
    );
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month7');
    click(btn(container, 'Retry'));
    await flush();
    expect(container.textContent).toContain(ERROR_LINE);
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month7');
    expect(tile(container, 'Drafts this month')!.querySelector('.nl-skeleton')).toBeNull();
  });

  it('Retry does not blank the tiles while it is loading', async () => {
    let docsCall = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.documents]: async () => (++docsCall === 1 ? notOk(500) : ok(docsBody(1))),
      }),
    );
    routeApi(mockApiFetch, healthy({ [PATHS.summary]: NEVER, [PATHS.documents]: NEVER }));
    click(btn(container, 'Retry'));
    await flush();
    expect(tileText(container, 'Drafts this month')).toBe('Drafts this month7');
  });
});

describe('low-Ink nudge wiring', () => {
  const lowInk = healthy({ [PATHS.balance]: async () => ok(balanceBody(2)) });

  it('shows at 2 Ink, hides at 3', async () => {
    const low = await mountPage(mockApiFetch, lowInk);
    expect(low.container.querySelector('[data-low-ink]')).not.toBeNull();
    cleanupMounted();
    const three = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.balance]: async () => ok(balanceBody(3)) }),
    );
    expect(three.container.querySelector('[data-low-ink]')).toBeNull();
    cleanupMounted();
    const half = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.balance]: async () => ok(balanceBody(2.5)) }),
    );
    expect(half.container.querySelector('[data-low-ink]')).not.toBeNull();
  });

  it('Top up opens the top-up modal; closing it removes it', async () => {
    const { container } = await mountPage(mockApiFetch, lowInk);
    expect(q('[data-testid=topup-modal]')).toBeNull();
    click(btn(container, 'Top up'));
    expect(q('[data-testid=topup-modal]')).not.toBeNull();
    click(btn(document.body, 'close-topup'));
    expect(q('[data-testid=topup-modal]')).toBeNull();
    expect(mockTopUpClose).toHaveBeenCalledTimes(1);
  });

  it('Not now hides the nudge and keeps the balance', async () => {
    const { container } = await mountPage(mockApiFetch, lowInk);
    click(btn(container, 'Not now'));
    expect(container.querySelector('[data-low-ink]')).toBeNull();
    expect(tileText(container, 'Ink balance')).toContain('2 Ink');
  });

  it('a creditsChanged event with a new balance updates the tile and can raise the nudge', async () => {
    const { container } = await mountPage(mockApiFetch, healthy());
    expect(container.querySelector('[data-low-ink]')).toBeNull();
    act(() => {
      window.dispatchEvent(new CustomEvent('creditsChanged', { detail: { totalInk: 1 } }));
    });
    expect(tileText(container, 'Ink balance')).toContain('1 Ink');
    expect(container.querySelector('[data-low-ink]')).not.toBeNull();
  });
});
