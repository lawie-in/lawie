// T-436 (c) AC6: the Invoices card. Strings are t436-ui-strings.md section B, exact.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { InvoicesCard } from '../InvoicesCard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
const mockDownloadBlob = jest.fn();
jest.mock('@/lib/download', () => ({
  downloadBlob: (...a: unknown[]) => mockDownloadBlob(...a),
}));

let container: HTMLDivElement;
let root: Root;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

async function mount() {
  await act(async () => {
    root.render(<InvoicesCard />);
  });
  await flush();
}

const listRes = (data: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => data,
});
const inv = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  number: 'LAW-2026-27-0001',
  kind: 'invoice',
  issuedAt: '2026-10-14T06:00:00.000Z',
  total: 79900,
  originalInvoiceNumber: null,
  ...over,
});
const many = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    inv({ id: `i${i}`, number: `LAW-2026-27-${String(i + 1).padStart(4, '0')}` }),
  );
const rowsEls = () => Array.from(container.querySelectorAll('ul[aria-label] > li'));
const btn = (re: RegExp) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => re.test(b.textContent ?? '') || re.test(b.getAttribute('aria-label') ?? ''),
  ) as HTMLButtonElement | undefined;

beforeEach(() => {
  mockApiFetch.mockReset();
  mockDownloadBlob.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

describe('InvoicesCard states', () => {
  it('requests GET /api/billing/invoices and shows the heading', async () => {
    mockApiFetch.mockResolvedValue(listRes({ data: [] }));
    await mount();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/billing/invoices');
    expect(container.querySelector('h2')?.textContent).toBe('Invoices');
  });

  it('loading: visually hidden role=status "Loading invoices…"', async () => {
    mockApiFetch.mockReturnValue(new Promise(() => undefined));
    await mount();
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toBe('Loading invoices…');
    expect(status?.className).toContain('sr-only');
  });

  it('empty: "No invoices yet"', async () => {
    mockApiFetch.mockResolvedValue(listRes({ data: [] }));
    await mount();
    expect(container.textContent).toContain('No invoices yet');
    expect(rowsEls()).toHaveLength(0);
  });

  it('error: message plus Try again, which reloads', async () => {
    mockApiFetch.mockResolvedValueOnce(listRes({}, false));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not load your invoices.',
    );
    mockApiFetch.mockResolvedValueOnce(listRes({ data: [inv()] }));
    await act(async () => btn(/^Try again$/)!.click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(rowsEls()).toHaveLength(1);
  });

  it('network failure is an error state, not a crash', async () => {
    mockApiFetch.mockRejectedValue(new Error('down'));
    await mount();
    expect(container.textContent).toContain('Could not load your invoices.');
    expect(btn(/^Try again$/)).toBeDefined();
  });

  it.each([
    ['null body', null],
    ['no data key', {}],
    ['data is an object', { data: { a: 1 } }],
    ['data is a string', { data: 'x' }],
  ])('unexpected shape (%s) shows the error state', async (_n, body) => {
    mockApiFetch.mockResolvedValue(listRes(body));
    await mount();
    expect(container.textContent).toContain('Could not load your invoices.');
    expect(btn(/^Try again$/)).toBeDefined();
  });

  it('non-JSON body is the error state', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad');
      },
    });
    await mount();
    expect(container.textContent).toContain('Could not load your invoices.');
  });

  it('malformed rows are skipped, good rows still render', async () => {
    mockApiFetch.mockResolvedValue(
      listRes({
        data: [null, { id: 1 }, inv({ total: 'x' }), inv({ id: 'ok', number: 'LAW-OK' })],
      }),
    );
    await mount();
    expect(rowsEls()).toHaveLength(1);
    expect(container.textContent).toContain('LAW-OK');
  });
});

describe('InvoicesCard rows', () => {
  it('renders in API order (newest first), list labelled', async () => {
    mockApiFetch.mockResolvedValue(
      listRes({
        data: [
          inv({ id: 'a', number: 'LAW-2026-27-0003' }),
          inv({ id: 'b', number: 'LAW-2026-27-0002' }),
          inv({ id: 'c', number: 'LAW-2026-27-0001' }),
        ],
      }),
    );
    await mount();
    expect(container.querySelector('ul[aria-label]')?.getAttribute('aria-label')).toBe(
      'Invoices, newest first',
    );
    const texts = rowsEls().map((r) => r.textContent ?? '');
    expect(texts[0]).toContain('0003');
    expect(texts[1]).toContain('0002');
    expect(texts[2]).toContain('0001');
  });

  it('amounts are rupees from paise: ₹799, ₹1,299, ₹12,999, ₹799.50', async () => {
    mockApiFetch.mockResolvedValue(
      listRes({
        data: [
          inv({ id: 'a', total: 79900 }),
          inv({ id: 'b', total: 129900 }),
          inv({ id: 'c', total: 1299900 }),
          inv({ id: 'd', total: 79950 }),
        ],
      }),
    );
    await mount();
    const t = rowsEls().map((r) => r.textContent ?? '');
    expect(t[0]).toContain('₹799');
    expect(t[0]).not.toContain('₹799.');
    expect(t[1]).toContain('₹1,299');
    expect(t[2]).toContain('₹12,999');
    expect(t[3]).toContain('₹799.50');
  });

  it('dates are IST: 14 Oct 2026 06:00Z is 14 Oct; 14 Oct 20:00Z is 15 Oct; 31 Dec 19:00Z is 1 Jan', async () => {
    mockApiFetch.mockResolvedValue(
      listRes({
        data: [
          inv({ id: 'a', issuedAt: '2026-10-14T06:00:00.000Z' }),
          inv({ id: 'b', issuedAt: '2026-10-14T20:00:00.000Z' }),
          inv({ id: 'c', issuedAt: '2026-12-31T19:00:00.000Z' }),
          inv({ id: 'd', issuedAt: '2026-09-05T06:00:00.000Z' }),
        ],
      }),
    );
    await mount();
    const times = Array.from(container.querySelectorAll('time')).map((t) => t.textContent);
    expect(times).toEqual(['14 Oct 2026', '15 Oct 2026', '1 Jan 2027', '5 Sep 2026']);
  });

  it('invoice row: no badge, no "Against invoice", aria-label "Download invoice {n} as PDF"', async () => {
    mockApiFetch.mockResolvedValue(listRes({ data: [inv()] }));
    await mount();
    expect(container.textContent).not.toContain('Credit note');
    expect(container.textContent).not.toContain('Against invoice');
    const b = container.querySelector('li button')!;
    expect(b.getAttribute('aria-label')).toBe('Download invoice LAW-2026-27-0001 as PDF');
    expect(b.textContent).toBe('PDF');
  });

  it('credit note row: badge, "Against invoice {n}", positive amount, its own aria-label', async () => {
    mockApiFetch.mockResolvedValue(
      listRes({
        data: [
          inv({
            id: 'cn1',
            number: 'LAW-CN-2026-27-0001',
            kind: 'credit_note',
            total: 79900,
            originalInvoiceNumber: 'LAW-2026-27-0001',
          }),
        ],
      }),
    );
    await mount();
    const text = rowsEls()[0].textContent ?? '';
    expect(text).toContain('Credit note');
    expect(text).toContain('Against invoice LAW-2026-27-0001');
    expect(text).toContain('₹799');
    expect(text).not.toContain('-₹');
    expect(container.querySelector('li button')!.getAttribute('aria-label')).toBe(
      'Download credit note LAW-CN-2026-27-0001 as PDF',
    );
  });

  it('credit note with null original: badge shown, "Against invoice" omitted', async () => {
    mockApiFetch.mockResolvedValue(
      listRes({ data: [inv({ kind: 'credit_note', originalInvoiceNumber: null })] }),
    );
    await mount();
    expect(container.textContent).toContain('Credit note');
    expect(container.textContent).not.toContain('Against invoice');
  });
});

describe('InvoicesCard PDF download', () => {
  it('fetches the PDF route via apiFetch and saves the blob under billing filename', async () => {
    mockApiFetch.mockResolvedValueOnce(listRes({ data: [inv({ id: 'abc123' })] }));
    await mount();
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    mockApiFetch.mockResolvedValueOnce({ ok: true, status: 200, blob: async () => blob });
    await act(async () => btn(/Download invoice/)!.click());
    await flush();
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/billing/invoices/abc123/pdf');
    expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
    expect(mockDownloadBlob).toHaveBeenCalledWith(blob, 'LAW-2026-27-0001.pdf');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('credit note filename replaces characters outside A-Za-z0-9-', async () => {
    mockApiFetch.mockResolvedValueOnce(
      listRes({ data: [inv({ id: 'x', number: 'LAW/CN 2026_27.1', kind: 'credit_note' })] }),
    );
    await mount();
    const blob = new Blob(['x']);
    mockApiFetch.mockResolvedValueOnce({ ok: true, status: 200, blob: async () => blob });
    await act(async () => btn(/Download credit note/)!.click());
    await flush();
    expect(mockDownloadBlob).toHaveBeenCalledWith(blob, 'LAW-CN-2026-27-1.pdf');
  });

  it('failure (non-ok): inline role=alert with exact text, no download', async () => {
    mockApiFetch.mockResolvedValueOnce(listRes({ data: [inv()] }));
    await mount();
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await act(async () => btn(/Download invoice/)!.click());
    await flush();
    const alert = container.querySelector('li [role="alert"]');
    expect(alert?.textContent).toBe('We could not download this invoice. Please try again.');
    expect(mockDownloadBlob).not.toHaveBeenCalled();
  });

  it('failure (network): same alert; cleared on the next attempt, not left after success', async () => {
    mockApiFetch.mockResolvedValueOnce(listRes({ data: [inv()] }));
    await mount();
    mockApiFetch.mockRejectedValueOnce(new Error('offline'));
    await act(async () => btn(/Download invoice/)!.click());
    await flush();
    expect(container.querySelector('li [role="alert"]')?.textContent).toBe(
      'We could not download this invoice. Please try again.',
    );
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: async () => new Blob(['x']),
    });
    await act(async () => btn(/Download invoice/)!.click());
    await flush();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
  });

  it('the alert is cleared as soon as the next attempt starts (while pending)', async () => {
    mockApiFetch.mockResolvedValueOnce(listRes({ data: [inv()] }));
    await mount();
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await act(async () => btn(/Download invoice/)!.click());
    await flush();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    mockApiFetch.mockReturnValueOnce(new Promise(() => undefined));
    await act(async () => btn(/Download invoice/)!.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('the alert shows only on the failed row', async () => {
    mockApiFetch.mockResolvedValueOnce(
      listRes({ data: [inv({ id: 'a', number: 'N-A' }), inv({ id: 'b', number: 'N-B' })] }),
    );
    await mount();
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await act(async () => btn(/invoice N-B as PDF/)!.click());
    await flush();
    const lis = rowsEls();
    expect(lis[0].querySelector('[role="alert"]')).toBeNull();
    expect(lis[1].querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe('InvoicesCard Show more', () => {
  it('12 rows or fewer: no Show more', async () => {
    mockApiFetch.mockResolvedValue(listRes({ data: many(12) }));
    await mount();
    expect(rowsEls()).toHaveLength(12);
    expect(btn(/^Show more$/)).toBeUndefined();
  });

  it('13 rows: 12 shown, Show more aria-expanded=false; click shows all, true, polite "1 more invoices shown"', async () => {
    mockApiFetch.mockResolvedValue(listRes({ data: many(13) }));
    await mount();
    expect(rowsEls()).toHaveLength(12);
    const more = btn(/^Show more$/)!;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await act(async () => more.click());
    expect(rowsEls()).toHaveLength(13);
    expect(btn(/^Show more$/)!.getAttribute('aria-expanded')).toBe('true');
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.getAttribute('role')).toBe('status');
    expect(live?.textContent).toBe('1 more invoices shown');
  });

  it('30 rows: announces "18 more invoices shown"', async () => {
    mockApiFetch.mockResolvedValue(listRes({ data: many(30) }));
    await mount();
    await act(async () => btn(/^Show more$/)!.click());
    expect(rowsEls()).toHaveLength(30);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe(
      '18 more invoices shown',
    );
  });
});
