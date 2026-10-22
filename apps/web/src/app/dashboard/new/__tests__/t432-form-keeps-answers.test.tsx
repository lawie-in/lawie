// T-432: the template form keeps every answer, the current step and the consumer Commission level
// when the advocate is sent back to it (privacy block, 402 paywall, verify-email bounce, "Edit the form"),
// and drops them on a template change, on Cancel. Nothing typed goes to browser storage.
//
// The real DynamicFormRenderer and the real PipelineStatus run here; only the prompts, the modal,
// the network and the router are stubbed.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import NewDocumentPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/components/intake/OneFlow', () => ({
  __esModule: true,
  default: () => <div data-testid="one-flow" />,
}));
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'A', email: 'a@example.com', plan: 'free' } }),
}));
jest.mock('@/components/credits/PaywallModal', () => ({
  PaywallModal: () => <div data-testid="paywall" />,
}));
// Switchable prompts.
let mockVerifyInstead = false;
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  openVerifyInsteadOfPaywall: async () => mockVerifyInstead,
}));
let mockPrecheckBlocks = false;
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: (res: { privacyBlocked?: boolean }) => Boolean(res?.privacyBlocked),
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: async () => mockPrecheckBlocks,
  usePrivacyDescribedBy: () => undefined,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

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

let configs: Record<string, unknown>;
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
    if (path === '/api/documents/preflight') return Promise.resolve(ok(verdict));
    return Promise.resolve(ok({}));
  });
}
const generateCalls = () => mockPrivacyFetch.mock.calls.filter((c) => c[1] === GENERATE);
const reply = (status: number, body: unknown, extra: Record<string, unknown> = {}) => ({
  ok: false,
  status,
  headers: { get: () => null },
  json: async () => body,
  ...extra,
});

let container: HTMLDivElement;
let root: Root;
let setItem: jest.SpyInstance;
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

async function open(name: string) {
  await act(async () => {
    root.render(<NewDocumentPage />);
  });
  await flush();
  await click(name);
}
/** Type an answer on each of 3 steps and stop on the last one, ready to submit. */
async function fillThreeSteps() {
  await type('one');
  await click('Next');
  await type('two');
  await click('Next');
  await type('three');
}
/** The form is on step 3 and every answer is intact. */
async function expectAnswersKept() {
  expect(text()).toContain('Field 3');
  expect(field().value).toBe('three');
  await click('Back');
  expect(text()).toContain('Field 2');
  expect(field().value).toBe('two');
  await click('Back');
  expect(text()).toContain('Field 1');
  expect(field().value).toBe('one');
}
const onForm = () =>
  buttonWith('Generate document') !== undefined || buttonWith('Next') !== undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyInstead = false;
  mockPrecheckBlocks = false;
  verdict = { verdict: 'pass' };
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
  mockPrivacyFetch.mockResolvedValue(reply(500, { error: 'Model down' }));
  setItem = jest.spyOn(Storage.prototype, 'setItem');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

describe('T-432 AC1/AC2: every return path keeps answers and step', () => {
  it('privacy re-acceptance, ask before leaving: the form is never left', async () => {
    await open('Alpha notice');
    await fillThreeSteps();
    mockPrecheckBlocks = true;
    await click('Generate document');
    expect(generateCalls()).toHaveLength(0);
    await expectAnswersKept();
  });

  it('privacy re-acceptance, block comes back on the generate call: form remounts with its answers', async () => {
    await open('Alpha notice');
    await fillThreeSteps();
    mockPrivacyFetch.mockResolvedValue({ ...reply(403, {}), privacyBlocked: true });
    await click('Generate document');
    expect(generateCalls()).toHaveLength(1);
    expect(onForm()).toBe(true);
    await expectAnswersKept();
  });

  it('402 paywall: the form comes back under the modal with its answers', async () => {
    await open('Alpha notice');
    await fillThreeSteps();
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1 } }));
    await click('Generate document');
    expect(container.querySelector('[data-testid="paywall"]')).not.toBeNull();
    await expectAnswersKept();
  });

  it('verify-email bounce: the form comes back with its answers, no paywall', async () => {
    await open('Alpha notice');
    await fillThreeSteps();
    mockVerifyInstead = true;
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1 } }));
    await click('Generate document');
    expect(container.querySelector('[data-testid="paywall"]')).toBeNull();
    expect(onForm()).toBe(true);
    await expectAnswersKept();
  });

  it('"Edit the form" (soft warn): answers and step kept', async () => {
    verdict = { verdict: 'soft', questions: ['Check the dates'] };
    await open('Alpha notice');
    await fillThreeSteps();
    await click('Generate document');
    await click('Edit the form');
    await expectAnswersKept();
  });

  it('"Edit the form" (hard block): answers and step kept', async () => {
    verdict = { verdict: 'hard', hardBlockReason: 'Cannot be used' };
    await open('Alpha notice');
    await fillThreeSteps();
    await click('Generate document');
    expect(text()).toContain('Cannot be used');
    await click('Edit the form');
    await expectAnswersKept();
  });

  it('"Edit the form" (generation failed): answers and step kept', async () => {
    await open('Alpha notice');
    await fillThreeSteps();
    await click('Generate document'); // privacyFetch -> 500 -> generation_failed
    expect(text()).toContain('Something did not work. Try again.'); // T-565 W3: a 500 pre-stream; the server reason is not shown
    expect(text()).not.toContain('Model down');
    await click('Edit the form');
    await expectAnswersKept();
  });

  it('returning twice in a row still keeps them (the snapshot is refreshed, not consumed)', async () => {
    verdict = { verdict: 'soft', questions: ['Check the dates'] };
    await open('Alpha notice');
    await fillThreeSteps();
    await click('Generate document');
    await click('Edit the form');
    await type('three, edited');
    await click('Generate document');
    await click('Edit the form');
    expect(text()).toContain('Field 3');
    expect(field().value).toBe('three, edited');
    await click('Back');
    expect(field().value).toBe('two');
  });

  it('a mid-form step is kept too (returned from step 2, not the last)', async () => {
    verdict = { verdict: 'soft', questions: ['Check the dates'] };
    configs.alpha = textConfig('alpha', 'Alpha notice', 3);
    await open('Alpha notice');
    await type('one');
    await click('Next');
    await type('two');
    // jump straight to the last step with the answer on step 3 empty, then return
    await click('Next');
    await click('Generate document');
    await click('Edit the form');
    expect(text()).toContain('Field 3');
    expect(field().value).toBe('');
    await click('Back');
    expect(field().value).toBe('two');
  });

  it('the consumer Commission level is kept (402 paywall return)', async () => {
    await open('Consumer complaint');
    await act(async () =>
      (container.querySelector('#dfr-consumer-level-national') as HTMLElement).click(),
    );
    await flush();
    await click('Next');
    await type('the facts');
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1 } }));
    await click('Generate document');
    expect(container.querySelector('[data-testid="paywall"]')).not.toBeNull();
    expect(field().value).toBe('the facts');
    await click('Back');
    expect(
      container.querySelector('#dfr-consumer-level-national')?.getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      container.querySelector('#dfr-consumer-level-district')?.getAttribute('aria-checked'),
    ).toBe('false');
  });
});

describe('T-432 AC3: answers are cleared when they should be', () => {
  it('a different template starts empty, and the first one is empty when chosen again', async () => {
    await open('Alpha notice');
    await type('alpha answer');
    await click('Choose a different template');
    await click('Beta notice');
    expect(text()).toContain('Field 1');
    expect(field().value).toBe('');
    await type('beta answer');
    await click('Choose a different template');
    await click('Alpha notice');
    expect(field().value).toBe('');
    expect(text()).toContain('Field 1');
  });

  it('choosing the same template again starts empty', async () => {
    verdict = { verdict: 'soft', questions: ['Check the dates'] };
    await open('Alpha notice');
    await fillThreeSteps();
    await click('Generate document');
    await click('Edit the form');
    await click('Choose a different template');
    await click('Alpha notice');
    expect(text()).toContain('Field 1');
    expect(field().value).toBe('');
  });

  it('Cancel clears them: the next return to the form is empty at step 1', async () => {
    mockPrivacyFetch.mockResolvedValue({ ...reply(403, {}), privacyBlocked: true });
    await open('One step');
    await type('typed then cancelled');
    await click('Cancel');
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    // Cancel is mocked, so the page stays; a return to the form (remount) shows what is held.
    await click('Generate document');
    expect(field().value).toBe('');
    expect(text()).toContain('Field 1');
  });

  it('control: without Cancel the same return keeps the answer', async () => {
    mockPrivacyFetch.mockResolvedValue({ ...reply(403, {}), privacyBlocked: true });
    await open('One step');
    await type('typed');
    await click('Generate document');
    expect(field().value).toBe('typed');
  });

  it('a successful draft completes and holds nothing in browser storage', async () => {
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
    await open('One step');
    await type('case detail');
    await click('Generate document');
    expect(generateCalls()).toHaveLength(1);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('T-432 AC3: nothing typed goes to browser storage', () => {
  it('no setItem on localStorage or sessionStorage through typing, steps and every return', async () => {
    verdict = { verdict: 'soft', questions: ['Check the dates'] };
    await open('Alpha notice');
    await fillThreeSteps();
    await click('Generate document');
    await click('Edit the form');
    await click('Back');
    mockPrivacyFetch.mockResolvedValue(reply(402, { cost: 3, balance: { total: 1 } }));
    verdict = { verdict: 'pass' };
    await click('Next');
    await click('Generate document');
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('three');
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('three');
  });
});
