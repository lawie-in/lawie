import { spawnSync } from 'node:child_process';
import path from 'node:path';

// T-593 more bypass routes (bash $'...' decoding, jq option parsing, -f, "$ ENV", import/include).
// Hand-typed fake command strings fed to check(); none is ever run.
// In the tables below the marker character "¬" stands for ONE backslash (so the source stays
// readable); `bs()` expands it. Control characters are written as JS escapes, never literally.
// T593_HOOK_PATH may point at another copy of the hook (used to confirm the tests fail on the old one).
const ROOT = path.resolve(__dirname, '..', '..');
const HOOK_MJS = process.env.T593_HOOK_PATH || path.join(ROOT, '.claude/hooks/no-env-print.mjs');

const bs = (s: string): string => s.split('¬').join('\\');

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

// [command, expected rule]
const BLOCKED: [string, string][] = [
  // 1. $'...' decoding: newline in a jq comment hides env unless decoded
  [`jq -n $'# "¬cJenv # "'`, 'jq-env'],
  [`jq -n $'# "¬cjenv # "'`, 'jq-env'],
  [`jq -n $'# "¬x0aenv # "'`, 'jq-env'],
  [`jq -n $'# "¬012env # "'`, 'jq-env'],
  [`jq -n $'# "¬u000aenv # "'`, 'jq-env'],
  [`jq -n $'# "¬U0000000aenv # "'`, 'jq-env'],
  [`jq -n $'# "¬rnv # "'`, 'jq-env'],
  [`jq -n $'# x¬cM"¬nenv # "'`, 'jq-env'],
  // undecodable -> parse-error
  [`echo $'a¬0b'`, 'parse-error'],
  [`echo $'a¬x00b'`, 'parse-error'],
  [`echo $'a¬c@b'`, 'parse-error'],
  [`echo $'a¬400b'`, 'parse-error'],
  [`echo $'a¬u0000'`, 'parse-error'],
  [`echo $'a¬c'`, 'parse-error'],
  [`echo $'a¬c¬b'`, 'parse-error'],
  [`echo $'¬U110000'`, 'parse-error'],
  [`echo $'¬uD800'`, 'parse-error'],
  [`echo $'¬cé'`, 'parse-error'],
  // \' does not end the string; env after it is still seen
  [`x=$(echo $'¬')' ; env)`, 'env'],
  [`$'¬x65nv'`, 'env'],
  [`$'print¬x65nv'`, 'printenv'],
  [`$'¬160rintenv'`, 'printenv'],

  // 2. jq option parsing
  [`jq -n --argfile a f.json 'env'`, 'jq-env'],
  [`jq -n --argfile a f.json --arg b c env`, 'jq-env'],
  [`jq -n -- '-1, env'`, 'jq-env'],
  [`jq -- env`, 'jq-env'],
  [`jq --library-path lib env`, 'jq-env'],
  [`jq --library-path env '.'`, 'jq-env'],
  [`jq -L lib env`, 'jq-env'],
  [`jq -Llib env`, 'jq-env'],
  [`jq -nL lib env`, 'jq-env'],
  [`jq -nL env .`, 'jq-env'],
  [`jq --indent 2 env`, 'jq-env'],
  [`jq --indent=2 env`, 'jq-env'],
  [`jq --tab -nr env`, 'jq-env'],
  [`jq --seq -e -C env`, 'jq-env'],
  [`jq --rawfile a f --slurpfile b g --argjson c 1 env`, 'jq-env'],
  [`jq -n --args env a b`, 'jq-env'],
  [`jq -n --jsonargs '$ENV' 1 2`, 'jq-env'],
  [`jq - env`, 'jq-env'],
  [`jq --unknown-opt x env`, 'jq-env'],
  [`jq -n -x env`, 'jq-env'],
  [`jq --arg=a b env`, 'jq-env'],
  [`gojq -n env`, 'jq-env'],

  // 3. -f / --from-file / --run-tests
  [`jq -f prog.jq`, 'jq-env'],
  [`jq -n -f prog.jq`, 'jq-env'],
  [`jq -nf prog.jq`, 'jq-env'],
  [`jq -fn prog.jq`, 'jq-env'],
  [`jq --from-file prog.jq`, 'jq-env'],
  [`jq --from-file=prog.jq`, 'jq-env'],
  [`jq . x.json -f p.jq`, 'jq-env'],
  [`jq --run-tests t.txt`, 'jq-env'],
  [`jq -L./lib/foo .`, 'jq-env'],

  // 4. "$ ENV" with a gap
  [`jq -n '$ ENV'`, 'jq-env'],
  [`jq -n '$\tENV'`, 'jq-env'],
  [`jq -n '$ # c\nENV'`, 'jq-env'],
  [`jq -n '$\nENV | keys'`, 'jq-env'],
  [`jq -n '$ __prog_args'`, 'jq-env'],
  [`jq -n '$ ENV[]'`, 'jq-env'],

  // 5. import / include
  [`jq -n 'import "m" as m; m::f'`, 'jq-env'],
  [`jq -n 'include "m"; f'`, 'jq-env'],
  [`jq -L lib -n 'include "m"; .'`, 'jq-env'],
  [`jq -n 'import "m" as $d; $d'`, 'jq-env'],
].map(([c, r]): [string, string] => [bs(c), r]);

const ALLOWED: string[] = [
  // 1. $'...' strings that must still pass
  `echo $'a¬tb¬nc'`,
  `echo $'¬a¬b¬e¬E¬f¬v¬r¬?¬"¬¬¬''`,
  `echo $'¬cA¬c?¬c¬¬'`,
  `echo $'¬x¬u¬U¬q'`,
  `echo $'ée'`,
  `IFS=$'¬n' read -r a`,
  `x=$(echo $'¬')'; echo hi)`,
  // 2. jq options
  `jq -nr --arg a b --argjson c 1 '.x' f.json`,
  `jq -n --argfile a f.json '.a'`,
  `jq -n -- '-1, .x'`,
  `jq --indent 2 . f.json`,
  `jq --tab -c -S . f.json`,
  `jq -L lib '.x' f.json`,
  `jq --library-path lib '.x' f.json`,
  `jq -n --args '$ARGS' a env b`,
  `jq . --arg a b -- x`,
  `gojq -n '.a'`,
  // 4. $ENV with a single key
  `jq -n '$ENV.HOME'`,
  `jq -n '$ ENV.HOME'`,
  `jq -n '$ # c\nENV.HOME'`,
  `jq -n '$ENV["CI"] != null'`,
  // 5. import/include as key names or in strings/comments
  `jq '.import' f.json`,
  `jq '."include"' f.json`,
  `jq '.a # import x' f.json`,
  // still allowed generally
  `jq 'has("env")' f.json`,
  `jq '.env' f.json`,
  `jq -n 'env.HOME'`,
  `jq -n 'env["HOME"]'`,
  `jq -n '$ENV.HOME'`,
  `jq '.a # c' f.json`,
  `env NODE_ENV=test node x.js`,
  `env -u FOO yarn test`,
  `[ -n "$REDIS_URL" ] && echo set`,
  `(unset REDIS_URL SENTRY_DSN; yarn workspace @lawie/auth test)`,
  `jq . apps/env/x.json`,
  `jq -n --arg env x '$env'`,
].map(bs);

describe('no-env-print T-593 bypass fixes', () => {
  const blocked = checkAll(BLOCKED.map(([c]) => c));
  const allowed = checkAll(ALLOWED);

  it.each(BLOCKED.map(([c, r], i) => [c, r, i] as const))('blocks %j as %s', (_c, rule, i) => {
    expect(blocked[i]).toBe(rule);
  });

  it.each(ALLOWED.map((c, i) => [c, i] as const))('allows %j', (_c, i) => {
    expect(allowed[i]).toBeNull();
  });

  // Known residual, deliberately NOT pinned as desired behaviour: jq auto-loads ~/.jq, and a
  // function defined there can call env; the hook cannot see that file's content.
  it.todo('jq auto-loaded ~/.jq may define a function that calls env (hook cannot see it)');
});

// Cross-check of the $'...' decoder against real bash. decodeAnsiC is not exported, so we go
// through check(): `jq -n $'# "<E>env # "'` is blocked iff E decodes to LF or CR (a newline
// ends the jq comment, hiding nothing). Bash is only given printf of a fixed whitelist of
// harmless escapes; no command words from the hook cases are ever run.
describe('no-env-print T-593 $-quote decoder vs real bash', () => {
  const WHITELIST = [
    '¬a',
    '¬b',
    '¬e',
    '¬E',
    '¬f',
    '¬n',
    '¬r',
    '¬t',
    '¬v',
    '¬¬',
    "¬'",
    '¬"',
    '¬?',
    '¬101',
    '¬x41',
    'A',
    '¬cA',
    '¬cJ',
    '¬cM',
    '¬x0a',
    '¬x0d',
    '¬012',
    '¬015',
    '¬u000a',
    '¬u000d',
  ].map(bs);

  const hexOf = (esc: string): string => {
    // esc comes only from WHITELIST above
    const r = spawnSync('bash', ['-c', `printf %s $'${esc}' | od -An -tx1`], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('bash failed');
    return r.stdout.trim();
  };

  const programs = WHITELIST.map((e) => `jq -n $'# "${e}env # "'`);
  const results = checkAll(programs);

  it.each(WHITELIST.map((e, i) => [e, i] as const))('escape %j decodes like bash', (esc, i) => {
    const hex = hexOf(esc);
    const bashIsLineBreak = hex === '0a' || hex === '0d';
    expect(results[i]).toBe(bashIsLineBreak ? 'jq-env' : null);
  });
});

// Round 2: bash locale quotes $"..." are treated as their literal text (the $ is dropped and the
// double-quote branch handles the rest). `$$` is the PID, so `$$"x"` is not locale quoting.
// Inside a double-quoted string `$"` and `$'` are never special.
const LOCALE_BLOCKED: [string, string][] = [
  [`$"printenv"`, 'printenv'],
  [`$"env"`, 'env'],
  [`jq -n $"env"`, 'jq-env'],
  [`$"env" | cat`, 'env'],
  [`bash -c $"env"`, 'env'],
  [`bash -c $"printenv"`, 'printenv'],
  [`eval $"env"`, 'env'],
  [`$"print"$'env'`, 'printenv'],
  [`$'print'$"env"`, 'printenv'],
  [`p$"rint"env`, 'printenv'],
  [`$"pr"$"intenv"`, 'printenv'],
  [`jq -n --arg a b $"env"`, 'jq-env'],
  [`jq -n $"¬$ENV"`, 'jq-env'],
  [`jq -n $'$'"ENV"`, 'jq-env'],
  [`jq -n $"$ENV"`, 'jq-env'],
  [`jq $"-n" env`, 'jq-env'],
  [`sudo $"printenv"`, 'printenv'],
  [`$"export" -p`, 'export'],
  [`$"set"`, 'set'],
  [`bash <<EOF\n$"env"\nEOF`, 'env'],
  [`bash <<'EOF'\n$"env"\nEOF`, 'env'],
  [`echo "$(printf x; $"env")"`, 'env'],
  [`x=$($"env")`, 'env'],
  [`¬$"x"; env`, 'env'],
  [`$$"x"; env`, 'env'],
  [`cat f | xargs $"env"`, 'env'],
  [`xargs $"env" < f`, 'env'],
].map(([c, r]): [string, string] => [bs(c), r]);

const LOCALE_ALLOWED: string[] = [
  `echo $"hello"`,
  `echo "$'env'"`,
  `echo '$"env"'`,
  `jq -n $"1"`,
  `echo $""`,
  `echo $"$x"`,
  `echo "$"env"" done`,
  `echo ¬$"env"`,
  `echo $$"x"`,
  `jq -n --arg a $"env" '$a'`,
  `jq -n $"env.HOME"`,
  `echo $'a'$"b"`,
  `cat <<EOF\n$"env"\nEOF`,
].map(bs);

describe('no-env-print T-593 round 2: bash locale quotes $"..."', () => {
  const blocked = checkAll(LOCALE_BLOCKED.map(([c]) => c));
  const allowed = checkAll(LOCALE_ALLOWED);

  it.each(LOCALE_BLOCKED.map(([c, r], i) => [c, r, i] as const))(
    'blocks %j as %s',
    (_c, rule, i) => {
      expect(blocked[i]).toBe(rule);
    },
  );

  it.each(LOCALE_ALLOWED.map((c, i) => [c, i] as const))('allows %j', (_c, i) => {
    expect(allowed[i]).toBeNull();
  });

  it("regression: $'...' ANSI-C quoting still decodes", () => {
    const r = checkAll([
      bs(`$'¬x65nv'`),
      bs(`$'print¬x65nv'`),
      bs(`jq -n $'# "¬nenv # "'`),
      bs(`echo $'a¬tb'`),
    ]);
    expect(r).toEqual(['env', 'printenv', 'jq-env', null]);
  });

  // Documented limits (variable-built command names and xargs' own argument are out of scope for
  // the hook). NOT pinned as security guarantees:
  //   x=$"env"; $x      -> currently allowed (command name built from a variable)
  //   echo x | xargs $"env" -> currently allowed (xargs runs `env x`)
  it.todo(
    'variable-built command name after a locale-quoted assignment (x=$"env"; $x) is not covered',
  );
  it.todo('echo x | xargs $"env" runs `env x`; not covered by the hook');
});
