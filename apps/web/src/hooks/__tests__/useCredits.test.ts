// T-372: notifyCreditsChanged carries the new Ink balance (from the SSE done event) so the
// hook applies it without a refetch; no usable balance falls back to refresh().
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { notifyCreditsChanged, useCredits, type CreditBalance } from '../useCredits';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const serverBalance = { totalInk: 10, planTier: 'free' };
let latest: {
  balance: CreditBalance;
  loaded: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
} | null = null;
let container: HTMLDivElement;
let root: Root;

function Probe() {
  latest = useCredits();
  return null;
}
const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
const balanceCalls = () =>
  mockApiFetch.mock.calls.filter((c) => c[0] === '/api/credits/balance').length;

beforeEach(async () => {
  jest.clearAllMocks();
  latest = null;
  mockApiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => serverBalance });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(Probe));
  });
  await flush();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useCredits loaded', () => {
  async function remount(res: unknown) {
    act(() => root.unmount());
    latest = null;
    mockApiFetch.mockResolvedValue(res);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(Probe));
    });
    await flush();
  }

  it('is true after a successful fetch', () => {
    expect(latest?.loaded).toBe(true);
  });

  it('is false after a failed (non-OK) fetch', async () => {
    await remount({ ok: false, status: 500, json: async () => ({}) });
    expect(latest?.loaded).toBe(false);
    expect(latest?.balance.totalInk).toBe(0);
  });

  it('is true after a creditsChanged event with a finite totalInk', async () => {
    await remount({ ok: false, status: 500, json: async () => ({}) });
    expect(latest?.loaded).toBe(false);
    await act(async () => notifyCreditsChanged({ totalInk: 5 }));
    await flush();
    expect(latest?.loaded).toBe(true);
    expect(latest?.balance.totalInk).toBe(5);
  });

  it('never resets once true', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await act(async () => notifyCreditsChanged());
    await flush();
    expect(latest?.loaded).toBe(true);
  });
});

describe('useCredits stale refresh', () => {
  it('drops a response whose request started before an event-applied balance', async () => {
    let resolveOld: (v: unknown) => void = () => undefined;
    mockApiFetch.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = latest?.refresh() ?? Promise.resolve();
    });
    await act(async () => notifyCreditsChanged({ totalInk: 5 }));
    expect(latest?.balance.totalInk).toBe(5);
    await act(async () => {
      resolveOld({ ok: true, status: 200, json: async () => ({ ...serverBalance, totalInk: 9 }) });
      await pending;
    });
    await flush();
    expect(latest?.balance.totalInk).toBe(5);
  });

  it('a refresh started after the event still applies', async () => {
    await act(async () => notifyCreditsChanged({ totalInk: 5 }));
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...serverBalance, totalInk: 9 }),
    });
    await act(async () => {
      await latest?.refresh();
    });
    expect(latest?.balance.totalInk).toBe(9);
  });
});

describe('useCredits creditsChanged', () => {
  it('loads the balance on mount', () => {
    expect(balanceCalls()).toBe(1);
    expect(latest?.balance.totalInk).toBe(10);
  });

  it('applies totalInk from the event detail without a refetch', async () => {
    await act(async () => notifyCreditsChanged({ totalInk: 42 }));
    await flush();
    expect(latest?.balance.totalInk).toBe(42);
    expect(balanceCalls()).toBe(1);
  });

  it('applies a balance of 0', async () => {
    await act(async () => notifyCreditsChanged({ totalInk: 0 }));
    await flush();
    expect(latest?.balance.totalInk).toBe(0);
    expect(balanceCalls()).toBe(1);
  });

  it('refetches when called with no detail', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...serverBalance, totalInk: 7 }),
    });
    await act(async () => notifyCreditsChanged());
    await flush();
    expect(balanceCalls()).toBe(2);
    expect(latest?.balance.totalInk).toBe(7);
  });

  it.each([NaN, Infinity])('falls back to a refetch when totalInk is %p', async (totalInk) => {
    await act(async () => notifyCreditsChanged({ totalInk }));
    await flush();
    expect(balanceCalls()).toBe(2);
    expect(latest?.balance.totalInk).toBe(10);
  });

  it('falls back to a refetch when the detail has no totalInk', async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('creditsChanged', { detail: {} }));
    });
    await flush();
    expect(balanceCalls()).toBe(2);
  });
});

// T-525: a network error or a bad body never rejects (the focus and event listeners call
// refresh() with `void`, so a rejection would be unhandled).
describe('useCredits failures never reject', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (r: unknown) => unhandled.push(r);
  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
  });
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  async function remountWith(impl: () => Promise<unknown>) {
    act(() => root.unmount());
    latest = null;
    mockApiFetch.mockImplementation(impl);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(Probe));
    });
    await flush();
  }

  it('a rejecting fetch on mount leaves loaded false, balance empty and loading false', async () => {
    await remountWith(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(latest?.loaded).toBe(false);
    expect(latest?.balance.totalInk).toBe(0);
    expect(latest?.loading).toBe(false);
  });

  it('bad JSON on mount does not reject and leaves loaded false', async () => {
    await remountWith(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }));
    expect(latest?.loaded).toBe(false);
    expect(latest?.loading).toBe(false);
  });

  it('refresh() resolves (never rejects) when the network fails', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('offline'));
    await expect(latest!.refresh()).resolves.toBeUndefined();
  });

  it('a failed refresh keeps the previous balance and loaded', async () => {
    expect(latest?.balance.totalInk).toBe(10);
    mockApiFetch.mockRejectedValue(new TypeError('offline'));
    await act(async () => {
      await latest!.refresh();
    });
    expect(latest?.balance.totalInk).toBe(10);
    expect(latest?.loaded).toBe(true);
    expect(latest?.loading).toBe(false);
  });

  it('focus and a detail-less creditsChanged with a failing network raise nothing unhandled', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('offline'));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new CustomEvent('creditsChanged'));
    });
    await flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled).toEqual([]);
    expect(latest?.balance.totalInk).toBe(10);
  });
});
