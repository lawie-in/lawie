// T-388 round 2 / T-565 W8: runGeneration's guard. When the cost is not known at the point of
// charging, the page stays on the generating screen as the not-started generation_failed card
// (`The draft could not start.`, no unknown-cost notice, no `Check the cost again`). Nothing is
// charged. "Try again" is enabled: it fetches the cost again and drafts once it is known from the
// saved form data; if the cost is still unknown the card stays.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  INK_COST_LOADING,
  INK_COST_RECHECK,
  INK_COST_UNKNOWN,
  NOT_STARTED_LINE,
} from '@/components/intake/InkCostLine';

import NewDocumentPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const oneFlowProps = jest.fn();
jest.mock('@/components/intake/OneFlow', () => ({
  __esModule: true,
  default: (props: unknown) => {
    oneFlowProps(props);
    return <div data-testid="one-flow" />;
  },
}));
jest.mock('@/components/form/DynamicFormRenderer', () => ({
  __esModule: true,
  default: ({
    onSubmit,
    onCancel,
  }: {
    onSubmit: (d: Record<string, unknown>) => void;
    onCancel?: () => void;
  }) => (
    <div>
      <button type="button" data-testid="submit-form" onClick={() => onSubmit({ client: 'A' })}>
        Generate document
      </button>
      <button type="button" data-testid="cancel-form" onClick={() => onCancel?.()}>
        cancel probe
      </button>
    </div>
  ),
}));
// The real PipelineStatus, plus two probe buttons that reach callbacks its own (blocked) buttons
// withhold: a stale or racing click is how the page guard is hit.
jest.mock('@/components/draft/PipelineStatus', () => {
  const actual = jest.requireActual('@/components/draft/PipelineStatus');
  const Actual = actual.default;
  return {
    __esModule: true,
    ...actual,
    default: (props: { onProceedAnyway?: () => void; onInkCostRetry?: () => void }) => (
      <div>
        <button type="button" data-testid="probe-proceed" onClick={() => props.onProceedAnyway?.()}>
          probe proceed
        </button>
        <button type="button" data-testid="probe-refetch" onClick={() => props.onInkCostRetry?.()}>
          probe refetch
        </button>
        <Actual {...props} />
      </div>
    ),
  };
});
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'A', email: 'a@example.com', plan: 'free' } }),
}));
jest.mock('@/components/credits/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyInsteadOfPaywall: async () => false,
}));
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const GENERATE = '/api/documents/generate-from-template';

const tpl = (cost?: number) => ({
  template_id: 'bail_regular',
  display_name: 'Regular bail',
  description: '',
  icon: 'FileText',
  plan_access: 'free',
  supported_languages: ['en'],
  catalogueCategory: 'criminal',
  catalogueCategoryName: 'Criminal',
  catalogueCategoryOrder: 1,
  ...(cost === undefined ? {} : { credits_cost: cost }),
});

/** template-configs answers in order; the last one repeats. */
let configLists: unknown[];
let verdict: { verdict: 'pass' | 'soft' | 'hard'; questions?: string[] };
let enabled: boolean;
/** When set, the third and later template-configs answers wait for it. */
let gate: Promise<void> | null = null;
function route() {
  let n = 0;
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/enabled') return Promise.resolve(ok({ enabled }));
    if (path === '/api/documents/template-configs') {
      const body = configLists[Math.min(n, configLists.length - 1)];
      n += 1;
      if (gate && n >= 3) return gate.then(() => ok(body));
      return Promise.resolve(ok(body));
    }
    if (path === '/api/documents/template-configs/bail_regular')
      return Promise.resolve(
        ok({ config: { template_id: 'bail_regular', display_name: 'Regular bail' } }),
      );
    if (path === '/api/documents/preflight') return Promise.resolve(ok(verdict));
    return Promise.resolve(ok({}));
  });
}
const generateCalls = () => mockPrivacyFetch.mock.calls.filter((c) => c[1] === GENERATE);

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

async function toForm() {
  await act(async () => {
    root.render(<NewDocumentPage />);
  });
  await flush();
  await act(async () => buttonWith('Regular bail')?.click());
  await flush();
}
const submit = async () => {
  await act(async () =>
    (container.querySelector('[data-testid="submit-form"]') as HTMLElement).click(),
  );
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  enabled = false;
  gate = null;
  verdict = { verdict: 'pass' };
  mockPrivacyFetch.mockResolvedValue({
    ok: false,
    status: 500,
    headers: { get: () => null },
    json: async () => ({ error: 'Model down' }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const count = (t: string) => (container.textContent ?? '').split(t).length - 1;
const probe = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
const tryAgain = () => buttonWith('Try again');

/** Known at mount, lost by a refetch, then a click that still reaches the guard. */
async function reachNotStartedCard() {
  verdict = { verdict: 'soft', questions: ['Check the dates'] };
  route();
  await toForm();
  await submit();
  expect(generateCalls()).toHaveLength(0);
  expect(container.querySelector('#soft-warn-ink-cost')?.textContent).toBe('Uses 3 Ink');
  await act(async () => probe('probe-refetch').click());
  await flush();
  // T-565 W8/W12: the soft-warn card shows the reason line (no notice); its button is blocked
  expect(container.querySelector('#soft-warn-ink-cost')?.textContent).toBe(
    'You can generate once the Ink cost is shown.',
  );
  expect(count(INK_COST_UNKNOWN)).toBe(0);
  expect(buttonWith('Generate anyway')!.disabled).toBe(true);
  await act(async () => probe('probe-proceed').click());
  await flush();
  expect(generateCalls()).toHaveLength(0);
}

describe('new page: the runGeneration guard (AC3)', () => {
  it('cost lost before the charge: the not-started card with no notice, nothing POSTed, then Try again refetches the cost and drafts once from the saved form', async () => {
    // 1: cost known at mount; 2: the refetch comes back without a cost; 3: the next one has it.
    configLists = [
      { templates: [tpl(3)] },
      { templates: [tpl(undefined)] },
      { templates: [tpl(3)] },
    ];
    await reachNotStartedCard();

    // T-565 W1/W8: the card says `The draft could not start.` alone; the guard reason is not
    // rendered, and neither the unknown-cost notice nor `Check the cost again` is on the card.
    expect(count(NOT_STARTED_LINE)).toBe(0);
    expect(count('The draft could not start.')).toBe(1);
    expect(count('The draft did not finish.')).toBe(0);
    expect(count('Check your documents list')).toBe(0);
    expect(count(INK_COST_UNKNOWN)).toBe(0);
    expect(buttonWith(INK_COST_RECHECK)).toBeUndefined();
    expect(container.querySelector('#generation-failed-retry-ink-cost')).toBeNull();
    // Try again is enabled although the cost is unknown (nothing was charged)
    expect(tryAgain()).toBeDefined();
    expect(tryAgain()!.disabled).toBe(false);
    expect(tryAgain()!.hasAttribute('aria-describedby')).toBe(false);
    // still on the generating screen, not bounced to an empty form
    expect(container.querySelector('[data-testid="submit-form"]')).toBeNull();

    // Try again fetches the cost and charges once, from the form data that was saved
    await act(async () => tryAgain()!.click());
    await flush();
    expect(generateCalls()).toHaveLength(1);
    expect(JSON.parse(generateCalls()[0][2].body)).toMatchObject({
      template_id: 'bail_regular',
      form_data: { client: 'A' },
    });
  });

  it('Try again with the cost still unknown: nothing is sent and the card stays, Try again still enabled', async () => {
    configLists = [{ templates: [tpl(3)] }, { templates: [tpl(undefined)] }];
    await reachNotStartedCard();
    const calls = () =>
      mockApiFetch.mock.calls.filter((c) => c[0] === '/api/documents/template-configs');
    const before = calls().length;
    await act(async () => tryAgain()!.click());
    await flush();
    expect(calls().length).toBe(before + 1);
    expect(generateCalls()).toHaveLength(0);
    expect(count('The draft could not start.')).toBe(1);
    expect(count(INK_COST_UNKNOWN)).toBe(0);
    expect(tryAgain()!.disabled).toBe(false);
    // and a second click tries the cost again, still without charging
    await act(async () => tryAgain()!.click());
    await flush();
    expect(calls().length).toBe(before + 2);
    expect(generateCalls()).toHaveLength(0);
  });

  it('while the cost loads the button is off and the loading line shows; once known it drafts, once', async () => {
    configLists = [
      { templates: [tpl(3)] },
      { templates: [tpl(undefined)] },
      { templates: [tpl(3)] },
    ];
    let open!: () => void;
    await reachNotStartedCard();
    gate = new Promise<void>((r) => {
      open = r;
    });
    await act(async () => tryAgain()!.click());
    await flush();
    expect(generateCalls()).toHaveLength(0);
    expect(count(INK_COST_LOADING)).toBeGreaterThanOrEqual(1);
    expect(tryAgain()!.disabled).toBe(true);
    // a click while it is off does nothing
    await act(async () => tryAgain()!.click());
    await flush();
    expect(generateCalls()).toHaveLength(0);

    await act(async () => open());
    await flush();
    expect(generateCalls()).toHaveLength(1);
  });

  it('once the cost is known the not-started card (if it stays) shows `Uses N Ink`', async () => {
    // known at mount, lost, then found again by the page's own refetch (probe), card still up
    configLists = [
      { templates: [tpl(3)] },
      { templates: [tpl(undefined)] },
      { templates: [tpl(3)] },
    ];
    await reachNotStartedCard();
    await act(async () => probe('probe-refetch').click());
    await flush();
    expect(generateCalls()).toHaveLength(0);
    expect(container.querySelector('#generation-failed-retry-ink-cost')?.textContent).toBe(
      'Uses 3 Ink',
    );
    expect(tryAgain()!.disabled).toBe(false);
  });
});

// ── Round 4: "Try again" on the not-started card sets a pending draft that must never fire
// away from that card (it holds Ink).
describe('new page: a pending Try again never drafts off the not-started card', () => {
  const lists = () => [
    { templates: [tpl(3)] },
    { templates: [tpl(undefined)] },
    { templates: [tpl(3)] },
  ];
  const releaseGate = async (open: () => void) => {
    await act(async () => open());
    await flush();
  };
  const holdCostFetch = () => {
    let open!: () => void;
    gate = new Promise<void>((r) => {
      open = r;
    });
    return open;
  };
  const clickText = async (label: string) => {
    await act(async () => buttonWith(label)!.click());
    await flush();
  };
  const onForm = () => container.querySelector('[data-testid="submit-form"]') !== null;

  it('Try again, then Edit the form, then the cost resolves: no POST; a later fresh submit makes exactly one', async () => {
    configLists = lists();
    await reachNotStartedCard();
    const open = holdCostFetch();
    await act(async () => tryAgain()!.click());
    await flush();
    await clickText('Edit the form');
    expect(onForm()).toBe(true);
    await releaseGate(open);
    expect(generateCalls()).toHaveLength(0);
    expect(onForm()).toBe(true);
    // a later fresh submit is one POST
    verdict = { verdict: 'pass' };
    await submit();
    expect(generateCalls()).toHaveLength(1);
  });

  it('Try again, Edit the form, Cancel, then the cost resolves: no POST', async () => {
    configLists = lists();
    await reachNotStartedCard();
    const open = holdCostFetch();
    await act(async () => tryAgain()!.click());
    await flush();
    await clickText('Edit the form');
    await act(async () => probe('cancel-form').click());
    await flush();
    await releaseGate(open);
    expect(generateCalls()).toHaveLength(0);
  });

  it('Try again, Edit the form, a different template, then the cost resolves: no POST', async () => {
    configLists = lists();
    await reachNotStartedCard();
    const open = holdCostFetch();
    await act(async () => tryAgain()!.click());
    await flush();
    await clickText('Edit the form');
    await clickText('Choose a different template');
    await releaseGate(open);
    expect(generateCalls()).toHaveLength(0);
    expect(onForm()).toBe(false);
  });

  it('the cost resolving while still on the card: exactly one POST, and a second cost refresh does not POST again', async () => {
    configLists = lists();
    await reachNotStartedCard();
    const open = holdCostFetch();
    await act(async () => tryAgain()!.click());
    await flush();
    expect(generateCalls()).toHaveLength(0);
    await releaseGate(open);
    expect(generateCalls()).toHaveLength(1);
    // the 500 reply leaves a failure card; refreshing the cost again must not draft
    gate = null;
    await act(async () => probe('probe-refetch').click());
    await flush();
    await act(async () => probe('probe-refetch').click());
    await flush();
    expect(generateCalls()).toHaveLength(1);
  });

  it("a fresh submit after the cost resolved makes no extra POST: soft-warn card first, then the user's own click is the one POST", async () => {
    configLists = lists();
    await reachNotStartedCard();
    const open = holdCostFetch();
    await act(async () => tryAgain()!.click());
    await flush();
    await clickText('Edit the form');
    // (a submit is held while the cost is still loading, so the cost resolves first)
    await releaseGate(open);
    expect(generateCalls()).toHaveLength(0);
    verdict = { verdict: 'soft', questions: ['Check the dates'] };
    await submit();
    expect(buttonWith('Generate anyway')).toBeDefined();
    expect(generateCalls()).toHaveLength(0);
    await clickText('Generate anyway');
    expect(generateCalls()).toHaveLength(1);
  });
});
