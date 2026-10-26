import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// T-570. Fake secret-shaped values are built at runtime so no secret-shaped literal exists here.
const ROOT = path.resolve(__dirname, '..', '..');
const SCAN = path.join(ROOT, 'scripts/secret-shape-scan.mjs');
const UC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rep = (s: string, n: number) => s.repeat(n);
const mixedHex = (n: number) => rep('a1b2c3d4e5f60789', Math.ceil(n / 16)).slice(0, n);

const FAKES: Record<string, string> = {
  'aws-access-key-id': 'AK' + 'IA' + UC.slice(0, 16),
  'mongo-uri-with-credentials':
    'mongo' + 'db+srv://' + 'alice' + ':' + 'Zk39xQpL' + '@' + 'cluster0.example.net/db',
  'razorpay-key': 'rz' + 'p_' + 'live_' + 'AbCdEf' + '1234567890',
  jwt: 'ey' + 'J' + rep('a', 12) + '.' + 'ey' + 'J' + rep('b', 12) + '.' + rep('c', 10),
  'anthropic-key': 'sk-' + 'ant-' + 'api03-' + rep('Ab1', 8),
  'github-token': 'gh' + 'p_' + rep('Ab1', 12),
  'slack-token': 'xo' + 'xb-' + '1234567890-abcdef',
  'private-key-header': '-----BEGIN ' + 'RSA PRIVATE' + ' KEY-----',
  'google-api-key': 'AI' + 'za' + rep('Ab1', 12).slice(0, 35),
  'test-signup-secret': 'lt' + 's_' + rep('Ab1', 10),
  'long-hex': mixedHex(40),
};

function run(root: string, extraEnv: Record<string, string> = {}) {
  const r = spawnSync('node', [SCAN, root], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '' };
}

function makeRepo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));
  const env = { GIT_CEILING_DIRECTORIES: path.dirname(dir) };
  spawnSync('git', ['init', '-q', dir], { env: { ...process.env, ...env } });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  spawnSync('git', ['-C', dir, 'add', '-A'], { env: { ...process.env, ...env } });
  return dir;
}

describe('secret-shape-scan', () => {
  it.each(Object.keys(FAKES))('detects %s with file:line and pattern name only', (name) => {
    const value = FAKES[name];
    const dir = makeRepo({ 'handoff/a.md': `line one\nvalue ${value} here\n` });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(`handoff/a.md:2  ${name}`);
    expect(r.out).not.toContain(value);
  });

  it('scans .claude/ too', () => {
    const dir = makeRepo({ '.claude/x.md': FAKES['razorpay-key'] });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('.claude/x.md:1  razorpay-key');
  });

  it('passes a clean tree (exit 0)', () => {
    const dir = makeRepo({ 'handoff/a.md': 'nothing here\n' });
    expect(run(dir).code).toBe(0);
  });

  it('fails closed (exit 2) when git cannot list files', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scan-nogit-'));
    writeFileSync(path.join(dir, 'a.md'), 'x');
    const r = run(dir, { GIT_CEILING_DIRECTORIES: path.dirname(dir) });
    expect(r.code).toBe(2);
  });

  it('fails closed (exit 2) when no tracked files exist under handoff/ or .claude/', () => {
    const dir = makeRepo({ 'other/a.md': 'x' });
    expect(run(dir).code).toBe(2);
  });

  describe('allowlist', () => {
    const h40 = mixedHex(40);
    const h64 = mixedHex(64);
    it('passes a 64-hex value on a line that says SHA-256', () => {
      const dir = makeRepo({ 'handoff/a.md': `Signed SHA-256: ${h64}\n` });
      expect(run(dir).code).toBe(0);
    });
    it('passes a 40-hex value when the previous line says SHA', () => {
      const dir = makeRepo({ 'handoff/a.md': `## Final ship SHA\n\n${h40}\n` });
      expect(run(dir).code).toBe(0);
    });
    it('passes a SHA in a markdown table whose header says SHA', () => {
      const dir = makeRepo({ 'handoff/a.md': `| Item | SHA |\n| --- | --- |\n| one | ${h40} |\n` });
      expect(run(dir).code).toBe(0);
    });
    it('passes a 40-hex ref in a github blob URL', () => {
      const dir = makeRepo({
        'handoff/a.md': `see https://github.com/org/repo/blob/${h40}/README.md\n`,
      });
      expect(run(dir).code).toBe(0);
    });
    it('passes a repeated-character placeholder', () => {
      const dir = makeRepo({ 'handoff/a.md': `token ${rep('0', 40)}\n` });
      expect(run(dir).code).toBe(0);
    });
    it('FAILS the same hex without SHA context', () => {
      const dir = makeRepo({ 'handoff/a.md': `key: ${h40}\n` });
      const r = run(dir);
      expect(r.code).toBe(1);
      expect(r.out).not.toContain(h40);
    });
    it('FAILS a non-SHA-length hex even when SHA is mentioned', () => {
      const h48 = mixedHex(48);
      const dir = makeRepo({ 'handoff/a.md': `SHA ${h48}\n` });
      expect(run(dir).code).toBe(1);
    });
    it('passes placeholder mongo credentials', () => {
      const m = 'mongo' + 'db://';
      const dir = makeRepo({
        'handoff/a.md': `${m}user:pass@host/db\n${m}<user>:<password>@host/db\n`,
      });
      expect(run(dir).code).toBe(0);
    });
    it('FAILS real-looking mongo credentials', () => {
      const m = 'mongo' + 'db://';
      const dir = makeRepo({ 'handoff/a.md': `${m}admin:Zk39xQpLw@host/db\n` });
      expect(run(dir).code).toBe(1);
    });
  });

  it('passes on the current tree (exit 0)', () => {
    const r = run(ROOT);
    expect(r.code).toBe(0);
  });

  it('no secret-shaped literal in the new test/hook/script files (scanText over them)', async () => {
    // Load the scanner's own patterns via a child process (ESM) and run them on each file.
    const files = [
      path.join(ROOT, 'scripts/__tests__/no-env-print.test.ts'),
      path.join(ROOT, 'scripts/__tests__/secret-shape-scan.test.ts'),
      path.join(ROOT, '.claude/hooks/no-env-print.sh'),
      path.join(ROOT, '.claude/hooks/no-env-print.mjs'),
      path.join(ROOT, 'scripts/secret-shape-scan.mjs'),
    ];
    const script =
      `import { scanText } from ${JSON.stringify('file://' + SCAN)};` +
      `import { readFileSync } from 'node:fs';` +
      `const out = {}; for (const f of JSON.parse(process.argv[1])) out[f] = scanText(readFileSync(f, 'utf8'));` +
      `process.stdout.write(JSON.stringify(out));`;
    const r = spawnSync('node', ['--input-type=module', '-e', script, JSON.stringify(files)], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    const res = JSON.parse(r.stdout) as Record<string, unknown[]>;
    for (const f of files) expect(res[f]).toEqual([]);
    // keep imports used
    expect(readdirSync(ROOT).length).toBeGreaterThan(0);
    expect(statSync(SCAN).isFile()).toBe(true);
    expect(readFileSync(SCAN, 'utf8').length).toBeGreaterThan(0);
  });
});
