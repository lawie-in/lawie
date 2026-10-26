import { spawnSync } from 'node:child_process';
import path from 'node:path';

// T-570 round 4. Hand-typed fake command strings fed to check(); none is ever run.
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
  // jq string interpolation
  'jq -n \'"\\(env)"\'',
  'jq -n \'"\\($ENV)"\'',
  'jq -n \'"x\\(env|tostring)"\'',
  // KNOWN FALSE POSITIVE: any \( in a jq literal fails closed, even without env.
  // If this ever becomes allowed, the fix got smarter; update deliberately.
  'jq -n \'"a\\(.x)b"\'',
  // \u (max 4 hex digits) and \U (max 8) decode like bash
  "cat /proc/self$'\\u002fenviron'",
  "cat /proc/self$'/environ'",
  "cat /proc/self/$'\\U00000065nviron'",
  "cat /proc/self/$'environ'",
  "cat /proc/self/$'e\\x6eviron'",
];

const ALLOWED: string[] = [
  'jq -n \'"hello"\'',
  'jq \'has("env")\' f.json',
  'jq -r \'"\\t" + .name\'',
  'jq -n \'env["HOME"]\'',
  "echo $'\u00e9t\u00e9'",
  // 4-digit cap: \u00e9 then literal 'e' (not U+0E9E); harmless text
  "echo $'\\u00e9e'",
];

describe('no-env-print round 4', () => {
  const blocked = checkAll(BLOCKED);
  const allowed = checkAll(ALLOWED);
  it.each(BLOCKED.map((c, i) => [c, i] as const))('blocks %j', (_c, i) => {
    expect(blocked[i]).not.toBeNull();
  });
  it.each(ALLOWED.map((c, i) => [c, i] as const))('allows %j', (_c, i) => {
    expect(allowed[i]).toBeNull();
  });
  it('jq interpolation reports rule jq-env', () => {
    for (const i of [0, 1, 2, 3]) expect(JSON.stringify(blocked[i])).toContain('jq-env');
  });
  it('\\u cap is 4 digits: \\u002fenviron decodes to /environ, not U+02FE', () => {
    expect(blocked[4]).not.toBeNull();
  });
});
