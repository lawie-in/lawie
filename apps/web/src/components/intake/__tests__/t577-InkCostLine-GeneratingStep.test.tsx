// T-577: the opt-in ceiling cost line (AJ-577-M6 (2)); the default line is untouched.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import GeneratingStep, { RETRY_INK_COST_ID } from '../GeneratingStep';
import InkCostLine, { formatInkCeiling, formatInkCost, INK_COST_UNKNOWN } from '../InkCostLine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const line = (props: Partial<React.ComponentProps<typeof InkCostLine>>) =>
  act(() =>
    root.render(
      <InkCostLine id="c" cost={3} loading={false} kind="bail" action="confirm" {...props} />,
    ),
  );

describe('InkCostLine ceiling variant', () => {
  it('ceiling: "Uses up to N Ink" in a polite status region', () => {
    line({ ceiling: true });
    const p = container.querySelector('#c') as HTMLElement;
    expect(p.textContent).toBe('Uses up to 3 Ink');
    expect(p.getAttribute('role')).toBe('status');
  });

  it('default and ceiling:false are unchanged: "Uses N Ink", no role', () => {
    line({});
    expect(container.querySelector('#c')?.textContent).toBe('Uses 3 Ink');
    expect(container.querySelector('#c')?.getAttribute('role')).toBeNull();
    line({ ceiling: false });
    expect(container.querySelector('#c')?.textContent).toBe('Uses 3 Ink');
  });

  it('a half-Ink figure is printed as is', () => {
    line({ ceiling: true, cost: 2.5 });
    expect(container.querySelector('#c')?.textContent).toBe('Uses up to 2.5 Ink');
  });

  it.each([undefined, 0, -1, Number.NaN])(
    'ceiling with cost %p is the unknown notice, never "up to"',
    (cost) => {
      line({ ceiling: true, cost: cost as number | undefined, onRetry: jest.fn() });
      expect(container.textContent).toContain(INK_COST_UNKNOWN);
      expect(container.textContent).not.toContain('up to');
    },
  );

  it('loading with ceiling is still the loading line', () => {
    line({ ceiling: true, cost: undefined, loading: true });
    expect(container.textContent).not.toContain('Uses');
    expect(container.querySelector('#c')?.getAttribute('role')).toBe('status');
  });

  it('formatters', () => {
    expect(formatInkCost(4)).toBe('Uses 4 Ink');
    expect(formatInkCeiling(4)).toBe('Uses up to 4 Ink');
    expect(formatInkCeiling(undefined)).toBeNull();
    expect(formatInkCeiling(0)).toBeNull();
  });
});

describe('GeneratingStep inkCostCeiling', () => {
  const mount = (extra: { inkCostCeiling?: boolean }) =>
    act(() =>
      root.render(
        <GeneratingStep
          documentName="Bail application"
          repairing={false}
          error={{ reason: 'Boom', retryable: true }}
          onRetry={jest.fn()}
          onBackToBrief={jest.fn()}
          inkCost={3}
          onInkCostRetry={jest.fn()}
          kind="bail"
          {...extra}
        />,
      ),
    );

  it('true: the Try again cost line reads "Uses up to N Ink"', () => {
    mount({ inkCostCeiling: true });
    expect(container.querySelector(`#${RETRY_INK_COST_ID}`)?.textContent).toBe('Uses up to 3 Ink');
  });

  it('absent or false: "Uses N Ink"', () => {
    mount({});
    expect(container.querySelector(`#${RETRY_INK_COST_ID}`)?.textContent).toBe('Uses 3 Ink');
    mount({ inkCostCeiling: false });
    expect(container.querySelector(`#${RETRY_INK_COST_ID}`)?.textContent).toBe('Uses 3 Ink');
  });
});
