// T-388: every PipelineStatus button that charges Ink (retry, both soft-warn proceed buttons) shows the cost and blocks on an unknown one.
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
  SOFT_WARN_SKIP_INK_COST_ID,
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

function mount(state: PipelineState, cost: { inkCost?: number; inkCostLoading?: boolean }) {
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
const byLabel = (label: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;

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
  handler: () => jest.Mock;
  action: string;
}> = [
  {
    name: 'generation-failed Try again',
    state: 'generation_failed',
    id: FAILED_RETRY_INK_COST_ID,
    blockedId: FAILED_RETRY_INK_COST_ID,
    label: 'Try again',
    handler: () => onRetry,
    action: 'retry',
  },
  {
    name: 'soft-warn "Looks correct — generate anyway"',
    state: 'soft_warn',
    id: SOFT_WARN_INK_COST_ID,
    blockedId: SOFT_WARN_INK_COST_ID,
    label: 'Looks correct — generate anyway',
    handler: () => onProceedAnyway,
    action: 'soft_warn',
  },
  {
    name: 'soft-warn "Skip and generate anyway"',
    state: 'soft_warn',
    id: SOFT_WARN_SKIP_INK_COST_ID,
    // T-432: blocked, the skip button shares the one line above it.
    blockedId: SOFT_WARN_INK_COST_ID,
    label: 'Skip and generate anyway',
    handler: () => onProceedAnyway,
    action: 'soft_warn',
  },
];

describe.each(buttons)(
  'PipelineStatus $name',
  ({ state, id, blockedId, label, handler, action }) => {
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

    it('unknown: disabled, aria-disabled, alert notice, click does not charge', () => {
      mount(state, { inkCost: undefined });
      const btn = byLabel(label);
      expect(btn.getAttribute('aria-describedby')).toBe(blockedId);
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      const alert = container.querySelector(`#${blockedId}`) as HTMLElement;
      expect(alert.getAttribute('role')).toBe('alert');
      expect(alert.textContent).toBe(INK_COST_UNKNOWN);
      act(() => btn.click());
      expect(handler()).not.toHaveBeenCalled();
    });

    it('loading: status line, disabled, click does not charge, no Sentry', () => {
      mount(state, { inkCost: undefined, inkCostLoading: true });
      const btn = byLabel(label);
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

    it('unknown: the Sentry warning carries only kind and the action', () => {
      mount(state, { inkCost: undefined });
      expect(mockCapture).toHaveBeenCalledWith('Ink cost unknown', {
        level: 'warning',
        tags: { kind: 'bail_regular', action },
      });
    });
  },
);

describe('PipelineStatus soft-warn reports an unknown cost once', () => {
  it('T-432: one line in the card, one Sentry warning, no skip-button line', () => {
    mount('soft_warn', { inkCost: undefined });
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(container.textContent?.split(INK_COST_UNKNOWN).length).toBe(2);
    expect(container.querySelector(`#${SOFT_WARN_SKIP_INK_COST_ID}`)).toBeNull();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });
  it('T-432: blocked, both buttons point at the one line and both stay disabled', () => {
    mount('soft_warn', { inkCost: undefined });
    const a = byLabel('Looks correct — generate anyway');
    const b = byLabel('Skip and generate anyway');
    for (const btn of [a, b]) {
      expect(btn.getAttribute('aria-describedby')).toBe(SOFT_WARN_INK_COST_ID);
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
    }
    expect(container.querySelectorAll(`#${SOFT_WARN_INK_COST_ID}`)).toHaveLength(1);
  });
  it('T-432: loading is one status line too, both buttons described by it', () => {
    mount('soft_warn', { inkCost: undefined, inkCostLoading: true });
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(byLabel('Skip and generate anyway').getAttribute('aria-describedby')).toBe(
      SOFT_WARN_INK_COST_ID,
    );
    expect(container.querySelector(`#${SOFT_WARN_SKIP_INK_COST_ID}`)).toBeNull();
  });
  it('T-432: the re-fetch link is "Check the cost again", once; only the retry is "Try again"', () => {
    mount('soft_warn', { inkCost: undefined });
    const links = Array.from(container.querySelectorAll('button')).filter(
      (x) => x.textContent === INK_COST_RECHECK,
    );
    expect(links).toHaveLength(1);
    act(() => links[0].click());
    expect(onInkCostRetry).toHaveBeenCalledTimes(1);
    expect(byLabel('Try again')).toBeUndefined(); // no charging button is called that here
    expect(container.textContent).toContain(INK_COST_UNKNOWN); // the notice text is unchanged
    mount('generation_failed', { inkCost: undefined });
    const tries = Array.from(container.querySelectorAll('button')).filter(
      (x) => x.textContent === 'Try again',
    );
    expect(tries).toHaveLength(1);
    expect(tries[0].disabled).toBe(true);
  });
  it('known: both buttons show the same N', () => {
    mount('soft_warn', { inkCost: 2 });
    expect(container.querySelector(`#${SOFT_WARN_INK_COST_ID}`)?.textContent).toBe('Uses 2 Ink');
    expect(container.querySelector(`#${SOFT_WARN_SKIP_INK_COST_ID}`)?.textContent).toBe(
      'Uses 2 Ink',
    );
  });
});
