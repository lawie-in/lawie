// T-372: the Confirm button shows the template Ink cost ("Uses N Ink") and points at it via aria-describedby.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep, { INK_COST_ID, formatInkCost } from '../BriefStep';
import type { Brief } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(extra: { confirmDescribedBy?: string; inkCost?: number }, onConfirm = jest.fn()) {
  const noop = jest.fn();
  act(() => {
    root.render(
      <BriefStep
        brief={brief}
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
        {...extra}
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

  it.each([undefined, 0])('shows no line and no cost id when inkCost is %p', (inkCost) => {
    mount({ inkCost });
    expect(costLine()).toBeNull();
    expect(container.textContent).not.toMatch(/Uses \d+ Ink/);
    expect(confirmButton().hasAttribute('aria-describedby')).toBe(false);
  });

  it('leaves the existing describedby unchanged when the cost is hidden', () => {
    mount({ inkCost: 0, confirmDescribedBy: 'reaccept-p7-generate' });
    expect(confirmButton().getAttribute('aria-describedby')).toBe('reaccept-p7-generate');
  });

  it('does not change the button label, and the line is outside the button', () => {
    mount({ inkCost: 2 });
    expect(confirmButton().textContent?.trim()).toBe('Confirm brief and continue');
    expect(confirmButton().contains(costLine())).toBe(false);
    expect(costLine()?.className).toContain('text-sm');
    expect(costLine()?.className).toContain('text-slate-600');
  });
});
