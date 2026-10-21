// T-524: text guard for globals.css (tokens, selection, caret, forced colours) plus the WCAG
// ratios computed from the hex values in the file (not quoted from a spec).
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '..', 'globals.css'), 'utf8');

/** The text between the braces of the first `header { ... }` found at or after `from`. */
function block(source: string, header: string, from = 0): string {
  const at = source.indexOf(header, from);
  if (at < 0) throw new Error(`missing: ${header}`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced: ${header}`);
}

const components = block(css, '@layer components');
const daylight = block(css, ".nl,\nhtml[data-theme='daylight'] .nl");
const night = block(css, "html[data-theme='night'] .nl {");
const tok = (b: string, name: string) =>
  new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(b)?.[1].toLowerCase();

describe('globals.css tokens', () => {
  it.each([
    ['--brass', '#866619'],
    ['--muted', '#5c685f'],
    ['--ok', '#1b7658'],
    ['--brass-mark', '#e6c877'],
  ])('Daylight %s is %s', (name, hex) => {
    expect(tok(daylight, name)).toBe(hex);
  });

  it.each([
    ['--brass', '#c9a24a'],
    ['--muted', '#8e9a8e'],
    ['--ok', '#7fcfa8'],
    ['--brass-mark', '#c9a24a'],
    ['--bg-wall', '#0e1a17'],
    ['--bg-card', '#182a24'],
    ['--text', '#efe7d4'],
    ['--on-brass', '#15241f'],
    ['--ox', '#7a2a2a'],
  ])('Night %s is %s (unchanged)', (name, hex) => {
    expect(tok(night, name)).toBe(hex);
  });

  it('Daylight keeps the other tokens it had', () => {
    expect(tok(daylight, '--bg-wall')).toBe('#f3efe4');
    expect(tok(daylight, '--bg-card')).toBe('#fbf8f0');
    expect(tok(daylight, '--on-brass')).toBe('#ffffff');
    expect(tok(daylight, '--ox')).toBe('#8e2f2f');
    expect(tok(daylight, '--ok-light')).toBe('#ddf2e8');
  });

  it('the old failing Daylight values are gone', () => {
    for (const old of ['#9c7a2b', '#6d7a73', '#1e7f5f'])
      expect(daylight.toLowerCase()).not.toContain(old);
  });

  it('the tokens stay scoped to .nl, never :root / html alone', () => {
    expect(css).not.toMatch(/(^|\n)\s*(:root|html)\s*\{[^}]*--brass-mark/);
  });
});

describe('globals.css browser surfaces live in @layer components', () => {
  it('has the .nl caret colour on Brass', () => {
    expect(components).toMatch(/\.nl\s*\{\s*caret-color:\s*var\(--brass\);\s*\}/);
  });

  it('has Daylight and Night ::selection backgrounds, literal hex, text colour untouched', () => {
    const day = block(components, '.nl::selection,\n  .nl ::selection');
    expect(day).toMatch(/background-color:\s*#f3e9c8;/i);
    const nightSel = block(components, "html[data-theme='night'] .nl::selection");
    expect(nightSel).toMatch(/background-color:\s*#332a14;/i);
    expect(day).not.toMatch(/(^|[\s;])color:/);
    expect(nightSel).not.toMatch(/(^|[\s;])color:/);
  });

  it('puts a CanvasText border on .nl-skeleton under forced-colors', () => {
    const fc = block(components, '@media (forced-colors: active)');
    expect(fc).toMatch(/\.nl-skeleton\s*\{[^}]*border:\s*1px solid CanvasText;/);
  });

  it('none of the new rules sit outside the layer', () => {
    const outside = css.replace(components, '');
    for (const needle of ['caret-color', '::selection', 'forced-colors'])
      expect(outside).not.toContain(needle);
  });

  it('.nl-root and the nl component rules are still layered', () => {
    expect(components).toContain('.nl-root {');
    expect(components).toContain("html[data-theme='night'] .nl-root {");
    expect(components).toContain('.nl-skeleton {');
    expect(components).toContain('animation: nl-skeleton-pulse');
    expect(components).toContain('@media (prefers-reduced-motion: reduce)');
    // the reduced-motion rule still turns the skeleton animation off
    const rm = block(components, '@media (prefers-reduced-motion: reduce)');
    expect(rm).toMatch(/\.nl-skeleton,[\s\S]*animation:\s*none;/);
    expect(css.replace(components, '')).not.toContain('.nl-root {');
  });

  it('the file has balanced braces', () => {
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length);
  });
});

function lum(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('WCAG contrast from the hex in globals.css', () => {
  const d = (n: string) => tok(daylight, n)!;
  const n = (name: string) => tok(night, name)!;

  it.each([
    ['Daylight on-brass text on brass fill (button)', d('--on-brass'), d('--brass'), 4.5],
    ['Daylight brass text on Wall', d('--brass'), d('--bg-wall'), 4.5],
    ['Daylight brass text on Card', d('--brass'), d('--bg-card'), 4.5],
    ['Daylight muted on Wall', d('--muted'), d('--bg-wall'), 4.5],
    ['Daylight muted on Card', d('--muted'), d('--bg-card'), 4.5],
    ['Daylight muted on Wood', d('--muted'), d('--bg-wood'), 4.5],
    ['Daylight ok on ok-light (chip)', d('--ok'), d('--ok-light'), 4.5],
    ['Daylight ok on Card', d('--ok'), d('--bg-card'), 4.5],
    ['Daylight brass-mark on oxblood (non-text mark)', d('--brass-mark'), d('--ox'), 3],
    ['Night brass-mark on oxblood (non-text mark)', n('--brass-mark'), n('--ox'), 3],
    ['Night muted on Wall', n('--muted'), n('--bg-wall'), 4.5],
    ['Night on-brass on brass', n('--on-brass'), n('--brass'), 4.5],
    // Rajesh's ruling: the spine seal's inner ring is --ox (full opacity) on the --brass-mark disc.
    ['Daylight seal ring (--ox) on the brass-mark disc', d('--ox'), d('--brass-mark'), 3],
    ['Night seal ring (--ox) on the brass-mark disc', n('--ox'), n('--brass-mark'), 3],
  ])('%s >= %s', (_l, fg, bg, min) => {
    expect(ratio(fg as string, bg as string)).toBeGreaterThanOrEqual(min as number);
  });

  it('seal ring contrast matches the developer figures (4.96 Daylight, 3.99 Night)', () => {
    expect(ratio(d('--ox'), d('--brass-mark'))).toBeCloseTo(4.96, 1);
    expect(ratio(n('--ox'), n('--brass-mark'))).toBeCloseTo(3.99, 1);
  });
});
