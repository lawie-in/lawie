// T-690b (Rajesh), real path: written statement, guided brief flow. The service's update response
// carries brief.soft_findings; the brief screen shows the card once, Confirm starts the draft, and
// the ready screen shows the same card first in "Checks run for you". The card follows the brief
// of the LAST ADOPTED update: an edit that clears it (121 -> 30) clears it on the ready screen,
// and an overtaken (older) update response is never adopted.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, BriefItem, KindSummary } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
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

const WS_TEXT =
  'This written statement is more than 90 days after service of summons. In an ordinary suit the court allows that only in exceptional cases; in a commercial suit it can be allowed up to 120 days, for reasons recorded in writing and on payment of costs, and not after that. Set out the reasons in the delay application.';
const FINDING = { rule_id: 'ws_over_90_days', text: WS_TEXT };

const days = (value: string | null): BriefItem => ({
  key: 'days_from_service',
  part: 'facts',
  label: 'Days from service of summons',
  kind: 'text',
  required: false,
  options: [],
  value,
  source: value ? 'user' : null,
  please_check: false,
  placeholder: '[DAYS]',
  party_name: false,
});
const briefOf = (value: string | null, withFinding: boolean): Brief => ({
  kind: { id: 'written_statement', name: 'Written statement', court_document: false },
  court: { state: null, court_type: null, court: null },
  items: [days(value)],
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
  ...(withFinding ? { soft_findings: [FINDING] } : {}),
});
const kinds: KindSummary[] = [
  {
    template_id: 'written_statement',
    display_name: 'Written statement',
    category: 'civil',
    description: '',
    plan_access: 'free',
    credits_cost: 2,
  },
];

function sse(chunks: string[]) {
  const enc = new NodeTextEncoder();
  let i = 0;
  return {
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
  };
}
const ev = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

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
const cards = () =>
  Array.from(container.querySelectorAll('[role="status"]')).filter((e) =>
    (e.textContent ?? '').includes('more than 90 days after service'),
  ) as HTMLElement[];
const occurrences = () => container.textContent!.split(WS_TEXT).length - 1;

/** Each update call is held; resolve them in any order. */
let updates: Array<{ resolve: (b: Brief) => void; fail: () => void }> = [];

async function toBrief(first: Brief) {
  updates = [];
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/brief')
      return Promise.resolve(json({ outcome: 'brief', brief: first }));
    if (path === '/api/documents/intake/brief/update')
      return new Promise((resolve) => {
        updates.push({
          resolve: (b) => resolve(json({ brief: b })),
          fail: () => resolve({ ok: false, status: 500, json: async () => ({}) }),
        });
      });
    return Promise.resolve(json({}));
  });
  await act(async () => {
    root.render(<OneFlow kinds={kinds} loadingKinds={false} />);
  });
  const ta = container.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, 'Defendant served with summons; the written statement is being drafted now.');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => buttonWith('Continue')?.click());
  await flush();
}

/** Type a value in the days field and leave it: the blur commit sends an update. */
async function editDays(value: string) {
  const input = container.querySelector(
    'input[type="text"], input:not([type])',
  ) as HTMLInputElement;
  await act(async () => {
    input.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

const answer = async (n: number, b: Brief) => {
  await act(async () => updates[n].resolve(b));
  await flush();
};

const SERVER_SF = [FINDING];
/** Confirm; the service's `done` event carries `extra` (soft_findings is the server's, not the screen's). */
async function confirmToReady(extra: Record<string, unknown> = {}) {
  mockPrivacyFetch.mockResolvedValue(
    sse([ev('warning', { warnings: [] }), ev('done', { docId: 'ws1', inkDebited: 2, ...extra })]),
  );
  await act(async () => buttonWith('Confirm brief and continue')?.click());
  await flush();
  expect(container.textContent).toContain('Your draft is ready');
}
const daysSent = () => {
  const body = JSON.parse(generateCalls().at(-1)![2].body) as {
    values: Array<{ key: string; value: unknown }>;
  };
  return body.values.find((v) => v.key === 'days_from_service')?.value;
};
const generateCalls = () =>
  mockPrivacyFetch.mock.calls.filter((c) => c[1] === '/api/documents/generate-from-brief');

beforeEach(() => {
  jest.clearAllMocks();
  Element.prototype.scrollIntoView = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('OneFlow written statement over 90 days (T-690b)', () => {
  it('update -> brief card once -> Confirm -> ready: card first in "Checks run for you", once', async () => {
    await toBrief(briefOf(null, false));
    expect(cards()).toHaveLength(0);

    await editDays('121');
    expect(updates).toHaveLength(1);
    await answer(0, briefOf('121', true));
    // brief screen: exactly one card with the signed text, above Confirm
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toBe(WS_TEXT);
    expect(occurrences()).toBe(1);
    expect(
      cards()[0].compareDocumentPosition(buttonWith('Confirm brief and continue')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await confirmToReady({ soft_findings: SERVER_SF });
    expect(generateCalls()).toHaveLength(1);
    // the brief screen is gone, so the card on screen is the ready screen's one
    expect(container.textContent).not.toContain('Confirm brief and continue');
    expect(cards()).toHaveLength(1);
    expect(occurrences()).toBe(1);
    const section = container.querySelector('section[aria-labelledby="ready-checks"]')!;
    expect(document.getElementById('ready-checks')!.textContent).toBe('Checks run for you');
    expect(cards()[0].parentElement).toBe(section);
    expect(Array.from(section.children).indexOf(cards()[0])).toBe(1);
    // not on the folio / anywhere else on the screen
    expect(section.contains(cards()[0])).toBe(true);
    const outside = Array.from(container.querySelectorAll('*')).filter(
      (e) =>
        !section.contains(e) && !e.contains(section) && (e.textContent ?? '').includes(WS_TEXT),
    );
    expect(outside).toHaveLength(0);
    // the signed no-mismatch line is still there
    expect(container.textContent).toContain('These checks found no mismatch');
  });

  it('a brief that arrives with the finding (first /intake/brief response) also carries it to ready', async () => {
    await toBrief(briefOf('121', true));
    expect(cards()).toHaveLength(1);
    await confirmToReady({ soft_findings: SERVER_SF });
    expect(cards()).toHaveLength(1);
    expect(occurrences()).toBe(1);
    expect(cards()[0].parentElement).toBe(
      container.querySelector('section[aria-labelledby="ready-checks"]'),
    );
  });

  it('121 then edited to 30: the adopted update has no finding, so brief and ready show none', async () => {
    await toBrief(briefOf(null, false));
    await editDays('121');
    await answer(0, briefOf('121', true));
    expect(cards()).toHaveLength(1);

    await editDays('30');
    await answer(1, briefOf('30', false));
    expect(cards()).toHaveLength(0);
    expect(container.textContent).not.toContain('more than 90 days');

    await confirmToReady();
    expect(cards()).toHaveLength(0);
    expect(container.textContent).not.toContain('more than 90 days');
    expect(container.textContent).toContain('These checks found no mismatch');
  });

  it('an older update response that arrives late is not adopted (finding stays out)', async () => {
    await toBrief(briefOf(null, false));
    await editDays('121');
    await editDays('30');
    expect(updates).toHaveLength(2);
    // the newer one (30, no finding) answers first, then the older one (121, finding)
    await answer(1, briefOf('30', false));
    expect(cards()).toHaveLength(0);
    await answer(0, briefOf('121', true));
    expect(cards()).toHaveLength(0);
    expect(container.textContent).not.toContain('more than 90 days');

    // ready screen follows the server's done: the edit to 30 gave none
    await confirmToReady();
    expect(daysSent()).toBe('30');
    expect(cards()).toHaveLength(0);
  });

  it('an older response without the finding arriving late does not remove the newer finding', async () => {
    await toBrief(briefOf(null, false));
    await editDays('30');
    await editDays('121');
    expect(updates).toHaveLength(2);
    await answer(1, briefOf('121', true));
    expect(cards()).toHaveLength(1);
    await answer(0, briefOf('30', false));
    expect(cards()).toHaveLength(1);

    await confirmToReady({ soft_findings: SERVER_SF });
    expect(daysSent()).toBe('121');
    expect(cards()).toHaveLength(1);
    expect(occurrences()).toBe(1);
    expect(cards()[0].parentElement).toBe(
      container.querySelector('section[aria-labelledby="ready-checks"]'),
    );
  });
});

describe('OneFlow ready screen follows the server done event, not the screen brief (T-690b)', () => {
  const readySection = () => container.querySelector('section[aria-labelledby="ready-checks"]')!;

  it('(a) 30 -> edit to 121 -> update fails -> Confirm: generate carries 121, done has the finding, one card first', async () => {
    await toBrief(briefOf('30', false));
    await editDays('121');
    await act(async () => updates[0].fail());
    await flush();
    expect(cards()).toHaveLength(0); // the screen brief is stale: no finding yet
    expect(container.textContent).toContain('We could not check that change just now');

    await confirmToReady({ soft_findings: SERVER_SF });
    expect(generateCalls()).toHaveLength(1);
    expect(daysSent()).toBe('121');
    expect(cards()).toHaveLength(1);
    expect(occurrences()).toBe(1);
    expect(cards()[0].parentElement).toBe(readySection());
    expect(Array.from(readySection().children).indexOf(cards()[0])).toBe(1);
  });

  it('(b) 121 on screen -> edit to 30 -> update fails -> Confirm: done without findings, no card', async () => {
    await toBrief(briefOf('121', true));
    expect(cards()).toHaveLength(1);
    await editDays('30');
    await act(async () => updates[0].fail());
    await flush();
    expect(cards()).toHaveLength(1); // stale brief still shows it
    await confirmToReady();
    expect(daysSent()).toBe('30');
    expect(cards()).toHaveLength(0);
    expect(container.textContent).not.toContain('more than 90 days');
    expect(container.textContent).toContain('These checks found no mismatch');
  });

  it('(c) malformed or repeated soft_findings in done: at most one card, none for malformed', async () => {
    await toBrief(briefOf('30', false));
    for (const bad of [
      'text',
      5,
      { rule_id: 'x', text: WS_TEXT },
      [{ rule_id: 'x', text: '' }],
      [{ rule_id: 'x' }],
      [null, 3],
    ]) {
      await confirmToReady({ soft_findings: bad });
      expect(cards()).toHaveLength(0);
      expect(container.querySelector('[data-variant="warn"]')).toBeNull();
      act(() => root.unmount());
      root = createRoot(container);
      await toBrief(briefOf('30', false));
    }
    await confirmToReady({
      soft_findings: [
        FINDING,
        { ...FINDING },
        { rule_id: 'other', text: WS_TEXT },
        { rule_id: 'b', text: '' },
      ],
    });
    expect(cards()).toHaveLength(1);
    expect(occurrences()).toBe(1);
  });

  it('(d) a done without soft_findings after a brief screen that had the finding: no card', async () => {
    await toBrief(briefOf(null, false));
    await editDays('121');
    await answer(0, briefOf('121', true));
    expect(cards()).toHaveLength(1);
    await confirmToReady();
    expect(cards()).toHaveLength(0);
    expect(container.textContent).not.toContain('more than 90 days');
  });
});
