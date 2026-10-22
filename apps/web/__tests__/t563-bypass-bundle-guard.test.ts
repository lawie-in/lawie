/**
 * T-563 AC2 - the test sign-up bypass must never reach a browser. The web source, next.config and
 * (if a build exists) .next/static are scanned for the switch and secret names, the header name,
 * and any NEXT_PUBLIC_ name containing BYPASS. Any hit fails. A self-check proves the scanner
 * flags a planted sample. Files are read as text; no env is read.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const WEB = path.resolve(__dirname, '..');

const FORBIDDEN: Array<[string, RegExp]> = [
  ['TEST_SIGNUP_BYPASS', /TEST_SIGNUP_BYPASS/],
  ['LAWIE_TEST_SIGNUP_SECRET', /LAWIE_TEST_SIGNUP_SECRET/],
  ['bypass-password', /bypass-password/i],
  ['NEXT_PUBLIC_*BYPASS*', /NEXT_PUBLIC_[A-Za-z0-9_]*BYPASS[A-Za-z0-9_]*/i],
];

/** Names of forbidden patterns found in `text`. */
export function scanText(text: string): string[] {
  return FORBIDDEN.filter(([, re]) => re.test(text)).map(([name]) => name);
}

const SCANNED = /\.(m?[jt]sx?|cjs|json|css|html|map|txt|mdx?)$/i;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (SCANNED.test(entry.name)) out.push(p);
  }
  return out;
}

/** "relative/path: NAME" for each file that holds a forbidden name. */
function scanFiles(files: string[]): string[] {
  const hits: string[] = [];
  for (const f of files) {
    for (const name of scanText(fs.readFileSync(f, 'utf8'))) {
      hits.push(`${path.relative(WEB, f)}: ${name}`);
    }
  }
  return hits;
}

describe('T-563 the bypass names are not in any client-reachable file', () => {
  it('self-check: the scanner flags planted samples and leaves clean text alone', () => {
    expect(scanText('const a = process.env.TEST_SIGNUP_BYPASS;')).toEqual(['TEST_SIGNUP_BYPASS']);
    expect(scanText('x = "LAWIE_TEST_SIGNUP_SECRET"')).toEqual(['LAWIE_TEST_SIGNUP_SECRET']);
    expect(scanText("headers: { 'Bypass-Password': v }")).toEqual(['bypass-password']);
    expect(scanText('NEXT_PUBLIC_ALLOW_BYPASS_X=1')).toEqual(['NEXT_PUBLIC_*BYPASS*']);
    expect(scanText('NEXT_PUBLIC_API_URL and process.env.SENTRY_DSN')).toEqual([]);
  });

  it('self-check: a planted file on disk is flagged by the file scanner', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't563-'));
    try {
      const f = path.join(dir, 'planted.js');
      fs.writeFileSync(f, 'var k = "TEST_SIGNUP_BYPASS_SECRET";');
      expect(scanFiles(walk(dir)).length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('apps/web/src has none', () => {
    const files = walk(path.join(WEB, 'src'));
    expect(files.length).toBeGreaterThan(0);
    expect(scanFiles(files)).toEqual([]);
  });

  it('next.config has none', () => {
    const files = fs
      .readdirSync(WEB)
      .filter((n) => /^next\.config\./.test(n))
      .map((n) => path.join(WEB, n));
    expect(files.length).toBeGreaterThan(0);
    expect(scanFiles(files)).toEqual([]);
  });

  it('.next/static (when a build exists) has none', () => {
    const files = walk(path.join(WEB, '.next', 'static'));
    expect(scanFiles(files)).toEqual([]);
  });
});
