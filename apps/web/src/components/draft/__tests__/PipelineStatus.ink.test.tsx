// T-388: every PipelineStatus button that charges Ink (retry, the one soft-warn proceed button; T-565 W2 removed the second) shows the cost and blocks on an unknown one.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  INK_COST_LOADING,
  INK_COST_RECHECK,
  INK_COST_UNKNOWN,
} from '@/components/intake/InkCostLine';

import PipelineStatus, {
  FAILED_RETRY_INK_COST_ID,
  SOFT_WARN_INK_COST_ID,
  type GenerationFailure,
  type PipelineState,
} from '../PipelineStatus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockCapture = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => mockCapture(...a),
}));

let container: HTMLDivElement;
let root: Root;
const onRetry = jest.fn();
const onProceedAnyway = jest.fn();
const onInkCostRetry = jest.fn();

function mount(
  state: PipelineState,
  cost: { inkCost?: number; inkCostLoading?: boolean; generationFailure?: GenerationFailure },
) {
  act(() => {
    root.render(
      <PipelineStatus
        state={state}
        questions={['Check the dates']}
        onProceedAnyway={onProceedAnyway}
        onRetry={onRetry}
        generationError="Boom"
        generationRetryable
        onInkCostRetry={onInkCostRetry}
        templateId="bail_regular"
        {...cost}
      />,
    );
  });
}
const byDescribedBy = (id: string) =>
  container.querySelector(`button[aria-describedby="${id}"]`) as HTMLButtonElement;
// T-565 W2: the soft-warn card has exactly one `Generate anyway`; `nth` is kept for the helper.
const byLabel = (label: string, nth = 0) =>
  Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === label)[
    nth
  ] as HTMLButtonElement;

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

const buttons: Array<{
  name: string;
  state: PipelineState;
  id: string;
  /** T-432: the line the button points at while the cost is loading or unknown. */
  blockedId: string;
  label: string;
  /** which of the buttons carrying `label` */
  nth: number;
  handler: () => jest.Mock;
  action: string;
}> = [
  {
    name: 'generation-failed Try again',
    state: 'generation_failed',
    id: FAILED_RETRY_INK_COST_ID,
    blockedId: FAILED_RETRY_INK_COST_ID,
    label: 'Try again',
    nth: 0,
    handler: () => onRetry,
    action: 'retry',
  },
  {
    name: 'soft-warn first "Generate anyway"',
    state: 'soft_warn',
    id: SOFT_WARN_INK_COST_ID,
    blockedId: SOFT_WARN_INK_COST_ID,
    label: 'Generate anyway',
    nth: 0,
    handler: () => onProceedAnyway,
    action: 'soft_warn',
  },
];

describe.each(buttons)(
  'PipelineStatus $name',
  ({ state, id, blockedId, label, nth, handler, action }) => {
    it('known: "Uses N Ink" under the button, enabled, described by the line, click charges', () => {
      mount(state, { inkCost: 5 });
      const btn = byDescribedBy(id);
      expect(btn.textContent).toBe(label);
      expect(btn.type).toBe('button');
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('aria-disabled')).toBeNull();
      const line = container.querySelector(`#${id}`) as HTMLElement;
      expect(line.textContent).toBe('Uses 5 Ink');
      expect(btn.parentElement?.contains(line)).toBe(true);
      act(() => btn.click());
      expect(handler()).toHaveBeenCalledTimes(1);
    });

    it('unknown (T-565 W8): disabled, aria-disabled, no cost line or notice, no describedby, click does not charge', () => {
      mount(state, { inkCost: undefined });
      const btn = byLabel(label, nth);
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.hasAttribute('aria-describedby')).toBe(false);
      expect(container.querySelector(`#${blockedId}`)).toBeNull();
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.textContent).not.toContain(INK_COST_UNKNOWN);
      expect(container.textContent).not.toContain(INK_COST_RECHECK);
      act(() => btn.click());
      expect(handler()).not.toHaveBeenCalled();
    });

    it('loading: status line, disabled, click does not charge, no Sentry', () => {
      mount(state, { inkCost: undefined, inkCostLoading: true });
      const btn = byLabel(label, nth);
      expect(btn.getAttribute('aria-describedby')).toBe(blockedId);
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      const line = container.querySelector(`#${blockedId}`) as HTMLElement;
      expect(line.getAttribute('role')).toBe('status');
      expect(line.textContent).toBe(INK_COST_LOADING);
      act(() => btn.click());
      expect(handler()).not.toHaveBeenCalled();
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it('unknown: no Sentry warning is sent from the card', () => {
      mount(state, { inkCost: undefined });
      expect(mockCapture).not.toHaveBeenCalled();
      expect(action).toBeTruthy();
    });
  },
);

describe('PipelineStatus soft-warn with an unknown cost (T-565 W8)', () => {
  it('no cost line, no notice, no skip-button line, no Sentry warning', () => {
    mount('soft_warn', { inkCost: undefined });
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
    expect(container.textContent).not.toContain(INK_COST_UNKNOWN);
    expect(container.querySelector(`#${SOFT_WARN_INK_COST_ID}`)).toBeNull();
    expect(container.querySelector('#soft-warn-skip-ink-cost')).toBeNull();
    expect(mockCapture).not.toHaveBeenCalled();
  });
  it('blocked: the one button has no describedby and stays disabled', () => {
    mount('soft_warn', { inkCost: undefined });
    expect(
      Array.from(container.querySelectorAll('button')).filter(
        (x) => x.textContent === 'Generate anyway',
      ),
    ).toHaveLength(1);
    const a = byLabel('Generate anyway', 0);
    expect(a.hasAttribute('aria-describedby')).toBe(false);
    expect(a.disabled).toBe(true);
    expect(a.getAttribute('aria-disabled')).toBe('true');
    act(() => a.click());
    expect(onProceedAnyway).not.toHaveBeenCalled();
    expect(byLabel('Generate anyway', 1)).toBeUndefined();
  });
  it('T-432/W2: loading is one status line too, the one button described by it', () => {
    mount('soft_warn', { inkCost: undefined, inkCostLoading: true });
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(byLabel('Generate anyway', 0).getAttribute('aria-describedby')).toBe(
      SOFT_WARN_INK_COST_ID,
    );
    expect(container.querySelector('#soft-warn-skip-ink-cost')).toBeNull();
  });
  it('no "Check the cost again" link on the soft-warn, request-failed or stream cards; the buttons stay disabled', () => {
    const recheck = () =>
      Array.from(container.querySelectorAll('button')).filter(
        (x) => x.textContent === INK_COST_RECHECK,
      );
    mount('soft_warn', { inkCost: undefined });
    expect(recheck()).toHaveLength(0);
    mount('generation_failed', { inkCost: undefined });
    expect(recheck()).toHaveLength(0);
    const tries = Array.from(container.querySelectorAll('button')).filter(
      (x) => x.textContent === 'Try again',
    );
    expect(tries).toHaveLength(1);
    expect(tries[0].disabled).toBe(true);
    mount('generation_failed', { inkCost: undefined, generationFailure: 'request_failed' });
    expect(recheck()).toHaveLength(0);
    const retry = byLabel('Retry') as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(retry.getAttribute('aria-disabled')).toBe('true');
    expect(retry.hasAttribute('aria-describedby')).toBe(false);
    act(() => retry.click());
    expect(onRetry).not.toHaveBeenCalled();
    expect(onInkCostRetry).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });
  it('request-failed card: loading shows the status line, known shows Uses N Ink', () => {
    mount('generation_failed', {
      inkCost: undefined,
      inkCostLoading: true,
      generationFailure: 'request_failed',
    });
    expect(container.textContent).toContain(INK_COST_LOADING);
    expect((byLabel('Retry') as HTMLButtonElement).disabled).toBe(true);
    mount('generation_failed', { inkCost: 4, generationFailure: 'request_failed' });
    expect(container.querySelector(`#${FAILED_RETRY_INK_COST_ID}`)?.textContent).toBe('Uses 4 Ink');
    expect((byLabel('Retry') as HTMLButtonElement).disabled).toBe(false);
  });
  it('known: one cost line "Uses N Ink", and no second line', () => {
    mount('soft_warn', { inkCost: 2 });
    expect(container.querySelectorAll(`#${SOFT_WARN_INK_COST_ID}`)).toHaveLength(1);
    expect(container.querySelector(`#${SOFT_WARN_INK_COST_ID}`)?.textContent).toBe('Uses 2 Ink');
    expect(container.querySelector('#soft-warn-skip-ink-cost')).toBeNull();
    expect(container.textContent?.split('Uses 2 Ink').length).toBe(2);
  });
});
