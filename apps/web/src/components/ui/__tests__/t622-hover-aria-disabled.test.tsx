/**
 * @jest-environment node
 */
// T-622 (Rajesh gate): every button hover rule is also gated to `:not([aria-disabled=true])`, so a
// focusable but inert (aria-disabled) Button does not halo, lift or change ground on hover. The
// gate is static in the class string (CSS suppresses the hover), so an enabled Button carries the
// same classes. Part 2 compiles the classes with the repo's Tailwind and checks the CSS selector.
import path from 'path';

import { renderToStaticMarkup } from 'react-dom/server';

import { Button, type ButtonVariant } from '../Button';

const FINE = '[@media(hover:hover)_and_(pointer:fine)]';
const GATE = '[&:not([aria-disabled=true])]';
const VARIANTS: ButtonVariant[] = ['primary', 'ghost', 'destructive', 'ghost-danger'];

const classesOf = (variant: ButtonVariant, extra: Record<string, unknown> = {}) => {
  const html = renderToStaticMarkup(
    <Button variant={variant} {...extra}>
      x
    </Button>,
  );
  const tag = /<button\b[^>]*>/.exec(html)![0];
  const cls = /\bclass="([^"]*)"/.exec(tag)![1].replace(/&amp;/g, '&');
  return { tag, classes: cls.split(/\s+/).filter(Boolean) };
};
const hoverClasses = (classes: string[]) => classes.filter((c) => /(^|:)hover:/.test(c));

describe('T-622 Button hover gate: aria-disabled', () => {
  it.each(VARIANTS)(
    '%s: every hover class carries the aria-disabled gate after the pointer gate',
    (v) => {
      const { classes } = classesOf(v, { 'aria-disabled': 'true' });
      const hovers = hoverClasses(classes);
      expect(hovers.length).toBeGreaterThan(0);
      for (const c of hovers) {
        // motion-reduce: prefixes the primary lift reset; the pointer gate then the aria gate follow.
        expect(c.replace(/^motion-reduce:/, '')).toMatch(
          new RegExp(`^${FINE.replace(/[[\]()]/g, '\\$&')}:${GATE.replace(/[[\]()&]/g, '\\$&')}:`),
        );
      }
    },
  );

  it('aria-disabled="true" does not set the disabled attribute (stays focusable)', () => {
    for (const v of VARIANTS) {
      const { tag } = classesOf(v, { 'aria-disabled': 'true' });
      expect(tag).toContain('aria-disabled="true"');
      expect(tag).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });

  it('the exact gated hover classes per variant', () => {
    expect(hoverClasses(classesOf('primary', { 'aria-disabled': 'true' }).classes)).toEqual([
      `${FINE}:${GATE}:enabled:hover:shadow-nl-halo`,
      `${FINE}:${GATE}:enabled:hover:-translate-y-px`,
      `motion-reduce:${FINE}:${GATE}:enabled:hover:translate-y-0`,
    ]);
    expect(hoverClasses(classesOf('ghost', { 'aria-disabled': 'true' }).classes)).toEqual([
      `${FINE}:${GATE}:[&:not(:disabled)]:hover:border-nl-brass`,
      `${FINE}:${GATE}:[&:not(:disabled)]:hover:bg-nl-brass-light`,
    ]);
    expect(hoverClasses(classesOf('destructive', { 'aria-disabled': 'true' }).classes)).toEqual([
      `${FINE}:${GATE}:enabled:hover:bg-nl-ox-hi`,
    ]);
    expect(hoverClasses(classesOf('ghost-danger', { 'aria-disabled': 'true' }).classes)).toEqual([
      `${FINE}:${GATE}:enabled:hover:bg-[color:var(--err-light)]`,
    ]);
  });

  it('a normal enabled Button has the same gated classes (the gate is static; CSS suppresses hover)', () => {
    for (const v of VARIANTS) {
      const plain = classesOf(v);
      const inert = classesOf(v, { 'aria-disabled': 'true' });
      expect(hoverClasses(plain.classes)).toEqual(hoverClasses(inert.classes));
      expect(plain.classes.join(' ')).toContain(`${FINE}:${GATE}:`);
      expect(plain.tag).not.toContain(' aria-disabled=');
    }
  });
});

describe('T-622 the gate compiles with the repo Tailwind', () => {
  it('generates hover selectors that end in :not([aria-disabled=true])', async () => {
    const webRoot = path.resolve(__dirname, '../../../..');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const postcss = require('postcss');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tailwind = require('tailwindcss');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(path.join(webRoot, 'tailwind.config.js'));
    const files = ['hover.ts', 'Button.tsx'].map((f) => path.join(webRoot, 'src/components/ui', f));
    const out = await postcss([tailwind({ ...config, content: files })]).process(
      '@tailwind utilities;',
      { from: undefined },
    );
    type Node = {
      selector: string;
      parent?: Node & { type?: string; name?: string; params?: string };
    };
    const rules: Node[] = [];
    out.root.walkRules((r: Node) => rules.push(r));

    const GATE_END = ':not([aria-disabled=true])';
    const mediaOk = (r: Node) => {
      for (let n = r.parent; n; n = n.parent) {
        if (
          n.type === 'atrule' &&
          // Tailwind writes `@media(hover:hover) and ...` with no space, which postcss splits
          // into name `media(hover:hover)`; join name and params before matching.
          /^media\b/.test(n.name ?? '') &&
          /\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/.test(`${n.name} ${n.params}`)
        )
          return true;
      }
      return false;
    };
    // The class name is escaped CSS; the gated classes carry `aria-disabled` in the class part.
    const classPart = (s: string) => s.replace(/(?<!\\):(hover|enabled|not).*$/, '');
    const isGatedClass = (s: string) => s.includes('aria-disabled');

    const needles: Array<[string, boolean]> = [
      // [needle, has an ungated <a> form (NL_PRIMARY_LINK_HOVER)]
      ['hover\\:shadow-nl-halo', true],
      ['hover\\:-translate-y-px', true],
      ['hover\\:translate-y-0', true],
      ['hover\\:bg-nl-ox-hi', false],
      ['hover\\:border-nl-brass', false],
      ['hover\\:bg-nl-brass-light', false],
      ['hover\\:bg-\\[color\\:var\\(--err-light\\)\\]', false],
    ];
    for (const [needle, linkForm] of needles) {
      const matched = rules.filter((r) => r.selector.includes(needle));
      expect(matched.length).toBeGreaterThan(0);
      const gated = matched.filter((r) => isGatedClass(classPart(r.selector)));
      const ungated = matched.filter((r) => !isGatedClass(classPart(r.selector)));
      // (2) every gated-class rule ends with the gate, and (1) sits in the hover media block.
      expect(gated.length).toBeGreaterThan(0);
      for (const r of gated) {
        expect(r.selector.endsWith(GATE_END)).toBe(true);
        expect(mediaOk(r)).toBe(true);
      }
      // (3) a rule without the gate exists only for the <a> primary form: no :enabled, no
      // :disabled, i.e. it cannot be a button rule. Everything else must be gated.
      if (!linkForm) expect(ungated).toHaveLength(0);
      for (const r of ungated) {
        expect(r.selector).not.toMatch(/:enabled|:disabled/);
        expect(mediaOk(r)).toBe(true);
      }
      // Every button-form (`:enabled` or `:not(:disabled)`) rule is gated.
      for (const r of matched.filter((m) => /:enabled|:not\(:disabled\)/.test(m.selector))) {
        expect(r.selector.endsWith(GATE_END)).toBe(true);
      }
    }
  });
});
