import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const YAML = require('yaml') as { parse: (s: string) => any };

// T-593: the Scripts tests workflow is the only CI that runs scripts/__tests__. These tests pin
// its name (the required-check string), triggers, paths and the command it runs.
const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW_REL = '.github/workflows/scripts-tests.yml';
const wf = YAML.parse(fs.readFileSync(path.join(ROOT, WORKFLOW_REL), 'utf8'));
// YAML 1.2 keeps `on` as a string key; tolerate a YAML 1.1 parse that turns it into `true`.
const on = wf.on ?? wf[true as unknown as string];
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('scripts-tests workflow', () => {
  it('is named "Scripts tests"', () => {
    expect(wf.name).toBe('Scripts tests');
  });

  it('has exactly one job, id scripts-tests, named "Run scripts tests"', () => {
    expect(Object.keys(wf.jobs)).toEqual(['scripts-tests']);
    expect(wf.jobs['scripts-tests'].name).toBe('Run scripts tests');
    // The required-check string is "<workflow name> / <job name>".
    expect(`${wf.name} / ${wf.jobs['scripts-tests'].name}`).toBe(
      'Scripts tests / Run scripts tests',
    );
  });

  it('pushes on main, develop, develop_staging, release/**, hotfix/**, feature/**, fix/**', () => {
    expect([...on.push.branches].sort()).toEqual(
      [
        'main',
        'develop',
        'develop_staging',
        'release/**',
        'hotfix/**',
        'feature/**',
        'fix/**',
      ].sort(),
    );
  });

  it('runs on pull requests to main, develop, develop_staging', () => {
    expect([...on.pull_request.branches].sort()).toEqual(['develop', 'develop_staging', 'main']);
  });

  it('can be dispatched by hand', () => {
    expect(Object.keys(on)).toContain('workflow_dispatch');
  });

  it('has read-only contents permission', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  it('pull_request has no paths / paths-ignore filter (a required check must always report)', () => {
    expect(on.pull_request.paths).toBeUndefined();
    expect(on.pull_request['paths-ignore']).toBeUndefined();
  });

  it('push has non-empty paths including the key ones', () => {
    expect(on.push.paths.length).toBeGreaterThan(0);
    for (const p of [
      'scripts/**',
      '.claude/**',
      '.husky/**',
      'package.json',
      'yarn.lock',
      WORKFLOW_REL,
    ]) {
      expect(on.push.paths).toContain(p);
    }
  });

  it('installs frozen with PUPPETEER_SKIP_DOWNLOAD "true" and runs yarn test:scripts', () => {
    const steps: any[] = wf.jobs['scripts-tests'].steps;
    const install = steps.find((s) => s.run === 'yarn install --frozen-lockfile');
    expect(install).toBeDefined();
    expect(install.env.PUPPETEER_SKIP_DOWNLOAD).toBe('true');
    expect(steps[steps.length - 1].run).toBe('yarn test:scripts');
    expect(steps.filter((s) => s.run === 'yarn test:scripts')).toHaveLength(1);
  });

  it('uses node 20, a time limit and a cancelling concurrency group', () => {
    const job = wf.jobs['scripts-tests'];
    const setup = job.steps.find((s: any) => String(s.uses).startsWith('actions/setup-node@'));
    expect(String(setup.with['node-version'])).toBe('20');
    expect(job['timeout-minutes']).toBe(10);
    expect(wf.concurrency['cancel-in-progress']).toBe(true);
    expect(wf.concurrency.group).toBe('${{ github.workflow }}-${{ github.ref }}');
  });
});

describe('package.json and CLAUDE.md agree with the workflow', () => {
  it('test:scripts is the jest command over scripts/__tests__', () => {
    expect(pkg.scripts['test:scripts']).toBe('jest -c scripts/jest.config.js scripts/__tests__');
  });

  it('CLAUDE.md names the required check exactly once', () => {
    const text = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    expect(text.split('Scripts tests / Run scripts tests').length - 1).toBe(1);
  });

  it('.claude/docs/test-gaps.md names the required check exactly once and yarn test:scripts', () => {
    const text = fs.readFileSync(path.join(ROOT, '.claude/docs/test-gaps.md'), 'utf8');
    expect(text.split('Scripts tests / Run scripts tests').length - 1).toBe(1);
    expect(text).toContain('yarn test:scripts');
  });
});

describe('paths cover every repo-root file the scripts tests read', () => {
  const globToRe = (g: string) =>
    new RegExp(
      '^' +
        g
          .split('**')
          .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
          .join('.*') +
        '$',
    );
  const matchers = (on.push.paths as string[]).map(globToRe);
  const covered = (rel: string) => matchers.some((re) => re.test(rel));

  // Repo-root files outside scripts/ that the test sources reference. Found by scanning every
  // quoted string in the tests (one '/'-joined path, or the pieces of path.join(REPO, 'a', 'b'))
  // and keeping those that exist at the repo root.
  const testsDir = __dirname;
  const sources = fs
    .readdirSync(testsDir)
    .filter((f) => f.endsWith('.test.ts') && f !== path.basename(__filename))
    .map((f) => fs.readFileSync(path.join(testsDir, f), 'utf8'));
  const literals = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/(['"`])([A-Za-z0-9_.][A-Za-z0-9_./-]*)\1/g)) literals.add(m[2]);
    for (const m of src.matchAll(/\b(?:path\.)?(?:join|resolve)\(\s*(?:ROOT|REPO)\s*,([^)]*)\)/g)) {
      const parts = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
      if (parts.length) literals.add(parts.join('/'));
    }
  }
  const rootFiles = [...literals].filter((rel) => {
    if (rel.startsWith('scripts/') || (rel.startsWith('.') && !rel.startsWith('.claude/')))
      return false;
    const abs = path.join(ROOT, rel);
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  });

  it('finds the known root-file reads (guards the scan itself)', () => {
    for (const known of [
      'CLAUDE.md',
      'ecosystem.config.js',
      'docs/DEPLOY.md',
      '.claude/settings.json',
    ]) {
      expect(rootFiles).toContain(known);
    }
  });

  it.each(['CLAUDE.md', 'ecosystem.config.js', 'docs/DEPLOY.md', '.claude/settings.json'])(
    'paths cover %s',
    (rel) => {
      expect(covered(rel)).toBe(true);
    },
  );

  it('paths cover every root file found in the test sources', () => {
    expect(rootFiles.filter((f) => !covered(f))).toEqual([]);
  });

  it('paths cover the tracked tree the secret-shape scan reads (handoff/, .claude/)', () => {
    expect(covered('handoff/tickets/T-593-env-print-hook-followups.md')).toBe(true);
    expect(covered('.claude/hooks/no-env-print.mjs')).toBe(true);
  });
});
