/**
 * T-606: smoke tests for the box-local deploy script (scripts/deploy-local.sh).
 *
 * These are static text checks plus two harmless executions (`bash -n`, and the
 * bad-argument usage path, which exits before any network or git call). The deploy
 * itself is never run. The environment is never printed; the child gets only PATH.
 *
 * CI note: scripts/__tests__ has no CI job today (T-593), so these run locally only
 * until that lands.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO = path.resolve(__dirname, '../..');
const SCRIPT = path.join(REPO, 'scripts', 'deploy-local.sh');
const DOC = path.join(REPO, 'docs', 'DEPLOY.md');
const ECOSYSTEM = path.join(REPO, 'ecosystem.config.js');

const text = fs.existsSync(SCRIPT) ? fs.readFileSync(SCRIPT, 'utf8') : '';
// Minimal env: PATH only, so a usage run provably needs nothing else.
const PATH_ONLY = { PATH: process.env.PATH ?? '/usr/bin:/bin' };

describe('T-606 deploy-local.sh: file basics (AC1, AC3)', () => {
  it('exists and is executable', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
    expect(fs.statSync(SCRIPT).mode & 0o111).not.toBe(0);
  });

  it('has the bash shebang and strict mode', () => {
    expect(text.split('\n')[0]).toBe('#!/usr/bin/env bash');
    expect(text).toMatch(/^set -euo pipefail$/m);
  });

  it('the old root deploy.sh wrapper no longer exists', () => {
    expect(fs.existsSync(path.join(REPO, 'deploy.sh'))).toBe(false);
  });

  it('passes bash -n', () => {
    const r = spawnSync('bash', ['-n', SCRIPT], { env: PATH_ONLY, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('T-606 deploy-local.sh: forbidden content (AC3, AC5)', () => {
  it.each([
    ['scp', /\bscp\b/i],
    ['ssh', /\bssh\b/i],
    ['set -x', /\bset\s+-[a-z]*x/],
    ['printenv', /printenv/],
    ['reset --hard', /reset\s+--hard/],
    ['git push', /git\s+push/],
    ['hard-coded /home/ubuntu path', /\/home\/ubuntu/],
  ])('contains no %s', (_label, re) => {
    expect(text).toMatch(/\S/); // guard against a vacuous pass on a missing file
    expect(text).not.toMatch(re);
  });
});

describe('T-606 deploy-local.sh: IP literals (AC3, Arjun ruling)', () => {
  it('the only dotted-quad is the AWS IMDS link-local address, once, on the IMDS_HOST assignment', () => {
    const quads = text.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) ?? [];
    expect(quads).toEqual(['169.254.169.254']);
    const lines = text.split('\n');
    const i = lines.findIndex((l) => l.includes('169.254.169.254'));
    expect(lines[i]).toBe('  IMDS_HOST="169.254.169.254"');
    expect(lines[i - 1].trim()).toBe(
      '# AWS IMDS link-local address, fixed by AWS, not a reassignable host',
    );
    expect(text).not.toMatch(/printf[^\n]*IMDS_HOST/);
  });
});

describe('T-606 deploy-local.sh: env path from ecosystem.config.js line 1 (AC1)', () => {
  it('ecosystem.config.js line 1 matches the shape the script parses', () => {
    const line1 = fs.readFileSync(ECOSYSTEM, 'utf8').split('\n')[0];
    // Same regex as the sed in the script: ^const ENV_FILE = '([^']*)';\s*$
    const m = /^const ENV_FILE = '([^']*)';\s*$/.exec(line1);
    expect(m).not.toBeNull();
    expect(m?.[1]?.startsWith('/')).toBe(true);
  });

  it('the script parses line 1 with that shape and refuses empty/relative paths', () => {
    expect(text).toContain("sed -n \"1s/^const ENV_FILE = '\\([^']*\\)';");
    expect(text).toContain('ecosystem.config.js');
    expect(text).toMatch(/\[ -n "\$ENV_FILE" \]/);
    expect(text).toMatch(/\/\*\) ;;/);
  });
});

describe('T-606 deploy-local.sh: usage (AC1)', () => {
  it.each([[[] as string[]], [['bogus']], [['main', 'extra']]])(
    'args %j -> exit 2 with usage, before any network',
    (args) => {
      const r = spawnSync('bash', [SCRIPT, ...args], {
        env: PATH_ONLY,
        encoding: 'utf8',
        timeout: 10000,
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('usage:');
      expect(r.stderr).toContain('<main|develop>');
      // Nothing from the IMDS / git stages ran.
      expect(r.stdout).not.toContain('checking which box');
    },
  );

  it('the usage check comes before the IMDS call and any git command', () => {
    const usageExit = text.indexOf('exit 2');
    expect(usageExit).toBeGreaterThan(0);
    expect(text.indexOf('curl')).toBeGreaterThan(usageExit);
    expect(text.indexOf('git fetch')).toBeGreaterThan(usageExit);
  });
});

describe('T-606 deploy-local.sh: branch guard via IMDSv2 (AC2)', () => {
  it('uses IMDSv2: token PUT with ttl header, then instance-id with the token header', () => {
    expect(text).toContain('-X PUT');
    expect(text).toContain('/api/token');
    expect(text).toContain('X-aws-ec2-metadata-token-ttl-seconds:');
    expect(text).toContain('/meta-data/instance-id');
    expect(text).toMatch(/X-aws-ec2-metadata-token: \$\{IMDS_TOKEN\}/);
  });

  it('names both instance ids and refuses unknown ids', () => {
    expect(text).toMatch(/^PROD_INSTANCE_ID="i-[0-9a-f]+"$/m);
    expect(text).toMatch(/^DEVELOP_INSTANCE_ID="i-[0-9a-f]+"$/m);
    expect(text).toMatch(/\*\) fail "unknown instance id/);
  });

  it('maps main to the prod box only and develop to the develop box only', () => {
    expect(text).toMatch(/"\$PROD_INSTANCE_ID"\)[^\n]*ALLOWED_BRANCH="main"/);
    expect(text).toMatch(/"\$DEVELOP_INSTANCE_ID"\)[^\n]*ALLOWED_BRANCH="develop"/);
    expect(text).toMatch(/if \[ "\$BRANCH" != "\$ALLOWED_BRANCH" \]; then\n\s+fail/);
    // Exactly one place assigns each allowed branch.
    expect(text.match(/ALLOWED_BRANCH="main"/g)).toHaveLength(1);
    expect(text.match(/ALLOWED_BRANCH="develop"/g)).toHaveLength(1);
  });

  it('the guard runs before any git operation', () => {
    const guard = text.indexOf('if [ "$BRANCH" != "$ALLOWED_BRANCH" ]');
    expect(guard).toBeGreaterThan(0);
    expect(text.indexOf('git fetch')).toBeGreaterThan(guard);
    expect(text.indexOf('git checkout')).toBeGreaterThan(guard);
  });
});

describe('T-606 deploy-local.sh: deploy body (AC1, AC3)', () => {
  it('uses ff-only pull and the required install/build/reload commands, in order', () => {
    const steps = [
      'git fetch origin',
      'git checkout "$BRANCH" --',
      'git pull --ff-only origin "$BRANCH"',
      'eval "$ENV_EXPORTS"',
      'yarn install --frozen-lockfile --production=false',
      'yarn workspace @lawie/shared build',
      'yarn workspace @lawie/email-client build',
      'yarn workspaces run build',
      'cp -r apps/web/public/. apps/web/.next/standalone/apps/web/public/',
      'pm2 reload ecosystem.config.js --update-env',
    ];
    let last = -1;
    for (const s of steps) {
      const i = text.indexOf(s);
      expect(`${s} @${i >= 0}`).toBe(`${s} @true`);
      expect(i).toBeGreaterThan(last);
      last = i;
    }
  });

  it('keeps the T-586 SENTRY_RELEASE export after the env-load step', () => {
    const load = text.indexOf('eval "$ENV_EXPORTS"');
    const rel = text.indexOf('SENTRY_RELEASE=$(git rev-parse HEAD); export SENTRY_RELEASE');
    expect(load).toBeGreaterThan(0);
    expect(rel).toBeGreaterThan(load);
  });

  it('health gate covers all six checks, including GET / on 3000', () => {
    for (const url of [
      'http://localhost:4000/health',
      'http://localhost:4001/health',
      'http://localhost:4002/health',
      'http://localhost:4003/health',
      'http://localhost:9100/health',
    ]) {
      expect(text).toContain(`|${url}`);
    }
    expect(text).toMatch(/lawie-web\|http:\/\/localhost:3000\/"$/m);
    expect(text).toContain('exit 1');
  });
});

// Comment-free view of the script, for structure checks that must not match prose.
const code = text
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');

describe('T-606 deploy-local.sh: round-2 structure fixes', () => {
  it('restores next-env.d.ts before the dirty check', () => {
    const restore = code.indexOf('git checkout -q -- "$NEXT_ENV_DTS"');
    const dirty = code.indexOf('git status --porcelain');
    expect(restore).toBeGreaterThan(0);
    expect(dirty).toBeGreaterThan(restore);
    expect(code).toMatch(/^NEXT_ENV_DTS="apps\/web\/next-env\.d\.ts"$/m);
  });

  it('guard, root refusal and tool check all come before the first git command', () => {
    const firstGit = code.search(/^\s*git /m);
    const guard = code.indexOf('if [ "$BRANCH" != "$ALLOWED_BRANCH" ]');
    const root = code.indexOf('[ "$(id -u)" -ne 0 ] || fail');
    const tools = code.indexOf('for c in git yarn pm2 node curl sed; do');
    const toolCheck = code.indexOf('command -v "$c"');
    expect(firstGit).toBeGreaterThan(0);
    for (const i of [guard, root, tools, toolCheck]) {
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(firstGit);
    }
  });

  it('both IMDS curls pass --noproxy and the instance-id call carries the token header', () => {
    const curls = code.split('\n').filter((l) => /\bcurl\b/.test(l) && l.includes('IMDS_BASE'));
    expect(curls).toHaveLength(2);
    for (const l of curls) expect(l).toContain("--noproxy '*'");
    expect(code).toMatch(
      /meta-data\/instance-id"[^\n]*\\\n\s+-H "X-aws-ec2-metadata-token: \$\{IMDS_TOKEN\}"/,
    );
  });

  it('checks out the branch with a trailing -- (no pathspec ambiguity)', () => {
    expect(code).toContain('git checkout "$BRANCH" --');
    expect(code).not.toMatch(/git checkout "\$BRANCH"\s*$/m);
  });

  it('the whole body is in main() and `main "$@"` is the last non-empty line', () => {
    const lines = text.split('\n').filter((l) => l.trim() !== '');
    expect(lines[lines.length - 1]).toBe('main "$@"');
    expect(code).toMatch(/^main\(\) \{$/m);
    expect(code.indexOf('main() {')).toBeLessThan(code.indexOf('main "$@"'));
    // Nothing runs at top level between main() and its call except the closing brace.
    const between = code.slice(code.indexOf('main() {'), code.lastIndexOf('main "$@"'));
    expect(between.trimEnd().endsWith('\n}')).toBe(true);
    expect(code.match(/^main "\$@"$/gm)).toHaveLength(1);
  });

  it('does not source the env file or use set -a / set +a', () => {
    expect(code).not.toMatch(/\bset\s+[-+]a\b/);
    expect(code).not.toMatch(/(^|[;&|]\s*|\s)source\s/m);
    expect(code).not.toMatch(/^\s*\.\s+\S/m);
    expect(code).not.toMatch(/\$\(<\s*"?\$ENV_FILE/);
  });

  it('loads env through node --env-file and eval, then unsets the exports', () => {
    expect(code).toContain('node --env-file="$ENV_FILE" -e "$ENV_LOADER_JS" "$ENV_FILE"');
    const ev = code.indexOf('eval "$ENV_EXPORTS"');
    const un = code.indexOf('unset ENV_EXPORTS');
    expect(un).toBeGreaterThan(ev);
    expect(code.match(/\beval\b/g)).toHaveLength(1);
  });

  it('never echoes env values: only fixed messages and the file path are printed', () => {
    const printing = code
      .split('\n')
      .filter((l) => /\b(echo|printf)\b/.test(l) || /process\.stdout|process\.stderr/.test(l));
    for (const l of printing) {
      expect(l).not.toMatch(/ENV_EXPORTS|\$value|\$\{?[A-Z_]*(TOKEN|SECRET|KEY|PASSWORD|DSN|URL)/);
    }
    // The only echo that mentions the env file prints the path, with "values not shown".
    const envEchoes = printing.filter((l) => l.includes('ENV_FILE'));
    for (const l of envEchoes) expect(l).toContain('values not shown');
    expect(code).not.toMatch(/(echo|printf|cat)[^\n]*"\$ENV_EXPORTS"/);
    expect(code).not.toMatch(/^\s*(env|export -p|declare -x|declare -p)(\s.*)?$/m);
    // The loader writes values to stdout (captured) only once, as one string.
    expect(code.match(/process\.stdout\.write\(/g)).toEqual(['process.stdout.write(']);
    expect(code).toContain('process.stdout.write(out);');
  });

  it('has a loader-failure path: fixed message on stderr and exit 3', () => {
    expect(code).toMatch(
      /if ! ENV_EXPORTS="\$\(node --env-file="\$ENV_FILE" -e "\$ENV_LOADER_JS" "\$ENV_FILE"\)"; then\n\s+echo " {2}x DEPLOY FAILED: could not parse the env file with node --env-file" >&2\n\s+exit 3\n\s+fi/,
    );
  });

  it('refuses root and checks the required tools', () => {
    expect(code).toContain('[ "$(id -u)" -ne 0 ] || fail "run as the checkout owner, not root"');
    expect(code).toMatch(/command -v "\$c" > \/dev\/null \|\| fail/);
  });

  it('SENTRY_RELEASE is assigned exactly once, right after the eval/unset', () => {
    const lines = code.split('\n').map((l) => l.trim());
    const i = lines.indexOf('eval "$ENV_EXPORTS"');
    expect(lines[i + 1]).toBe('unset ENV_EXPORTS');
    expect(lines[i + 2]).toBe('SENTRY_RELEASE=$(git rev-parse HEAD); export SENTRY_RELEASE');
    expect(lines.filter((l) => l.includes('SENTRY_RELEASE='))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Behavioural: the env loader, run exactly as the script embeds it.
// ---------------------------------------------------------------------------
describe('T-606 deploy-local.sh: env loader behaviour (fake values only)', () => {
  const [maj, min] = process.versions.node.split('.').map(Number);
  const hasParseEnv = maj > 20 || (maj === 20 && min >= 12);
  if (!hasParseEnv) {
    // eslint-disable-next-line no-console
    console.warn(
      `T-606: node ${process.versions.node} < 20.12 (no util.parseEnv); loader tests skipped.`,
    );
  }
  const run = hasParseEnv ? it : it.skip;

  const m = /^ENV_LOADER_JS='\n([\s\S]*?)\n'$/m.exec(text);
  const loaderJs = m ? m[1] : '';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't606-loader-'));
  const pwned = path.join(dir, 'pwned');
  const fixture = path.join(dir, 'fixture.env');
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Expected values are the literal meaning of each line under dotenv rules.
  const expected: Record<string, string> = {
    SPACED: 'hello big world',
    INJECT: `$HOME$(touch ${pwned})`,
    BACKTICK: `a\`touch ${pwned}\`b`,
    SQ: "it's here",
    DQ: 'say "hi"',
    EMPTY: '',
    HASHQ: 'abc#def',
    NL: 'line1\nline2',
    DOLLAR: '$HOME and ${PATH}',
    QUOTEEND: "ends with '",
  };
  const fileText = [
    'SPACED=hello big world',
    `INJECT=$HOME$(touch ${pwned})`,
    `BACKTICK=a\`touch ${pwned}\`b`,
    `SQ="it's here"`,
    `DQ='say "hi"'`,
    'EMPTY=',
    'HASHQ="abc#def"',
    'NL="line1\\nline2"',
    "DOLLAR='$HOME and ${PATH}'",
    `QUOTEEND="ends with '"`,
    '',
  ].join('\n');

  const runLoader = (file: string) =>
    spawnSync('node', [`--env-file=${file}`, '-e', loaderJs, file], {
      env: PATH_ONLY,
      encoding: 'utf8',
      timeout: 15000,
    });

  it('extracts the loader from the script', () => {
    expect(loaderJs).toContain('util.parseEnv');
    expect(loaderJs).not.toContain("'");
  });

  run('every value survives eval exactly and nothing in a value is executed', () => {
    fs.writeFileSync(fixture, fileText);
    const r = runLoader(fixture);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    const names = Object.keys(expected);
    const b = spawnSync(
      '/bin/bash',
      ['-c', `eval "$OUT"; printf '%s\\0' ${names.map((n) => `"\${${n}-UNSET}"`).join(' ')}`],
      { env: { PATH: PATH_ONLY.PATH, OUT: r.stdout }, encoding: 'utf8', timeout: 15000 },
    );
    expect(b.status).toBe(0);
    const got = b.stdout.split('\0');
    got.pop(); // trailing empty after the last NUL
    expect(got).toHaveLength(names.length);
    names.forEach((n, i) => expect([n, got[i]]).toEqual([n, expected[n]]));
    expect(fs.existsSync(pwned)).toBe(false);
  });

  run('emits export lines and the values are exported to child processes', () => {
    fs.writeFileSync(fixture, fileText);
    const r = runLoader(fixture);
    expect(r.stdout.split('\n')[0]).toMatch(/^export [A-Za-z_][A-Za-z0-9_]*='/);
    const b = spawnSync('/bin/bash', ['-c', 'eval "$OUT"; /bin/bash -c \'printf %s "$SPACED"\''], {
      env: { PATH: PATH_ONLY.PATH, OUT: r.stdout },
      encoding: 'utf8',
      timeout: 15000,
    });
    expect(b.stdout).toBe('hello big world');
  });

  run('a missing env file makes the loader fail non-zero', () => {
    const r = runLoader(path.join(dir, 'does-not-exist.env'));
    expect(r.status).not.toBe(0);
    expect(r.stdout).toBe('');
  });

  run('an invalid variable name makes the loader exit 3 with a fixed message', () => {
    const bad = path.join(dir, 'bad.env');
    fs.writeFileSync(bad, 'GOOD=1\nBAD-NAME=secretlookingvalue\n');
    const r = runLoader(bad);
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('');
    expect(r.stderr).not.toContain('secretlookingvalue');
    expect(r.stderr).toContain('not a valid shell name');
  });
});

// ---------------------------------------------------------------------------
// Behavioural: the branch guard, with stubbed curl/git/pm2/yarn/node on PATH.
// Runs a COPY of the real script in a throwaway repo dir; the real metadata host
// and the real git/pm2/yarn are never touched.
// ---------------------------------------------------------------------------
describe('T-606 deploy-local.sh: guard behaviour with stubs', () => {
  const PROD = text.match(/^PROD_INSTANCE_ID="(i-[0-9a-f]+)"$/m)?.[1] ?? 'missing-prod';
  const DEV = text.match(/^DEVELOP_INSTANCE_ID="(i-[0-9a-f]+)"$/m)?.[1] ?? 'missing-dev';
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (isRoot) {
    // eslint-disable-next-line no-console
    console.warn(
      'T-606: test process is root. The script refuses root AFTER the guard, so the "proceeds" ' +
        'cases are asserted up to the root refusal (guard passed, no git call) instead of to the ' +
        'first git call.',
    );
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't606-guard-'));
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  type Opts = {
    branch: string;
    id?: string; // instance-id body
    token?: 'ok' | 'empty' | 'fail';
    idFail?: boolean;
  };

  const stub = (dir: string, name: string, body: string) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, `#!/bin/bash\n${body}\n`);
    fs.chmodSync(f, 0o755);
  };

  let n = 0;
  const runGuard = (o: Opts) => {
    const base = path.join(root, `case${n++}`);
    const bin = path.join(base, 'bin');
    const repo = path.join(base, 'repo');
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    const log = path.join(base, 'calls.log');
    fs.writeFileSync(log, '');
    fs.copyFileSync(SCRIPT, path.join(repo, 'scripts', 'deploy-local.sh'));
    fs.writeFileSync(
      path.join(repo, 'ecosystem.config.js'),
      "const ENV_FILE = '/nonexistent/t606-fake.env';\n",
    );
    // curl: PUT -> token; otherwise -> instance id. Each call is logged.
    stub(
      bin,
      'curl',
      [
        'echo "curl $*" >> "$STUB_LOG"',
        'case "$*" in',
        '  *"-X PUT"*)',
        `    case "${o.token ?? 'ok'}" in ok) printf faketoken;; empty) ;; fail) exit 22;; esac ;;`,
        '  *)',
        o.idFail ? '    exit 22 ;;' : `    printf %s "${o.id ?? ''}" ;;`,
        'esac',
      ].join('\n'),
    );
    for (const t of ['git', 'yarn', 'pm2', 'node']) {
      stub(bin, t, `echo "${t} $*" >> "$STUB_LOG"`);
    }
    const r = spawnSync('/bin/bash', [path.join(repo, 'scripts', 'deploy-local.sh'), o.branch], {
      env: { PATH: `${bin}:/usr/bin:/bin`, STUB_LOG: log },
      encoding: 'utf8',
      timeout: 15000,
    });
    const calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    return { r, calls, gitCalls: calls.filter((c) => c.startsWith('git ')) };
  };

  const refused: Array<[string, Opts, RegExp]> = [
    [
      'main on the develop box',
      { branch: 'main', id: DEV },
      /may not be deployed on the develop box/,
    ],
    [
      'develop on the prod box',
      { branch: 'develop', id: PROD },
      /may not be deployed on the prod box/,
    ],
    ['unknown instance id', { branch: 'main', id: 'i-0000000000000dead' }, /unknown instance id/],
    ['empty instance id', { branch: 'develop', id: '' }, /unknown instance id/],
    ['empty token', { branch: 'main', id: PROD, token: 'empty' }, /empty IMDSv2 token/],
    [
      'token curl failure',
      { branch: 'main', id: PROD, token: 'fail' },
      /IMDSv2 token\) unreachable/,
    ],
    [
      'instance-id curl failure',
      { branch: 'main', id: PROD, idFail: true },
      /instance-id\) unreachable/,
    ],
  ];

  it.each(refused)('%s is refused with exit 1 before any git call', (_l, o, msg) => {
    const { r, gitCalls, calls } = runGuard(o);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('DEPLOY REFUSED');
    expect(r.stderr).toMatch(msg);
    expect(gitCalls).toEqual([]);
    expect(calls.filter((c) => /^(yarn|pm2|node) /.test(c))).toEqual([]);
  });

  it.each([
    ['main on the prod box', { branch: 'main', id: PROD }, 'prod'],
    ['develop on the develop box', { branch: 'develop', id: DEV }, 'develop'],
  ] as Array<[string, Opts, string]>)('%s passes the guard', (_l, o, box) => {
    const { r, gitCalls, calls } = runGuard(o);
    expect(r.stdout).toContain(`${box} box (`);
    expect(r.stderr).not.toMatch(/may not be deployed|unknown instance id|unreachable/);
    if (isRoot) {
      // Root refusal comes after the guard and before any git command.
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('not root');
      expect(gitCalls).toEqual([]);
    } else {
      expect(gitCalls[0]).toBe('git checkout -q -- apps/web/next-env.d.ts');
    }
    // IMDS was asked exactly twice, both without a proxy; the token went in the header.
    const curls = calls.filter((c) => c.startsWith('curl '));
    expect(curls).toHaveLength(2);
    for (const c of curls) expect(c).toContain('--noproxy *');
    expect(curls[0]).toContain('-X PUT');
    expect(curls[0]).toContain('http://169.254.169.254/latest/api/token');
    expect(curls[1]).toContain('http://169.254.169.254/latest/meta-data/instance-id');
    expect(curls[1]).toContain('X-aws-ec2-metadata-token: faketoken');
  });

  it('the root refusal fires after the guard and before git when the test runs as root', () => {
    if (!isRoot) {
      // eslint-disable-next-line no-console
      console.warn('T-606: not root; root-refusal behavioural case skipped.');
      return;
    }
    const { r, gitCalls } = runGuard({ branch: 'main', id: PROD });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('run as the checkout owner, not root');
    expect(gitCalls).toEqual([]);
  });
});

describe('T-606 deploy-local.sh: shellcheck (AC5)', () => {
  const has = spawnSync('shellcheck', ['--version'], { env: PATH_ONLY, encoding: 'utf8' });
  const available = !has.error && has.status === 0;

  if (!available) {
    // eslint-disable-next-line no-console
    console.warn('T-606: shellcheck not on PATH; shellcheck test skipped (CI may not have it).');
  }

  (available ? it : it.skip)('shellcheck exits 0', () => {
    const r = spawnSync('shellcheck', [SCRIPT], { env: PATH_ONLY, encoding: 'utf8' });
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('T-606 docs/DEPLOY.md (AC4)', () => {
  const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

  it('exists and points at scripts/deploy-local.sh', () => {
    expect(fs.existsSync(DOC)).toBe(true);
    expect(doc).toContain('scripts/deploy-local.sh');
  });

  it('does not tell anyone to run the old deploy.sh', () => {
    const stripped = doc.replace(/scripts\/deploy-local\.sh/g, '');
    // Any remaining bare "deploy.sh" must not be an instruction to run it.
    const runs = stripped
      .split('\n')
      .filter((l) => /(\.\/|bash\s+|sh\s+|run\s+)deploy\.sh/i.test(l))
      .filter((l) => !/(removed|deleted|no longer|old|replaced|never)/i.test(l));
    expect(runs).toEqual([]);
  });
});
