import fs from 'fs';
import path from 'path';

import { ThemeProvider, TopBar, useTheme } from '@/components/shell';
import { Dialog, Inkwell, Seal } from '@/components/ui';

import { cleanupMounted, click, mount, q, qa, stubMatchMedia } from './nl-test-utils';

const WEB_ROOT = path.resolve(__dirname, '../../../..');
const REDUCED = '(prefers-reduced-motion: reduce)';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-pref');
});
afterEach(() => {
  cleanupMounted();
  jest.restoreAllMocks();
});

/** Body of the first `{...}` block whose prelude matches, brace-balanced. */
function blockBody(src: string, prelude: RegExp): string {
  const m = prelude.exec(src);
  if (!m) throw new Error(`no block for ${prelude}`);
  let i = src.indexOf('{', m.index + m[0].length - 1);
  const start = i + 1;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i);
  }
  throw new Error('unbalanced');
}

// ---------------------------------------------------------------- (a) globals.css ink drain
describe('globals.css ink drain (source guard)', () => {
  const css = fs
    .readFileSync(path.join(WEB_ROOT, 'src/app/globals.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('.nl-ink-draining runs once and holds (forwards), never infinite', () => {
    const body = blockBody(css, /\.nl-ink-draining\s*\{/);
    const anim = /animation\s*:\s*([^;]+);/.exec(body)![1];
    expect(anim).toContain('nl-ink-drain');
    expect(anim).toMatch(/\bforwards\b/);
    expect(anim).not.toMatch(/infinite/);
    expect(anim).toMatch(/\b1\b/);
    expect(anim).toMatch(/2\.6s/);
    expect(anim).toMatch(/\blinear\b/);
  });

  it('keyframes nl-ink-drain starts at --nl-ink-from and ends at --nl-ink-to', () => {
    const kf = blockBody(css, /@keyframes\s+nl-ink-drain\s*\{/);
    const from = blockBody(kf, /(^|\s)from\s*\{/);
    const to = blockBody(kf, /(^|\s)to\s*\{/);
    expect(from).toMatch(/translateY\(\s*var\(--nl-ink-from/);
    expect(to).toMatch(/translateY\(\s*var\(--nl-ink-to\s*,\s*92%\s*\)\)/);
  });

  it('the reduced-motion block still disables .nl-ink-draining', () => {
    const rm = blockBody(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/);
    const rule = /([^{}]*\.nl-ink-draining[^{}]*)\{([^}]*)\}/.exec(rm);
    expect(rule).not.toBeNull();
    expect(rule![2]).toMatch(/animation\s*:\s*none/);
  });
});

// ---------------------------------------------------------------- (b) Inkwell
describe('Inkwell outlines and drain variables', () => {
  it('neck, rim and body outlines are brass at 1.5', () => {
    stubMatchMedia();
    const { container } = mount(<Inkwell balance={50} />);
    const stroked = qa('rect[stroke]', container);
    expect(stroked).toHaveLength(3);
    for (const r of stroked) {
      expect(r.getAttribute('stroke')).toBe('var(--brass)');
      expect(r.getAttribute('stroke-width')).toBe('1.5');
    }
  });

  it('draining sets --nl-ink-from inline from the balance, plus the class', () => {
    stubMatchMedia();
    const { container } = mount(<Inkwell balance={80} draining />);
    const level = q('g rect', container) as SVGRectElement;
    expect(level.getAttribute('class')).toContain('nl-ink-draining');
    expect(level.style.getPropertyValue('--nl-ink-from')).toBe('20%');
  });

  it('--nl-ink-from follows the balance and is clamped', () => {
    stubMatchMedia();
    const hi = mount(<Inkwell balance={300} draining />);
    expect(
      (q('g rect', hi.container) as SVGRectElement).style.getPropertyValue('--nl-ink-from'),
    ).toBe('0%');
    const lo = mount(<Inkwell balance={-4} draining />);
    expect(
      (q('g rect', lo.container) as SVGRectElement).style.getPropertyValue('--nl-ink-from'),
    ).toBe('100%');
  });

  it('draining={false} after draining removes the class (the hold ends)', () => {
    stubMatchMedia();
    const m = mount(<Inkwell balance={80} draining />);
    m.rerender(<Inkwell balance={80} draining={false} />);
    const level = q('g rect', m.container) as SVGRectElement;
    expect(level.getAttribute('class') ?? '').not.toContain('nl-ink-draining');
    expect(q('svg', m.container)!.getAttribute('data-draining')).toBeNull();
  });

  it('reduced motion: static 60% level, no class, outlines unchanged', () => {
    stubMatchMedia({ [REDUCED]: true });
    const { container } = mount(<Inkwell balance={95} draining />);
    const level = q('g rect', container) as SVGRectElement;
    expect(q('svg', container)!.getAttribute('data-level')).toBe('60');
    expect(level.style.transform).toBe('translateY(40%)');
    expect(level.getAttribute('class') ?? '').not.toContain('nl-ink-draining');
    expect(qa('rect[stroke="var(--brass)"]', container)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------- (c) Seal
describe('Seal text', () => {
  it('is Mukta 13px / 500 with letter-spacing 0 and no letterSpacing attribute', () => {
    stubMatchMedia();
    const { container } = mount(<Seal state="stamped" text="FINAL" />);
    const t = q('text', container) as SVGTextElement;
    expect(t.getAttribute('class')).toContain('font-nl-body');
    expect(t.style.fontSize).toBe('13px');
    expect(t.style.fontWeight).toBe('500');
    expect(['0', '0px']).toContain(t.style.letterSpacing);
    expect(t.hasAttribute('letter-spacing')).toBe(false);
    expect(t.hasAttribute('letterSpacing')).toBe(false);
  });
});

// ---------------------------------------------------------------- (d) Dialog
describe('Dialog width', () => {
  it('desktop width is min(440px, 100vw - 32px), not 480', () => {
    mount(
      <Dialog
        open
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
        title="T"
        confirmLabel="Ok"
        cancelLabel="No"
      />,
    );
    const classes = (q('[role=dialog]')!.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('min-[641px]:w-[min(440px,calc(100vw-32px))]');
    expect(classes.join(' ')).not.toContain('480');
  });
});

// ---------------------------------------------------------------- (e) TopBar mobile row
describe('TopBar mobile menu row', () => {
  const MOBILE = '[data-topbar-mobile-menu]';

  function Probe() {
    const t = useTheme();
    return <output data-testid="probe">{t.preference}</output>;
  }

  it.each(['signed-in', 'signed-out'] as const)(
    '%s: row exists with a theme toggle and renders mobileMenuExtras',
    (variant) => {
      stubMatchMedia();
      const { container } = mount(
        <ThemeProvider>
          <TopBar variant={variant} mobileMenuExtras={<a href="/extra">Extra</a>} />
        </ThemeProvider>,
      );
      const row = q(MOBILE, container)!;
      expect(row).not.toBeNull();
      expect(row.getAttribute('class')).toContain('min-[720px]:hidden');
      expect(q('fieldset', row)).not.toBeNull();
      expect(qa('input[type=radio]', row)).toHaveLength(3);
      expect(q('a[href="/extra"]', row)!.textContent).toBe('Extra');
      expect(q('header', container)!.getAttribute('class')).toContain('flex-col');
    },
  );

  it('the desktop row keeps its own toggle, so two toggles exist', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <TopBar variant="signed-in" />
      </ThemeProvider>,
    );
    expect(qa('fieldset', container)).toHaveLength(2);
    expect(qa(`${MOBILE} fieldset`, container)).toHaveLength(1);
  });

  it('mobileMenuLabel makes the row a labelled group; absent otherwise', () => {
    stubMatchMedia();
    const labelled = mount(
      <ThemeProvider>
        <TopBar variant="signed-in" mobileMenuLabel="Menu options" />
      </ThemeProvider>,
    );
    const row = q(MOBILE, labelled.container)!;
    expect(row.getAttribute('role')).toBe('group');
    expect(row.getAttribute('aria-label')).toBe('Menu options');

    const plain = mount(
      <ThemeProvider>
        <TopBar variant="signed-in" />
      </ThemeProvider>,
    );
    const plainRow = q(MOBILE, plain.container)!;
    expect(plainRow.getAttribute('role')).toBeNull();
    expect(plainRow.getAttribute('aria-label')).toBeNull();
  });

  it('showThemeToggle={false} renders no toggle anywhere', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <TopBar variant="signed-in" showThemeToggle={false} />
      </ThemeProvider>,
    );
    expect(q('fieldset', container)).toBeNull();
    expect(q('input[type=radio]', container)).toBeNull();
  });

  it('showThemeToggle={false} with extras keeps the row for the extras only', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <TopBar
          variant="signed-out"
          showThemeToggle={false}
          mobileMenuExtras={<a href="/e">E</a>}
        />
      </ThemeProvider>,
    );
    const row = q(MOBILE, container)!;
    expect(row).not.toBeNull();
    expect(q('fieldset', container)).toBeNull();
    expect(q('a[href="/e"]', row)).not.toBeNull();
  });

  it('choosing a theme from the mobile toggle changes the theme', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <Probe />
        <TopBar variant="signed-in" />
      </ThemeProvider>,
    );
    expect(q('[data-testid=probe]', container)!.textContent).toBe('system');
    click(q(`${MOBILE} input[value=night]`, container));
    expect(q('[data-testid=probe]', container)!.textContent).toBe('night');
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');
    // The desktop toggle reflects the same preference.
    const desktopNight = qa('input[value=night]', container).find(
      (i) => !q(MOBILE, container)!.contains(i),
    ) as HTMLInputElement;
    expect(desktopNight.checked).toBe(true);
  });

  it('radio names are unique across the two toggle instances', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <TopBar variant="signed-in" />
      </ThemeProvider>,
    );
    const radios = qa('input[type=radio]', container) as HTMLInputElement[];
    expect(radios).toHaveLength(6);
    const names = new Set(radios.map((r) => r.name));
    expect(names.size).toBe(2);
    for (const n of names) expect(n).toBeTruthy();
    const mobileNames = new Set(
      (qa(`${MOBILE} input[type=radio]`, container) as HTMLInputElement[]).map((r) => r.name),
    );
    expect(mobileNames.size).toBe(1);
  });
});
