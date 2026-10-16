// T-481 bug 1: Confirm pressed while the blur-commit update is still running.
// A natively disabled Confirm swallowed the click; the press is now held and replayed.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, BriefItem, KindSummary } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
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

const text = (over: Partial<BriefItem> = {}): BriefItem => ({
  key: 'remarks',
  part: 'facts',
  label: 'Remarks',
  kind: 'text',
  required: false,
  options: [],
  value: null,
  source: null,
  please_check: false,
  placeholder: '[REMARKS]',
  party_name: false,
  ...over,
});
const party = text({
  key: 'petitioner',
  label: 'Petitioner',
  party_name: true,
  required: true,
  part: 'parties',
  placeholder: '[PETITIONER]',
});
const briefWith = (items: BriefItem[], over: Partial<Brief> = {}): Brief => ({
  kind: { id: 'bail', name: 'Bail application', court_document: false },
  court: { state: null, court_type: null, court: null },
  items,
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
  ...over,
});
const kinds = (cost?: number): KindSummary[] => [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    ...(cost === undefined ? {} : { credits_cost: cost }),
  },
];

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const buttonWith = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(t),
  ) as HTMLButtonElement | undefined;
const confirmBtn = () => buttonWith('Confirm brief and continue') as HTMLButtonElement;
const generateCalls = () =>
  mockPrivacyFetch.mock.calls.filter((c) => c[1] === '/api/documents/generate-from-brief');

/** The update call is held until `release` or `fail` is called. */
let release: (b: Brief) => void;
let fail: () => void;

async function setup(first: Brief, cost: number | null = 2) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/brief')
      return Promise.resolve(json({ outcome: 'brief', brief: first }));
    if (path === '/api/documents/intake/brief/update')
      return new Promise((resolve, reject) => {
        release = (b) => resolve(json({ brief: b }));
        fail = () => reject(new Error('down'));
      });
    return Promise.resolve(json({}));
  });
  mockPrivacyFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  await act(async () => {
    root.render(<OneFlow kinds={kinds(cost ?? undefined)} loadingKinds={false} />);
  });
  const ta = container.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, 'My client was arrested under a FIR and needs regular bail please.');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => (buttonWith('Continue') as HTMLButtonElement).click());
  await flush();
}

const firstText = () =>
  container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;

/**
 * Type into the first text input, then mousedown Confirm, blur the input (the update starts),
 * mouseup, click.
 */
async function typeThenPressConfirm() {
  const input = firstText();
  await act(async () => {
    input.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(input, 'Edited text');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    confirmBtn().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(mockApiFetch.mock.calls.some((c) => c[0] === '/api/documents/intake/brief/update')).toBe(
    true,
  );
  // The click only fires on a button that is not natively disabled.
  expect(confirmBtn().disabled).toBe(false);
  await act(async () => {
    confirmBtn().dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    confirmBtn().click();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  Element.prototype.scrollIntoView = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('OneFlow Confirm pressed while an edit is being worked out', () => {
  it('stays pressable, shows busy, and acts on the press when the update ends', async () => {
    await setup(briefWith([text()]));
    await typeThenPressConfirm();
    expect(confirmBtn().disabled).toBe(false);
    expect(confirmBtn().getAttribute('aria-disabled')).toBe('true');
    expect(confirmBtn().querySelector('svg.animate-spin')).not.toBeNull();
    expect(generateCalls()).toHaveLength(0);

    await act(async () => release(briefWith([text({ value: 'Edited text', source: 'user' })])));
    await flush();
    expect(generateCalls()).toHaveLength(1);
    const body = JSON.parse(generateCalls()[0][2].body);
    expect(body.values).toEqual([
      expect.objectContaining({ key: 'remarks', value: 'Edited text' }),
    ]);
  });

  it('two presses before the update ends start one draft', async () => {
    await setup(briefWith([text()]));
    await typeThenPressConfirm();
    await act(async () => confirmBtn().click());
    await act(async () => release(briefWith([text({ value: 'Edited text', source: 'user' })])));
    await flush();
    expect(generateCalls()).toHaveLength(1);
  });

  it('a press made with no update running confirms at once, once', async () => {
    await setup(briefWith([text({ value: 'Already', source: 'user' })]));
    await act(async () => confirmBtn().click());
    await flush();
    expect(generateCalls()).toHaveLength(1);
  });

  it('drops the held press when the update fails', async () => {
    await setup(briefWith([text()]));
    await typeThenPressConfirm();
    await act(async () => fail());
    await flush();
    expect(container.textContent).toContain('We could not check that change just now');
    expect(generateCalls()).toHaveLength(0);
    // and it is not replayed later
    await flush();
    expect(generateCalls()).toHaveLength(0);
  });

  it('focuses the first blocker and starts nothing if it cannot be confirmed', async () => {
    await setup(briefWith([text(), party]));
    await typeThenPressConfirm();
    await act(async () =>
      release(
        briefWith([text({ value: 'Edited text', source: 'user' }), party], {
          can_confirm: false,
          confirm_blockers: ['parties'],
        }),
      ),
    );
    await flush();
    expect(generateCalls()).toHaveLength(0);
    const wrap = document.getElementById('brief-petitioner') as HTMLElement;
    expect(wrap).not.toBeNull();
    expect(wrap.contains(document.activeElement) || wrap === document.activeElement).toBe(true);
  });

  it('does nothing when the Ink cost is unknown', async () => {
    await setup(briefWith([text()]), null);
    await typeThenPressConfirm();
    await act(async () => release(briefWith([text({ value: 'Edited text', source: 'user' })])));
    await flush();
    expect(generateCalls()).toHaveLength(0);
  });
});
