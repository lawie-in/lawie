import { spawnSync } from 'node:child_process';
import path from 'node:path';

// T-570 round 3: the SHA allowlist deny words are word-bounded, with _ and - read as spaces.
// Hex values are built at runtime.
const ROOT = path.resolve(__dirname, '..', '..');
const SCAN = path.join(ROOT, 'scripts/secret-shape-scan.mjs');
const hex = (n: number) => 'a1b2c3d4e5f60789'.repeat(Math.ceil(n / 16)).slice(0, n);
const H64 = hex(64);

function hits(text: string): { line: number; name: string }[] {
  const script =
    `import { scanText } from ${JSON.stringify('file://' + SCAN)};` +
    `process.stdout.write(JSON.stringify(scanText(process.argv[1])));`;
  const r = spawnSync('node', ['--input-type=module', '-e', script, text], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('scan harness failed');
  return JSON.parse(r.stdout);
}

describe('SHA allowlist deny words', () => {
  it.each([
    ['RAZORPAY_KEY_SECRET label', `SHA-256 RAZORPAY_KEY_SECRET ${H64}\n`],
    ['api_key label', `SHA api_key ${hex(40)}\n`],
    ['webhook-secret label', `SHA-256 webhook-secret ${H64}\n`],
    ['webhook secret sentence', `SHA-256 of the webhook secret: ${H64}\n`],
    ['table header Key + SHA-256', `| Key | SHA-256 |\n| --- | --- |\n| one | ${H64} |\n`],
    ['heading with token', `## SHA of the token\n${hex(40)}\n`],
  ])('HITS: %s', (_n, text) => {
    expect(hits(text).length).toBe(1);
  });

  it.each([
    ['rapid capital', `SHA-256 of the rapid capital memo: ${H64}\n`],
    ['monkey keyboard', `SHA of the monkey keyboard note ${hex(40)}\n`],
    ['plain SHA-256', `SHA-256: ${H64}\n`],
    ['heading with rapid', `## Rapid capital SHA\n${hex(40)}\n`],
  ])('PASSES: %s', (_n, text) => {
    expect(hits(text)).toEqual([]);
  });
});
