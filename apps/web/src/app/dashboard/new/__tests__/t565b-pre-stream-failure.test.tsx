// T-565 wave 2a, W3 (Ajay, pre-Anushka legal review 22 Oct): a pre-stream 400/403/409 from
// generate-from-template shows `Something did not work. Try again.` with a `Retry` button, never
// the raw server reason. The privacy-gate 403 (T-343 prompt) and the 402 paths are unchanged.
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

describe('T-565 W3: pre-stream 400/403/409', () => {
  it.each([400, 403, 409])(
    '%s: the generic line, a Retry button, never the raw reason',
    async (status) => {
      mockPrivacyFetch.mockResolvedValue(reply(status, { error: RAW }));
      await submitOneStepForm();
      expect(generateCalls()).toHaveLength(1);
      expect(count(LINE)).toBe(1);
      expect(text()).not.toContain(RAW);
      expect(text()).not.toContain('Generation could not start');
      expect(text()).not.toContain('The draft did not finish.');
      expect(labels()).toContain('Retry');
      expect(labels()).not.toContain('Try again');
      expect(labels()).toContain('Edit the form');
      expect(text()).not.toContain('Drafting could not finish');
    },
  );

  it('a body with `message` instead of `error`, or no JSON body, shows the same line', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(409, { message: RAW }));
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
    expect(text()).not.toContain(RAW);
    act(() => root.unmount());
    root = createRoot(container);
    mockPrivacyFetch.mockResolvedValue(
      reply(400, null, {
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await submitOneStepForm();
    expect(count(LINE)).toBe(1);
  });

  it('Retry re-runs the request, and a second failure shows the same line again', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(409, { error: RAW }));
    await submitOneStepForm();
    expect(generateCalls()).toHaveLength(1);
    await click('Retry');
    expect(generateCalls()).toHaveLength(2);
    expect(count(LINE)).toBe(1);
    expect(labels()).toContain('Retry');
    expect(text()).not.toContain(RAW);
  });

  it('Retry resends the same form answers', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(403, { error: RAW }));
    await submitOneStepForm();
    await click('Retry');
    const [first, second] = generateCalls().map((c) => JSON.parse((c[2] as { body: string }).body));
    expect(second.template_id).toBe(first.template_id);
    expect(second.form_data).toEqual(first.form_data);
  });

  it('Retry that then succeeds leaves the failure card', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(reply(409, { error: RAW }));
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
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1 } }));
    await submitOneStepForm();
    expect(container.querySelector('[data-testid="paywall"]')).not.toBeNull();
    expect(text()).not.toContain(LINE);
    expect(labels()).not.toContain('Retry');
  });

  it('402 for an unverified email: the verify modal path returns to the form, no failure card', async () => {
    mockVerifyInstead = true;
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1 } }));
    await submitOneStepForm();
    expect(container.querySelector('[data-testid="paywall"]')).toBeNull();
    expect(text()).not.toContain(LINE);
    expect(labels()).toContain('Generate document');
  });

  it('a 500 is not a request failure: the stream card, `Try again`, no raw reason', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(500, { error: RAW }));
    await submitOneStepForm();
    expect(text()).toContain('The draft did not finish.');
    expect(text()).not.toContain(LINE);
    expect(labels()).toContain('Try again');
    expect(labels()).not.toContain('Retry');
    expect(text()).not.toContain(RAW);
  });
});
