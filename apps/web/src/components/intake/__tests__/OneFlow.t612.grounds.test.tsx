// T-612: multi-select grounds_for_bail answers (brief item kind `choices`) reach the update route as arrays.
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
const fact = (key: string, display: string): LedgerFact => ({
  id: `f-${key}`,
  key,
  label: key,
  type: 'text',
  value: display,
  display,
  raw_span: display,
  source: 'user',
  confidence: 0.95,
  required_in_draft: true,
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
const question = (key: string, round: 1 | 2, over: Partial<BriefQuestion> = {}): BriefQuestion => ({
  key,
  question: `QUESTION ${key}`,
  round,
  label: key,
  kind: 'text',
  options: [],
  ...over,
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

const OPTIONS = ['Parity', 'Long custody', 'No previous record'];
const grounds = item({
  key: 'grounds_for_bail',
  label: 'Grounds for bail',
  kind: 'choices',
  options: OPTIONS,
  required: false,
});
const pressed = (label: string) =>
  Array.from(container.querySelectorAll('button'))
    .find((b) => b.textContent === label)
    ?.getAttribute('aria-pressed');
const click = async (label: string) => {
  const b = Array.from(container.querySelectorAll('button')).find((x) => x.textContent === label);
  await act(async () => b?.click());
  await flush();
};
const lastEdits = () => JSON.parse(updateCalls().at(-1)?.[1].body).ledger_edits;

describe('T-612 grounds_for_bail on the brief goes to the update route as an array', () => {
  const ledger = ledgerOf([], ['grounds_for_bail']);

  it('ticks send the cumulative array in option order, without from_question', async () => {
    await start({ brief: briefOf([grounds]), ledger, questions: [] });
    await click('Parity');
    expect(lastEdits()).toEqual([{ key: 'grounds_for_bail', text: ['Parity'] }]);
    await click('Long custody');
    expect(lastEdits()).toEqual([{ key: 'grounds_for_bail', text: ['Parity', 'Long custody'] }]);
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
    expect(pressed('No previous record')).toBe('false');
  });

  it('ticking out of option order still sends option order', async () => {
    await start({ brief: briefOf([grounds]), ledger, questions: [] });
    await click('Long custody');
    await click('Parity');
    expect(lastEdits()).toEqual([{ key: 'grounds_for_bail', text: ['Parity', 'Long custody'] }]);
  });

  it('unticking every chip still sends an empty array', async () => {
    await start({ brief: briefOf([grounds]), ledger, questions: [] });
    await click('Parity');
    await click('Parity');
    expect(lastEdits()).toEqual([{ key: 'grounds_for_bail', text: [] }]);
    expect(pressed('Parity')).toBe('false');
  });

  it('a key that is not in ledger.fields sends no ledger edit', async () => {
    const noField: Ledger = { ...ledger, fields: { earlier_bail_applications: 'text' } };
    await start({ brief: briefOf([grounds]), ledger: noField, questions: [] });
    await click('Parity');
    expect(updateCalls()).toHaveLength(1);
    expect(lastEdits()).toEqual([]);
  });
});

describe('T-612 grounds_for_bail: the real success path', () => {
  it('a reply with both facts and a matching saved display keeps both chips pressed, no "Saved as"', async () => {
    const f = (d: string): LedgerFact => ({ ...fact('grounds_for_bail', d), id: `f-${d}` });
    const both = ledgerOf([f('Parity'), f('Long custody')], ['grounds_for_bail']);
    const one = ledgerOf([f('Parity')], ['grounds_for_bail']);
    const reply = (ledger: Ledger, display: string) =>
      json({
        brief: briefOf([grounds]),
        ledger,
        ledger_results: [{ key: 'grounds_for_bail', status: 'saved', display }],
      });
    await start({
      brief: briefOf([grounds]),
      ledger: ledgerOf([], ['grounds_for_bail']),
      questions: [],
    });
    let n = 0;
    mockApiFetch.mockImplementation(() =>
      Promise.resolve((n += 1) === 1 ? reply(one, 'Parity') : reply(both, 'Parity, Long custody')),
    );
    await click('Parity');
    await click('Long custody');
    expect(lastEdits()).toEqual([{ key: 'grounds_for_bail', text: ['Parity', 'Long custody'] }]);
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
    expect(pressed('No previous record')).toBe('false');
    expect(container.textContent).not.toContain('Saved as');
  });
});

describe('T-612 grounds_for_bail answered in the questions step', () => {
  it('a choices answer goes as an array with from_question', async () => {
    await start({
      brief: briefOf([grounds]),
      ledger: ledgerOf([], ['grounds_for_bail']),
      questions: [question('grounds_for_bail', 1, { kind: 'choices', options: OPTIONS })],
    });
    expect(container.querySelector('form')).not.toBeNull();
    await click('Parity');
    await click('Long custody');
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    expect(updateCalls()).toHaveLength(1);
    expect(lastEdits()).toEqual([
      { key: 'grounds_for_bail', text: ['Parity', 'Long custody'], from_question: true },
    ]);
  });
});
