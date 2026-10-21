// T-525: forced-colors class guards for the ThemeToggle checked option (selected only).
import { ThemeProvider, ThemeToggle } from '@/components/shell';
import { cleanupMounted, mount, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

const CHECKED = [
  'forced-colors:peer-checked:bg-[color:Highlight]',
  'forced-colors:peer-checked:text-[color:HighlightText]',
  'forced-colors:peer-checked:[forced-color-adjust:none]',
  'forced-colors:peer-checked:peer-focus-visible:outline-[color:CanvasText]',
];

beforeEach(() => {
  window.localStorage.clear();
  stubMatchMedia();
});
afterEach(cleanupMounted);

describe('ThemeToggle forced colours', () => {
  it('every option span carries the peer-checked forced-colors set, keyed to the sr-only radio', () => {
    mount(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.length).toBeGreaterThanOrEqual(2);
    for (const radio of radios) {
      expect(radio.className.split(/\s+/)).toContain('peer');
      const span = radio.nextElementSibling as HTMLElement;
      expect(span.tagName).toBe('SPAN');
      const classes = span.className.split(/\s+/);
      for (const c of CHECKED) expect(classes).toContain(c);
    }
  });

  it('the forced-colors fill only applies via peer-checked: no unconditional forced-colors class', () => {
    mount(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const spans = Array.from(document.querySelectorAll('input[type="radio"] + span'));
    expect(spans.length).toBeGreaterThanOrEqual(2);
    for (const span of spans) {
      const forced = span.className.split(/\s+/).filter((c) => c.startsWith('forced-colors:'));
      expect(forced.length).toBe(CHECKED.length);
      for (const c of forced) expect(c.startsWith('forced-colors:peer-checked:')).toBe(true);
    }
  });

  it('exactly one radio is checked, so exactly one span is highlighted by the peer selector', () => {
    mount(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.filter((r) => r.checked)).toHaveLength(1);
  });
});
