// T-365 AC2: a row the advocate answered "None" or "Not known" must never look empty after the
// service replies with no value and `asked_empty`.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, BriefItem } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/components/credits/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  openVerifyInsteadOfPaywall: async () => false,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));

const base: BriefItem = {
  key: 'warrant',
  part: 'facts',
  label: 'Warrant status',
  kind: 'choice',
  required: false,
  options: ['Issued', 'Not issued', 'None'],
  value: null,
  source: null,
  please_check: false,
  placeholder: '[WARRANT]',
  party_name: false,
};
const briefWith = (item: BriefItem): Brief => ({
  kind: { id: 'bail', name: 'Bail application', court_document: false },
  court: { state: null, court_type: null, court: null },
  items: [item],
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
});

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const buttonWith = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '') === t);

async function toBrief(first: Brief) {
  mockApiFetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/api/documents/intake/brief' ? json({ outcome: 'brief', brief: first }) : json({}),
    ),
  );
  await act(async () => {
    root.render(<OneFlow kinds={[]} loadingKinds={false} />);
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

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('OneFlow keeps an answered row from looking empty', () => {
  it('a choice answered "None" stays pressed after the service replies asked_empty', async () => {
    await toBrief(briefWith(base));
    expect(buttonWith('None')?.getAttribute('aria-pressed')).toBe('false');
    mockApiFetch.mockImplementation(() =>
      Promise.resolve(json({ brief: briefWith({ ...base, value: null, asked_empty: true }) })),
    );
    await act(async () => (buttonWith('None') as HTMLButtonElement).click());
    await flush();
    expect(mockApiFetch.mock.calls.some((c) => c[0] === '/api/documents/intake/brief/update')).toBe(
      true,
    );
    expect(buttonWith('None')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).not.toContain('To be asked');
    expect(container.textContent).not.toContain('[WARRANT]');
  });

  it('a text row answered "Not known" still shows those words after the reply', async () => {
    const text: BriefItem = {
      ...base,
      kind: 'text',
      options: [],
      label: 'Remarks',
      key: 'remarks',
    };
    await toBrief(briefWith(text));
    mockApiFetch.mockImplementation(() =>
      Promise.resolve(json({ brief: briefWith({ ...text, value: null, asked_empty: true }) })),
    );
    const input = container.querySelector(
      'input[type="text"], input:not([type])',
    ) as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
        v: string,
      ) => void;
      set.call(input, 'Not known');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await flush();
    const updateCall = mockApiFetch.mock.calls.find(
      (c) => c[0] === '/api/documents/intake/brief/update',
    );
    expect(updateCall).toBeDefined();
    expect(JSON.parse(updateCall?.[1].body).values).toEqual([
      expect.objectContaining({ key: 'remarks', value: 'Not known' }),
    ]);
    const after = container.querySelector(
      'input[type="text"], input:not([type])',
    ) as HTMLInputElement;
    expect(after.value).toBe('Not known');
    expect(container.textContent).not.toContain('To be asked');
  });
});
