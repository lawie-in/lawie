// T-577: the paragraph-count flow through the real OneFlow / BriefStep / GeneratingStep /
// DraftReadyStep, with apiFetch (brief, quote) and privacyFetch (generate) mocked.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, DraftResult, KindSummary } from '../briefTypes';
import DraftReadyStep from '../DraftReadyStep';
import { SOMETHING_DID_NOT_WORK } from '../generationFailure';
import { INK_COST_RECHECK, INK_COST_UNKNOWN } from '../InkCostLine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
const mockPaywall = jest.fn();
jest.mock('@/components/credits/PaywallModal', () => ({
  PaywallModal: (p: unknown) => {
    mockPaywall(p);
    return null;
  },
}));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  openVerifyInsteadOfPaywall: async () => false,
}));
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
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

const TYPED = 'My client was arrested under a FIR and needs regular bail please.';
// AJ-577-M11 (1) re-signed the 409 line (it replaces M8); the name M8 is kept for the tests.
const M8 = 'The Ink cost has changed. Check it, then continue.';

const brief: Brief = {
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
const kindsWith = (asks: boolean | undefined): KindSummary[] => [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    credits_cost: 2,
    ...(asks === undefined ? {} : { asks_paragraphs: asks }),
  },
];

const quoteBody = (paragraphs: number, ink: number, extra: Record<string, unknown> = {}) => ({
  asks: true,
  ink,
  min: 7,
  max: 25,
  default: 10,
  paragraphs,
  bands: [
    { from: 7, to: 10, ink: 2 },
    { from: 11, to: 18, ink: 3 },
    { from: 19, to: 25, ink: 4 },
  ],
  ceiling: true,
  ...extra,
});
const inkFor = (n: number) => (n <= 10 ? 2 : n <= 18 ? 3 : 4);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const failQ = (status: number) => ({ ok: false, status, json: async () => ({}) });

/** Routes apiFetch: the brief, and the quote through `quoteImpl(body)`. */
let quoteImpl: (body: Record<string, unknown>) => unknown;
function routeApi() {
  mockApiFetch.mockImplementation(async (url: string, init?: { body?: string }) => {
    if (url === '/api/documents/paragraph-quote') {
      return quoteImpl(JSON.parse(init?.body ?? '{}'));
    }
    return ok({ outcome: 'brief', brief, questions: [] });
  });
}
const defaultQuote = (b: Record<string, unknown>) => {
  const n = typeof b.paragraphs === 'number' ? b.paragraphs : 10;
  return ok(quoteBody(n, inkFor(n)));
};

function sse(chunks: string[], runId: string | null = null) {
  const enc = new NodeTextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h === 'X-Run-Id' ? runId : null) },
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  };
}
const ev = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const refused = (status: number, body: unknown, runId: string | null = null) => ({
  ok: false,
  status,
  headers: { get: (h: string) => (h === 'X-Run-Id' ? runId : null) },
  json: async () => body,
});

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
const buttonWith = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(t),
  ) as HTMLButtonElement | undefined;
const aria = (label: string) =>
  container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const setText = async (ta: HTMLTextAreaElement, v: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, v);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');
const spin = () => container.querySelector('input[role="spinbutton"]') as HTMLInputElement | null;
const generateCalls = () => mockPrivacyFetch.mock.calls;
const sent = (n: number) => JSON.parse(generateCalls()[n][2].body);
const quoteCalls = () =>
  mockApiFetch.mock.calls.filter((c) => c[0] === '/api/documents/paragraph-quote');
const quoteSent = (n: number) => JSON.parse(quoteCalls()[n][1].body);
const heading = () => container.querySelector('h1')?.textContent;
const costText = () => container.querySelector('#brief-confirm-ink-cost')?.textContent ?? null;

async function toBrief(asks: boolean | 'absent' = true) {
  await act(async () => {
    root.render(
      <OneFlow kinds={kindsWith(asks === 'absent' ? undefined : asks)} loadingKinds={false} />,
    );
  });
  await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
  await act(async () => buttonWith('Continue')?.click());
  await flush();
}
const confirm = async (response?: unknown) => {
  if (response !== undefined) mockPrivacyFetch.mockResolvedValue(response);
  await act(async () => buttonWith('Confirm brief and continue')?.click());
  await flush();
};
const tryAgain = async (response: unknown) => {
  mockPrivacyFetch.mockResolvedValue(response);
  await act(async () => buttonWith('Try again')?.click());
  await flush();
};
const fewer = async () => {
  await act(async () => aria('Fewer paragraphs').click());
  await flush();
};
const more = async () => {
  await act(async () => aria('More paragraphs').click());
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPaywall.mockClear();
  mockApiFetch.mockReset();
  mockPrivacyFetch.mockReset();
  quoteImpl = defaultQuote;
  routeApi();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('(1) asks:false and (9) types that do not ask', () => {
  it('quote asks:false: no stepper, "Uses N Ink" from the quote, generate sends neither paragraphs nor expected_ink', async () => {
    quoteImpl = () => ok({ asks: false, ink: 5 });
    await toBrief(true);
    expect(quoteCalls()).toHaveLength(1);
    expect(spin()).toBeNull();
    expect(costText()).toBe('Uses 5 Ink');
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(1);
    expect(sent(0)).not.toHaveProperty('paragraphs');
    expect(sent(0)).not.toHaveProperty('expected_ink');
  });

  it.each([false, 'absent' as const])(
    'asks_paragraphs=%p: no quote request, no stepper, template-configs cost, nothing extra sent',
    async (asks) => {
      await toBrief(asks);
      expect(quoteCalls()).toHaveLength(0);
      expect(spin()).toBeNull();
      expect(costText()).toBe('Uses 2 Ink');
      await confirm(sse([]));
      expect(sent(0)).not.toHaveProperty('paragraphs');
      expect(sent(0)).not.toHaveProperty('expected_ink');
    },
  );

  it('a 409 price_changed for a request that sent no count is not the M8 flow (documents-list route as before)', async () => {
    await toBrief(false);
    await confirm(refused(409, { error: 'price_changed', ink: 9 }));
    expect(text()).not.toContain(M8);
    expect(text()).not.toContain('up to 9');
  });
});

describe('(2) asks:true: the quote is what is sent', () => {
  it('shows the stepper at the default and "Uses up to N Ink"; the first quote request has no paragraphs', async () => {
    await toBrief();
    expect(quoteSent(0)).toMatchObject({ kind: 'bail', language: 'en' });
    expect(quoteSent(0)).not.toHaveProperty('paragraphs');
    expect(spin()?.value).toBe('10');
    expect(spin()?.getAttribute('aria-label')).toBe('Up to 10 paragraphs');
    expect(costText()).toBe('Uses up to 2 Ink');
  });

  it('generate carries paragraphs and expected_ink equal to the quote', async () => {
    await toBrief();
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(1);
    expect(sent(0).paragraphs).toBe(10);
    expect(sent(0).expected_ink).toBe(2);
  });

  it('after + the cost re-renders from the new quote and generate sends that count and ink', async () => {
    await toBrief();
    for (let i = 0; i < 4; i += 1) await more(); // 14
    expect(spin()?.value).toBe('14');
    expect(quoteSent(quoteCalls().length - 1).paragraphs).toBe(14);
    expect(costText()).toBe('Uses up to 3 Ink');
    await confirm(sse([]));
    expect(sent(0).paragraphs).toBe(14);
    expect(sent(0).expected_ink).toBe(3);
  });

  it('typing re-quotes nothing until blur; blur then quotes the typed count', async () => {
    await toBrief();
    const before = quoteCalls().length;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
        v: string,
      ) => void;
      set.call(spin(), '20');
      spin()!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(quoteCalls()).toHaveLength(before);
    await act(async () => {
      spin()!.focus();
      spin()!.blur();
    });
    await flush();
    expect(quoteCalls()).toHaveLength(before + 1);
    expect(quoteSent(before).paragraphs).toBe(20);
    expect(costText()).toBe('Uses up to 4 Ink');
  });

  it('a typed value below min is clamped on blur with the M4 line (min from the quote)', async () => {
    await toBrief();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
        v: string,
      ) => void;
      set.call(spin(), '3');
      spin()!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      spin()!.focus();
      spin()!.blur();
    });
    await flush();
    expect(spin()?.value).toBe('7');
    expect(text()).toContain('Choose between 7 and 25 paragraphs.');
    expect(quoteSent(quoteCalls().length - 1).paragraphs).toBe(7);
  });

  it('ceiling:false: the cost line is the plain "Uses N Ink"', async () => {
    quoteImpl = (b) => ok(quoteBody((b.paragraphs as number) ?? 10, 2, { ceiling: false }));
    await toBrief();
    expect(costText()).toBe('Uses 2 Ink');
    expect(spin()?.getAttribute('aria-label')).toBe('10 paragraphs');
  });
});

describe('(3) nothing charges without a quote for the count on the stepper', () => {
  it('before the first quote: stepper disabled, Confirm aria-disabled, a press sends no POST', async () => {
    quoteImpl = () => new Promise(() => undefined); // never answers
    await toBrief();
    expect(spin()?.disabled).toBe(true);
    expect(buttonWith('Confirm brief and continue')?.getAttribute('aria-disabled')).toBe('true');
    expect(text()).toContain('Working out the Ink cost');
    await confirm();
    expect(generateCalls()).toHaveLength(0);
  });

  it('while a re-quote loads: Confirm off, a press sends no POST; the answer re-enables it', async () => {
    await toBrief();
    let release!: (v: unknown) => void;
    quoteImpl = () => new Promise((r) => (release = r));
    await act(async () => aria('More paragraphs').click());
    await flush();
    expect(buttonWith('Confirm brief and continue')?.getAttribute('aria-disabled')).toBe('true');
    await confirm();
    expect(generateCalls()).toHaveLength(0);
    release(ok(quoteBody(11, 3)));
    await flush();
    expect(buttonWith('Confirm brief and continue')?.getAttribute('aria-disabled')).not.toBe(
      'true',
    );
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(1);
    expect(sent(0)).toMatchObject({ paragraphs: 11, expected_ink: 3 });
  });

  it.each([400, 404, 500])(
    'quote %s: the T-388 cost-unknown notice and Check the cost again, value kept, no POST',
    async (status) => {
      await toBrief();
      quoteImpl = () => failQ(status);
      await more();
      expect(text()).toContain(INK_COST_UNKNOWN);
      expect(buttonWith(INK_COST_RECHECK)).toBeDefined();
      expect(spin()?.value).toBe('11');
      expect(buttonWith('Confirm brief and continue')?.getAttribute('aria-disabled')).toBe('true');
      await confirm();
      expect(generateCalls()).toHaveLength(0);
      // Check the cost again re-fetches the count on the stepper and recovers.
      quoteImpl = defaultQuote;
      await act(async () => buttonWith(INK_COST_RECHECK)?.click());
      await flush();
      expect(quoteSent(quoteCalls().length - 1).paragraphs).toBe(11);
      await confirm(sse([]));
      expect(sent(0)).toMatchObject({ paragraphs: 11, expected_ink: 3 });
    },
  );

  it('network error and a malformed quote body are also cost-unknown, no POST', async () => {
    quoteImpl = () => Promise.reject(new Error('offline'));
    await toBrief();
    expect(text()).toContain(INK_COST_UNKNOWN);
    await confirm();
    quoteImpl = () => ok({ asks: true, ink: 2 });
    await act(async () => buttonWith(INK_COST_RECHECK)?.click());
    await flush();
    expect(text()).toContain(INK_COST_UNKNOWN);
    await confirm();
    expect(generateCalls()).toHaveLength(0);
  });

  it('a first-quote 503: "Something did not work. Try again." with Retry in the cost slot; Retry recovers', async () => {
    quoteImpl = () => failQ(503);
    await toBrief();
    expect(container.querySelector('#brief-confirm-ink-cost')?.textContent).toBe(
      SOMETHING_DID_NOT_WORK,
    );
    expect(text()).not.toContain(INK_COST_UNKNOWN);
    await confirm();
    expect(generateCalls()).toHaveLength(0);
    quoteImpl = defaultQuote;
    await act(async () => buttonWith('Retry')?.click());
    await flush();
    expect(costText()).toBe('Uses up to 2 Ink');
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(1);
  });

  it('a stale quote answer never decides what is sent', async () => {
    await toBrief();
    const pending: Array<(v: unknown) => void> = [];
    quoteImpl = () => new Promise((r) => pending.push(r));
    await act(async () => aria('More paragraphs').click()); // 11
    await act(async () => aria('More paragraphs').click()); // 12
    await flush();
    pending[1](ok(quoteBody(12, 3)));
    await flush();
    pending[0](ok(quoteBody(11, 3, { ink: 4 })));
    await flush();
    await confirm(sse([]));
    expect(sent(0)).toMatchObject({ paragraphs: 12, expected_ink: 3 });
  });
});

describe('(4) 400 paragraph_count_out_of_range', () => {
  const body = {
    error: 'paragraph_count_out_of_range',
    min: 8,
    max: 25,
    paragraphs: 7,
    message: 'SERVER WORDS',
  };

  it('no generation, back on the brief, M4 line from the server min, never the server message, ring and still editable', async () => {
    await toBrief(); // the refused count (10) is already inside the new range [8, 25]
    const quotesBefore = quoteCalls().length;
    await confirm(refused(400, body));
    expect(generateCalls()).toHaveLength(1);
    expect(heading()).toBe('Check your brief');
    expect(text()).toContain('Choose between 8 and 25 paragraphs.');
    expect(text()).not.toContain('SERVER WORDS');
    expect(text()).not.toContain('paragraph_count_out_of_range');
    expect(text()).not.toContain(SOMETHING_DID_NOT_WORK);
    expect(buttonWith('Try again')).toBeUndefined();
    expect(spin()?.getAttribute('aria-invalid')).toBe('true');
    expect(spin()?.disabled).toBe(false);
    expect(spin()?.getAttribute('aria-valuemin')).toBe('8');
    // no re-quote of the refused count; the cost is unknown and Confirm is off until the count changes
    expect(quoteCalls().length).toBe(quotesBefore);
    expect(text()).toContain(INK_COST_UNKNOWN);
    expect(buttonWith('Confirm brief and continue')?.getAttribute('aria-disabled')).toBe('true');
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(1);
    // changing the count quotes it and Generate sends it
    await more();
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(2);
    expect(sent(1).paragraphs).toBe(11);
  });

  it('the server min above the cap: M4 line, cost unknown, no re-quote, no POST possible', async () => {
    await toBrief();
    const quotesBefore = quoteCalls().length;
    await confirm(refused(400, { ...body, min: 30 }));
    expect(text()).toContain('Choose between 30 and 25 paragraphs.');
    expect(quoteCalls().length).toBe(quotesBefore);
    expect(buttonWith('Confirm brief and continue')?.getAttribute('aria-disabled')).toBe('true');
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(1);
  });

  it('the count stays editable and Generate can be pressed again (sends again)', async () => {
    await toBrief();
    await confirm(refused(400, body));
    await more();
    expect(spin()?.value).toBe('11');
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(2);
    expect(sent(1).paragraphs).toBe(11);
  });

  it('the min comes from the server, not the message; a body with no min falls back to the quote min', async () => {
    await toBrief();
    await confirm(
      refused(400, {
        error: 'paragraph_count_out_of_range',
        message: 'Choose between 99 and 25 paragraphs.',
      }),
    );
    expect(text()).toContain('Choose between 7 and 25 paragraphs.');
    expect(text()).not.toContain('99');
  });

  it('a different 400 is not the range line', async () => {
    await toBrief();
    await confirm(refused(400, { error: 'bad_input', min: 8 }));
    expect(text()).not.toContain('Choose between');
    expect(text()).toContain(SOMETHING_DID_NOT_WORK);
  });
});

describe('(4b) after a Generate 400 the refused count cannot be sent again', () => {
  const body = { error: 'paragraph_count_out_of_range', min: 8, max: 25, paragraphs: 7 };
  const stepToSeven = async () => {
    for (let i = 0; i < 3; i += 1) await fewer(); // 10 -> 7
    expect(spin()?.value).toBe('7');
  };

  it('the stepper leaves 7 and is re-quoted at 8; a press while that quote is out sends nothing; after it, the POST carries 8', async () => {
    await toBrief();
    await stepToSeven();
    // hold the re-quote
    let release!: (v: unknown) => void;
    quoteImpl = () => new Promise((r) => (release = r));
    await confirm(refused(400, body));
    expect(generateCalls()).toHaveLength(1);
    expect(spin()?.value).toBe('8');
    expect(text()).toContain('Choose between 8 and 25 paragraphs.');
    // a repeat press before the new quote is back cannot POST the refused 7 (or anything)
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(1);
    // the re-quote arrives (floor 8): the M4 line stays, the next press sends 8
    await act(async () => release(ok(quoteBody(8, 2, { min: 8 }))));
    await flush();
    expect(text()).toContain('Choose between 8 and 25 paragraphs.');
    expect(spin()?.getAttribute('aria-valuemin')).toBe('8');
    quoteImpl = defaultQuote;
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(2);
    expect(sent(1).paragraphs).toBe(8);
    expect(sent(1).paragraphs).not.toBe(7);
    expect(sent(1).expected_ink).toBe(2);
  });

  it('the M4 line clears on the next successful quote after the re-quote (a step press)', async () => {
    await toBrief();
    await stepToSeven();
    quoteImpl = (b) => {
      const n = typeof b.paragraphs === 'number' ? b.paragraphs : 10;
      return ok(quoteBody(n, inkFor(n), { min: 8 }));
    };
    await confirm(refused(400, body));
    expect(text()).toContain('Choose between 8 and 25 paragraphs.');
    await more();
    expect(text()).not.toContain('Choose between');
  });
});

describe('(4c) a 400 from the QUOTE endpoint', () => {
  const range400 = (min: number) => ({
    ok: false,
    status: 400,
    json: async () => ({ error: 'paragraph_count_out_of_range', min, max: 25, message: 'SERVER' }),
  });

  it('shows the M4 line from its min and re-quotes once at the clamped count; the stepper follows it', async () => {
    await toBrief();
    for (let i = 0; i < 3; i += 1) await fewer(); // 7
    const before = quoteCalls().length;
    quoteImpl = (b) =>
      b.paragraphs === 8 ? range400(9) : ok(quoteBody(Number(b.paragraphs ?? 10), 2, { min: 9 }));
    await more(); // asks for 8 -> 400 min 9 -> one re-quote at 9
    expect(quoteCalls().length - before).toBe(2);
    expect(quoteSent(before).paragraphs).toBe(8);
    expect(quoteSent(before + 1).paragraphs).toBe(9);
    expect(spin()?.value).toBe('9');
    expect(text()).toContain('Choose between 9 and 25 paragraphs.');
    expect(text()).not.toContain('SERVER');
    await confirm(sse([]));
    expect(sent(0).paragraphs).toBe(9);
  });

  it('never loops: when the clamp equals the count just asked, the cost is unknown and nothing can POST', async () => {
    await toBrief();
    const before = quoteCalls().length;
    quoteImpl = () => range400(10);
    await more();
    // asks 11; 11 is within [10, 25], so the clamp is the same count: it is not asked again
    expect(quoteCalls().length - before).toBe(1);
    expect(text()).toContain(INK_COST_UNKNOWN);
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(0);
  });
});

describe('(10b) the ceiling flag comes from the snapshot taken at the press', () => {
  const poor = (cost: number) =>
    refused(402, { error: 'insufficient_credits', cost, balance: { totalInk: 1 } });

  it('a quote that turns non-ceiling AFTER the press does not change the paywall (ceiling stays true)', async () => {
    await toBrief(); // ceiling quote on screen at the press
    // the 402 arrives; meanwhile the next quote (not yet asked) would be non-ceiling
    quoteImpl = (b) => ok(quoteBody(Number(b.paragraphs ?? 10), 2, { ceiling: false }));
    await confirm(poor(2));
    expect(mockPaywall.mock.calls[mockPaywall.mock.calls.length - 1][0].ceiling).toBe(true);
  });

  it('a non-ceiling quote at the press gives no ceiling even if an earlier quote was a ceiling', async () => {
    await toBrief(); // first quote: ceiling true
    quoteImpl = (b) => ok(quoteBody(Number(b.paragraphs ?? 10), 2, { ceiling: false }));
    await more(); // the quote on screen is now ceiling:false
    await confirm(poor(2));
    expect(mockPaywall.mock.calls[mockPaywall.mock.calls.length - 1][0].ceiling).toBeFalsy();
  });
});

describe('(10) the paywall on a ceiling hold (AJ-577-M11 (2))', () => {
  const lastPaywall = () => mockPaywall.mock.calls[mockPaywall.mock.calls.length - 1]?.[0];
  const poor = (cost: number, balance = 1) =>
    refused(402, { error: 'insufficient_credits', cost, balance: { totalInk: balance } });

  it('a ceiling quote: ceiling true, cost = the quoted ceiling when the 402 carries the lower class price', async () => {
    await toBrief(); // ceiling quote at 10 -> expected_ink 2
    for (let i = 0; i < 4; i += 1) await more(); // 14 -> 3
    await confirm(poor(2));
    expect(sent(0).expected_ink).toBe(3);
    expect(lastPaywall()).toMatchObject({ cost: 3, balance: 1, ceiling: true });
  });

  it('a ceiling quote: the 402 cost wins when it is the larger', async () => {
    await toBrief(); // expected_ink 2
    await confirm(poor(5));
    expect(lastPaywall()).toMatchObject({ cost: 5, balance: 1, ceiling: true });
  });

  it('equal costs: ceiling true, same cost', async () => {
    await toBrief();
    await confirm(poor(2));
    expect(lastPaywall()).toMatchObject({ cost: 2, ceiling: true });
  });

  it('a quote with ceiling:false: ceiling is false and the cost is the 402 cost as before', async () => {
    quoteImpl = (b) => {
      const n = typeof b.paragraphs === 'number' ? b.paragraphs : 10;
      return ok(quoteBody(n, inkFor(n), { ceiling: false }));
    };
    await toBrief();
    for (let i = 0; i < 4; i += 1) await more();
    await confirm(poor(2));
    expect(sent(0).expected_ink).toBe(3);
    const p = lastPaywall();
    expect(p.cost).toBe(2);
    expect(p.ceiling).toBeFalsy();
  });

  it('a quote with asks:false (no count sent): no ceiling', async () => {
    quoteImpl = () => ok({ asks: false, ink: 5 });
    await toBrief(true);
    await confirm(poor(4));
    expect(sent(0)).not.toHaveProperty('paragraphs');
    const p = lastPaywall();
    expect(p.cost).toBe(4);
    expect(p.ceiling).toBeFalsy();
  });

  it.each([false, 'absent' as const])(
    'a type that does not ask (asks_paragraphs=%p): no ceiling',
    async (asks) => {
      await toBrief(asks);
      await confirm(poor(4));
      const p = lastPaywall();
      expect(p.cost).toBe(4);
      expect(p.ceiling).toBeFalsy();
    },
  );

  it('the ceiling is read at the press: a later quote does not change an open paywall', async () => {
    await toBrief();
    await confirm(poor(2));
    expect(lastPaywall().ceiling).toBe(true);
    // the next press on a quote that is no longer a ceiling
    quoteImpl = (b) => ok(quoteBody(Number(b.paragraphs ?? 10), 2, { ceiling: false }));
    await more();
    mockPaywall.mockClear();
    await confirm(poor(2));
    expect(lastPaywall().ceiling).toBeFalsy();
  });
});

describe('(5) 409 price_changed', () => {
  const changed = (ink: unknown) =>
    refused(409, { error: 'price_changed', ink, message: 'SERVER WORDS' });

  it('no automatic POST; BEFORE the next press the cost line shows "Uses up to {ink} Ink" from the 409; M8 line (warn, alert); stepper value kept; no dialog', async () => {
    await toBrief();
    await more();
    await more(); // 12, ink 3
    const quotesBefore = quoteCalls().length;
    await confirm(changed(4));
    await flush();
    await flush();
    expect(generateCalls()).toHaveLength(1); // no auto-retry
    expect(heading()).toBe('Check your brief');
    expect(costText()).toBe('Uses up to 4 Ink'); // the 409's ink, before any further press
    expect(text()).toContain(M8);
    const line = container.querySelector('[data-testid="price-changed-line"]') as HTMLElement;
    expect(line.getAttribute('role')).toBe('alert');
    expect(line.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="price-changed-line"]')).toHaveLength(1);
    expect(text()).not.toContain('SERVER WORDS');
    expect(text()).not.toContain(SOMETHING_DID_NOT_WORK);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(spin()?.value).toBe('12');
    expect(quoteCalls()).toHaveLength(quotesBefore); // usable ink: no re-quote
  });

  it('the next press POSTs once, with the NEW expected_ink and the same count; the M8 line clears on that press', async () => {
    await toBrief();
    await confirm(changed(3));
    expect(sent(0).expected_ink).toBe(2);
    mockPrivacyFetch.mockResolvedValue(sse([]));
    await act(async () => buttonWith('Confirm brief and continue')?.click());
    await flush();
    expect(generateCalls()).toHaveLength(2);
    expect(sent(1)).toMatchObject({ paragraphs: 10, expected_ink: 3 });
    expect(text()).not.toContain(M8);
  });

  it('after a 409 the line shows only with the figure; it does not flash a spinner or toast', async () => {
    await toBrief();
    await confirm(changed(3));
    expect(text()).not.toContain('Working out the Ink cost');
    expect(
      container.querySelector('[role="alert"]:not([data-testid="price-changed-line"])')
        ?.textContent ?? '',
    ).not.toContain('changed');
  });

  it('a 409 on a RETRY: back on the brief; the next press resends the same run_id', async () => {
    await toBrief();
    await confirm(refused(500, {}, 'run-77'));
    expect(heading()).toBe(SOMETHING_DID_NOT_WORK);
    await tryAgain(changed(4));
    expect(generateCalls()).toHaveLength(2);
    expect(sent(1).run_id).toBe('run-77');
    expect(heading()).toBe('Check your brief');
    expect(costText()).toBe('Uses up to 4 Ink');
    expect(text()).toContain(M8);
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(3);
    expect(sent(2).run_id).toBe('run-77');
    expect(sent(2).expected_ink).toBe(4);
  });

  it('a 409 on a FIRST attempt does not leak a run_id into the next press', async () => {
    await toBrief();
    await confirm(refused(409, { error: 'price_changed', ink: 3 }, 'run-x'));
    await confirm(sse([]));
    expect(sent(1)).not.toHaveProperty('run_id');
  });

  it.each([
    ['no ink', { error: 'price_changed' }],
    ['ink 0', { error: 'price_changed', ink: 0 }],
    ['ink a string', { error: 'price_changed', ink: 'three' }],
  ])(
    'a 409 with %s: M8 line shown and the quote is asked for again; the next press uses the fresh quote',
    async (_n, payload) => {
      await toBrief();
      quoteImpl = (b) => ok(quoteBody((b.paragraphs as number) ?? 10, 3));
      const before = quoteCalls().length;
      await confirm(refused(409, payload));
      expect(generateCalls()).toHaveLength(1);
      expect(quoteCalls()).toHaveLength(before + 1);
      expect(quoteSent(before).paragraphs).toBe(10);
      expect(text()).toContain(M8);
      expect(costText()).toBe('Uses up to 3 Ink');
      await confirm(sse([]));
      expect(sent(1)).toMatchObject({ paragraphs: 10, expected_ink: 3 });
    },
  );

  it('the M8 line clears on the next successful quote (a step press)', async () => {
    await toBrief();
    await confirm(changed(3));
    expect(text()).toContain(M8);
    await more();
    expect(text()).not.toContain(M8);
  });

  it('a second 409 shows ONE line, not two', async () => {
    await toBrief();
    await confirm(changed(3));
    await confirm(changed(4));
    expect(container.querySelectorAll('[data-testid="price-changed-line"]')).toHaveLength(1);
    expect(costText()).toBe('Uses up to 4 Ink');
    expect(generateCalls()).toHaveLength(2);
  });
});

describe('(6) 503 try_again on generate', () => {
  it('row 455 card with Try again; Try again resends the run_id with the same count and ink; cost reads "Uses up to N Ink"', async () => {
    await toBrief();
    await more(); // 11, ink 3
    await confirm(refused(503, { error: 'try_again' }, 'run-503'));
    expect(heading()).toBe(SOMETHING_DID_NOT_WORK);
    expect(buttonWith('Try again')).toBeDefined();
    expect(text()).not.toContain(M8);
    expect(container.querySelector('#generating-retry-ink-cost')?.textContent ?? '').toContain(
      'Uses up to 3 Ink',
    );
    await tryAgain(sse([]));
    expect(generateCalls()).toHaveLength(2);
    expect(sent(1)).toMatchObject({ run_id: 'run-503', paragraphs: 11, expected_ink: 3 });
  });
});

describe('(7) a double press starts one generation', () => {
  it('two synchronous presses send exactly one POST', async () => {
    await toBrief();
    mockPrivacyFetch.mockResolvedValue(sse([]));
    await act(async () => {
      const b = buttonWith('Confirm brief and continue')!;
      b.click();
      b.click();
    });
    await flush();
    expect(generateCalls()).toHaveLength(1);
  });

  it('the guard is released afterwards: a later press (after a failure and Back) can generate again', async () => {
    await toBrief();
    await confirm(refused(500, {}, 'r1'));
    await act(async () => buttonWith('Back to the brief')?.click());
    await flush();
    await confirm(sse([]));
    expect(generateCalls()).toHaveLength(2);
  });
});

describe('(8) the lower-debit line (done event, through OneFlow)', () => {
  const LOWER = (n: number) =>
    `This draft has fewer paragraphs than you asked for, so it used ${n} Ink.`;
  const doneEvent = (extra: Record<string, unknown>) =>
    sse([
      ev('done', {
        complete: true,
        docId: 'd1',
        runId: 'r',
        sectionsCited: [],
        creditsSpent: [],
        ...extra,
      }),
    ]);

  it('0 < debit < inkQuoted: the line with the real debit', async () => {
    await toBrief();
    await more();
    await more();
    await more();
    await more();
    await more(); // 15, ink 3
    await confirm(doneEvent({ inkDebited: 2, inkQuoted: 3, paragraphsDelivered: 9 }));
    expect(text()).toContain(LOWER(2));
    expect(container.querySelector('[data-testid="lower-debit-line"]')?.textContent).toBe(LOWER(2));
  });

  it('a half-Ink debit is printed as is', async () => {
    await toBrief();
    await confirm(doneEvent({ inkDebited: 1.5, inkQuoted: 2 }));
    expect(text()).toContain(LOWER(1.5));
  });

  it.each([
    ['debit == quoted', { inkDebited: 2, inkQuoted: 2 }],
    ['debit > quoted', { inkDebited: 3, inkQuoted: 2 }],
    ['debit 0', { inkDebited: 0, inkQuoted: 2 }],
    ['no debit', { inkQuoted: 2 }],
    ['no inkQuoted', { inkDebited: 1 }],
    ['inkQuoted not a number', { inkDebited: 1, inkQuoted: 'two' }],
  ])('no line when %s', async (_n, extra) => {
    await toBrief();
    await confirm(doneEvent(extra));
    expect(text()).not.toContain('fewer paragraphs than you asked for');
    expect(container.querySelector('[data-testid="lower-debit-line"]')).toBeNull();
  });

  it('never when the count was not sent (quote asks:false), even if the done event carries inkQuoted', async () => {
    quoteImpl = () => ok({ asks: false, ink: 2 });
    await toBrief();
    await confirm(doneEvent({ inkDebited: 1, inkQuoted: 2, paragraphsDelivered: 5 }));
    expect(text()).not.toContain('fewer paragraphs than you asked for');
  });

  it('never for a type that does not ask', async () => {
    await toBrief(false);
    await confirm(doneEvent({ inkDebited: 1, inkQuoted: 2 }));
    expect(text()).not.toContain('fewer paragraphs than you asked for');
  });
});

describe('DraftReadyStep lower-debit line (props)', () => {
  const base: DraftResult = {
    docId: 'doc1',
    name: 'Bail application',
    rulePack: true,
    startingDraft: false,
    startingDraftLabel: null,
    labelReason: null,
    missingClauses: [],
    findings: [],
    blanks: 0,
    factCheck: null,
    disclaimer: null,
  };
  const mount = (r: Partial<DraftResult>) =>
    act(async () => {
      root.render(
        <DraftReadyStep
          result={{ ...base, ...r }}
          onOpenEditor={jest.fn()}
          onStartAnother={jest.fn()}
        />,
      );
    });

  it('shows for 0 < inkUsed < inkQuoted with {n} = inkUsed', async () => {
    await mount({ inkUsed: 3, inkQuoted: 4 });
    expect(text()).toContain(
      'This draft has fewer paragraphs than you asked for, so it used 3 Ink.',
    );
  });
  it.each([
    [{ inkUsed: 4, inkQuoted: 4 }],
    [{ inkUsed: 5, inkQuoted: 4 }],
    [{ inkQuoted: 4 }],
    [{ inkUsed: 3 }],
    [{ inkUsed: 3, inkQuoted: Number.NaN }],
  ])('does not show for %j', async (r) => {
    await mount(r as Partial<DraftResult>);
    expect(text()).not.toContain('fewer paragraphs');
  });
});
