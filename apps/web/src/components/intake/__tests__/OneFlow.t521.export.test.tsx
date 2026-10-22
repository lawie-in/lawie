// T-521: on the ready view, Export routes to the editor's export (/dashboard/documents/:id#export)
// and Open in editor routes without the hash. The "{n} Ink used" chip carries the Ink the server
// says it settled (done.inkDebited, T-545), never the quote known before the draft started.
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
    credits_cost: 4,
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

describe('OneFlow ready view (T-521)', () => {
  it('Export routes to /dashboard/documents/:id#export; Open in editor has no hash', async () => {
    await toReady({ docId: 'doc77' });
    expect(container.textContent).toContain('Your draft is ready');
    await click(btn('Export'));
    expect(push).toHaveBeenLastCalledWith('/dashboard/documents/doc77#export');
    await click(btn('Open in editor'));
    expect(push).toHaveBeenLastCalledWith('/dashboard/documents/doc77');
  });

  it('shows the Ink the server debited (done.inkDebited) as "3 Ink used", not the 4 Ink quote', async () => {
    await toReady({ docId: 'doc77', inkDebited: 3 });
    const text = container.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('3 Ink used');
    expect(text).not.toContain('4 Ink used');
    expect(container.innerHTML.toLowerCase()).not.toContain('regenerate');
  });

  it('a done event without inkDebited shows no chip, even though the quote is 4 Ink', async () => {
    await toReady({ docId: 'doc77' });
    expect(container.textContent).toContain('Your draft is ready');
    expect(container.textContent).not.toContain('Ink used');
    expect(container.querySelector('[data-testid="ink-used-chip"]')).toBeNull();
  });

  it('a draft with no saved document id offers no Export route', async () => {
    await toReady({});
    expect(btn('Export')).toBeUndefined();
    push.mockClear();
    expect(push).not.toHaveBeenCalled();
  });
});
