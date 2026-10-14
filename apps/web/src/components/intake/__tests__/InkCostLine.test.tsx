// T-388: the Ink cost line under a button that charges: loading, known, unknown (block).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import InkCostLine, { INK_COST_LOADING, INK_COST_UNKNOWN, inkCostState } from '../InkCostLine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockCapture = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => mockCapture(...a),
}));

let container: HTMLDivElement;
let root: Root;

type Props = React.ComponentProps<typeof InkCostLine>;
const base: Props = {
  id: 'cost-line',
  cost: 3,
  loading: false,
  kind: 'bail_regular',
  action: 'retry',
};
function render(over: Partial<Props>) {
  act(() => {
    root.render(<InkCostLine {...base} {...over} />);
  });
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

describe('inkCostState', () => {
  it('is known for a finite cost above 0, whatever loading says', () => {
    expect(inkCostState(2, false)).toBe('known');
    expect(inkCostState(2, true)).toBe('known');
  });
  it('is loading while fetching without a cost, unknown otherwise', () => {
    expect(inkCostState(undefined, true)).toBe('loading');
    expect(inkCostState(undefined, false)).toBe('unknown');
  });
  it.each([0, -1, NaN, Infinity])('treats %p as not a cost', (n) => {
    expect(inkCostState(n, false)).toBe('unknown');
    expect(inkCostState(n, true)).toBe('loading');
  });
});

describe('InkCostLine strings', () => {
  it('uses the final strings word for word', () => {
    expect(INK_COST_UNKNOWN).toBe(
      'We could not work out the Ink cost for this. Try again in a moment.',
    );
    expect(INK_COST_LOADING).toBe('Working out the Ink cost...');
  });
});

describe('InkCostLine known', () => {
  it('shows "Uses N Ink" in a plain p with the id, no role', () => {
    render({ cost: 3 });
    const p = container.querySelector('#cost-line') as HTMLElement;
    expect(p.tagName).toBe('P');
    expect(p.textContent).toBe('Uses 3 Ink');
    expect(p.getAttribute('role')).toBeNull();
    expect(p.className).toContain('text-sm');
    expect(p.className).toContain('text-slate-600');
    expect(container.querySelector('button')).toBeNull();
  });
  it('sends nothing to Sentry', () => {
    render({ cost: 3 });
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('InkCostLine loading', () => {
  it('shows the loading line as a status with a hidden spinner', () => {
    render({ cost: undefined, loading: true });
    const p = container.querySelector('#cost-line') as HTMLElement;
    expect(p.getAttribute('role')).toBe('status');
    expect(p.textContent).toBe(INK_COST_LOADING);
    expect(p.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it('sends nothing to Sentry', () => {
    render({ cost: undefined, loading: true });
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('InkCostLine unknown', () => {
  it('shows the notice as an alert with the id and a hidden icon', () => {
    render({ cost: undefined });
    const alert = container.querySelector('#cost-line') as HTMLElement;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe(INK_COST_UNKNOWN);
    expect(alert.className).toContain('text-brand-error');
    expect(alert.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).not.toMatch(/Uses \d+ Ink/);
  });
  it('has a "Try again" button (type=button) that calls onRetry', () => {
    const onRetry = jest.fn();
    render({ cost: undefined, onRetry });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.textContent).toBe('Try again');
    expect(btn.type).toBe('button');
    act(() => btn.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it('has no Try again button without onRetry', () => {
    render({ cost: undefined });
    expect(container.querySelector('button')).toBeNull();
  });
  it('treats 0 and NaN as unknown', () => {
    render({ cost: 0 });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    render({ cost: NaN });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
  it('never says free or no charge', () => {
    render({ cost: undefined, onRetry: jest.fn() });
    expect(container.textContent?.toLowerCase()).not.toMatch(/free|no charge|no cost/);
  });
});

describe('InkCostLine Sentry', () => {
  it('warns once on entering unknown, with only kind and action as tags', () => {
    render({ cost: undefined, kind: 'bail_regular', action: 'soft_warn' });
    render({ cost: undefined, kind: 'bail_regular', action: 'soft_warn' });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith('Ink cost unknown', {
      level: 'warning',
      tags: { kind: 'bail_regular', action: 'soft_warn' },
    });
    expect(Object.keys(mockCapture.mock.calls[0][1]).sort()).toEqual(['level', 'tags']);
    expect(Object.keys(mockCapture.mock.calls[0][1].tags).sort()).toEqual(['action', 'kind']);
  });
  it('does not repeat on a re-render with the same state, and reports again after leaving and re-entering', () => {
    render({ cost: undefined });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    render({ cost: undefined, loading: true }); // retry in flight
    render({ cost: 4 }); // known
    expect(mockCapture).toHaveBeenCalledTimes(1);
    render({ cost: undefined }); // unknown again
    expect(mockCapture).toHaveBeenCalledTimes(2);
  });
  it('is silent with report={false}', () => {
    render({ cost: undefined, report: false });
    expect(mockCapture).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
