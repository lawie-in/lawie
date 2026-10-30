// T-629 (T-613 §(i)2): a question left blank on a fact the service marks blank_once_asked is sent
// back as `asked_keys`; any other blank is not.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, BriefItem, BriefQuestion } from '../briefTypes';

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

const item = (over: Partial<BriefItem>): BriefItem => ({
  key: 'x',
  part: 'facts',
  label: 'X',
  kind: 'text',
  required: false,
  options: [],
  value: null,
  source: null,
  please_check: false,
  placeholder: '[X]',
  party_name: false,
  ...over,
});
const question = (key: string, over: Partial<BriefQuestion> = {}): BriefQuestion => ({
  key,
  question: `QUESTION ${key}`,
  round: 1,
  label: key,
  kind: 'text',
  options: [],
  ...over,
});
const ITEMS = [
  item({ key: 'title_document_date', kind: 'date', part: 'dates', blank_once_asked: true }),
  item({ key: 'suit_number' }),
  item({ key: 'urgency_grounds' }),
];
const QUESTIONS = [
  question('title_document_date', { kind: 'date' }),
  question('suit_number'),
  question('urgency_grounds'),
];
const brief = (items: BriefItem[]): Brief => ({
  kind: { id: 'temporary_injunction_o39', name: 'Temporary injunction', court_document: true },
  court: { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' },
  items,
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
  Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(t),
  ) as HTMLButtonElement | undefined;
const updateCalls = () =>
  mockApiFetch.mock.calls.filter((c) => c[0] === '/api/documents/intake/brief/update');
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

async function start(items: BriefItem[], questions: BriefQuestion[]) {
  mockApiFetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/api/documents/intake/brief'
        ? json({ outcome: 'brief', brief: brief(items), questions })
        : path === '/api/documents/intake/brief/update'
          ? json({ brief: brief(items), ledger_results: [] })
          : json({}),
    ),
  );
  await act(async () => {
    root.render(<OneFlow kinds={[]} loadingKinds={false} />);
  });
  const ta = container.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    (
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
        v: string,
      ) => void
    ).call(ta, 'The plaintiff seeks an injunction against the defendant over a plot.');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => buttonWith('Continue')?.click());
  await flush();
}
const type = async (el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  await act(async () => {
    (Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set as (v: string) => void).call(
      el,
      text,
    );
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // The field commits its value on blur.
  await act(async () => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
};
const submit = async () => {
  await act(async () => {
    (container.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  await flush();
};
const fieldFor = (label: string) => {
  const l = Array.from(container.querySelectorAll('form label')).find(
    (x) => x.textContent === label,
  ) as HTMLLabelElement;
  const id = l.getAttribute('for');
  return (id ? document.getElementById(id) : l.querySelector('input, textarea')) as
    | HTMLInputElement
    | HTMLTextAreaElement;
};

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  Element.prototype.scrollIntoView = jest.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-629: blank answers and asked_keys', () => {
  it('a blank on a blank_once_asked item is sent as asked_keys; the other blanks are not', async () => {
    await start(ITEMS, QUESTIONS);
    expect(container.querySelector('form')).not.toBeNull();
    await type(fieldFor('QUESTION suit_number'), 'Title Suit No. 245 of 2026');
    await submit();
    const calls = updateCalls();
    expect(calls.length).toBeGreaterThan(0);
    const body = bodyOf(calls[calls.length - 1]);
    expect(body.asked_keys).toEqual(['title_document_date']);
    expect(body.values).toEqual([
      expect.objectContaining({ key: 'suit_number', value: 'Title Suit No. 245 of 2026' }),
    ]);
  });

  it('every question blank: still only the blank_once_asked key is sent', async () => {
    await start(ITEMS, QUESTIONS);
    await submit();
    const calls = updateCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect(bodyOf(calls[calls.length - 1]).asked_keys).toEqual(['title_document_date']);
  });

  it('a blank on items that are not blank_once_asked sends no asked_keys at all', async () => {
    const plain = ITEMS.map((i) => ({ ...i, blank_once_asked: undefined }));
    await start(plain, QUESTIONS);
    await type(fieldFor('QUESTION suit_number'), 'Title Suit No. 245 of 2026');
    await submit();
    expect(updateCalls().length).toBeGreaterThan(0);
    for (const c of updateCalls()) expect(bodyOf(c)).not.toHaveProperty('asked_keys');
  });

  it('an answered blank_once_asked question is not an asked key', async () => {
    await start(ITEMS, QUESTIONS);
    const date = fieldFor('QUESTION title_document_date');
    await type(date, '2020-05-04');
    await submit();
    expect(updateCalls().length).toBeGreaterThan(0);
    for (const c of updateCalls()) expect(bodyOf(c)).not.toHaveProperty('asked_keys');
  });
});
