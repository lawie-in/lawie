/**
 * @jest-environment node
 *
 * T-695: the fonts are served from the repo with next/font/local; the build never fetches them.
 * Ajay's conditions: the files are the font projects' own released files, UNMODIFIED (no
 * subsetting, no conversion); OFL.txt and the copyright notice stay beside them; never sold alone.
 * Only repo files are read. Fictional-data rule: no data here.
 */
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const WEB = path.resolve(__dirname, '..');
const SRC = path.join(WEB, 'src');
const FONTS = path.join(SRC, 'fonts');

// sha256 of each released TTF as committed. These pins guard "unmodified" (Ajay). Changing,
// replacing or re-subsetting a font file means these hashes change: re-check the OFL Reserved
// Font Names and the licence with Ajay BEFORE updating a pin.
const PINS: Record<string, string> = {
  'fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf':
    '177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb',
  'inter/Inter[opsz,wght].ttf': '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031',
  'lora/Lora[wght].ttf': '822a6621ccbe8d97d20ac88c1c41f5615c9c2c202eaa75f272cd452aac6475a7',
  'mukta/Mukta-Medium.ttf': '4db18bd8f19582607e8a6af0c4bf158b4b3378b426e42ad39d444d216c70074c',
  'mukta/Mukta-Regular.ttf': '2958e4af564507df2a856164df6f9978dacb03f999a4f34a0c269dc8a4de9688',
  'tiro-devanagari-hindi/TiroDevanagariHindi-Regular.ttf':
    'd2abcb4d352f0bfab91632df5d9c8173882073c182e662fa731a5a738e6681d7',
};

const sha = (file: string): string =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Source with block and line comments removed (not inside strings, good enough for imports). */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** True when the code (comments stripped) imports or requires next/font/google. */
const importsGoogleFonts = (src: string): boolean =>
  /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]next\/font\/google['"]/.test(stripComments(src));

/** The font paths a layout names: `src: '...'` and `path: '...'`, relative to that layout. */
const fontRefs = (src: string): string[] =>
  [...stripComments(src).matchAll(/\b(?:src|path)\s*:\s*'([^']+\.(?:ttf|otf|woff2?))'/g)].map(
    (m) => m[1],
  );

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const LAYOUTS = [
  path.join(SRC, 'app', 'layout.tsx'),
  path.join(SRC, 'app', '(marketing)', 'layout.tsx'),
];

describe('T-695: licence files beside the fonts', () => {
  const families = fs
    .readdirSync(FONTS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  it('the five families are present', () => {
    expect(families.sort()).toEqual([
      'fraunces',
      'inter',
      'lora',
      'mukta',
      'tiro-devanagari-hindi',
    ]);
  });

  it.each(['fraunces', 'inter', 'lora', 'mukta', 'tiro-devanagari-hindi'])(
    '%s has OFL.txt (SIL OFL 1.1, with a copyright line) and METADATA.pb',
    (family) => {
      const ofl = fs.readFileSync(path.join(FONTS, family, 'OFL.txt'), 'utf8');
      expect(ofl).toContain('SIL OPEN FONT LICENSE Version 1.1');
      expect(ofl).toMatch(/Copyright/);
      expect(fs.statSync(path.join(FONTS, family, 'METADATA.pb')).size).toBeGreaterThan(0);
    },
  );

  it('Lora also keeps its FONTLOG.txt', () => {
    expect(fs.existsSync(path.join(FONTS, 'lora', 'FONTLOG.txt'))).toBe(true);
  });
});

describe('T-695: the font files are the released ones, unmodified', () => {
  it('every TTF on disk is pinned and every pin exists', () => {
    const onDisk = walk(FONTS)
      .filter((f) => /\.(ttf|otf|woff2?)$/i.test(f))
      .map((f) => path.relative(FONTS, f).split(path.sep).join('/'))
      .sort();
    expect(onDisk).toEqual(Object.keys(PINS).sort());
  });

  it.each(Object.entries(PINS))('%s has its pinned sha256', (rel, hash) => {
    expect(sha(path.join(FONTS, rel))).toBe(hash);
  });
});

describe('T-695: the layouts use next/font/local and name files that exist', () => {
  it.each(LAYOUTS.map((f) => [path.relative(WEB, f), f]))('%s', (_rel, file) => {
    const src = fs.readFileSync(file, 'utf8');
    expect(importsGoogleFonts(src)).toBe(false);
    expect(stripComments(src)).toMatch(/from\s*'next\/font\/local'/);
    const refs = fontRefs(src);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const abs = path.resolve(path.dirname(file), ref);
      expect(abs.startsWith(FONTS + path.sep)).toBe(true);
      expect(fs.existsSync(abs)).toBe(true);
      expect(Object.keys(PINS)).toContain(path.relative(FONTS, abs).split(path.sep).join('/'));
    }
  });

  it('every pinned font is used by a layout (no unused font files shipped)', () => {
    const used = new Set(
      LAYOUTS.flatMap((f) =>
        fontRefs(fs.readFileSync(f, 'utf8')).map((r) =>
          path
            .relative(FONTS, path.resolve(path.dirname(f), r))
            .split(path.sep)
            .join('/'),
        ),
      ),
    );
    expect([...used].sort()).toEqual(Object.keys(PINS).sort());
  });
});

describe('T-695: no Google fetch and no loose font copies', () => {
  it('no source file under apps/web/src imports or requires next/font/google', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f))
      .filter((f) => importsGoogleFonts(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(WEB, f));
    expect(offenders).toEqual([]);
  });

  it('no font file is served from public/ (fonts go through next/font only)', () => {
    const loose = walk(path.join(WEB, 'public')).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f));
    expect(loose).toEqual([]);
  });
});

describe('T-695: the guards themselves catch a change (fail-first on scratch copies)', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't695-'));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('a byte-flipped copy of a pinned font no longer matches its pin', () => {
    const rel = 'lora/Lora[wght].ttf';
    const bytes = Buffer.from(fs.readFileSync(path.join(FONTS, rel)));
    bytes[bytes.length - 1] ^= 0xff;
    const copy = path.join(tmp, 'Lora.ttf');
    fs.writeFileSync(copy, bytes);
    expect(sha(copy)).not.toBe(PINS[rel]);
  });

  it('a source string importing next/font/google is detected (all forms); comments are not', () => {
    expect(importsGoogleFonts("import { Lora } from 'next/font/google';")).toBe(true);
    expect(importsGoogleFonts('import { Lora } from "next/font/google"')).toBe(true);
    expect(importsGoogleFonts("const f = require('next/font/google');")).toBe(true);
    expect(importsGoogleFonts("const f = await import('next/font/google');")).toBe(true);
    expect(importsGoogleFonts("// we used to import from 'next/font/google'")).toBe(false);
    expect(
      importsGoogleFonts("/* from 'next/font/google' */ import l from 'next/font/local';"),
    ).toBe(false);
  });

  it('a layout naming a missing font file is detected', () => {
    const src = "const f = localFont({ src: '../fonts/nope/Missing.ttf' });";
    const refs = fontRefs(src);
    expect(refs).toEqual(['../fonts/nope/Missing.ttf']);
    expect(fs.existsSync(path.resolve(path.join(SRC, 'app'), refs[0]))).toBe(false);
  });
});
