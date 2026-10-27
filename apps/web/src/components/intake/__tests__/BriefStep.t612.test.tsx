// T-612: the ticked chips of a multi-select row (grounds_for_bail) stay ticked while the change saves,
// after it saves, when the service takes no edit for the row, and when it fails.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep from '../BriefStep';
import type { Brief, BriefItem, EditOutcome, Ledger, LedgerFact } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = ['Parity', 'Long custody', 'No previous record'];
const item = (over: Partial<BriefItem>): BriefItem => ({
  key: 'grounds_for_bail',
  part: 'facts',
  label: 'Grounds for bail',
  kind: 'choices',
  required: false,
  options: OPTIONS,
  value: null,
  source: null,
  please_check: false,
  placeholder: '[GROUNDS]',
  party_name: false,
  ...over,
});
let n = 0;
const fact = (key: string, display: string): LedgerFact => ({
  id: `f-${key}-${(n += 1)}`,
  key,
  label: key,
  type: 'text',
  value: display,
  display,
  raw_span: display,
  source: 'user',
  confidence: 0.95,
  required_in_draft: false,
});
const ledgerOf = (facts: LedgerFact[], fieldKeys: string[]): Ledger => ({
  ledger_id: 'l1',
  version: 1,
  run_type: 'user',
  document_kind: 'bail_regular',
  facts,
  unresolved: [],
  fields: Object.fromEntries(fieldKeys.map((k) => [k, 'text' as const])),
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

type OnValue = (i: BriefItem, v: string | string[]) => void | Promise<EditOutcome | null>;
function mount(brief: Brief, ledger: Ledger | null, onValue: OnValue) {
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
        onValue={onValue}
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
const chip = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined;
const pressed = (label: string) => chip(label)?.getAttribute('aria-pressed');
const click = async (label: string) => {
  await act(async () => chip(label)?.click());
};
const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const text = () => container.textContent ?? '';

const BRIEF = briefOf([item({})]);
const LEDGER = ledgerOf([], ['grounds_for_bail']);

describe('T-612 BriefStep multi-select chips', () => {
  it('while the update is pending the pick is ticked, "Saving…" shows, and the next tick adds to it', async () => {
    const releases: Array<(o: EditOutcome | null) => void> = [];
    const onValue = jest.fn(
      () => new Promise<EditOutcome | null>((r) => releases.push(r)),
    ) as unknown as jest.Mock;
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    expect(pressed('Parity')).toBe('true');
    expect(text()).toContain('Saving…');
    await click('Long custody');
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
    expect(onValue).toHaveBeenCalledTimes(2);
    expect(onValue.mock.calls[0][1]).toEqual(['Parity']);
    expect(onValue.mock.calls[1][1]).toEqual(['Parity', 'Long custody']);
    releases.forEach((r) => r(null));
    await settle();
  });

  it('after success with two facts under the key both are ticked and there is no "Saved as" line', async () => {
    const onValue = jest.fn(async (_i: BriefItem, v: string | string[]) => ({
      status: 'saved' as const,
      display: Array.isArray(v) ? v.join(', ') : v,
    }));
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    await settle();
    // the service's reply: the ledger now holds a fact for the ground
    mount(BRIEF, ledgerOf([fact('grounds_for_bail', 'Parity')], ['grounds_for_bail']), onValue);
    await click('Long custody');
    await settle();
    expect(onValue.mock.calls[1][1]).toEqual(['Parity', 'Long custody']);
    mount(
      BRIEF,
      ledgerOf(
        [fact('grounds_for_bail', 'Parity'), fact('grounds_for_bail', 'Long custody')],
        ['grounds_for_bail'],
      ),
      onValue,
    );
    await settle();
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
    expect(pressed('No previous record')).toBe('false');
    expect(text()).not.toContain('Saved as');
    expect(text()).not.toContain('Saving…');
  });

  it('a saved display that differs from the picks still reads "Saved as"', async () => {
    const onValue = jest.fn(async () => ({ status: 'saved' as const, display: 'Parity only' }));
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    await settle();
    expect(text()).toContain('Saved as Parity only.');
  });

  it('a null outcome (skipped) keeps the chips ticked, shows no status line, and the next click is cumulative', async () => {
    const onValue = jest.fn(async () => null) as unknown as jest.Mock;
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    await settle();
    expect(pressed('Parity')).toBe('true');
    expect(text()).not.toContain('Saving…');
    expect(text()).not.toContain('Saved as');
    expect(text()).not.toContain('Could not save');
    expect(chip('Long custody')?.disabled).toBe(false);
    await click('Long custody');
    await settle();
    expect(onValue.mock.calls[1][1]).toEqual(['Parity', 'Long custody']);
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
  });

  it('a failed save keeps the chips ticked, offers "Try again", and the retry re-sends the same array', async () => {
    const onValue = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'saved', display: 'Parity, Long custody' });
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    await settle();
    await click('Long custody');
    await settle();
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
    expect(text()).toContain('Could not save this change.');
    const retry = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Try again',
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await settle();
    expect(onValue).toHaveBeenCalledTimes(3);
    expect(onValue.mock.calls[1][1]).toEqual(['Parity', 'Long custody']);
    expect(onValue.mock.calls[2][1]).toEqual(['Parity', 'Long custody']);
  });

  it('a ledger with two or more facts under the key ticks every matching chip on first render', () => {
    mount(
      BRIEF,
      ledgerOf(
        [
          fact('grounds_for_bail', 'Parity'),
          fact('grounds_for_bail', 'No previous record'),
          fact('police_station', 'Kotwali'),
        ],
        ['grounds_for_bail', 'police_station'],
      ),
      jest.fn(),
    );
    expect(pressed('Parity')).toBe('true');
    expect(pressed('No previous record')).toBe('true');
    expect(pressed('Long custody')).toBe('false');
  });

  it('a list row shows every entry the ledger holds under its key', () => {
    const list = briefOf([
      item({ key: 'sections_charged', label: 'Sections', kind: 'list', options: [] }),
    ]);
    mount(
      list,
      ledgerOf(
        [fact('sections_charged', 'BNS 318(4)'), fact('sections_charged', 'BNS 316(2)')],
        ['sections_charged'],
      ),
      jest.fn(),
    );
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toContain('BNS 318(4)');
    expect(ta.value).toContain('BNS 316(2)');
  });
});

const withFacts = (...displays: string[]) =>
  ledgerOf(
    displays.map((d) => fact('grounds_for_bail', d)),
    ['grounds_for_bail'],
  );
const BOTH = ['Parity', 'Long custody'];
const saved = (display: string): EditOutcome => ({ status: 'saved', display });

function deferredRow() {
  const res: Array<(o: EditOutcome | null) => void> = [];
  const onValue = jest.fn(
    () => new Promise<EditOutcome | null>((r) => res.push(r)),
  ) as unknown as jest.Mock;
  return { res, onValue };
}

describe('T-612 BriefStep: answers that arrive out of order', () => {
  it('an older answer arriving first leaves the newer pick and its "Saving…" alone', async () => {
    const { res, onValue } = deferredRow();
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    await click('Long custody');
    await act(async () => res[0](saved('Parity')));
    await settle();
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
    expect(text()).toContain('Saving…');
    mount(BRIEF, withFacts(...BOTH), onValue);
    await act(async () => res[1](saved('Parity, Long custody')));
    await settle();
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
    expect(text()).not.toContain('Saving…');
    expect(text()).not.toContain('Saved as');
  });

  it.each([
    ['failed', { status: 'failed' } as EditOutcome | null],
    ['null', null],
  ])('the older answer arriving last (%s) does not undo the newer one', async (_n, late) => {
    const { res, onValue } = deferredRow();
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    await click('Long custody');
    await act(async () => res[1](saved('Parity, Long custody')));
    mount(BRIEF, withFacts(...BOTH), onValue);
    await settle();
    await act(async () => res[0](late));
    await settle();
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
    expect(text()).not.toContain('Could not save');
    expect(text()).not.toContain('Saving…');
  });

  it('a third click after the race sends all three picks', async () => {
    const { res, onValue } = deferredRow();
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    await click('Long custody');
    await act(async () => res[1](saved('Parity, Long custody')));
    mount(BRIEF, withFacts(...BOTH), onValue);
    await act(async () => res[0](saved('Parity')));
    await settle();
    await click('No previous record');
    expect(onValue.mock.calls[2][1]).toEqual(['Parity', 'Long custody', 'No previous record']);
  });
});

describe('T-612 BriefStep: rows that are not multi-select', () => {
  const setInput = async (el: HTMLInputElement, v: string, blur: boolean) => {
    await act(async () => {
      (
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
          x: string,
        ) => void
      ).call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (blur) el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  };

  it('a text row keeps the typed text while saving and after a null outcome; a later ledger change replaces it', async () => {
    const { res, onValue } = deferredRow();
    const row = briefOf([
      item({ key: 'police_station', label: 'Police Station', kind: 'text', options: [] }),
    ]);
    mount(row, ledgerOf([fact('police_station', 'Kotwali')], ['police_station']), onValue);
    const input = () =>
      container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;
    expect(input().value).toBe('Kotwali');
    await setInput(input(), 'Gandhi Maidan', true);
    expect(text()).toContain('Saving…');
    expect(input().value).toBe('Gandhi Maidan');
    await act(async () => res[0](null));
    await settle();
    expect(text()).not.toContain('Saving…');
    expect(container.querySelector('[id$="-status"]')).toBeNull();
    expect(input().value).toBe('Gandhi Maidan');
    mount(row, ledgerOf([fact('police_station', 'Sadar')], ['police_station']), onValue);
    await settle();
    expect(input().value).toBe('Sadar');
  });

  it('a date row keeps the typed date while saving and after a null outcome; a later ledger change replaces it', async () => {
    const { res, onValue } = deferredRow();
    const row = briefOf([
      item({ key: 'custody_since', label: 'In custody since', kind: 'date', options: [] }),
    ]);
    mount(row, ledgerOf([fact('custody_since', '2026-09-20')], ['custody_since']), onValue);
    const input = () => container.querySelector('input[type="date"]') as HTMLInputElement;
    await setInput(input(), '2026-09-21', false);
    expect(input().value).toBe('2026-09-21');
    expect(text()).toContain('Saving…');
    await act(async () => res[0](null));
    await settle();
    expect(text()).not.toContain('Saving…');
    expect(container.querySelector('[id$="-status"]')).toBeNull();
    expect(input().value).toBe('2026-09-21');
    mount(row, ledgerOf([fact('custody_since', '2026-09-25')], ['custody_since']), onValue);
    await settle();
    expect(input().value).toBe('2026-09-25');
  });

  it('a number row keeps the typed number while saving and after a null outcome', async () => {
    const { res, onValue } = deferredRow();
    const row = briefOf([
      item({ key: 'applicant_age', label: 'Age', kind: 'number', options: [] }),
    ]);
    mount(row, ledgerOf([fact('applicant_age', '34')], ['applicant_age']), onValue);
    const input = () => container.querySelector('input') as HTMLInputElement;
    await setInput(input(), '35', true);
    expect(input().value).toBe('35');
    expect(text()).toContain('Saving…');
    await act(async () => res[0](null));
    await settle();
    expect(text()).not.toContain('Saving…');
    expect(container.querySelector('[id$="-status"]')).toBeNull();
    expect(input().value).toBe('35');
  });
});

describe('T-612 BriefStep: a list row being typed in', () => {
  const LIST = briefOf([
    item({ key: 'sections_charged', label: 'Sections', kind: 'list', options: [] }),
  ]);
  const sections = (...d: string[]) => d.map((x) => fact('sections_charged', x));
  const ta = () => container.querySelector('textarea') as HTMLTextAreaElement;
  const typeHalf = async (v: string) =>
    act(async () => {
      (
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
          x: string,
        ) => void
      ).call(ta(), v);
      ta().dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('half-typed text survives a re-render whose ledger is a new object with this key unchanged', async () => {
    const own = sections('BNS 318(4)', 'BNS 316(2)');
    mount(LIST, ledgerOf(own, ['sections_charged']), jest.fn());
    await typeHalf('BNS 318(4)\nBNS 3');
    mount(
      LIST,
      ledgerOf([...own, fact('police_station', 'Kotwali')], ['sections_charged', 'police_station']),
      jest.fn(),
    );
    await settle();
    expect(ta().value).toBe('BNS 318(4)\nBNS 3');
  });

  it('when its own facts change the textarea shows the new entries', async () => {
    mount(LIST, ledgerOf(sections('BNS 318(4)', 'BNS 316(2)'), ['sections_charged']), jest.fn());
    await typeHalf('BNS 3');
    mount(
      LIST,
      ledgerOf(sections('BNS 318(4)', 'BNS 316(2)', 'BNS 61(2)'), ['sections_charged']),
      jest.fn(),
    );
    await settle();
    expect(ta().value).toContain('BNS 61(2)');
    expect(ta().value).toContain('BNS 318(4)');
  });
});

describe('T-612 BriefStep: a race that starts from a failed save', () => {
  it('an older retry answering late does not overwrite the newer cumulative pick', async () => {
    const { res, onValue } = deferredRow();
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    await act(async () => res[0]({ status: 'failed' }));
    await settle();
    expect(text()).toContain('Could not save');
    const retry = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Try again',
    );
    await act(async () => retry?.click()); // older answer, res[1]
    await click('Long custody'); // newer answer, res[2], builds on the pick
    expect(onValue.mock.calls[1][1]).toEqual(['Parity']);
    expect(onValue.mock.calls[2][1]).toEqual(['Parity', 'Long custody']);
    await act(async () => res[2](saved('Parity, Long custody')));
    mount(BRIEF, withFacts(...BOTH), onValue);
    await settle();
    await act(async () => res[1]({ status: 'failed' }));
    await settle();
    expect(pressed('Parity')).toBe('true');
    expect(pressed('Long custody')).toBe('true');
    expect(text()).not.toContain('Could not save');
    expect(text()).not.toContain('Saving…');
  });
});

describe('T-612 BriefStep: a kept pick gives way to the ledger', () => {
  it("after a null outcome the pick stays; when the key's facts change the chips show the ledger", async () => {
    const onValue = jest.fn(async () => null) as unknown as jest.Mock;
    mount(BRIEF, LEDGER, onValue);
    await click('Parity');
    await settle();
    expect(pressed('Parity')).toBe('true');
    mount(BRIEF, withFacts('No previous record'), onValue);
    await settle();
    expect(pressed('No previous record')).toBe('true');
    expect(pressed('Parity')).toBe('false');
  });

  it('data-ledger-display on a choices row joins every fact', () => {
    mount(BRIEF, withFacts(...BOTH), jest.fn());
    const row = container.querySelector('[data-ledger-key="grounds_for_bail"]');
    expect(row?.getAttribute('data-ledger-display')).toBe('Parity, Long custody');
  });
});
