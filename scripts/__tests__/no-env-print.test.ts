import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// T-570. All commands below are hand-typed fake strings fed to the checker; none is run.
const ROOT = path.resolve(__dirname, '..', '..');
const HOOK_SH = path.join(ROOT, '.claude/hooks/no-env-print.sh');
const HOOK_MJS = path.join(ROOT, '.claude/hooks/no-env-print.mjs');

function checkAll(cmds: unknown[]): (string | null)[] {
  const script =
    `import { check } from ${JSON.stringify('file://' + HOOK_MJS)};` +
    `const c = JSON.parse(await new Promise(r => { let s=''; process.stdin.on('data', d => s+=d); process.stdin.on('end', () => r(s)); }));` +
    `process.stdout.write(JSON.stringify(c.map(x => check(x))));`;
  const r = spawnSync('node', ['--input-type=module', '-e', script], {
    input: JSON.stringify(cmds),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('checker harness failed');
  return JSON.parse(r.stdout);
}

function runHook(stdin: string, envOverride?: NodeJS.ProcessEnv) {
  const r = spawnSync('/bin/bash', [HOOK_SH], {
    input: stdin,
    encoding: 'utf8',
    env: envOverride ?? process.env,
  });
  return { code: r.status, stderr: r.stderr, stdout: r.stdout };
}
const payload = (command: unknown) => JSON.stringify({ tool_input: { command } });

const BLOCKED: string[] = [
  'env',
  'env -0',
  'env -i',
  '/usr/bin/env',
  'printenv',
  'printenv HOME',
  'printenv | grep X',
  'export -n',
  'export -p',
  'export',
  'set',
  'declare -x',
  'declare -p',
  'typeset -x',
  'readonly -p',
  'cat /proc/self/environ',
  'cat /proc/1/environ',
  'strings /proc/self/environ',
  "tr '\\0' '\\n' < /proc/self/environ",
  'xargs -0 -n1 < /proc/self/environ',
  'grep -a FOO /proc/$$/environ',
  'ps e',
  'ps auxe',
  'systemctl show-environment',
  'yarn run env',
  'npm run env',
  'node -p process.env',
  'node -p "process.env"',
  'node -e "console.log(process.env)"',
  'node -e "console.log(JSON.stringify(process[\'env\']))"',
  "node -e \"require('child_process').execSync('env')\"",
  'python -c "import os; print(os.environ)"',
  'python3 -c "from os import environ; print(environ)"',
  'python3 -c "import os; os.system(\'printenv\')"',
  "perl -e 'print %ENV'",
  "ruby -e 'p ENV'",
  "php -r 'print_r(getenv());'",
  'yarn workspace @lawie/drafting node -e "console.log(process.env)"',
  'npx tsx -e "console.log(process.env)"',
  // chained and wrapped
  'true && env',
  'true; printenv',
  'false || export -p',
  'echo hi | env',
  'echo $(env)',
  'echo `printenv`',
  'cat <(env)',
  'bash -c env',
  'bash -c "echo a; printenv"',
  "sh -c 'export -p'",
  'zsh -c "set"',
  'su -c env',
  'eval env',
  'eval "export -n"',
  'echo env | sh',
  'xargs env',
  'find . -exec env \\;',
  'watch env',
  'sudo env',
  'exec env',
  'command env',
  'nohup printenv',
  'timeout 5 env',
  'time env',
  'if true; then env; fi',
  '{ env; }',
  'env FOO=1 printenv',
  'sh <<EOF\nenv\nEOF',
  'bash <<< "printenv"',
  'sh <<EOF\n$(env)\nEOF',
  '(unset X; env)',
  '(unset X; yarn test) && env',
];

const ALLOWED: string[] = [
  '',
  '[ -n "$SOME_VAR" ] && echo set',
  '[ -z "${SOME_VAR+x}" ] && echo unset',
  'test -n "$SOME_VAR" && echo set',
  '[[ -v SOME_VAR ]] && echo set',
  'command -v env',
  'env -u SOME_VAR node script.js',
  'env FOO=1 node script.js',
  'env FOO=1 BAR=2 yarn test',
  '/usr/bin/env node script.js',
  'set -euo pipefail',
  'set -e',
  'export FOO=1',
  'export FOO=1 BAR=2',
  'unset FOO',
  '(unset REDIS_URL SENTRY_DSN; yarn workspace @lawie/drafting test)',
  '(unset REDIS_URL SENTRY_DSN; yarn --cwd /tmp/x test)',
  'node -e "console.log(process.env.HOME ? 1 : 0)"',
  'node -e "console.log(\'X\' in process.env)"',
  'python3 -c "import os; print(os.environ.get(\'X\') is not None)"',
  'python3 -c "import os; print(\'X\' in os.environ)"',
  'git commit -m "docs: never run env or set or printenv"',
  'yarn test -t "set"',
  'grep printenv README.md',
  'echo "env"',
  'git commit -m "$(cat <<\'EOF\'\nfix: block env printing\n\nmentions printenv and export -p\nEOF\n)"',
  'ls -la',
  'git status && yarn build',
];

describe('no-env-print check()', () => {
  it.each(BLOCKED.map((c) => [c]))('blocks %j', (cmd) => {
    const [rule] = checkAll([cmd]);
    expect(rule).not.toBeNull();
  });

  it.each(ALLOWED.map((c) => [c]))('allows %j', (cmd) => {
    const [rule] = checkAll([cmd]);
    expect(rule).toBeNull();
  });

  it('fails closed on unbalanced quotes, parens and dangling redirects', () => {
    const rules = checkAll(['echo "abc', "echo 'abc", 'echo $(echo hi', 'cat >']);
    expect(rules.every((r) => r !== null)).toBe(true);
  });

  // FINDING: '(echo hi' (unbalanced open paren) is allowed, the spec says it must fail closed.
  it('fails closed on an unbalanced open paren', () => {
    expect(checkAll(['(echo hi'])[0]).not.toBeNull();
  });

  // FINDING: `echo printenv | xargs sh -c` runs `sh -c printenv`, which prints the environment.
  it('blocks xargs feeding a name to sh -c', () => {
    expect(checkAll(['echo printenv | xargs sh -c'])[0]).not.toBeNull();
  });

  it('fails closed on nesting deeper than 12', () => {
    let deep = 'true';
    for (let i = 0; i < 14; i += 1) deep = `bash -c ${JSON.stringify(deep)}`;
    const [rule] = checkAll([deep]);
    expect(rule).not.toBeNull();
  });
});

describe('no-env-print.sh wrapper (JSON on stdin)', () => {
  it('has a bash shebang and a valid syntax', () => {
    const r = spawnSync('/bin/bash', ['-n', HOOK_SH], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(readFileSync(HOOK_SH, 'utf8').startsWith('#!/bin/bash')).toBe(true);
  });

  it.each([
    'env',
    'printenv',
    'export -n',
    'export -p',
    'set',
    'declare -x',
    'cat /proc/self/environ',
    'node -p process.env',
    'bash -c env',
  ])('exits 2 for %j', (cmd) => {
    const r = runHook(payload(cmd));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Blocked (no-env-print');
  });

  it.each([
    '[ -n "$SOME_VAR" ] && echo set',
    '(unset REDIS_URL SENTRY_DSN; yarn workspace @lawie/drafting test)',
    'env FOO=1 node x.js',
    'set -euo pipefail',
    'export FOO=1',
  ])('exits 0 for %j', (cmd) => {
    expect(runHook(payload(cmd)).code).toBe(0);
  });

  it('allows empty, missing command and missing tool_input', () => {
    expect(runHook(payload('')).code).toBe(0);
    expect(runHook(JSON.stringify({ tool_input: {} })).code).toBe(0);
    expect(runHook(JSON.stringify({})).code).toBe(0);
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['empty stdin', ''],
    ['array', '[1,2]'],
    ['string JSON', '"env"'],
    ['null JSON', 'null'],
    ['numeric command', payload(42)],
    ['array command', payload(['env'])],
    ['unbalanced quote', payload('echo "abc')],
    ['unbalanced paren', payload('echo $(echo hi')],
    ['dangling redirect', payload('cat >')],
  ])('fails closed (exit 2) on %s', (_n, stdin) => {
    expect(runHook(stdin as string).code).toBe(2);
  });

  it('fails closed on nesting deeper than 12', () => {
    let deep = 'true';
    for (let i = 0; i < 14; i += 1) deep = `bash -c ${JSON.stringify(deep)}`;
    expect(runHook(payload(deep)).code).toBe(2);
  });

  it('fails closed when node is missing from PATH', () => {
    // PATH holds only a dir with no node; bash builtins still work. Nothing is printed.
    const env: NodeJS.ProcessEnv = { PATH: '/nonexistent-dir-for-test' };
    const r = runHook(payload('ls'), env);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('no-node');
  });

  it('never echoes the command in the block message', () => {
    const marker = ['MARKER', 'zq', 'xv'].join('_') + Math.floor(Math.random() * 1e6);
    for (const cmd of [
      `printenv ${marker}`,
      `env ${marker} -0 ; env`,
      `echo ${marker} "unterminated`,
      `bash -c "echo ${marker}; export -p"`,
    ]) {
      const r = runHook(payload(cmd));
      expect(r.code).toBe(2);
      expect(r.stderr).not.toContain(marker);
      expect(r.stdout).not.toContain(marker);
    }
  });
});

describe('T-570 config', () => {
  const settings = JSON.parse(readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));

  it('registers the hook exactly once under the Bash PreToolUse matcher, after no-secrets-bash.sh', () => {
    const bash = settings.hooks.PreToolUse.filter((e: { matcher: string }) => e.matcher === 'Bash');
    expect(bash.length).toBe(1);
    const cmds: string[] = bash[0].hooks.map((h: { command: string }) => h.command);
    const all: string[] = settings.hooks.PreToolUse.flatMap((e: { hooks: { command: string }[] }) =>
      e.hooks.map((h) => h.command),
    );
    expect(all.filter((c) => c.endsWith('no-env-print.sh')).length).toBe(1);
    const iSecrets = cmds.findIndex((c) => c.endsWith('no-secrets-bash.sh'));
    const iEnv = cmds.findIndex((c) => c.endsWith('no-env-print.sh'));
    expect(iSecrets).toBeGreaterThanOrEqual(0);
    expect(iEnv).toBeGreaterThan(iSecrets);
  });

  it('denies Read(//proc/**)', () => {
    expect(settings.permissions.deny).toContain('Read(//proc/**)');
  });

  it('CLAUDE.md has the never-print-the-environment line and stays short', () => {
    const text = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    expect(text.match(/^- Never print the environment/gm)?.length).toBe(1);
    expect(text).toContain('(unset REDIS_URL SENTRY_DSN; yarn workspace @lawie/<ws> test)');
    // origin/develop_staging had 59 lines; one line added, small slack allowed.
    expect(text.split('\n').length).toBeLessThanOrEqual(62);
  });
});
