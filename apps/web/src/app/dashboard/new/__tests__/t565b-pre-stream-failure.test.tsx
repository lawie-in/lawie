// T-565 wave 2a, W3/W6/W7 (Ajay, pre-Anushka legal review 22 Oct), pre-stream failures from
// generate-from-template (the raw server reason is never shown):
//   409 -> `Check your documents list to see where this draft stands.` alone, no Retry (W6)
//   plan-gate 403 (body has an `upgradeUrl` string, or `error` matches /requires an? .*plan/i)
//     -> `This document is not available on your current plan.` alone, no Retry (W7)
//   any other 400/403, 404, 5xx -> `Something did not work. Try again.` + `Retry` (W3)
// The privacy-gate 403 (T-343 prompt) and the 402 paths are unchanged.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import NewDocumentPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/components/intake/OneFlow', () => ({
  __esModule: true,
  default: () => <div data-testid="one-flow" />,
}));
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'A', email: 'a@example.com', plan: 'free' } }),
}));
jest.mock('@/components/credits/PaywallModal', () => ({
  PaywallModal: () => <div data-testid="paywall" />,
}));
let mockVerifyInstead = false;
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyInsteadOfPaywall: async () => mockVerifyInstead,
  openVerifyIfDraftRefused: async () => false,
}));
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: (res: { privacyBlocked?: boolean }) => Boolean(res?.privacyBlocked),
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const GENERATE = '/api/documents/generate-from-template';
const RAW = 'Raw server reason: template locked for plan';
const LINE = 'Something did not work. Try again.';

const reply = (status: number, body: unknown, extra: Record<string, unknown> = {}) => ({
  ok: false,
  status,
  headers: { get: () => null },
  json: async () => body,
  ...extra,
});
const generateCalls = () => mockPrivacyFetch.mock.calls.filter((c) => c[1] === GENERATE);

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const labels = () =>
  Array.from(container.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
const buttonWith = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(t),
  ) as HTMLButtonElement | undefined;
const click = async (t: string) => {
  const b = buttonWith(t);
  if (!b) throw new Error(`no button "${t}" in: ${container.textContent}`);
  await act(async () => b.click());
  await flush();
};
const text = () => container.textContent ?? '';
const count = (needle: string) => text().split(needle).length - 1;

async function submitOneStepForm() {
  await act(async () => {
    root.render(<NewDocumentPage />);
  });
  await flush();
  await click('One step');
  await click('Generate document');
}

// jsdom has no TextEncoder/TextDecoder; the page decodes the SSE stream with them.
beforeAll(() => {
  const util = jest.requireActual('util') as typeof import('util');
  Object.assign(globalThis, { TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyInstead = false;
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/enabled') return Promise.resolve(ok({ enabled: false }));
    if (path === '/api/documents/template-configs')
      return Promise.resolve(
        ok({
          templates: [
            {
              template_id: 'one_step',
              display_name: 'One step',
              description: '',
              icon: 'FileText',
              plan_access: 'free',
              supported_languages: ['en'],
              catalogueCategory: 'civil',
              catalogueCategoryName: 'Civil',
              catalogueCategoryOrder: 1,
              credits_cost: 3,
            },
          ],
        }),
      );
    if (path === '/api/documents/template-configs/one_step')
      return Promise.resolve(
        ok({
          config: {
            template_id: 'one_step',
            display_name: 'One step',
            supported_languages: ['en'],
            form_schema: {
              steps: [
                {
                  step: 1,
                  title: 'Step 1',
                  fields: [{ field_id: 'f1', label: 'Field 1', type: 'text', required: false }],
                },
              ],
            },
          },
        }),
      );
    if (path === '/api/documents/preflight') return Promise.resolve(ok({ verdict: 'pass' }));
    return Promise.resolve(ok({}));
  });
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ states: [], courts: [], types: [] }),
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

const DOCS_LIST = 'Check your documents list to see where this draft stands.';
const PLAN_LINE = 'This document is not available on your current plan.';
const noRetry = () => {
  expect(labels()).not.toContain('Retry');
  expect(labels()).not.toContain('Try again');
  expect(labels()).toContain('Edit the form');
};

describe('T-565 W6: 409 (a draft for this run is already in progress)', () => {
  it('shows the documents-list line alone, no Retry, never the raw reason', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(409, { error: RAW }));
    await submitOneStepForm();
    expect(count(DOCS_LIST)).toBe(1);
    expect(text()).not.toContain(LINE);
    expect(text()).not.toContain('The draft did not finish.');
    expect(text()).not.toContain(RAW);
    expect(text()).not.toContain('Generation could not start');
    noRetry();
  });

  it('never makes a second request (no double Ink hold)', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(409, { error: RAW }));
    await submitOneStepForm();
    await flush();
    expect(generateCalls()).toHaveLength(1);
    expect(buttonWith('Retry')).toBeUndefined();
    expect(buttonWith('Try again')).toBeUndefined();
  });

  it('a body with `message`, or with no JSON, shows the same line', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(409, { message: RAW }));
    await submitOneStepForm();
    expect(count(DOCS_LIST)).toBe(1);
    expect(text()).not.toContain(RAW);
    act(() => root.unmount());
    root = createRoot(container);
    mockPrivacyFetch.mockResolvedValue(
      reply(409, null, {
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await submitOneStepForm();
    expect(count(DOCS_LIST)).toBe(1);
    noRetry();
  });
});

describe('T-565 W7: plan-gate 403', () => {
  it.each([
    ['an upgradeUrl string', { error: RAW, upgradeUrl: '/pricing' }],
    ['the route text `requires a Pro plan`', { error: 'This template requires a Pro plan' }],
    ['`requires an Enterprise plan`, any case', { error: 'REQUIRES AN Enterprise PLAN to use' }],
  ])('%s: the signed plan line alone, no Retry', async (_n, body) => {
    mockPrivacyFetch.mockResolvedValue(reply(403, body));
    await submitOneStepForm();
    expect(count(PLAN_LINE)).toBe(1);
    expect(text()).not.toContain(LINE);
    expect(text()).not.toContain(RAW);
    expect(text()).not.toContain('requires a');
    expect(generateCalls()).toHaveLength(1);
    noRetry();
  });

  it('an upgradeUrl that is not a string does not make it a plan gate', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(403, { error: RAW, upgradeUrl: 5 }));
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(text()).not.toContain(PLAN_LINE);
    expect(labels()).toContain('Retry');
  });

  it('a 400 with plan-gate text is not a plan gate (only a 403 is)', async () => {
    mockPrivacyFetch.mockResolvedValue(
      reply(400, { error: 'requires a Pro plan', upgradeUrl: '/x' }),
    );
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(text()).not.toContain(PLAN_LINE);
    expect(labels()).toContain('Retry');
  });
});

describe('T-565 W3: other pre-stream failures', () => {
  it.each([
    [400, { error: RAW }],
    [403, { error: RAW }],
    [403, { error: 'Forbidden' }],
    [403, {}],
    [404, { error: RAW }],
    [500, { error: RAW }],
    [502, { error: RAW }],
    [503, { error: RAW }],
  ])('%s %j: the generic line, a Retry button, never the raw reason', async (status, body) => {
    mockPrivacyFetch.mockResolvedValue(reply(status, body));
    await submitOneStepForm();
    expect(generateCalls()).toHaveLength(1);
    expect(count(LINE)).toBe(1);
    expect(text()).not.toContain(RAW);
    expect(text()).not.toContain('Generation could not start');
    expect(text()).not.toContain('The draft did not finish.');
    expect(text()).not.toContain(DOCS_LIST);
    expect(text()).not.toContain(PLAN_LINE);
    expect(labels()).toContain('Retry');
    expect(labels()).not.toContain('Try again');
    expect(labels()).toContain('Edit the form');
  });

  it('a body with `message` instead of `error`, or no JSON body, shows the same line', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(400, { message: RAW }));
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(text()).not.toContain(RAW);
    act(() => root.unmount());
    root = createRoot(container);
    mockPrivacyFetch.mockResolvedValue(
      reply(403, null, {
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(labels()).toContain('Retry');
  });

  it('Retry re-runs the request, and a second failure shows the same line again', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(400, { error: RAW }));
    await submitOneStepForm();
    expect(generateCalls()).toHaveLength(1);
    await click('Retry');
    expect(generateCalls()).toHaveLength(2);
    expect(count(LINE)).toBe(1);
    expect(labels()).toContain('Retry');
    expect(text()).not.toContain(RAW);
  });

  it('Retry resends the same form answers', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(500, { error: RAW }));
    await submitOneStepForm();
    await click('Retry');
    const [first, second] = generateCalls().map((c) => JSON.parse((c[2] as { body: string }).body));
    expect(second.template_id).toBe(first.template_id);
    expect(second.form_data).toEqual(first.form_data);
  });

  it('Retry that then succeeds leaves the failure card', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(reply(400, { error: RAW }));
    await submitOneStepForm();
    const chunks = ['event: done\ndata: {"docId":"d1","paragraphCount":2}\n\n'];
    mockPrivacyFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => {
          let i = 0;
          return {
            read: async () =>
              i < chunks.length
                ? { done: false, value: new TextEncoder().encode(chunks[i++]) }
                : { done: true, value: undefined },
          };
        },
      },
    });
    await click('Retry');
    expect(text()).not.toContain(LINE);
  });
});

describe('T-565 W3: gates unchanged', () => {
  it('privacy-gate 403: back to the form (T-343 prompt), no failure card', async () => {
    mockPrivacyFetch.mockResolvedValue({ ...reply(403, { error: RAW }), privacyBlocked: true });
    await submitOneStepForm();
    expect(generateCalls()).toHaveLength(1);
    expect(text()).not.toContain(LINE);
    expect(labels()).not.toContain('Retry');
    expect(labels()).toContain('Generate document');
  });

  it('402 with a cost: the paywall opens over the form, no failure card', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1, totalInk: 1 } }));
    await submitOneStepForm();
    expect(container.querySelector('[data-testid="paywall"]')).not.toBeNull();
    expect(text()).not.toContain(LINE);
    expect(labels()).not.toContain('Retry');
  });

  it('402 for an unverified email: the verify modal path returns to the form, no failure card', async () => {
    mockVerifyInstead = true;
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1, totalInk: 1 } }));
    await submitOneStepForm();
    expect(container.querySelector('[data-testid="paywall"]')).toBeNull();
    expect(text()).not.toContain(LINE);
    expect(labels()).toContain('Generate document');
  });

  it.each([405, 408, 410, 413, 415, 422])(
    'a %s (any other non-OK status): the generic line + Retry, not the stream card',
    async (status) => {
      mockPrivacyFetch.mockResolvedValue(reply(status, { error: RAW }));
      await submitOneStepForm();
      expect(count(LINE)).toBe(1);
      expect(text()).not.toContain('The draft did not finish.');
      expect(text()).not.toContain(RAW);
      expect(labels()).toContain('Retry');
      expect(labels()).not.toContain('Try again');
    },
  );

  it('a 3xx non-OK reply: the generic line + Retry', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(302, {}));
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(labels()).toContain('Retry');
  });
});

const streamReply = (chunks: string[], failAfter?: number, empty?: boolean) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  body: {
    getReader: () => {
      let i = 0;
      return {
        read: async () => {
          if (failAfter !== undefined && i >= failAfter) throw new Error('socket reset');
          if (i >= chunks.length) return { done: true, value: undefined };
          const chunk = chunks[i];
          i += 1;
          return {
            done: false,
            value: empty ? new Uint8Array(0) : new TextEncoder().encode(chunk),
          };
        },
      };
    },
  },
});

describe('T-565 round 3: more pre-stream failures are request_failed', () => {
  it.each([
    [401, { error: RAW }],
    [402, { error: RAW }],
    [429, { error: RAW }],
  ])(
    '%s with no paywall data and no verify gate: the generic line + Retry',
    async (status, body) => {
      mockPrivacyFetch.mockResolvedValue(reply(status, body));
      await submitOneStepForm();
      expect(count(LINE)).toBe(1);
      expect(text()).not.toContain(RAW);
      expect(text()).not.toContain('The draft did not finish.');
      expect(container.querySelector('[data-testid="paywall"]')).toBeNull();
      expect(labels()).toContain('Retry');
      expect(labels()).not.toContain('Try again');
    },
  );

  it('a 200 with no body: the generic line + Retry', async () => {
    mockPrivacyFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
    });
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(labels()).toContain('Retry');
    expect(text()).not.toContain('The draft did not finish.');
  });

  it('the fetch throwing before any data: the generic line + Retry, never the error message', async () => {
    mockPrivacyFetch.mockRejectedValue(new Error('network down secret'));
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(labels()).toContain('Retry');
    expect(text()).not.toContain('network down secret');
  });

  it('the read throwing before the first chunk: the generic line + Retry', async () => {
    mockPrivacyFetch.mockResolvedValue(streamReply([], 0));
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(labels()).toContain('Retry');
    expect(text()).not.toContain('The draft did not finish.');
  });

  it('an empty first chunk is not data: a throw after it is still the generic line', async () => {
    mockPrivacyFetch.mockResolvedValue(streamReply(['x'], 1, true));
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(labels()).toContain('Retry');
  });

  it('the read throwing AFTER the first chunk: the stream card with Try again', async () => {
    mockPrivacyFetch.mockResolvedValue(
      streamReply(['event: message\ndata: {"text":"partial"}\n\n'], 1),
    );
    await submitOneStepForm();
    expect(text()).toContain('The draft did not finish.');
    expect(text()).not.toContain(LINE);
    expect(labels()).toContain('Try again');
    expect(labels()).not.toContain('Retry');
  });

  it('the paywall 402 (with data), the verify 402 and the privacy 403 are unchanged', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1, totalInk: 1 } }));
    await submitOneStepForm();
    expect(container.querySelector('[data-testid="paywall"]')).not.toBeNull();
    expect(text()).not.toContain(LINE);
  });
});
