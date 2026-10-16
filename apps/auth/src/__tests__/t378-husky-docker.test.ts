/**
 * T-378: the root `prepare` script must not break `yarn install` in Docker (no .git, husky
 * possibly absent). Guards, without running Docker:
 *  - every Dockerfile under apps/ that runs `yarn install` sets ENV HUSKY=0 and copies
 *    .husky/install.mjs into the stage BEFORE that install (otherwise `node .husky/install.mjs`
 *    fails with MODULE_NOT_FOUND);
 *  - root package.json `prepare` is `node .husky/install.mjs`;
 *  - install.mjs exits 0 silently with CI set or HUSKY=0, even when .git exists and husky is
 *    not resolvable (run from an empty temp dir containing only .git and a copy of the script).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const APPS = path.join(REPO, 'apps');

const dockerfiles = fs
  .readdirSync(APPS)
  .map((d) => path.join(APPS, d, 'Dockerfile'))
  .filter((f) => fs.existsSync(f));

/** Split into stages; logical instructions (line continuations joined, comments dropped). */
function stages(file: string): { name: string; instr: string[] }[] {
  const text = fs.readFileSync(file, 'utf8').replace(/\\\r?\n/g, ' ');
  const out: { name: string; instr: string[] }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^FROM\s/i.test(line)) out.push({ name: line, instr: [] });
    else out[out.length - 1]?.instr.push(line);
  }
  return out;
}

describe('T-378 Dockerfiles', () => {
  it('finds the six app Dockerfiles', () => {
    expect(dockerfiles.length).toBeGreaterThanOrEqual(6);
  });

  describe.each(dockerfiles.map((f) => [path.relative(REPO, f), f]))('%s', (_n, file) => {
    const installStages = stages(file).filter((s) =>
      s.instr.some((i) => /^RUN\b.*\byarn install\b/.test(i)),
    );

    it('has at least one yarn install stage', () => {
      expect(installStages.length).toBeGreaterThan(0);
    });

    it.each(installStages.map((s) => [s.name, s]))(
      'stage %s: HUSKY=0 and install.mjs copied before install',
      (_s, stage) => {
        const idx = (re: RegExp) => stage.instr.findIndex((i) => re.test(i));
        const install = idx(/^RUN\b.*\byarn install\b/);
        const env = idx(/^ENV\s+HUSKY[= ]\s*0\s*$/);
        const copy = idx(/^COPY\s+(--\S+\s+)*\.husky\/install\.mjs\s+\.\/\.husky\/?\s*$/);
        expect(env).toBeGreaterThanOrEqual(0);
        expect(env).toBeLessThan(install);
        expect(copy).toBeGreaterThanOrEqual(0);
        expect(copy).toBeLessThan(install);
      },
    );
  });
});

describe('T-378 prepare script', () => {
  it('root package.json prepare runs .husky/install.mjs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    expect(pkg.scripts.prepare).toBe('node .husky/install.mjs');
  });

  describe('install.mjs', () => {
    let dir: string;
    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 't378-'));
      fs.mkdirSync(path.join(dir, '.git'));
      fs.copyFileSync(path.join(REPO, '.husky', 'install.mjs'), path.join(dir, 'install.mjs'));
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    const run = (env: Record<string, string>, cwd = dir) => {
      const e = { ...process.env, ...env };
      if (!('CI' in env)) delete e.CI;
      if (!('HUSKY' in env)) delete e.HUSKY;
      return spawnSync(process.execPath, [path.join(dir, 'install.mjs')], {
        cwd,
        env: e,
        encoding: 'utf8',
      });
    };

    it('exits 0 silently with CI set', () => {
      const r = run({ CI: '1' });
      expect(r.status).toBe(0);
      expect(r.stdout + r.stderr).toBe('');
    });
    it('exits 0 silently with HUSKY=0', () => {
      const r = run({ HUSKY: '0' });
      expect(r.status).toBe(0);
      expect(r.stdout + r.stderr).toBe('');
    });
    it('exits 0 silently when .git is absent', () => {
      const bare = fs.mkdtempSync(path.join(os.tmpdir(), 't378-bare-'));
      try {
        const r = run({}, bare);
        expect(r.status).toBe(0);
        expect(r.stdout + r.stderr).toBe('');
      } finally {
        fs.rmSync(bare, { recursive: true, force: true });
      }
    });
    it('attempts the husky install when .git exists and neither flag is set', () => {
      // husky is not resolvable from the temp dir, so reaching the import proves the early exit was skipped.
      expect(run({}).status).not.toBe(0);
    });
  });
});
