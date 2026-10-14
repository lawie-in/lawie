// T-372: the Confirm button shows the template Ink cost ("Uses N Ink") and points at it via aria-describedby.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep, { INK_COST_ID, formatInkCost } from '../BriefStep';
import type { Brief } from '../briefTypes';
import { INK_COST_LOADING, INK_COST_UNKNOWN } from '../InkCostLine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockCapture = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => mockCapture(...a),
}));

const brief: Brief = {
  kind: { id: 'k', name: 'Notice', court_document: false },
  court: { state: null, court_type: null, court: null },
  items: [],
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
};

let container: HTMLDivElement;
let root: Root;

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

function mount(
  extra: {
    confirmDescribedBy?: string;
    inkCost?: number;
    inkCostLoading?: boolean;
    onInkCostRetry?: () => void;
    inkCostKind?: string;
    brief?: Brief;
  },
  onConfirm = jest.fn(),
) {
  const { brief: briefOverride, ...rest } = extra;
  const noop = jest.fn();
  act(() => {
    root.render(
      <BriefStep
        brief={briefOverride ?? brief}
        busy={false}
        confirming={false}
        message={null}
        questionsLeft={0}
        onValue={noop}
        onCourt={noop}
        onKindName={noop}
        onPlaceDate={noop}
        onChangeDocument={noop}
        onMoreQuestions={noop}
        onEditDescription={noop}
        onCancel={noop}
        onConfirm={onConfirm}
        {...rest}
      />,
    );
  });
}
function confirmButton(): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes('Confirm brief and continue'),
  ) as HTMLButtonElement;
}
const costLine = () => container.querySelector(`#${INK_COST_ID}`);

describe('formatInkCost', () => {
  it.each([
    [1, 'Uses 1 Ink'],
    [2, 'Uses 2 Ink'],
    [0, null],
    [undefined, null],
    [NaN, null],
    [-1, null],
  ])('formatInkCost(%p) is %p', (n, expected) => {
    expect(formatInkCost(n)).toBe(expected);
  });
});

describe('BriefStep Ink cost line', () => {
  it('renders "Uses 2 Ink" and points the button at it', () => {
    mount({ inkCost: 2 });
    expect(costLine()?.textContent).toBe('Uses 2 Ink');
    expect(confirmButton().getAttribute('aria-describedby')).toBe(INK_COST_ID);
  });

  it('renders "Uses 1 Ink" for a cost of 1', () => {
    mount({ inkCost: 1 });
    expect(costLine()?.textContent).toBe('Uses 1 Ink');
  });

  it('keeps the existing describedby ids and appends the cost id', () => {
    mount({ inkCost: 2, confirmDescribedBy: 'reaccept-p7-generate' });
    expect(confirmButton().getAttribute('aria-describedby')).toBe(
      `reaccept-p7-generate ${INK_COST_ID}`,
    );
  });

  it('keeps the cost id as the only describedby when nothing else is passed', () => {
    mount({ inkCost: 2 });
    expect(confirmButton().getAttribute('aria-describedby')).toBe(INK_COST_ID);
  });

  it('does not change the button label, and the line is outside the button', () => {
    mount({ inkCost: 2 });
    expect(confirmButton().textContent?.trim()).toBe('Confirm brief and continue');
    expect(confirmButton().contains(costLine())).toBe(false);
    expect(costLine()?.className).toContain('text-sm');
    expect(costLine()?.className).toContain('text-slate-600');
  });
});

describe('BriefStep Confirm and the Ink cost (T-388, AC1 and AC3)', () => {
  const blockedBrief: Brief = {
    ...brief,
    can_confirm: false,
    confirm_blockers: ['court'],
    confirm_message: 'Choose the court first.',
  };
  const click = (el: HTMLElement) =>
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

  it('known: shows "Uses N Ink", is described by it, and click confirms', () => {
    const onConfirm = jest.fn();
    mount({ inkCost: 3 }, onConfirm);
    expect(costLine()?.textContent).toBe('Uses 3 Ink');
    expect(confirmButton().getAttribute('aria-describedby')).toContain(INK_COST_ID);
    expect(confirmButton().getAttribute('aria-disabled')).toBe('false');
    click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, NaN])(
    'unknown (cost %p): aria-disabled only, still focusable, notice shown, click does nothing',
    (inkCost) => {
      const onConfirm = jest.fn();
      const onInkCostRetry = jest.fn();
      mount({ inkCost, onInkCostRetry }, onConfirm);
      const btn = confirmButton();
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.hasAttribute('disabled')).toBe(false);
      expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
      expect(btn.getAttribute('aria-describedby')).toContain(INK_COST_ID);
      const notice = costLine();
      expect(notice?.getAttribute('role')).toBe('alert');
      expect(notice?.textContent).toContain(INK_COST_UNKNOWN);
      expect(container.textContent).not.toMatch(/Uses \d+ Ink/);

      act(() => btn.focus());
      expect(document.activeElement).toBe(btn);
      click(btn);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(btn);
    },
  );

  it('unknown: reports to Sentry with kind and action only', () => {
    mount({ inkCost: undefined, inkCostKind: 'legal_notice_s138' });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [, opts] = mockCapture.mock.calls[0];
    expect(opts.tags).toEqual({ kind: 'legal_notice_s138', action: 'confirm' });
  });

  it('unknown: Try again calls onInkCostRetry', () => {
    const onInkCostRetry = jest.fn();
    mount({ inkCost: undefined, onInkCostRetry });
    const retry = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Try again',
    ) as HTMLButtonElement;
    click(retry);
    expect(onInkCostRetry).toHaveBeenCalledTimes(1);
  });

  it('loading: shows the status line, Confirm is off, onConfirm is not called', () => {
    const onConfirm = jest.fn();
    mount({ inkCost: undefined, inkCostLoading: true }, onConfirm);
    const line = costLine();
    expect(line?.getAttribute('role')).toBe('status');
    expect(line?.textContent).toContain(INK_COST_LOADING);
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
    expect(confirmButton().hasAttribute('disabled')).toBe(false);
    expect(confirmButton().getAttribute('aria-describedby')).toContain(INK_COST_ID);
    click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('a blocker still wins: click runs focusFirstBlocker, not onConfirm, even with a known cost', () => {
    const onConfirm = jest.fn();
    const select = document.createElement('select');
    select.id = 'brief-court-state';
    select.innerHTML = '<option value="">Choose</option>';
    document.body.appendChild(select);
    try {
      mount({ inkCost: 2, brief: blockedBrief }, onConfirm);
      expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
      click(confirmButton());
      expect(onConfirm).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(select);
    } finally {
      select.remove();
    }
  });

  it('a blocker still wins with an unknown cost: focus goes to the blocker', () => {
    const onConfirm = jest.fn();
    const select = document.createElement('select');
    select.id = 'brief-court-state';
    select.innerHTML = '<option value="">Choose</option>';
    document.body.appendChild(select);
    try {
      mount({ inkCost: undefined, brief: blockedBrief }, onConfirm);
      click(confirmButton());
      expect(onConfirm).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(select);
    } finally {
      select.remove();
    }
  });
});
