// T-664 (Ajay AJ-664-M1): every balance the web shows is `totalInk` (the figure the spend gate,
// the 402 message and OneFlow use), never `balance.total`, which includes the hidden legacy
// earnedCredits. A missing or non-numeric totalInk shows 0, never `total`. No copy change.
import { readFileSync } from 'fs';
import { join } from 'path';

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
// The paywall renders the signed sentence from the props the page hands it.
jest.mock('@/components/credits/PaywallModal', () => ({
  PaywallModal: ({ cost, balance }: { cost: number; balance: number }) => (
    <div data-testid="paywall">{`This draft costs ${cost} Ink — you have ${balance}.`}</div>
  ),
}));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyInsteadOfPaywall: async () => false,
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
const reply = (status: number, body: unknown) => ({
  ok: false,
  status,
  headers: { get: () => null },
  json: async () => body,
});
const LINE = 'Something did not work. Try again.';

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
const text = () => container.textContent ?? '';
const paywallText = () => container.querySelector('[data-testid="paywall"]')?.textContent ?? null;

async function submitOneStepForm() {
  await act(async () => {
    root.render(<NewDocumentPage />);
  });
  await flush();
  await click('One step');
  await click('Generate document');
}

beforeAll(() => {
  const util = jest.requireActual('util') as typeof import('util');
  Object.assign(globalThis, { TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder });
});

beforeEach(() => {
  jest.clearAllMocks();
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

describe('T-664: the form-flow paywall shows balance.totalInk', () => {
  it('total 5 / totalInk 1: shows "you have 1", never 5', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 5, totalInk: 1 } }));
    await submitOneStepForm();
    expect(paywallText()).toBe('This draft costs 3 Ink — you have 1.');
    expect(text()).not.toContain('you have 5');
  });

  it('total equals totalInk: "you have 1"; the paywall opens over the form, no failure card', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1, totalInk: 1 } }));
    await submitOneStepForm();
    expect(paywallText()).toBe('This draft costs 3 Ink — you have 1.');
    expect(text()).not.toContain(LINE);
    expect(buttonWith('Retry')).toBeUndefined();
    expect(buttonWith('Generate document')).toBeDefined();
  });

  it('totalInk 0 with a larger total shows 0 (zero is a real balance)', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 5, totalInk: 0 } }));
    await submitOneStepForm();
    expect(paywallText()).toBe('This draft costs 3 Ink — you have 0.');
  });

  it('totalInk missing: shows "you have 0", never total', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 5 } }));
    await submitOneStepForm();
    expect(paywallText()).toBe('This draft costs 3 Ink — you have 0.');
    expect(text()).not.toContain('you have 5');
  });

  it.each([
    ['a string', '2'],
    ['null', null],
    ['an object', {}],
  ])('totalInk is %s: shows "you have 0", never total', async (_n, bad) => {
    mockPrivacyFetch.mockResolvedValue(
      reply(402, { cost: 3, balance: { total: 5, totalInk: bad } }),
    );
    await submitOneStepForm();
    expect(paywallText()).toBe('This draft costs 3 Ink — you have 0.');
    expect(text()).not.toContain('you have 5');
  });

  it('a real NaN / Infinity totalInk (non-JSON body object) also shows 0', async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      mockPrivacyFetch.mockResolvedValue(
        reply(402, { cost: 3, balance: { total: 5, totalInk: bad } }),
      );
      await submitOneStepForm();
      expect(paywallText()).toBe('This draft costs 3 Ink — you have 0.');
      act(() => root.unmount());
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
  });
});

describe('T-664: the OneFlow paywall shows balance.totalInk', () => {
  // OneFlow is mocked for the page tests above; the real one is loaded for these.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RealOneFlow = (
    jest.requireActual('@/components/intake/OneFlow') as { default: React.FC<any> }
  ).default;
  const TYPED = 'My client was arrested under a FIR and needs regular bail please.';
  const brief = {
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
  const KINDS = [
    {
      template_id: 'bail',
      display_name: 'Bail application',
      category: 'criminal',
      description: '',
      plan_access: 'free',
      credits_cost: 2,
    },
  ];
  const setText = async (ta: HTMLTextAreaElement, v: string) =>
    act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
        v: string,
      ) => void;
      set.call(ta, v);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });

  async function confirmWith(body: unknown) {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ outcome: 'brief', brief, questions: [] }),
    });
    await act(async () => {
      root.render(<RealOneFlow kinds={KINDS} loadingKinds={false} />);
    });
    await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
    await act(async () => buttonWith('Continue')?.click());
    await flush();
    mockPrivacyFetch.mockResolvedValue(reply(402, body));
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
  }

  it('total 5 / totalInk 1: shows "you have 1", never 5', async () => {
    await confirmWith({ cost: 3, balance: { total: 5, totalInk: 1 } });
    expect(paywallText()).toBe('This draft costs 3 Ink — you have 1.');
    expect(text()).not.toContain('you have 5');
  });

  it('totalInk absent, total present: shows "you have 0", never total', async () => {
    await confirmWith({ cost: 3, balance: { total: 5 } });
    expect(paywallText()).toBe('This draft costs 3 Ink — you have 0.');
    expect(text()).not.toContain('you have 5');
  });

  it('totalInk null, total present: shows "you have 0"', async () => {
    await confirmWith({ cost: 3, balance: { total: 5, totalInk: null } });
    expect(paywallText()).toBe('This draft costs 3 Ink — you have 0.');
  });
});

describe('T-664 source guard: no balance.total read in the web draft flow', () => {
  const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
  it.each([
    ['page.tsx', '../page.tsx'],
    ['OneFlow.tsx', '../../../../components/intake/OneFlow.tsx'],
  ])('%s never reads balance.total / balance?.total', (_n, rel) => {
    const code = read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\s\/\/ .*$/gm, '');
    expect(code).not.toMatch(/balance\??\.total\b(?!Ink)/);
  });
});
