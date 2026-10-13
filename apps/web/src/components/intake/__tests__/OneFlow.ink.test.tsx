// T-372: OneFlow passes the template's Ink cost to the brief, and on a real SSE `done` event
// tells the balance widgets the new Ink balance (or to refetch when the event has none).
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, KindSummary } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has neither; OneFlow decodes the stream with TextDecoder.
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

const mockNotify = jest.fn();
jest.mock('@/hooks/useCredits', () => ({
  notifyCreditsChanged: (...a: unknown[]) => mockNotify(...a),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
const kinds = (cost?: number): KindSummary[] => [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    ...(cost === undefined ? {} : { credits_cost: cost }),
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

/** A streamed response: each string is one chunk. */
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

let currentBrief: Brief = brief;
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

async function toBrief(cost?: number, opts: { guided?: number } = {}) {
  await act(async () => {
    root.render(<OneFlow kinds={kinds(cost)} loadingKinds={false} guidedInkCost={opts.guided} />);
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

async function confirm(stream: ReturnType<typeof sse>) {
  mockPrivacyFetch.mockResolvedValue(stream);
  await act(async () => buttonWith('Confirm brief and continue')?.click());
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  currentBrief = brief;
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ outcome: 'brief', brief: currentBrief, questions: [] }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('OneFlow Ink cost on the brief', () => {
  it('shows "Uses 2 Ink" from the kind with the brief\'s template id', async () => {
    await toBrief(2);
    expect(buttonWith('Confirm brief and continue')).toBeDefined();
    expect(container.textContent).toContain('Uses 2 Ink');
    expect(container.textContent).not.toContain('Uses 9 Ink');
  });

  it('shows no cost line when the kind has no credits_cost', async () => {
    await toBrief(undefined);
    expect(container.textContent).not.toMatch(/Uses \d+ Ink/);
  });
});

describe('OneFlow Ink cost for a brief with no rule pack', () => {
  const noPack: Brief = {
    ...brief,
    kind: { id: null, name: 'Custom draft', court_document: false },
  };

  it('shows the guided cost', async () => {
    currentBrief = noPack;
    await toBrief(2, { guided: 2 });
    expect(container.textContent).toContain('Uses 2 Ink');
  });

  it('shows no line when the guided cost is unknown', async () => {
    currentBrief = noPack;
    await toBrief(2, {});
    expect(container.textContent).not.toMatch(/Uses \d+ Ink/);
  });

  it('does not use the guided cost for a brief that has a rule pack', async () => {
    await toBrief(undefined, { guided: 2 });
    expect(container.textContent).not.toMatch(/Uses \d+ Ink/);
  });
});

describe('OneFlow SSE done event and the Ink balance', () => {
  it('tells the widgets the new balance when done carries one', async () => {
    await toBrief(2);
    await confirm(sse([ev('done', { docId: 'd1', balance: { totalInk: 7 } })]));
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith({ totalInk: 7 });
  });

  it('applies a balance of 0', async () => {
    await toBrief(2);
    await confirm(sse([ev('done', { docId: 'd1', balance: { totalInk: 0 } })]));
    expect(mockNotify).toHaveBeenCalledWith({ totalInk: 0 });
  });

  it('works when the event is split across chunks', async () => {
    await toBrief(2);
    const full = ev('done', { docId: 'd1', balance: { totalInk: 3 } });
    await confirm(sse([full.slice(0, 12), full.slice(12)]));
    expect(mockNotify).toHaveBeenCalledWith({ totalInk: 3 });
  });

  it('calls it with no argument (refetch) when done has no balance', async () => {
    await toBrief(2);
    await confirm(sse([ev('done', { docId: 'd1' })]));
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith();
  });

  it('refetches when the balance is not a finite number', async () => {
    await toBrief(2);
    await confirm(sse([ev('done', { docId: 'd1', balance: { totalInk: 'lots' } })]));
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith();
  });

  it('does not call it on an error event', async () => {
    await toBrief(2);
    await confirm(sse([ev('error', { reason: 'Boom', retryable: true })]));
    expect(mockNotify).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Boom');
  });

  it('does not call it when the stream is lost before done', async () => {
    await toBrief(2);
    await confirm(sse([ev('warning', { warnings: [] })]));
    expect(mockNotify).not.toHaveBeenCalled();
    expect(container.textContent).toContain('connection was lost');
  });
});
