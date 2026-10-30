// T-668 (AJ-668-M1): in the plaint packs, replication and written_statement the service names the
// missing parties (a typed "Not known" counts) in confirm_missing_party_keys, and the screen
// follows it: Confirm stays off and the service's line shows. A brief with no list (an older
// brief, or a pack the service does not list) is judged by the old required-and-empty rule.
// The strings are the service's existing lines, typed here byte for byte. Fictional names only.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep from '../BriefStep';
import type { Brief, BriefItem } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PLAINTIFF_LINE = 'Add the name of the plaintiff to continue.';
const DEF1_LINE = 'Add the name of Defendant No. 1 to continue.';

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

const party = (key: string, label: string, value: string | null): BriefItem =>
  item({
    key,
    label,
    part: 'parties',
    party_name: true,
    value,
    source: value ? 'user' : null,
  });

const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' } as Brief['court'];

function briefOf(
  kindId: string,
  plaintiff: string | null,
  defendant: string | null,
  over: Partial<Brief> = {},
): Brief {
  return {
    kind: { id: kindId, name: kindId, court_document: true },
    court: COURT,
    items: [
      party('plaintiff_name', 'Plaintiff Name', plaintiff),
      party('defendant_name', 'Defendant Name', defendant),
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
const blocked = (lines: string[], keys?: string[]): Partial<Brief> => ({
  can_confirm: false,
  confirm_blockers: ['parties'],
  confirm_message: lines.join('\n'),
  ...(keys ? { confirm_missing_party_keys: keys } : {}),
});

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

function mount(brief: Brief) {
  const noop = jest.fn();
  act(() => {
    root.render(
      <BriefStep
        brief={brief}
        ledger={null}
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
const confirmOff = () =>
  confirmBtn()?.getAttribute('aria-disabled') === 'true' || confirmBtn()?.disabled === true;

const EIGHT = [
  'plaint_declaration',
  'plaint_eviction',
  'plaint_injunction',
  'plaint_recovery',
  'plaint_specific_performance',
  'plaint_partition',
  'replication',
  'written_statement',
];

describe('T-668 BriefStep: a listed "Not known" party keeps Confirm off', () => {
  it.each(EIGHT)('%s: plaintiff "Not known" listed: Confirm off, the service line shows', (id) => {
    mount(
      briefOf(id, 'Not known', 'Sample Person 2', blocked([PLAINTIFF_LINE], ['plaintiff_name'])),
    );
    expect(confirmOff()).toBe(true);
    expect(messageBtn().textContent).toBe(PLAINTIFF_LINE);
  });

  it('plaint_partition: defendant "Not known" listed: the signed Defendant No. 1 line shows', () => {
    mount(
      briefOf(
        'plaint_partition',
        'Sample Person 1',
        'Not known',
        blocked([DEF1_LINE], ['defendant_name']),
      ),
    );
    expect(confirmOff()).toBe(true);
    expect(messageBtn().textContent).toBe(DEF1_LINE);
  });

  it('a typed "पता नहीं" is held the same way', () => {
    mount(
      briefOf(
        'plaint_recovery',
        'पता नहीं',
        'Sample Person 2',
        blocked([PLAINTIFF_LINE], ['plaintiff_name']),
      ),
    );
    expect(confirmOff()).toBe(true);
    expect(messageBtn().textContent).toBe(PLAINTIFF_LINE);
  });

  it('real names, nothing listed, can_confirm: Confirm on', () => {
    mount(briefOf('plaint_recovery', 'Sample Person 1', 'Sample Person 2'));
    expect(confirmOff()).toBe(false);
  });
});

describe('T-668 BriefStep: with no list the old required-and-empty rule decides', () => {
  it('an older plaint brief (no list): an empty party still blocks', () => {
    mount(briefOf('plaint_recovery', null, 'Sample Person 2', blocked([PLAINTIFF_LINE])));
    expect(confirmOff()).toBe(true);
    expect(messageBtn().textContent).toBe(PLAINTIFF_LINE);
  });

  it('an older plaint brief (no list): a "Not known" value is not empty, so the screen does not hold it (the service decides)', () => {
    mount(briefOf('plaint_recovery', 'Not known', 'Sample Person 2', blocked([PLAINTIFF_LINE])));
    expect(container.textContent).not.toContain(PLAINTIFF_LINE);
    expect(confirmOff()).toBe(false);
  });

  it('a pack the service does not list (bail_regular), no list: the same old rule', () => {
    mount(briefOf('bail_regular', 'Not known', 'Sample Person 2', blocked([PLAINTIFF_LINE])));
    expect(confirmOff()).toBe(false);
    act(() => root.unmount());
    root = createRoot(container);
    mount(briefOf('bail_regular', null, 'Sample Person 2', blocked([PLAINTIFF_LINE])));
    expect(confirmOff()).toBe(true);
  });
});
