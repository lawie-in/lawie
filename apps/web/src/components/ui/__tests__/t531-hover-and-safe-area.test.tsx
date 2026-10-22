// T-531 AC2, AC3: the button hover rules per variant (one copy, ui/hover.ts, re-exported by
// marketing/nl-link) and the safe-area paddings on the bottom sheet (Dialog) and the toast
// viewport. jsdom has no layout or :hover; the rules are asserted through the class strings.
import fs from 'fs';
import path from 'path';

import { Button, type ButtonVariant } from '../Button';
import { Dialog } from '../Dialog';
import * as hover from '../hover';
import { ToastProvider } from '../Toast';

import * as nlLink from '@/components/marketing/nl-link';
import { cleanupMounted, mount, q, qa } from './nl-test-utils';

afterEach(cleanupMounted);

const FINE = '[@media(hover:hover)_and_(pointer:fine)]';
const btn = (variant: ButtonVariant, extra: Record<string, unknown> = {}) =>
  mount(
    <Button variant={variant} {...extra}>
      x
    </Button>,
  ).container.querySelector('button')!;
const cls = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const hoverClasses = (el: Element) => cls(el).filter((c) => /(^|:)hover:/.test(c));

describe('ui/hover constants', () => {
  it('primary: a 4px halo and a 1px lift, both gated to fine hover pointers; no lift under reduced motion', () => {
    for (const rule of [hover.NL_PRIMARY_BUTTON_HOVER, hover.NL_PRIMARY_LINK_HOVER]) {
      const c = rule.split(/\s+/);
      expect(c).toContain(
        `${FINE}:${rule.includes('enabled') ? 'enabled:' : ''}hover:shadow-nl-halo`,
      );
      expect(c).toContain(
        `${FINE}:${rule.includes('enabled') ? 'enabled:' : ''}hover:-translate-y-px`,
      );
      expect(
        c.some((x) => x.startsWith('motion-reduce:') && x.endsWith('hover:translate-y-0')),
      ).toBe(true);
    }
    // The button form never reacts when disabled or busy; the link form has no :disabled.
    expect(hover.NL_PRIMARY_BUTTON_HOVER).toContain(':enabled:hover:');
    expect(hover.NL_PRIMARY_LINK_HOVER).not.toContain('enabled');
  });

  it('ghost: border to Brass, ground to Brass Soft, 150ms; no lift, no halo, gated and not on :disabled', () => {
    const g = hover.NL_GHOST_HOVER;
    expect(g).toContain(`${FINE}:[&:not(:disabled)]:hover:border-nl-brass`);
    expect(g).toContain(`${FINE}:[&:not(:disabled)]:hover:bg-nl-brass-light`);
    expect(g).toContain('duration-150');
    expect(g).toContain('border-color');
    expect(g).toContain('background-color');
    expect(g).not.toMatch(/translate/);
    expect(g).not.toContain('halo');
    // (`box-shadow` is in the transition list for the focus ring; there is no hover shadow.)
    expect(g).not.toMatch(/hover:[^\s]*shadow/);
    // The colour fade is kept under reduced motion (it moves nothing).
    expect(g).not.toContain('motion-reduce:transition-none');
  });

  it('every hover class in the file is behind the (hover:hover) and (pointer:fine) gate', () => {
    for (const rule of [
      hover.NL_PRIMARY_BUTTON_HOVER,
      hover.NL_PRIMARY_LINK_HOVER,
      hover.NL_GHOST_HOVER,
    ]) {
      for (const c of rule
        .split(/\s+/)
        .filter((x) => /hover:/.test(x) && !/^motion-reduce/.test(x))) {
        expect(c.startsWith(FINE)).toBe(true);
      }
    }
  });

  it('CONTROL_LINE reads --line-control with a --line fallback', () => {
    expect(hover.CONTROL_LINE).toBe('border-[color:var(--line-control,var(--line))]');
  });
});

describe('marketing/nl-link re-exports the same constants (identity, not a copy)', () => {
  it.each([
    ['NL_PRIMARY_BUTTON_HOVER', nlLink.NL_PRIMARY_BUTTON_HOVER, hover.NL_PRIMARY_BUTTON_HOVER],
    ['NL_PRIMARY_LINK_HOVER', nlLink.NL_PRIMARY_LINK_HOVER, hover.NL_PRIMARY_LINK_HOVER],
    ['NL_GHOST_HOVER', nlLink.NL_GHOST_HOVER, hover.NL_GHOST_HOVER],
    ['CONTROL_LINE', nlLink.CONTROL_LINE, hover.CONTROL_LINE],
  ])('%s', (_name, viaLink, viaHover) => {
    expect(viaLink).toBe(viaHover);
    expect(typeof viaLink).toBe('string');
    expect(viaLink.length).toBeGreaterThan(0);
  });

  it('nl-link has no private copy: its source defines none of the four', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../marketing/nl-link.ts'), 'utf8');
    expect(src).not.toMatch(
      /(const|let|var)\s+(NL_GHOST_HOVER|NL_PRIMARY_\w+_HOVER|CONTROL_LINE|PRIMARY_HOVER)\b/,
    );
    expect(src).toContain("from '@/components/ui/hover'");
  });

  it('the link variants use the shared rules: primary lifts, ghost does not', () => {
    const primary = nlLink.nlLinkButton('primary');
    const ghost = nlLink.nlLinkButton('ghost');
    expect(primary).toContain(hover.NL_PRIMARY_LINK_HOVER);
    expect(primary).not.toContain(hover.NL_GHOST_HOVER);
    expect(ghost).toContain(hover.NL_GHOST_HOVER);
    expect(ghost).toContain(hover.CONTROL_LINE);
    expect(ghost).not.toMatch(/translate-y|halo/);
  });
});

describe('Button hover per variant', () => {
  it('primary: lift and halo through NL_PRIMARY_BUTTON_HOVER, enabled only', () => {
    const b = btn('primary');
    expect(b.className).toContain(hover.NL_PRIMARY_BUTTON_HOVER);
    expect(b.className).not.toContain(hover.NL_GHOST_HOVER);
    for (const c of hoverClasses(b)) expect(c).toMatch(/enabled:hover:|motion-reduce/);
  });

  it('ghost: NL_GHOST_HOVER and the Control Line at rest; nothing lifts or glows', () => {
    const b = btn('ghost');
    expect(b.className).toContain(hover.NL_GHOST_HOVER);
    expect(b.className).toContain('border-[color:var(--line-control)]');
    expect(b.className).not.toContain(hover.NL_PRIMARY_BUTTON_HOVER);
    expect(b.className).not.toMatch(/translate-y|halo/);
  });

  it('destructive: no hover rule at all (no lift, no halo, no recolour)', () => {
    expect(hoverClasses(btn('destructive'))).toEqual([]);
  });

  it('ghost-danger: Rust Soft on hover only, no lift, no halo', () => {
    const b = btn('ghost-danger');
    expect(b.className).not.toMatch(/translate-y|halo/);
    expect(hoverClasses(b)).toEqual([`${FINE}:enabled:hover:bg-[color:var(--err-light)]`]);
  });

  it('only primary carries a lift or halo, across every variant', () => {
    const variants: ButtonVariant[] = ['primary', 'ghost', 'destructive', 'ghost-danger'];
    const lifted = variants.filter((v) => {
      const c = btn(v).className;
      cleanupMounted();
      return /translate-y-px|shadow-nl-halo/.test(c);
    });
    expect(lifted).toEqual(['primary']);
  });

  it('a disabled or loading button keeps its hover rules gated off (disabled attribute set)', () => {
    for (const v of ['primary', 'ghost'] as const) {
      const d = btn(v, { disabled: true });
      expect(d.disabled).toBe(true);
      cleanupMounted();
      const l = btn(v, { loading: true });
      expect(l.disabled).toBe(true);
      expect(l.getAttribute('aria-busy')).toBe('true');
      cleanupMounted();
    }
    // The gates themselves: primary needs :enabled, ghost needs :not(:disabled).
    expect(btn('primary').className).toContain(':enabled:hover:');
    expect(btn('ghost').className).toContain(':[&:not(:disabled)]:hover:');
  });

  it('every variant is touch-manipulation (no double-tap zoom delay on phones)', () => {
    for (const v of ['primary', 'ghost', 'destructive', 'ghost-danger'] as const) {
      expect(cls(btn(v))).toContain('touch-manipulation');
      cleanupMounted();
    }
  });
});

describe('Dialog bottom sheet: 12px top radius and safe-area padding (AC3)', () => {
  const render = () =>
    mount(
      <Dialog
        open
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
        title="Cancel plan?"
        confirmLabel="Cancel plan"
        cancelLabel="Keep plan"
      />,
    );

  it('pads the bottom and both sides by the safe-area insets', () => {
    render();
    const c = cls(q('[role=dialog]')!);
    expect(c).toEqual(
      expect.arrayContaining([
        'pb-[calc(var(--space-6)+env(safe-area-inset-bottom,0px))]',
        'pl-[max(var(--space-6),env(safe-area-inset-left,0px))]',
        'pr-[max(var(--space-6),env(safe-area-inset-right,0px))]',
      ]),
    );
  });

  it('is a sheet at the bottom edge: 12px top radius, 90dvh cap, scrolls without chaining', () => {
    render();
    const c = cls(q('[role=dialog]')!);
    expect(c).toEqual(
      expect.arrayContaining([
        'inset-x-0',
        'bottom-0',
        'rounded-t-[12px]',
        'max-h-[90dvh]',
        'overflow-y-auto',
        'overscroll-contain',
      ]),
    );
  });

  it('from 641px the safe-area padding is reset and the dialog is centred', () => {
    render();
    const c = cls(q('[role=dialog]')!);
    expect(c).toEqual(
      expect.arrayContaining([
        'min-[641px]:p-nl-6',
        'min-[641px]:rounded-nl-md',
        'min-[641px]:left-1/2',
        'min-[641px]:top-1/2',
        'min-[641px]:bottom-auto',
      ]),
    );
  });
});

describe('Toast viewport safe-area padding (AC3)', () => {
  it('pads the bottom and both sides by the safe-area insets', () => {
    mount(
      <ToastProvider closeLabel="Close" viewportLabel="Notifications">
        <p>page</p>
      </ToastProvider>,
    );
    // Radix names the viewport region itself; find it by its fixed bottom-edge classes.
    const vp = qa('body *').find((e) => cls(e).includes('z-[100]')) as HTMLElement | undefined;
    expect(vp).toBeDefined();
    const c = cls(vp!);
    expect(c).toEqual(
      expect.arrayContaining([
        'pb-[calc(var(--space-4)+env(safe-area-inset-bottom,0px))]',
        'pl-[max(var(--space-4),env(safe-area-inset-left,0px))]',
        'pr-[max(var(--space-4),env(safe-area-inset-right,0px))]',
        'bottom-0',
        'inset-x-0',
      ]),
    );
  });
});
