// T-481 bug 2: "No" on the bail-bonds undertaking (Yes/No, no value placed by the service, T-251).
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, BriefItem, BriefQuestion, Value } from '../briefTypes';

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

const bond: BriefItem = {
  key: 'willingness_to_furnish_bond',
  part: 'facts',
  label: 'Willing to furnish bond',
  kind: 'choice',
  required: false,
  options: ['Yes', 'No'],
  value: null,
  source: null,
  please_check: false,
  placeholder: '[BOND]',
  party_name: false,
};
const briefWith = (item: BriefItem): Brief => ({
  kind: { id: 'bail', name: 'Bail application', court_document: false },
  court: { state: 'Delhi', court_type: 'High Court', court: 'Delhi High Court' },
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
const pressed = (t: string) => buttonWith(t)?.getAttribute('aria-pressed');
const updateBodies = () =>
  mockApiFetch.mock.calls
    .filter((c) => c[0] === '/api/documents/intake/brief/update')
    .map((c) => JSON.parse(c[1].body));

async function toBrief(first: Brief, questions: BriefQuestion[] = []) {
  mockApiFetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/api/documents/intake/brief'
        ? json({ outcome: 'brief', brief: first, questions })
        : json({}),
    ),
  );
  mockPrivacyFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  await act(async () => {
    root.render(
      <OneFlow
        kinds={[
          {
            template_id: 'bail',
            display_name: 'Bail application',
            category: 'criminal',
            description: '',
            plan_access: 'free',
            credits_cost: 2,
          },
        ]}
        loadingKinds={false}
      />,
    );
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
/** The service echoes the item with whatever `served` says. */
const serve = (served: (sent: Array<{ key: string; value: unknown }>) => BriefItem) =>
  mockApiFetch.mockImplementation((path: string, init?: { body?: string }) => {
    const sent = init?.body ? JSON.parse(init.body).values : [];
    return Promise.resolve(json({ brief: briefWith(served(sent)) }));
  });
const click = async (t: string) => {
  await act(async () => (buttonWith(t) as HTMLButtonElement).click());
  await flush();
};

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

describe('OneFlow "No" on a Yes/No undertaking the service leaves empty', () => {
  it('keeps "No" pressed and sends it with the draft', async () => {
    await toBrief(briefWith(bond));
    expect(pressed('No')).toBe('false');
    serve(() => ({ ...bond, value: null }));
    await click('No');
    expect(updateBodies()[0].values).toEqual([
      expect.objectContaining({ key: 'willingness_to_furnish_bond', value: 'No' }),
    ]);
    expect(pressed('No')).toBe('true');
    expect(pressed('Yes')).toBe('false');
    expect(container.textContent).not.toContain('[BOND]');

    await click('Confirm brief and continue');
    const gen = mockPrivacyFetch.mock.calls.find(
      (c) => c[1] === '/api/documents/generate-from-brief',
    );
    expect(gen).toBeDefined();
    expect(JSON.parse(gen?.[2].body).values).toEqual([
      expect.objectContaining({ key: 'willingness_to_furnish_bond', value: 'No' }),
    ]);
  });

  it('pressing "No" again clears it', async () => {
    await toBrief(briefWith(bond));
    serve(() => ({ ...bond, value: null }));
    await click('No');
    expect(pressed('No')).toBe('true');
    await click('No');
    expect(pressed('No')).toBe('false');
    expect(updateBodies().at(-1).values).toEqual([]);
  });

  it('"Yes" works as before', async () => {
    await toBrief(briefWith(bond));
    serve((sent) => ({
      ...bond,
      value: (sent[0]?.value as Value | undefined) ?? null,
      source: 'user',
    }));
    await click('Yes');
    expect(pressed('Yes')).toBe('true');
    expect(pressed('No')).toBe('false');
  });

  it('moving from "No" to "Yes" leaves "Yes" only', async () => {
    await toBrief(briefWith(bond));
    serve(() => ({ ...bond, value: null }));
    await click('No');
    serve((sent) => ({
      ...bond,
      value: (sent[0]?.value as Value | undefined) ?? null,
      source: 'user',
    }));
    await click('Yes');
    expect(pressed('Yes')).toBe('true');
    expect(pressed('No')).toBe('false');
  });

  it('a value the service placed itself is not changed', async () => {
    await toBrief(briefWith(bond));
    serve(() => ({ ...bond, value: 'Yes', source: 'user' }));
    await click('No');
    expect(pressed('Yes')).toBe('true');
    expect(pressed('No')).toBe('false');
  });

  it('a choice that is not exactly Yes/No keeps dropping an unplaced "No"', async () => {
    const other: BriefItem = { ...bond, key: 'other_choice', options: ['Yes', 'No', 'Not sure'] };
    await toBrief(briefWith(other));
    serve(() => ({ ...other, value: null }));
    await click('No');
    expect(pressed('No')).toBe('false');
  });

  it('on the questions step, "No" in round 1 leaves round 2 and the count', async () => {
    const q = (round: 1 | 2): BriefQuestion => ({
      key: bond.key,
      question: 'Is your client willing to furnish a bond?',
      round,
      label: bond.label,
      kind: 'choice',
      options: ['Yes', 'No'],
    });
    await toBrief(briefWith(bond), [q(1), q(2)]);
    expect(container.textContent).toContain('A few questions');
    serve(() => ({ ...bond, value: null }));
    await click('No');
    await click('Continue');
    expect(updateBodies()[0].values).toEqual([
      expect.objectContaining({ key: bond.key, value: 'No' }),
    ]);
    expect(container.textContent).not.toContain('A few questions');
    expect(container.textContent).toContain('Check your brief');
    expect(container.textContent).not.toMatch(/Answer \d+ more question/);
    expect(pressed('No')).toBe('true');
  });
});
