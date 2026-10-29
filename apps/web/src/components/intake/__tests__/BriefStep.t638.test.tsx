// T-638 B (Ajay R1, B3): a custody date derived from the date of arrest shows "<date> (date of arrest)",
// is never sent back as the advocate's value, and gives way once the advocate edits it or the ledger holds it.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep from '../BriefStep';
import {
  DATE_OF_ARREST_CAPTION,
  derivedDateCaption,
  valuesAfter,
  type Brief,
  type BriefItem,
  type EditOutcome,
  type Ledger,
  type LedgerFact,
} from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (over: Partial<BriefItem>): BriefItem => ({
  key: 'custody_since',
  part: 'dates',
  label: 'In custody since',
  kind: 'date',
  required: false,
  options: [],
  value: null,
  source: null,
  please_check: false,
  placeholder: '[CUSTODY SINCE]',
  party_name: false,
  ...over,
});
const DERIVED = item({
  value: '2026-06-12',
  source: 'description',
  derived_from: 'arrest_date',
});
const fact = (key: string, display: string): LedgerFact => ({
  id: `f-${key}`,
  key,
  label: key,
  type: 'date',
  value: display,
  display,
  raw_span: display,
  source: 'user',
  confidence: 0.95,
  required_in_draft: false,
});
const ledgerOf = (facts: LedgerFact[]): Ledger => ({
  ledger_id: 'l1',
  version: 1,
  run_type: 'user',
  document_kind: 'bail_regular',
  facts,
  unresolved: [],
  fields: { custody_since: 'date', arrest_date: 'date' },
});
const briefOf = (items: BriefItem[]): Brief => ({
  kind: { id: 'bail_regular', name: 'Regular bail', court_document: true },
  court: { state: 'bihar', court_type: 'sessions', court: 'patna' },
  items,
  loose_dates: [],
  unplaced: [],
  still_unknown: [],
  can_confirm: true,
  confirm_blockers: [],
  confirm_message: null,
});

describe('T-638 B (8) briefTypes', () => {
  it('the caption constant is the signed "(date of arrest)"', () => {
    expect(DATE_OF_ARREST_CAPTION).toBe('(date of arrest)');
  });

  it('derivedDateCaption: "12 June 2026 (date of arrest)", in the draft date format', () => {
    expect(derivedDateCaption(DERIVED)).toBe('12 June 2026 (date of arrest)');
    expect(derivedDateCaption({ ...DERIVED, value: '2026-01-05' })).toBe(
      '5 January 2026 (date of arrest)',
    );
  });

  it('derivedDateCaption: none without derived_from, or for a value that is not an ISO date', () => {
    expect(derivedDateCaption({ ...DERIVED, derived_from: undefined })).toBeNull();
    expect(derivedDateCaption({ ...DERIVED, value: 'last week' })).toBeNull();
    expect(derivedDateCaption({ ...DERIVED, value: null })).toBeNull();
  });

  it("valuesAfter omits a derived item and keeps the advocate's own", () => {
    const own = item({
      key: 'police_station',
      label: 'Police Station',
      kind: 'text',
      value: 'Kotwali',
      source: 'user',
    });
    const out = valuesAfter(briefOf([DERIVED, own]), []);
    expect(out.map((v) => v.key)).toEqual(['police_station']);
  });

  it('valuesAfter keeps a custody_since once it is no longer derived (the advocate edited it)', () => {
    const out = valuesAfter(briefOf([{ ...DERIVED, derived_from: undefined, source: 'user' }]), []);
    expect(out).toEqual([
      expect.objectContaining({ key: 'custody_since', value: '2026-06-12', source: 'user' }),
    ]);
  });
});

// ── The row ─────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
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

function mount(brief: Brief, ledger: Ledger | null, onValue: jest.Mock = jest.fn()) {
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
        onValue={onValue as unknown as (i: BriefItem, v: string | string[]) => void}
        onCourt={noop}
        onKindName={noop}
        onPlaceDate={noop}
        onChangeDocument={noop}
        onMoreQuestions={noop}
        onEditDescription={noop}
        onCancel={noop}
        onConfirm={noop}
        inkCost={3}
      />,
    );
  });
}
const dateInput = () => container.querySelector('input[type="date"]') as HTMLInputElement;
const text = () => container.textContent ?? '';
const CAPTION = '12 June 2026 (date of arrest)';

describe('T-638 B (8) BriefStep caption', () => {
  it('a derived custody date shows the caption, described by it, with no "Please check"', () => {
    mount(briefOf([DERIVED]), null);
    expect(dateInput().value).toBe('2026-06-12');
    expect(text()).toContain(CAPTION);
    const describedBy = (dateInput().getAttribute('aria-describedby') ?? '').split(' ');
    const derivedId = describedBy.find((d) => d.endsWith('-derived'));
    expect(derivedId).toBeDefined();
    expect(container.querySelector(`#${derivedId}`)?.textContent).toBe(CAPTION);
    expect(text()).not.toContain('Please check');
  });

  it('with a ledger that has the field but no fact yet, the caption shows', () => {
    mount(briefOf([DERIVED]), ledgerOf([]));
    expect(text()).toContain(CAPTION);
  });

  it('no caption on a date the advocate gave', () => {
    mount(briefOf([{ ...DERIVED, derived_from: undefined, source: 'user' }]), null);
    expect(text()).not.toContain('(date of arrest)');
  });

  it('the caption is gone once the ledger holds a custody_since fact', () => {
    mount(briefOf([DERIVED]), ledgerOf([fact('custody_since', '2026-06-20')]));
    expect(text()).not.toContain('(date of arrest)');
    expect(dateInput().getAttribute('aria-describedby') ?? '').not.toContain('-derived');
  });

  it('the caption is gone after an edit', async () => {
    const onValue = jest.fn(() => new Promise<EditOutcome | null>(() => undefined));
    mount(briefOf([DERIVED]), ledgerOf([]), onValue);
    expect(text()).toContain(CAPTION);
    await act(async () => {
      const el = dateInput();
      (
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
          v: string,
        ) => void
      ).call(el, '2026-06-20');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue.mock.calls[0]).toEqual([
      expect.objectContaining({ key: 'custody_since' }),
      '2026-06-20',
    ]);
    expect(text()).not.toContain('(date of arrest)');
  });
});
