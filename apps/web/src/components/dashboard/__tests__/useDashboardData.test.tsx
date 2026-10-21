// T-520: the dashboard's parsers and data hooks.
import { act } from 'react';

import {
  parseDashboardSummary,
  parseShelfDocuments,
  SHELF_SIZE,
  useDashboardSummary,
  usePlanStatus,
  useShelfDocuments,
  type Loadable,
} from '../useDashboardData';

import { docsBody, flush, notOk, ok, PATHS, statusBody, summaryBody } from './dash-test-utils';

import { cleanupMounted, mount } from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

afterEach(() => {
  cleanupMounted();
  jest.clearAllMocks();
});

describe('parseDashboardSummary', () => {
  it('reads the bare T-506 body', () => {
    expect(parseDashboardSummary(summaryBody())).toEqual({
      draftsThisMonth: 7,
      byType: { bail_regular: 4, legal_notice: 2, plaint: 1 },
      statusCounts: { draft: 3, finalised: 2, exported: 2 },
      inkUsedThisMonth: 9,
    });
  });

  it('keeps a real zero as a zero (it is data, not a missing value)', () => {
    const p = parseDashboardSummary(
      summaryBody({
        draftsThisMonth: 0,
        byType: {},
        statusCounts: { draft: 0, finalised: 0, exported: 0 },
        inkUsedThisMonth: 0,
      }),
    );
    expect(p).not.toBeNull();
    expect(p!.draftsThisMonth).toBe(0);
    expect(p!.inkUsedThisMonth).toBe(0);
    expect(p!.byType).toEqual({});
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['an array', []],
    ['an empty object', {}],
    ['the T-508 envelope shape', { data: summaryBody() }],
    ['a missing draftsThisMonth', summaryBody({ draftsThisMonth: undefined })],
    ['a string count', summaryBody({ draftsThisMonth: '7' })],
    ['a negative count', summaryBody({ inkUsedThisMonth: -1 })],
    ['NaN', summaryBody({ draftsThisMonth: Number.NaN })],
    ['Infinity', summaryBody({ inkUsedThisMonth: Infinity })],
    ['missing statusCounts', summaryBody({ statusCounts: undefined })],
    ['a partial statusCounts', summaryBody({ statusCounts: { draft: 1, finalised: 1 } })],
    ['byType as an array', summaryBody({ byType: [] })],
    ['byType missing', summaryBody({ byType: undefined })],
  ])('rejects %s', (_name, body) => {
    expect(parseDashboardSummary(body)).toBeNull();
  });

  it('drops junk byType entries but keeps the good ones', () => {
    const p = parseDashboardSummary(
      summaryBody({ byType: { plaint: 3, bad: 'x', neg: -2, zero: 0, nan: Number.NaN } }),
    );
    expect(p!.byType).toEqual({ plaint: 3 });
  });
});

describe('parseShelfDocuments', () => {
  it('reads documents and keeps status and title', () => {
    expect(
      parseShelfDocuments({
        documents: [
          { _id: 'a', title: 'T', status: 'finalised' },
          { _id: 'b', title: 'U', status: 'exported' },
        ],
      }),
    ).toEqual([
      { _id: 'a', title: 'T', status: 'finalised' },
      { _id: 'b', title: 'U', status: 'exported' },
    ]);
  });

  it('treats an unknown status as draft and a missing title as empty', () => {
    expect(parseShelfDocuments({ documents: [{ _id: 'a', status: 'weird' }] })).toEqual([
      { _id: 'a', title: '', status: 'draft' },
    ]);
  });

  it('skips entries without a string _id and non-objects', () => {
    expect(
      parseShelfDocuments({
        documents: [null, 'x', 5, {}, { _id: '' }, { _id: 7 }, { _id: 'ok', title: 'k' }],
      }),
    ).toEqual([{ _id: 'ok', title: 'k', status: 'draft' }]);
  });

  it('gives an empty list for an empty documents array', () => {
    expect(parseShelfDocuments({ documents: [] })).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a bare array', []],
    ['no documents key', {}],
    ['documents not an array', { documents: 'x' }],
  ])('returns null for %s', (_n, body) => {
    expect(parseShelfDocuments(body)).toBeNull();
  });
});

// ── hooks ───────────────────────────────────────────────────────────────────────────────────

interface Deferred {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}
function deferredQueue() {
  const calls: Deferred[] = [];
  mockApiFetch.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        calls.push({ resolve, reject });
      }),
  );
  return calls;
}

function Probe<T>({
  hook,
  out,
}: {
  hook: () => Loadable<T>;
  out: { current: Loadable<T> | null };
}) {
  out.current = hook();
  return null;
}
function probe<T>(hook: () => Loadable<T>) {
  const out: { current: Loadable<T> | null } = { current: null };
  const m = mount(<Probe hook={hook} out={out} />);
  return { out, ...m };
}

describe('useDashboardSummary', () => {
  it('goes loading -> ready with the parsed summary, from the summary endpoint', async () => {
    mockApiFetch.mockResolvedValue(ok(summaryBody()));
    const { out } = probe(useDashboardSummary);
    expect(out.current!.status).toBe('loading');
    expect(out.current!.data).toBeNull();
    await flush();
    expect(out.current!.status).toBe('ready');
    expect(out.current!.data!.draftsThisMonth).toBe(7);
    expect(mockApiFetch).toHaveBeenCalledWith(PATHS.summary, { cache: 'no-store' });
  });

  it.each([
    ['a non-OK reply', () => Promise.resolve(notOk(500))],
    ['a network error', () => Promise.reject(new Error('offline'))],
    ['a junk body', () => Promise.resolve(ok({ nope: true }))],
    [
      'a body whose json() throws',
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('bad json');
          },
        }),
    ],
  ])('goes to error with no data on %s, without throwing', async (_n, reply) => {
    mockApiFetch.mockImplementation(reply);
    const { out } = probe(useDashboardSummary);
    await flush();
    expect(out.current!.status).toBe('error');
    expect(out.current!.data).toBeNull();
  });

  it('survives apiFetch throwing synchronously', async () => {
    mockApiFetch.mockImplementation(() => {
      throw new Error('sync boom');
    });
    const { out } = probe(useDashboardSummary);
    await flush();
    expect(out.current!.status).toBe('error');
  });

  it('keeps the last data when a reload fails, and recovers on the next good reload', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(summaryBody({ draftsThisMonth: 5 })));
    const { out } = probe(useDashboardSummary);
    await flush();
    expect(out.current!.data!.draftsThisMonth).toBe(5);

    mockApiFetch.mockResolvedValueOnce(notOk(503));
    act(() => out.current!.reload());
    await flush();
    expect(out.current!.status).toBe('error');
    expect(out.current!.data!.draftsThisMonth).toBe(5);

    mockApiFetch.mockResolvedValueOnce(ok(summaryBody({ draftsThisMonth: 6 })));
    act(() => out.current!.reload());
    await flush();
    expect(out.current!.status).toBe('ready');
    expect(out.current!.data!.draftsThisMonth).toBe(6);
  });

  it('reload keeps the old data visible while loading again', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(summaryBody({ draftsThisMonth: 5 })));
    const { out } = probe(useDashboardSummary);
    await flush();
    const calls = deferredQueue();
    act(() => out.current!.reload());
    expect(out.current!.status).toBe('loading');
    expect(out.current!.data!.draftsThisMonth).toBe(5);
    expect(calls).toHaveLength(1);
  });

  it('latest request wins: a slow older reply cannot overwrite a newer one', async () => {
    const calls = deferredQueue();
    const { out } = probe(useDashboardSummary); // request 0 (mount)
    act(() => out.current!.reload()); // request 1
    expect(calls).toHaveLength(2);

    calls[1].resolve(ok(summaryBody({ draftsThisMonth: 11 })));
    await flush();
    expect(out.current!.data!.draftsThisMonth).toBe(11);

    calls[0].resolve(ok(summaryBody({ draftsThisMonth: 1 })));
    await flush();
    expect(out.current!.data!.draftsThisMonth).toBe(11);
    expect(out.current!.status).toBe('ready');
  });

  it('latest request wins on errors too: a stale failure cannot flip a good result', async () => {
    const calls = deferredQueue();
    const { out } = probe(useDashboardSummary);
    act(() => out.current!.reload());
    calls[1].resolve(ok(summaryBody()));
    await flush();
    calls[0].reject(new Error('late failure'));
    await flush();
    expect(out.current!.status).toBe('ready');
  });

  it('a reply after unmount is ignored without errors (not observable beyond no throw/log)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const calls = deferredQueue();
    const { out, unmount } = probe(useDashboardSummary);
    const before = out.current;
    unmount();
    calls[0].resolve(ok(summaryBody()));
    await flush();
    expect(out.current).toBe(before);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('useShelfDocuments', () => {
  it('loads from /api/documents and keeps the first 8', async () => {
    mockApiFetch.mockResolvedValue(ok(docsBody(12)));
    const { out } = probe(useShelfDocuments);
    await flush();
    expect(mockApiFetch).toHaveBeenCalledWith(PATHS.documents);
    expect(out.current!.status).toBe('ready');
    expect(SHELF_SIZE).toBe(8);
    expect(out.current!.data).toHaveLength(8);
    expect(out.current!.data![0]._id).toBe('d1');
    expect(out.current!.data![7]._id).toBe('d8');
  });

  it('ready with an empty list is not an error', async () => {
    mockApiFetch.mockResolvedValue(ok({ documents: [] }));
    const { out } = probe(useShelfDocuments);
    await flush();
    expect(out.current!.status).toBe('ready');
    expect(out.current!.data).toEqual([]);
  });

  it.each([
    ['non-OK', () => Promise.resolve(notOk(500))],
    ['network', () => Promise.reject(new Error('offline'))],
    ['junk', () => Promise.resolve(ok([1, 2]))],
  ])('error on %s', async (_n, reply) => {
    mockApiFetch.mockImplementation(reply);
    const { out } = probe(useShelfDocuments);
    await flush();
    expect(out.current!.status).toBe('error');
    expect(out.current!.data).toBeNull();
  });

  it('keeps the last documents when a reload fails', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(docsBody(2)));
    const { out } = probe(useShelfDocuments);
    await flush();
    mockApiFetch.mockRejectedValueOnce(new Error('offline'));
    act(() => out.current!.reload());
    await flush();
    expect(out.current!.status).toBe('error');
    expect(out.current!.data).toHaveLength(2);
  });

  it('latest wins and no update after unmount', async () => {
    const calls = deferredQueue();
    const { out, unmount } = probe(useShelfDocuments);
    act(() => out.current!.reload());
    calls[1].resolve(ok(docsBody(3)));
    await flush();
    calls[0].resolve(ok(docsBody(1)));
    await flush();
    expect(out.current!.data).toHaveLength(3);

    act(() => out.current!.reload());
    const before = out.current;
    unmount();
    calls[2].resolve(ok(docsBody(5)));
    await flush();
    expect(out.current).toBe(before);
  });
});

describe('usePlanStatus', () => {
  it('loads the T-508 status from the envelope', async () => {
    mockApiFetch.mockResolvedValue(ok(statusBody({ tier: 'pro', status: 'active' })));
    const { out } = probe(usePlanStatus);
    expect(out.current!.status).toBe('loading');
    await flush();
    expect(out.current!.status).toBe('ready');
    expect(out.current!.data!.tier).toBe('pro');
    expect(mockApiFetch).toHaveBeenCalledWith(PATHS.status, { cache: 'no-store' });
  });

  it('errors on a non-OK reply or a bare (un-enveloped) body, and keeps data on a failed reload', async () => {
    mockApiFetch.mockResolvedValueOnce(ok({ tier: 'pro', state: 'active' }));
    const { out } = probe(usePlanStatus);
    await flush();
    expect(out.current!.status).toBe('error');

    mockApiFetch.mockResolvedValueOnce(ok(statusBody({ tier: 'solo' })));
    act(() => out.current!.reload());
    await flush();
    expect(out.current!.data!.tier).toBe('solo');

    mockApiFetch.mockResolvedValueOnce(notOk(500));
    act(() => out.current!.reload());
    await flush();
    expect(out.current!.status).toBe('error');
    expect(out.current!.data!.tier).toBe('solo');
  });
});
