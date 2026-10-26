// T-601 (g): WCAG contrast of every text/background pair the landing uses, read from the tokens in
// app/globals.css (no colour typed here), Daylight and Night. Text >= 4.5, required boundaries >= 3.
// The three pairs the developer flagged are recorded in the output and asserted at their measured
// value, never failed on. The SAMPLE watermark is decoration (aria-hidden) and is excluded.
import fs from 'fs';
import path from 'path';

const CSS = fs.readFileSync(path.resolve(__dirname, '../../../../app/globals.css'), 'utf8');

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
const lin = (c: number) =>
  c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4;
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const THEMES = [
  ['Daylight', block(".nl, html[data-theme='daylight'] .nl")],
  ['Night', block("html[data-theme='night'] .nl")],
] as const;

// [text token, ground token]: every text colour the landing puts on a ground.
const TEXT_ON: [string, string][] = [
  ['--text', '--bg-wall'],
  ['--text', '--bg-wood'],
  ['--text', '--bg-card'],
  ['--text', '--brass-light'], // open drawer fill
  ['--text-soft', '--bg-wall'],
  ['--text-soft', '--bg-wood'],
  ['--text-soft', '--bg-card'],
  ['--muted', '--bg-wall'],
  ['--muted', '--bg-wood'], // eyebrows and the coverage lead sit on Wood (flagged: 4.52 in Daylight)
  ['--muted', '--bg-card'], // sample eyebrow, drawer count
  ['--brass-dark', '--bg-wall'], // links, step numerals
  ['--brass-dark', '--bg-card'], // panel header
  ['--brass-dark', '--bg-wood'],
  ['--brass-dark', '--brass-light'], // panel header text on an open drawer
  ['--brass', '--brass-light'], // brass text on Brass Soft (flagged: 4.51 in Daylight)
  ['--on-brass', '--brass'], // the primary button
];

describe.each(THEMES)('%s text contrast >= 4.5:1', (_n, rule) => {
  it.each(TEXT_ON)('%s on %s', (fg, bg) => {
    const r = ratio(token(rule, fg), token(rule, bg));
    expect({ pair: `${fg} on ${bg}`, ok: r >= 4.5 }).toEqual({ pair: `${fg} on ${bg}`, ok: true });
  });
});

describe.each(THEMES)('%s required non-text boundaries >= 3:1', (_n, rule) => {
  // Controls that are identified by their border alone: the ghost button border on the Wall, the
  // drawer border on the Card fill of the page that is not Wood. (Drawer on Wood is recorded below.)
  it.each([
    ['--line-control', '--bg-wall'],
    ['--line-control', '--bg-card'],
  ])('%s on %s', (fg, bg) => {
    expect(ratio(token(rule, fg), token(rule, bg))).toBeGreaterThanOrEqual(3);
  });
});

describe('flagged pairs (recorded, not failed)', () => {
  const day = THEMES[0][1];
  const night = THEMES[1][1];
  const rows = [
    ['Muted on Wood, Daylight', ratio(token(day, '--muted'), token(day, '--bg-wood'))],
    ['Brass on Brass Soft, Daylight', ratio(token(day, '--brass'), token(day, '--brass-light'))],
    [
      'Control Line on Wood, Daylight',
      ratio(token(day, '--line-control'), token(day, '--bg-wood')),
    ],
    ['Muted on Wood, Night', ratio(token(night, '--muted'), token(night, '--bg-wood'))],
    ['Brass on Brass Soft, Night', ratio(token(night, '--brass'), token(night, '--brass-light'))],
    [
      'Control Line on Wood, Night',
      ratio(token(night, '--line-control'), token(night, '--bg-wood')),
    ],
  ] as const;

  it('prints the numbers and holds the measured values the developer reported', () => {
    // eslint-disable-next-line no-console
    console.info(rows.map(([k, v]) => `${k}: ${v.toFixed(2)}`).join('\n'));
    expect(rows[0][1]).toBeCloseTo(4.52, 1);
    expect(rows[1][1]).toBeCloseTo(4.51, 1);
    expect(rows[2][1]).toBeCloseTo(2.88, 1);
  });
});
