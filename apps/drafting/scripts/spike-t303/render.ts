/**
 * T-303 spike — THROWAWAY, NOT FOR MERGE.
 *
 * Renders Ajay's 8 made-up FIR texts (handoff/legal/t303-made-up-firs.md) to
 * phone-camera-quality JPEGs: 1,568 px long edge, ~1-2 deg skew, light noise
 * and blur, JPEG q80. Makes no network or API call.
 *
 * T-302: made-up pages only; images go to a scratch dir OUTSIDE the repo and
 * are deleted when the spike ends (`run.ts --cleanup`).
 *
 * Usage:
 *   yarn --cwd apps/drafting ts-node --transpile-only scripts/spike-t303/render.ts \
 *     --out <dir outside repo> [--source <path to t303-made-up-firs.md>]
 *
 * If --source is not given and the file is not in this checkout, the text is
 * read in memory from `git show origin/develop_staging:<path>`.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SOURCE_REL = 'handoff/legal/t303-made-up-firs.md';
const LONG_EDGE = 1568;
const SHORT_EDGE = Math.round(LONG_EDGE / Math.SQRT2); // A4 ratio -> 1109
const JPEG_QUALITY = 80;

// Skew per page in degrees: all within 1-2 deg, mixed direction.
const SKEW: Record<string, number> = {
  E1: 1.3,
  E2: -1.7,
  E3: 1.0,
  E4: -1.2,
  H1: 1.6,
  H2: -1.1,
  H3: 1.9,
  H4: -1.4,
};

export interface FirText {
  id: string; // E1..E4, H1..H4
  language: 'en' | 'hi';
  title: string;
  subtitle: string;
  lines: string[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readSource(): string {
  const explicit = arg('source');
  if (explicit) return fs.readFileSync(explicit, 'utf8');
  const local = path.join(REPO_ROOT, SOURCE_REL);
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  // Not in this checkout (branch cut before 3000cdb2): read from git, in memory only.
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `origin/develop_staging:${SOURCE_REL}`], {
    encoding: 'utf8',
  });
}

export function parseFirs(md: string): FirText[] {
  const out: FirText[] = [];
  const parts = md.split(/^## FIR-/m).slice(1);
  for (const part of parts) {
    const [head, ...rest] = part.split('\n');
    const id = head.trim().split(/\s+/)[0];
    const body = rest.map((l) => l.trim()).filter(Boolean);
    const titleLine = body.find((l) => l.startsWith('**')) ?? '';
    const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(titleLine);
    out.push({
      id,
      language: id.startsWith('H') ? 'hi' : 'en',
      title: m ? m[1] : '',
      subtitle: m ? m[2] : '',
      lines: body.filter((l) => l.startsWith('- ')).map((l) => l.slice(2)),
    });
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** One "Key: value" pair, key in bold. Values may contain further colons (times). */
function kv(cell: string): string {
  const i = cell.indexOf(':');
  if (i < 0) return `<span class="t">${esc(cell.trim())}</span>`;
  return `<span class="t"><b>${esc(cell.slice(0, i).trim())}:</b> ${esc(cell.slice(i + 1).trim())}</span>`;
}

// Fine grain noise as an SVG data URL (feTurbulence), blended over the page.
const NOISE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="100%" height="100%" filter="url(#n)"/></svg>`,
);

function html(f: FirText): string {
  const font =
    f.language === 'hi'
      ? `'FreeSans', 'FreeSerif', sans-serif`
      : `'Liberation Serif', 'DejaVu Serif', serif`;
  const rows = f.lines
    .map((line) => {
      const cells = line.split(' | ');
      return `<div class="row">${cells.map(kv).join('<span class="sep"></span>')}</div>`;
    })
    .join('\n');
  return `<!doctype html><html lang="${f.language}"><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${SHORT_EDGE}px;height:${LONG_EDGE}px;overflow:hidden}
  body{background:radial-gradient(ellipse at 40% 30%,#8a7a66 0%,#5b4f42 70%,#3e362e 100%)}
  .paper{position:absolute;left:46px;top:52px;width:${SHORT_EDGE - 92}px;height:${LONG_EDGE - 104}px;
    background:linear-gradient(160deg,#fbfaf5 0%,#f2efe6 55%,#e6e1d4 100%);
    transform:rotate(${SKEW[f.id] ?? 1.5}deg);box-shadow:4px 8px 22px rgba(0,0,0,.45);
    filter:blur(0.55px) contrast(0.96);overflow:hidden}
  .paper::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.16;mix-blend-mode:multiply;
    background-image:url("data:image/svg+xml,${NOISE_SVG}")}
  .inner{position:absolute;inset:70px 64px 60px 64px;overflow:hidden;color:#1d1d22;font-family:${font}}
  h1{text-align:center;font-size:1.45em;margin:0 0 .2em;letter-spacing:.02em}
  .sub{text-align:center;margin:0 0 1.1em;font-size:.95em}
  .row{margin:0 0 .75em;line-height:1.5}
  .sep{display:inline-block;width:1.4em}
  span.t{display:inline}
</style></head><body><div class="paper"><div class="inner" id="inner" style="font-size:24px">
<h1 class="t">${esc(f.title)}</h1><div class="sub t">${esc(f.subtitle)}</div>
${rows}
</div></div></body></html>`;
}

function launchOptions(): LaunchOptions {
  const opts: LaunchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  } else if (
    !fs.existsSync(puppeteer.executablePath()) &&
    fs.existsSync('/opt/pw-browsers/chromium')
  ) {
    opts.executablePath = '/opt/pw-browsers/chromium';
  }
  return opts;
}

async function renderOne(
  browser: Browser,
  f: FirText,
  outDir: string,
): Promise<{ file: string; fonts: Record<string, number> }> {
  const page = await browser.newPage();
  await page.setViewport({ width: SHORT_EDGE, height: LONG_EDGE, deviceScaleFactor: 1 });
  await page.setContent(html(f), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  // Shrink the type until the whole FIR fits on the page.
  await page.evaluate(() => {
    const el = document.getElementById('inner') as HTMLElement;
    let size = 24;
    while (el.scrollHeight > el.clientHeight && size > 12) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  });

  // Which platform fonts actually drew the glyphs (CDP), summed over text nodes.
  const fonts: Record<string, number> = {};
  const cdp = await page.createCDPSession();
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: '.t',
  });
  for (const nodeId of nodeIds) {
    const r = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    for (const pf of r.fonts) fonts[pf.familyName] = (fonts[pf.familyName] ?? 0) + pf.glyphCount;
  }
  await cdp.detach();

  const file = path.join(outDir, `${f.id}.jpg`);
  await page.screenshot({ path: file as `${string}.jpeg`, type: 'jpeg', quality: JPEG_QUALITY });
  await page.close();
  return { file, fonts };
}

async function main(): Promise<void> {
  const outArg = arg('out');
  if (!outArg) throw new Error('--out <dir> is required (a scratch dir outside the repo)');
  const outDir = path.resolve(outArg);
  const rel = path.relative(REPO_ROOT, outDir);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    throw new Error(`refusing to write test pages inside the repo (${outDir}); T-302`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const firs = parseFirs(readSource());
  if (firs.length !== 8) throw new Error(`expected 8 FIR texts, parsed ${firs.length}`);

  const browser = await puppeteer.launch(launchOptions());
  try {
    for (const f of firs) {
      const { file, fonts } = await renderOne(browser, f, outDir);
      const fontList = Object.entries(fonts)
        .map(([name, n]) => `${name} (${n} glyphs)`)
        .join(', ');
      console.log(
        `${f.id} [${f.language}] -> ${file} | ${SHORT_EDGE}x${LONG_EDGE} q${JPEG_QUALITY} skew ${SKEW[f.id]}deg | fonts: ${fontList}`,
      );
    }
  } finally {
    await browser.close();
  }
  console.log(`rendered ${firs.length} pages to ${outDir}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
