// T-373: OneFlow's done handler reads `rendered` from the SSE stream. Driven end to end through the
// brief screen; DraftReadyStep is replaced by a probe that records the DraftResult it is given.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';
import type { Brief, DraftResult, KindSummary } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

let lastResult: DraftResult | null = null;
jest.mock('../DraftReadyStep', () => ({
  __esModule: true,
  default: ({ result }: { result: DraftResult }) => {
    lastResult = result;
    return <div data-testid="ready" />;
  },
}));
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
const mockPrivacyFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));

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

// T-388: Confirm waits for a known Ink cost, so the kind carries one.
const KINDS: KindSummary[] = [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    credits_cost: 1,
  },
];

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
  });
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const buttonWith = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '') === t);

function sse(events: Array<[string | null, unknown]>) {
  const body = events
    .map(([e, d]) => `${e ? `event: ${e}\n` : ''}data: ${JSON.stringify(d)}\n\n`)
    .join('');
  const bytes = new NodeTextEncoder().encode(body);
  let sent = false;
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: {
      getReader: () => ({
        read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })),
      }),
    },
  };
}

async function run(done: Record<string, unknown>, warnings?: unknown[]) {
  lastResult = null;
  mockApiFetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/api/documents/intake/brief' ? json({ outcome: 'brief', brief }) : json({}),
    ),
  );
  const events: Array<[string | null, unknown]> = [];
  if (warnings) events.push(['warning', { warnings }]);
  events.push(['done', { docId: 'd1', ...done }]);
  mockPrivacyFetch.mockResolvedValue(sse(events));
  await act(async () => {
    root.render(<OneFlow kinds={KINDS} loadingKinds={false} />);
  });
  const ta = container.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, 'My client was arrested under a FIR and needs regular bail please.');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => (buttonWith('Continue') as HTMLButtonElement).click());
  await flush();
  await act(async () => (buttonWith('Confirm brief and continue') as HTMLButtonElement).click());
  await flush();
  return lastResult as DraftResult | null;
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-373 OneFlow done handler', () => {
  it('passes rendered through and de-dups a finding on a rendered missing clause', async () => {
    const r = await run(
      {
        rendered: [
          { clauseId: 'c-miss', status: 'missing', missing: ['Date'] },
          { clauseId: 'c-ok', status: 'ok' },
        ],
        missingClauses: [{ id: 'c-miss', title: 'Grounds' }],
      },
      [
        { type: 'missing_clause', message: 'dup', details: { clauseId: 'c-miss' } },
        { type: 'other', message: 'kept', details: { clauseId: 'c-ok' } },
        { type: 'plain', message: 'kept too' },
      ],
    );
    expect(r).not.toBeNull();
    expect(r?.rendered).toEqual([
      { clauseId: 'c-miss', status: 'missing', missing: ['Date'] },
      { clauseId: 'c-ok', status: 'ok' },
    ]);
    expect(r?.findings.map((f) => f.message)).toEqual(['kept', 'kept too']);
  });

  it('when rendered is present, de-dup ignores the legacy missingClauses ids', async () => {
    const r = await run(
      {
        rendered: [{ clauseId: 'c-ok', status: 'ok' }],
        missingClauses: [{ id: 'legacy', title: 'Legacy' }],
      },
      [{ type: 't', message: 'about legacy', details: { clauseId: 'legacy' } }],
    );
    expect(r?.findings.map((f) => f.message)).toEqual(['about legacy']);
  });

  it('drops malformed rendered entries', async () => {
    const r = await run({
      rendered: [
        null,
        'str',
        42,
        {},
        { clauseId: 5, status: 'ok' },
        { clauseId: 'a' },
        { clauseId: 'b', status: 'weird' },
        { clauseId: 'good', status: 'fallback', reason: 'unverified' },
      ],
    });
    expect(r?.rendered).toEqual([{ clauseId: 'good', status: 'fallback', reason: 'unverified' }]);
  });

  it('rendered that is not an array is treated as absent', async () => {
    const r = await run({ rendered: { clauseId: 'a', status: 'ok' }, missingClauses: [] });
    expect(r).not.toBeNull();
    expect('rendered' in (r as DraftResult)).toBe(false);
  });

  it('non-D1: no rendered key, de-dup by missingClauses as before', async () => {
    const r = await run({ missingClauses: [{ id: 'm1', title: 'Prayer' }] }, [
      { type: 'missing_clause', message: 'dup', details: { clauseId: 'm1' } },
      { type: 'other', message: 'kept' },
    ]);
    expect(r).not.toBeNull();
    expect('rendered' in (r as DraftResult)).toBe(false);
    expect(r?.missingClauses).toEqual([{ id: 'm1', title: 'Prayer' }]);
    expect(r?.findings.map((f) => f.message)).toEqual(['kept']);
  });

  it('factCheck absent gives a null banner on a D1 result', async () => {
    const r = await run({ rendered: [{ clauseId: 'a', status: 'ok' }] });
    expect(r?.factCheck).toBeNull();
  });
});
