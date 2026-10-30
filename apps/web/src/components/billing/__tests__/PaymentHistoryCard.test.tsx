// T-646: the Payments card. Statuses and chips, amounts (incl. GST, refunds), the "checking" line,
// the failed-payment note, reference tail, invoice download, concern states, 10 + Show more,
// deep links, and the raise-a-concern round trip.
import { act } from 'react';

import { cleanupMounted, mount, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

import { PAYMENT_COPY, formatSignedInk } from '../paymentCopy';
import {
  PaymentHistoryCard,
  inkLines,
  parsePayments,
  type PaymentRow,
} from '../PaymentHistoryCard';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
const mockDownloadBlob = jest.fn();
jest.mock('@/lib/download', () => ({ downloadBlob: (...a: unknown[]) => mockDownloadBlob(...a) }));

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const res = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  blob: async () => new Blob(['pdf']),
});

function pay(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    createdAt: '2026-10-12T09:02:00.000Z', // 14:32 IST
    kind: 'topup',
    amountPaise: 6500,
    status: 'paid',
    checking: false,
    refundedPaise: 0,
    inkDelta: 50,
    inkAddedInk: 50,
    inkReversedInk: 0,
    inkReversalLinked: false,
    referenceTail: 'AB12',
    invoiceId: null,
    concern: null,
    ...over,
  };
}
let payments: unknown[];

async function render() {
  mount(<PaymentHistoryCard />);
  await flush();
}
const body = () => document.body.textContent ?? '';
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[id^="payment-"]'));
const row = (id: string) => document.getElementById(`payment-${id}`) as HTMLElement;
const btn = (name: string | RegExp, within: ParentNode = document) =>
  Array.from(within.querySelectorAll('button')).find((b) =>
    typeof name === 'string'
      ? b.textContent === name || b.getAttribute('aria-label') === name
      : name.test(b.textContent ?? '') || name.test(b.getAttribute('aria-label') ?? ''),
  ) as HTMLButtonElement | undefined;

let scrolled: string[];
beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  scrolled = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id);
  };
  window.history.replaceState(null, '', '/dashboard/settings');
  payments = [];
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/billing/payments') return res(200, { payments });
    return res(200, {});
  });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanupMounted();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
  jest.restoreAllMocks();
});

describe('load states', () => {
  it('requests GET /api/billing/payments and shows the heading', async () => {
    await render();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/billing/payments');
    expect(document.querySelector('h2')?.textContent).toBe('Payments');
    expect(body()).toContain('Times in IST.');
  });

  it('empty list: "No payments yet."', async () => {
    await render();
    expect(body()).toContain('No payments yet.');
  });

  it.each([
    ['an HTTP error', () => res(500, {})],
    ['a body that is not the payments list', () => res(200, { data: [] })],
    ['null', () => res(200, null)],
  ])('%s shows the generic error with Retry, which reloads', async (_n, make) => {
    mockApiFetch.mockImplementationOnce(async () => make());
    await render();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Something did not work. Try again.',
    );
    payments = [pay()];
    await act(async () => btn('Retry')!.click());
    await flush();
    expect(rows()).toHaveLength(1);
  });

  it('a thrown fetch is an error state, not a crash', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('offline'));
    await render();
    expect(btn('Retry')).toBeDefined();
  });

  it('drops malformed rows and keeps the good ones', async () => {
    payments = [
      pay({ id: 'good' }),
      null,
      'x',
      pay({ id: 'badkind', kind: 'gift' }),
      pay({ id: 'badstatus', status: 'weird' }),
      pay({ id: 'badamount', amountPaise: '65' }),
      pay({ id: 'notail', referenceTail: undefined }),
    ];
    await render();
    expect(rows().map((r) => r.id)).toEqual(['payment-good']);
    expect(parsePayments({ payments: [{}] })).toEqual([]);
    expect(parsePayments({})).toBeNull();
  });
});

describe('a row', () => {
  it('shows kind, Ink change, GST-inclusive amount with paise, IST date and the chip', async () => {
    payments = [pay()];
    await render();
    const r = row('p1');
    expect(r.textContent).toContain('Top-up');
    expect(r.textContent).toContain('+50 Ink');
    expect(r.textContent).toContain('₹65.00 incl. GST');
    expect(r.textContent).toContain('12 Oct 2026, 14:32');
    expect(r.textContent).toContain('Paid');
  });

  it('a plan payment is "Plan"', async () => {
    payments = [
      pay({ kind: 'plan', amountPaise: 79900, inkDelta: 0, inkAddedInk: 0, inkReversedInk: 0 }),
    ];
    await render();
    expect(row('p1').textContent).toContain('Plan');
    expect(row('p1').textContent).toContain('₹799.00 incl. GST');
    expect(row('p1').textContent).not.toContain('Ink');
  });

  it.each([
    ['paid', 'Paid'],
    ['failed', 'Failed'],
    ['processing', 'Processing'],
    ['refunded', 'Refunded'],
    ['partly_refunded', 'Partly refunded'],
  ])('status %s shows the chip "%s"', async (status, label) => {
    payments = [pay({ status, refundedPaise: status.includes('refunded') ? 2000 : 0 })];
    await render();
    const labels = Array.from(row('p1').querySelectorAll('span')).map((s) => s.textContent);
    expect(labels).toContain(label);
  });

  it('a refunded or partly refunded payment shows both figures', async () => {
    payments = [
      pay({ id: 'a', status: 'refunded', refundedPaise: 6500 }),
      pay({ id: 'b', status: 'partly_refunded', refundedPaise: 2000 }),
      pay({ id: 'c', status: 'paid', refundedPaise: 0 }),
    ];
    await render();
    expect(row('a').textContent).toContain('₹65.00 incl. GST');
    expect(row('a').textContent).toContain('Refunded ₹65.00');
    expect(row('b').textContent).toContain('₹65.00 incl. GST');
    expect(row('b').textContent).toContain('Refunded ₹20.00');
    expect(row('c').textContent).not.toContain('Refunded ₹');
  });

  it('amounts are en-IN with paise', async () => {
    payments = [pay({ amountPaise: 1234567 }), pay({ id: 'p2', amountPaise: 5 })];
    await render();
    expect(row('p1').textContent).toContain('₹12,345.67 incl. GST');
    expect(row('p2').textContent).toContain('₹0.05 incl. GST');
  });

  it('processing + checking shows "We\'re checking this payment"; plain processing does not', async () => {
    payments = [
      pay({ id: 'a', status: 'processing', checking: true }),
      pay({ id: 'b', status: 'processing', checking: false }),
      pay({ id: 'c', status: 'paid', checking: true }),
    ];
    await render();
    expect(row('a').textContent).toContain("We're checking this payment");
    expect(row('b').textContent).not.toContain('checking');
    expect(row('c').textContent).not.toContain('checking');
  });

  it('a failed payment carries the bank-returns note, and only a failed one', async () => {
    payments = [pay({ id: 'a', status: 'failed', inkDelta: 0, inkAddedInk: 0 }), pay({ id: 'b' })];
    await render();
    const note = 'If money left your account, your bank returns it automatically.';
    expect(row('a').textContent).toContain(note);
    expect(row('b').textContent).not.toContain(note);
  });

  it('shows only the reference tail, with a copy button that copies the tail', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: write },
    });
    payments = [pay({ referenceTail: 'Zx90' })];
    await render();
    expect(row('p1').textContent).toContain('…Zx90');
    expect(row('p1').querySelector('[aria-label="Payment reference ending Zx90"]')).not.toBeNull();
    await act(async () => btn('Copy reference', row('p1'))!.click());
    await flush();
    expect(write).toHaveBeenCalledWith('Zx90');
  });

  it('a copy that is refused is not an error', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
    });
    payments = [pay()];
    await render();
    await act(async () => btn('Copy reference')!.click());
    await flush();
    expect(row('p1')).not.toBeNull();
  });
});

describe('Ink lines (Vikram §3, AJ-646-M10)', () => {
  const REMOVED = (n: number) => `−${n} Ink removed for the refund`;
  const inkText = (id: string) =>
    Array.from(row(id).querySelectorAll('span.block'))
      .map((s) => s.textContent ?? '')
      .filter((t) => t.includes(' Ink'));

  it('a paid row shows only "+N Ink"', async () => {
    payments = [pay({ inkAddedInk: 50, inkReversedInk: 0 })];
    await render();
    expect(inkText('p1')).toEqual(['+50 Ink']);
    expect(row('p1').textContent).not.toContain('removed for the refund');
  });

  it('a partly refunded row shows both lines with the exact signed string', async () => {
    payments = [
      pay({
        status: 'partly_refunded',
        refundedPaise: 2000,
        inkDelta: 30,
        inkAddedInk: 50,
        inkReversedInk: 20,
      }),
    ];
    await render();
    expect(inkText('p1')).toEqual(['+50 Ink', REMOVED(20)]);
    expect(row('p1').textContent).toContain('−20 Ink removed for the refund');
    expect(row('p1').textContent).not.toContain('-20 Ink');
  });

  it('a fully refunded row shows both lines', async () => {
    payments = [
      pay({
        status: 'refunded',
        refundedPaise: 6500,
        inkDelta: 0,
        inkAddedInk: 50,
        inkReversedInk: 50,
      }),
    ];
    await render();
    expect(inkText('p1')).toEqual(['+50 Ink', REMOVED(50)]);
  });

  it('cap: Ink reversed greater than Ink added shows the added value', async () => {
    payments = [
      pay({ status: 'refunded', refundedPaise: 6500, inkAddedInk: 50, inkReversedInk: 80 }),
    ];
    await render();
    expect(inkText('p1')).toEqual(['+50 Ink', REMOVED(50)]);
    expect(row('p1').textContent).not.toContain('80 Ink');
  });

  it('unknown inkAddedInk falls back to the signed net inkDelta', async () => {
    payments = [
      pay({ id: 'a', inkAddedInk: undefined, inkDelta: 50 }),
      pay({ id: 'b', inkAddedInk: 'x', inkDelta: -2 }),
      pay({ id: 'c', inkAddedInk: null, inkDelta: 0 }),
    ];
    await render();
    expect(inkText('a')).toEqual(['+50 Ink']);
    expect(inkText('b')).toEqual(['−2 Ink']);
    expect(inkText('c')).toEqual([]);
  });

  it('unknown inkReversedInk hides the removed line on a refunded row', async () => {
    payments = [
      pay({ id: 'a', status: 'refunded', refundedPaise: 6500, inkReversedInk: undefined }),
      pay({ id: 'b', status: 'refunded', refundedPaise: 6500, inkReversedInk: Number.NaN }),
    ];
    await render();
    expect(inkText('a')).toEqual(['+50 Ink']);
    expect(inkText('b')).toEqual(['+50 Ink']);
  });

  it('failed and processing rows show no Ink lines', async () => {
    payments = [
      pay({ id: 'a', status: 'failed', inkDelta: 0, inkAddedInk: 0, inkReversedInk: 0 }),
      pay({ id: 'b', status: 'processing', inkDelta: 0, inkAddedInk: 0, inkReversedInk: 0 }),
    ];
    await render();
    expect(inkText('a')).toEqual([]);
    expect(inkText('b')).toEqual([]);
  });

  it('parsePayments keeps inkAddedInk/inkReversedInk, and null for missing or non-finite', () => {
    const parsed = parsePayments({
      payments: [
        pay({ id: 'a', inkAddedInk: 50, inkReversedInk: 20 }),
        pay({ id: 'b', inkAddedInk: undefined, inkReversedInk: Infinity }),
        pay({ id: 'c', inkAddedInk: '5', inkReversedInk: null }),
      ],
    })!;
    expect(parsed.map((p) => [p.inkAddedInk, p.inkReversedInk])).toEqual([
      [50, 20],
      [null, null],
      [null, null],
    ]);
  });

  describe('AJ-646-M10a: ledger-linked reversal is uncapped', () => {
    it('linked 0-Ink row shows only the "removed" line, no "+" line', async () => {
      payments = [
        pay({
          status: 'refunded',
          kind: 'plan',
          refundedPaise: 79900,
          inkDelta: -100,
          inkAddedInk: 0,
          inkReversedInk: 100,
          inkReversalLinked: true,
        }),
      ];
      await render();
      expect(inkText('p1')).toEqual([REMOVED(100)]);
      expect(row('p1').textContent).toContain('\u2212100 Ink removed for the refund');
      expect(row('p1').textContent).not.toMatch(/\+\d+ Ink/);
    });

    it('linked with reversed above added shows the reversed figure', async () => {
      payments = [
        pay({
          status: 'refunded',
          refundedPaise: 6500,
          inkAddedInk: 50,
          inkReversedInk: 80,
          inkReversalLinked: true,
        }),
      ];
      await render();
      expect(inkText('p1')).toEqual(['+50 Ink', REMOVED(80)]);
    });

    it('unlinked: still capped at the added figure; a 0-added unlinked row shows no removed line', async () => {
      payments = [
        pay({ id: 'a', status: 'refunded', inkAddedInk: 50, inkReversedInk: 80 }),
        pay({
          id: 'b',
          status: 'refunded',
          inkAddedInk: 0,
          inkDelta: 0,
          inkReversedInk: 10,
          inkReversalLinked: false,
        }),
      ];
      await render();
      expect(inkText('a')).toEqual(['+50 Ink', REMOVED(50)]);
      expect(inkText('b')).toEqual([]);
    });

    it('parsePayments counts inkReversalLinked only when it is exactly true', () => {
      const vals = [true, false, 'true', 1, null, undefined, {}];
      const parsed = parsePayments({
        payments: vals.map((v, i) => pay({ id: `r${i}`, inkReversalLinked: v })),
      })!;
      expect(parsed.map((p) => p.inkReversalLinked)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    });

    it.each([
      [
        'linked, added 0',
        {
          status: 'refunded',
          inkAddedInk: 0,
          inkDelta: -10,
          inkReversedInk: 10,
          inkReversalLinked: true,
        },
        [REMOVED(10)],
      ],
      [
        'linked, added unknown',
        {
          status: 'refunded',
          inkAddedInk: null,
          inkDelta: 0,
          inkReversedInk: 10,
          inkReversalLinked: true,
        },
        [REMOVED(10)],
      ],
      [
        'linked but paid: a stray reversal is not shown',
        { status: 'paid', inkAddedInk: 50, inkReversedInk: 10, inkReversalLinked: true },
        ['+50 Ink'],
      ],
    ] as [string, Partial<PaymentRow>, string[]][])('inkLines %s', (_n, over, expected) => {
      const r = { ...(pay() as unknown as PaymentRow), ...over };
      expect(inkLines(r)).toEqual(expected);
    });
  });

  describe('inkLines (direct)', () => {
    const base = (over: Partial<PaymentRow>): PaymentRow => ({
      ...(pay() as unknown as PaymentRow),
      ...over,
    });

    it.each([
      ['paid', { status: 'paid', inkAddedInk: 50, inkReversedInk: 0 }, ['+50 Ink']],
      [
        'paid with a stray reversal is not shown',
        { status: 'paid', inkAddedInk: 50, inkReversedInk: 20 },
        ['+50 Ink'],
      ],
      [
        'partly refunded',
        { status: 'partly_refunded', inkAddedInk: 50, inkReversedInk: 20 },
        ['+50 Ink', REMOVED(20)],
      ],
      [
        'fully refunded',
        { status: 'refunded', inkAddedInk: 50, inkReversedInk: 50 },
        ['+50 Ink', REMOVED(50)],
      ],
      [
        'cap',
        { status: 'refunded', inkAddedInk: 50, inkReversedInk: 999 },
        ['+50 Ink', REMOVED(50)],
      ],
      [
        'reversed unknown',
        { status: 'refunded', inkAddedInk: 50, inkReversedInk: null },
        ['+50 Ink'],
      ],
      [
        'reversed zero',
        { status: 'partly_refunded', inkAddedInk: 50, inkReversedInk: 0 },
        ['+50 Ink'],
      ],
      [
        'added unknown, net fallback, reversed shown uncapped',
        { status: 'refunded', inkAddedInk: null, inkDelta: 30, inkReversedInk: 20 },
        ['+30 Ink', REMOVED(20)],
      ],
      [
        'added zero (plan) shows nothing',
        { status: 'paid', inkAddedInk: 0, inkDelta: 0, inkReversedInk: 0 },
        [],
      ],
      [
        'added zero with a reversal: cap leaves nothing',
        { status: 'refunded', inkAddedInk: 0, inkDelta: 0, inkReversedInk: 10 },
        [],
      ],
      ['failed', { status: 'failed', inkAddedInk: 0, inkDelta: 0, inkReversedInk: 0 }, []],
      ['processing', { status: 'processing', inkAddedInk: 0, inkDelta: 0, inkReversedInk: 0 }, []],
    ] as [string, Partial<PaymentRow>, string[]][])('%s', (_n, over, expected) => {
      expect(inkLines(base(over))).toEqual(expected);
    });
  });
});

describe('invoice', () => {
  it('no Invoice button without an invoiceId', async () => {
    payments = [pay()];
    await render();
    expect(btn('Invoice', row('p1'))).toBeUndefined();
  });

  it('Invoice downloads /api/billing/invoices/:id/pdf', async () => {
    payments = [pay({ invoiceId: 'inv9' })];
    await render();
    await act(async () => btn('Invoice', row('p1'))!.click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/billing/invoices/inv9/pdf');
    expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
  });

  it('a failed download shows the message on that row', async () => {
    payments = [pay({ invoiceId: 'inv9' })];
    mockApiFetch.mockImplementation(async (path: string) =>
      path === '/api/billing/payments' ? res(200, { payments }) : res(500, {}),
    );
    await render();
    await act(async () => btn('Invoice', row('p1'))!.click());
    await flush();
    expect(row('p1').textContent).toContain(
      'We could not download this invoice. Please try again.',
    );
    expect(mockDownloadBlob).not.toHaveBeenCalled();
  });
});

describe('concern states', () => {
  it('no concern: Raise a concern, no chip, no View', async () => {
    payments = [pay()];
    await render();
    expect(btn('Raise a concern', row('p1'))).toBeDefined();
    expect(btn('View', row('p1'))).toBeUndefined();
    expect(row('p1').textContent).not.toContain('Concern:');
  });

  it('open concern: chip + View, and Raise a concern is hidden', async () => {
    payments = [pay({ concern: { id: 'c1', status: 'open', reference: 'CN-0001' } })];
    await render();
    expect(row('p1').textContent).toContain('Concern: open');
    expect(btn('View', row('p1'))).toBeDefined();
    expect(btn('Raise a concern', row('p1'))).toBeUndefined();
  });

  it.each([
    ['resolved', 'Concern: resolved'],
    ['refunded', 'Concern: refunded'],
  ])('%s concern: chip + View, and a new concern can be raised', async (status, chip) => {
    payments = [pay({ concern: { id: 'c1', status, reference: 'CN-0001' } })];
    await render();
    expect(row('p1').textContent).toContain(chip);
    expect(btn('View', row('p1'))).toBeDefined();
    expect(btn('Raise a concern', row('p1'))).toBeDefined();
  });

  it('an unknown concern status is "Concern raised"; a malformed concern is ignored', async () => {
    payments = [
      pay({ id: 'a', concern: { id: 'c1', status: 'escalated', reference: 'CN-1' } }),
      pay({ id: 'b', concern: { id: 'c2' } }),
    ];
    await render();
    expect(row('a').textContent).toContain('Concern raised');
    expect(btn('Raise a concern', row('b'))).toBeDefined();
  });

  it('View opens a read-only dialog with the reference and status', async () => {
    payments = [pay({ concern: { id: 'c1', status: 'open', reference: 'CN-0001' } })];
    await render();
    await act(async () => btn('View', row('p1'))!.click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Your concern');
    expect(dialog.textContent).toContain('CN-0001');
    expect(dialog.textContent).toContain('Concern: open');
    expect(dialog.querySelector('textarea, select')).toBeNull();
    expect(btn('Close', dialog)).toBeDefined();
  });

  it('raise a concern: select, submit, toast, then the row shows the open chip and View', async () => {
    payments = [pay()];
    mockApiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/billing/payments') return res(200, { payments });
      if (path === '/api/billing/payments/p1/concerns' && init?.method === 'POST') {
        return res(201, {
          concern: { id: 'c1', status: 'open', reference: 'CN-0042' },
          ackEmailQueued: true,
        });
      }
      return res(404, {});
    });
    await render();
    await act(async () => btn('Raise a concern', row('p1'))!.click());
    const select = document.querySelector('[role="dialog"] select') as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(select, 'charged_no_ink');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => btn('Submit')!.click());
    await flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(body()).toContain('Concern sent. We have emailed you an acknowledgement.');
    expect(row('p1').textContent).toContain('Concern: open');
    expect(btn('Raise a concern', row('p1'))).toBeUndefined();
    expect(btn('View', row('p1'))).toBeDefined();
  });

  it('a 409 from the server reloads the list', async () => {
    payments = [pay()];
    mockApiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/billing/payments') return res(200, { payments });
      if (init?.method === 'POST') return res(409, {});
      return res(404, {});
    });
    await render();
    const listCalls = () =>
      mockApiFetch.mock.calls.filter((c) => c[0] === '/api/billing/payments').length;
    expect(listCalls()).toBe(1);
    await act(async () => btn('Raise a concern', row('p1'))!.click());
    const select = document.querySelector('[role="dialog"] select') as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(select, 'charged_twice');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => btn('Submit')!.click());
    await flush();
    expect(listCalls()).toBe(2);
  });
});

describe('concern toast text follows ackEmailQueued (AJ-646-M11 (1))', () => {
  const LONG = 'Concern sent. We have emailed you an acknowledgement.';
  const SHORT = 'Concern sent.';

  async function submitWith(postBody: unknown) {
    payments = [pay()];
    mockApiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/billing/payments') return res(200, { payments });
      if (path === '/api/billing/payments/p1/concerns' && init?.method === 'POST') {
        return res(201, postBody);
      }
      return res(404, {});
    });
    await render();
    await act(async () => btn('Raise a concern', row('p1'))!.click());
    const select = document.querySelector('[role="dialog"] select') as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(select, 'charged_no_ink');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => btn('Submit')!.click());
    await flush();
  }
  const concern = { id: 'c1', status: 'open', reference: 'CN-0042' };

  it('copy: the long and short strings are exact', () => {
    expect(PAYMENT_COPY.concernSent).toBe(LONG);
    expect(PAYMENT_COPY.concernSentShort).toBe(SHORT);
  });

  it('ackEmailQueued === true (top level) shows the long text', async () => {
    await submitWith({ concern, ackEmailQueued: true });
    expect(body()).toContain(LONG);
  });

  it.each([
    ['false', { concern, ackEmailQueued: false }],
    ['missing', { concern }],
    ['the string "true"', { concern, ackEmailQueued: 'true' }],
    ['1', { concern, ackEmailQueued: 1 }],
    ['null', { concern, ackEmailQueued: null }],
  ])('ackEmailQueued %s shows only the short text', async (_n, postBody) => {
    await submitWith(postBody);
    expect(body()).toContain(SHORT);
    expect(body()).not.toContain('emailed you');
    expect(body()).not.toContain('acknowledgement');
    // The concern still went through: the row shows it.
    expect(row('p1').textContent).toContain('Concern: open');
  });

  it('an unreadable body also gets the short text', async () => {
    payments = [pay()];
    mockApiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/billing/payments') return res(200, { payments });
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => {
            throw new Error('x');
          },
        };
      }
      return res(404, {});
    });
    await render();
    await act(async () => btn('Raise a concern', row('p1'))!.click());
    const select = document.querySelector('[role="dialog"] select') as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(select, 'charged_no_ink');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => btn('Submit')!.click());
    await flush();
    expect(body()).toContain(SHORT);
    expect(body()).not.toContain('emailed you');
  });
});

describe('negative Ink uses U+2212, never ASCII hyphen (AJ-646-M11 (3))', () => {
  it('formatSignedInk and inkChange', () => {
    expect(formatSignedInk(-2)).toBe('\u22122');
    expect(formatSignedInk(-2.5)).toBe('\u22122.5');
    expect(formatSignedInk(-2)).not.toContain('-');
    expect(PAYMENT_COPY.inkChange(formatSignedInk(-2))).toBe('\u22122 Ink');
    expect(PAYMENT_COPY.inkChange(formatSignedInk(-2))).not.toContain('-');
    expect(PAYMENT_COPY.inkChange(formatSignedInk(50))).toBe('+50 Ink');
  });

  it('inkTakenBack (the M10 line) stays exact', () => {
    expect(PAYMENT_COPY.inkTakenBack('20')).toBe('\u221220 Ink removed for the refund');
    expect(PAYMENT_COPY.inkTakenBack('20')).not.toContain('-');
  });

  it('a row with a negative net Ink renders the true minus and no hyphen', async () => {
    payments = [pay({ id: 'neg', inkAddedInk: null, inkDelta: -2 })];
    await render();
    const text = Array.from(row('neg').querySelectorAll('span.block'))
      .map((s) => s.textContent ?? '')
      .filter((t) => t.includes(' Ink'));
    expect(text).toEqual(['\u22122 Ink']);
    expect(text.join('')).not.toContain('-');
  });

  it('the M10 line on a refunded row is exact: true minus, no hyphen', async () => {
    payments = [
      pay({ status: 'refunded', refundedPaise: 6500, inkAddedInk: 50, inkReversedInk: 50 }),
    ];
    await render();
    expect(row('p1').textContent).toContain('\u221250 Ink removed for the refund');
    expect(row('p1').textContent).not.toContain('-50 Ink');
  });
});

describe('10 rows, then Show more', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => pay({ id: `p${i}`, referenceTail: `T${i}` }));

  it('shows 10, Show more adds 10 more, and the button goes when all are shown', async () => {
    payments = many(25);
    await render();
    expect(rows()).toHaveLength(10);
    await act(async () => btn('Show more')!.click());
    expect(rows()).toHaveLength(20);
    await act(async () => btn('Show more')!.click());
    expect(rows()).toHaveLength(25);
    expect(btn('Show more')).toBeUndefined();
  });

  it('exactly 10 rows has no Show more', async () => {
    payments = many(10);
    await render();
    expect(btn('Show more')).toBeUndefined();
  });
});

describe('deep links', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => pay({ id: `p${i}` }));

  it('#payments scrolls to the card', async () => {
    window.history.replaceState(null, '', '/dashboard/settings?tab=billing#payments');
    payments = many(2);
    await render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(scrolled).toEqual(['payments']);
  });

  it('#payment-<id> scrolls to that row', async () => {
    window.history.replaceState(null, '', '/dashboard/settings#payment-p3');
    payments = many(5);
    await render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(scrolled).toEqual(['payment-p3']);
  });

  it('#payment-<id> beyond the first 10 expands the list to reach it', async () => {
    window.history.replaceState(null, '', '/dashboard/settings#payment-p12');
    payments = many(25);
    await render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(rows().length).toBeGreaterThanOrEqual(13);
    expect(row('p12')).not.toBeNull();
    expect(scrolled).toContain('payment-p12');
  });

  it('#payment-<unknown id> falls back to the card, not an error', async () => {
    window.history.replaceState(null, '', '/dashboard/settings#payment-nope');
    payments = many(2);
    await render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(scrolled).toEqual(['payments']);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('no payments hash: no scrolling', async () => {
    payments = many(2);
    await render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(scrolled).toEqual([]);
  });
});
