// T-388 round 2: Confirm waits for a known Ink cost; generate() never POSTs without one.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { INK_COST_LOADING, INK_COST_UNKNOWN } from '../InkCostLine';
import OneFlow, { NOT_STARTED_LINE } from '../OneFlow';
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
const mockPaywall = jest.fn();
jest.mock('@/components/credits/PaywallModal', () => ({
  PaywallModal: (p: unknown) => {
    mockPaywall(p);
    return <div data-testid="paywall" />;
  },
}));
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

const onInkCostRetry = jest.fn();
async function toBrief(cost?: number, opts: { guided?: number; loading?: boolean } = {}) {
  await act(async () => {
    root.render(
      <OneFlow
        kinds={kinds(cost)}
        loadingKinds={false}
        guidedInkCost={opts.guided}
        inkCostLoading={opts.loading}
        onInkCostRetry={onInkCostRetry}
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

const GENERATE = '/api/documents/generate-from-brief';
const confirmBtn = () => buttonWith('Confirm brief and continue') as HTMLButtonElement;
const generatePosts = () => mockPrivacyFetch.mock.calls.filter((c) => c[1] === GENERATE);

describe('OneFlow Confirm with a cost that is not known (AC3)', () => {
  it('unknown: Confirm is aria-disabled, the notice shows, a click POSTs nothing', async () => {
    await toBrief(undefined);
    expect(confirmBtn().getAttribute('aria-disabled')).toBe('true');
    expect(confirmBtn().hasAttribute('disabled')).toBe(false);
    expect(container.textContent).toContain(INK_COST_UNKNOWN);
    mockPrivacyFetch.mockResolvedValue(sse([ev('done', { docId: 'd1' })]));
    await act(async () => confirmBtn().click());
    await flush();
    expect(generatePosts()).toHaveLength(0);
    expect(container.textContent).toContain('Bail application');
    expect(container.textContent).not.toContain('Working on');
  });

  it('a kind missing from the list has no cost: nothing is POSTed', async () => {
    currentBrief = { ...brief, kind: { id: 'not_listed', name: 'Other', court_document: false } };
    await toBrief(2);
    await act(async () => confirmBtn().click());
    await flush();
    expect(generatePosts()).toHaveLength(0);
    expect(container.textContent).toContain(INK_COST_UNKNOWN);
  });

  it('loading: the status line shows, a click POSTs nothing', async () => {
    await toBrief(undefined, { loading: true });
    expect(container.textContent).toContain(INK_COST_LOADING);
    await act(async () => confirmBtn().click());
    await flush();
    expect(generatePosts()).toHaveLength(0);
  });

  it('unknown guided cost on a brief with no rule pack: nothing is POSTed', async () => {
    currentBrief = { ...brief, kind: { id: null, name: 'Custom draft', court_document: false } };
    await toBrief(9, { guided: undefined });
    await act(async () => confirmBtn().click());
    await flush();
    expect(generatePosts()).toHaveLength(0);
    expect(container.textContent).toContain(INK_COST_UNKNOWN);
  });

  it('the cost arriving releases Confirm, which POSTs exactly once', async () => {
    await toBrief(undefined);
    await act(async () => {
      root.render(
        <OneFlow kinds={kinds(3)} loadingKinds={false} onInkCostRetry={onInkCostRetry} />,
      );
    });
    expect(container.textContent).toContain('Uses 3 Ink');
    await confirm(sse([ev('done', { docId: 'd1' })]));
    expect(generatePosts()).toHaveLength(1);
  });

  it('known cost: Confirm and Try again show the same N and each POST once', async () => {
    await toBrief(5);
    expect(container.textContent).toContain('Uses 5 Ink');
    await confirm(sse([ev('error', { reason: 'Boom', retryable: true })]));
    expect(container.textContent).toContain('Uses 5 Ink');
    mockPrivacyFetch.mockClear();
    mockPrivacyFetch.mockResolvedValue(sse([ev('done', { docId: 'd1' })]));
    const retry = container.querySelector(
      'button[aria-describedby="generating-retry-ink-cost"]',
    ) as HTMLButtonElement;
    await act(async () => retry.click());
    await flush();
    expect(generatePosts()).toHaveLength(1);
  });
});

describe('OneFlow 402 message (AC3)', () => {
  const jsonRes = (status: number, b: unknown) => ({
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => b,
  });

  it("shows Meera's line on a 402 with no cost and no message", async () => {
    expect(NOT_STARTED_LINE).toBe("We couldn't start this just now. Please try again in a moment.");
    await toBrief(2);
    mockPrivacyFetch.mockResolvedValue(jsonRes(402, { balance: { totalInk: 0 } }));
    await act(async () => confirmBtn().click());
    await flush();
    expect(mockPaywall).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(NOT_STARTED_LINE);
  });

  it('shows data.message instead when the service sent one', async () => {
    await toBrief(2);
    mockPrivacyFetch.mockResolvedValue(jsonRes(402, { message: 'Plan limit reached.' }));
    await act(async () => confirmBtn().click());
    await flush();
    expect(container.textContent).toContain('Plan limit reached.');
    expect(container.textContent).not.toContain(NOT_STARTED_LINE);
  });
});
