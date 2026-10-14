// T-343 round 6: the confirm button points at the privacy P7 box via aria-describedby.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep, { INK_COST_ID } from '../BriefStep';
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

describe('BriefStep confirmDescribedBy', () => {
  it('sets aria-describedby on the confirm button when given', () => {
    mount({ confirmDescribedBy: 'reaccept-p7-generate', inkCost: 1 });
    expect(confirmButton().getAttribute('aria-describedby')).toBe(
      `reaccept-p7-generate ${INK_COST_ID}`,
    );
  });

  it('points only at the Ink cost line when the prop is absent', () => {
    mount({ inkCost: 1 });
    expect(confirmButton().getAttribute('aria-describedby')).toBe(INK_COST_ID);
  });

  it('still calls onConfirm when clicked', () => {
    const onConfirm = jest.fn();
    mount({ confirmDescribedBy: 'x', inkCost: 1 }, onConfirm);
    act(() => confirmButton().click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
