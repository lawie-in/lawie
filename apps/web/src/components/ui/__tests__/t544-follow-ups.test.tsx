// T-544 follow-ups (items 11, 12, N1, N2, N3). Class checks stand in for layout (jsdom has none).
import { act } from 'react';

import { LanguageToggle } from '@/components/marketing/NightTopBar';
import { CommandBar, ThemeProvider, ThemeToggle } from '@/components/shell';
import * as ui from '@/components/ui';
import { Button } from '@/components/ui';
import { InkChip, formatInk } from '@/components/ui/Chip';
import { NL_DESTRUCTIVE_HOVER } from '@/components/ui/hover';

import { cleanupMounted, mount, q, qa, stubMatchMedia } from './nl-test-utils';

beforeEach(() => {
  window.localStorage.clear();
  stubMatchMedia();
});
afterEach(cleanupMounted);

const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);

describe('T-544 item 11: formatInk (en-IN)', () => {
  it('groups lakhs the Indian way', () => {
    expect(formatInk(99999)).toBe('99,999');
    expect(formatInk(100000)).toBe('1,00,000');
    expect(formatInk(1234567)).toBe('12,34,567');
  });
  it('leaves small numbers alone', () => {
    expect(formatInk(32)).toBe('32');
    expect(formatInk(5)).toBe('5');
    expect(formatInk(0)).toBe('0');
    expect(formatInk(999)).toBe('999');
  });
  it('keeps at most one decimal', () => {
    expect(formatInk(0.5)).toBe('0.5');
    expect(formatInk(1234.56)).toBe('1,234.6');
  });
  it('passes strings and non-finite numbers through', () => {
    expect(formatInk('99999')).toBe('99999');
    expect(formatInk('—')).toBe('—');
    expect(formatInk(NaN)).toBe('NaN');
    expect(formatInk(Infinity)).toBe('Infinity');
    expect(formatInk(-Infinity)).toBe('-Infinity');
  });
  it('is exported from the ui index', () => {
    expect(ui.formatInk).toBe(formatInk);
  });
});

describe('T-544 item 11: InkChip', () => {
  it('renders 99999 as 99,999, tabular, with the unit', () => {
    const { container } = mount(<InkChip balance={99999} />);
    expect(container.textContent).toContain('99,999 Ink');
    expect(container.textContent).not.toContain('99999');
    expect(classes(q('.tabular-nums', container))).toContain('tabular-nums');
  });
  it('32 and 5 are unchanged; a string balance is printed as given', () => {
    expect(mount(<InkChip balance={32} />).container.textContent).toContain('32 Ink');
    expect(mount(<InkChip balance={5} />).container.textContent).toContain('5 Ink');
    expect(mount(<InkChip balance="1500" />).container.textContent).toContain('1500 Ink');
  });
  it('children still override the text entirely', () => {
    const { container } = mount(<InkChip balance={99999}>custom</InkChip>);
    expect(container.textContent).toBe('custom');
  });
});

describe('T-544 item 12: destructive hover', () => {
  it('destructive carries the Oxblood High hover rule, fine pointers and enabled only', () => {
    const el = mount(<Button variant="destructive">x</Button>).container.querySelector('button')!;
    expect(el.className).toContain(NL_DESTRUCTIVE_HOVER);
    expect(NL_DESTRUCTIVE_HOVER).toContain(
      '[@media(hover:hover)_and_(pointer:fine)]:[&:not([aria-disabled=true])]:enabled:hover:bg-nl-ox-hi',
    );
  });
  it('primary and ghost do not get it', () => {
    for (const v of ['primary', 'ghost'] as const) {
      const el = mount(<Button variant={v}>x</Button>).container.querySelector('button')!;
      expect(el.className).not.toContain('bg-nl-ox-hi');
      expect(el.className).not.toContain(NL_DESTRUCTIVE_HOVER);
    }
  });
  it('a disabled destructive button is still gated by enabled: (no hover recolour when disabled)', () => {
    const el = mount(
      <Button variant="destructive" disabled>
        x
      </Button>,
    ).container.querySelector('button')!;
    expect(el.disabled).toBe(true);
    expect(el.className).toContain(':enabled:hover:bg-nl-ox-hi');
    expect(el.className).not.toMatch(/(^|\s)hover:bg-nl-ox-hi/);
  });
});

describe('T-544 N1: ThemeToggle 44px frame', () => {
  const spans = () => qa('input[type="radio"] + span');
  it('each option is 40px tall, 44px wide, with a height-only ::before hit area', () => {
    mount(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(spans()).toHaveLength(3);
    for (const span of spans()) {
      const c = classes(span);
      expect(c).toContain('min-h-[40px]');
      expect(c).toContain('min-w-[44px]');
      expect(c).not.toContain('min-h-[44px]');
      expect(c).toContain('relative');
      expect(c).toContain('before:absolute');
      expect(c).toContain('before:-inset-y-[2px]');
      expect(c).toContain('before:inset-x-0');
      // width-wise the hit areas must not overlap neighbours
      expect(c.join(' ')).not.toMatch(/before:-inset-x|before:-inset-\[/);
      expect(c).toContain("before:content-['']");
    }
  });
  it('the frame keeps its classes (Control Line border, p-px, inline-flex)', () => {
    mount(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const frame = q('fieldset > div')!;
    for (const c of ['inline-flex', 'border', 'border-[color:var(--line-control)]', 'p-px']) {
      expect(classes(frame)).toContain(c);
    }
  });
  it('the focus ring stays on the span, not on the ::before', () => {
    mount(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    for (const span of spans()) {
      const c = classes(span);
      expect(c).toContain('peer-focus-visible:outline');
      expect(c).toContain('peer-focus-visible:outline-2');
      expect(c.some((x) => x.startsWith('before:outline') || x.startsWith('before:ring'))).toBe(
        false,
      );
    }
  });
});

describe('T-544 N2: LanguageToggle frame border', () => {
  it('uses the Control Line, not the decorative line', () => {
    const { container } = mount(<LanguageToggle lang="en" onChange={() => undefined} />);
    const frame = container.firstElementChild!;
    expect(classes(frame)).toContain('border-[color:var(--line-control)]');
    expect(classes(frame)).not.toContain('border-nl-line');
    expect(classes(frame)).toContain('border');
  });
  it('still has two 44px buttons with aria-pressed', () => {
    const { container } = mount(<LanguageToggle lang="hi" onChange={() => undefined} />);
    const buttons = qa('button', container);
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    for (const b of buttons) expect(classes(b)).toContain('min-h-[44px]');
  });
});

describe('T-544 N3: CommandBar popover layer', () => {
  it('the open popover content is z-[60], above the consent sheet (55)', () => {
    mount(
      <CommandBar
        items={[{ id: 'a', label: 'Bail application' }]}
        onSelect={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    act(() => (q('[role=combobox]') as HTMLInputElement).focus());
    const listbox = q('[role=listbox]')!;
    const content = listbox.closest('[data-phase]')!;
    expect(classes(content)).toContain('z-[60]');
  });
});
