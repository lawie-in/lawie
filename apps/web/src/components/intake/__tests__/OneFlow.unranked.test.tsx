// T-622: OneFlow passes the server's `unranked` flag to the choice step. Unranked: nothing
// checked. Ranked (flag absent or false): the first card is checked, also after "Edit my
// description" on the same mounted flow. reset() is NOT covered: it is reachable only from the
// brief screen's Cancel (which leaves the phase on 'brief') or from a finished draft's Start
// another (needs the whole generation stream), and the flag is overwritten on every needs_choice
// (`setUnranked(data.unranked === true)`), so a stale value from reset() is not observable.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';

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

type Kinds = Parameters<typeof OneFlow>[0]['kinds'];
const mk = (id: string, name: string) => ({
  template_id: id,
  display_name: name,
  description: `Line for ${name}`,
  category: 'raw',
  plan_access: 'free',
  catalogueCategory: 'c1',
  catalogueCategoryName: 'Cat One',
  catalogueCategoryOrder: 1,
  icon: 'file_text',
});
const KINDS = [
  mk('bail_regular', 'Regular Bail'),
  mk('bail_anticipatory', 'Anticipatory Bail'),
] as unknown as Kinds;

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const buttonWith = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(t));
const radios = () =>
  Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];

function respond(extra: Record<string, unknown>) {
  mockApiFetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        outcome: 'needs_choice',
        choices: [
          { kind: 'bail_regular', name: 'Regular Bail' },
          { kind: 'bail_anticipatory', name: 'Anticipatory Bail' },
        ],
        ...extra,
      }),
    }),
  );
}

function freshMount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  return act(async () => {
    root.render(<OneFlow kinds={KINDS} loadingKinds={false} />);
  });
}

async function submitDescription() {
  const ta = container.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(
      ta,
      'My client was arrested under a FIR and needs bail please, regular or anticipatory.',
    );
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => (buttonWith('Continue') as HTMLButtonElement).click());
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, '', '/dashboard/new');
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('OneFlow needs_choice unranked (T-622)', () => {
  it('unranked: true renders the choice step with no radio checked and Continue aria-disabled', async () => {
    respond({ unranked: true });
    await freshMount();
    await submitDescription();
    expect(container.querySelector('h1')?.textContent).toBe('Which document do you need?');
    expect(radios()).toHaveLength(3);
    expect(radios().every((r) => !r.checked)).toBe(true);
    expect(buttonWith('Continue')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('the same response without unranked pre-selects the first card (fresh mount)', async () => {
    respond({ unranked: true });
    await freshMount();
    await submitDescription();
    expect(radios().every((r) => !r.checked)).toBe(true);
    act(() => root.unmount());
    container.remove();

    respond({});
    await freshMount();
    await submitDescription();
    expect(container.querySelector('h1')?.textContent).toBe('Which document do you need?');
    expect(radios()[0].checked).toBe(true);
    expect(radios()[1].checked).toBe(false);
    expect(buttonWith('Continue')!.hasAttribute('aria-disabled')).toBe(false);
  });

  it('unranked: false pre-selects the first card', async () => {
    respond({ unranked: false });
    await freshMount();
    await submitDescription();
    expect(radios()[0].checked).toBe(true);
  });

  it('same mounted flow: an unranked pair, then Edit my description and a ranked pair, pre-selects the first card', async () => {
    respond({ unranked: true });
    await freshMount();
    await submitDescription();
    expect(radios().every((r) => !r.checked)).toBe(true);
    await act(async () => (buttonWith('Edit my description') as HTMLButtonElement).click());
    await flush();
    respond({});
    await submitDescription();
    expect(container.querySelector('h1')?.textContent).toBe('Which document do you need?');
    expect(radios()[0].checked).toBe(true);
  });
});
