import { act } from 'react';

import {
  COMMAND_BAR_COPY,
  CommandBar,
  DEFAULT_QUICK_CHIPS,
  defaultCommandFilter,
} from '@/components/shell';
import {
  cleanupMounted,
  click,
  mount,
  press,
  q,
  qa,
  stubMatchMedia,
  typeInto,
} from '@/components/ui/__tests__/nl-test-utils';

const ITEMS = [
  { id: 'bail', label: 'Bail application', keywords: ['bail'] },
  { id: 'notice', label: 'Legal notice' },
  { id: 'plaint', label: 'Plaint' },
];

const input = () => q('[role=combobox]') as HTMLInputElement;
const options = () => qa('[role=option]').map((o) => o.textContent);

beforeEach(() => stubMatchMedia());
afterEach(cleanupMounted);

function setup(props: Partial<React.ComponentProps<typeof CommandBar>> = {}) {
  const onSelect = jest.fn();
  const onSubmit = jest.fn();
  const m = mount(<CommandBar items={ITEMS} onSelect={onSelect} onSubmit={onSubmit} {...props} />);
  return { ...m, onSelect, onSubmit };
}

describe('CommandBar structure and aria', () => {
  it('has a labelled combobox, closed at first, with no listbox', () => {
    setup();
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(q('[role=listbox]')).toBeNull();
    expect((q('label') as HTMLLabelElement).textContent).toBe(COMMAND_BAR_COPY.label);
    expect((q('label') as HTMLLabelElement).htmlFor).toBe(input().id);
    expect(q('button[type=submit]')!.textContent).toBe('Draft');
  });

  it('opens on focus with the five default quick chips while empty', () => {
    setup();
    act(() => input().focus());
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(q('[role=listbox]')!.id).toBe(input().getAttribute('aria-controls'));
    expect(options()).toEqual(DEFAULT_QUICK_CHIPS.map((c) => c.label));
    expect(DEFAULT_QUICK_CHIPS).toHaveLength(5);
  });

  it('shows matching items (not chips) while typing', () => {
    setup();
    typeInto(input(), 'bail');
    expect(options()).toEqual(['Bail application']);
    expect(q('[role=option]')!.id).toBeTruthy();
  });

  it('shows the no-results message and no options', () => {
    setup();
    typeInto(input(), 'zzzz');
    expect(options()).toEqual([]);
    expect(document.body.textContent).toContain(COMMAND_BAR_COPY.noResults);
    expect(q('form')!.getAttribute('data-phase')).toBe('no-results');
  });

  it('respects custom quickChips and noResultsText', () => {
    setup({ quickChips: [{ id: 'a', label: 'Alpha' }], noResultsText: 'Nothing.' });
    act(() => input().focus());
    expect(options()).toEqual(['Alpha']);
    typeInto(input(), 'qqq');
    expect(document.body.textContent).toContain('Nothing.');
  });

  it('maxResults caps the list', () => {
    setup({ items: [1, 2, 3, 4].map((n) => ({ id: `i${n}`, label: `Item ${n}` })), maxResults: 2 });
    typeInto(input(), 'item');
    expect(options()).toEqual(['Item 1', 'Item 2']);
  });
});

describe('CommandBar keyboard', () => {
  it('ArrowDown/ArrowUp move aria-activedescendant and wrap', () => {
    setup();
    act(() => input().focus());
    const idOf = () => input().getAttribute('aria-activedescendant');
    expect(idOf()).toBeNull();
    press(input(), { key: 'ArrowDown' });
    const opts = qa('[role=option]');
    expect(idOf()).toBe(opts[0].id);
    expect(opts[0].getAttribute('aria-selected')).toBe('true');
    expect(opts[1].getAttribute('aria-selected')).toBe('false');
    press(input(), { key: 'ArrowDown' });
    expect(idOf()).toBe(opts[1].id);
    press(input(), { key: 'ArrowUp' });
    expect(idOf()).toBe(opts[0].id);
    press(input(), { key: 'ArrowUp' });
    expect(idOf()).toBe(opts[opts.length - 1].id);
    press(input(), { key: 'ArrowDown' });
    expect(idOf()).toBe(opts[0].id);
  });

  it('ArrowDown on a closed bar opens it', () => {
    setup();
    const ev = press(input(), { key: 'ArrowDown' });
    expect(ev.defaultPrevented).toBe(true);
    expect(input().getAttribute('aria-expanded')).toBe('true');
  });

  it('Enter picks the highlighted option and does not submit', () => {
    const { onSelect, onSubmit } = setup();
    typeInto(input(), 'legal');
    press(input(), { key: 'ArrowDown' });
    press(input(), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'notice' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('Enter with nothing highlighted submits the trimmed text via the form', () => {
    const { onSelect, onSubmit } = setup();
    typeInto(input(), '  a bail application for X  ');
    const form = q('form') as HTMLFormElement;
    // jsdom does not synthesise implicit submit from Enter; the keydown must not swallow it.
    const ev = press(input(), { key: 'Enter' });
    expect(ev.defaultPrevented).toBe(false);
    act(() => {
      form.requestSubmit();
    });
    expect(onSubmit).toHaveBeenCalledWith('a bail application for X');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape closes the popover and clears the highlight', () => {
    setup();
    act(() => input().focus());
    press(input(), { key: 'ArrowDown' });
    press(input(), { key: 'Escape' });
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
    expect(q('[role=listbox]')).toBeNull();
  });

  it('clicking an option selects it', () => {
    const { onSelect } = setup();
    act(() => input().focus());
    click(qa('[role=option]')[1]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'legal-notice' }));
  });

  it('typing resets the highlight', () => {
    setup();
    typeInto(input(), 'l');
    press(input(), { key: 'ArrowDown' });
    expect(input().getAttribute('aria-activedescendant')).not.toBeNull();
    typeInto(input(), 'le');
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
  });
});

describe('CommandBar Draft button', () => {
  it('empty Draft focuses the field and does not submit', () => {
    const { onSubmit } = setup();
    expect(document.activeElement).not.toBe(input());
    click(q('button[type=submit]'));
    expect(document.activeElement).toBe(input());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('whitespace-only text counts as empty', () => {
    const { onSubmit } = setup();
    typeInto(input(), '   ');
    click(q('button[type=submit]'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input());
  });

  it('Draft with text submits it and closes', () => {
    const { onSubmit } = setup();
    typeInto(input(), 'plaint for recovery');
    click(q('button[type=submit]'));
    expect(onSubmit).toHaveBeenCalledWith('plaint for recovery');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('submitting disables Draft and blocks submit', () => {
    const { onSubmit } = setup({ submitting: true });
    typeInto(input(), 'abc');
    expect((q('button[type=submit]') as HTMLButtonElement).disabled).toBe(true);
    act(() =>
      (q('form') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disabled disables the input and the hotkey', () => {
    setup({ disabled: true });
    expect(input().disabled).toBe(true);
    press(window, { key: 'k', ctrlKey: true });
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('CommandBar hotkey', () => {
  it('Ctrl+K and Cmd+K focus and open, with preventDefault', () => {
    setup();
    const ev = press(window, { key: 'k', ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('aria-expanded')).toBe('true');
    act(() => input().blur());
    const ev2 = press(document.body, { key: 'K', metaKey: true });
    expect(ev2.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it('plain K, Ctrl+Shift+K and Ctrl+Alt+K do nothing', () => {
    setup();
    for (const init of [
      { key: 'k' },
      { key: 'k', ctrlKey: true, shiftKey: true },
      { key: 'k', ctrlKey: true, altKey: true },
    ]) {
      const ev = press(window, init);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(document.activeElement).not.toBe(input());
  });

  it('is not registered before mount and is removed on unmount', () => {
    const before = press(window, { key: 'k', ctrlKey: true });
    expect(before.defaultPrevented).toBe(false);
    const m = setup();
    expect(press(window, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(true);
    m.unmount();
    expect(press(window, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('removeEventListener is called for the same handler it added', () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const m = setup();
    const added = add.mock.calls.filter((c) => c[0] === 'keydown').map((c) => c[1]);
    expect(added.length).toBeGreaterThan(0);
    m.unmount();
    const removed = remove.mock.calls.filter((c) => c[0] === 'keydown').map((c) => c[1]);
    for (const h of added) expect(removed).toContain(h);
    add.mockRestore();
    remove.mockRestore();
  });

  it('hotkey={false} registers nothing, leaves default alone and hides the hint', () => {
    setup({ hotkey: false });
    const ev = press(window, { key: 'k', ctrlKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input());
    expect(document.body.textContent).not.toContain('Ctrl K');
    expect(input().getAttribute('aria-describedby')).toBeNull();
  });

  it('with the hotkey on, the hint is shown and linked to the input', () => {
    setup();
    expect(document.body.textContent).toContain('Ctrl K');
    const id = input().getAttribute('aria-describedby')!;
    expect(document.getElementById(id)!.textContent).toBe(COMMAND_BAR_COPY.hintAriaLabel);
  });
});

describe('CommandBar hotkeyExclusive (T-524)', () => {
  it('defaults to false: the listener is bubble-phase and a window bubble listener still sees Ctrl+K', () => {
    const add = jest.spyOn(window, 'addEventListener');
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup();
    const mine = add.mock.calls.filter((c) => c[0] === 'keydown' && c[1] !== seen);
    expect(mine.length).toBeGreaterThan(0);
    for (const c of mine) expect((c[2] as { capture?: boolean } | undefined)?.capture).toBeFalsy();
    press(window, { key: 'k', ctrlKey: true });
    window.removeEventListener('keydown', seen);
    add.mockRestore();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input());
  });

  it('exclusive: focuses, prevents, and stops other window listeners', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup({ hotkeyExclusive: true });
    const ev = press(window, { key: 'k', ctrlKey: true });
    window.removeEventListener('keydown', seen);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(seen).not.toHaveBeenCalled();
  });

  it('exclusive: plain K (no Ctrl/Meta) is ignored and still propagates', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup({ hotkeyExclusive: true });
    const ev = press(window, { key: 'k' });
    window.removeEventListener('keydown', seen);
    expect(ev.defaultPrevented).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input());
  });

  it('exclusive: Ctrl/Meta+Shift/Alt+K are prevented and stopped but do NOT focus the bar', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup({ hotkeyExclusive: true });
    for (const init of [
      { key: 'k', ctrlKey: true, shiftKey: true },
      { key: 'K', ctrlKey: true, shiftKey: true },
      { key: 'k', ctrlKey: true, altKey: true },
      { key: 'k', metaKey: true, shiftKey: true },
      { key: 'k', metaKey: true, altKey: true },
      { key: 'k', ctrlKey: true, shiftKey: true, altKey: true },
    ]) {
      expect(press(window, init).defaultPrevented).toBe(true);
      expect(document.activeElement).not.toBe(input());
    }
    window.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
  });

  it('exclusive: Meta+K focuses, prevents and stops', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup({ hotkeyExclusive: true });
    const ev = press(window, { key: 'K', metaKey: true });
    window.removeEventListener('keydown', seen);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(seen).not.toHaveBeenCalled();
  });

  it('exclusive: other keys with Ctrl are untouched', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup({ hotkeyExclusive: true });
    const ev = press(window, { key: 'j', ctrlKey: true });
    window.removeEventListener('keydown', seen);
    expect(ev.defaultPrevented).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('non-exclusive: Shift/Alt variants are ignored and nothing is prevented', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup();
    for (const init of [
      { key: 'k', ctrlKey: true, shiftKey: true },
      { key: 'k', ctrlKey: true, altKey: true },
    ]) {
      expect(press(window, init).defaultPrevented).toBe(false);
    }
    window.removeEventListener('keydown', seen);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(document.activeElement).not.toBe(input());
  });

  it.each([
    ['exclusive', true],
    ['non-exclusive', false],
  ])('%s: a key press during IME composition is ignored entirely', (_n, hotkeyExclusive) => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup({ hotkeyExclusive });
    const ev = press(window, { key: 'k', ctrlKey: true, isComposing: true });
    window.removeEventListener('keydown', seen);
    expect(ev.defaultPrevented).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input());
  });

  it('hotkeySuspended (exclusive): handler is a no-op and Ctrl+K reaches a bubble listener', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup({ hotkeyExclusive: true, hotkeySuspended: true });
    const ev = press(window, { key: 'k', ctrlKey: true });
    const shifted = press(window, { key: 'k', ctrlKey: true, shiftKey: true });
    window.removeEventListener('keydown', seen);
    expect(ev.defaultPrevented).toBe(false);
    expect(shifted.defaultPrevented).toBe(false);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(document.activeElement).not.toBe(input());
  });

  it('hotkeySuspended registers no capture keydown listener', () => {
    const add = jest.spyOn(window, 'addEventListener');
    setup({ hotkeyExclusive: true, hotkeySuspended: true });
    const keydown = add.mock.calls.filter((c) => c[0] === 'keydown');
    add.mockRestore();
    expect(keydown).toHaveLength(0);
  });

  it('toggling hotkeySuspended at runtime removes and re-adds the listener', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    const onSelect = jest.fn();
    const onSubmit = jest.fn();
    const el = (suspended: boolean) => (
      <CommandBar
        items={ITEMS}
        onSelect={onSelect}
        onSubmit={onSubmit}
        hotkeyExclusive
        hotkeySuspended={suspended}
      />
    );
    const { rerender } = mount(el(false));
    expect(press(window, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    act(() => input().blur());

    rerender(el(true));
    expect(press(window, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);

    rerender(el(false));
    const back = press(window, { key: 'k', ctrlKey: true });
    window.removeEventListener('keydown', seen);
    expect(back.defaultPrevented).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input());
  });

  it('hotkeySuspended has no effect without hotkeyExclusive (bar still takes Ctrl+K)', () => {
    setup({ hotkeySuspended: true });
    const ev = press(window, { key: 'k', ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it('exclusive with hotkey={false} registers nothing and swallows nothing', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup({ hotkey: false, hotkeyExclusive: true });
    const ev = press(window, { key: 'k', ctrlKey: true });
    window.removeEventListener('keydown', seen);
    expect(ev.defaultPrevented).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('exclusive with disabled registers nothing', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    setup({ hotkeyExclusive: true, disabled: true });
    press(window, { key: 'k', ctrlKey: true });
    window.removeEventListener('keydown', seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('defaultCommandFilter', () => {
  it('returns everything for an empty query', () => {
    expect(defaultCommandFilter(ITEMS, '  ')).toEqual(ITEMS);
  });
  it('matches label, keyword, and descriptions containing the label', () => {
    expect(defaultCommandFilter(ITEMS, 'LEGAL').map((i) => i.id)).toEqual(['notice']);
    expect(defaultCommandFilter(ITEMS, 'bai').map((i) => i.id)).toEqual(['bail']);
    expect(defaultCommandFilter(ITEMS, 'need a plaint for recovery').map((i) => i.id)).toEqual([
      'plaint',
    ]);
    expect(defaultCommandFilter(ITEMS, 'xyz')).toEqual([]);
  });
  it('ignores empty keywords', () => {
    expect(defaultCommandFilter([{ id: 'e', label: 'A', keywords: [''] }], 'zz')).toEqual([]);
  });
});
