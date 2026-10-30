// T-686: a 503 {error:'court_unavailable'} from the start request shows `Court unavailable, try again`
// with Retry; any other 503 keeps the generic line; a later attempt does not keep a stale code.
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

const COURT_LINE = 'Court unavailable, try again';
const COURT_BODY = {
  error: 'court_unavailable',
  code: 'court_unavailable',
  reason: COURT_LINE,
  retryable: true,
  runId: 'run-1',
};

describe('T-686: court_unavailable from the start request', () => {
  it('503 court_unavailable: the court line and a Retry, not the generic line', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(503, COURT_BODY));
    await submitOneStepForm();
    expect(generateCalls()).toHaveLength(1);
    expect(count(COURT_LINE)).toBe(1);
    expect(text()).not.toContain(LINE);
    expect(labels()).toContain('Retry');
    expect(labels()).toContain('Edit the form');
  });

  it('a 503 with another error keeps the generic line', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(503, { error: RAW }));
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(text()).not.toContain(COURT_LINE);
    expect(labels()).toContain('Retry');
  });

  it('Retry re-sends the request; a following generic failure drops the court line', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(reply(503, COURT_BODY));
    await submitOneStepForm();
    expect(count(COURT_LINE)).toBe(1);
    mockPrivacyFetch.mockResolvedValue(reply(500, { error: RAW }));
    await click('Retry');
    expect(generateCalls()).toHaveLength(2);
    expect(count(LINE)).toBe(1);
    expect(text()).not.toContain(COURT_LINE);
  });

  it('a following 500 with no JSON body also drops the stale code', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(reply(503, COURT_BODY));
    await submitOneStepForm();
    mockPrivacyFetch.mockResolvedValue(
      reply(500, null, {
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await click('Retry');
    expect(text()).not.toContain(COURT_LINE);
    expect(count(LINE)).toBe(1);
  });

  it('Retry that then succeeds leaves the court card', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(reply(503, COURT_BODY));
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
    expect(text()).not.toContain(COURT_LINE);
  });
});
