// T-549 item 2 and item 7 (CSS part): the Wall ground on html, and the overflow: clip fallback.
// globals.css is read as text (jsdom does not apply it), as t531-viewport-and-css does.
import { readFileSync } from 'fs';
import { join } from 'path';

import { THEME_COLOR } from '@/components/shell/theme';

const raw = readFileSync(join(__dirname, '..', 'globals.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const squash = (s: string) => s.replace(/\s+/g, '');
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
  `html:has(#main .nl-root){background-color:${THEME_COLOR.daylight.toLowerCase()};}`,
);
const NIGHT = squash(
  `html[data-theme='night']:has(#main .nl-root){background-color:${THEME_COLOR.night.toLowerCase()};color-scheme:dark;}`,
);
const BODY = squash('html:has(#main .nl-root) body{background-color:transparent;}');

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
    const rules = [...css.matchAll(/(html[^{}]*:has\([^{}]*\)[^{}]*)\{/g)].map((m) => squash(m[1]));
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const sel of rules) expect(sel).toContain(':has(#main.nl-root)');
    // no bare html or body background
    expect(flat).not.toMatch(/(^|[};])html\{[^}]*background/);
    expect(flat).not.toMatch(/(^|[};])html\[data-theme='night'\]\{[^}]*background/);
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
