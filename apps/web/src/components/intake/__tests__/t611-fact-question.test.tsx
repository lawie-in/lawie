// T-611: a withheld draft (fact_needed / fact_conflict) is one signed question, not a failure.
//  - generationFailureCopy: the headline is the server's signed reason, no other line; unchanged for
//    insufficient_ink and other codes.
//  - OneFlow's SSE error hunk passes the reason through for those two codes only.
//  - GeneratingStep's card shows the question as its headline, "Back to the brief", and no retry.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import GeneratingStep from '../GeneratingStep';
import OneFlow from '../OneFlow';
import { DRAFT_DID_NOT_FINISH, generationFailureCopy } from '../generationFailure';
import type { Brief, KindSummary } from '../briefTypes';

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

// T-567 item 41: an error event without `inkReleased: true` shows the headline and the
// documents-list line, never `No Ink was used.` (the true case is in OneFlow.t565.start-refusal).
const SIGNED = 'The draft did not finish.';
const DOCS_LINE = 'Check your documents list to see where this draft stands.';
const TYPED = 'My client was arrested under a FIR and needs regular bail please.';

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
const KINDS: KindSummary[] = [
  {
    template_id: 'bail',
    display_name: 'Bail application',
    category: 'criminal',
    description: '',
    plan_access: 'free',
    credits_cost: 2,
  },
  {
    template_id: 'other',
    display_name: 'Other',
    category: 'civil',
    description: '',
    plan_access: 'free',
    credits_cost: 9,
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
const setText = async (ta: HTMLTextAreaElement, v: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, v);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
const text = () => container.textContent ?? '';

async function toBrief(props: Partial<Parameters<typeof OneFlow>[0]> = {}) {
  await act(async () => {
    root.render(<OneFlow kinds={KINDS} loadingKinds={false} {...props} />);
  });
  await setText(container.querySelector('textarea') as HTMLTextAreaElement, TYPED);
  await act(async () => buttonWith('Continue')?.click());
  await flush();
}
async function confirmWith(response: unknown) {
  mockPrivacyFetch.mockResolvedValue(response);
  await act(async () => buttonWith('Confirm brief and continue')?.click());
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
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
});

const P6 = 'One detail is needed before the draft: Cheque Date.';
const P1 =
  'The draft gives 15 October 2026 as the Cheque Date, but your facts give it as the Date of Presentation to Bank. Which is right?';
const MISMATCH =
  'The draft gives 5 September 2026 for the Cheque Date, but your facts give 1 September 2026. Which is right?';

describe('generationFailureCopy for a withheld draft', () => {
  it.each([
    ['fact_needed', P6],
    ['fact_conflict', P1],
    ['fact_conflict', MISMATCH],
  ])('%s: the headline is the signed reason, with no other line', (code, reason) => {
    expect(
      generationFailureCopy({ reason, retryable: false, source: 'error_event', code }),
    ).toEqual({ headline: reason, statusLine: null, detail: null, noInkClaim: false });
  });

  it('insufficient_ink is unchanged (the reason, no extra line)', () => {
    const c = generationFailureCopy({
      reason: 'There is not enough Ink for this draft.',
      retryable: false,
      source: 'error_event',
      code: 'insufficient_ink',
    });
    expect(c.headline).toBe('There is not enough Ink for this draft.');
    expect(c.statusLine).toBeNull();
  });

  it('another code still gets the signed "did not finish" line and not the reason', () => {
    const c = generationFailureCopy({
      reason: P6,
      retryable: true,
      source: 'error_event',
      code: 'drafter_failed',
    });
    expect(c.headline).toBe(DRAFT_DID_NOT_FINISH);
    expect(c.detail).toBe(P6);
  });
});

describe('GeneratingStep failure card for a withheld draft', () => {
  const onRetry = jest.fn();
  const onBack = jest.fn();
  const mountCard = (code: string, reason: string) =>
    act(() => {
      root.render(
        <GeneratingStep
          documentName="Legal notice"
          repairing={false}
          error={{ reason, retryable: false, source: 'error_event', code }}
          onRetry={onRetry}
          onBackToBrief={onBack}
          inkCost={4}
          kind="legal_notice_s138"
        />,
      );
    });

  it.each([
    ['fact_needed', P6],
    ['fact_conflict', P1],
  ])('%s: signed reason as the headline, Back to the brief works, no Retry', (code, reason) => {
    mountCard(code, reason);
    expect(container.querySelector('h1')?.textContent).toBe(reason);
    const back = buttonWith('Back to the brief');
    expect(back).toBeDefined();
    act(() => back!.click());
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(buttonWith('Try again')).toBeUndefined();
    expect(buttonWith('Retry')).toBeUndefined();
    expect(text()).not.toContain(DRAFT_DID_NOT_FINISH);
    expect(text()).not.toContain('No Ink was used');
    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe('OneFlow SSE error hunk for a withheld draft', () => {
  it.each([
    ['fact_needed', P6],
    ['fact_conflict', P1],
  ])(
    '%s: the signed reason is the card headline; no retry; the raw code is not shown',
    async (code, reason) => {
      await toBrief();
      await confirmWith(sse([ev('error', { reason, code, retryable: false, runId: 'r1' })]));
      expect(container.querySelector('h1')?.textContent).toBe(reason);
      expect(text()).not.toContain(DRAFT_DID_NOT_FINISH);
      expect(text()).not.toContain(DOCS_LINE);
      expect(buttonWith('Back to the brief')).toBeDefined();
      expect(buttonWith('Try again')).toBeUndefined();
    },
  );

  it('Back to the brief returns to the brief', async () => {
    await toBrief();
    await confirmWith(sse([ev('error', { reason: P6, code: 'fact_needed', retryable: false })]));
    await act(async () => buttonWith('Back to the brief')?.click());
    await flush();
    expect(buttonWith('Confirm brief and continue')).toBeDefined();
  });

  it('a non-fact code with the same reason still shows the signed line and not the reason as headline', async () => {
    await toBrief();
    await confirmWith(sse([ev('error', { reason: P6, code: 'drafter_failed', retryable: true })]));
    expect(container.querySelector('h1')?.textContent).toBe(SIGNED);
  });
});
