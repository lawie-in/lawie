// T-637 (Arjun option B), web side: the server withholds a form draft with one signed question
// (fact_needed, past_date_in_prayer) and the page shows it; the paragraph count comes from
// done.paragraphCount, not from streamed text.
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

const QUESTION = 'One detail is needed before the draft: Residential Address.';
const sse = (chunks: string[]) => ({
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
const errorEvent = (code: string, reason: string, retryable = false) =>
  `event: error\ndata: ${JSON.stringify({ code, reason, retryable })}\n\n`;

describe('T-637 new page: a withheld draft shows the server question', () => {
  it.each([
    ['fact_needed', QUESTION],
    [
      'past_date_in_prayer',
      'The prayer refers to 20 October 2026, which has already passed. What should the defendant be restrained from?',
    ],
  ])(
    '%s: the server reason is the headline; no Try again / Retry; Edit the form kept',
    async (code, reason) => {
      mockPrivacyFetch.mockResolvedValue(sse([errorEvent(code, reason)]));
      await submitOneStepForm();
      expect(text()).toContain(reason);
      expect(text()).not.toContain('The draft did not finish.');
      expect(labels()).not.toContain('Try again');
      expect(labels()).not.toContain('Retry');
      expect(labels()).toContain('Edit the form');
    },
  );

  it('another error code keeps its signed lines and Try again', async () => {
    mockPrivacyFetch.mockResolvedValue(
      sse([errorEvent('generation_failed', 'Raw upstream reason', true)]),
    );
    await submitOneStepForm();
    expect(text()).toContain('The draft did not finish.');
    expect(labels()).toContain('Try again');
  });
});

describe('T-637 new page: paragraph count from done.paragraphCount', () => {
  it('shows the done payload count with no text chunk streamed', async () => {
    mockPrivacyFetch.mockResolvedValue(
      sse(['event: done\ndata: {"docId":"d1","paragraphCount":7}\n\n']),
    );
    await submitOneStepForm();
    expect(text()).toContain('7 paragraphs.');
  });

  it('a streamed text chunk no longer counts paragraphs', async () => {
    mockPrivacyFetch.mockResolvedValue(
      sse(['data: {"text":"a\\n\\nb\\n\\nc\\n\\nd"}\n\n', 'event: done\ndata: {"docId":"d1"}\n\n']),
    );
    await submitOneStepForm();
    expect(text()).toContain('Draft ready');
    expect(text()).not.toMatch(/\d+ paragraphs\./);
  });
});
