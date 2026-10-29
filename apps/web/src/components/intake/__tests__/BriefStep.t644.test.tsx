// T-644 (Ajay, AJ-644-M1, AJ-644-M2): the screen matches the service on O.39. A party name that is a
// §(j)3 non-answer keeps Confirm off; the court line, then one signed line per missing party, then
// the field lines show as the service sent them, with no stale party line. An older brief without
// confirm_missing_party_keys is read as [] (Arjun's condition 1).
// The signed strings are typed here, byte for byte as in handoff/legal/T-511-copy-rulings-ajay.md.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep from '../BriefStep';
import type { Brief, BriefItem, Ledger } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// AJ-644-M2 Q1: the T-127 court line, then AJ-644-M1's party lines, then the §(j)2 field lines.
const COURT_EN = 'Choose the court to continue.';
const PLAINTIFF_EN = "Add the plaintiff's name to continue.";
const DEFENDANT_EN = "Add the defendant's name to continue.";
const RELIEF_EN = 'Add the relief sought in the main suit to continue.';
const RESTRAINT_EN = 'Add the acts the defendant should be restrained from, to continue.';
const COMBINED_EN = 'Choose the court and add the parties to continue.';

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

// Fictional names only.
const PLAINTIFF = 'Meera Anand Rao';
const DEFENDANT = 'Kabir Suresh Nair';

type Vals = { plaintiff?: string | null; defendant?: string | null };
const ITEMS = (v: Vals = {}, fieldsHeld = false): BriefItem[] => [
  item({
    key: 'plaintiff_name',
    label: 'Plaintiff Name',
    part: 'parties',
    party_name: true,
    value: v.plaintiff ?? null,
    source: v.plaintiff ? 'user' : null,
  }),
  item({
    key: 'defendant_name',
    label: 'Defendant Name',
    part: 'parties',
    party_name: true,
    value: v.defendant ?? null,
    source: v.defendant ? 'user' : null,
  }),
  item({
    key: 'main_suit_relief',
    label: 'Relief sought in the main suit',
    blocks_confirm: true,
    value: fieldsHeld ? 'Declaration of title' : null,
    source: fieldsHeld ? 'user' : null,
  }),
  item({
    key: 'restraint_sought',
    label: 'Acts the defendant should be restrained from',
    part: 'relief',
    blocks_confirm: true,
    value: fieldsHeld ? 'raising any construction' : null,
    source: fieldsHeld ? 'user' : null,
  }),
];

const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' } as Brief['court'];
const NO_COURT = { state: null, court_type: null, court: null } as Brief['court'];

function briefOf(
  items: BriefItem[],
  over: Partial<Brief> = {},
  court = COURT,
  kindId = 'temporary_injunction_o39',
): Brief {
  return {
    kind: { id: kindId, name: 'Temporary injunction', court_document: true },
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
  lines: string[],
  extra: Partial<Brief> = {},
): Partial<Brief> => ({
  can_confirm: false,
  confirm_blockers: blockers,
  confirm_message: lines.join('\n'),
  ...extra,
});
const FIELD_KEYS = ['main_suit_relief', 'restraint_sought'];

const ledgerHolding = (...keys: string[]): Ledger => {
  const facts = keys.map((key) => ({
    id: `f-${key}`,
    key,
    label: key,
    type: 'text' as const,
    value: 'Held Name',
    display: 'Held Name',
    raw_span: 'Held Name',
    source: 'user' as const,
    confidence: 0.95,
    required_in_draft: true,
  }));
  return {
    ledger_id: 'l1',
    version: 1,
    run_type: 'user',
    document_kind: 'temporary_injunction_o39',
    facts,
    unresolved: [],
    fields: Object.fromEntries(keys.map((k) => [k, 'text'])),
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

// T-655: the screen takes the service's given set from `brief.ledger_given_keys` and does not
// judge the ledger. `given` is that set; left out, the field is absent (nothing is given).
function mount(brief: Brief, ledger: Ledger | null = null, given?: string[]) {
  if (given) brief = { ...brief, ledger_given_keys: given };
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
const confirmOff = () =>
  confirmBtn()?.getAttribute('aria-disabled') === 'true' || confirmBtn()?.disabled === true;

describe('T-644 BriefStep: O.39 non-answer keeps Confirm off', () => {
  it('plaintiff "Not known", listed missing: Confirm off, the signed plaintiff line shows', () => {
    mount(
      briefOf(
        ITEMS({ plaintiff: 'Not known', defendant: DEFENDANT }, true),
        blocked(['parties'], [PLAINTIFF_EN], { confirm_missing_party_keys: ['plaintiff_name'] }),
      ),
    );
    expect(confirmOff()).toBe(true);
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(messageBtn().textContent).toBe(PLAINTIFF_EN);
    expect(container.textContent).not.toContain(DEFENDANT_EN);
  });

  it('a press on the line goes to the plaintiff row (the listed party)', () => {
    mount(
      briefOf(
        ITEMS({ plaintiff: 'Not known', defendant: DEFENDANT }, true),
        blocked(['parties'], [PLAINTIFF_EN], { confirm_missing_party_keys: ['plaintiff_name'] }),
      ),
    );
    (document.activeElement as HTMLElement | null)?.blur();
    press(messageBtn());
    const target = document.getElementById('brief-plaintiff_name');
    expect(target).not.toBeNull();
    expect(target!.contains(document.activeElement) || document.activeElement === target).toBe(
      true,
    );
  });

  it('defendant a non-answer, plaintiff real: the defendant line alone, Confirm off', () => {
    mount(
      briefOf(
        ITEMS({ plaintiff: PLAINTIFF, defendant: 'N/A' }, true),
        blocked(['parties'], [DEFENDANT_EN], { confirm_missing_party_keys: ['defendant_name'] }),
      ),
    );
    expect(confirmOff()).toBe(true);
    expect(messageBtn().textContent).toBe(DEFENDANT_EN);
  });

  it('control: both parties real and listed as none, fields held: Confirm works', () => {
    mount(briefOf(ITEMS({ plaintiff: PLAINTIFF, defendant: DEFENDANT }, true)));
    expect(confirmOff()).toBe(false);
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('T-644 BriefStep: the ledger gives a party', () => {
  it('plaintiff held: its line disappears; the court line and field lines remain', () => {
    mount(
      briefOf(
        ITEMS(),
        blocked(
          ['court', 'parties', 'required_fields'],
          [COURT_EN, PLAINTIFF_EN, RELIEF_EN, RESTRAINT_EN],
          {
            confirm_missing_party_keys: ['plaintiff_name'],
            confirm_blocking_keys: FIELD_KEYS,
          },
        ),
        NO_COURT,
      ),
      ledgerHolding('plaintiff_name'),
      ['plaintiff_name'],
    );
    expect(confirmOff()).toBe(true);
    expect(messageBtn().textContent).toBe(`${COURT_EN}\n${RELIEF_EN}\n${RESTRAINT_EN}`);
    expect(container.textContent).not.toContain(PLAINTIFF_EN);
  });

  it('plaintiff held, defendant still missing: only the defendant line stays among the parties', () => {
    mount(
      briefOf(
        ITEMS(),
        blocked(
          ['parties', 'required_fields'],
          [PLAINTIFF_EN, DEFENDANT_EN, RELIEF_EN, RESTRAINT_EN],
          {
            confirm_missing_party_keys: ['plaintiff_name', 'defendant_name'],
            confirm_blocking_keys: FIELD_KEYS,
          },
        ),
      ),
      ledgerHolding('plaintiff_name'),
      ['plaintiff_name'],
    );
    expect(messageBtn().textContent).toBe(`${DEFENDANT_EN}\n${RELIEF_EN}\n${RESTRAINT_EN}`);
    expect(container.textContent).not.toContain(PLAINTIFF_EN);
  });

  it('both held, court chosen, fields held: Confirm works as before', () => {
    mount(
      briefOf(
        ITEMS({}, true),
        blocked(['parties'], [PLAINTIFF_EN, DEFENDANT_EN], {
          confirm_missing_party_keys: ['plaintiff_name', 'defendant_name'],
        }),
      ),
      ledgerHolding('plaintiff_name', 'defendant_name'),
      ['plaintiff_name', 'defendant_name'],
    );
    expect(confirmOff()).toBe(false);
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('both held, fields not: Confirm stays off with the field lines only', () => {
    mount(
      briefOf(
        ITEMS(),
        blocked(
          ['parties', 'required_fields'],
          [PLAINTIFF_EN, DEFENDANT_EN, RELIEF_EN, RESTRAINT_EN],
          {
            confirm_missing_party_keys: ['plaintiff_name', 'defendant_name'],
            confirm_blocking_keys: FIELD_KEYS,
          },
        ),
      ),
      ledgerHolding('plaintiff_name', 'defendant_name'),
      ['plaintiff_name', 'defendant_name'],
    );
    expect(confirmOff()).toBe(true);
    expect(messageBtn().textContent).toBe(`${RELIEF_EN}\n${RESTRAINT_EN}`);
  });
});

describe('T-644 BriefStep: court and both parties missing', () => {
  it('shows the three lines, then the field lines, in the order the service sent', () => {
    const lines = [COURT_EN, PLAINTIFF_EN, DEFENDANT_EN, RELIEF_EN, RESTRAINT_EN];
    mount(
      briefOf(
        ITEMS(),
        blocked(['court', 'parties', 'required_fields'], lines, {
          confirm_missing_party_keys: ['plaintiff_name', 'defendant_name'],
          confirm_blocking_keys: FIELD_KEYS,
        }),
        NO_COURT,
      ),
    );
    expect(confirmOff()).toBe(true);
    expect(messageBtn().textContent).toBe(lines.join('\n'));
    expect(messageBtn().className).toContain('whitespace-pre-line');
    expect(container.textContent).not.toContain(COMBINED_EN);
  });

  it('court and both parties only (fields held): exactly three lines', () => {
    mount(
      briefOf(
        ITEMS({}, true),
        blocked(['court', 'parties'], [COURT_EN, PLAINTIFF_EN, DEFENDANT_EN], {
          confirm_missing_party_keys: ['plaintiff_name', 'defendant_name'],
        }),
        NO_COURT,
      ),
    );
    expect(messageBtn().textContent).toBe(`${COURT_EN}\n${PLAINTIFF_EN}\n${DEFENDANT_EN}`);
  });
});

describe('T-644 BriefStep: an older O.39 brief without confirm_missing_party_keys', () => {
  it('does not crash; parties count as lifted; court and field lines show', () => {
    const brief = briefOf(
      ITEMS(),
      blocked(['court', 'parties', 'required_fields'], [COMBINED_EN, RELIEF_EN, RESTRAINT_EN], {
        confirm_blocking_keys: FIELD_KEYS,
      }),
      NO_COURT,
    );
    expect(brief.confirm_missing_party_keys).toBeUndefined();
    expect(() => mount(brief)).not.toThrow();
    expect(messageBtn().textContent).toBe(`${COURT_EN}\n${RELIEF_EN}\n${RESTRAINT_EN}`);
    expect(container.textContent).not.toContain(COMBINED_EN);
  });

  it('parties only, nothing else blocking: Confirm is not held by the parties', () => {
    mount(
      briefOf(
        ITEMS({}, true),
        blocked(['parties'], ['Add the name of the plaintiff to continue.']),
      ),
    );
    expect(confirmOff()).toBe(false);
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('an empty list is the same as an absent one', () => {
    mount(
      briefOf(
        ITEMS({}, true),
        blocked(['parties'], ['Add the name of the plaintiff to continue.'], {
          confirm_missing_party_keys: [],
        }),
      ),
    );
    expect(confirmOff()).toBe(false);
  });
});

describe('T-644 BriefStep: a non-O.39 pack is unchanged', () => {
  const OTHER = 'plaint_recovery';

  it('an empty party still blocks, and the service text shows whole (old one-line rule)', () => {
    mount(
      briefOf(
        ITEMS({}, true),
        blocked(['parties'], ['Add the name of the plaintiff to continue.']),
        COURT,
        OTHER,
      ),
    );
    expect(confirmOff()).toBe(true);
    expect(messageBtn().textContent).toBe('Add the name of the plaintiff to continue.');
  });

  it('the combined court-and-parties line still shows as sent', () => {
    mount(briefOf(ITEMS({}, true), blocked(['court', 'parties'], [COMBINED_EN]), NO_COURT, OTHER));
    expect(messageBtn().textContent).toBe(COMBINED_EN);
  });

  it('T-668: a listed "Not known" party on plaint_recovery keeps Confirm off (the list decides)', () => {
    // T-668 (AJ-668-M1): plaint_recovery is one of the 8 packs where the service names the
    // missing parties, a non-answer counting. The screen follows the list, so a "Not known"
    // value, which the old required-and-empty rule would call given, is missing.
    mount(
      briefOf(
        ITEMS({ plaintiff: 'Not known', defendant: DEFENDANT }, true),
        blocked(['parties'], ['Add the name of the plaintiff to continue.'], {
          confirm_missing_party_keys: ['plaintiff_name'],
        }),
        COURT,
        OTHER,
      ),
    );
    expect(container.textContent).toContain('Add the name of the plaintiff');
    expect(confirmOff()).toBe(true);
  });

  it('T-668: on a pack outside the 8 the screen still follows a list when one is sent (the service sends none there)', () => {
    // Was "a stray list is ignored" (T-644). The screen now follows the list whenever it is
    // present, whatever the pack, so this documents that; the guard is on the service side
    // (NON_ANSWER_PARTY_PACKS), not in BriefStep.
    mount(
      briefOf(
        ITEMS({ plaintiff: 'Not known', defendant: DEFENDANT }, true),
        blocked(['parties'], ['Add the name of the plaintiff to continue.'], {
          confirm_missing_party_keys: ['plaintiff_name'],
        }),
        COURT,
        'bail_regular',
      ),
    );
    expect(confirmOff()).toBe(true);
  });

  it('the ledger holding the parties lifts them as before (T-498)', () => {
    mount(
      briefOf(
        ITEMS({}, true),
        blocked(['parties'], ['Add the name of the plaintiff to continue.']),
        COURT,
        OTHER,
      ),
      ledgerHolding('plaintiff_name', 'defendant_name'),
      ['plaintiff_name', 'defendant_name'],
    );
    expect(confirmOff()).toBe(false);
    press(confirmBtn() as HTMLButtonElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
