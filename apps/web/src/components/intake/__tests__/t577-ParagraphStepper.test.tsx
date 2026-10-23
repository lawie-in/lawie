// T-577: the paragraph stepper and the band track (Rajesh section 5, signed strings).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import ParagraphBandTrack from '../ParagraphBandTrack';
import ParagraphStepper from '../ParagraphStepper';
import type { ParagraphControl, ParagraphQuote } from '../useParagraphQuote';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const QUOTE: ParagraphQuote = {
  ink: 2,
  min: 7,
  max: 25,
  default: 10,
  paragraphs: 10,
  bands: [
    { from: 7, to: 10, ink: 2 },
    { from: 11, to: 18, ink: 3 },
    { from: 19, to: 25, ink: 4 },
  ],
  ceiling: true,
};

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

function control(over: Partial<ParagraphControl> = {}): ParagraphControl {
  return {
    quote: QUOTE,
    value: 10,
    status: 'ready',
    rangeLine: null,
    priceChanged: false,
    onCommit: jest.fn(),
    onRetry: jest.fn(),
    ...over,
  };
}
const show = async (c: ParagraphControl) =>
  act(async () => root.render(<ParagraphStepper control={c} />));
const input = () => container.querySelector('input') as HTMLInputElement;
const btn = (label: string) =>
  container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const type = async (v: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(input(), v);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
const key = async (k: string, shiftKey = false) =>
  act(async () => {
    input().dispatchEvent(
      new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }),
    );
  });
const blur = async () =>
  act(async () => {
    input().focus();
    input().blur();
  });

describe('ParagraphStepper', () => {
  it('is disabled until quoted (no quote: input and both buttons disabled, no commit)', async () => {
    const c = control({ quote: null, value: null, status: 'loading' });
    await show(c);
    expect(input().disabled).toBe(true);
    expect(btn('Fewer paragraphs').disabled).toBe(true);
    expect(btn('More paragraphs').disabled).toBe(true);
    await key('ArrowUp');
    expect(c.onCommit).not.toHaveBeenCalled();
  });

  it('spinbutton semantics and the signed aria-label', async () => {
    await show(control());
    const i = input();
    expect(i.getAttribute('role')).toBe('spinbutton');
    expect(i.getAttribute('aria-label')).toBe('Up to 10 paragraphs');
    expect(i.getAttribute('aria-valuemin')).toBe('7');
    expect(i.getAttribute('aria-valuemax')).toBe('25');
    expect(i.getAttribute('aria-valuenow')).toBe('10');
    expect(i.value).toBe('10');
    expect(container.textContent).toContain('Paragraphs');
    expect(container.textContent).toContain(
      'Up to this many body paragraphs. Headings, prayer and verification are not counted. You pay for what is drafted, never more than shown.',
    );
  });

  it('ceiling:false drops "Up to" and shows the exact-count help', async () => {
    await show(control({ quote: { ...QUOTE, ceiling: false } }));
    expect(input().getAttribute('aria-label')).not.toMatch(/^Up to/);
    expect(container.textContent).toContain(
      'Body paragraphs. Headings, prayer and verification are not counted.',
    );
    expect(container.textContent).not.toContain('Up to this many');
  });

  it('− and + commit value -/+ 1 (not typed)', async () => {
    const c = control();
    await show(c);
    await act(async () => btn('Fewer paragraphs').click());
    expect(c.onCommit).toHaveBeenLastCalledWith(9, false);
    await act(async () => btn('More paragraphs').click());
    expect(c.onCommit).toHaveBeenLastCalledWith(11, false);
  });

  it('− at min and + at max do nothing and are aria-disabled', async () => {
    const lo = control({ value: 7 });
    await show(lo);
    expect(btn('Fewer paragraphs').getAttribute('aria-disabled')).toBe('true');
    await act(async () => btn('Fewer paragraphs').click());
    expect(lo.onCommit).not.toHaveBeenCalled();
    const hi = control({ value: 25 });
    await show(hi);
    expect(btn('More paragraphs').getAttribute('aria-disabled')).toBe('true');
    await act(async () => btn('More paragraphs').click());
    expect(hi.onCommit).not.toHaveBeenCalled();
  });

  it.each([
    ['ArrowUp', false, 11],
    ['ArrowDown', false, 9],
    ['ArrowUp', true, 15],
    ['ArrowDown', true, 5],
    ['Home', false, 7],
    ['End', false, 25],
  ])('%s (shift=%s) commits %s, not typed', async (k, shift, expected) => {
    const c = control();
    await show(c);
    await key(k, shift);
    expect(c.onCommit).toHaveBeenCalledTimes(1);
    expect(c.onCommit).toHaveBeenCalledWith(expected, false);
  });

  it('typing alone never commits (no re-quote while typing)', async () => {
    const c = control();
    await show(c);
    await type('1');
    await type('12');
    await type('120');
    expect(c.onCommit).not.toHaveBeenCalled();
    expect(input().value).toBe('120');
  });

  it('typed non-digits are stripped', async () => {
    await show(control());
    await type('1a2');
    expect(input().value).toBe('12');
  });

  it('blur commits the typed value as typed:true', async () => {
    const c = control();
    await show(c);
    await type('14');
    await blur();
    expect(c.onCommit).toHaveBeenCalledWith(14, true);
  });

  it('Enter commits the typed value', async () => {
    const c = control();
    await show(c);
    await type('12');
    await key('Enter');
    expect(c.onCommit).toHaveBeenCalledWith(12, true);
  });

  it('a typed value above max shows clamped in the field on blur (commit carries raw for the hook)', async () => {
    const c = control();
    await show(c);
    await type('99');
    await blur();
    expect(c.onCommit).toHaveBeenCalledWith(99, true);
    expect(input().value).toBe('25');
  });

  it('a typed value below min shows clamped to min', async () => {
    const c = control();
    await show(c);
    await type('2');
    await blur();
    expect(input().value).toBe('7');
  });

  it('an emptied field reverts to the count without committing', async () => {
    const c = control();
    await show(c);
    await type('');
    await blur();
    expect(c.onCommit).not.toHaveBeenCalled();
    expect(input().value).toBe('10');
  });

  it('the M4 line renders from rangeLine.min, exactly, and is described-by; server flag sets the error ring', async () => {
    await show(control({ rangeLine: { min: 8, server: false } }));
    const line = container.querySelector('#brief-paragraphs-range') as HTMLElement;
    expect(line.textContent).toBe('Choose between 8 and 25 paragraphs.');
    expect(input().getAttribute('aria-describedby')).toContain('brief-paragraphs-range');
    expect(input().getAttribute('aria-invalid')).toBeNull();
    await show(control({ rangeLine: { min: 8, server: true } }));
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(container.innerHTML).toContain('ring-nl-err');
  });

  it('no range line text when none', async () => {
    await show(control());
    expect(container.querySelector('#brief-paragraphs-range')?.textContent).toBe('');
    expect(container.textContent).not.toContain('Choose between');
  });
});

describe('ParagraphBandTrack', () => {
  const labels = () =>
    Array.from(container.querySelectorAll('span'))
      .map((s) => s.textContent)
      .filter((t) => t && /Ink$/.test(t));

  it('draws one "N Ink" label per band from the quote and a tick per inner band edge', async () => {
    await act(async () =>
      root.render(<ParagraphBandTrack min={7} max={25} value={10} bands={QUOTE.bands} />),
    );
    expect(labels()).toEqual(['2 Ink', '3 Ink', '4 Ink']);
    expect(container.querySelectorAll('span.w-px')).toHaveLength(2);
    expect(
      container.querySelector('[data-testid="paragraph-band-track"]')?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('follows whatever bands the quote gives (not hard-coded)', async () => {
    await act(async () =>
      root.render(
        <ParagraphBandTrack
          min={8}
          max={20}
          value={9}
          bands={[
            { from: 8, to: 12, ink: 5 },
            { from: 13, to: 20, ink: 6.5 },
          ]}
        />,
      ),
    );
    expect(labels()).toEqual(['5 Ink', '6.5 Ink']);
    expect(container.querySelectorAll('span.w-px')).toHaveLength(1);
  });

  it('a band wholly outside min..max is not drawn', async () => {
    await act(async () =>
      root.render(
        <ParagraphBandTrack
          min={11}
          max={25}
          value={12}
          bands={[{ from: 1, to: 10, ink: 2 }, ...QUOTE.bands.slice(1)]}
        />,
      ),
    );
    expect(labels()).toEqual(['3 Ink', '4 Ink']);
  });

  it('the fill width follows the value across min..max', async () => {
    await act(async () =>
      root.render(
        <ParagraphBandTrack
          min={0 + 10}
          max={20}
          value={15}
          bands={[{ from: 10, to: 20, ink: 2 }]}
        />,
      ),
    );
    expect((container.querySelector('.bg-nl-brass') as HTMLElement).style.width).toBe('50%');
  });
});
