// T-524 page-level tests: Retry keeps focus, the greeting survives odd names, the two page
// tests that were missing (plan-status failure; rejected balance), and the "Still working…" slot.
// break-ui cases: blank / whitespace / very long unbroken / Devanagari / emoji names, one vs 40
// documents, a double-click on Retry, keyboard-only Retry.
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
  statusBody,
  summaryBody,
} from './page-test-setup';

import { tile, tileText } from '@/components/dashboard/__tests__/dash-test-utils';
import {
  cleanupMounted,
  click,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
let mockUser: { id: string; name: unknown; email: string; plan: string } | null;
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@/components/credits/TopUpModal', () => ({ TopUpModal: () => null }));
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
  window.sessionStorage.clear();
  mockUser = { id: 'u1', name: 'Asha Rao', email: 'a@example.com', plan: 'free' };
});
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
});

const ERROR_LINE = 'Could not load your shelf. Your connection looks slow.';
const btn = (c: ParentNode, label: string) =>
  qa('button', c).find((b) => b.textContent === label) as HTMLElement | undefined;
const h1 = () => q('h1') as HTMLElement;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('greeting (name edge cases)', () => {
  const greeting = (c: ParentNode) => qa('p', c).find((p) => /^Hello/.test(p.textContent ?? ''));

  it.each([
    ['empty', ''],
    ['whitespace only', '   \n\t '],
    ['not a string', null],
    ['a number', 42],
  ])('omits the greeting line for a %s name (no "Hello,")', async (_l, name) => {
    mockUser = { id: 'u1', name, email: 'a@example.com', plan: 'free' };
    const { container } = await mountPage(mockApiFetch, healthy());
    expect(greeting(container)).toBeUndefined();
    expect(container.textContent).not.toContain('Hello');
    expect(h1().textContent).toBe('Your shelf');
  });

  it('trims the name', async () => {
    mockUser = { id: 'u1', name: '  Asha Rao \n', email: 'a@example.com', plan: 'free' };
    const { container } = await mountPage(mockApiFetch, healthy());
    expect(greeting(container)!.textContent).toBe('Hello, Asha Rao');
  });

  it('a very long unbroken name wraps inside the column (min-w-0 + break-words)', async () => {
    const long = 'Bartholomew'.repeat(12);
    mockUser = { id: 'u1', name: long, email: 'a@example.com', plan: 'free' };
    const { container } = await mountPage(mockApiFetch, healthy());
    const p = greeting(container)!;
    expect(p.textContent).toBe(`Hello, ${long}`);
    expect(p.className).toContain('break-words');
    expect(p.className).toContain('min-w-0');
    expect(p.parentElement!.className).toContain('min-w-0');
  });

  it.each(['आशा राव', 'Aleksandra Wiśniewska-Kowalczyk', 'Jo', 'Asha 👩‍⚖️', 'عائشة'])(
    'renders %s verbatim',
    async (name) => {
      mockUser = { id: 'u1', name, email: 'a@example.com', plan: 'free' };
      const { container } = await mountPage(mockApiFetch, healthy());
      expect(greeting(container)!.textContent).toBe(`Hello, ${name}`);
    },
  );

  it('renders nothing without a user', async () => {
    mockUser = null;
    const { container } = await mountPage(mockApiFetch, healthy());
    expect(container.innerHTML).toBe('');
  });
});

describe('page-level plan-status failure (previously missing test a)', () => {
  it.each([
    ['a non-OK reply', async () => notOk(500)],
    ['a network error', () => Promise.reject(new Error('offline'))],
    ['a body without the envelope', async () => ok({ nope: true })],
  ])(
    'with %s and no data: the error line and Retry show; the Plan tile has only its label; Retry recovers',
    async (_l, bad) => {
      let call = 0;
      const { container } = await mountPage(
        mockApiFetch,
        healthy({
          [PATHS.status]: async () =>
            ++call === 1
              ? await bad()
              : ok(statusBody({ tier: 'pro', renewsAt: '2026-11-15T10:00:00.000Z' })),
        }),
      );
      expect(container.textContent).toContain(ERROR_LINE);
      expect(btn(container, 'Retry')).toBeTruthy();
      expect(tileText(container, 'Plan and renewal')).toBe('Plan and renewal');
      // everything else still loaded
      expect(tileText(container, 'Drafts this month')).toContain('7');
      click(btn(container, 'Retry')!);
      await flush();
      expect(container.textContent).not.toContain(ERROR_LINE);
      expect(btn(container, 'Retry')).toBeUndefined();
      expect(tileText(container, 'Plan and renewal')).toContain('Pro');
    },
  );
});

describe('a rejected Ink balance (previously missing test b)', () => {
  // A balance fetch that rejects on the first (mount) load leaves an unhandled rejection from
  // useCredits' own `void refresh()` (hooks/ is out of scope for T-524, and jest-circus fails the
  // test on it; the jsdom environment's `process` is a copy, so its listeners cannot be swapped
  // from inside a test). So the rejection is tested where the page owns it: the Retry press,
  // whose refresh promise the page catches.
  it('Retry with a balance fetch that rejects: the page does not break, keeps the error line and Retry (and focus), and a later Retry recovers', async () => {
    let call = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.balance]: async () => {
          call += 1;
          if (call === 1) return notOk(500);
          if (call === 2) throw new Error('balance down');
          return ok(balanceBody(12));
        },
      }),
    );
    expect(container.textContent).toContain(ERROR_LINE);
    const retry = btn(container, 'Retry')!;
    act(() => retry.focus());
    click(retry);
    await flush();
    expect(call).toBe(2);
    expect(container.textContent).toContain(ERROR_LINE);
    expect(document.activeElement).toBe(btn(container, 'Retry'));
    expect(tile(container, 'Ink balance')!.textContent).toBe('Ink balance');
    expect(tileText(container, 'Drafts this month')).toContain('7');
    click(btn(container, 'Retry')!);
    await flush();
    expect(container.textContent).not.toContain(ERROR_LINE);
    expect(tileText(container, 'Ink balance')).toContain('12 Ink');
    expect(document.activeElement).toBe(h1());
  });
});

describe('Retry keeps focus (keyboard-only flow)', () => {
  it('the error line stays mounted and Retry stays focused while the retry is in flight, then focus moves to the h1', async () => {
    const d = deferred<ReturnType<typeof ok>>();
    let call = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.summary]: () => (++call === 1 ? Promise.resolve(notOk(500)) : d.promise),
      }),
    );
    const retry = btn(container, 'Retry')!;
    act(() => retry.focus());
    expect(document.activeElement).toBe(retry);
    click(retry);
    await flush();
    // still loading: same button, same focus, error line mounted
    expect(btn(container, 'Retry')).toBe(retry);
    expect(document.activeElement).toBe(retry);
    expect(container.textContent).toContain(ERROR_LINE);
    await act(async () => d.resolve(ok(summaryBody())));
    await flush();
    expect(container.textContent).not.toContain(ERROR_LINE);
    expect(document.activeElement).toBe(h1());
    expect(h1().getAttribute('tabindex')).toBe('-1');
  });

  it('the error line outlives a slow ink refresh (the balance promise) too', async () => {
    const d = deferred<ReturnType<typeof ok>>();
    let call = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.balance]: () => (++call === 1 ? Promise.resolve(notOk(500)) : d.promise),
      }),
    );
    const retry = btn(container, 'Retry')!;
    act(() => retry.focus());
    click(retry);
    await flush();
    expect(container.textContent).toContain(ERROR_LINE);
    expect(document.activeElement).toBe(retry);
    await act(async () => d.resolve(ok(balanceBody(12))));
    await flush();
    expect(container.textContent).not.toContain(ERROR_LINE);
    expect(document.activeElement).toBe(h1());
  });

  it('when the retry fails again, the error line and the focus on Retry stay', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.summary]: async () => notOk(500) }),
    );
    const retry = btn(container, 'Retry')!;
    act(() => retry.focus());
    click(retry);
    await flush();
    expect(container.textContent).toContain(ERROR_LINE);
    expect(document.activeElement).toBe(btn(container, 'Retry'));
    expect(document.activeElement!.textContent).toBe('Retry');
  });

  it('if the user moved focus elsewhere while retrying, the recovery does not steal it', async () => {
    const d = deferred<ReturnType<typeof ok>>();
    let call = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.summary]: () => (++call === 1 ? Promise.resolve(notOk(500)) : d.promise) }),
    );
    const retry = btn(container, 'Retry')!;
    act(() => retry.focus());
    click(retry);
    await flush();
    const input = q('[role=combobox]', container) as HTMLInputElement;
    act(() => input.focus());
    await act(async () => d.resolve(ok(summaryBody())));
    await flush();
    expect(container.textContent).not.toContain(ERROR_LINE);
    expect(document.activeElement).toBe(input);
  });

  it('an error line that never held focus does not pull focus to the h1 when it clears', async () => {
    let call = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.summary]: async () => (++call === 1 ? notOk(500) : ok(summaryBody())) }),
    );
    expect(document.activeElement).toBe(document.body);
    // clear it via a mouse-like Retry that never focuses the button (click() does not focus in jsdom)
    click(btn(container, 'Retry')!);
    await flush();
    expect(container.textContent).not.toContain(ERROR_LINE);
    expect(document.activeElement).not.toBe(h1());
  });

  it('a double click on Retry reloads once per source per click and settles to a clean page', async () => {
    let call = 0;
    const { container } = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.summary]: async () => (++call === 1 ? notOk(500) : ok(summaryBody())) }),
    );
    const retry = btn(container, 'Retry')!;
    act(() => retry.focus());
    click(retry);
    click(retry);
    await flush();
    expect(container.textContent).not.toContain(ERROR_LINE);
    expect(qa('[role=group]', container).length).toBe(6);
    expect(document.activeElement).toBe(h1());
  });
});

describe('"Still working…" slot and tile semantics', () => {
  it('one role=status for the page sits right after the command bar and error slot, sr-only while empty', async () => {
    jest.useFakeTimers();
    routeApi(
      mockApiFetch,
      healthy({
        [PATHS.summary]: () => new Promise(() => undefined),
        [PATHS.documents]: () => new Promise(() => undefined),
      }),
    );
    const { mount } = await import('@/components/ui/__tests__/nl-test-utils');
    const DashboardPage = (await import('../page')).default;
    const { container } = mount(<DashboardPage />);
    await flush();
    const status = qa('p[role=status]', container);
    expect(status).toHaveLength(1);
    expect(status[0].className).toContain('sr-only');
    expect(status[0].textContent).toBe('');
    // after the command bar, before the first tile
    const form = q('form', container)!;
    const firstTile = q('[role=group]', container)!;
    expect(form.compareDocumentPosition(status[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      status[0].compareDocumentPosition(firstTile) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await advance(8000);
    expect(status[0].textContent).toBe('Still working…');
    expect(status[0].className).not.toContain('sr-only');
  });

  it('tiles are labelled groups whose name is their h2; no <section> is a tile', async () => {
    const { container } = await mountPage(mockApiFetch, healthy());
    const groups = qa('[role=group]', container);
    expect(groups).toHaveLength(6);
    for (const g of groups) {
      const id = g.getAttribute('aria-labelledby')!;
      const h = document.getElementById(id)!;
      expect(h.tagName).toBe('H2');
      expect(g.contains(h)).toBe(true);
    }
    const ids = groups.map((g) => g.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(6);
    // only the shelf is a section landmark
    expect(qa('section', container)).toHaveLength(1);
    expect(q('section', container)!.getAttribute('aria-labelledby')).toBe('shelf-heading');
  });

  it('1 document and 40 documents render 1 and 8 spines (the shelf cap), one vertical shelf row', async () => {
    const one = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.documents]: async () => ok(docsBody(1)) }),
    );
    expect(qa('a[href^="/dashboard/documents/"]', one.container)).toHaveLength(1);
    cleanupMounted();
    const many = await mountPage(
      mockApiFetch,
      healthy({ [PATHS.documents]: async () => ok(docsBody(40)) }),
    );
    // the shelf shows the 8 most recent (SHELF_SIZE), however many exist
    expect(qa('a[href^="/dashboard/documents/"]', many.container)).toHaveLength(8);
    expect(q('section ul', many.container)!.className).toContain('border-b-[10px]');
    expect(q('section div.overflow-x-auto', many.container)).not.toBeNull();
  });

  it('the command bar Draft is the only primary button on the dashboard (empty shelf + low Ink)', async () => {
    const { container } = await mountPage(
      mockApiFetch,
      healthy({
        [PATHS.documents]: async () => ok(docsBody(0)),
        [PATHS.balance]: async () => ok(balanceBody(1)),
      }),
    );
    const start = btn(container, 'Start your first draft')!;
    const topUp = btn(container, 'Top up')!;
    const draft = btn(container, 'Draft')!;
    expect(start && topUp && draft).toBeTruthy();
    const variant = (b: HTMLElement) => b.getAttribute('data-variant') ?? b.className;
    expect(variant(start)).toBe(variant(topUp));
    expect(variant(draft)).not.toBe(variant(start));
  });
});
