import fs from 'fs';
import path from 'path';

import { ThemeProvider, TopBar } from '@/components/shell';
import { INKWELL_DRAIN_END_OFFSET, Inkwell } from '@/components/ui';

import { cleanupMounted, mount, q, qa, stubMatchMedia } from './nl-test-utils';

const WEB_ROOT = path.resolve(__dirname, '../../../..');
const REDUCED = '(prefers-reduced-motion: reduce)';

afterEach(() => {
  cleanupMounted();
  jest.restoreAllMocks();
});

function inkVars(balance: number, draining = true) {
  stubMatchMedia();
  const { container } = mount(<Inkwell balance={balance} draining={draining} />);
  const rect = q('g rect', container) as SVGRectElement;
  return {
    from: rect.style.getPropertyValue('--nl-ink-from'),
    to: rect.style.getPropertyValue('--nl-ink-to'),
    rect,
  };
}

describe('Inkwell drain end offset (--nl-ink-to)', () => {
  it('INKWELL_DRAIN_END_OFFSET is 92 and matches the globals.css keyframes fallback', () => {
    expect(INKWELL_DRAIN_END_OFFSET).toBe(92);
    const css = fs
      .readFileSync(path.join(WEB_ROOT, 'src/app/globals.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const m = /var\(--nl-ink-to\s*,\s*(\d+)%\s*\)/.exec(css);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(INKWELL_DRAIN_END_OFFSET);
  });

  it.each([
    [5, '95%', '95%'],
    [8, '92%', '92%'],
    [50, '50%', '92%'],
    [100, '0%', '92%'],
    [0, '100%', '100%'],
    [300, '0%', '92%'],
    [-4, '100%', '100%'],
    [Number.NaN, '100%', '100%'],
  ])('draining balance %p -> from %s, to %s', (balance, from, to) => {
    const v = inkVars(balance);
    expect(v.from).toBe(from);
    expect(v.to).toBe(to);
    expect(v.rect.getAttribute('class')).toContain('nl-ink-draining');
  });

  it('never drains upward: to offset is always >= from offset', () => {
    for (const b of [0, 1, 5, 7, 7.9, 8, 8.1, 20, 99, 100]) {
      const v = inkVars(b);
      expect(parseFloat(v.to)).toBeGreaterThanOrEqual(parseFloat(v.from));
      cleanupMounted();
    }
  });

  it('not draining: no draining class or data-draining (the --nl-ink-to var is inert)', () => {
    const v = inkVars(50, false);
    expect(v.rect.getAttribute('class') ?? '').not.toContain('nl-ink-draining');
    expect(document.querySelector('svg')!.getAttribute('data-draining')).toBeNull();
    expect(v.rect.style.transform).toBe('translateY(50%)');
  });

  it('reduced motion unchanged: static 60%, no class, no animation', () => {
    stubMatchMedia({ [REDUCED]: true });
    const { container } = mount(<Inkwell balance={5} draining />);
    const rect = q('g rect', container) as SVGRectElement;
    expect(q('svg', container)!.getAttribute('data-level')).toBe('60');
    expect(rect.style.transform).toBe('translateY(40%)');
    expect(rect.getAttribute('class') ?? '').not.toContain('nl-ink-draining');
  });
});

describe('TopBar theme toggle responsive wrappers', () => {
  it('desktop wrapper is hidden min-[720px]:block; mobile row is min-[720px]:hidden', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <TopBar variant="signed-in" />
      </ThemeProvider>,
    );
    const mobile = q('[data-topbar-mobile-menu]', container)!;
    expect((mobile.getAttribute('class') ?? '').split(/\s+/)).toContain('min-[720px]:hidden');
    const desktopFs = qa('fieldset', container).find((f) => !mobile.contains(f))!;
    const wrapper = desktopFs.parentElement!;
    const classes = (wrapper.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('hidden');
    expect(classes).toContain('min-[720px]:block');
  });
});
