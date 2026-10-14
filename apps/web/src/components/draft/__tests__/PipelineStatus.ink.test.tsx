// T-388: every PipelineStatus button that charges Ink (retry, both soft-warn proceed buttons) shows the cost and blocks on an unknown one.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { INK_COST_LOADING, INK_COST_UNKNOWN } from '@/components/intake/InkCostLine';

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
  label: string;
  handler: () => jest.Mock;
  action: string;
}> = [
  {
    name: 'generation-failed Try again',
    state: 'generation_failed',
    id: FAILED_RETRY_INK_COST_ID,
    label: 'Try again',
    handler: () => onRetry,
    action: 'retry',
  },
  {
    name: 'soft-warn "Looks correct — generate anyway"',
    state: 'soft_warn',
    id: SOFT_WARN_INK_COST_ID,
    label: 'Looks correct — generate anyway',
    handler: () => onProceedAnyway,
    action: 'soft_warn',
  },
  {
    name: 'soft-warn "Skip and generate anyway"',
    state: 'soft_warn',
    id: SOFT_WARN_SKIP_INK_COST_ID,
    label: 'Skip and generate anyway',
    handler: () => onProceedAnyway,
    action: 'soft_warn',
  },
];

describe.each(buttons)('PipelineStatus $name', ({ state, id, label, handler, action }) => {
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
    const btn = byDescribedBy(id);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    const alert = container.querySelector(`#${id}`) as HTMLElement;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe(INK_COST_UNKNOWN);
    act(() => btn.click());
    expect(handler()).not.toHaveBeenCalled();
  });

  it('loading: status line, disabled, click does not charge, no Sentry', () => {
    mount(state, { inkCost: undefined, inkCostLoading: true });
    const btn = byDescribedBy(id);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    const line = container.querySelector(`#${id}`) as HTMLElement;
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
});

describe('PipelineStatus soft-warn reports an unknown cost once', () => {
  it('two lines in the card, one Sentry warning', () => {
    mount('soft_warn', { inkCost: undefined });
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2);
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });
  it('known: both buttons show the same N', () => {
    mount('soft_warn', { inkCost: 2 });
    expect(container.querySelector(`#${SOFT_WARN_INK_COST_ID}`)?.textContent).toBe('Uses 2 Ink');
    expect(container.querySelector(`#${SOFT_WARN_SKIP_INK_COST_ID}`)?.textContent).toBe(
      'Uses 2 Ink',
    );
  });
});
