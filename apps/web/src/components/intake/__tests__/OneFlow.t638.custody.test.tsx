// T-638 B (B3): a derived custody_since is not sent back as a value; an edit sends it as the advocate's own (source user).
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, BriefItem, BriefQuestion, Ledger, LedgerFact } from '../briefTypes';

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
const ledgerOf = (facts: LedgerFact[], unresolvedKeys: string[]): Ledger => ({
  ledger_id: 'l1',
  version: 1,
  run_type: 'user',
  document_kind: 'bail_regular',
  facts,
  unresolved: unresolvedKeys.map((key) => ({
    id: `u-${key}`,
    key,
    label: key,
    type: 'text' as const,
    raw_span: '',
    source: 'user' as const,
    reason: 'low_confidence',
    detail: 'We are not sure these words give this detail.',
  })),
  fields: Object.fromEntries(
    [...facts.map((f) => f.key), ...unresolvedKeys, 'earlier_bail_applications'].map((k) => [
      k,
      'text' as const,
    ]),
  ),
});
const briefOf = (items: BriefItem[]): Brief => ({
  kind: { id: 'bail_regular', name: 'Regular bail', court_document: true },
  court: { state: 'bihar', court_type: 'sessions', court: 'patna' },
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

async function start(
  response: { brief: Brief; ledger?: Ledger; questions: BriefQuestion[] },
  reply?: { ledger: Ledger; ledger_results: unknown[] },
) {
  mockApiFetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/api/documents/intake/brief'
        ? json({ outcome: 'brief', ...response })
        : path === '/api/documents/intake/brief/update'
          ? json({
              brief: response.brief,
              ledger: reply?.ledger ?? response.ledger,
              ledger_results: reply?.ledger_results ?? [],
            })
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
    set.call(ta, 'My client was arrested under a FIR and needs regular bail please.');
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

const derived = item({
  key: 'custody_since',
  label: 'In custody since',
  kind: 'date',
  required: false,
  value: '2026-06-12',
  source: 'description',
  derived_from: 'arrest_date',
});
const arrest = item({
  key: 'arrest_date',
  label: 'Date of arrest',
  kind: 'date',
  required: false,
  value: '2026-06-12',
  source: 'description',
});
const ledger = (): Ledger => ({
  ...ledgerOf([], []),
  fields: { custody_since: 'date', arrest_date: 'date' },
});
const dateIn = () => container.querySelector('input[type="date"]') as HTMLInputElement;
const typeDate = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    (
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
        x: string,
      ) => void
    ).call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
};
const valuesOfLast = () =>
  JSON.parse(updateCalls().at(-1)?.[1].body).values as Array<Record<string, unknown>>;

describe('T-638 B (8) the derived custody date and the update route', () => {
  it('shows the caption; editing the arrest date does not send custody_since back; editing custody_since sends it as user', async () => {
    await start({ brief: briefOf([derived, arrest]), ledger: ledger(), questions: [] });
    expect(container.textContent).toContain('12 June 2026 (date of arrest)');

    // an edit of another date: the derived value is not echoed as the advocate's
    const inputs = Array.from(
      container.querySelectorAll('input[type="date"]'),
    ) as HTMLInputElement[];
    await typeDate(inputs[1], '2026-06-13');
    expect(updateCalls()).toHaveLength(1);
    expect(valuesOfLast().map((v) => v.key)).not.toContain('custody_since');

    // an edit of the derived date itself: the advocate's own value, source user
    await typeDate(dateIn(), '2026-06-20');
    expect(updateCalls()).toHaveLength(2);
    expect(valuesOfLast()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'custody_since', value: '2026-06-20', source: 'user' }),
      ]),
    );
  });
});
