// T-690b (Rajesh): the brief's soft findings render as one Notice above the actions row
// (Confirm + Ink cost line), and change neither.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep, { INK_COST_ID } from '../BriefStep';
import type { Brief, BriefItem } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WS_TEXT =
  'This written statement is more than 90 days after service of summons. In an ordinary suit the court allows that only in exceptional cases; in a commercial suit it can be allowed up to 120 days, for reasons recorded in writing and on payment of costs, and not after that. Set out the reasons in the delay application.';
const FINDING = { rule_id: 'ws_over_90_days', text: WS_TEXT };

const item = (key: string, label: string, value: string | null): BriefItem => ({
  key,
  part: 'facts',
  label,
  kind: 'text',
  required: false,
  options: [],
  value,
  source: value ? 'user' : null,
  please_check: false,
  placeholder: `[${key.toUpperCase()}]`,
  party_name: false,
});

function briefOf(over: Partial<Brief> = {}): Brief {
  return {
    kind: { id: 'written_statement', name: 'Written statement', court_document: false },
    court: { state: null, court_type: null, court: null },
    items: [
      item('days_from_service', 'Days from service of summons', '121'),
      item('defendant', 'Defendant', 'Ravi'),
    ],
    loose_dates: [],
    unplaced: [],
    still_unknown: [],
    can_confirm: true,
    confirm_blockers: [],
    confirm_message: null,
    ...over,
  };
}

describe('BriefStep soft findings (T-690b)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function show(brief: Brief, extra: { inkCost?: number } = {}) {
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
          onConfirm={noop}
          inkCost={extra.inkCost ?? 2}
        />,
      );
    });
  }
  const confirm = () =>
    Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Confirm brief and continue'),
    ) as HTMLButtonElement;
  const cards = () =>
    Array.from(container.querySelectorAll('[role="status"]')).filter((e) =>
      (e.textContent ?? '').includes('more than 90 days after service'),
    ) as HTMLElement[];
  const inkLine = () => document.getElementById(INK_COST_ID) as HTMLElement;
  const follows = (a: Node, b: Node) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('shows exactly one status card containing exactly the signed text', () => {
    show(briefOf({ soft_findings: [FINDING] }));
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toBe(WS_TEXT);
    expect(cards()[0].querySelector('p')!.textContent).toBe(WS_TEXT);
    expect(container.textContent!.split(WS_TEXT).length - 1).toBe(1);
    expect(cards()[0].dataset.variant).toBe('warn');
    expect(cards()[0].getAttribute('role')).not.toBe('alert');
  });

  it('sits after the fact rows and before the Confirm button and the Ink cost line', () => {
    show(briefOf({ soft_findings: [FINDING] }));
    const card = cards()[0];
    const lastInput = Array.from(container.querySelectorAll('input')).pop()!;
    expect(lastInput).toBeDefined();
    expect(follows(lastInput, card)).toBe(true);
    expect(follows(card, confirm())).toBe(true);
    expect(inkLine()).not.toBeNull();
    expect(follows(card, inkLine())).toBe(true);
    // directly above the actions row: the next element sibling is the row holding Confirm
    expect(card.nextElementSibling!.contains(confirm())).toBe(true);
    expect(card.nextElementSibling!.contains(inkLine())).toBe(true);
    expect(card.contains(confirm())).toBe(false);
  });

  it('has no button, link or input inside the card', () => {
    show(briefOf({ soft_findings: [FINDING] }));
    expect(cards()[0].querySelector('button, a, input, [role="button"]')).toBeNull();
  });

  it('leaves Confirm and the Ink cost line exactly as without the finding', () => {
    for (const over of [{}, { can_confirm: false, confirm_blockers: ['parties'] }] as Array<
      Partial<Brief>
    >) {
      show(briefOf(over));
      const without = {
        text: confirm().textContent,
        ariaDisabled: confirm().getAttribute('aria-disabled'),
        disabled: confirm().disabled,
        describedBy: confirm().getAttribute('aria-describedby'),
        ink: inkLine().textContent,
        cls: confirm().className,
      };
      expect(cards()).toHaveLength(0);
      show(briefOf({ ...over, soft_findings: [FINDING] }));
      expect(cards()).toHaveLength(1);
      expect({
        text: confirm().textContent,
        ariaDisabled: confirm().getAttribute('aria-disabled'),
        disabled: confirm().disabled,
        describedBy: confirm().getAttribute('aria-describedby'),
        ink: inkLine().textContent,
        cls: confirm().className,
      }).toEqual(without);
    }
  });

  it("adds nothing to Confirm's description: the card is not in aria-describedby", () => {
    show(briefOf({ soft_findings: [FINDING] }));
    const ids = (confirm().getAttribute('aria-describedby') ?? '').split(/\s+/);
    for (const id of ids.filter(Boolean)) {
      expect(cards()[0].contains(document.getElementById(id))).toBe(false);
    }
  });

  it('a brief without soft_findings (or with an empty list) shows no card', () => {
    show(briefOf());
    expect(cards()).toHaveLength(0);
    expect(container.textContent).not.toContain('more than 90 days');
    show(briefOf({ soft_findings: [] }));
    expect(cards()).toHaveLength(0);
    expect(container.textContent).not.toContain('more than 90 days');
  });

  it('a duplicate entry renders one instance', () => {
    show(
      briefOf({ soft_findings: [FINDING, { ...FINDING }, { rule_id: 'dup_id', text: WS_TEXT }] }),
    );
    expect(cards()).toHaveLength(1);
    expect(container.textContent!.split(WS_TEXT).length - 1).toBe(1);
  });

  it('malformed entries show nothing', () => {
    show(
      briefOf({
        soft_findings: [
          { rule_id: 'x', text: '' },
          { rule_id: 'y' },
        ] as unknown as Brief['soft_findings'],
      }),
    );
    expect(container.querySelector('[data-variant="warn"]')).toBeNull();
  });

  it('re-render with the finding gone (edited to 30) removes the card; back to 121 restores it', () => {
    show(briefOf({ soft_findings: [FINDING] }));
    expect(cards()).toHaveLength(1);
    show(briefOf({ items: [item('days_from_service', 'Days from service of summons', '30')] }));
    expect(cards()).toHaveLength(0);
    expect(container.querySelector('[data-variant="warn"]')).toBeNull();
    expect(confirm().getAttribute('aria-disabled')).toBe('false');
    show(briefOf({ soft_findings: [FINDING] }));
    expect(cards()).toHaveLength(1);
  });
});
