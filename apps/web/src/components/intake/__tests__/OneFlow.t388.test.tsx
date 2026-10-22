// T-388: OneFlow shows the same Ink cost under Confirm and under the generation-failed "Try again",
// and its 402 paywall never invents a cost.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { INK_COST_RECHECK, INK_COST_UNKNOWN } from '../InkCostLine';
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
const mockPaywall = jest.fn();
jest.mock('@/components/credits/PaywallModal', () => ({
  PaywallModal: (p: unknown) => {
    mockPaywall(p);
    return <div data-testid="paywall" />;
  },
}));
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

const jsonRes = (status: number, body: unknown) => ({
  ok: false,
  status,
  headers: { get: () => null },
  json: async () => body,
});
const failedStream = () => sse([ev('error', { reason: 'Boom', retryable: true })]);
const costLines = () =>
  Array.from(container.querySelectorAll('p')).filter((p) =>
    /^Uses \d+ Ink$/.test(p.textContent ?? ''),
  );

describe('OneFlow 402 without a finite cost (T-388, was `cost ?? 1`)', () => {
  it.each([
    ['no cost at all', {}],
    ['a null cost', { cost: null }],
    ['a zero cost', { cost: 0 }],
    ['a string cost', { cost: 'lots' }],
  ])(
    'does not open the paywall with %s, and shows the generic line with Try again, never the service message',
    async (_n, extra) => {
      await toBrief(2);
      mockPrivacyFetch.mockResolvedValue(
        jsonRes(402, { message: 'Not enough Ink for this.', balance: { totalInk: 0 }, ...extra }),
      );
      await act(async () => buttonWith('Confirm brief and continue')?.click());
      await flush();
      expect(mockPaywall).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="paywall"]')).toBeNull();
      // review round 2 (2): refusedStartError(402), no server text, nothing on the brief.
      expect(container.textContent).toContain('Something did not work. Try again.');
      expect(container.textContent).not.toContain('Not enough Ink for this.');
      expect(buttonWith('Try again')).toBeDefined();
    },
  );

  it('opens the paywall with the server cost and balance when the cost is a finite number above 0', async () => {
    await toBrief(2);
    mockPrivacyFetch.mockResolvedValue(
      jsonRes(402, { message: 'x', cost: 3, balance: { totalInk: 1 } }),
    );
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
    expect(container.querySelector('[data-testid="paywall"]')).not.toBeNull();
    const props = mockPaywall.mock.calls[mockPaywall.mock.calls.length - 1][0];
    expect(props.cost).toBe(3);
    expect(props.balance).toBe(1);
  });
});

describe('OneFlow Ink cost under Confirm and under Try again is the same number', () => {
  it('shows "Uses 2 Ink" on both screens for a kind with a rule pack', async () => {
    await toBrief(2);
    expect(costLines().map((p) => p.textContent)).toEqual(['Uses 2 Ink']);
    await confirm(failedStream());
    expect(container.textContent).toContain('The draft did not finish.');
    expect(container.textContent).not.toContain('Boom');
    expect(costLines().map((p) => p.textContent)).toEqual(['Uses 2 Ink']);
    const retry = container.querySelector('button[aria-describedby="generating-retry-ink-cost"]');
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    expect(retry?.textContent).toBe('Try again');
  });

  it('uses the guided cost on both screens for a brief with no rule pack', async () => {
    currentBrief = { ...brief, kind: { id: null, name: 'Custom draft', court_document: false } };
    await toBrief(9, { guided: 2 });
    expect(costLines().map((p) => p.textContent)).toEqual(['Uses 2 Ink']);
    await confirm(failedStream());
    expect(costLines().map((p) => p.textContent)).toEqual(['Uses 2 Ink']);
  });

  it('Try again charges once, with the same brief, when the cost is known', async () => {
    await toBrief(2);
    await confirm(failedStream());
    mockPrivacyFetch.mockClear();
    mockPrivacyFetch.mockResolvedValue(sse([ev('done', { docId: 'd1' })]));
    const retry = container.querySelector(
      'button[aria-describedby="generating-retry-ink-cost"]',
    ) as HTMLButtonElement;
    await act(async () => retry.click());
    await flush();
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
    expect(mockPrivacyFetch.mock.calls[0][1]).toBe('/api/documents/generate-from-brief');
  });
});

describe('OneFlow Try again when the cost cannot be known', () => {
  it('unknown cost on the failed screen: Try again is disabled behind the reason line, no notice, nothing is sent', async () => {
    await toBrief(2);
    await confirm(failedStream());
    // The list is refetched and now carries no cost for this kind.
    await act(async () => {
      root.render(
        <OneFlow kinds={kinds(undefined)} loadingKinds={false} onInkCostRetry={onInkCostRetry} />,
      );
    });
    const retry = container.querySelector(
      'button[aria-describedby="generating-retry-ink-cost"]',
    ) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(retry.getAttribute('aria-disabled')).toBe('true');
    expect(container.querySelector('#generating-retry-ink-cost')?.textContent).toBe(
      'You can generate once the Ink cost is shown.',
    );
    expect(container.textContent).not.toContain(INK_COST_UNKNOWN);
    mockPrivacyFetch.mockClear();
    await act(async () => retry.click());
    await flush();
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
  });

  it('no "Check the cost again" link on the failed screen; nothing asks the page for the cost', async () => {
    await toBrief(2);
    await confirm(failedStream());
    await act(async () => {
      root.render(
        <OneFlow kinds={kinds(undefined)} loadingKinds={false} onInkCostRetry={onInkCostRetry} />,
      );
    });
    expect(
      Array.from(container.querySelectorAll('button')).filter(
        (b) => b.textContent === INK_COST_RECHECK,
      ),
    ).toHaveLength(0);
    expect(onInkCostRetry).not.toHaveBeenCalled();
  });

  it('loading: Try again is disabled behind a status line', async () => {
    await toBrief(2);
    await confirm(failedStream());
    await act(async () => {
      root.render(<OneFlow kinds={kinds(undefined)} loadingKinds={false} inkCostLoading />);
    });
    const retry = container.querySelector(
      'button[aria-describedby="generating-retry-ink-cost"]',
    ) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(container.querySelector('#generating-retry-ink-cost')?.getAttribute('role')).toBe(
      'status',
    );
  });
});
