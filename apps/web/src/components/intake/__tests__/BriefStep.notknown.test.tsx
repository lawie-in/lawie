// T-365 AC2: "Not known" on the brief selects and stays selected; it does not clear the row.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep, { askedEmptyValue, notKnownOption } from '../BriefStep';
import { askedEmptyAnswers } from '../briefTypes';
import type { Brief, BriefItem, GivenValue, Ledger, Value } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function item(over: Partial<BriefItem>): BriefItem {
  return {
    key: 'investigation_stage',
    part: 'facts',
    label: 'Investigation stage',
    kind: 'choice',
    required: false,
    options: ['FIR registered', 'Chargesheet filed', 'Not known'],
    value: null,
    source: null,
    please_check: false,
    placeholder: '[STAGE]',
    party_name: false,
    ...over,
  };
}

function briefOf(items: BriefItem[]): Brief {
  return {
    kind: { id: 'k', name: 'Bail application', court_document: false },
    court: { state: null, court_type: null, court: null },
    items,
    loose_dates: [],
    unplaced: [],
    still_unknown: [],
    can_confirm: true,
    confirm_blockers: [],
    confirm_message: null,
  };
}

function ledgerWithUnresolved(keys: string[]): Ledger {
  return {
    ledger_id: 'l1',
    version: 1,
    run_type: 'user',
    document_kind: 'k',
    facts: [],
    unresolved: keys.map((key) => ({
      id: `u-${key}`,
      key,
      label: key,
      type: 'enum' as const,
      raw_span: '',
      source: 'asked' as const,
      reason: 'x',
      detail: 'Could not read that.',
    })),
    fields: Object.fromEntries(keys.map((k) => [k, 'enum' as const])),
  };
}

describe('notKnownOption', () => {
  const asked = (over: Partial<BriefItem>) => item({ asked_empty: true, ...over });

  it('returns the "Not known" option of an asked_empty choice item', () => {
    expect(notKnownOption(asked({}))).toBe('Not known');
  });

  it.each(['Not known', 'not known', 'Not Known.', 'Not-known', 'Not given', ' not   given '])(
    'folds %p',
    (opt) => {
      expect(notKnownOption(asked({ options: ['A', opt] }))).toBe(opt);
    },
  );

  it('works for a choices item', () => {
    expect(notKnownOption(asked({ kind: 'choices', options: ['A', 'B', 'Not given'] }))).toBe(
      'Not given',
    );
  });

  it('is undefined when the item was not asked_empty', () => {
    expect(notKnownOption(item({}))).toBeUndefined();
    expect(notKnownOption(item({ asked_empty: false }))).toBeUndefined();
  });

  it('is undefined when no option folds to not known', () => {
    expect(notKnownOption(asked({ options: ['A', 'B'] }))).toBeUndefined();
  });

  it('is undefined for a kind that is not choice or choices', () => {
    expect(notKnownOption(asked({ kind: 'text', options: ['Not known'] }))).toBeUndefined();
  });
});

describe('askedEmptyAnswers', () => {
  const given = (key: string, value: Value): GivenValue => ({ key, value, source: 'user' });

  it('returns the kept user value for each asked_empty item only', () => {
    const items = [
      item({ key: 'a', asked_empty: true }),
      item({ key: 'b', asked_empty: true, kind: 'text' }),
      item({ key: 'c' }),
    ];
    const out = askedEmptyAnswers(briefOf(items), [
      given('a', 'None'),
      given('b', 'Not known'),
      given('c', 'ignored'),
    ]);
    expect(out).toEqual({ a: 'None', b: 'Not known' });
  });

  it('skips an asked_empty item with no kept or only an empty value', () => {
    const items = [item({ key: 'a', asked_empty: true }), item({ key: 'b', asked_empty: true })];
    expect(askedEmptyAnswers(briefOf(items), [given('b', '')])).toEqual({});
  });
});

describe('askedEmptyValue', () => {
  const asked = (over: Partial<BriefItem>) => item({ asked_empty: true, ...over });

  it('shows the chosen option for a choice, e.g. None', () => {
    const it1 = asked({ options: ['Yes', 'No', 'None'] });
    expect(askedEmptyValue(it1, 'None')).toBe('None');
    expect(askedEmptyValue(it1, ' none. ')).toBe('None');
  });

  it('falls back to the Not known option when the answer matches no option', () => {
    expect(askedEmptyValue(asked({}), 'something else')).toBe('Not known');
    expect(askedEmptyValue(asked({}))).toBe('Not known');
  });

  it('is undefined for a choice with neither a match nor a Not known option', () => {
    expect(askedEmptyValue(asked({ options: ['Yes', 'No'] }), 'maybe')).toBeUndefined();
  });

  it('wraps the option for choices', () => {
    const it1 = asked({ kind: 'choices', options: ['A', 'None', 'Not given'] });
    expect(askedEmptyValue(it1, ['None'])).toEqual(['None']);
    expect(askedEmptyValue(it1, 'zzz')).toEqual(['Not given']);
  });

  it.each(['text', 'narrative', 'number', 'amount', 'list'] as const)(
    'gives the words said for a %s item',
    (kind) => {
      expect(askedEmptyValue(asked({ kind, options: [] }), 'Not known')).toBe('Not known');
    },
  );

  it('gives nothing for a text item with no answer or a blank one', () => {
    expect(askedEmptyValue(asked({ kind: 'text', options: [] }))).toBeUndefined();
    expect(askedEmptyValue(asked({ kind: 'text', options: [] }), '  ')).toBeUndefined();
  });

  it('gives nothing for a date', () => {
    expect(askedEmptyValue(asked({ kind: 'date', options: [] }), 'Not known')).toBeUndefined();
  });

  it('gives nothing when the item is not asked_empty', () => {
    expect(askedEmptyValue(item({}), 'Not known')).toBeUndefined();
  });
});

describe('askedEmptyValue with both Not known and Not given', () => {
  const both = item({
    asked_empty: true,
    options: ['Yes', 'Not known', 'Not given'],
  });

  it('guesses nothing when there is no recorded answer', () => {
    expect(askedEmptyValue(both)).toBeUndefined();
    expect(askedEmptyValue(both, 'something else')).toBeUndefined();
  });

  it('a recorded answer still wins', () => {
    expect(askedEmptyValue(both, 'Not given')).toBe('Not given');
    expect(askedEmptyValue(both, 'not known')).toBe('Not known');
  });

  it('choices: nothing without an answer, wrapped with one', () => {
    const many = { ...both, kind: 'choices' as const };
    expect(askedEmptyValue(many)).toBeUndefined();
    expect(askedEmptyValue(many, ['Not given'])).toEqual(['Not given']);
  });

  it('a single not-known chip still falls back', () => {
    expect(askedEmptyValue(item({ asked_empty: true, options: ['Yes', 'Not given'] }))).toBe(
      'Not given',
    );
  });
});

describe('BriefStep rows answered "Not known"', () => {
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

  function mount(
    items: BriefItem[],
    ledger: Ledger | null = null,
    onValue = jest.fn(),
    askedAnswers?: Record<string, Value>,
  ) {
    const noop = jest.fn();
    act(() => {
      root.render(
        <BriefStep
          brief={briefOf(items)}
          ledger={ledger}
          askedAnswers={askedAnswers}
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
        />,
      );
    });
    return onValue;
  }
  const chip = (label: string) =>
    Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === label && b.hasAttribute('aria-pressed'),
    ) as HTMLButtonElement;

  it('shows the Not known chip pressed, with no "To be asked" and no blank', () => {
    const it1 = item({ asked_empty: true, required: true });
    mount([it1], ledgerWithUnresolved([it1.key]));
    expect(chip('Not known').getAttribute('aria-pressed')).toBe('true');
    expect(chip('FIR registered').getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).not.toContain('To be asked');
    expect(container.querySelector('[placeholder="Not given"]')).toBeNull();
    expect(container.textContent).not.toContain('[STAGE]');
  });

  it('keeps each of the three T-365 repro rows selected (stage, named in FIR, cooperation)', () => {
    const items = [
      item({ key: 'stage', label: 'Investigation stage', asked_empty: true }),
      item({
        key: 'named',
        label: 'Named in FIR',
        options: ['Yes', 'No', 'Not known'],
        asked_empty: true,
      }),
      item({
        key: 'coop',
        label: 'Cooperation',
        options: ['Cooperating', 'Not cooperating', 'Not known'],
        asked_empty: true,
      }),
    ];
    mount(items, ledgerWithUnresolved(['stage', 'named', 'coop']));
    const pressed = Array.from(container.querySelectorAll('button[aria-pressed="true"]')).map(
      (b) => b.textContent,
    );
    expect(pressed).toEqual(['Not known', 'Not known', 'Not known']);
    expect(container.textContent).not.toContain('To be asked');
  });

  it('commits an empty value when the pressed chip is clicked again', () => {
    const it1 = item({ asked_empty: true });
    const onValue = mount([it1]);
    act(() => chip('Not known').click());
    expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ key: it1.key }), '');
  });

  it('works for a choices item', () => {
    const it1 = item({ kind: 'choices', asked_empty: true, options: ['A', 'B', 'Not given'] });
    mount([it1], ledgerWithUnresolved([it1.key]));
    expect(chip('Not given').getAttribute('aria-pressed')).toBe('true');
    expect(chip('A').getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).not.toContain('To be asked');
  });

  it('leaves an empty item that was not asked_empty unchanged (still "To be asked")', () => {
    const it1 = item({});
    mount([it1], ledgerWithUnresolved([it1.key]));
    expect(container.querySelectorAll('button[aria-pressed="true"]').length).toBe(0);
    expect(container.textContent).toContain('To be asked');
  });

  it('does not show Not known when a value is given', () => {
    const it1 = item({ asked_empty: true, value: 'FIR registered' });
    mount([it1]);
    expect(chip('FIR registered').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Not known').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows a choice row without a Not known chip answered "None" as pressed', () => {
    const it1 = item({ asked_empty: true, options: ['Yes', 'No', 'None'] });
    mount([it1], ledgerWithUnresolved([it1.key]), jest.fn(), { [it1.key]: 'None' });
    expect(chip('None').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Yes').getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).not.toContain('To be asked');
  });

  it('shows a free-text row answered "Not known" with those words, no blank or To be asked', () => {
    const it1 = item({
      key: 'remarks',
      label: 'Remarks',
      kind: 'text',
      options: [],
      required: true,
      asked_empty: true,
    });
    mount([it1], ledgerWithUnresolved([it1.key]), jest.fn(), { remarks: 'Not known' });
    const input = container.querySelector('input, textarea') as HTMLInputElement;
    expect(input.value).toBe('Not known');
    expect(input.placeholder).not.toBe('Not given');
    expect(container.textContent).not.toContain('To be asked');
  });

  describe('a row with both Not known and Not given chips', () => {
    const both = item({ asked_empty: true, options: ['Yes', 'Not known', 'Not given'] });

    it('shows nothing pressed when no answer is recorded', () => {
      mount([both], ledgerWithUnresolved([both.key]));
      expect(container.querySelectorAll('button[aria-pressed="true"]').length).toBe(0);
    });

    it('presses Not given when that was the recorded answer', () => {
      mount([both], ledgerWithUnresolved([both.key]), jest.fn(), { [both.key]: 'Not given' });
      expect(chip('Not given').getAttribute('aria-pressed')).toBe('true');
      expect(chip('Not known').getAttribute('aria-pressed')).toBe('false');
    });
  });
});
