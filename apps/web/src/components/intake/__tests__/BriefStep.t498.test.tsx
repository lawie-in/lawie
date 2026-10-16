// T-498: "Still unknown" and the Confirm blockers on the brief leave out a fact the ledger holds.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep from '../BriefStep';
import { ledgerGivenKeys } from '../briefTypes';
import type { Brief, BriefItem, Ledger, LedgerFact } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
const fact = (key: string, display: string, value: unknown = display): LedgerFact => ({
  id: `f-${key}`,
  key,
  label: key,
  type: 'text',
  value,
  display,
  raw_span: display,
  source: 'user',
  confidence: 0.95,
  required_in_draft: true,
});
const ledgerOf = (facts: LedgerFact[], unresolvedKeys: string[] = []): Ledger => ({
  ledger_id: 'l1',
  version: 1,
  run_type: 'user',
  document_kind: 'bail_regular',
  facts,
  unresolved: unresolvedKeys.map((key) => ({
    id: `u-${key}`,
    key,
    label: key,
    type: 'text' as const,
    raw_span: '',
    source: 'user' as const,
    reason: 'low_confidence',
    detail: 'We are not sure.',
  })),
  fields: Object.fromEntries(
    [...facts.map((f) => f.key), ...unresolvedKeys].map((k) => [k, 'text' as const]),
  ),
});

const ITEMS: BriefItem[] = [
  item({
    key: 'applicant_name',
    label: 'Applicant Name',
    part: 'parties',
    party_name: true,
    placeholder: '[APPLICANT]',
  }),
  item({
    key: 'father_name',
    label: "Father's Name",
    part: 'parties',
    party_name: true,
    placeholder: '[FATHER]',
  }),
  item({ key: 'applicant_age', label: 'Age', placeholder: '[AGE]' }),
  item({ key: 'address', label: 'Residential Address', placeholder: '[ADDRESS]' }),
  item({ key: 'facts_narrative', label: 'Brief Facts', placeholder: '[FACTS]' }),
  item({ key: 'police_station', label: 'Police Station', placeholder: '[PS]' }),
];
const unknownOf = (items: BriefItem[]) =>
  items
    .filter((i) => i.value === null)
    .map((i) => ({ key: i.key, label: i.label, placeholder: i.placeholder }));

function briefOf(
  items: BriefItem[],
  over: Partial<Brief> = {},
  court = { state: 'bihar', court_type: 'sessions', court: 'patna' } as Brief['court'],
): Brief {
  return {
    kind: { id: 'bail_regular', name: 'Regular bail', court_document: true },
    court,
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
const blocked = (blockers: Array<'court' | 'parties'>, message: string): Partial<Brief> => ({
  can_confirm: false,
  confirm_blockers: blockers,
  confirm_message: message,
});

let container: HTMLDivElement;
let root: Root;
const onConfirm = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // jsdom has no scrollIntoView
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
const unknownSection = () => container.querySelector('section[aria-labelledby="brief-unknown"]');
const unknownText = () => unknownSection()?.textContent ?? '';
const confirmBtn = () =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes('Confirm brief and continue'),
  ) as HTMLButtonElement;
const lineBtn = (text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '') === text);

describe('ledgerGivenKeys (web), the same rule as the service', () => {
  it('empty with no ledger', () => {
    expect(ledgerGivenKeys(null).size).toBe(0);
    expect(ledgerGivenKeys(undefined).size).toBe(0);
  });
  it('a fact with a display is given; an empty display is not', () => {
    const g = ledgerGivenKeys(ledgerOf([fact('a', '412/2026'), fact('b', '  ')]));
    expect([...g]).toEqual(['a']);
  });
  it('"No" / false on an undertaking box is not given; "Yes" is; another yes/no key is given', () => {
    expect(ledgerGivenKeys(ledgerOf([fact('willingness_to_furnish_bond', 'No')])).size).toBe(0);
    expect(ledgerGivenKeys(ledgerOf([fact('willingness_to_furnish_bond', 'no', false)])).size).toBe(
      0,
    );
    expect(ledgerGivenKeys(ledgerOf([fact('willingness_to_furnish_bond', 'Yes')])).size).toBe(1);
    expect(ledgerGivenKeys(ledgerOf([fact('sole_earning_member', 'No')])).size).toBe(1);
  });
  it('an unresolved key without a fact is not given', () => {
    expect(ledgerGivenKeys(ledgerOf([], ['police_station'])).size).toBe(0);
  });
});

describe('BriefStep "Still unknown" with the ledger (T-498)', () => {
  it('hides the keys the ledger holds and shows the others', () => {
    const ledger = ledgerOf([
      fact('applicant_age', '34'),
      fact('address', 'Mohalla Kadamkuan, Patna'),
      fact('facts_narrative', 'A land deal'),
    ]);
    mount(briefOf(ITEMS), ledger);
    const t = unknownText();
    expect(t).not.toContain('[AGE]');
    expect(t).not.toContain('[ADDRESS]');
    expect(t).not.toContain('[FACTS]');
    expect(t).toContain('[PS]');
    expect(t).toContain('[APPLICANT]');
  });

  it('with no ledger nothing is hidden', () => {
    mount(briefOf(ITEMS), null);
    const t = unknownText();
    for (const p of ['[AGE]', '[ADDRESS]', '[FACTS]', '[PS]', '[APPLICANT]', '[FATHER]']) {
      expect(t).toContain(p);
    }
  });

  it('a key unresolved without a fact is still listed', () => {
    mount(briefOf(ITEMS), ledgerOf([fact('applicant_age', '34')], ['police_station']));
    expect(unknownText()).toContain('[PS]');
    expect(unknownText()).not.toContain('[AGE]');
  });

  it('the whole section goes when every listed key is held', () => {
    const all = ITEMS.map((i) => fact(i.key, `value of ${i.key}`));
    mount(briefOf(ITEMS), ledgerOf(all));
    expect(unknownSection()).toBeNull();
  });

  it('an undertaking "No" fact does not hide the key', () => {
    const bond = item({ key: 'willingness_to_furnish_bond', label: 'Bond', placeholder: '[BOND]' });
    mount(briefOf([bond]), ledgerOf([fact('willingness_to_furnish_bond', 'No')]));
    expect(unknownText()).toContain('[BOND]');
  });
});

describe('BriefStep parties blocker with the ledger (T-498)', () => {
  const PARTIES_MSG = 'Add the name of the applicant to continue.';

  it('lifted when every missing party is held by the ledger: Confirm works, no blocker line', () => {
    const ledger = ledgerOf([
      fact('applicant_name', 'Ramesh Kumar Yadav'),
      fact('father_name', 'Suresh Yadav'),
    ]);
    mount(briefOf(ITEMS, blocked(['parties'], PARTIES_MSG)), ledger);
    expect(lineBtn(PARTIES_MSG)).toBeUndefined();
    expect(confirmBtn().getAttribute('aria-disabled')).not.toBe('true');
    act(() => confirmBtn().click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('not lifted when only one of two missing parties is held: the server line stays, Confirm is off', () => {
    mount(
      briefOf(ITEMS, blocked(['parties'], PARTIES_MSG)),
      ledgerOf([fact('father_name', 'Suresh Yadav')]),
    );
    expect(lineBtn(PARTIES_MSG)).toBeDefined();
    expect(confirmBtn().getAttribute('aria-disabled')).toBe('true');
    act(() => confirmBtn().click());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('with no ledger the blocker stays as the service sent it', () => {
    mount(briefOf(ITEMS, blocked(['parties'], PARTIES_MSG)), null);
    expect(lineBtn(PARTIES_MSG)).toBeDefined();
    expect(confirmBtn().getAttribute('aria-disabled')).toBe('true');
  });

  it('a ledger holding no party leaves the blocker', () => {
    mount(
      briefOf(ITEMS, blocked(['parties'], PARTIES_MSG)),
      ledgerOf([fact('applicant_age', '34')]),
    );
    expect(lineBtn(PARTIES_MSG)).toBeDefined();
    expect(confirmBtn().getAttribute('aria-disabled')).toBe('true');
  });

  it('court AND parties blocked, parties held: only the court is left, the existing line shows', () => {
    const noCourt = { state: null, court_type: null, court: null } as Brief['court'];
    const ledger = ledgerOf([
      fact('applicant_name', 'Ramesh Kumar Yadav'),
      fact('father_name', 'Suresh Yadav'),
    ]);
    mount(
      briefOf(
        ITEMS,
        blocked(['court', 'parties'], 'Choose the court and add the parties to continue.'),
        noCourt,
      ),
      ledger,
    );
    expect(lineBtn('Choose the court to continue.')).toBeDefined();
    expect(lineBtn('Choose the court and add the parties to continue.')).toBeUndefined();
    expect(confirmBtn().getAttribute('aria-disabled')).toBe('true');
    act(() => confirmBtn().click());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('court AND parties blocked, a party still missing: the service line stays', () => {
    const noCourt = { state: null, court_type: null, court: null } as Brief['court'];
    mount(
      briefOf(
        ITEMS,
        blocked(['court', 'parties'], 'Choose the court and add the parties to continue.'),
        noCourt,
      ),
      ledgerOf([fact('father_name', 'Suresh Yadav')]),
    );
    expect(lineBtn('Choose the court and add the parties to continue.')).toBeDefined();
  });

  it('only the court blocked: unchanged, with or without a ledger', () => {
    const noCourt = { state: null, court_type: null, court: null } as Brief['court'];
    const b = briefOf(ITEMS, blocked(['court'], 'Choose the court to continue.'), noCourt);
    mount(b, ledgerOf([fact('applicant_age', '34')]));
    expect(lineBtn('Choose the court to continue.')).toBeDefined();
  });
});

describe('BriefStep party read by the ledger shows "Please check" before Confirm (Ajay, AJ-498-M1)', () => {
  const nameItem = [
    item({ key: 'applicant_name', label: 'Applicant Name', part: 'parties', party_name: true }),
  ];
  const run = (source: LedgerFact['source']) => {
    const f = { ...fact('applicant_name', 'Ramesh Kumar Yadav'), source };
    mount(
      briefOf(nameItem, blocked(['parties'], 'Add the name of the applicant to continue.')),
      ledgerOf([f]),
    );
  };
  const values = () =>
    Array.from(container.querySelectorAll('input, textarea')).map(
      (e) => (e as HTMLInputElement).value,
    );

  it('source user (read from the description): the row shows the value and the mark; Confirm is enabled with it visible', () => {
    run('user');
    expect(values()).toContain('Ramesh Kumar Yadav');
    expect(container.textContent).toContain('Please check');
    expect(container.textContent).not.toContain('Add the name of the applicant');
    expect(confirmBtn().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('source asked (typed in a question): the value shows, no mark (documented)', () => {
    run('asked');
    expect(values()).toContain('Ramesh Kumar Yadav');
    expect(container.querySelectorAll('span').length).toBeGreaterThan(0);
    const marks = Array.from(container.querySelectorAll('span')).filter(
      (s) => s.textContent === 'Please check',
    );
    expect(marks).toHaveLength(0);
    expect(confirmBtn().getAttribute('aria-disabled')).not.toBe('true');
  });
});
