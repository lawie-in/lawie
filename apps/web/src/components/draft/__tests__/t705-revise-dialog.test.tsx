import { TextDecoder as NodeTextDecoder } from 'util';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import ReviseDialog from '@/components/draft/ReviseDialog';
import { inkEntryText, parseInkHistory } from '@/components/billing/InkHistoryCard';
import { PAYMENT_COPY, formatSignedInk } from '@/components/billing/paymentCopy';
import { apiFetch } from '@/lib/apiFetch';

// T-705 — the Revise dialog. Strings are Ajay's signed ones (handoff/legal/T-703-T-705-signoff-ajay.md
// (b)), typed out here independently of the source constants.
const SIGNED = {
  title: 'Revise this draft',
  label: 'What should change?',
  free: 'Your first revision of this draft is free.',
  costs: (n: string) => `This revision costs ${n} Ink.`,
  confirm: 'Revise',
  limit: 'Revision limit reached for this draft (10).',
  helper: 'To add new facts, edit the brief first.',
};
const NOTE = 'Make the last paragraph stronger please';

jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
const verifyPrompt = jest.fn();
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyInsteadOfPaywall: (...a: unknown[]) => verifyPrompt(...a),
}));
jest.mock('@/components/credits/PaywallModal', () => ({
  PaywallModal: (p: {
    documentLabel: string;
    cost: number;
    balance: number;
    onClose: () => void;
  }) => (
    <div
      data-testid="paywall"
      data-label={p.documentLabel}
      data-cost={p.cost}
      data-balance={p.balance}
    >
      <button onClick={p.onClose}>close-paywall</button>
    </div>
  ),
}));
const notify = jest.fn();
jest.mock('@/hooks/useCredits', () => ({
  notifyCreditsChanged: (...a: unknown[]) => notify(...a),
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no TextDecoder; readSseEvents needs one.
if (typeof (globalThis as { TextDecoder?: unknown }).TextDecoder === 'undefined') {
  (globalThis as unknown as { TextDecoder: unknown }).TextDecoder = NodeTextDecoder;
}

const apiFetchMock = apiFetch as jest.Mock;
let container: HTMLDivElement;
let root: Root;
const onClose = jest.fn();
const onRevised = jest.fn();

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });

async function mount(p: Partial<React.ComponentProps<typeof ReviseDialog>> = {}) {
  await act(async () =>
    root.render(
      <ReviseDialog
        documentId="doc1"
        documentLabel="Regular Bail Application"
        revisions={{ count: 0, freeUsed: false }}
        revisionLimit={10}
        originalInk={2}
        onClose={onClose}
        onRevised={onRevised}
        {...p}
      />,
    ),
  );
}
const dialog = () =>
  document.body.querySelector('[role="alertdialog"], [role="dialog"]') as HTMLElement;
const btn = (label: string) =>
  Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as
    | HTMLButtonElement
    | undefined;
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};
const type = async (text: string) => {
  const ta = dialog().querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    set.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

function sse(...events: Array<[string, Record<string, unknown>]>) {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  // jsdom has no ReadableStream: the reader readSseEvents needs is a getReader() with read().
  const bytes = new Uint8Array(Buffer.from(text, 'utf8'));
  let sent = false;
  return {
    getReader: () => ({
      read: async () =>
        sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes }),
    }),
  } as unknown as ReadableStream<Uint8Array>;
}
const okStream = (...events: Array<[string, Record<string, unknown>]>) => ({
  ok: true,
  status: 200,
  body: sse(...events),
});
const fail = (status: number, error: string) => ({
  ok: false,
  status,
  json: async () => ({ error }),
});

beforeEach(() => {
  apiFetchMock.mockReset();
  onClose.mockReset();
  onRevised.mockReset();
  notify.mockReset();
  verifyPrompt.mockReset();
  verifyPrompt.mockResolvedValue(false);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('ReviseDialog text', () => {
  it('count 0: title, label, the free line, the helper, Revise and Cancel', async () => {
    await mount();
    const t = dialog().textContent!;
    expect(dialog().querySelector('h2')!.textContent).toBe(SIGNED.title);
    expect(t).toContain(SIGNED.label);
    expect(t).toContain(SIGNED.free);
    expect(t).not.toContain('costs');
    expect(t).toContain(SIGNED.helper);
    expect(btn(SIGNED.confirm)).toBeDefined();
    expect(btn('Cancel')).toBeDefined();
  });

  it.each([
    [1, 2, '2'],
    [3, 3.5, '3.5'],
  ])('count %i, original %f: the costs line with the Ink', async (count, ink, shown) => {
    await mount({ revisions: { count, freeUsed: true }, originalInk: ink });
    expect(dialog().textContent).toContain(SIGNED.costs(shown));
    expect(dialog().textContent).not.toContain(SIGNED.free);
  });

  it('count at the limit: the signed limit error, no cost line, Revise does nothing', async () => {
    await mount({ revisions: { count: 10, freeUsed: true } });
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(SIGNED.limit);
    expect(dialog().textContent).not.toContain('This revision costs');
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('an unknown original price (null) after the first revision shows no price and cannot be sent', async () => {
    await mount({ revisions: { count: 1, freeUsed: true }, originalInk: null });
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('Cancel closes without a request and without stale', async () => {
    await mount();
    await click(btn('Cancel'));
    expect(onClose).toHaveBeenCalledWith(false);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('ReviseDialog request', () => {
  it('a note under 10 characters is not sent', async () => {
    await mount();
    await type('too short');
    await click(btn(SIGNED.confirm));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('posts {note (trimmed), expected_ink} to the revise route; free price is 0', async () => {
    apiFetchMock.mockResolvedValue(
      okStream(['done', { complete: true, balance: { totalInk: 40 } }]),
    );
    await mount();
    await type(`  ${NOTE}  `);
    await click(btn(SIGNED.confirm));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/documents/doc1/revise');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ note: NOTE, expected_ink: 0 });
  });

  it('a paid revision sends the original quote as expected_ink; done refreshes credits and calls onRevised', async () => {
    apiFetchMock.mockResolvedValue(
      okStream(['done', { complete: true, balance: { totalInk: 40 } }]),
    );
    await mount({ revisions: { count: 2, freeUsed: true }, originalInk: 3.5 });
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(JSON.parse(apiFetchMock.mock.calls[0][1].body)).toEqual({
      note: NOTE,
      expected_ink: 3.5,
    });
    expect(notify).toHaveBeenCalledWith({ totalInk: 40 });
    expect(onRevised).toHaveBeenCalledTimes(1);
  });

  it('pending edits are saved first; if that fails nothing is posted', async () => {
    const beforeRevise = jest.fn().mockResolvedValue(false);
    await mount({ beforeRevise });
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(beforeRevise).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'Something did not work. Try again.',
    );
  });

  it('a stream error shows the signed generic line; no onRevised', async () => {
    apiFetchMock.mockResolvedValue(okStream(['error', { code: 'llm_error' }]));
    await mount();
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe('The draft did not finish.');
    expect(onRevised).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('a withheld draft (fact_needed) shows the signed question from the event', async () => {
    apiFetchMock.mockResolvedValue(
      okStream(['error', { code: 'fact_needed', reason: 'What is the police station?' }]),
    );
    await mount();
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'What is the police station?',
    );
  });

  it('a stream that ends with no done is "The draft did not finish."', async () => {
    apiFetchMock.mockResolvedValue(okStream(['template_sections', { sections: [] }]));
    await mount();
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe('The draft did not finish.');
    expect(onRevised).not.toHaveBeenCalled();
  });

  it('409 price_changed makes the dialog stale: Revise is blocked and closing says stale', async () => {
    apiFetchMock.mockResolvedValue(fail(409, 'price_changed'));
    await mount({ revisions: { count: 1, freeUsed: true } });
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    await click(btn(SIGNED.confirm));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    await click(btn('Cancel'));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('429 revision_limit switches to the signed limit error', async () => {
    apiFetchMock.mockResolvedValue(fail(429, 'revision_limit'));
    await mount({ revisions: { count: 9, freeUsed: true } });
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(SIGNED.limit);
  });

  it('any other refusal shows "Something did not work. Try again." and stays open', async () => {
    apiFetchMock.mockResolvedValue(fail(409, 'not_revisable'));
    await mount();
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'Something did not work. Try again.',
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the note is not written to the console', async () => {
    const spies = (['log', 'error', 'warn', 'info'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    apiFetchMock.mockRejectedValue(new Error('network'));
    await mount();
    await type(NOTE);
    await click(btn(SIGNED.confirm));
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(NOTE);
    spies.forEach((s) => s.mockRestore());
  });
});

describe('ReviseDialog, not enough Ink (402)', () => {
  const paywall = () =>
    document.body.querySelector('[data-testid="paywall"]') as HTMLElement | null;
  const go = async (res: unknown, p: Partial<React.ComponentProps<typeof ReviseDialog>> = {}) => {
    apiFetchMock.mockResolvedValue(res);
    await mount({ revisions: { count: 1, freeUsed: true }, ...p });
    await type(NOTE);
    await click(btn(SIGNED.confirm));
  };

  it("a 402 with the server's cost opens the paywall with that cost, the balance and the document label", async () => {
    await go({
      ok: false,
      status: 402,
      json: async () => ({ error: 'insufficient_ink', cost: 2, balance: { totalInk: 1 } }),
    });
    expect(paywall()).not.toBeNull();
    expect(paywall()!.dataset).toMatchObject({
      cost: '2',
      balance: '1',
      label: 'Regular Bail Application',
    });
    expect(document.body.querySelector('[role="alertdialog"], [role="dialog"]')).toBeNull();
    expect(onRevised).not.toHaveBeenCalled();
  });

  it('closing the paywall returns to the dialog with the note still there', async () => {
    await go({ ok: false, status: 402, json: async () => ({ cost: 2, balance: { totalInk: 0 } }) });
    await click(
      Array.from(document.body.querySelectorAll('button')).find(
        (b) => b.textContent === 'close-paywall',
      ),
    );
    expect(paywall()).toBeNull();
    expect((dialog().querySelector('textarea') as HTMLTextAreaElement).value).toBe(NOTE);
  });

  it('an unverified-email user gets the verify prompt instead of the paywall', async () => {
    verifyPrompt.mockResolvedValue(true);
    await go({ ok: false, status: 402, json: async () => ({ cost: 2, balance: { totalInk: 0 } }) });
    expect(verifyPrompt).toHaveBeenCalledTimes(1);
    expect(paywall()).toBeNull();
  });

  it('a 402 with no cost has no paywall: the generic line', async () => {
    await go({ ok: false, status: 402, json: async () => ({}) });
    expect(paywall()).toBeNull();
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'Something did not work. Try again.',
    );
  });

  it("an insufficient_ink error event shows the server's reason", async () => {
    await go(
      okStream(['error', { code: 'insufficient_ink', reason: 'You need more Ink for this.' }]),
    );
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'You need more Ink for this.',
    );
  });
});

describe('Ink history lines (Ajay)', () => {
  const entry = (label: string, inkDelta: number) =>
    parseInkHistory({
      entries: [
        {
          id: 'e1',
          createdAt: '2026-10-30T10:00:00.000Z',
          kind: 'usage',
          label,
          inkDelta,
          balanceAfter: 8,
          documentTitle: 'Secret title',
          documentDeleted: false,
        },
      ],
      balance: 8,
      nextCursor: null,
    })!.entries[0];

  it('a paid revision reads "Revision" with the change "−{n} Ink" (U+2212), naming no document', () => {
    const e = entry('revision', -2);
    expect(inkEntryText(e)).toBe('Revision');
    expect(PAYMENT_COPY.inkChange(formatSignedInk(e.inkDelta))).toBe('−2 Ink');
    expect(`${inkEntryText(e)} ${PAYMENT_COPY.inkChange(formatSignedInk(e.inkDelta))}`).toBe(
      'Revision −2 Ink',
    );
  });

  it('the free revision reads "Revision — free" (U+2014)', () => {
    expect(inkEntryText(entry('revision_free', 0))).toBe('Revision — free');
  });

  it('a draft line is unchanged', () => {
    expect(inkEntryText(entry('draft', -2))).toBe('Draft: Secret title');
  });
});
