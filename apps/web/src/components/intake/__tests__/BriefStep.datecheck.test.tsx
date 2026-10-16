// T-363 AC1: the B2 warning on the s.138 brief. Confirm waits for "Continue with these dates".
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep, {
  DATE_CHECK_CHANGE,
  DATE_CHECK_CONTINUE,
  DATE_CHECK_ID,
  INK_COST_ID,
} from '../BriefStep';
import type { Brief, BriefItem } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const B2_A =
  'Notice not in time: the notice is sent on 30 October 2026, after 15 October 2026, the last of the 30 days from receipt of the return memo on 15 September 2026. Check the dates before sending.';
const B2_B =
  'Notice not in time: the notice is sent on 5 November 2026, after 15 October 2026, the last of the 30 days from receipt of the return memo on 15 September 2026. Check the dates before sending.';

function dateItem(key: string, label: string, value: string): BriefItem {
  return {
    key,
    part: 'dates',
    label,
    kind: 'date',
    required: false,
    options: [],
    value,
    source: 'user',
    please_check: false,
    placeholder: '[DATE]',
    party_name: false,
  };
}

function briefOf(dateCheck?: Brief['date_check'], canConfirm = true): Brief {
  return {
    kind: { id: 'legal_notice_s138', name: 'Legal notice s.138', court_document: false },
    court: { state: null, court_type: null, court: null },
    items: [
      dateItem('memo_received_date', 'Date the return memo was received', '2026-09-15'),
      dateItem('notice_sent_date', 'Date the notice is sent', '2026-10-30'),
    ],
    loose_dates: [],
    unplaced: [],
    still_unknown: [],
    can_confirm: canConfirm,
    confirm_blockers: [],
    confirm_message: null,
    ...(dateCheck ? { date_check: dateCheck } : {}),
  };
}

describe('BriefStep date check (T-363 AC1)', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onConfirm = jest.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    // jsdom has no layout: scrollIntoView is not implemented
    Element.prototype.scrollIntoView = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(brief: Brief) {
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
          inkCost={1}
        />,
      );
    });
  }
  const button = (label: string) =>
    Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    ) as HTMLButtonElement;
  const confirm = () => button('Confirm brief and continue');
  const click = (el: HTMLElement) =>
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

  it('uses the exact button words', () => {
    expect(DATE_CHECK_CONTINUE).toBe('Continue with these dates');
    expect(DATE_CHECK_CHANGE).toBe('Change the dates');
    expect(DATE_CHECK_ID).toBe('brief-date-check');
  });

  it('shows the B2 text and both buttons, and Confirm is disabled until Continue', () => {
    mount(briefOf({ line: 'B2', text: B2_A }));
    const block = container.querySelector(`#${DATE_CHECK_ID}`);
    expect(block).not.toBeNull();
    expect(block!.textContent).toContain(B2_A);
    expect(button(DATE_CHECK_CONTINUE)).toBeDefined();
    expect(button(DATE_CHECK_CHANGE)).toBeDefined();
    expect(confirm().getAttribute('aria-disabled')).toBe('true');
    expect(confirm().getAttribute('aria-describedby') ?? '').toContain(DATE_CHECK_ID);
    expect(confirm().getAttribute('aria-describedby') ?? '').toContain(INK_COST_ID);
  });

  it('clicking Confirm while held does not confirm', () => {
    mount(briefOf({ line: 'B2', text: B2_A }));
    click(confirm());
    expect(onConfirm).not.toHaveBeenCalled();
    // and the click on the held Confirm sends the advocate to the Continue button
    expect(document.activeElement).toBe(button(DATE_CHECK_CONTINUE));
  });

  it('Continue with these dates enables Confirm, which then confirms', () => {
    mount(briefOf({ line: 'B2', text: B2_A }));
    click(button(DATE_CHECK_CONTINUE));
    expect(confirm().getAttribute('aria-disabled')).toBe('false');
    expect(confirm().getAttribute('aria-describedby') ?? '').not.toContain(DATE_CHECK_ID);
    click(confirm());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Change the dates does not release Confirm and moves to the memo date field', () => {
    mount(briefOf({ line: 'B2', text: B2_A }));
    const field = container.querySelector('#brief-memo_received_date') as HTMLElement | null;
    expect(field).not.toBeNull();
    click(button(DATE_CHECK_CHANGE));
    expect(field!.contains(document.activeElement) || document.activeElement === field).toBe(true);
    expect(confirm().getAttribute('aria-disabled')).toBe('true');
    click(confirm());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a changed B2 text (dates edited) locks Confirm again', () => {
    mount(briefOf({ line: 'B2', text: B2_A }));
    click(button(DATE_CHECK_CONTINUE));
    expect(confirm().getAttribute('aria-disabled')).toBe('false');
    mount(briefOf({ line: 'B2', text: B2_B }));
    expect(container.querySelector(`#${DATE_CHECK_ID}`)!.textContent).toContain(B2_B);
    expect(confirm().getAttribute('aria-disabled')).toBe('true');
    click(confirm());
    expect(onConfirm).not.toHaveBeenCalled();
    click(button(DATE_CHECK_CONTINUE));
    expect(confirm().getAttribute('aria-disabled')).toBe('false');
  });

  it('with the dates back in time (no date_check) the block is gone and Confirm is free', () => {
    mount(briefOf({ line: 'B2', text: B2_A }));
    click(button(DATE_CHECK_CONTINUE));
    mount(briefOf());
    expect(container.querySelector(`#${DATE_CHECK_ID}`)).toBeNull();
    expect(confirm().getAttribute('aria-disabled')).toBe('false');
  });

  it('no date_check: no block, no extra buttons, Confirm enabled', () => {
    mount(briefOf());
    expect(container.querySelector(`#${DATE_CHECK_ID}`)).toBeNull();
    expect(container.textContent).not.toContain(DATE_CHECK_CONTINUE);
    expect(confirm().getAttribute('aria-disabled')).toBe('false');
  });

  it('Continue never lifts another blocker: can_confirm false stays disabled', () => {
    mount(briefOf({ line: 'B2', text: B2_A }, false));
    click(button(DATE_CHECK_CONTINUE));
    expect(confirm().getAttribute('aria-disabled')).toBe('true');
  });
});
