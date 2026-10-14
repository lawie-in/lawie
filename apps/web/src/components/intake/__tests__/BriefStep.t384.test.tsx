// T-384: a date row answered "Not known" shows a static chip and a "Change" link, not a blank box.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep, { isNotKnownDate } from '../BriefStep';
import type { Brief, BriefItem, Ledger, Value } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function dateItem(over: Partial<BriefItem> = {}): BriefItem {
  return {
    key: 'notice_sent_date',
    part: 'dates',
    label: 'Notice sent date',
    kind: 'date',
    required: false,
    options: [],
    value: null,
    source: null,
    please_check: false,
    placeholder: '[NOTICE DATE]',
    party_name: false,
    asked_empty: true,
    ...over,
  };
}

function briefOf(items: BriefItem[]): Brief {
  return {
    kind: { id: 'k', name: 'Legal notice', court_document: false },
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
      type: 'date' as const,
      raw_span: '',
      source: 'asked' as const,
      reason: 'x',
      detail: 'Could not read that.',
    })),
    fields: Object.fromEntries(keys.map((k) => [k, 'date' as const])),
  };
}

describe('isNotKnownDate', () => {
  it.each(['Not known', 'not known ', 'NOT GIVEN', 'Not-known.'])('is true for %p', (a) => {
    expect(isNotKnownDate(dateItem(), a)).toBe(true);
  });
  it('is false for other words', () => {
    expect(isNotKnownDate(dateItem(), 'June 2024')).toBe(false);
    expect(isNotKnownDate(dateItem(), 'none')).toBe(false);
    expect(isNotKnownDate(dateItem(), '')).toBe(false);
  });
  it('is false with no answer', () => {
    expect(isNotKnownDate(dateItem())).toBe(false);
  });
  it('is false for a non-date kind', () => {
    expect(isNotKnownDate(dateItem({ kind: 'text' }), 'Not known')).toBe(false);
    expect(isNotKnownDate(dateItem({ kind: 'choice', options: ['Not known'] }), 'Not known')).toBe(
      false,
    );
  });
  it('is false when the item was not asked_empty', () => {
    expect(isNotKnownDate(dateItem({ asked_empty: false }), 'Not known')).toBe(false);
    expect(isNotKnownDate(dateItem({ asked_empty: undefined }), 'Not known')).toBe(false);
  });
  it('reads the first entry of an array answer', () => {
    expect(isNotKnownDate(dateItem(), ['Not known'])).toBe(true);
    expect(isNotKnownDate(dateItem(), ['June 2024', 'Not known'])).toBe(false);
    expect(isNotKnownDate(dateItem(), [])).toBe(false);
  });
});

describe('BriefStep date row answered "Not known" (T-384)', () => {
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
    opts: {
      ledger?: Ledger | null;
      onValue?: jest.Mock;
      askedAnswers?: Record<string, Value>;
    } = {},
  ) {
    const noop = jest.fn();
    const onValue = opts.onValue ?? jest.fn();
    const render = (its: BriefItem[]) =>
      act(() => {
        root.render(
          <BriefStep
            brief={briefOf(its)}
            ledger={opts.ledger ?? null}
            askedAnswers={opts.askedAnswers}
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
    render(items);
    return { onValue, render };
  }

  const dateInput = () => container.querySelector('input[type="date"]') as HTMLInputElement | null;
  const chipEl = () =>
    Array.from(container.querySelectorAll('span')).find((s) => s.textContent === 'Not known');
  const changeLink = () =>
    Array.from(container.querySelectorAll('button')).find(
      (b) =>
        b.textContent === 'Change' &&
        (b.getAttribute('aria-label') ?? '').endsWith('now Not known'),
    );
  const pick = (el: HTMLInputElement, v: string) =>
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
        v: string,
      ) => void;
      set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

  const NK = { notice_sent_date: 'Not known' as Value };

  describe('chip state (AC1)', () => {
    it.each([
      ['Not known', 'Not known'],
      ['not given', 'not given'],
    ])('shows a static chip and Change link for the answer %p', (_n, said) => {
      const it1 = dateItem({ required: true });
      mount([it1], { ledger: ledgerWithUnresolved([it1.key]), askedAnswers: { [it1.key]: said } });
      const chip = chipEl() as HTMLSpanElement;
      expect(chip).toBeDefined();
      expect(chip.tagName).toBe('SPAN');
      expect(chip.hasAttribute('tabindex')).toBe(false);
      expect(chip.hasAttribute('role')).toBe(false);
      expect(chip.className).toContain('bg-brand-navy');
      expect(chip.className).toContain('text-white');
      const link = changeLink() as HTMLButtonElement;
      expect(link).toBeDefined();
      expect(link.getAttribute('type')).toBe('button');
      expect(link.getAttribute('aria-label')).toBe('Change Notice sent date, now Not known');
      expect(link.className).toContain('underline');
    });

    it('has no date input, no To be asked, no dashed blank, no placeholder, no draft line', () => {
      const it1 = dateItem({ required: true });
      mount([it1], { ledger: ledgerWithUnresolved([it1.key]), askedAnswers: NK });
      expect(dateInput()).toBeNull();
      expect(container.querySelector('input')).toBeNull();
      expect(container.textContent).not.toContain('To be asked');
      expect(container.textContent).not.toContain('The draft will show');
      expect(container.textContent).not.toContain('[NOTICE DATE]');
      expect(container.querySelector('[placeholder="Not given"]')).toBeNull();
      expect(container.querySelector('.\\!border-dashed')).toBeNull();
      expect(container.querySelector('[data-ledger-unresolved]')).toBeNull();
    });

    it('uses the meaning as the heading in the Change label when the date has one', () => {
      const it1 = dateItem({ meaning: 'the day the notice was sent' } as Partial<BriefItem>);
      mount([it1], { askedAnswers: NK });
      expect(changeLink()?.getAttribute('aria-label')).toBe(
        'Change the day the notice was sent, now Not known',
      );
    });

    it('works with no ledger', () => {
      mount([dateItem()], { askedAnswers: NK });
      expect(chipEl()).toBeDefined();
      expect(dateInput()).toBeNull();
    });
  });

  describe('Change pressed (AC2)', () => {
    it('removes chip and link, shows an empty date input, and focuses it', () => {
      mount([dateItem()], { askedAnswers: NK });
      act(() => changeLink()!.click());
      expect(chipEl()).toBeUndefined();
      expect(changeLink()).toBeUndefined();
      const input = dateInput();
      expect(input).not.toBeNull();
      expect(input!.value).toBe('');
      expect(document.activeElement).toBe(input);
      expect(input!.hasAttribute('autofocus')).toBe(false);
    });

    it('commits an ISO date through onValue', () => {
      const it1 = dateItem();
      const { onValue } = mount([it1], { askedAnswers: NK });
      act(() => changeLink()!.click());
      pick(dateInput()!, '2026-03-05');
      expect(onValue).toHaveBeenCalledTimes(1);
      expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ key: it1.key }), '2026-03-05');
      expect(dateInput()!.value).toBe('2026-03-05');
      expect(container.textContent).toContain('5 March 2026');
      expect(chipEl()).toBeUndefined();
    });

    it('shows the date, not the chip, once the service clears asked_empty', () => {
      const it1 = dateItem();
      const { render } = mount([it1], { askedAnswers: NK });
      act(() => changeLink()!.click());
      render([{ ...it1, asked_empty: false, value: '2026-03-05', source: 'user' }]);
      expect(chipEl()).toBeUndefined();
      expect(dateInput()!.value).toBe('2026-03-05');
    });

    it('shows the chip again if the row becomes Not known later', () => {
      const it1 = dateItem();
      const { render } = mount([it1], { askedAnswers: NK });
      act(() => changeLink()!.click());
      render([{ ...it1, asked_empty: false, value: '2026-03-05', source: 'user' }]);
      render([it1]);
      expect(chipEl()).toBeDefined();
      expect(dateInput()).toBeNull();
    });
  });

  describe('other states are unchanged (AC3)', () => {
    it('never answered: a plain date input, no chip or Change', () => {
      mount([dateItem({ asked_empty: undefined })]);
      expect(dateInput()).not.toBeNull();
      expect(dateInput()!.value).toBe('');
      expect(chipEl()).toBeUndefined();
      expect(changeLink()).toBeUndefined();
    });

    it('never answered and unresolved: still To be asked', () => {
      const it1 = dateItem({ asked_empty: undefined });
      mount([it1], { ledger: ledgerWithUnresolved([it1.key]) });
      expect(container.textContent).toContain('To be asked');
      expect(dateInput()).not.toBeNull();
      expect(chipEl()).toBeUndefined();
    });

    it('date entered: input holds the date, shown in words, no chip', () => {
      mount([dateItem({ asked_empty: false, value: '2026-03-05', source: 'user' })], {
        askedAnswers: NK,
      });
      expect(dateInput()!.value).toBe('2026-03-05');
      expect(container.textContent).toContain('5 March 2026');
      expect(chipEl()).toBeUndefined();
      expect(changeLink()).toBeUndefined();
    });

    it('a date value wins even if asked_empty is still set', () => {
      mount([dateItem({ value: '2026-03-05', source: 'user' })], { askedAnswers: NK });
      expect(dateInput()!.value).toBe('2026-03-05');
      expect(chipEl()).toBeUndefined();
    });

    it('error: an unreadable date marks the input aria-invalid', async () => {
      const it1 = dateItem({ asked_empty: undefined });
      const onValue = jest.fn().mockResolvedValue({ status: 'unreadable', detail: 'Bad date.' });
      mount([it1], { ledger: ledgerWithUnresolved([it1.key]), onValue });
      await act(async () => {
        pick(dateInput()!, '2026-03-05');
      });
      expect(dateInput()!.getAttribute('aria-invalid')).toBe('true');
      expect(container.textContent).toContain('Bad date.');
    });

    it('error after Change: the input keeps aria-invalid', async () => {
      const it1 = dateItem();
      const onValue = jest.fn().mockResolvedValue({ status: 'unreadable', detail: 'Bad date.' });
      mount([it1], { ledger: ledgerWithUnresolved([it1.key]), onValue, askedAnswers: NK });
      act(() => changeLink()!.click());
      await act(async () => {
        pick(dateInput()!, '2026-03-05');
      });
      expect(dateInput()!.getAttribute('aria-invalid')).toBe('true');
      expect(container.textContent).toContain('Bad date.');
    });
  });

  describe('only "Not known" gets the chip (AC4)', () => {
    it.each(['June 2024', 'none', 'Not sure', 'Not known yet'])(
      'a date answered %p still shows the input',
      (said) => {
        const it1 = dateItem();
        mount([it1], { askedAnswers: { [it1.key]: said } });
        expect(dateInput()).not.toBeNull();
        expect(chipEl()).toBeUndefined();
        expect(changeLink()).toBeUndefined();
      },
    );

    it('a date with no recorded answer still shows the input', () => {
      mount([dateItem()]);
      expect(dateInput()).not.toBeNull();
      expect(chipEl()).toBeUndefined();
    });

    it('a text row answered Not known keeps its words and gets no chip', () => {
      const it1 = dateItem({ key: 'remarks', label: 'Remarks', kind: 'text' });
      mount([it1], { askedAnswers: { remarks: 'Not known' } });
      expect((container.querySelector('input') as HTMLInputElement).value).toBe('Not known');
      expect(chipEl()).toBeUndefined();
      expect(changeLink()).toBeUndefined();
    });
  });
});
