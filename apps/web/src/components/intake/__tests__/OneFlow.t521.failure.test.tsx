// T-521 (Arjun ruling 4, AC3): the three failure cases, driven through OneFlow's real SSE reader.
//  - server `error` event, code != insufficient_ink: the signed line.
//  - server `error` event, insufficient_ink: the reason only.
//  - stream ends without `done`, or fetch throws: no Ink claim, "Connection lost. Check your documents."
//  - start failure (non-OK, empty body): the reason only.
// And the ?q= prefill (initialDescription): prefills, never submits, ?kind= still works.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, KindSummary } from '../briefTypes';

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

const SIGNED = 'The draft did not finish. No Ink was used.';
const LOST = 'Connection lost. Check your documents.';
const TYPED = 'My client was arrested under a FIR and needs regular bail please.';

const brief: Brief = {
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
const KINDS: KindSummary[] = [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    credits_cost: 2,
  },
  {
    template_id: 'other',
    display_name: 'Other',
    category: 'civil',
    description: '',
    plan_access: 'free',
    credits_cost: 9,
  },
];

function sse(chunks: string[]) {
  const enc = new NodeTextEncoder();
  let i = 0;
  return {
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
  };
}
const ev = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const refused = (status: number, body: unknown) => ({
  ok: false,
  status,
  headers: { get: () => null },
  json: async () => body,
});

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const buttonWith = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(t),
  ) as HTMLButtonElement | undefined;
const setText = async (ta: HTMLTextAreaElement, v: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, v);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
const text = () => container.textContent ?? '';
const generateCalls = () => mockPrivacyFetch.mock.calls;

async function toBrief(props: Partial<Parameters<typeof OneFlow>[0]> = {}) {
  await act(async () => {
    root.render(<OneFlow kinds={KINDS} loadingKinds={false} {...props} />);
  });
  await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
  await act(async () => buttonWith('Continue')?.click());
  await flush();
}
async function confirmWith(response: unknown) {
  mockPrivacyFetch.mockResolvedValue(response);
  await act(async () => buttonWith('Confirm brief and continue')?.click());
  await flush();
}
const sentDescribed = (n: number) => JSON.parse(generateCalls()[n][2].body).described;

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

describe('OneFlow generation failure wording (T-521 AC3)', () => {
  it('server error event with an unknown code: the signed line, and the server reason', async () => {
    await toBrief();
    await confirmWith(
      sse([
        ev('error', { reason: 'The drafter stopped.', code: 'drafter_failed', retryable: true }),
      ]),
    );
    expect(text()).toContain(SIGNED);
    expect(text()).toContain('The drafter stopped.');
    expect(text()).not.toContain(LOST);
    expect(container.querySelector('[data-no-ink-claim="true"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('server error event with no code: the signed line', async () => {
    await toBrief();
    await confirmWith(sse([ev('error', { reason: 'Stopped.' })]));
    expect(text()).toContain(SIGNED);
  });

  it('server error event after streamed text still gives the signed line (no done)', async () => {
    await toBrief();
    await confirmWith(
      sse([ev('message', { text: 'partial' }), ev('error', { reason: 'Stopped.', code: 'x' })]),
    );
    expect(text()).toContain(SIGNED);
  });

  it('server error event insufficient_ink: the server reason only, never the signed line', async () => {
    await toBrief();
    await confirmWith(
      sse([
        ev('error', {
          reason: 'There is not enough Ink for this draft.',
          code: 'insufficient_ink',
          retryable: false,
        }),
      ]),
    );
    expect(text()).toContain('There is not enough Ink for this draft.');
    expect(text()).not.toContain('No Ink was used');
    expect(text()).not.toContain('The draft did not finish');
    expect(text()).not.toContain(LOST);
    expect(container.querySelector('[data-no-ink-claim="false"]')).not.toBeNull();
  });

  it('stream ends without done: no Ink claim, "Connection lost. Check your documents."', async () => {
    await toBrief();
    await confirmWith(sse([ev('message', { text: 'some text' })]));
    expect(text()).toContain(LOST);
    expect(text()).not.toContain('No Ink was used');
    expect(text()).not.toContain('The draft did not finish');
    expect(container.querySelector('[data-no-ink-claim="false"]')).not.toBeNull();
  });

  it('an empty stream (no events at all) is the same dropped case', async () => {
    await toBrief();
    await confirmWith(sse([]));
    expect(text()).toContain(LOST);
    expect(text()).not.toContain('No Ink was used');
  });

  it('fetch throws (dropped connection): no Ink claim, Connection lost', async () => {
    await toBrief();
    mockPrivacyFetch.mockRejectedValue(new Error('network'));
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
    expect(text()).toContain(LOST);
    expect(text()).not.toContain('No Ink was used');
    expect(text()).not.toContain('The draft did not finish');
  });

  it('reader throws mid-stream: no Ink claim, Connection lost', async () => {
    await toBrief();
    const enc = new NodeTextEncoder();
    let n = 0;
    await confirmWith({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: async () => {
            if (n++ === 0) return { done: false, value: enc.encode(ev('repair', {})) };
            throw new Error('reset');
          },
        }),
      },
    });
    expect(text()).toContain(LOST);
    expect(text()).not.toContain('No Ink was used');
  });

  it('start refused (non-OK): the server reason only, no claim, no Connection lost', async () => {
    await toBrief();
    await confirmWith(refused(500, { message: 'The service is busy right now.' }));
    expect(text()).toContain('The service is busy right now.');
    expect(text()).not.toContain('No Ink was used');
    expect(text()).not.toContain(LOST);
    expect(container.querySelector('[data-no-ink-claim="false"]')).not.toBeNull();
  });

  it('start refused with no message: the existing plain error, no claim', async () => {
    await toBrief();
    await confirmWith(refused(500, {}));
    expect(text()).toContain('The draft could not be started. Please try again.');
    expect(text()).not.toContain('No Ink was used');
    expect(text()).not.toContain(LOST);
  });

  it('empty body: the plain error, no claim', async () => {
    await toBrief();
    await confirmWith({ ok: true, status: 200, headers: { get: () => null }, body: null });
    expect(text()).toContain('The drafting service sent nothing back.');
    expect(text()).not.toContain('No Ink was used');
    expect(text()).not.toContain(LOST);
  });

  it.each([
    ['error event', () => sse([ev('error', { reason: 'Stopped.', code: 'x' })])],
    ['insufficient_ink', () => sse([ev('error', { reason: 'Low.', code: 'insufficient_ink' })])],
    ['dropped stream', () => sse([])],
    ['start refused', () => refused(500, { message: 'Busy.' })],
  ])('%s: the description is kept and Try again re-sends it', async (_n, make) => {
    await toBrief();
    await confirmWith(make());
    expect(sentDescribed(0)).toBe(TYPED);
    const retry = buttonWith('Try again');
    if (!retry) return; // insufficient_ink is not retryable
    mockPrivacyFetch.mockResolvedValue(sse([]));
    await act(async () => retry.click());
    await flush();
    expect(generateCalls()).toHaveLength(2);
    expect(sentDescribed(1)).toBe(TYPED);
  });

  it('Back to the brief after a failure returns to the brief without losing it', async () => {
    await toBrief();
    await confirmWith(sse([ev('error', { reason: 'Stopped.', code: 'x' })]));
    await act(async () => buttonWith('Back to the brief')?.click());
    expect(buttonWith('Confirm brief and continue')).toBeDefined();
    expect(text()).not.toContain(SIGNED);
  });
});

// break-ui: a 40-page draft streamed (about 120 KB) and then the server fails.
describe('OneFlow failure after a very long partial stream (break-ui)', () => {
  const chunks = () =>
    Array.from({ length: 60 }, (_, i) =>
      ev('message', { text: `Paragraph ${i} ${'श्रीमती आलेक्सान्द्रा '.repeat(100)}\n` }),
    );

  it('error event: the signed line, the reason, and the description is still re-sent', async () => {
    await toBrief();
    await confirmWith(
      sse([...chunks(), ev('error', { reason: 'Stopped late.', code: 'drafter_failed' })]),
    );
    expect(text()).toContain(SIGNED);
    expect(text()).toContain('Stopped late.');
    expect(text()).not.toContain('Paragraph 5');
    expect(sentDescribed(0)).toBe(TYPED);
    expect(buttonWith('Try again')).toBeDefined();
  });

  it('insufficient_ink after the same stream: reason only, no signed line', async () => {
    await toBrief();
    await confirmWith(
      sse([...chunks(), ev('error', { reason: 'Not enough Ink.', code: 'insufficient_ink' })]),
    );
    expect(text()).toContain('Not enough Ink.');
    expect(text()).not.toContain('No Ink was used');
  });

  it('stream cut after the same text: no claim, Connection lost', async () => {
    await toBrief();
    await confirmWith(sse(chunks()));
    expect(text()).toContain(LOST);
    expect(text()).not.toContain('No Ink was used');
  });
});
