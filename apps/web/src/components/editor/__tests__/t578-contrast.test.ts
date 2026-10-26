// T-578 (Ajay's ruling): the muted note lines need 4.5:1. Reads the real token values from the CSS
// that defines them (app/globals.css) and computes WCAG 2.x contrast. No colour is typed here.
import fs from 'fs';
import path from 'path';

const CSS = fs.readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf8');

/** The declarations of the first rule whose selector (trimmed, whitespace-collapsed) matches. */
function block(selectorStart: string): string {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS))) {
    const sel = m[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (sel.startsWith(selectorStart)) return m[2];
  }
  throw new Error(`no rule starting with ${selectorStart}`);
}
function token(rule: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(rule);
  if (!m) throw new Error(`no ${name} in rule`);
  return m[1];
}
function lin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const day = block(".nl, html[data-theme='daylight'] .nl");
const night = block("html[data-theme='night'] .nl");
const MIN = 4.5;

describe('contrast helper', () => {
  it('is 21 for black on white and 1 for equal colours', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe.each([
  ['Daylight', day],
  ['Night', night],
])('T-578 muted text contrast, %s', (_name, rule) => {
  const muted = token(rule, '--muted');
  it('muted on the Wall ground (the notes row, the focus footer) is at least 4.5:1', () => {
    expect(contrast(muted, token(rule, '--bg-wall'))).toBeGreaterThanOrEqual(MIN);
  });
  it('muted on the Card fill (the Annexures help line) is at least 4.5:1', () => {
    expect(contrast(muted, token(rule, '--bg-card'))).toBeGreaterThanOrEqual(MIN);
  });
});
