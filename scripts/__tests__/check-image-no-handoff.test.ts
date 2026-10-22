/**
 * T-533 AC9: scripts/check-image-no-handoff.sh with a fake DOCKER.
 * No Docker daemon is needed.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { repoPath, tmpDir } from './helpers/pipeline';

const SCRIPT = repoPath('scripts/check-image-no-handoff.sh');
const SENTINEL = '__LAWIE_SCAN_DONE__';

function writeExe(file: string, body: string) {
  fs.writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
}

function run(args: string[], env: Record<string, string>) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('check-image-no-handoff.sh', () => {
  let dir: string;
  let fake: string;

  beforeEach(() => {
    dir = tmpDir('check-image-');
    fake = path.join(dir, 'docker');
    // FAKE_OUT is printed verbatim; FAKE_RC is the exit code. argv is logged.
    writeExe(
      fake,
      `printf '%s\\n' "$@" > "${dir}/argv"\nprintf '%b' "$FAKE_OUT"\nexit "\${FAKE_RC:-0}"`,
    );
  });

  const argv = () => fs.readFileSync(path.join(dir, 'argv'), 'utf8').split('\n');

  it('clean image: exit 0', () => {
    const r = run(['img:tag'], { DOCKER: fake, FAKE_OUT: `${SENTINEL}\n` });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('is clean');
  });

  it('runs the image without network, as root, with sh as entrypoint', () => {
    run(['img:tag'], { DOCKER: fake, FAKE_OUT: `${SENTINEL}\n` });
    const a = argv();
    expect(a.slice(0, 8)).toEqual([
      'run',
      '--rm',
      '--network',
      'none',
      '--user',
      '0',
      '--entrypoint',
      'sh',
    ]);
    expect(a).toContain('img:tag');
  });

  it('the scan looks for all four forbidden names and skips node_modules', () => {
    run(['img:tag'], { DOCKER: fake, FAKE_OUT: `${SENTINEL}\n` });
    const scan = argv().join('\n');
    for (const n of [
      'handoff',
      '.claude',
      'CLAUDE.md',
      'copilot-instructions.md',
      'node_modules',
    ]) {
      expect(scan).toContain(n);
    }
  });

  it.each([
    ['handoff dir', '/app/handoff'],
    ['.claude dir', '/app/.claude'],
    ['CLAUDE.md', '/app/CLAUDE.md'],
    ['copilot instructions', '/app/.github/copilot-instructions.md'],
  ])('offender (%s): exit 1 and the path is printed', (_n, p) => {
    const r = run(['img:tag'], { DOCKER: fake, FAKE_OUT: `${p}\n${SENTINEL}\n` });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(p);
    expect(r.stdout).not.toContain(SENTINEL);
  });

  it('several offenders are all listed', () => {
    const r = run(['img:tag'], {
      DOCKER: fake,
      FAKE_OUT: `/a/handoff\n/b/CLAUDE.md\n${SENTINEL}\n`,
    });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('/a/handoff');
    expect(r.stdout).toContain('/b/CLAUDE.md');
  });

  it('docker run fails (non-zero): exit 3 even when the output looks clean', () => {
    const r = run(['img:tag'], { DOCKER: fake, FAKE_OUT: `${SENTINEL}\n`, FAKE_RC: '125' });
    expect(r.code).toBe(3);
  });

  it('docker run fails after printing offenders: still exit 3, never read as clean', () => {
    expect(run(['img:tag'], { DOCKER: fake, FAKE_OUT: '/a/handoff\n', FAKE_RC: '1' }).code).toBe(3);
  });

  it('no sentinel (scan did not finish, e.g. no sh): exit 3', () => {
    const r = run(['img:tag'], { DOCKER: fake, FAKE_OUT: '' });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('could not scan');
  });

  it('docker binary missing: exit 3', () => {
    expect(run(['img:tag'], { DOCKER: path.join(dir, 'does-not-exist') }).code).toBe(3);
  });

  it.each([[[]], [['']], [['a', 'b']]])(
    'usage error %j: exit 2 and docker is never called',
    (args) => {
      const r = run(args as string[], { DOCKER: fake, FAKE_OUT: `${SENTINEL}\n` });
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/usage/);
      expect(fs.existsSync(path.join(dir, 'argv'))).toBe(false);
    },
  );

  describe('the real find expression, run against a temp tree instead of /', () => {
    let root: string;
    let realScan: string;

    beforeEach(() => {
      root = path.join(dir, 'root');
      for (const d of [
        'app/handoff/x',
        'app/.claude',
        'app/.github',
        'srv/node_modules/pkg',
        'srv/ok',
      ]) {
        fs.mkdirSync(path.join(root, d), { recursive: true });
      }
      fs.writeFileSync(path.join(root, 'app/CLAUDE.md'), '');
      fs.writeFileSync(path.join(root, 'app/.github/copilot-instructions.md'), '');
      fs.writeFileSync(path.join(root, 'srv/node_modules/pkg/CLAUDE.md'), '');
      fs.writeFileSync(path.join(root, 'srv/ok/README.txt'), '');
      // fake docker that executes the script's scan string with `find /` pointed at the temp tree
      realScan = path.join(dir, 'docker-real-scan');
      writeExe(
        realScan,
        `scan="\${@: -1}"; scan="\${scan/find \\/ /find ${root} }"; exec sh -c "$scan"`,
      );
    });

    it('finds handoff/.claude/CLAUDE.md/copilot-instructions.md, ignores node_modules', () => {
      const r = run(['img:tag'], { DOCKER: realScan });
      expect(r.code).toBe(1);
      const found = r.stdout.split('\n').filter((l) => l.startsWith(root));
      expect(found.sort()).toEqual(
        [
          `${root}/app/.claude`,
          `${root}/app/.github/copilot-instructions.md`,
          `${root}/app/CLAUDE.md`,
          `${root}/app/handoff`,
        ].sort(),
      );
    });

    it('is clean once the offenders are removed (node_modules copies alone do not fail it)', () => {
      fs.rmSync(path.join(root, 'app'), { recursive: true });
      expect(run(['img:tag'], { DOCKER: realScan }).code).toBe(0);
    });
  });
});
