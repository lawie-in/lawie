// T-655 (Ajay AJ-644-M3, Arjun): the screen takes its ledger-given set from the service's
// `brief.ledger_given_keys` and does not judge the ledger. An absent field means nothing counts as
// ledger-given, for every pack (fail closed). Signed ask lines typed here as in
// handoff/legal/T-511-copy-rulings-ajay.md (AJ-644-M1). Fictional data only.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep from '../BriefStep';
import type { Brief, BriefItem, Ledger } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PLAINTIFF_EN = "Add the plaintiff's name to continue.";
const BAIL_PARTIES_EN = 'Add the name of the applicant to continue.';

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

const O39_ITEMS = [
  item({
    key: 'plaintiff_name',
    label: 'Plaintiff Name',
    part: 'parties',
    party_name: true,
    placeholder: '[PLAINTIFF]',
  }),
  item({
    key: 'defendant_name',
    label: 'Defendant Name',
    part: 'parties',
    party_name: true,
    value: 'Harish Chandra Tiwari',
    source: 'user',
  }),
  item({ key: 'main_suit_relief', label: 'Relief', value: 'Declaration of title', source: 'user' }),
  item({
    key: 'restraint_sought',
    label: 'Restraint',
    part: 'relief',
    value: 'raising construction',
    source: 'user',
  }),
];
const BAIL_ITEMS = [
  item({
    key: 'applicant_name',
    label: 'Applicant Name',
    part: 'parties',
    party_name: true,
    placeholder: '[APPLICANT]',
  }),
  item({ key: 'applicant_age', label: 'Age', placeholder: '[AGE]' }),
];

const unknownOf = (items: BriefItem[]) =>
  items
    .filter((i) => i.value === null)
    .map((i) => ({ key: i.key, label: i.label, placeholder: i.placeholder }));

function briefOf(kindId: string, items: BriefItem[], over: Partial<Brief> = {}): Brief {
  return {
    kind: { id: kindId, name: kindId, court_document: true },
    court: {
      state: 'bihar',
      court_type: 'civil_court',
      court: 'civil_court_patna',
    } as Brief['court'],
    items,
    loose_dates: [],
    unplaced: [],
    still_unknown: unknownOf(items),
    can_confirm: true,
    confirm_blockers: [],
    confirm_message: null,
    ...over,
  };
}
const o39Blocked = (over: Partial<Brief> = {}) =>
  briefOf('temporary_injunction_o39', O39_ITEMS, {
    can_confirm: false,
    confirm_blockers: ['parties'],
    confirm_message: PLAINTIFF_EN,
    confirm_missing_party_keys: ['plaintiff_name'],
    ...over,
  });
const bailBlocked = (over: Partial<Brief> = {}) =>
  briefOf('bail_regular', BAIL_ITEMS, {
    can_confirm: false,
    confirm_blockers: ['parties'],
    confirm_message: BAIL_PARTIES_EN,
    ...over,
  });

const ledgerHolding = (key: string, display: string): Ledger =>
  ({
    ledger_id: 'l1',
    version: 1,
    run_type: 'user',
    document_kind: 'x',
    facts: [
      {
        id: `f-${key}`,
        key,
        label: key,
        type: 'text',
        value: display,
        display,
        raw_span: display,
        source: 'user',
        confidence: 0.95,
        required_in_draft: true,
      },
    ],
    unresolved: [],
    fields: { [key]: 'text' },
  }) as unknown as Ledger;

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

function mount(brief: Brief, ledger: Ledger | null) {
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
  buttons().find((b) =>
    (b.textContent ?? '').includes('Confirm brief and continue'),
  ) as HTMLButtonElement;
const confirmOff = () =>
  confirmBtn().getAttribute('aria-disabled') === 'true' || confirmBtn().disabled;
const unknownText = () =>
  container.querySelector('section[aria-labelledby="brief-unknown"]')?.textContent ?? '';

describe('T-655 BriefStep: the given set is brief.ledger_given_keys', () => {
  it('O.39, field absent: a ledger-held plaintiff lifts nothing (fail closed), the signed line shows', () => {
    mount(o39Blocked(), ledgerHolding('plaintiff_name', 'Kavita Rani Mishra'));
    expect(confirmOff()).toBe(true);
    expect(container.textContent).toContain(PLAINTIFF_EN);
    act(() => confirmBtn().click());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('non-O.39, field absent: a ledger-held party lifts nothing either (fail closed)', () => {
    mount(bailBlocked(), ledgerHolding('applicant_name', 'Kavita Rani Mishra'));
    expect(confirmOff()).toBe(true);
    expect(container.textContent).toContain(BAIL_PARTIES_EN);
    act(() => confirmBtn().click());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('field absent: nothing is hidden from Still unknown', () => {
    mount(bailBlocked(), ledgerHolding('applicant_age', '34'));
    expect(unknownText()).toContain('[AGE]');
  });

  it('empty list: a ledger fact is still not trusted', () => {
    mount(
      o39Blocked({ ledger_given_keys: [] }),
      ledgerHolding('plaintiff_name', 'Kavita Rani Mishra'),
    );
    expect(confirmOff()).toBe(true);
    expect(container.textContent).toContain(PLAINTIFF_EN);
  });

  it('O.39, key present: that party is lifted and Confirm works', () => {
    mount(
      o39Blocked({ ledger_given_keys: ['plaintiff_name'] }),
      ledgerHolding('plaintiff_name', 'Kavita Rani Mishra'),
    );
    expect(container.textContent).not.toContain(PLAINTIFF_EN);
    expect(confirmOff()).toBe(false);
    act(() => confirmBtn().click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('non-O.39, key present: the party is lifted as before (T-498)', () => {
    mount(
      bailBlocked({ ledger_given_keys: ['applicant_name'] }),
      ledgerHolding('applicant_name', 'Kavita Rani Mishra'),
    );
    expect(container.textContent).not.toContain(BAIL_PARTIES_EN);
    expect(confirmOff()).toBe(false);
  });

  it('Still unknown hides exactly the keys in the list, not what the ledger holds', () => {
    mount(
      bailBlocked({ ledger_given_keys: ['applicant_age'] }),
      ledgerHolding('applicant_name', 'Kavita Rani Mishra'),
    );
    expect(unknownText()).not.toContain('[AGE]');
    expect(unknownText()).toContain('[APPLICANT]');
  });

  it.each(['Not known', 'N/A', 'nil', 'पता नहीं'])(
    'O.39, the ledger holds %j and the service leaves it out of the list: the block stays',
    (word) => {
      mount(o39Blocked({ ledger_given_keys: [] }), ledgerHolding('plaintiff_name', word));
      expect(confirmOff()).toBe(true);
      expect(container.textContent).toContain(PLAINTIFF_EN);
    },
  );
});
