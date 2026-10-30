// (see below)
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import { DRAFT_PREFILL_KEY } from '../initialQuery';
import type { KindSummary } from '../briefTypes';

import { DESCRIPTION_MAX } from '@/lib/draftPrefill';

// A realistic matter text of exactly `n` characters that ends mid-sentence, so a cut is visible.
const matterText = (n: number): string => {
  const base =
    'The client is a sole earner and was arrested after the chargesheet was filed, the sureties are ready and the magistrate refused bail. ';
  const tail = ' he is the';
  return base.repeat(Math.ceil(n / base.length)).slice(0, n - tail.length) + tail;
};

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('@/components/credits/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  openVerifyInsteadOfPaywall: async () => false,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));

const mockCapMsg = jest.fn();
const mockCapExc = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => mockCapMsg(...a),
  captureException: (...a: unknown[]) => mockCapExc(...a),
  addBreadcrumb: jest.fn(),
}));

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
const kinds = [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    credits_cost: 4,
  },
] as KindSummary[];

// T-521 round 3 (Priya): the describe textarea is prefilled once from sessionStorage
// (DRAFT_PREFILL_KEY), never from the URL. Never auto-submitted, never overwrites typed text,
// never logged (Ajay's condition). Plain-word sentinels only.
let container: HTMLDivElement;
let root: Root;
const SENT = 'Sentinel matter words about a tenant dispute';
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const ta = () => container.querySelector('textarea') as HTMLTextAreaElement;
const btn = (t: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === t,
  ) as HTMLButtonElement | undefined;
const render = async (props: Partial<Parameters<typeof OneFlow>[0]> = {}, strict = false) => {
  const el = <OneFlow kinds={kinds} loadingKinds={false} {...props} />;
  await act(async () => {
    root.render(strict ? <StrictMode>{el}</StrictMode> : el);
  });
  await flush();
};
const type = async (v: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta(), v);
    ta().dispatchEvent(new Event('input', { bubbles: true }));
  });
const stored = (v: string) => window.sessionStorage.setItem(DRAFT_PREFILL_KEY, v);
let replaceSpy: jest.SpyInstance;
const consoleSpies: jest.SpyInstance[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/dashboard/new');
  replaceSpy = jest.spyOn(window.history, 'replaceState');
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    consoleSpies.push(jest.spyOn(console, m).mockImplementation(() => undefined));
  }
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ outcome: 'brief', brief, questions: [] }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  replaceSpy.mockRestore();
  while (consoleSpies.length) consoleSpies.pop()!.mockRestore();
  jest.restoreAllMocks();
});

describe('OneFlow prefill from sessionStorage (T-521 round 3)', () => {
  it('prefills the textarea, removes the key, makes no request and does not touch the URL', async () => {
    stored(SENT);
    await render();
    expect(ta().value).toBe(SENT);
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('trims and caps at the shared DESCRIPTION_MAX (T-608, was 500)', async () => {
    stored(`   ${'w'.repeat(DESCRIPTION_MAX + 700)}   `);
    await render();
    expect(ta().value).toBe('w'.repeat(DESCRIPTION_MAX));
  });

  it('exactly DESCRIPTION_MAX characters arrive whole in the textarea', async () => {
    stored('v'.repeat(DESCRIPTION_MAX));
    await render();
    expect(ta().value).toHaveLength(DESCRIPTION_MAX);
  });

  it('T-608 AC3: a 657-character stored description ends up whole in the textarea, ending "he is the"', async () => {
    const text = matterText(657);
    stored(text);
    await render();
    expect(ta().value).toHaveLength(657);
    expect(ta().value).toBe(text);
    expect(ta().value.endsWith(' he is the')).toBe(true);
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
    expect(replaceSpy).not.toHaveBeenCalled(); // sessionStorage only, nothing in the URL
    expect(window.location.search).toBe('');
  });

  it('T-608 AC3: the whole 657 characters are what Continue sends', async () => {
    const text = matterText(657);
    stored(text);
    await render();
    await act(async () => btn('Continue')?.click());
    await flush();
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body).description).toBe(text);
  });

  it('is sent only when the advocate presses Continue', async () => {
    const long = 'My client was arrested under a FIR and needs regular bail please.';
    stored(long);
    await render();
    expect(mockApiFetch).not.toHaveBeenCalled();
    await act(async () => btn('Continue')?.click());
    await flush();
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body).description).toBe(long);
  });

  it('an empty or whitespace value is ignored (and its key is still removed)', async () => {
    stored('   ');
    await render();
    expect(ta().value).toBe('');
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
  });

  it('no stored value: the textarea is empty', async () => {
    await render();
    expect(ta().value).toBe('');
  });

  it('does not overwrite text the advocate already typed', async () => {
    // The effect runs on mount, so simulate "typed first" by typing, then a second mount that
    // finds a stored value: the same-mount guard is the functional update on the typed text.
    await render();
    await type('Typed words first');
    stored(SENT);
    // A re-render does not re-read (read once): typed text stays, and the key is left for no one.
    await render({ guidedInkCost: 1 });
    expect(ta().value).toBe('Typed words first');
  });

  it('storage whose getItem throws does not break the page', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await render();
    expect(ta()).not.toBeNull();
    expect(ta().value).toBe('');
  });

  it('storage whose access itself throws does not break the page', async () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('denied');
      },
    });
    try {
      await render();
      expect(ta().value).toBe('');
    } finally {
      if (desc) Object.defineProperty(window, 'sessionStorage', desc);
    }
  });

  it('under React.StrictMode the prefill still appears (not lost on the double effect)', async () => {
    stored(SENT);
    await render({}, true);
    expect(ta().value).toBe(SENT);
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
  });

  it('after a finished draft and "Start another document" the description is empty and not re-read', async () => {
    stored('Prefilled words that are long enough to send');
    const enc = new NodeTextEncoder();
    const chunks = [`event: done\ndata: ${JSON.stringify({ docId: 'doc9' })}\n\n`];
    let i = 0;
    mockPrivacyFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: async () =>
            i < chunks.length
              ? { done: false, value: enc.encode(chunks[i++]) }
              : { done: true, value: undefined },
        }),
      },
    });
    await render();
    await act(async () => btn('Continue')?.click());
    await flush();
    await act(async () => btn('Confirm brief and continue')?.click());
    await flush();
    expect(container.textContent).toContain('Your draft is ready');
    await act(async () => btn('Start another document')?.click());
    await flush();
    expect(ta().value).toBe('');
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
  });

  it('?q= in the URL is ignored by the flow', async () => {
    window.history.replaceState(null, '', '/dashboard/new?q=Sentinel%20url%20words');
    replaceSpy.mockClear();
    await render();
    expect(ta().value).toBe('');
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?q=Sentinel%20url%20words');
  });

  it('with ?kind= and a stored prefill, templates loading late (T-630): the preset applies, the key is read at once, the textarea holds the stored text', async () => {
    const list = [
      {
        template_id: 'bail_regular',
        display_name: 'Regular Bail',
        category: 'raw',
        description: '',
        plan_access: 'free',
      },
    ] as KindSummary[];
    stored(SENT);
    await render({ initialKind: 'bail_regular', kinds: [], loadingKinds: true });
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
    await render({ initialKind: 'bail_regular', kinds: list, loadingKinds: false });
    expect(container.querySelector('h1')?.textContent).toBe('Regular Bail');
    expect(ta().value).toBe(SENT);
  });
});

describe('chip path: ?kind= with a stored prefill (T-521 round 3, Tanvi)', () => {
  const list = [
    {
      template_id: 'bail_regular',
      display_name: 'Regular Bail',
      category: 'raw',
      description: '',
      plan_access: 'free',
    },
  ] as KindSummary[];

  it('T-630: reads the key at once, shows the text with the preset, submits nothing, and a later remount does not show the old text', async () => {
    stored(SENT);
    await render({ initialKind: 'bail_regular', kinds: list });
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
    // T-630 chip path: the preset applies AND the stored text is in the textarea.
    expect(container.querySelector('h1')?.textContent).toBe('Regular Bail');
    expect(ta().value).toBe(SENT);

    // "Open Draft again" with no kind: unmounting in-app removes the saved copy, so a new
    // instance finds nothing.
    act(() => root.unmount());
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
    root = createRoot(container);
    await render();
    expect(ta().value).toBe('');
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
  });

  it('with the list still loading the key is cleared at mount too', async () => {
    stored(SENT);
    await render({ initialKind: 'bail_regular', kinds: [], loadingKinds: true });
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
  });
});

describe('the prefilled text is never logged or reported (T-521, Ajay condition)', () => {
  const seen = (calls: unknown[][]) =>
    calls.some((args) =>
      args.some((a) => {
        try {
          return (typeof a === 'string' ? a : (JSON.stringify(a) ?? '')).includes(
            'Sentinel matter',
          );
        } catch {
          return false;
        }
      }),
    );

  it('through prefill, submit and a failed read: no console or Sentry call carries it', async () => {
    stored(SENT);
    mockApiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await render();
    await act(async () => btn('Continue')?.click());
    await flush();
    expect(container.textContent).toContain(SENT); // the load-error screen echoes it on screen only
    const calls = consoleSpies.flatMap((s) => s.mock.calls);
    expect(seen(calls)).toBe(false);
    expect(seen(mockCapMsg.mock.calls)).toBe(false);
    expect(seen(mockCapExc.mock.calls)).toBe(false);
  });

  it('through a generation error event: still not carried', async () => {
    stored(SENT);
    const enc = new NodeTextEncoder();
    const chunks = [`event: error\ndata: ${JSON.stringify({ reason: 'Stopped.', code: 'x' })}\n\n`];
    let i = 0;
    mockPrivacyFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: async () =>
            i < chunks.length
              ? { done: false, value: enc.encode(chunks[i++]) }
              : { done: true, value: undefined },
        }),
      },
    });
    await render();
    await act(async () => btn('Continue')?.click());
    await flush();
    await act(async () => btn('Confirm brief and continue')?.click());
    await flush();
    expect(seen(consoleSpies.flatMap((s) => s.mock.calls))).toBe(false);
    expect(seen(mockCapMsg.mock.calls)).toBe(false);
    expect(seen(mockCapExc.mock.calls)).toBe(false);
  });
});
