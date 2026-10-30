// T-629 (Ajay, T-613 §(g), §(j)2): Confirm stays off while a required O.39 field is empty, the
// blocking lines show one per line, and a press on the message goes to the first blocking field.
// The signed EN strings are typed here on purpose; the test does not read handoff/.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep from '../BriefStep';
import type { Brief, BriefItem, Ledger } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RELIEF_EN = 'Add the relief sought in the main suit to continue.';
const RESTRAINT_EN = 'Add the acts the defendant should be restrained from, to continue.';

const item = (over: Partial<BriefItem>): BriefItem => ({
  key: 'x',
  part: 'facts',
  label: 'X',
  kind: 'text',
  required: true,
  options: [],
  value: null,
  source: null,
  please_check: false,
  placeholder: '[X]',
  party_name: false,
  ...over,
});

const ITEMS = (): BriefItem[] => [
  item({ key: 'plaintiff_name', label: 'Plaintiff Name', part: 'parties', party_name: true }),
  item({ key: 'defendant_name', label: 'Defendant Name', part: 'parties', party_name: true }),
  item({
    key: 'main_suit_relief',
    label: 'Relief sought in the main suit',
    kind: 'text',
    blocks_confirm: true,
  }),
  item({
    key: 'restraint_sought',
    label: 'Acts the defendant should be restrained from',
    part: 'relief',
    blocks_confirm: true,
  }),
];

const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' } as Brief['court'];
const NO_COURT = { state: null, court_type: null, court: null } as Brief['court'];

function briefOf(items: BriefItem[], over: Partial<Brief> = {}, court = COURT): Brief {
  return {
    kind: { id: 'temporary_injunction_o39', name: 'Temporary injunction', court_document: true },
    court,
    items,
    loose_dates: [],
    unplaced: [],
    still_unknown: [],
    can_confirm: true,
    confirm_blockers: [],
    confirm_message: null,
    ...over,
  };
}
const blocked = (
  blockers: Array<'court' | 'parties' | 'required_fields'>,
  message: string,
  keys?: string[],
): Partial<Brief> => ({
  can_confirm: false,
  confirm_blockers: blockers,
  confirm_message: message,
  ...(keys ? { confirm_blocking_keys: keys } : {}),
});

const ledgerHoldingParties = (): Ledger => {
  const fact = (key: string, display: string) => ({
    id: `f-${key}`,
    key,
    label: key,
    type: 'text' as const,
    value: display,
    display,
    raw_span: display,
    source: 'user' as const,
    confidence: 0.95,
    required_in_draft: true,
  });
  return {
    ledger_id: 'l1',
    version: 1,
    run_type: 'user',
    document_kind: 'temporary_injunction_o39',
    facts: [fact('plaintiff_name', 'Ram Kumar'), fact('defendant_name', 'Shyam Lal')],
    unresolved: [],
    fields: { plaintiff_name: 'text', defendant_name: 'text' },
  } as unknown as Ledger;
};

let container: HTMLDivElement;
let root: Root;
const onConfirm = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  Element.prototype.scrollIntoView = jest.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(brief: Brief, ledger: Ledger | null = null) {
  const noop = jest.fn();
  act(() => {
    root.render(
      <BriefStep
        brief={brief}
        ledger={ledger}
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
        inkCost={3}
      />,
    );
  });
}
const buttons = () => Array.from(container.querySelectorAll('button'));
const confirmBtn = () =>
  buttons().find((b) => (b.textContent ?? '').includes('Confirm brief and continue')) as
    | HTMLButtonElement
    | undefined;
const messageBtn = () =>
  buttons().find((b) => (b.textContent ?? '').includes('to continue')) as HTMLButtonElement;
const press = (el: HTMLElement) => act(() => el.click());

describe('T-629 BriefStep: required fields block Confirm', () => {
  it('both fields empty: Confirm is disabled and both signed lines show', () => {
    mount(
      briefOf(
        ITEMS().map((i) => (i.party_name ? { ...i, value: 'Named', source: 'user' } : i)),
        blocked(['required_fields'], `${RELIEF_EN}\n${RESTRAINT_EN}`, [
          'main_suit_relief',
          'restraint_sought',
        ]),
      ),
    );
    expect(confirmBtn()?.getAttribute('aria-disabled') === 'true' || confirmBtn()?.disabled).toBe(
      true,
    );
    expect(messageBtn().textContent).toBe(`${RELIEF_EN}\n${RESTRAINT_EN}`);
    expect(messageBtn().className).toContain('whitespace-pre-line');
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('only restraint_sought empty: one line, and a press does not confirm', () => {
    mount(briefOf(ITEMS(), blocked(['required_fields'], RESTRAINT_EN, ['restraint_sought'])));
    expect(messageBtn().textContent).toBe(RESTRAINT_EN);
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a brief with nothing blocking can confirm (control)', () => {
    mount(briefOf(ITEMS().map((i) => ({ ...i, value: 'v', source: 'user' as const }))));
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('parties lifted by the ledger does NOT lift required_fields: Confirm stays off, field lines show', () => {
    mount(
      briefOf(
        ITEMS(),
        blocked(
          ['parties', 'required_fields'],
          `Choose the court and add the parties to continue.\n${RELIEF_EN}\n${RESTRAINT_EN}`.replace(
            'Choose the court and add the parties',
            'Add the name of the plaintiff',
          ),
          ['main_suit_relief', 'restraint_sought'],
        ),
      ),
      ledgerHoldingParties(),
    );
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(messageBtn().textContent).toBe(`${RELIEF_EN}\n${RESTRAINT_EN}`);
    expect(container.textContent).not.toContain('Add the name of the');
  });

  it('parties lifted and the court still needed: court line first, then the field lines', () => {
    mount(
      briefOf(
        ITEMS(),
        blocked(
          ['court', 'parties', 'required_fields'],
          `Choose the court and add the parties to continue.\n${RELIEF_EN}\n${RESTRAINT_EN}`,
          ['main_suit_relief', 'restraint_sought'],
        ),
        NO_COURT,
      ),
      ledgerHoldingParties(),
    );
    expect(messageBtn().textContent).toBe(
      `Choose the court to continue.\n${RELIEF_EN}\n${RESTRAINT_EN}`,
    );
  });

  it('parties lifted, court chosen, nothing else: Confirm works as before (T-498 unchanged)', () => {
    mount(
      briefOf(
        ITEMS().map((i) => (i.blocks_confirm ? { ...i, value: 'v', source: 'user' as const } : i)),
        blocked(['parties'], 'Add the name of the plaintiff to continue.'),
      ),
      ledgerHoldingParties(),
    );
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('T-629 BriefStep: the message goes to the first blocking field', () => {
  it('with the court and parties fine, focus goes to confirm_blocking_keys[0]', () => {
    const items = ITEMS().map((i) =>
      i.party_name ? { ...i, value: 'Named', source: 'user' as const } : i,
    );
    mount(
      briefOf(
        items,
        blocked(['required_fields'], `${RELIEF_EN}\n${RESTRAINT_EN}`, [
          'main_suit_relief',
          'restraint_sought',
        ]),
      ),
    );
    (document.activeElement as HTMLElement | null)?.blur();
    press(messageBtn());
    const target = document.getElementById('brief-main_suit_relief');
    expect(target).not.toBeNull();
    expect(target!.contains(document.activeElement) || document.activeElement === target).toBe(
      true,
    );
  });

  it('when main_suit_relief is filled, focus goes to restraint_sought', () => {
    const items = ITEMS().map((i) =>
      i.party_name || i.key === 'main_suit_relief'
        ? { ...i, value: 'Given', source: 'user' as const }
        : i,
    );
    mount(briefOf(items, blocked(['required_fields'], RESTRAINT_EN, ['restraint_sought'])));
    (document.activeElement as HTMLElement | null)?.blur();
    press(messageBtn());
    const target = document.getElementById('brief-restraint_sought');
    expect(target).not.toBeNull();
    expect(target!.contains(document.activeElement) || document.activeElement === target).toBe(
      true,
    );
  });

  it('an unnamed party still comes before the required fields', () => {
    mount(
      briefOf(ITEMS(), {
        // T-644: on O.39 the service lists the missing parties (plaintiff line, AJ-644-M1).
        ...blocked(
          ['parties', 'required_fields'],
          `Add the plaintiff's name to continue.\n${RELIEF_EN}\n${RESTRAINT_EN}`,
          ['main_suit_relief', 'restraint_sought'],
        ),
        confirm_missing_party_keys: ['plaintiff_name'],
      }),
    );
    (document.activeElement as HTMLElement | null)?.blur();
    press(messageBtn());
    const target = document.getElementById('brief-plaintiff_name');
    expect(target).not.toBeNull();
    expect(target!.contains(document.activeElement) || document.activeElement === target).toBe(
      true,
    );
  });
});
