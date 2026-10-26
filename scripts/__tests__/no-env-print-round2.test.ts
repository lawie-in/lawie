import { spawnSync } from 'node:child_process';
import path from 'node:path';

// T-570 round 2. Hand-typed fake command strings fed to check(); none is ever run.
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
  // /proc obfuscation
  'cat /proc/1/env""iron',
  'cat /proc/1/en""viron',
  'cat /proc/1/envir\\on',
  'cat /proc/*/env*',
  'cat /proc/1/e?viron',
  'cat /proc/1/[e]nviron',
  'cd /proc/1 && cat env*',
  'ls /proc/*', // known false positive, deliberately blocked
  // whole-object JS
  'node -p "process.env.toJSON()"',
  'node -p "process.env.valueOf()"',
  'node -p "process.env.toString()"',
  'node -p "process.env.toLocaleString()"',
  'node -p "process.env.constructor"',
  'node -p "process.env.__proto__"',
  'node -p "require(\'process\').env"',
  'node -p "require(\'node:process\').env"',
  'node -e "const { env } = process; console.log(env)"',
  'node --input-type=module -e "import { env } from \'node:process\'; console.log(env)"',
  // jq / awk
  'jq -n env',
  "jq -n '$ENV'",
  "jq -n 'env | to_entries'",
  "awk 'BEGIN{for (k in ENVIRON) print k}'",
  "gawk 'BEGIN{for (k in ENVIRON) print k}'",
  "mawk 'BEGIN{for (k in ENVIRON) print k}'",
  "nawk 'BEGIN{for (k in ENVIRON) print k}'",
  "awk 'BEGIN{x=ENVIRON; print x}'",
];

const ALLOWED: string[] = [
  'cat /proc/meminfo',
  'ls /proc/cpuinfo',
  'grep environ src/a.ts',
  'node -p "process.env.NODE_ENV"',
  "jq '.env' file.json",
  "jq -n '$ENV.HOME'",
  "jq -n 'env.CI != null'",
  "jq -n --arg env x '$env'",
  "jq -r '.tool_input.command'",
  'awk \'BEGIN{print ENVIRON["HOME"]}\'',
];

describe('no-env-print round 2', () => {
  const blocked = checkAll(BLOCKED);
  const allowed = checkAll(ALLOWED);
  it.each(BLOCKED.map((c, i) => [c, i] as const))('blocks %j', (_c, i) => {
    expect(blocked[i]).not.toBeNull();
  });
  it.each(ALLOWED.map((c, i) => [c, i] as const))('allows %j', (_c, i) => {
    expect(allowed[i]).toBeNull();
  });
});
