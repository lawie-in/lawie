// T-646: the Ink history card. Balance, rows grouped by IST day, signed Ink, "Deleted document"
// (AJ-646-M5), titles only, Show more by cursor, and no "bonus" text anywhere (AJ-646-M9b).
import { act } from 'react';

import { cleanupMounted, mount, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

import { InkHistoryCard, inkEntryText, parseInkHistory } from '../InkHistoryCard';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const res = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const NOW = new Date('2026-10-28T08:00:00.000Z'); // 13:30 IST

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    createdAt: '2026-10-28T06:00:00.000Z',
    kind: 'purchase',
    label: 'topup',
    inkDelta: 50,
    balanceAfter: 80,
    documentTitle: null,
    documentDeleted: false,
    ...over,
  };
}
const page = (entries: unknown[], balance = 80, nextCursor: string | null = null) => ({
  entries,
  balance,
  nextCursor,
});
const body = () => document.body.textContent ?? '';
const btn = (name: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent === name) as
    | HTMLButtonElement
    | undefined;
const rowEls = () => Array.from(document.querySelectorAll<HTMLElement>('[role="row"]'));

async function render() {
  mount(<InkHistoryCard />);
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  jest.useFakeTimers({
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'queueMicrotask',
      'nextTick',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  jest.setSystemTime(NOW);
  window.history.replaceState(null, '', '/dashboard/settings');
  Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
  jest.restoreAllMocks();
});

describe('load', () => {
  it('requests /api/credits/history?limit=20 and shows heading and balance', async () => {
    mockApiFetch.mockResolvedValue(res(200, page([entry()], 80)));
    await render();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/credits/history?limit=20');
    expect(document.querySelector('h2')?.textContent).toBe('Ink history');
    expect(body()).toContain('Balance');
    expect(body()).toContain('80');
  });

  it('empty history', async () => {
    mockApiFetch.mockResolvedValue(res(200, page([], 0)));
    await render();
    expect(body()).toContain('No Ink activity yet.');
  });

  it.each([
    ['HTTP 500', () => res(500, {})],
    ['a body without entries', () => res(200, { data: 1 })],
    ['a balance that is not a number', () => res(200, { entries: [], balance: 'x' })],
  ])('%s shows the generic error with Retry', async (_n, make) => {
    mockApiFetch.mockImplementationOnce(async () => make());
    await render();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Something did not work. Try again.',
    );
    mockApiFetch.mockResolvedValue(res(200, page([entry()])));
    await act(async () => btn('Retry')!.click());
    await flush();
    expect(rowEls().length).toBeGreaterThan(0);
  });

  it('drops malformed entries', () => {
    const out = parseInkHistory(
      page([
        entry(),
        { id: 'x' },
        entry({ id: 'k', kind: 'weird' }),
        entry({ id: 'n', inkDelta: 'a' }),
        null,
      ]),
    );
    expect(out!.entries.map((e) => e.id)).toEqual(['e1']);
    expect(parseInkHistory(null)).toBeNull();
  });
});

describe('rows', () => {
  it('groups by IST day: Today, Yesterday, then a date', async () => {
    mockApiFetch.mockResolvedValue(
      res(
        200,
        page([
          entry({ id: 'a', createdAt: '2026-10-28T06:00:00.000Z', inkDelta: -2, balanceAfter: 78 }),
          entry({ id: 'b', createdAt: '2026-10-27T10:00:00.000Z' }),
          entry({ id: 'c', createdAt: '2026-10-20T10:00:00.000Z' }),
        ]),
      ),
    );
    await render();
    const headers = Array.from(document.querySelectorAll('[role="rowheader"]')).map(
      (h) => h.textContent,
    );
    expect(headers).toEqual(['Today', 'Yesterday', '20 Oct 2026']);
  });

  it('a UTC evening that is already the next IST day groups under that IST day', async () => {
    // 2026-10-27 19:00 UTC = 28 Oct 00:30 IST -> Today; 2026-10-27 18:00 UTC = 27 Oct 23:30 IST -> Yesterday
    mockApiFetch.mockResolvedValue(
      res(
        200,
        page([
          entry({ id: 'a', createdAt: '2026-10-27T19:00:00.000Z' }),
          entry({ id: 'b', createdAt: '2026-10-27T18:00:00.000Z' }),
        ]),
      ),
    );
    await render();
    const headers = Array.from(document.querySelectorAll('[role="rowheader"]')).map(
      (h) => h.textContent,
    );
    expect(headers).toEqual(['Today', 'Yesterday']);
  });

  it('shows the IST time, a signed change and the balance after', async () => {
    mockApiFetch.mockResolvedValue(
      res(
        200,
        page([
          entry({
            id: 'a',
            createdAt: '2026-10-28T06:00:00.000Z',
            inkDelta: -2.5,
            balanceAfter: 77.5,
            kind: 'usage',
            label: 'draft',
            documentTitle: 'Bail application',
          }),
          entry({ id: 'b', createdAt: '2026-10-28T05:00:00.000Z', inkDelta: 50, balanceAfter: 80 }),
        ]),
      ),
    );
    await render();
    const t = body();
    expect(t).toContain('11:30'); // 06:00 UTC
    expect(t).toContain('−2.5 Ink');
    expect(t).toContain('+50 Ink');
    expect(t).toContain('77.5 Ink');
  });

  it('a draft shows its title only; a deleted document shows "Deleted document"', async () => {
    mockApiFetch.mockResolvedValue(
      res(
        200,
        page([
          entry({
            id: 'a',
            kind: 'usage',
            label: 'draft',
            inkDelta: -2,
            documentTitle: 'Bail application Ram Kumar',
          }),
          entry({
            id: 'b',
            kind: 'usage',
            label: 'draft',
            inkDelta: -2,
            documentTitle: null,
            documentDeleted: true,
          }),
          entry({
            id: 'c',
            kind: 'usage',
            label: 'draft',
            inkDelta: -2,
            documentTitle: null,
            documentDeleted: false,
          }),
        ]),
      ),
    );
    await render();
    expect(body()).toContain('Draft: Bail application Ram Kumar');
    expect(body()).toContain('Deleted document');
    // a deleted document's old title is not shown even if the server sent one
    const out = parseInkHistory(
      page([entry({ kind: 'usage', documentTitle: 'Old title', documentDeleted: true })]),
    )!;
    expect(inkEntryText(out.entries[0])).toBe('Deleted document');
    expect(inkEntryText({ ...out.entries[0], documentDeleted: false, documentTitle: null })).toBe(
      'Draft',
    );
  });

  it.each([
    ['topup', 'Top-up'],
    ['plan', 'Plan Ink'],
    ['plan_ink_ended', 'Plan Ink ended'],
    ['plan_ended', 'Plan ended'],
    ['signup', 'Sign-up Ink'],
    ['referral', 'Referral Ink'],
    ['coupon', 'Coupon Ink'],
    ['admin_grant', 'Ink from Lawie'],
    ['test_grant', 'Test Ink'],
    ['refund_reversal', 'Refund'],
    ['other', 'Other'],
    ['something_unknown', 'Other'],
  ])('label %s reads "%s"', (label, text) => {
    const e = parseInkHistory(page([entry({ label })]))!.entries[0];
    expect(inkEntryText(e)).toBe(text);
  });

  it('no row, label or heading says "bonus" (AJ-646-M9b)', async () => {
    mockApiFetch.mockResolvedValue(
      res(
        200,
        page(
          [
            'topup',
            'plan',
            'signup',
            'referral',
            'coupon',
            'admin_grant',
            'refund_reversal',
            'other',
          ].map((label, i) => entry({ id: `x${i}`, label })),
        ),
      ),
    );
    await render();
    expect(body().toLowerCase()).not.toContain('bonus');
  });
});

describe('Show more', () => {
  it('appears only with a cursor, fetches the next page and drops duplicates', async () => {
    mockApiFetch.mockImplementation(async (path: string) =>
      path.includes('cursor=e2')
        ? res(
            200,
            page(
              [entry({ id: 'e2' }), entry({ id: 'e3', createdAt: '2026-10-20T10:00:00.000Z' })],
              80,
              null,
            ),
          )
        : res(200, page([entry({ id: 'e1' }), entry({ id: 'e2' })], 80, 'e2')),
    );
    await render();
    expect(
      rowEls().filter((r) => r.getAttribute('role') === 'row' && r.querySelector('[role="cell"]')),
    ).toHaveLength(2);
    await act(async () => btn('Show more')!.click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/credits/history?limit=20&cursor=e2');
    expect(rowEls().filter((r) => r.querySelector('[role="cell"]'))).toHaveLength(3);
    expect(btn('Show more')).toBeUndefined();
  });

  it('a failed next page shows the error and keeps the rows and the button', async () => {
    mockApiFetch.mockImplementation(async (path: string) =>
      path.includes('cursor=') ? res(500, {}) : res(200, page([entry({ id: 'e1' })], 80, 'e1')),
    );
    await render();
    await act(async () => btn('Show more')!.click());
    await flush();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Something did not work. Try again.',
    );
    expect(btn('Show more')).toBeDefined();
    expect(body()).toContain('Top-up');
  });
});

describe('deep link', () => {
  it('#ink scrolls to the card once loaded', async () => {
    window.history.replaceState(null, '', '/dashboard/settings#ink');
    mockApiFetch.mockResolvedValue(res(200, page([entry()])));
    await render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
