// T-388: "Try again" on the generation-failed card charges Ink, so it shows the cost and blocks on an unknown one.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import GeneratingStep, { COST_UNKNOWN_REASON, RETRY_INK_COST_ID } from '../GeneratingStep';
import { INK_COST_LOADING, INK_COST_RECHECK, INK_COST_UNKNOWN } from '../InkCostLine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockCapture = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => mockCapture(...a),
}));

let container: HTMLDivElement;
let root: Root;
const onRetry = jest.fn();
const onInkCostRetry = jest.fn();

function mount(extra: { inkCost?: number; inkCostLoading?: boolean; retryable?: boolean }) {
  act(() => {
    root.render(
      <GeneratingStep
        documentName="Bail application"
        repairing={false}
        error={{ reason: 'Boom', retryable: extra.retryable ?? true }}
        onRetry={onRetry}
        onBackToBrief={jest.fn()}
        inkCost={extra.inkCost}
        inkCostLoading={extra.inkCostLoading}
        onInkCostRetry={onInkCostRetry}
        kind="bail"
      />,
    );
  });
}
const tryAgain = () =>
  Array.from(container.querySelectorAll('button')).find(
    (b) =>
      b.textContent === 'Try again' && b.getAttribute('aria-describedby') === RETRY_INK_COST_ID,
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

describe('GeneratingStep Try again Ink cost', () => {
  it('known: shows "Uses N Ink" under the button, enabled, described by the line, and retries', () => {
    mount({ inkCost: 4 });
    const line = container.querySelector(`#${RETRY_INK_COST_ID}`) as HTMLElement;
    expect(line.textContent).toBe('Uses 4 Ink');
    const btn = tryAgain();
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    expect(btn.parentElement?.contains(line)).toBe(true);
    act(() => btn.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('unknown (T-565 W14): disabled, aria-disabled, the reason line (no alert), described by it, click does not retry, no Sentry', () => {
    mount({ inkCost: undefined });
    const btn = tryAgain();
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('aria-describedby')).toBe(RETRY_INK_COST_ID);
    const line = container.querySelector(`#${RETRY_INK_COST_ID}`) as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.textContent).toBe(COST_UNKNOWN_REASON);
    expect(COST_UNKNOWN_REASON).toBe('You can generate once the Ink cost is shown.');
    expect(line.hasAttribute('role')).toBe(false);
    expect(container.textContent).not.toContain(INK_COST_UNKNOWN);
    act(() => btn.click());
    expect(onRetry).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('unknown: no "Check the cost again" link, and nothing fetches the cost', () => {
    mount({ inkCost: undefined });
    expect(
      Array.from(container.querySelectorAll('button')).filter(
        (b) => b.textContent === INK_COST_RECHECK,
      ),
    ).toHaveLength(0);
    expect(onInkCostRetry).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('the reason line is not shown while loading or once known', () => {
    mount({ inkCost: undefined, inkCostLoading: true });
    expect(container.textContent).not.toContain(COST_UNKNOWN_REASON);
    mount({ inkCost: 4 });
    expect(container.textContent).not.toContain(COST_UNKNOWN_REASON);
  });

  it('loading: status line, disabled, no charge on click, no Sentry', () => {
    mount({ inkCost: undefined, inkCostLoading: true });
    const line = container.querySelector(`#${RETRY_INK_COST_ID}`) as HTMLElement;
    expect(line.getAttribute('role')).toBe('status');
    expect(line.textContent).toBe(INK_COST_LOADING);
    const btn = tryAgain();
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    act(() => btn.click());
    expect(onRetry).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('a non-retryable error shows no Try again and no cost line', () => {
    mount({ inkCost: 4, retryable: false });
    expect(container.querySelector(`#${RETRY_INK_COST_ID}`)).toBeNull();
  });

  it.each([
    ['known', { inkCost: 4 }],
    ['unknown', { inkCost: undefined }],
    ['loading', { inkCost: undefined, inkCostLoading: true }],
  ])('%s: no role="alert" sits inside another role="alert"', (_n, extra) => {
    mount(extra);
    const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    for (const a of alerts) {
      expect(a.parentElement?.closest('[role="alert"]')).toBeNull();
    }
    // the error message is itself an alert, and the card around it is not
    expect(container.querySelector('h1')?.closest('[role="alert"]')).not.toBeNull();
    expect(
      container
        .querySelector('h1')
        ?.closest('[role="alert"]')
        ?.contains(container.querySelector(`#${RETRY_INK_COST_ID}`)),
    ).toBe(false);
  });
});
