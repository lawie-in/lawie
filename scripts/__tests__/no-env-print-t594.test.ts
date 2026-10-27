import { spawnSync } from 'node:child_process';
import path from 'node:path';

// T-594 AC1: jq '#' comment containing a quote must not hide the env builtin.
// Hand-typed fake command strings fed to check(); none is ever run.
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
  // the exact bypass from the ticket (real newline inside the jq program)
  'jq -n \'# "\nenv | tostring # "\'',
  // carriage-return variant
  'jq -n \'# "\renv | tostring # "\'',
  // $ENV variant
  'jq -n \'# "\n$ENV | tostring # "\'',
  // comment ending in a backslash must not swallow the newline
  "jq -n '# note \\\nenv'",
  // unterminated string fails closed
  "jq -n '\"abc | env'",
  // '#' inside a string is not a comment
  'jq -n \'"a#b" | env\'',
  // same bypass through other jq entry forms
  'jq -n -r \'# "\nenv | tostring # "\'',
  'echo x | jq \'# "\nenv # "\'',
  // round-2 reviewer bypass: jq comment ends at \n only, so the \r must not end it
  'jq -n \'# x\r"\nenv # "\'',
  // CR inside a comment with no quote fails closed
  "jq -n '# a\rb\n.x'",
  // comment ending in a backslash, followed by env
  "jq -n '# note \\\nenv | keys'",
  "jq -n '# note \\\n$ENV'",
  "jq -n '# note \\\nenv[]'",
  // CR variants of the other env forms
  'jq -n \'# "\renv | keys # "\'',
  'jq -n \'# "\n$ENV # "\'',
  'jq -n \'# "\nenv[] # "\'',
];

const ALLOWED: string[] = [
  'jq \'.a # pick "a"\' f.json',
  "jq '.a # the env is not touched' f.json",
  'jq \'has("env")\' f.json',
  "jq -n 'env.HOME'",
  'jq -n \'env["HOME"]\'',
  "jq -n '$ENV.HOME'",
  "jq '.env' f.json",
  "jq '.a # pick a\n| .b' f.json",
  // harmless string with escaped backslash before closing quote
  'jq \'"a\\\\" | .x\' f.json',
  // harmless string containing an escaped backslash then paren text
  'jq -n \'"\\\\("\'',
];

describe('no-env-print T-594 jq comment bypass', () => {
  const blocked = checkAll(BLOCKED);
  const allowed = checkAll(ALLOWED);
  it.each(BLOCKED.map((c, i) => [c, i] as const))('blocks %j', (_c, i) => {
    expect(blocked[i]).toBe('jq-env');
  });
  it.each(ALLOWED.map((c, i) => [c, i] as const))('allows %j', (_c, i) => {
    expect(allowed[i]).toBeNull();
  });
  it('the exact bypass reports rule jq-env', () => {
    expect(JSON.stringify(blocked[0])).toContain('jq-env');
    expect(blocked[0]).toBe('jq-env');
  });
});
