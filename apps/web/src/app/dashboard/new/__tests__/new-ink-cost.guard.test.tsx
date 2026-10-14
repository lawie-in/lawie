// T-388 round 2: runGeneration's guard. When the cost is not known at the point of charging, the
// page stays on the generating screen as generation_failed with the notice; "Try again" waits for
// the cost, then retries from the saved form data. Nothing is charged before that.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
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
  default: ({ onSubmit }: { onSubmit: (d: Record<string, unknown>) => void }) => (
    <button type="button" data-testid="submit-form" onClick={() => onSubmit({ client: 'A' })}>
      Generate document
    </button>
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
function route() {
  let n = 0;
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/enabled') return Promise.resolve(ok({ enabled }));
    if (path === '/api/documents/template-configs') {
      const body = configLists[Math.min(n, configLists.length - 1)];
      n += 1;
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

const probe = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
const retryBtn = () =>
  container.querySelector(
    'button[aria-describedby="generation-failed-retry-ink-cost"]',
  ) as HTMLButtonElement;
const costRetryLink = () =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === INK_COST_RECHECK && !b.hasAttribute('aria-describedby'),
  ) as HTMLButtonElement;

describe('new page: the runGeneration guard (AC3)', () => {
  it('cost lost before the charge: generation_failed with the notice, nothing POSTed, then Try again waits for the cost and retries from the saved form', async () => {
    // 1: cost known at mount; 2: the refetch comes back without a cost; 3: the next one has it.
    configLists = [
      { templates: [tpl(3)] },
      { templates: [tpl(undefined)] },
      { templates: [tpl(3)] },
    ];
    verdict = { verdict: 'soft', questions: ['Check the dates'] };
    route();
    await toForm();
    await submit();
    expect(generateCalls()).toHaveLength(0);
    expect(container.querySelector('#soft-warn-ink-cost')?.textContent).toBe('Uses 3 Ink');

    // the cost goes away (a refetch that carries none)
    await act(async () => probe('probe-refetch').click());
    await flush();
    expect(container.querySelector('#soft-warn-ink-cost')?.textContent).toBe(INK_COST_UNKNOWN);

    // a click that still reaches "generate anyway" hits the guard
    await act(async () => probe('probe-proceed').click());
    await flush();
    expect(generateCalls()).toHaveLength(0);
    // the card body is Meera's line, exactly; the cost notice shows once, in the cost line
    const bodies = Array.from(container.querySelectorAll('div')).filter(
      (el) => el.children.length === 0 && el.textContent === NOT_STARTED_LINE,
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0].closest('#generation-failed-retry-ink-cost')).toBeNull();
    const count = (t: string) => (container.textContent ?? '').split(t).length - 1;
    expect(count(NOT_STARTED_LINE)).toBe(1);
    expect(count(INK_COST_UNKNOWN)).toBe(1);
    const failedLine = container.querySelector('#generation-failed-retry-ink-cost');
    expect(failedLine?.textContent).toBe(INK_COST_UNKNOWN);
    expect(retryBtn().disabled).toBe(true);
    expect(retryBtn().getAttribute('aria-disabled')).toBe('true');
    // still on the generating screen, not bounced to an empty form
    expect(container.querySelector('[data-testid="submit-form"]')).toBeNull();

    // Try again is held while the cost is unknown
    await act(async () => retryBtn().click());
    await flush();
    expect(generateCalls()).toHaveLength(0);

    // the cost loads
    await act(async () => costRetryLink().click());
    await flush();
    expect(container.querySelector('#generation-failed-retry-ink-cost')?.textContent).toBe(
      'Uses 3 Ink',
    );
    expect(retryBtn().disabled).toBe(false);
    expect(generateCalls()).toHaveLength(0);

    // and Try again now charges once, from the form data that was saved
    await act(async () => retryBtn().click());
    await flush();
    expect(generateCalls()).toHaveLength(1);
    expect(JSON.parse(generateCalls()[0][2].body)).toMatchObject({
      template_id: 'bail_regular',
      form_data: { client: 'A' },
    });
  });
});
