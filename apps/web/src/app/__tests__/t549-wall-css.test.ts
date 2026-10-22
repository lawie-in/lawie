// T-549 item 2 and item 7 (CSS part): the Wall ground on html, and the overflow: clip fallback.
// globals.css is read as text (jsdom does not apply it), as t531-viewport-and-css does.
import { readFileSync } from 'fs';
import { join } from 'path';

import { THEME_COLOR } from '@/components/shell/theme';

const raw = readFileSync(join(__dirname, '..', 'globals.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
// Collapse whitespace to single spaces (never delete it: `#main .nl-root` is a descendant
// selector and must not become `#main.nl-root`), then trim around braces, semicolons and after : and ,.
const squash = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/([:,])\s+/g, '$1')
    .trim();
const flat = squash(css);

function blockEnd(source: string, from: number) {
  const open = source.indexOf('{', from);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced');
}

const firstBase = css.indexOf('@layer base');
const secondBase = css.indexOf('@layer base', firstBase + 1);
const secondBaseEnd = blockEnd(css, secondBase);

const DAY = squash(
  `html:has(#main .nl-root) { background-color: ${THEME_COLOR.daylight.toLowerCase()}; }`,
);
const NIGHT = squash(
  `html[data-theme='night']:has(#main .nl-root) { background-color: ${THEME_COLOR.night.toLowerCase()}; }`,
);
const BODY = squash('html:has(#main .nl-root) body { background-color: transparent; }');

describe('T-549 Wall ground rules', () => {
  it('globals.css still has two @layer base blocks', () => {
    expect(firstBase).toBeGreaterThanOrEqual(0);
    expect(secondBase).toBeGreaterThan(firstBase);
    expect(css.indexOf('@layer base', secondBase + 1)).toBe(-1);
  });

  it('the three rules exist, with hex equal to THEME_COLOR', () => {
    expect(flat).toContain(DAY);
    expect(flat).toContain(NIGHT);
    expect(flat).toContain(BODY);
  });

  it('the three rules sit inside (or after) the second @layer base, never in the first', () => {
    const inFirst = squash(css.slice(firstBase, blockEnd(css, firstBase)));
    for (const rule of [DAY, NIGHT, BODY]) expect(inFirst).not.toContain(rule);
    const fromSecond = squash(css.slice(secondBase));
    for (const rule of [DAY, NIGHT, BODY]) expect(fromSecond).toContain(rule);
    // and today they are inside the second block
    const inSecond = squash(css.slice(secondBase, secondBaseEnd));
    for (const rule of [DAY, NIGHT, BODY]) expect(inSecond).toContain(rule);
  });

  it('the second block still opens with the scroll rules t531 pins (no block inserted before them)', () => {
    const inSecond = squash(css.slice(secondBase, secondBaseEnd));
    expect(inSecond.indexOf('html{scroll-behavior:smooth;}')).toBeLessThan(inSecond.indexOf(DAY));
  });

  it('the hex values are lower-case literals that match THEME_COLOR ignoring case', () => {
    expect(THEME_COLOR.daylight.toLowerCase()).toBe('#f3efe4');
    expect(THEME_COLOR.night.toLowerCase()).toBe('#0e1a17');
  });

  it('is scoped to pages with a Night root inside #main, so portals and legacy pages keep their ground', () => {
    const rules = [...css.matchAll(/(html[^{}]*:has\([^{}]*\)[^{}]*)\{/g)]
      .map((m) => squash(m[1]))
      // the consent-card Daylight pin (tested below) is a :has(.mk) token rule, not a Wall rule
      .filter((sel) => !sel.includes('data-consent-card'));
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const sel of rules) {
      expect(sel).toContain(':has(#main .nl-root)');
      expect(sel).not.toContain('#main.nl-root');
    }
    // no bare html or body background
    expect(flat).not.toMatch(/(^|[};])html\{[^}]*background/);
    expect(flat).not.toMatch(/(^|[};])html\[data-theme='night'\]\{[^}]*background/);
  });

  it('the Night wall rule sets no color-scheme (the .nl-root subtree owns it)', () => {
    expect(NIGHT).not.toContain('color-scheme');
    expect(NIGHT).toBe(
      squash(
        `html[data-theme='night']:has(#main .nl-root) { background-color: ${THEME_COLOR.night.toLowerCase()}; }`,
      ),
    );
    expect(flat).not.toMatch(/:has\(#main \.nl-root\)[^{}]*\{[^}]*color-scheme/);
  });

  it('the whitespace guard is real: the squashed selector keeps the descendant space', () => {
    expect(DAY).toContain('html:has(#main .nl-root)');
    expect(DAY).not.toContain('#main.nl-root');
  });

  it('defines no tokens on html or :root (the t524 guard)', () => {
    for (const rule of [DAY, NIGHT, BODY]) expect(rule).not.toMatch(/\{[^}]*--[a-z]/);
    // every html / :root rule in the file declares no custom property inside the wall rules
    const wallDecls = [...css.matchAll(/(html[^{}]*:has\(#main[^{}]*\)[^{}]*)\{([^{}]*)\}/g)].map(
      (m) => m[2],
    );
    for (const d of wallDecls) expect(d).not.toContain('--');
  });
});

describe('T-549 overflow: clip fallback', () => {
  const at = css.indexOf('@supports not (overflow: clip)');
  const body = at < 0 ? '' : css.slice(css.indexOf('{', at) + 1, blockEnd(css, at));

  it('exists exactly once', () => {
    expect(at).toBeGreaterThan(-1);
    expect(css.indexOf('@supports not (overflow: clip)', at + 1)).toBe(-1);
  });

  it('targets html only and sets overflow-x: hidden', () => {
    expect(squash(body)).toBe('html{overflow-x:hidden;}');
  });

  it('never targets body, #main or a wrapper (body would become the scroll container and break sticky)', () => {
    expect(body).not.toMatch(/\bbody\b/);
    expect(body).not.toMatch(/#main|\.nl-root|\.mk/);
    expect(body.match(/\{/g)).toHaveLength(1);
  });

  it('sits inside the second @layer base', () => {
    expect(at).toBeGreaterThan(secondBase);
    expect(at).toBeLessThan(secondBaseEnd);
  });

  it('no other rule sets overflow-x: hidden on html or body in this file', () => {
    expect(flat).not.toMatch(/(^|[};])body\{[^}]*overflow-x:hidden/);
    expect(flat.match(/html\{overflow-x:hidden;\}/g)).toHaveLength(1);
  });
});

// T-549 round 2 (Rajesh M1): the consent card is pinned to Daylight on legacy .mk pages.
describe('T-549 consent card Daylight pin (globals.css)', () => {
  const PIN_SELECTOR = squash(
    'html:has(.mk) [data-consent-card].nl, html:has(.mk) [data-consent-card] .nl',
  );

  /** Every leaf rule (no nested braces) as [selector list, declarations, start index]. */
  const leafRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (m) => [squash(m[1]), m[2], m.index ?? 0] as const,
  );
  const props = (decls: string) =>
    Object.fromEntries(
      [...decls.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );

  const pin = leafRules.find(([sel]) => sel === PIN_SELECTOR);
  const daylight = leafRules.find(
    ([sel]) => sel === squash(".nl, html[data-theme='daylight'] .nl"),
  );

  /** [start, end) of every `@layer components` block. */
  const componentLayers: Array<[number, number]> = [];
  for (
    let at = css.indexOf('@layer components');
    at >= 0;
    at = css.indexOf('@layer components', at + 1)
  ) {
    componentLayers.push([at, blockEnd(css, at)]);
  }
  const inComponents = (i: number) => componentLayers.some(([a, b]) => i > a && i < b);

  it('finds both the pin block and the Daylight .nl block', () => {
    expect(pin).toBeDefined();
    expect(daylight).toBeDefined();
    expect(Object.keys(props(daylight![1])).length).toBeGreaterThan(30);
  });

  it('drift guard: the pin has the same custom property names and values as Daylight .nl', () => {
    const p = props(pin![1]);
    const d = props(daylight![1]);
    expect(Object.keys(p).sort()).toEqual(Object.keys(d).sort());
    expect(p).toEqual(d);
  });

  it('the pin defines --line-control as the Daylight value, as the third definition in the file', () => {
    const all = [...css.matchAll(/--line-control\s*:\s*([^;]+);/g)];
    expect(all).toHaveLength(3);
    const third = all[2];
    expect(third[1].trim()).toBe('#8a8476');
    expect(third.index!).toBeGreaterThan(pin![2]);
    expect(third.index!).toBeLessThan(pin![2] + pin![0].length + pin![1].length + 2);
    expect(props(pin![1])['--line-control']).toBe(props(daylight![1])['--line-control']);
  });

  it('the pin is a block of its own, outside every @layer, with both selectors', () => {
    expect(pin![0]).toContain('[data-consent-card].nl');
    expect(pin![0]).toContain('[data-consent-card] .nl');
    // unlayered: it must beat the Night block (0,2,1) by specificity, not by layer order
    const before = css.slice(0, pin![2]);
    expect((before.match(/\{/g) ?? []).length).toBe((before.match(/\}/g) ?? []).length);
  });

  it('the pin selectors are not in the shared Daylight or Night selector lists', () => {
    expect(daylight![0]).not.toContain('data-consent-card');
    expect(daylight![0]).not.toContain(':has(');
    const night = leafRules.find(([sel]) => sel === "html[data-theme='night'] .nl");
    expect(night).toBeDefined();
    expect(night![0]).not.toContain('data-consent-card');
    expect(night![0]).not.toContain(':has(');
  });

  it('no :has( in any selector list that defines tokens, except the pin on its own', () => {
    const tokenRules = leafRules.filter(([, decls]) => /--bg-card\s*:/.test(decls));
    expect(tokenRules.length).toBeGreaterThanOrEqual(3);
    for (const [sel] of tokenRules) {
      if (sel === PIN_SELECTOR) continue;
      expect(sel).not.toContain(':has(');
    }
    // a :has() selector never shares a list with a non-:has() one in a token rule
    expect(tokenRules.filter(([sel]) => sel.includes(':has(')).map(([sel]) => sel)).toEqual([
      PIN_SELECTOR,
    ]);
  });

  it('the pinned ::selection is #f3e9c8, in @layer components, for both card selectors', () => {
    const sel = leafRules.filter(
      ([s]) => s.includes('[data-consent-card]') && s.includes('::selection'),
    );
    expect(sel).toHaveLength(1);
    const [selector, decls, at] = sel[0];
    expect(selector).toContain('html:has(.mk) [data-consent-card].nl ::selection');
    expect(selector).toContain('html:has(.mk) [data-consent-card] .nl::selection');
    expect(squash(decls)).toBe('background-color:#f3e9c8;');
    expect(inComponents(at)).toBe(true);
  });

  it('the [data-consent-card] h2 reset is inside @layer components', () => {
    const h2 = leafRules.filter(([s]) => s === '[data-consent-card] h2');
    expect(h2).toHaveLength(1);
    expect(squash(h2[0][1])).toBe('letter-spacing:normal;text-wrap:wrap;');
    expect(inComponents(h2[0][2])).toBe(true);
  });
});
