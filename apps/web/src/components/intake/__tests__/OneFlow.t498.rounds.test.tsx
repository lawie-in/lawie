// T-498: the question rounds leave out a fact the ledger holds, and a fact the ledger could not
// read but the brief shows from the description is offered as "Please check: <value>".
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
const asked = () => Array.from(container.querySelectorAll('form label')).map((l) => l.textContent);
const chips = () =>
  Array.from(container.querySelectorAll('button[data-suggestion]')) as HTMLButtonElement[];
const updateCalls = () =>
  mockApiFetch.mock.calls.filter((c) => c[0] === '/api/documents/intake/brief/update');

async function start(response: { brief: Brief; ledger?: Ledger; questions: BriefQuestion[] }) {
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
    set.call(ta, 'My client was arrested under a FIR and needs regular bail please.');
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

describe('T-498 openQuestions: a fact the ledger holds is not asked', () => {
  // Reception left these empty; the extractor wrote a fact for fir_number, applicant_age and address.
  const items = [
    item({ key: 'fir_number', label: 'FIR Number' }),
    item({ key: 'police_station', label: 'Police Station' }),
    item({ key: 'applicant_age', label: 'Age' }),
    item({ key: 'address', label: 'Residential Address' }),
    item({ key: 'father_name', label: "Father's Name" }),
  ];
  const questions = [
    question('fir_number', 1),
    question('police_station', 1),
    question('father_name', 1),
    question('applicant_age', 2),
    question('address', 2),
  ];
  const ledger = ledgerOf(
    [
      fact('fir_number', '412/2026'),
      fact('applicant_age', '34'),
      fact('address', 'Mohalla Kadamkuan, Patna'),
    ],
    ['police_station'],
  );

  it('round 1 skips fir_number (held) and asks police_station (unresolved, no fact) and father_name (nothing)', async () => {
    await start({ brief: briefOf(items), ledger, questions });
    const q = asked();
    expect(q).toContain('QUESTION police_station');
    expect(q).toContain('QUESTION father_name');
    expect(q).not.toContain('QUESTION fir_number');
  });

  it('round 2 is not offered at all when everything left in it is held', async () => {
    await start({ brief: briefOf(items), ledger, questions });
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    // no answers: round 2 holds applicant_age and address, both held, so the brief shows
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('Confirm brief and continue');
    expect(updateCalls()).toHaveLength(0);
  });

  it('without a ledger every empty item is asked, as before', async () => {
    await start({ brief: briefOf(items), questions });
    expect(asked()).toEqual(
      expect.arrayContaining([
        'QUESTION fir_number',
        'QUESTION police_station',
        'QUESTION father_name',
      ]),
    );
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    expect(asked()).toEqual(['QUESTION applicant_age', 'QUESTION address']);
  });

  it('a held key whose item the service marks reask (T-150) is still asked', async () => {
    const reasked = items.map((i) => (i.key === 'applicant_age' ? { ...i, reask: true } : i));
    await start({ brief: briefOf(reasked), ledger, questions });
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    expect(asked()).toEqual(['QUESTION applicant_age']);
  });

  it('an undertaking "No" fact is not given: the box is still asked', async () => {
    const bond = item({
      key: 'willingness_to_furnish_bond',
      label: 'Bond',
      kind: 'choice',
      options: ['Yes', 'No'],
    });
    await start({
      brief: briefOf([bond]),
      ledger: ledgerOf([fact('willingness_to_furnish_bond', 'No')], []),
      questions: [
        question('willingness_to_furnish_bond', 1, { kind: 'choice', options: ['Yes', 'No'] }),
      ],
    });
    expect(asked()).toEqual(['QUESTION willingness_to_furnish_bond']);
  });

  it('a held optional/answered "Not known" item is not asked either (asked_empty)', async () => {
    await start({
      brief: briefOf([item({ key: 'fir_number', asked_empty: true }), items[1]]),
      ledger: ledgerOf([], ['police_station']),
      questions: [question('fir_number', 1), question('police_station', 1)],
    });
    expect(asked()).toEqual(['QUESTION police_station']);
  });

  it('a confirm question (T-190 AC8) stays asked although the ledger holds other facts', async () => {
    const eb = item({
      key: 'earlier_bail_applications',
      label: 'Earlier bail',
      kind: 'narrative',
      required: false,
      value: 'None',
      source: 'description',
      please_check: true,
    });
    await start({
      brief: briefOf([eb, items[0]]),
      ledger: ledgerOf([fact('fir_number', '412/2026')], []),
      questions: [
        question('earlier_bail_applications', 1, { confirm: true, kind: 'narrative' }),
        question('fir_number', 1),
      ],
    });
    expect(asked()).toEqual(['QUESTION earlier_bail_applications']);
    // a confirm question never carries the suggestion chip
    expect(chips()).toHaveLength(0);
  });
});

describe('T-498 "Please check" suggestion under a question the ledger could not settle', () => {
  const since = item({
    key: 'custody_since',
    label: 'In custody since',
    kind: 'date',
    required: false,
    value: '2026-09-21',
    source: 'description',
    please_check: true,
  });
  const sections = item({
    key: 'sections_charged',
    label: 'Sections',
    kind: 'list',
    value: ['BNS 318(4)', 'BNS 316(2)'],
    source: 'description',
    please_check: true,
  });
  const ps = item({ key: 'police_station', label: 'Police Station' });
  const base = (items: BriefItem[], unresolved: string[], facts: LedgerFact[] = []) => ({
    brief: briefOf(items),
    ledger: ledgerOf(facts, unresolved),
    questions: [
      question('police_station', 1),
      question('custody_since', 2, { kind: 'date' }),
      question('sections_charged', 2, { kind: 'list' }),
    ],
  });

  async function toRound2(r: ReturnType<typeof base>) {
    await start(r);
    await act(async () => buttonWith('Continue')?.click());
    await flush();
  }

  it('shows the date in words and a list joined with ", "; the field itself stays empty', async () => {
    await toRound2(
      base([ps, since, sections], ['police_station', 'custody_since', 'sections_charged']),
    );
    expect(asked()).toEqual(['QUESTION custody_since', 'QUESTION sections_charged']);
    expect(chips().map((c) => c.textContent)).toEqual([
      'Please check: 21 September 2026',
      'Please check: BNS 318(4), BNS 316(2)',
    ]);
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('');
    expect((container.querySelector('form textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('no chip for a value the advocate typed (source user)', async () => {
    await toRound2(
      base(
        [ps, { ...since, source: 'user', please_check: false }],
        ['police_station', 'custody_since'],
      ),
    );
    expect(asked()).toContain('QUESTION custody_since');
    expect(chips()).toHaveLength(0);
  });

  it('no chip for an empty value', async () => {
    await toRound2(
      base([ps, { ...since, value: null, source: null }], ['police_station', 'custody_since']),
    );
    expect(asked()).toContain('QUESTION custody_since');
    expect(chips()).toHaveLength(0);
  });

  it('no chip when the ledger holds a fact (the key is then not asked at all)', async () => {
    await toRound2(
      base([ps, since], ['police_station'], [fact('custody_since', '21 September 2026')]),
    );
    expect(asked()).not.toContain('QUESTION custody_since');
    expect(chips()).toHaveLength(0);
  });

  it('no chip with no ledger', async () => {
    await start({
      brief: briefOf([ps, since]),
      questions: [question('police_station', 1), question('custody_since', 2, { kind: 'date' })],
    });
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    expect(chips()).toHaveLength(0);
  });

  it('a tap copies the value into the field and the chip disappears', async () => {
    await toRound2(base([ps, since], ['police_station', 'custody_since']));
    expect(chips()).toHaveLength(1);
    await act(async () => chips()[0].click());
    expect(chips()).toHaveLength(0);
    expect(container.textContent).not.toContain('Please check:');
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe(
      '2026-09-21',
    );
    // still editable
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    await type(input, '2026-09-22');
    expect(input.value).toBe('2026-09-22');
  });

  it('no tap: Continue sends nothing and the key stays open (its row is still unresolved on the brief)', async () => {
    await toRound2(base([ps, since], ['police_station', 'custody_since']));
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    expect(updateCalls()).toHaveLength(0);
    // on the brief, the outstanding block still offers the question
    expect(container.textContent).toContain('Confirm brief and continue');
    expect(container.textContent).toMatch(/Answer \d+ questions?/);
  });

  it('tap then Continue sends the user value and a ledger edit from the question', async () => {
    await toRound2(base([ps, since], ['police_station', 'custody_since']));
    await act(async () => chips()[0].click());
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    expect(updateCalls()).toHaveLength(1);
    const body = JSON.parse(updateCalls()[0][1].body);
    expect(body.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'custody_since', value: '2026-09-21' }),
      ]),
    );
    expect(body.ledger_id).toBe('l1');
    expect(body.ledger_edits).toEqual([
      { key: 'custody_since', text: '2026-09-21', from_question: true },
    ]);
  });
});
