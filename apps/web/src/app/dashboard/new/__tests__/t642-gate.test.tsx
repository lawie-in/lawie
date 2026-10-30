// T-642 AC8 (AJ-642-M3/M6): the form page's generate (handleSubmit and runGeneration/Retry) sends
// no preflight and no generate while the Google sign-up consent is needed; the panel's checkbox
// gets focus. Unchanged when not needed. Harness copied from t522-verify-403.test.tsx.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import NewDocumentPage from '../page';

import SignupConsentPrompt from '@/components/SignupConsentPrompt';
import { refreshSignupConsent, resetSignupConsent } from '@/lib/signupConsent';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/components/intake/OneFlow', () => ({
  __esModule: true,
  default: () => <div data-testid="one-flow" />,
}));
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'A', email: 'alice@example.com', plan: 'free' },
    isLoading: false,
  }),
}));
jest.mock('@/components/credits/PaywallModal', () => ({
  PaywallModal: () => <div data-testid="paywall" />,
}));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: (res: { privacyBlocked?: boolean }) => Boolean(res?.privacyBlocked),
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));
const mockPrivacyFetch = jest.fn();
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

// AJ-522-M6 / S14, copied from handoff/legal/T-511-copy-rulings-ajay.md.
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const GENERATE = '/api/documents/generate-from-template';

const tpl = (id: string, name: string) => ({
  template_id: id,
  display_name: name,
  description: '',
  icon: 'FileText',
  plan_access: 'free',
  supported_languages: ['en'],
  catalogueCategory: 'civil',
  catalogueCategoryName: 'Civil',
  catalogueCategoryOrder: 1,
  credits_cost: 3,
});

/** A form of `n` steps, one text field per step: "Field 1", "Field 2", ... */
const textConfig = (id: string, name: string, n: number) => ({
  template_id: id,
  display_name: name,
  supported_languages: ['en'],
  form_schema: {
    steps: Array.from({ length: n }, (_, i) => ({
      step: i + 1,
      title: `Step ${i + 1}`,
      fields: [{ field_id: `f${i + 1}`, label: `Field ${i + 1}`, type: 'text', required: false }],
    })),
  },
});
const consumerConfig = {
  template_id: 'consumer_complaint',
  display_name: 'Consumer complaint',
  supported_languages: ['en'],
  form_schema: {
    steps: [
      {
        step: 1,
        title: 'Court',
        fields: [
          {
            field_id: 'state',
            label: 'State',
            type: 'dropdown_search',
            source: 'courts_db.states',
            required: false,
          },
          {
            field_id: 'court_type',
            label: 'Court Type',
            type: 'dropdown',
            source: 'courts_db.court_types',
            required: false,
          },
          {
            field_id: 'court_name',
            label: 'Court',
            type: 'dropdown_search',
            source: 'courts_db.courts',
            required: false,
          },
        ],
      },
      {
        step: 2,
        title: 'Facts',
        fields: [{ field_id: 'facts', label: 'Facts', type: 'text', required: false }],
      },
    ],
  },
};

let needs = true;
let configs: Record<string, unknown>;
let preflightReply: unknown;
let verdict: { verdict: 'pass' | 'soft' | 'hard'; questions?: string[]; hardBlockReason?: string };
function route() {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/enabled') return Promise.resolve(ok({ enabled: false }));
    if (path === '/api/documents/template-configs')
      return Promise.resolve(
        ok({
          templates: [
            tpl('alpha', 'Alpha notice'),
            tpl('beta', 'Beta notice'),
            tpl('one_step', 'One step'),
            tpl('consumer_complaint', 'Consumer complaint'),
          ],
        }),
      );
    const m = /^\/api\/documents\/template-configs\/(.+)$/.exec(path);
    if (m) return Promise.resolve(ok({ config: configs[m[1]] }));
    if (path === '/api/documents/preflight') {
      return Promise.resolve(preflightReply ?? ok(verdict));
    }
    if (path === '/api/auth/me')
      return Promise.resolve(ok({ data: { needsSignupConsent: needs } }));
    return Promise.resolve(ok({}));
  });
}
const generateCalls = () => mockPrivacyFetch.mock.calls.filter((c) => c[1] === GENERATE);
const reply = (status: number, body: unknown, extra: Record<string, unknown> = {}) => ({
  ok: false,
  status,
  headers: { get: () => null },
  json: async () => body,
  clone() {
    return this;
  },
  ...extra,
});

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
const click = async (t: string) => {
  const b = buttonWith(t);
  if (!b) throw new Error(`no button "${t}" in: ${container.textContent}`);
  await act(async () => b.click());
  await flush();
};
const field = () => container.querySelector('input[type="text"]') as HTMLInputElement;
async function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(field(), value);
    field().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const text = () => container.textContent ?? '';

/** Type an answer on each of 3 steps and stop on the last one, ready to submit. */
async function fillThreeSteps() {
  await type('one');
  await click('Next');
  await type('two');
  await click('Next');
  await type('three');
}

beforeEach(() => {
  jest.clearAllMocks();
  needs = true;
  resetSignupConsent();
  Element.prototype.scrollIntoView = jest.fn();
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as never;
  verdict = { verdict: 'pass' };
  preflightReply = undefined;
  configs = {
    alpha: textConfig('alpha', 'Alpha notice', 3),
    beta: textConfig('beta', 'Beta notice', 3),
    one_step: textConfig('one_step', 'One step', 1),
    consumer_complaint: consumerConfig,
  };
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ states: [], courts: [], types: [] }),
  }));
  route();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

async function openAlpha() {
  await act(async () => {
    root.render(
      <>
        <SignupConsentPrompt />
        <NewDocumentPage />
      </>,
    );
  });
  await flush();
  await click('Alpha notice');
}
const preflightCalls = () =>
  mockApiFetch.mock.calls.filter((c) => c[0] === '/api/documents/preflight');
const consentBox = () => document.getElementById('signup-consent-box');
const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

describe('T-642: form page generate', () => {
  it('needed: Generate sends no preflight and no generate, the checkbox gets focus, answers kept', async () => {
    await openAlpha();
    await fillThreeSteps();
    await click('Generate document');
    await wait(5);
    expect(preflightCalls()).toHaveLength(0);
    expect(generateCalls()).toHaveLength(0);
    expect(document.activeElement).toBe(consentBox());
    expect(text()).toContain('Field 3');
    expect(field().value).toBe('three');
  });

  it('not needed: Generate behaves as before (preflight, then generate)', async () => {
    needs = false;
    mockPrivacyFetch.mockResolvedValue(ok({ success: true }));
    await openAlpha();
    await fillThreeSteps();
    await click('Generate document');
    expect(preflightCalls()).toHaveLength(1);
    expect(generateCalls()).toHaveLength(1);
  });

  it('Retry after a failed generate is fenced when consent became needed', async () => {
    needs = false;
    mockPrivacyFetch.mockResolvedValue(reply(500, { error: 'boom' }));
    await openAlpha();
    await fillThreeSteps();
    await click('Generate document');
    expect(generateCalls()).toHaveLength(1);
    needs = true;
    await act(async () => void (await refreshSignupConsent()));
    await flush();
    const retry = buttonWith('Retry') ?? buttonWith('Try again');
    if (!retry) throw new Error(`no Retry button in: ${text()}`);
    await act(async () => retry.click());
    await flush();
    expect(generateCalls()).toHaveLength(1);
  });

  it('unknown state (no panel): Generate is let through', async () => {
    mockPrivacyFetch.mockResolvedValue(ok({ success: true }));
    await act(async () => {
      root.render(<NewDocumentPage />);
    });
    await flush();
    await click('Alpha notice');
    await fillThreeSteps();
    await click('Generate document');
    expect(generateCalls()).toHaveLength(1);
  });
});
