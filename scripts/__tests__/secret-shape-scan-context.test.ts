import { spawnSync } from 'node:child_process';
import path from 'node:path';

// T-570 round 2: scan allowlist context rules and the long-hex boundary regex.
// Fake hex values are built at runtime; no secret-shaped literal exists in this file.
const ROOT = path.resolve(__dirname, '..', '..');
const SCAN = path.join(ROOT, 'scripts/secret-shape-scan.mjs');
const hex = (n: number) => 'a1b2c3d4e5f60789'.repeat(Math.ceil(n / 16)).slice(0, n);
const H64 = hex(64);
const H40 = hex(40);

function scan(texts: string[]): { line: number; name: string }[][] {
  const script =
    `import { scanText } from ${JSON.stringify('file://' + SCAN)};` +
    `const t = JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify(t.map(x => scanText(x))));`;
  const r = spawnSync('node', ['--input-type=module', '-e', script, JSON.stringify(texts)], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('scan harness failed');
  return JSON.parse(r.stdout);
}
const hits = (text: string) => scan([text])[0];

describe('SHA allowlist context', () => {
  it('passes when SHA is on the same line', () => {
    expect(hits(`Signed SHA-256: ${H64}\n`)).toEqual([]);
    expect(hits(`commit SHA ${H40}\n`)).toEqual([]);
  });

  it('passes when SHA is in a markdown heading directly above', () => {
    expect(hits(`## Final ship SHA\n${H40}\n`)).toEqual([]);
    expect(hits(`### SHA-256\n\n${H64}\n`)).toEqual([]);
    expect(hits(`# SHA\n${H40}\n`)).toEqual([]);
    expect(hits(`###### SHA\n${H40}\n`)).toEqual([]);
  });

  it('passes when SHA is in the table header row', () => {
    expect(hits(`| Item | SHA-256 |\n| --- | --- |\n| one | ${H64} |\n`)).toEqual([]);
  });

  it('HITS when only a plain (non-heading) line above says SHA', () => {
    const r = hits(`The SHA is below\n${H40}\n`);
    expect(r).toEqual([{ line: 2, name: 'long-hex' }]);
    expect(hits(`Final ship SHA:\n\n${H64}\n`).length).toBe(1);
  });

  it('HITS when a deny word cancels the SHA label', () => {
    expect(hits(`SHA-256 of the webhook secret: ${H64}\n`)).toEqual([
      { line: 1, name: 'long-hex' },
    ]);
    expect(hits(`SHA of the api token ${H40}\n`).length).toBe(1);
    expect(hits(`## SHA of the password\n${H40}\n`).length).toBe(1);
  });

  it('HITS when the table header has both Key and SHA-256', () => {
    expect(hits(`| Key | SHA-256 |\n| --- | --- |\n| one | ${H64} |\n`).length).toBe(1);
  });

  it('HITS a SHA-labelled value of a non 40/64 length', () => {
    expect(hits(`SHA ${hex(48)}\n`).length).toBe(1);
  });
});

describe('long-hex boundaries', () => {
  it('HITS 0x<64hex>', () => {
    expect(hits(`value 0x${H64}\n`)).toEqual([{ line: 1, name: 'long-hex' }]);
  });

  it('HITS secret_<hex>', () => {
    expect(hits(`secret_${hex(40)}\n`)).toEqual([{ line: 1, name: 'long-hex' }]);
  });

  it('HITS a hex run with a non-hex letter adjacent (g is not hex, so the run is still 32+)', () => {
    expect(hits(`${hex(40)}g\n`).length).toBe(1);
    expect(hits(`g${hex(40)}\n`).length).toBe(1);
  });

  it('does not hit a run of 31 hex characters, and a long run is not split by a hex-adjacent match', () => {
    expect(hits(`${hex(31)}\n`)).toEqual([]);
    // 80 hex chars: one maximal run, reported once on its line
    expect(hits(`${hex(80)}\n`)).toEqual([{ line: 1, name: 'long-hex' }]);
  });

  it('current tree still scans clean (exit 0)', () => {
    const r = spawnSync('node', [SCAN, ROOT], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
});
