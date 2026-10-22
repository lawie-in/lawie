// T-545: the "{n} Ink used" chip on the OneFlow ready view comes from done.inkDebited ONLY
// (Arjun, 22 Oct 2026; AJ-521-M4). The quote (credits_cost) never feeds it. Absent, 0, negative or
// not a number: no chip, never "0 Ink used". An old server's done (no inkDebited) still renders the
// draft with no chip and no crash. No copy is added or changed: the wording is 'Ink used'.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { KindSummary } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('@/components/credits/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyInsteadOfPaywall: async () => false,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));

const QUOTE = 4; // the T-388 quote shown before Generate: it must never feed the chip

const brief = {
  kind: { id: 'bail', name: 'Bail application', court_document: false },
  court: { state: null, court_type: null, court: null },
  items: [],
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
};
const kinds = [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    credits_cost: QUOTE,
  },
] as KindSummary[];

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const btn = (t: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === t,
  ) as HTMLButtonElement | undefined;
const click = async (b: HTMLButtonElement | undefined) => {
  await act(async () => b!.click());
  await flush();
};

async function toReady(done: Record<string, unknown>) {
  const enc = new NodeTextEncoder();
  const chunks = [`event: done\ndata: ${JSON.stringify(done)}\n\n`];
  let i = 0;
  mockPrivacyFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  });
  await act(async () => {
    root.render(<OneFlow kinds={kinds} loadingKinds={false} />);
  });
  const ta = container.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, 'My client was arrested under a FIR and needs regular bail please.');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(btn('Continue'));
  await click(btn('Confirm brief and continue'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ outcome: 'brief', brief, questions: [] }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const chip = () => container.querySelector('[data-testid="ink-used-chip"]');
const flat = () => container.textContent?.replace(/\s+/g, ' ') ?? '';

// A realistic done payload from before T-545 (no inkDebited).
const OLD_SERVER_DONE = {
  complete: true,
  docId: 'doc77',
  runId: 'run-1',
  sectionsCited: [],
  mandatoryClausesComplete: true,
  creditsSpent: [],
  disclaimer: 'Draft for advocate review.',
  balance: { totalInk: 6 },
};

describe('OneFlow chip from done.inkDebited (T-545)', () => {
  it.each([
    [1, '1 Ink used'],
    [0.5, '0.5 Ink used'],
    [2.5, '2.5 Ink used'],
    [6, '6 Ink used'],
  ])('inkDebited %p shows the chip "%s"', async (inkDebited, expected) => {
    await toReady({ docId: 'doc77', inkDebited });
    expect(flat()).toContain('Your draft is ready');
    expect(chip()).not.toBeNull();
    expect(flat()).toContain(expected);
  });

  it('the quote never feeds the chip: debit below the quote shows the debit', async () => {
    await toReady({ docId: 'doc77', inkDebited: 1 }); // quote is 4
    expect(flat()).toContain('1 Ink used');
    expect(flat()).not.toContain(`${QUOTE} Ink used`);
  });

  it('the quote never feeds the chip: debit above the quote shows the debit', async () => {
    await toReady({ docId: 'doc77', inkDebited: 9 });
    expect(flat()).toContain('9 Ink used');
    expect(flat()).not.toContain(`${QUOTE} Ink used`);
  });

  it('the quote never feeds the chip: debit equal to the quote shows it (from the field)', async () => {
    await toReady({ docId: 'doc77', inkDebited: QUOTE });
    expect(flat()).toContain(`${QUOTE} Ink used`);
  });

  it.each([
    ['0', 0],
    ['negative', -1],
    ['negative half', -0.5],
    ['a numeric string', '3'],
    ['a string', 'lots'],
    ['null (what JSON makes of NaN and Infinity)', null],
    ['NaN as sent through JSON', Number.NaN],
    ['Infinity as sent through JSON', Number.POSITIVE_INFINITY],
    ['a boolean', true],
    ['an object', { ink: 3 }],
    ['an array', [3]],
  ])('inkDebited as %s: no chip, and never "0 Ink used"', async (_label, inkDebited) => {
    await toReady({ docId: 'doc77', inkDebited });
    expect(flat()).toContain('Your draft is ready'); // the draft still renders
    expect(chip()).toBeNull();
    expect(flat()).not.toContain('Ink used');
    expect(flat()).not.toContain('0 Ink used');
  });

  it('inkDebited absent: no chip even though the quote is known', async () => {
    await toReady({ docId: 'doc77' });
    expect(flat()).toContain('Your draft is ready');
    expect(chip()).toBeNull();
    expect(flat()).not.toContain('Ink used');
  });

  it('inkDebited nested under cost is ignored: only the flat field counts', async () => {
    await toReady({ docId: 'doc77', cost: { ink: 3 } });
    expect(chip()).toBeNull();
    await act(() => root.unmount());
    root = createRoot(container);
    await toReady({ docId: 'doc77', cost: { inkDebited: 3 } });
    expect(chip()).toBeNull();
  });

  it('a creditsSpent array (always empty today) does not feed the chip', async () => {
    await toReady({ docId: 'doc77', creditsSpent: [{ amount: 3 }] });
    expect(chip()).toBeNull();
  });
});

describe('old server: a done payload with no inkDebited (T-545 old client / old payload)', () => {
  it('renders the draft with Export and Open in editor, no chip, and no crash', async () => {
    await toReady({ ...OLD_SERVER_DONE });
    expect(flat()).toContain('Your draft is ready');
    expect(btn('Export')).toBeDefined();
    expect(btn('Open in editor')).toBeDefined();
    expect(chip()).toBeNull();
    expect(flat()).not.toContain('Ink used');
    await click(btn('Open in editor'));
    expect(push).toHaveBeenLastCalledWith('/dashboard/documents/doc77');
  });

  it('the same payload plus inkDebited renders the chip and the same draft', async () => {
    await toReady({ ...OLD_SERVER_DONE, inkDebited: 2 });
    expect(flat()).toContain('Your draft is ready');
    expect(flat()).toContain('2 Ink used');
    expect(btn('Export')).toBeDefined();
  });
});
