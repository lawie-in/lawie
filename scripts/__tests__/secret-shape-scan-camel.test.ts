import { spawnSync } from 'node:child_process';
import path from 'node:path';

// T-570 round 4: camelCase / joined-compound deny words near SHA-labelled hex. Hex built at runtime.
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

describe('SHA allowlist deny: camelCase and joined compounds', () => {
  it.each([
    'webhookSecret',
    'apiKey',
    'razorpayKeySecret',
    'authToken',
    'APIKEY',
    'apikey',
    'key1',
    'RAZORPAY_KEY_SECRET',
  ])('HITS: SHA label with %s', (label) => {
    expect(hits(`SHA-256 ${label} ${H64}\n`).length).toBe(1);
  });

  it.each([
    ['rapid capital', `SHA-256 rapid capital ${H64}\n`],
    ['monkey keyboard', `SHA-256 monkey keyboard ${H64}\n`],
    ['plain SHA-256:', `SHA-256: ${H64}\n`],
    ['SHA1', `SHA1 ${hex(40)}\n`],
  ])('PASSES: %s', (_n, text) => {
    expect(hits(text)).toEqual([]);
  });

  // DOCUMENTED RESIDUAL GAP (see allowlist comment): joined labels outside the DENY_JOINED
  // list are NOT denied, so the SHA allowlist lets them through. If this starts failing,
  // the gap was closed: flip these to HITS deliberately.
  it.each(['RAZORPAYSECRET', 'MYTOKEN'])('KNOWN GAP: %s is not denied', (label) => {
    expect(hits(`SHA-256 ${label} ${H64}\n`)).toEqual([]);
  });
});
