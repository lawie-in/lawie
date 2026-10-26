import { spawnSync } from 'node:child_process';
import path from 'node:path';

// T-570 round 3. Hand-typed fake command strings fed to check(); none is ever run.
const ROOT = path.resolve(__dirname, '..', '..');
const HOOK_MJS = path.join(ROOT, '.claude/hooks/no-env-print.mjs');

function checkAll(cmds: string[]): (string | null)[] {
  const script =
    `import { check } from ${JSON.stringify('file://' + HOOK_MJS)};` +
    `const c = JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify(c.map(x => check(x))));`;
  const r = spawnSync('node', ['--input-type=module', '-e', script, JSON.stringify(cmds)], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('checker harness failed');
  return JSON.parse(r.stdout);
}

const BLOCKED: string[] = [
  // jq: whole-environment filters
  "jq -n 'env[]'",
  "jq -n '$ENV[]'",
  "jq -n '[env[]]'",
  "jq -n 'env[0]'",
  "jq -n 'env[$k]'",
  'jq -n env',
  "jq -n '$ENV'",
  // /proc: brace expansion and ANSI-C quoting
  'cat /proc/self/env{i,}ron',
  'cat /proc/self/env{a..z}ron',
  "cat /proc/self/$'\\x65nviron'",
  "cat /proc/self/$'\\145nviron'",
  "cat /proc/self/$'environ'",
];

const ALLOWED: string[] = [
  'jq -n \'env["HOME"]\'',
  "jq -n 'env.HOME'",
  'jq -n \'$ENV["CI"] != null\'',
  'jq \'has("env")\' f.json',
  'jq . apps/env/x.json',
  "jq -r '.env' package.json",
  'echo {a,b}',
  'cat /proc/meminfo',
];

describe('no-env-print round 3', () => {
  const blocked = checkAll(BLOCKED);
  const allowed = checkAll(ALLOWED);
  it.each(BLOCKED.map((c, i) => [c, i] as const))('blocks %j', (_c, i) => {
    expect(blocked[i]).not.toBeNull();
  });
  it.each(ALLOWED.map((c, i) => [c, i] as const))('allows %j', (_c, i) => {
    expect(allowed[i]).toBeNull();
  });
});
