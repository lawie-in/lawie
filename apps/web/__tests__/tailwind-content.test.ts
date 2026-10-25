/**
 * @jest-environment node
 */
// T-528 follow-up: guard for the Tailwind build. A test file once held an interpolated arbitrary
// min- breakpoint; Tailwind scanned it, warned that min-/max- variants are "not supported with a
// `screens` configuration containing mixed units", and dropped every arbitrary min-/max-
// breakpoint from the CSS (no 720, 900 or 1120 rules). This compiles the real globals.css with the
// real tailwind.config.js and checks the rules are there and the warning is not printed.
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';

const WEB_DIR = path.resolve(__dirname, '..');
const CONFIG = path.join(WEB_DIR, 'tailwind.config.js');

interface BuildResult {
  media: Record<string, string[]>;
  warnings: string[];
}

// Tailwind's logger is a no-op when JEST_WORKER_ID is set, so the warning cannot be seen in-process.
// Compile in a plain Node child without that variable and report the media rules and the warnings.
// TW_EXTRA_RAW adds one raw content entry (used only by the control case below).
const SCRIPT = `
const fs = require('fs');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const warnings = [];
console.warn = (...a) => warnings.push(a.map(String).join(' '));
const cfg = require(${JSON.stringify(CONFIG)});
if (process.env.TW_EXTRA_RAW) cfg.content = [...cfg.content, { raw: process.env.TW_EXTRA_RAW }];
const from = ${JSON.stringify(path.join(WEB_DIR, 'src/app/globals.css'))};
postcss([tailwindcss(cfg)]).process(fs.readFileSync(from, 'utf8'), { from }).then((r) => {
  for (const w of r.warnings()) warnings.push(String(w));
  const media = {};
  r.root.walkAtRules('media', (at) => {
    at.walkRules((rule) => { (media[at.params] = media[at.params] || []).push(rule.selector); });
  });
  process.stdout.write(JSON.stringify({ media, warnings }));
}).catch((e) => { process.stderr.write(String(e && e.stack || e)); process.exit(1); });
`;

function build(extraRaw?: string): BuildResult {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.JEST_WORKER_ID;
  if (extraRaw) env.TW_EXTRA_RAW = extraRaw;
  else delete env.TW_EXTRA_RAW;
  const out = execFileSync(process.execPath, ['-e', SCRIPT], {
    cwd: WEB_DIR,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as BuildResult;
}

const MIXED_UNITS = /containing mixed units/;
// The arbitrary breakpoints the Night Library components use (720, 900, 1120: T-511/T-528).
const BREAKPOINTS = [720, 900, 1120];

// Selectors from arbitrary-breakpoint utilities (escaped `.min-\[720px\]\:...`) under the rule.
const arbitrarySelectors = (r: BuildResult, px: number) =>
  (r.media[`(min-width: ${px}px)`] ?? []).filter((s) => s.startsWith(`.min-\\[${px}px\\]\\:`));

describe('Tailwind build (real config + globals.css)', () => {
  let real: BuildResult;

  beforeAll(() => {
    real = build();
  }, 60_000);

  it('does not print the "mixed units" warning', () => {
    expect(real.warnings.filter((w) => MIXED_UNITS.test(w))).toEqual([]);
  });

  it.each(BREAKPOINTS)('has min-[%ipx] utilities under their min-width media rule', (px) => {
    expect(arbitrarySelectors(real, px).length).toBeGreaterThan(0);
  });

  it('has the nav landmark gate (flex) from 1120px', () => {
    expect(real.media['(min-width: 1120px)']).toContain('.min-\\[1120px\\]\\:flex');
  });

  it('control: one interpolated min- candidate brings the warning and drops the rules', () => {
    // Built by concatenation so this file never holds the bad token itself.
    const bad = build('min-[' + '$' + '{bp}px]:inline-flex');
    expect(bad.warnings.some((w) => MIXED_UNITS.test(w))).toBe(true);
    for (const px of BREAKPOINTS) expect(arbitrarySelectors(bad, px)).toEqual([]);
  }, 60_000);

  it('control: an interpolated max- candidate also brings the warning and drops the rules', () => {
    const bad = build('max-[' + '$' + '{bp}px]:hidden');
    expect(bad.warnings.some((w) => MIXED_UNITS.test(w))).toBe(true);
    for (const px of BREAKPOINTS) expect(arbitrarySelectors(bad, px)).toEqual([]);
  }, 60_000);
});

describe('Tailwind content globs', () => {
  // Tailwind 3 resolves `content` with fast-glob (its own dependency), positive and `!` globs together.
  // createRequire (not `require`) to reach modules through tailwindcss's own dependency tree.
  const twRequire = createRequire(require.resolve('tailwindcss/package.json'));
  const fg = twRequire('fast-glob') as {
    sync: (patterns: string[], opts: { absolute: boolean }) => string[];
  };
  const mm = createRequire(twRequire.resolve('fast-glob'))('micromatch') as {
    isMatch: (s: string, p: string) => boolean;
  };
  const { content } = createRequire(CONFIG)(CONFIG) as { content: (string | object)[] };
  const globs = content.filter((c): c is string => typeof c === 'string');

  it('match no test, spec or mock file', () => {
    const files = fg.sync(globs, { absolute: true });
    expect(files).toContain(path.join(WEB_DIR, 'src/components/marketing/NightTopBar.tsx'));
    expect(
      files.filter((f) => /\/__tests__\/|\/__mocks__\/|\.(test|spec)\.[jt]sx?$/.test(f)),
    ).toEqual([]);
  });

  it('exclude spec and test files under packages/shared/src and apps/web/src, not only __tests__', () => {
    const negations = globs.filter((g) => g.startsWith('!'));
    const shared = path.resolve(WEB_DIR, '../../packages/shared/src');
    for (const root of [path.join(WEB_DIR, 'src'), shared]) {
      for (const rel of ['x/foo.spec.ts', 'foo.test.tsx', 'a/__mocks__/m.ts', 'a/__tests__/t.ts']) {
        const file = path.join(root, rel);
        // The files need not exist: match the path against the negations directly.
        expect(negations.some((n) => mm.isMatch(file, n.slice(1)))).toBe(true);
      }
    }
  });

  it('would match the test files without the negations (so the negations are doing the work)', () => {
    const files = fg.sync(
      globs.filter((g) => !g.startsWith('!')),
      { absolute: true },
    );
    expect(files).toContain(
      path.join(WEB_DIR, 'src/components/marketing/__tests__/t528-round2-chrome.test.tsx'),
    );
  });
});
