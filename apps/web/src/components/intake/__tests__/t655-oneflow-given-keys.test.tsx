// T-655: OneFlow's question rounds take the given set from brief.ledger_given_keys. An absent
// field means no key is ledger-given (fail closed), for every pack. Fictional data only.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, BriefItem, BriefQuestion, Ledger } from '../briefTypes';

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
  required: true,
  options: [],
  value: null,
  source: null,
  please_check: false,
  placeholder: '[X]',
  party_name: false,
  ...over,
});
const question = (key: string): BriefQuestion => ({
  key,
  question: `QUESTION ${key}`,
  round: 1,
  label: key,
  kind: 'text',
  options: [],
});
const briefOf = (kindId: string, items: BriefItem[], given?: string[]): Brief => ({
  kind: { id: kindId, name: kindId, court_document: true },
  court: { state: 'bihar', court_type: 'civil_court', court: 'civil_court_patna' },
  items,
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
  ...(given ? { ledger_given_keys: given } : {}),
});
const ledgerOf = (keys: string[]): Ledger =>
  ({
    ledger_id: 'l1',
    version: 1,
    run_type: 'user',
    document_kind: 'x',
    facts: keys.map((key) => ({
      id: `f-${key}`,
      key,
      label: key,
      type: 'text',
      value: 'Held Value',
      display: 'Held Value',
      raw_span: 'Held Value',
      source: 'user',
      confidence: 0.95,
      required_in_draft: true,
    })),
    unresolved: [],
    fields: Object.fromEntries(keys.map((k) => [k, 'text'])),
  }) as unknown as Ledger;

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
const asked = () => Array.from(container.querySelectorAll('form label')).map((l) => l.textContent);

async function start(response: { brief: Brief; ledger: Ledger; questions: BriefQuestion[] }) {
  mockApiFetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/api/documents/intake/brief'
        ? json({ outcome: 'brief', ...response })
        : path === '/api/documents/intake/brief/update'
          ? json({ brief: response.brief, ledger: response.ledger, ledger_results: [] })
          : json({}),
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
    set.call(
      ta,
      'My client wants an injunction against a neighbour over a plot in Sample Nagar, Patna.',
    );
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => buttonWith('Continue')?.click());
  await flush();
}

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

describe.each([
  ['O.39', 'temporary_injunction_o39', 'plaintiff_name', 'restraint_sought'],
  ['non-O.39', 'bail_regular', 'applicant_name', 'police_station'],
])('T-655 OneFlow openQuestions, %s', (_label, kindId, heldKey, otherKey) => {
  const items = [item({ key: heldKey }), item({ key: otherKey })];
  const questions = [question(heldKey), question(otherKey)];

  it('field absent: a ledger-held key is still asked (fail closed)', async () => {
    await start({ brief: briefOf(kindId, items), ledger: ledgerOf([heldKey]), questions });
    expect(asked()).toEqual(
      expect.arrayContaining([`QUESTION ${heldKey}`, `QUESTION ${otherKey}`]),
    );
  });

  it('field empty: a ledger-held key is still asked', async () => {
    await start({ brief: briefOf(kindId, items, []), ledger: ledgerOf([heldKey]), questions });
    expect(asked()).toContain(`QUESTION ${heldKey}`);
  });

  it('key present: that key is not asked, the other is', async () => {
    await start({
      brief: briefOf(kindId, items, [heldKey]),
      ledger: ledgerOf([heldKey]),
      questions,
    });
    expect(asked()).not.toContain(`QUESTION ${heldKey}`);
    expect(asked()).toContain(`QUESTION ${otherKey}`);
  });
});
