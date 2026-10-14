// T-388: the new-document page never starts a charge without a known Ink cost, and the cost shown
// on "Try again" / "generate anyway" is the template's credits_cost from template-configs.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

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
const preflightCalls = () =>
  mockApiFetch.mock.calls.filter((c) => c[0] === '/api/documents/preflight');

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

describe('new page: no charge without a known Ink cost', () => {
  it('handleSubmit: credits_cost missing -> no preflight, no POST /generate-from-template', async () => {
    configLists = [{ templates: [tpl(undefined)] }];
    route();
    await toForm();
    await submit();
    expect(preflightCalls()).toHaveLength(0);
    expect(generateCalls()).toHaveLength(0);
    expect(container.querySelector('[data-testid="submit-form"]')).not.toBeNull(); // still on the form
  });

  it.each([0, -2])('handleSubmit: credits_cost %p is not a cost -> nothing starts', async (c) => {
    configLists = [{ templates: [tpl(c)] }];
    route();
    await toForm();
    await submit();
    expect(preflightCalls()).toHaveLength(0);
    expect(generateCalls()).toHaveLength(0);
  });

  it('credits_cost missing and the preflight would fail open -> still no POST', async () => {
    configLists = [{ templates: [tpl(undefined)] }];
    route();
    const base = mockApiFetch.getMockImplementation() as (p: string) => Promise<unknown>;
    mockApiFetch.mockImplementation((p: string) =>
      p === '/api/documents/preflight' ? Promise.reject(new Error('offline')) : base(p),
    );
    await toForm();
    await submit();
    expect(generateCalls()).toHaveLength(0);
  });

  it('credits_cost present: preflight pass -> POST /generate-from-template once', async () => {
    configLists = [{ templates: [tpl(3)] }];
    route();
    await toForm();
    await submit();
    expect(preflightCalls()).toHaveLength(1);
    expect(generateCalls()).toHaveLength(1);
    expect(JSON.parse(generateCalls()[0][2].body).template_id).toBe('bail_regular');
  });

  it('credits_cost present: a failing preflight still fails open to the POST', async () => {
    configLists = [{ templates: [tpl(3)] }];
    route();
    const base = mockApiFetch.getMockImplementation() as (p: string) => Promise<unknown>;
    mockApiFetch.mockImplementation((p: string) =>
      p === '/api/documents/preflight'
        ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
        : base(p),
    );
    await toForm();
    await submit();
    expect(generateCalls()).toHaveLength(1);
  });
});

describe('new page: the cost shown equals the template credits_cost', () => {
  it('generation-failed "Try again" shows credits_cost and retries the charge', async () => {
    configLists = [{ templates: [tpl(3)] }];
    route();
    await toForm();
    await submit(); // generate answers 500 -> generation_failed card
    const retry = container.querySelector(
      'button[aria-describedby="generation-failed-retry-ink-cost"]',
    ) as HTMLButtonElement;
    expect(retry).not.toBeNull();
    expect(container.querySelector('#generation-failed-retry-ink-cost')?.textContent).toBe(
      'Uses 3 Ink',
    );
    expect(retry.disabled).toBe(false);
    await act(async () => retry.click());
    await flush();
    expect(generateCalls()).toHaveLength(2);
  });

  it('a different credits_cost shows a different number (no literal in the JSX)', async () => {
    configLists = [{ templates: [tpl(7)] }];
    route();
    await toForm();
    await submit();
    expect(container.querySelector('#generation-failed-retry-ink-cost')?.textContent).toBe(
      'Uses 7 Ink',
    );
  });

  it('soft-warn buttons show credits_cost; clicking one POSTs once', async () => {
    configLists = [{ templates: [tpl(4)] }];
    verdict = { verdict: 'soft', questions: ['Check the dates'] };
    route();
    await toForm();
    await submit();
    expect(generateCalls()).toHaveLength(0);
    expect(container.querySelector('#soft-warn-ink-cost')?.textContent).toBe('Uses 4 Ink');
    expect(container.querySelector('#soft-warn-skip-ink-cost')?.textContent).toBe('Uses 4 Ink');
    await act(async () => buttonWith('Looks correct')?.click());
    await flush();
    expect(generateCalls()).toHaveLength(1);
  });
});

describe('new page: the one flow gets the costs and a way to fetch them again', () => {
  it('passes inkCostLoading true while the fetch is in flight, then false', async () => {
    enabled = true;
    configLists = [{ templates: [tpl(2)], guided_credits_cost: 2 }];
    route();
    const base = mockApiFetch.getMockImplementation() as (p: string) => Promise<unknown>;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    mockApiFetch.mockImplementation((p: string) =>
      p === '/api/documents/template-configs' ? gate.then(() => base(p)) : base(p),
    );
    await act(async () => {
      root.render(<NewDocumentPage />);
    });
    await flush();
    const last = () => oneFlowProps.mock.calls[oneFlowProps.mock.calls.length - 1][0];
    expect(last().inkCostLoading).toBe(true);
    expect(typeof last().onInkCostRetry).toBe('function');
    await act(async () => release());
    await flush();
    expect(last().inkCostLoading).toBe(false);
    expect(last().kinds[0].credits_cost).toBe(2);
  });

  it('onInkCostRetry fetches template-configs again and the new costs reach OneFlow', async () => {
    enabled = true;
    configLists = [
      { templates: [tpl(undefined)] },
      { templates: [tpl(2)], guided_credits_cost: 2 },
    ];
    route();
    await act(async () => {
      root.render(<NewDocumentPage />);
    });
    await flush();
    const last = () => oneFlowProps.mock.calls[oneFlowProps.mock.calls.length - 1][0];
    expect(last().kinds[0].credits_cost).toBeUndefined();
    expect(last().guidedInkCost).toBeUndefined();
    await act(async () => last().onInkCostRetry());
    await flush();
    const fetches = mockApiFetch.mock.calls.filter(
      (c) => c[0] === '/api/documents/template-configs',
    );
    expect(fetches).toHaveLength(2);
    expect(last().kinds[0].credits_cost).toBe(2);
    expect(last().guidedInkCost).toBe(2);
    expect(last().inkCostLoading).toBe(false);
  });

  it('a failed re-fetch leaves the cost unknown and does not show the page error', async () => {
    enabled = true;
    configLists = [{ templates: [tpl(undefined)] }];
    route();
    await act(async () => {
      root.render(<NewDocumentPage />);
    });
    await flush();
    const last = () => oneFlowProps.mock.calls[oneFlowProps.mock.calls.length - 1][0];
    mockApiFetch.mockImplementation(() => Promise.reject(new Error('offline')));
    await act(async () => last().onInkCostRetry());
    await flush();
    expect(last().inkCostLoading).toBe(false);
    expect(last().kinds[0].credits_cost).toBeUndefined();
    expect(container.textContent).not.toContain('Could not connect');
  });
});
