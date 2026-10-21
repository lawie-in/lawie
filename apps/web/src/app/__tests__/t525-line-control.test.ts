// T-525 round 3: --line-control token (WCAG 1.4.11 boundary of operable controls) in globals.css,
// contrast computed from the hex in the file, and class guards that controls use it at rest
// while cards and dividers keep --line.
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const css = read('app/globals.css');

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
const daylight = block(css, ".nl,\nhtml[data-theme='daylight'] .nl");
const night = block(css, "html[data-theme='night'] .nl {");
const tok = (b: string, name: string) =>
  new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(b)?.[1].toLowerCase();

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

describe('--line-control token', () => {
  it('Daylight is #8a8476 and Night is #6b7c74, each in its own .nl scope', () => {
    expect(tok(daylight, '--line-control')).toBe('#8a8476');
    expect(tok(night, '--line-control')).toBe('#6b7c74');
  });

  it('is defined exactly twice in the file, never on :root / html alone, never in a layer', () => {
    expect(css.match(/--line-control\s*:/g)).toHaveLength(2);
    expect(css).not.toMatch(/(^|\n)\s*(:root|html)\s*\{[^}]*--line-control/);
    const layer = block(css, '@layer components');
    expect(layer).not.toMatch(/--line-control\s*:/);
  });

  it('--line is unchanged for cards and dividers (and differs from the control line)', () => {
    expect(tok(daylight, '--line')).toBe('#d9d1be');
    expect(tok(night, '--line')).toBe('#2a3c35');
    expect(tok(daylight, '--line-control')).not.toBe(tok(daylight, '--line'));
    expect(tok(night, '--line-control')).not.toBe(tok(night, '--line'));
  });

  it.each([
    ['Daylight', daylight, 'Card'],
    ['Daylight', daylight, 'Wall'],
    ['Night', night, 'Card'],
    ['Night', night, 'Wall'],
  ])('%s control line against %s is at least 3:1 (WCAG 1.4.11)', (_t, b, surface) => {
    const bg = tok(b, surface === 'Card' ? '--bg-card' : '--bg-wall')!;
    expect(ratio(tok(b, '--line-control')!, bg)).toBeGreaterThanOrEqual(3);
  });

  it('the surfaces are the values the brief names', () => {
    expect(tok(daylight, '--bg-card')).toBe('#fbf8f0');
    expect(tok(daylight, '--bg-wall')).toBe('#f3efe4');
    expect(tok(night, '--bg-card')).toBe('#182a24');
    expect(tok(night, '--bg-wall')).toBe('#0e1a17');
  });

  it('Wood contrast is recorded for information only (not asserted)', () => {
    const d = ratio(tok(daylight, '--line-control')!, tok(daylight, '--bg-wood')!);
    const n = ratio(tok(night, '--line-control')!, tok(night, '--bg-wood')!);
    // eslint-disable-next-line no-console
    console.info(
      `NOTE --line-control on Wood: Daylight ${d.toFixed(2)}:1, Night ${n.toFixed(2)}:1`,
    );
    expect(Number.isFinite(d) && Number.isFinite(n)).toBe(true);
  });
});

const CTRL = 'border-[color:var(--line-control)]';

describe('controls use the control line at rest', () => {
  it.each([
    'components/ui/Field.tsx',
    'components/ui/Button.tsx',
    'components/shell/ThemeToggle.tsx',
    'components/settings/SettingsTabs.tsx',
    'components/billing/GstStatePicker.tsx',
  ])('%s uses --line-control and no longer border-nl-line', (f) => {
    const s = read(f);
    expect(s).toContain(CTRL);
    expect(s).not.toContain('border-nl-line');
  });

  it('Field: Input and Textarea share one rest border; error and focus borders unchanged', () => {
    const s = read('components/ui/Field.tsx');
    expect(s).toContain(`invalid ? 'border-nl-err' : '${CTRL} focus:border-nl-brass'`);
  });

  it('Button: ghost has the control border; primary does not borrow it', () => {
    const s = read('components/ui/Button.tsx');
    expect(s).toMatch(new RegExp(`ghost:\\s*'[^']*border ${CTRL.replace(/[[\]()]/g, '\\$&')}`));
    expect(s).toMatch(/primary:\s*'[^']*'/);
    expect(/primary:\s*'([^']*)'/.exec(s)![1]).not.toContain('line-control');
  });

  it('ThemeToggle frame and SettingsTabs tablist rule', () => {
    expect(read('components/shell/ThemeToggle.tsx')).toMatch(
      /inline-flex border border-\[color:var\(--line-control\)\]/,
    );
    expect(read('components/settings/SettingsTabs.tsx')).toMatch(
      /role="tablist"|border-b border-\[color:var\(--line-control\)\]/,
    );
    expect(read('components/settings/SettingsTabs.tsx')).toContain(`border-b ${CTRL}`);
  });

  it('TopUpModal: unselected pack card and coupon input use it; dialog shell, divider and footer keep --line', () => {
    const s = read('components/credits/TopUpModal.tsx');
    expect(s).toContain(`'hover:bg-nl-brass-light ${CTRL}'`);
    expect(s).toMatch(
      /placeholder="Coupon code \(optional\)"[\s\S]*?className="[^"]*h-11 w-full border border-\[color:var\(--line-control\)\]/,
    );
    expect(s).toMatch(/'nl nl-root border-nl-line bg-nl-card[^']*fixed z-50/);
    expect(s).toContain('border-nl-line px-nl-6 pb-nl-4 pt-nl-4 border-t');
    expect(s).toMatch(/<footer className="[^"]*border-nl-line[^"]*border-t"/);
    // the selected pack keeps the brass border
    expect(s).toContain("'border-nl-brass bg-nl-brass-light'");
  });

  it('SectionFinderPanel: controls use it; cards, header and dividers keep --line', () => {
    const s = read('components/sections/SectionFinderPanel.tsx');
    // tablist rule, search input, row buttons, chips, copy/bookmark icon buttons
    expect(s).toContain(`className="px-nl-3 flex border-b ${CTRL}"`);
    expect(s).toMatch(/type="search"[\s\S]{0,600}border border-\[color:var\(--line-control\)\]/);
    expect(
      s.match(/ROW_BUTTON,\s*'justify-between border border-\[color:var\(--line-control\)\]'/g),
    ).toHaveLength(2);
    expect(s).toMatch(/rounded-nl-pill[^"]*border-\[color:var\(--line-control\)\]/);
    expect(s.match(/ICON_BUTTON, 'border border-\[color:var\(--line-control\)\]'/g)).toHaveLength(
      2,
    );
    expect(s).toContain('border border-r-0 border-[color:var(--line-control)] xl:flex'); // the rail
    // aside, header, cards and dividers stay on --line
    expect(s).toMatch(/'nl border-nl-line bg-nl-card text-nl-text font-nl-body fixed z-40/);
    expect(s).toContain(
      'border-nl-line py-nl-3 pl-nl-5 pr-nl-2 flex items-start justify-between border-b',
    );
    expect(s).toContain('<div className="border-nl-line border">');
    expect(s).toContain('<div className="border-nl-line p-nl-3 border">');
    expect(s).toContain('gap-nl-1 border-nl-line flex items-center justify-between border-b');
    expect(s).toContain('bg-nl-card px-nl-5 py-nl-3 sticky bottom-0 flex items-center border-t');
  });

  it('every hover: utility in SectionFinderPanel is gated to hover-capable fine pointers', () => {
    const src = read('components/sections/SectionFinderPanel.tsx');
    const ungated = src.match(/(^|[\s'"`])hover:[\w[-]/gm) ?? [];
    expect(ungated).toEqual([]);
    const gated = src.match(/\[@media\(hover:hover\)_and_\(pointer:fine\)\]:hover:/g) ?? [];
    expect(gated.length).toBeGreaterThanOrEqual(9);
  });
});
