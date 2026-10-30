// T-685 (Arjun §9): the v3 orchestrator adds `event: stage` (data {stage, round?, runId}) to the
// /generate-from-brief stream. OneFlow ignores event names it does not know, so a stage event must not
// break the stream, add text to the draft, set an error, or change what the ready view shows.
// T-539 draws it later; nothing here changes in the web.
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
  openVerifyIfDraftRefused: async () => false,
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

const QUOTE = 4; // the T-388 quote shown before Generate: it must never feed the chip

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
    credits_cost: QUOTE,
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

async function toReady(chunks: string[]) {
  const enc = new NodeTextEncoder();
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

const flat = () => container.textContent?.replace(/\s+/g, ' ') ?? '';
const stage = (data: Record<string, unknown>) => `event: stage\ndata: ${JSON.stringify(data)}\n\n`;
const done = `event: done\ndata: ${JSON.stringify({ docId: 'doc77', inkDebited: 2 })}\n\n`;
const RUN = 'run-685';
const STAGES = [
  stage({ stage: 'draft', runId: RUN }),
  stage({ stage: 'repair', round: 1, runId: RUN }),
  stage({ stage: 'verify', runId: RUN }),
  stage({ stage: 'render', runId: RUN }),
  stage({ stage: 'done', runId: RUN }),
];

describe('OneFlow ignores the v3 stage event (T-685)', () => {
  it('a stream with stage events reaches the ready view exactly as one without', async () => {
    await toReady([done]);
    const plain = flat();
    expect(plain).toContain('Your draft is ready');
    await act(() => root.unmount());
    root = createRoot(container);

    await toReady([...STAGES, done]);
    expect(flat()).toContain('Your draft is ready');
    expect(flat()).toBe(plain);
    expect(flat()).not.toContain('draft did not finish');
    // Nothing of the event leaks into the page.
    expect(flat()).not.toContain(RUN);
    expect(flat()).not.toContain('"stage"');
  });

  it('a stage event in the middle of streamed text does not break it or add to it', async () => {
    const text = (t: string) => `data: ${JSON.stringify({ text: t })}\n\n`;
    await toReady([
      stage({ stage: 'draft', runId: RUN }),
      text('1. That the applicant '),
      ...STAGES,
      text('is in custody.'),
      done,
    ]);
    expect(flat()).toContain('Your draft is ready');
    expect(flat()).not.toContain('"stage"');
  });
});
