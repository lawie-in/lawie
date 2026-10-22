/**
 * T-533: scripts/deploy-prod.sh behaviour with fake docker / compose / aws commands.
 * No network, no Docker daemon. Fakes are bash scripts written to a temp dir.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { repoPath, tmpDir } from './helpers/pipeline';

const SCRIPT = repoPath('scripts/deploy-prod.sh');
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const TAG_A = `sha-${SHA_A}`;
const TAG_B = `sha-${SHA_B}`;
const TAG_C = `sha-${SHA_C}`;

function writeExe(file: string, body: string) {
  fs.writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
}

function run(args: string[], env: Record<string, string>) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// ── remote mode ─────────────────────────────────────────────────────────────
describe('deploy-prod.sh remote', () => {
  let dir: string;
  let state: string;
  let env: Record<string, string>;

  beforeEach(() => {
    dir = tmpDir('deploy-remote-');
    state = path.join(dir, 'state');
    const composeFile = path.join(dir, 'docker-compose.prod.yml');
    fs.writeFileSync(composeFile, 'services: {}\n');
    fs.writeFileSync(path.join(dir, 'bad_tags'), '');
    // fake `docker compose`: records each `up` TAG; ps -q prints a fake container id.
    writeExe(
      path.join(dir, 'compose'),
      `
echo "$*" >> "${dir}/compose.log"
args=("$@"); shift 2   # drop: -f <file>
case "$1" in
  pull) exit 0 ;;
  up) echo "$TAG" >> "${dir}/up.log"; echo "$TAG" > "${dir}/running"; exit 0 ;;
  ps) echo "cid-$3"; exit 0 ;;
  logs) echo "fake logs"; exit 0 ;;
esac
exit 0`,
    );
    // fake `docker inspect`: unhealthy iff the running tag is listed in bad_tags.
    writeExe(
      path.join(dir, 'docker'),
      `
if [ "$1" = inspect ]; then
  if grep -qx "$(cat "${dir}/running")" "${dir}/bad_tags"; then echo unhealthy; else echo healthy; fi
  exit 0
fi
exit 0`,
    );
    env = {
      DOCKER_COMPOSE: path.join(dir, 'compose'),
      DOCKER: path.join(dir, 'docker'),
      SKIP_ECR_LOGIN: '1',
      COMPOSE_FILE: composeFile,
      SERVICES: 'redis web',
      STATE_DIR: state,
      ECR_REGISTRY: '123456789012.dkr.ecr.ap-south-1.amazonaws.com',
      HEALTH_TIMEOUT: '5',
      HEALTH_INTERVAL: '0',
    };
  });

  const setBad = (...tags: string[]) =>
    fs.writeFileSync(path.join(dir, 'bad_tags'), tags.join('\n') + '\n');
  const ups = () => fs.readFileSync(path.join(dir, 'up.log'), 'utf8').trim().split('\n');
  const readState = (f: string) =>
    fs.existsSync(path.join(state, f))
      ? fs.readFileSync(path.join(state, f), 'utf8').trim()
      : undefined;

  it('good first deploy: exit 0, deploys sha-<sha>, records current_tag, no previous_tag', () => {
    const r = run(['remote', SHA_A], env);
    expect(r.code).toBe(0);
    expect(ups()).toEqual([TAG_A]);
    expect(readState('current_tag')).toBe(TAG_A);
    expect(readState('previous_tag')).toBeUndefined();
  });

  it('accepts the sha- prefix', () => {
    expect(run(['remote', TAG_A], env).code).toBe(0);
    expect(readState('current_tag')).toBe(TAG_A);
  });

  it('pulls and starts with --remove-orphans', () => {
    run(['remote', SHA_A], env);
    const log = fs.readFileSync(path.join(dir, 'compose.log'), 'utf8');
    expect(log).toMatch(/pull/);
    expect(log).toMatch(/up -d --remove-orphans/);
  });

  it('second good deploy: exit 0 and previous_tag records the earlier tag', () => {
    expect(run(['remote', SHA_A], env).code).toBe(0);
    expect(run(['remote', SHA_B], env).code).toBe(0);
    expect(readState('current_tag')).toBe(TAG_B);
    expect(readState('previous_tag')).toBe(TAG_A);
  });

  it('bad new tag: rolls back to the previous tag, exit 1, current_tag unchanged', () => {
    expect(run(['remote', SHA_A], env).code).toBe(0);
    setBad(TAG_B);
    const r = run(['remote', SHA_B], env);
    expect(r.code).toBe(1);
    expect(ups()).toEqual([TAG_A, TAG_B, TAG_A]);
    expect(readState('current_tag')).toBe(TAG_A);
    expect(readState('previous_tag')).toBeUndefined();
    expect(r.stderr).toMatch(/rolled back to sha-a+/);
  });

  it('bad first-ever deploy: exit 3 (nothing to roll back to), no state recorded', () => {
    setBad(TAG_A);
    const r = run(['remote', SHA_A], env);
    expect(r.code).toBe(3);
    expect(ups()).toEqual([TAG_A]);
    expect(readState('current_tag')).toBeUndefined();
  });

  it('redeploying the same bad tag as current is exit 3, not a rollback loop', () => {
    expect(run(['remote', SHA_A], env).code).toBe(0);
    setBad(TAG_A);
    expect(run(['remote', SHA_A], env).code).toBe(3);
    expect(ups()).toEqual([TAG_A, TAG_A]);
  });

  it('rollback also unhealthy: exit 3', () => {
    expect(run(['remote', SHA_A], env).code).toBe(0);
    setBad(TAG_A, TAG_B);
    const r = run(['remote', SHA_B], env);
    expect(r.code).toBe(3);
    expect(ups()).toEqual([TAG_A, TAG_B, TAG_A]);
    expect(readState('current_tag')).toBe(TAG_A);
  });

  it('a failed deploy never overwrites previous_tag', () => {
    run(['remote', SHA_A], env);
    run(['remote', SHA_B], env);
    setBad(TAG_C);
    expect(run(['remote', SHA_C], env).code).toBe(1);
    expect(readState('current_tag')).toBe(TAG_B);
    expect(readState('previous_tag')).toBe(TAG_A);
  });

  it('pull failure counts as a failed deploy and rolls back', () => {
    expect(run(['remote', SHA_A], env).code).toBe(0);
    writeExe(
      path.join(dir, 'compose'),
      `shift 2; if [ "$1" = pull ] && [ "$TAG" = "${TAG_B}" ]; then exit 1; fi
if [ "$1" = up ]; then echo "$TAG" >> "${dir}/up.log"; echo "$TAG" > "${dir}/running"; fi
if [ "$1" = ps ]; then echo cid; fi
exit 0`,
    );
    expect(run(['remote', SHA_B], env).code).toBe(1);
    expect(readState('current_tag')).toBe(TAG_A);
  });

  it('service that never becomes healthy hits the timeout and fails', () => {
    writeExe(path.join(dir, 'docker'), `if [ "$1" = inspect ]; then echo starting; fi`);
    const r = run(['remote', SHA_A], { ...env, HEALTH_TIMEOUT: '1', HEALTH_INTERVAL: '1' });
    expect(r.code).toBe(3);
    expect(r.stderr).toMatch(/health timeout/);
  });

  it.each([
    ['too short', 'abc123'],
    ['upper case', 'A'.repeat(40)],
    ['39 chars', 'a'.repeat(39)],
    ['41 chars', 'a'.repeat(41)],
    ['not hex', 'g'.repeat(40)],
    ['branch name', 'main'],
  ])('bad sha (%s): exit 2 and nothing deployed', (_n, sha) => {
    const r = run(['remote', sha], env);
    expect(r.code).toBe(2);
    expect(fs.existsSync(path.join(dir, 'up.log'))).toBe(false);
  });

  it('missing ECR_REGISTRY: exit 2', () => {
    const rest = { ...env };
    delete rest.ECR_REGISTRY;
    expect(run(['remote', SHA_A], rest).code).toBe(2);
  });

  it('missing compose file: exit 2', () => {
    expect(run(['remote', SHA_A], { ...env, COMPOSE_FILE: path.join(dir, 'nope.yml') }).code).toBe(
      2,
    );
  });

  it('ECR login failure: exit 3 and nothing changed', () => {
    writeExe(path.join(dir, 'aws'), 'exit 1');
    const rest = { ...env };
    delete rest.SKIP_ECR_LOGIN;
    const r = run(['remote', SHA_A], { ...rest, AWS_CLI: path.join(dir, 'aws') });
    expect(r.code).toBe(3);
    expect(fs.existsSync(path.join(dir, 'up.log'))).toBe(false);
  });
});

describe('deploy-prod.sh usage', () => {
  it.each([[[]], [['remote']], [['bogus', SHA_A]], [['remote', SHA_A, 'extra']]])(
    'args %j: exit 2',
    (args) => {
      const r = run(args as string[], {});
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/usage/);
    },
  );
});

// ── ssm mode ────────────────────────────────────────────────────────────────
describe('deploy-prod.sh ssm', () => {
  let dir: string;
  let env: Record<string, string>;

  beforeEach(() => {
    dir = tmpDir('deploy-ssm-');
    // FAKE_STATUS / FAKE_COUNT / FAKE_CODE select the SSM outcome. argv of every call is logged.
    writeExe(
      path.join(dir, 'aws'),
      `
printf '%s\\0' "$@" >> "${dir}/aws.argv"; echo >> "${dir}/aws.argv"
case "$2" in
  send-command) [ -n "$FAKE_SEND_FAIL" ] && exit 255; echo cmd-123 ;;
  list-commands) echo "\${FAKE_STATUS:-Success} \${FAKE_COUNT:-1}" ;;
  list-command-invocations)
    if printf '%s' "$*" | grep -q ResponseCode; then echo "\${FAKE_CODE:-0}"; else echo "remote output"; fi ;;
esac
exit 0`,
    );
    env = {
      AWS_CLI: path.join(dir, 'aws'),
      ECR_REGISTRY: '123456789012.dkr.ecr.ap-south-1.amazonaws.com',
      PROD_INSTANCE_ID: 'i-0abc123def456',
      SSM_POLL_INTERVAL: '0',
      SSM_TIMEOUT: '5',
    };
  });

  const sendCommandArgs = () => {
    const calls = fs.readFileSync(path.join(dir, 'aws.argv'), 'utf8').split('\n');
    const line = calls.find((l) => l.startsWith('ssm\0send-command')) as string;
    return line.split('\0');
  };

  it('success: exit 0', () => {
    expect(run(['ssm', SHA_A], env).code).toBe(0);
  });

  it('sends AWS-RunShellScript to the instance id; no SSH; valid JSON parameters running `remote sha-<sha>`', () => {
    run(['ssm', SHA_A], env);
    const a = sendCommandArgs();
    expect(a[a.indexOf('--document-name') + 1]).toBe('AWS-RunShellScript');
    expect(a[a.indexOf('--targets') + 1]).toBe('Key=InstanceIds,Values=i-0abc123def456');
    expect(a[a.indexOf('--max-concurrency') + 1]).toBe('1');
    const params = JSON.parse(a[a.indexOf('--parameters') + 1]);
    const cmds: string[] = params.commands;
    expect(cmds[cmds.length - 1]).toBe(`exec bash scripts/deploy-prod.sh remote ${TAG_A}`);
    const joined = cmds.join('\n');
    expect(joined).toContain('base64 -d | tar -xzf -');
    expect(joined).toContain('ECR_REGISTRY=123456789012.dkr.ecr.ap-south-1.amazonaws.com');
    expect(joined).toContain('STATE_DIR=/opt/lawie/state');
    expect(fs.readFileSync(path.join(dir, 'aws.argv'), 'utf8')).not.toMatch(/\bssh\b/);
  });

  it('ships the real docker-compose.prod.yml and deploy-prod.sh (payload decodes and fits the guard)', () => {
    run(['ssm', SHA_A], env);
    const cmds: string[] = JSON.parse(
      sendCommandArgs()[sendCommandArgs().indexOf('--parameters') + 1],
    ).commands;
    const echoLine = cmds.find((c) => c.startsWith('echo ')) as string;
    const payload = echoLine.split(' ')[1];
    expect(payload.length).toBeLessThanOrEqual(20000);
    const out = path.join(dir, 'unpacked');
    fs.mkdirSync(out);
    const tar = spawnSync('bash', ['-c', `echo ${payload} | base64 -d | tar -xzf - -C "${out}"`]);
    expect(tar.status).toBe(0);
    expect(fs.readFileSync(path.join(out, 'docker-compose.prod.yml'), 'utf8')).toBe(
      fs.readFileSync(repoPath('docker-compose.prod.yml'), 'utf8'),
    );
    expect(fs.readFileSync(path.join(out, 'scripts/deploy-prod.sh'), 'utf8')).toBe(
      fs.readFileSync(SCRIPT, 'utf8'),
    );
  });

  it('PROD_INSTANCE_TAG targets by Name tag', () => {
    const rest = { ...env };
    delete rest.PROD_INSTANCE_ID;
    expect(run(['ssm', SHA_A], { ...rest, PROD_INSTANCE_TAG: 'lawie-prod' }).code).toBe(0);
    const a = sendCommandArgs();
    expect(a[a.indexOf('--targets') + 1]).toBe('Key=tag:Name,Values=lawie-prod');
  });

  it.each([
    ['rolled back on the box', '1', 1],
    ['could not roll back', '3', 3],
    ['box usage/config error', '2', 2],
    ['script never ran (other code)', '127', 4],
    ['no response code', '', 4],
  ])('SSM Failed, %s: ResponseCode %j -> exit %d', (_n, code, expected) => {
    expect(run(['ssm', SHA_A], { ...env, FAKE_STATUS: 'Failed', FAKE_CODE: code }).code).toBe(
      expected,
    );
  });

  it('TimedOut and Cancelled are not success', () => {
    expect(run(['ssm', SHA_A], { ...env, FAKE_STATUS: 'TimedOut', FAKE_CODE: '-1' }).code).toBe(4);
    expect(run(['ssm', SHA_A], { ...env, FAKE_STATUS: 'Cancelled', FAKE_CODE: '' }).code).toBe(4);
  });

  it('command matched no instance: exit 4', () => {
    expect(run(['ssm', SHA_A], { ...env, FAKE_STATUS: 'Success', FAKE_COUNT: '0' }).code).toBe(4);
  });

  it('send-command failure: exit 4', () => {
    expect(run(['ssm', SHA_A], { ...env, FAKE_SEND_FAIL: '1' }).code).toBe(4);
  });

  it('neither PROD_INSTANCE_ID nor PROD_INSTANCE_TAG: exit 2 and no AWS call', () => {
    const rest = { ...env };
    delete rest.PROD_INSTANCE_ID;
    const r = run(['ssm', SHA_A], rest);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/PROD_INSTANCE_ID or PROD_INSTANCE_TAG/);
    expect(fs.existsSync(path.join(dir, 'aws.argv'))).toBe(false);
  });

  it.each([
    ['instance id', { PROD_INSTANCE_ID: 'i-0abc; rm -rf /' }],
    ['registry', { ECR_REGISTRY: 'x"; reboot; "' }],
    ['deploy dir', { PROD_DEPLOY_DIR: '/opt/lawie; reboot' }],
    ['region', { AWS_REGION: 'ap south' }],
  ])('rejects shell/JSON metacharacters in %s: exit 2, no AWS call', (_n, extra) => {
    const r = run(['ssm', SHA_A], { ...env, ...extra });
    expect(r.code).toBe(2);
    expect(fs.existsSync(path.join(dir, 'aws.argv'))).toBe(false);
  });

  it('bad sha: exit 2, no AWS call', () => {
    expect(run(['ssm', 'nope'], env).code).toBe(2);
    expect(fs.existsSync(path.join(dir, 'aws.argv'))).toBe(false);
  });

  it('payload over SSM_MAX_PAYLOAD: exit 2', () => {
    expect(run(['ssm', SHA_A], { ...env, SSM_MAX_PAYLOAD: '10' }).code).toBe(2);
  });
});

// ── retag mode ──────────────────────────────────────────────────────────────
describe('deploy-prod.sh retag', () => {
  let dir: string;
  let env: Record<string, string>;
  const services = ['gateway', 'auth', 'drafting', 'billing', 'email-worker', 'web'];

  beforeEach(() => {
    dir = tmpDir('deploy-retag-');
    // FAKE_MISSING: repos without the image. FAKE_EXISTS: put-image says already exists.
    // FAKE_PUT_FAIL: put-image fails for another reason.
    writeExe(
      path.join(dir, 'aws'),
      `
printf '%s\\n' "$*" >> "${dir}/aws.log"
repo=""
prev=""
for a in "$@"; do [ "$prev" = --repository-name ] && repo="$a"; prev="$a"; done
case "$2" in
  batch-get-image)
    if printf '%s\\n' $FAKE_MISSING | grep -qx "$repo"; then echo None; else echo "{\\"manifest\\":\\"$repo\\"}"; fi ;;
  put-image)
    if [ -n "$FAKE_EXISTS" ]; then echo "An error occurred (ImageAlreadyExistsException): already" >&2; exit 254; fi
    if [ -n "$FAKE_PUT_FAIL" ]; then echo "AccessDenied" >&2; exit 254; fi
    echo '{}' ;;
esac
exit 0`,
    );
    env = { AWS_CLI: path.join(dir, 'aws') };
  });

  const calls = (kind: string) =>
    fs.existsSync(path.join(dir, 'aws.log'))
      ? fs
          .readFileSync(path.join(dir, 'aws.log'), 'utf8')
          .split('\n')
          .filter((l) => l.includes(kind))
      : [];

  it('all six present: exit 0, six put-image calls, each repo gets tag main with its own manifest', () => {
    const r = run(['retag', SHA_A], env);
    expect(r.code).toBe(0);
    const puts = calls('put-image');
    expect(puts).toHaveLength(6);
    for (const s of services) {
      const line = puts.find((l) => l.includes(`--repository-name lawie-prod-${s} `)) as string;
      expect(line).toBeDefined();
      expect(line).toContain('--image-tag main');
      expect(line).toContain(`lawie-prod-${s}`); // manifest echoed by the fake
    }
    for (const g of calls('batch-get-image')) expect(g).toContain(`imageTag=${TAG_A}`);
  });

  it('checks all six before changing any (all gets happen before the first put)', () => {
    run(['retag', SHA_A], env);
    const all = fs.readFileSync(path.join(dir, 'aws.log'), 'utf8').split('\n').filter(Boolean);
    const firstPut = all.findIndex((l) => l.includes('put-image'));
    const lastGet = all.map((l) => l.includes('batch-get-image')).lastIndexOf(true);
    expect(lastGet).toBeLessThan(firstPut);
  });

  it('ImageAlreadyExistsException counts as done: exit 0', () => {
    const r = run(['retag', SHA_A], { ...env, FAKE_EXISTS: '1' });
    expect(r.code).toBe(0);
    expect(calls('put-image')).toHaveLength(6);
  });

  it.each(services)('image missing in %s: exit 1 and NOTHING retagged', (svc) => {
    const r = run(['retag', SHA_A], { ...env, FAKE_MISSING: `lawie-prod-${svc}` });
    expect(r.code).toBe(1);
    expect(calls('put-image')).toHaveLength(0);
    expect(r.stderr).toContain(`lawie-prod-${svc}`);
  });

  it('put-image failing for another reason: exit 1', () => {
    expect(run(['retag', SHA_A], { ...env, FAKE_PUT_FAIL: '1' }).code).toBe(1);
  });

  it('bad sha: exit 2, no AWS call', () => {
    expect(run(['retag', 'main'], env).code).toBe(2);
    expect(calls('ecr')).toHaveLength(0);
  });

  it('uses the region and the sha- prefix whether or not the caller gave it', () => {
    run(['retag', TAG_A], { ...env, AWS_REGION: 'ap-south-1' });
    for (const g of calls('batch-get-image')) {
      expect(g).toContain('--region ap-south-1');
      expect(g).toContain(`imageTag=${TAG_A}`);
    }
  });
});
