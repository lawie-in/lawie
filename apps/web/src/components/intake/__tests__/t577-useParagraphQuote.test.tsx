// T-577: the quote hook: request body, stale-answer drop, error mapping, asks:false, snapshot.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { clampParagraphs, parseParagraphQuote, useParagraphQuote } from '../useParagraphQuote';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const quoteBody = (paragraphs: number, ink: number, extra: Record<string, unknown> = {}) => ({
  asks: true,
  ink,
  min: 7,
  max: 25,
  default: 10,
  paragraphs,
  bands: [
    { from: 7, to: 10, ink: 2 },
    { from: 11, to: 18, ink: 3 },
    { from: 19, to: 25, ink: 4 },
  ],
  ceiling: true,
  ...extra,
});
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) });
const deferred = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

type Hook = ReturnType<typeof useParagraphQuote>;
let hook: Hook;
let container: HTMLDivElement;
let root: Root;
function Harness({
  enabled = true,
  kind = 'bail',
  ledgerId = 'L1',
}: {
  enabled?: boolean;
  kind?: string;
  ledgerId?: string;
}) {
  hook = useParagraphQuote({
    enabled,
    kind,
    ledgerId,
    readRequest: () => ({ kind, values: { a: 1 }, ledger_id: ledgerId }),
  });
  return null;
}
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const bodyOf = (n: number) => JSON.parse(mockApiFetch.mock.calls[n][1].body);

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

describe('parse/clamp', () => {
  it('parses both shapes and rejects malformed bodies', () => {
    expect(parseParagraphQuote({ asks: false, ink: 2 })).toEqual({ asks: false, ink: 2 });
    expect(parseParagraphQuote(quoteBody(10, 2))?.asks).toBe(true);
    for (const bad of [
      null,
      'x',
      {},
      { asks: false },
      { asks: false, ink: 0 },
      { asks: true, ink: 2 },
      quoteBody(10, 2, { min: 30 }),
      quoteBody(10, 2, { ceiling: 'yes' }),
      quoteBody(10, 2, { bands: 'x' }),
      quoteBody(10, 2, { bands: [{ from: 9, to: 3, ink: 2 }] }),
      quoteBody(10, 2, { paragraphs: 1.5 }),
    ]) {
      expect(parseParagraphQuote(bad)).toBeNull();
    }
  });
  it('clamps', () => {
    expect(clampParagraphs(2, 7, 25)).toBe(7);
    expect(clampParagraphs(99, 7, 25)).toBe(25);
    expect(clampParagraphs(12.4, 7, 25)).toBe(12);
  });
});

describe('useParagraphQuote', () => {
  it('disabled: no request, stays idle', async () => {
    await act(async () => root.render(<Harness enabled={false} />));
    await flush();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(hook.control.status).toBe('idle');
    expect(hook.snapshot()).toBeNull();
  });

  it('first request: POST paragraph-quote with kind, values, ledger_id, language en and NO paragraphs', async () => {
    mockApiFetch.mockResolvedValue(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/documents/paragraph-quote');
    expect(mockApiFetch.mock.calls[0][1].method).toBe('POST');
    expect(bodyOf(0)).toEqual({ kind: 'bail', values: { a: 1 }, ledger_id: 'L1', language: 'en' });
    expect(hook.control.status).toBe('ready');
    expect(hook.control.value).toBe(10);
    expect(hook.snapshot()).toEqual({ paragraphs: 10, expectedInk: 2 });
  });

  it('a committed change re-quotes with paragraphs (clamped); the same count does not', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(12, 3)));
    await act(async () => hook.control.onCommit(12, false));
    await flush();
    expect(bodyOf(1).paragraphs).toBe(12);
    expect(hook.snapshot()).toEqual({ paragraphs: 12, expectedInk: 3 });
    await act(async () => hook.control.onCommit(12, false));
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('typed out-of-range: clamped, quoted at the clamp, and the M4 range line set; in-range typed: no line', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(25, 4)));
    await act(async () => hook.control.onCommit(99, true));
    await flush();
    expect(bodyOf(1).paragraphs).toBe(25);
    expect(hook.control.rangeLine).toEqual({ min: 7, server: false });
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(20, 4)));
    await act(async () => hook.control.onCommit(20, true));
    await flush();
    expect(hook.control.rangeLine).toBeNull();
  });

  it('while the count differs from the quoted count, snapshot is null (no charge without a quote)', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    const d = deferred();
    mockApiFetch.mockReturnValueOnce(d.promise);
    await act(async () => hook.control.onCommit(14, false));
    expect(hook.control.status).toBe('loading');
    expect(hook.snapshot()).toBeNull();
    d.resolve(ok(quoteBody(14, 3)));
    await flush();
    expect(hook.snapshot()).toEqual({ paragraphs: 14, expectedInk: 3 });
  });

  it('a stale answer is dropped: the older response arriving last does not win', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    const first = deferred();
    const second = deferred();
    mockApiFetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await act(async () => hook.control.onCommit(12, false));
    await act(async () => hook.control.onCommit(20, false));
    second.resolve(ok(quoteBody(20, 4)));
    await flush();
    first.resolve(ok(quoteBody(12, 3)));
    await flush();
    expect(hook.control.value).toBe(20);
    expect(hook.control.quote?.ink).toBe(4);
    expect(hook.snapshot()).toEqual({ paragraphs: 20, expectedInk: 4 });
  });

  it('a stale FAILURE is dropped too', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    const first = deferred();
    mockApiFetch.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok(quoteBody(20, 4)));
    await act(async () => hook.control.onCommit(12, false));
    await act(async () => hook.control.onCommit(20, false));
    await flush();
    first.resolve(fail(500));
    await flush();
    expect(hook.control.status).toBe('ready');
  });

  it('asks:false: no stepper (asks === false), plainInk is the quote ink, snapshot undefined (send nothing)', async () => {
    mockApiFetch.mockResolvedValue(ok({ asks: false, ink: 2 }));
    await act(async () => root.render(<Harness />));
    await flush();
    expect(hook.asks).toBe(false);
    expect(hook.plainInk).toBe(2);
    expect(hook.control.quote).toBeNull();
    expect(hook.snapshot()).toBeUndefined();
  });

  it('503 -> try_again; 400/404/500, network error and bad body -> failed; nothing can charge; no snapshot', async () => {
    for (const [resp, status] of [
      [fail(503), 'try_again'],
      [fail(400), 'failed'],
      [fail(404), 'failed'],
      [fail(500), 'failed'],
      [ok({ nonsense: true }), 'failed'],
      [
        {
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('html');
          },
        },
        'failed',
      ],
    ] as const) {
      mockApiFetch.mockReset();
      mockApiFetch.mockResolvedValue(resp);
      await act(async () => root.render(<Harness kind={`k-${status}-${Math.random()}`} />));
      await flush();
      expect(hook.control.status).toBe(status);
      expect(hook.snapshot()).toBeNull();
    }
    mockApiFetch.mockReset();
    mockApiFetch.mockRejectedValue(new Error('offline'));
    await act(async () => root.render(<Harness kind="net" />));
    await flush();
    expect(hook.control.status).toBe('failed');
    expect(hook.snapshot()).toBeNull();
  });

  it('a failure after a good quote keeps the stepper value and has no snapshot; onRetry re-asks for that count', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    mockApiFetch.mockResolvedValueOnce(fail(500));
    await act(async () => hook.control.onCommit(14, false));
    await flush();
    expect(hook.control.status).toBe('failed');
    expect(hook.control.value).toBe(14);
    expect(hook.snapshot()).toBeNull();
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(14, 3)));
    await act(async () => hook.control.onRetry());
    await flush();
    expect(bodyOf(2).paragraphs).toBe(14);
    expect(hook.snapshot()).toEqual({ paragraphs: 14, expectedInk: 3 });
  });

  it('a new kind starts again from the server default (no paragraphs)', async () => {
    mockApiFetch.mockResolvedValue(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness kind="a" />));
    await flush();
    await act(async () => hook.control.onCommit(14, false));
    await flush();
    await act(async () => root.render(<Harness kind="b" />));
    await flush();
    const last = bodyOf(mockApiFetch.mock.calls.length - 1);
    expect(last.kind).toBe('b');
    expect(last).not.toHaveProperty('paragraphs');
  });

  it('applyPriceChanged with a usable ink: shows the 409 ink, keeps the value, no re-quote, flag set; clearPriceChanged clears', async () => {
    mockApiFetch.mockResolvedValue(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => hook.applyPriceChanged(3));
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(hook.control.quote?.ink).toBe(3);
    expect(hook.control.value).toBe(10);
    expect(hook.control.priceChanged).toBe(true);
    expect(hook.snapshot()).toEqual({ paragraphs: 10, expectedInk: 3 });
    await act(async () => hook.clearPriceChanged());
    expect(hook.control.priceChanged).toBe(false);
  });

  it('applyPriceChanged without usable ink re-quotes, and the flag survives that re-quote', async () => {
    mockApiFetch.mockResolvedValue(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    for (const bad of [undefined, null, 'x', 0, -1]) {
      mockApiFetch.mockClear();
      await act(async () => hook.applyPriceChanged(bad));
      await flush();
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(hook.control.priceChanged).toBe(true);
    }
  });

  it('a later successful quote (a committed change) clears the price-changed flag', async () => {
    mockApiFetch.mockResolvedValue(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => hook.applyPriceChanged(3));
    expect(hook.control.priceChanged).toBe(true);
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(12, 3)));
    await act(async () => hook.control.onCommit(12, false));
    await flush();
    expect(hook.control.priceChanged).toBe(false);
  });

  // A quote at 7 (the old floor), then the server says the floor is 8.
  async function atSeven() {
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(10, 2)));
    await act(async () => root.render(<Harness />));
    await flush();
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(7, 2)));
    await act(async () => hook.control.onCommit(7, false));
    await flush();
    expect(hook.control.value).toBe(7);
    mockApiFetch.mockClear();
  }

  it('applyRangeError: M4 line from the server min, stepper clamped into the new range and RE-QUOTED', async () => {
    await atSeven();
    const d = deferred();
    mockApiFetch.mockReturnValueOnce(d.promise);
    await act(async () => hook.applyRangeError(8));
    // before the re-quote answers: loading, no snapshot (so the refused 7 can never be sent),
    // the stepper already left 7, the M4 line shows and the floor is raised
    expect(hook.control.status).toBe('loading');
    expect(hook.snapshot()).toBeNull();
    expect(hook.control.value).toBe(8);
    expect(hook.control.rangeLine).toEqual({ min: 8, server: true });
    expect(hook.control.quote?.min).toBe(8);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).paragraphs).toBe(8);
    // the answer: ready at 8, and the M4 line is still up
    await act(async () => d.resolve(ok(quoteBody(8, 2, { min: 8 }))));
    await flush();
    expect(hook.control.status).toBe('ready');
    expect(hook.snapshot()).toEqual({ paragraphs: 8, expectedInk: 2 });
    expect(hook.control.quote?.min).toBe(8);
    expect(hook.control.rangeLine).toEqual({ min: 8, server: true });
  });

  it('applyRangeError: the line clears on the next successful quote after the re-quote', async () => {
    await atSeven();
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(8, 2, { min: 8 })));
    await act(async () => hook.applyRangeError(8));
    await flush();
    expect(hook.control.rangeLine).not.toBeNull();
    mockApiFetch.mockResolvedValueOnce(ok(quoteBody(12, 3, { min: 8 })));
    await act(async () => hook.control.onCommit(12, false));
    await flush();
    expect(hook.control.rangeLine).toBeNull();
  });

  it('applyRangeError: a count already in range is re-quoted too; a bad min falls back to the quote floor', async () => {
    await atSeven();
    mockApiFetch.mockResolvedValue(ok(quoteBody(7, 2)));
    await act(async () => hook.applyRangeError(undefined));
    await flush();
    expect(hook.control.rangeLine).toEqual({ min: 7, server: true });
    expect(hook.control.quote?.min).toBe(7);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('applyRangeError: a min above the quote max is not applied to the floor', async () => {
    await atSeven();
    mockApiFetch.mockResolvedValue(ok(quoteBody(7, 2)));
    await act(async () => hook.applyRangeError(40));
    await flush();
    expect(hook.control.quote?.min).toBe(7);
  });

  describe('a 400 from the QUOTE endpoint', () => {
    const range400 = (min: unknown, extra: Record<string, unknown> = {}) => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'paragraph_count_out_of_range', min, ...extra }),
    });

    it('paragraph_count_out_of_range with a valid min: the M4 line and ONE re-quote at the clamped count', async () => {
      await atSeven();
      mockApiFetch.mockResolvedValueOnce(range400(9, { max: 25 }));
      mockApiFetch.mockResolvedValueOnce(ok(quoteBody(9, 2, { min: 9 })));
      await act(async () => hook.control.onCommit(8, false));
      await flush();
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
      expect(bodyOf(0).paragraphs).toBe(8);
      expect(bodyOf(1).paragraphs).toBe(9);
      expect(hook.control.rangeLine).toEqual({ min: 9, server: true });
      expect(hook.control.value).toBe(9);
      expect(hook.control.status).toBe('ready');
      expect(hook.snapshot()).toEqual({ paragraphs: 9, expectedInk: 2 });
    });

    it('never the same count twice: when the clamp equals the count just sent it is failed (cost unknown), no loop', async () => {
      await atSeven();
      // the count sent (9) is already the new floor
      mockApiFetch.mockResolvedValue(range400(9, { max: 25 }));
      await act(async () => hook.control.onCommit(9, false));
      await flush();
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(hook.control.status).toBe('failed');
      expect(hook.snapshot()).toBeNull();
      expect(hook.control.rangeLine).toEqual({ min: 9, server: true });
    });

    it('if the re-quote also answers 400 the loop ends (at most two requests per press)', async () => {
      await atSeven();
      mockApiFetch.mockResolvedValue(range400(9, { max: 25 }));
      await act(async () => hook.control.onCommit(8, false));
      await flush();
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
      expect(hook.control.status).toBe('failed');
      expect(hook.snapshot()).toBeNull();
    });

    it.each([[undefined], ['9'], [0], [1.5]])(
      'a 400 with an unusable min (%p) is just failed: no line, no re-quote',
      async (min) => {
        await atSeven();
        mockApiFetch.mockResolvedValue(range400(min));
        await act(async () => hook.control.onCommit(8, false));
        await flush();
        expect(mockApiFetch).toHaveBeenCalledTimes(1);
        expect(hook.control.status).toBe('failed');
        expect(hook.control.rangeLine).toBeNull();
      },
    );

    it('a different 400 error is just failed', async () => {
      await atSeven();
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'other', min: 9 }),
      });
      await act(async () => hook.control.onCommit(8, false));
      await flush();
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(hook.control.status).toBe('failed');
      expect(hook.control.rangeLine).toBeNull();
    });
  });
});
