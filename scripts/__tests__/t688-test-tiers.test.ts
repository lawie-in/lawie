import fs from 'node:fs';
import path from 'node:path';

/**
 * T-688: two test tiers (sanity on every push, full nightly / on release/**). Pins the shape of
 * the Jest projects, the scripts, and the two workflows. Does not run the suites themselves.
 * Does not read handoff/. js-yaml is a transitive dependency (not declared at the root); if it
 * stops resolving, this test fails loudly rather than being skipped.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { load: (s: string) => any };

const ROOT = path.resolve(__dirname, '..', '..');
const WORKSPACES = [
  'apps/drafting',
  'apps/web',
  'apps/auth',
  'apps/billing',
  'apps/gateway',
  'apps/email-worker',
  'packages/email-client',
];

type Project = { displayName: { name: string }; testMatch: string[] };
function loadJs(rel: string): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(path.join(ROOT, rel));
}
function loadConfig(ws: string): { projects: Project[] } {
  return loadJs(path.join(ws, 'jest.config.js'));
}
const baseJestConfig = (): { testMatch: string[]; coveragePathIgnorePatterns: string[] } =>
  loadJs('jest.config.base.js');
function project(ws: string, name: string): Project {
  const p = loadConfig(ws).projects.find((x) => x.displayName.name === name);
  if (!p) throw new Error(`${ws}: no ${name} project`);
  return p;
}
function scripts(ws: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(ROOT, ws, 'package.json'), 'utf8')).scripts;
}
function readYaml(rel: string): any {
  return yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
const isGlob = (s: string) => s.includes('*');
function resolveEntry(ws: string, entry: string): string {
  return path.join(ROOT, ws, entry.replace('<rootDir>/', '').replace(/\\([()[\]])/g, '$1'));
}

// Workspaces whose jest.config.js spreads ../../jest.config.base.
const BASE_WORKSPACES = ['apps/drafting', 'apps/auth', 'apps/billing', 'apps/gateway'];
// Checked against `git show 173f6e93:<ws>/package.json` and jest.config.js (pre-T-688): every
// workspace's test script had --coverage; only these configs had a coverageThreshold.
const HAD_COVERAGE = WORKSPACES;
const HAD_THRESHOLD = ['apps/drafting', 'apps/web', 'apps/auth', 'apps/billing', 'apps/gateway'];

// Arjun's non-legal picks, pinned per workspace (paths relative to the workspace root).
const REQUIRED: Record<string, string[]> = {
  'apps/drafting': [
    't226-ink-holds.service',
    't226-ink-holds.routes',
    't226-ink-holds.heartbeat',
    'templates.routes',
    'intake-gate',
  ].map((n) => `src/__tests__/${n}.test.ts`),
  'apps/billing': [
    't436-invoice-issue',
    't413-manual-grant-alerts',
    't413-topup-claim',
    't413-webhook-ack-after-grant',
    't415-grant-claim-state',
    't583-subscribe-create-log',
  ].map((n) => `src/__tests__/${n}.test.ts`),
  'apps/web': [
    'src/components/intake/__tests__/BriefStep.t629.test.tsx',
    'src/components/intake/__tests__/BriefStep.t644.test.tsx',
    'src/components/intake/__tests__/BriefStep.t668.test.tsx',
    'src/components/intake/__tests__/BriefStep.t498.test.tsx',
    'src/components/intake/__tests__/BriefStep.datecheck.test.tsx',
    'src/components/intake/__tests__/t655-briefstep-given-keys.test.tsx',
    'src/app/admin/__tests__/admin-layout-t616.test.tsx',
    'src/app/auth/callback/__tests__/t616-callback-return.test.tsx',
    'src/app/(auth)/login/__tests__/t616-login-next.test.tsx',
    'src/lib/__tests__/auth-t616.test.ts',
    'src/components/__tests__/SignupConsentPrompt.t642.test.tsx',
    'src/components/__tests__/t642-entry-points.test.tsx',
    'src/components/intake/__tests__/OneFlow.t642-gate.test.tsx',
    'src/app/dashboard/new/__tests__/t642-gate.test.tsx',
    '__tests__/t543-env-example.test.ts',
  ],
  'apps/auth': [
    't616b-revoke-races',
    't616b-session-refresh',
    't642-signup-consent',
    't657-backfill',
    't657-free-seed-atomic',
  ].map((n) => `src/__tests__/${n}.test.ts`),
};

const MIN_SANITY: Record<string, number> = {
  'apps/drafting': 25,
  'apps/web': 10,
  'apps/billing': 6,
  'apps/auth': 5,
};

// Ajay's A-G floor (narrowed). Dropping any of these from drafting sanity must fail.
const FLOOR = [
  // A
  't136-signed-text',
  't371-signed-tables',
  't397-ledger-prompts-signed',
  't473-signed-labels',
  't473-form-labels',
  't566-legal-draft-text',
  't661-party-ask-lines',
  't666-confirm-messages-scope',
  't374-skeletons',
  't577-skeleton-validator',
  'court-rules-golden',
  'court-rules',
  't613-o39-injunction',
  't644-o39-cause-title',
  't650-party-fields',
  't612-bail-grounds',
  't612-averments',
  't612-police-station',
  't638-police-station-prose',
  't197-disclaimer',
  't321-one-disclaimer',
  't322-signed-blank-covers-clause',
  // B
  't248-bnss-citations',
  't263-citation-name-match',
  // C
  't611-verifier',
  't611-amount-in-words',
  't611-gate-helpers',
  't611-round2',
  't611-review-r1',
  't488-verifier-dates',
  't488-state-not-in-draft',
  't340-fact-alteration-dates',
  't241-bail-instructions-assert-facts',
  't678-ws-gate',
  't638-custody-since',
  't638-none-answers',
  't660-brief-ledger-agreement',
  // D
  't629-confirm-block',
  't655-ledger-not-known',
  't668-typed-not-known-party',
  't668b-non-answer-prefix',
  't668c-declaration-party',
  't381-brief-party-fields',
  // E
  't628-prayer-date-gate',
  't628-hold',
  't637-form-ledger',
  'bail-guard',
  't522-verified-fence',
  // F
  't674-court-label',
  't674-court-title',
  't634-document-court-type',
  // Ajay's ruling (43728e3d): in drafting sanity, 63 files
  't178-family-court-citation',
  't429-discharge-ni-act-gate',
  // G
  't288-ink-log-redaction',
  't229-sentry-hooks',
  'sentry',
  't115e-no-matter-label',
  't343-privacy-reaccept',
];

const MAY_MOVE = [
  't611-gate.routes',
  't611-d1.routes',
  't613-o39-route',
  't628-o39-form.routes',
  't628-o39-gate.routes',
  't629-form-route',
  't637-brief-gate.routes',
  't637-form-gate.routes',
  't638-custody-since-route',
  't674-court-label-routes',
];

describe('T-688 jest projects', () => {
  describe.each(WORKSPACES)('%s', (ws) => {
    it('has exactly the projects sanity and full', () => {
      expect(
        loadConfig(ws)
          .projects.map((p) => p.displayName.name)
          .sort(),
      ).toEqual(['full', 'sanity']);
    });

    it('every non-glob sanity entry is an existing file (no dead entries)', () => {
      const entries = project(ws, 'sanity').testMatch;
      expect(entries.length).toBeGreaterThan(0);
      const dead = entries
        .filter((e) => !isGlob(e))
        .filter((e) => !fs.existsSync(resolveEntry(ws, e)));
      expect(dead).toEqual([]);
    });

    it('sanity has no duplicate entries', () => {
      const entries = project(ws, 'sanity').testMatch;
      expect(new Set(entries).size).toBe(entries.length);
    });

    it('full testMatch equals the base testMatch (every test still runs in full)', () => {
      const full = project(ws, 'full').testMatch;
      if (BASE_WORKSPACES.includes(ws)) {
        expect(full).toEqual(baseJestConfig().testMatch);
      } else if (ws === 'apps/web') {
        expect(full).toEqual(['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']);
      } else {
        expect(full).toEqual(['**/__tests__/**/*.test.ts']);
      }
    });

    it('test script still runs with --coverage where it did before T-688', () => {
      if (HAD_COVERAGE.includes(ws)) expect(scripts(ws).test).toContain('--coverage');
      expect(scripts(ws).test).not.toContain('--coverage=false');
    });

    it('coverageThreshold is still top-level where the config had it', () => {
      const cfg = loadConfig(ws) as any;
      if (HAD_THRESHOLD.includes(ws)) {
        expect(cfg.coverageThreshold).toBeDefined();
        expect(cfg.coverageThreshold.global).toBeDefined();
      }
      for (const p of cfg.projects) expect(p.coverageThreshold).toBeUndefined();
    });

    it('the full project keeps coveragePathIgnorePatterns where the base (or web config) had it', () => {
      const full = project(ws, 'full') as any;
      if (BASE_WORKSPACES.includes(ws)) {
        expect(full.coveragePathIgnorePatterns).toEqual(
          baseJestConfig().coveragePathIgnorePatterns,
        );
      } else if (ws === 'apps/web') {
        expect(full.coveragePathIgnorePatterns).toEqual(['/node_modules/', '/.next/']);
      }
    });

    it('sanity is a subset of what full matches (explicit entries sit under __tests__)', () => {
      for (const e of project(ws, 'sanity').testMatch.filter((x) => !isGlob(x))) {
        expect(e).toMatch(/__tests__\/[^/]+\.test\.tsx?$/);
      }
    });

    it('scripts: test is full, test:sanity is sanity without coverage or open-handle detection', () => {
      const s = scripts(ws);
      expect(s.test).toContain('--selectProjects full');
      expect(s['test:sanity']).toContain('--selectProjects sanity');
      expect(s['test:sanity']).toContain('--coverage=false');
      expect(s['test:sanity']).not.toContain('--detectOpenHandles');
      if (ws !== 'packages/email-client') {
        expect(s['test:watch']).toContain('--selectProjects full');
      }
    });
  });

  it.each(Object.entries(MIN_SANITY))('%s sanity lists at least %d files', (ws, _min) => {
    const min = MIN_SANITY[ws];
    expect(project(ws, 'sanity').testMatch.length).toBeGreaterThanOrEqual(min);
  });

  describe.each(Object.entries(REQUIRED))('%s required sanity picks', (ws, files) => {
    const rels = project(ws, 'sanity').testMatch.map((e) =>
      path.relative(path.join(ROOT, ws), resolveEntry(ws, e)),
    );
    it.each(files)('%s is in sanity and exists on disk', (f) => {
      expect(rels).toContain(path.normalize(f));
      expect(fs.existsSync(path.join(ROOT, ws, f))).toBe(true);
    });
  });

  it.each(['apps/drafting', 'apps/auth', 'apps/billing'])(
    '%s setupDb keeps launchTimeout 30000',
    (ws) => {
      const src = fs.readFileSync(path.join(ROOT, ws, 'src/__tests__/setupDb.ts'), 'utf8');
      expect(src).toMatch(/launchTimeout:\s*30000\b/);
    },
  );

  it('drafting golden update still targets the full project', () => {
    expect(scripts('apps/drafting')['test:golden:update']).toContain('--selectProjects full');
    expect(scripts('apps/drafting')['test:golden:update']).not.toContain('sanity');
  });

  describe("Ajay's legal floor in drafting sanity", () => {
    const names = project('apps/drafting', 'sanity').testMatch.map((e) =>
      path.basename(e).replace(/\.test\.ts$/, ''),
    );

    it.each(FLOOR)('%s is in sanity and exists on disk', (name) => {
      expect(names).toContain(name);
      expect(fs.existsSync(path.join(ROOT, 'apps/drafting/src/__tests__', `${name}.test.ts`))).toBe(
        true,
      );
    });

    it.each(MAY_MOVE)('%s (may move to full) is not in sanity', (name) => {
      expect(names).not.toContain(name);
    });

    it('drafting sanity holds at least 63 files (Ajay 43728e3d)', () => {
      expect(names.length).toBeGreaterThanOrEqual(63);
    });

    it.each(['t236-recheck-after-citation-removal', 't346-citation-check-helper'])(
      '%s is nightly only (not in sanity, still on disk for full)',
      (name) => {
        expect(names).not.toContain(name);
        expect(
          fs.existsSync(path.join(ROOT, 'apps/drafting/src/__tests__', `${name}.test.ts`)),
        ).toBe(true);
      },
    );

    it('no t373-* or t115a/b/c file is in sanity', () => {
      expect(names.filter((n) => /^t373-/.test(n) || /^t115[abc]/.test(n))).toEqual([]);
    });

    it('sanity has no wildcard entries that could pull in may-move files', () => {
      expect(project('apps/drafting', 'sanity').testMatch.filter(isGlob)).toEqual([]);
    });
  });
});

function expectNodeModulesCache(id: string, job: any): void {
  const steps: any[] = job.steps ?? [];
  const idx = steps.findIndex(
    (s) =>
      String(s.uses ?? '').startsWith('actions/cache@') &&
      String(s.with?.path ?? '').includes('node_modules'),
  );
  expect({ id, cache: idx >= 0 }).toEqual({ id, cache: true });
  const c = steps[idx];
  expect(c.id).toBe('node-modules');
  const cachePaths = String(c.with.path)
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  expect(cachePaths).toEqual(
    expect.arrayContaining(['node_modules', 'apps/*/node_modules', 'packages/*/node_modules']),
  );
  expect(String(c.with.key)).toContain("hashFiles('yarn.lock')");
  const key = String(c.with.key);
  expect(key).toContain('${{ env.NODE_VERSION }}');
  expect(key).not.toContain('node20');
  const restoreLines = String(c.with['restore-keys'] ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  expect(restoreLines.length).toBeGreaterThan(0);
  for (const line of restoreLines) expect(key.startsWith(line)).toBe(true);
  const install = steps.findIndex((s) => /yarn install/.test(String(s.run ?? '')));
  expect(idx).toBeLessThan(install);
}

describe('T-688 ci.yml', () => {
  const ci = readYaml('.github/workflows/ci.yml');
  const jobs = Object.entries<any>(ci.jobs);
  const stepRuns = (job: any): string[] => (job.steps ?? []).map((s: any) => String(s.run ?? ''));

  const installsOf = (job: any): any[] =>
    (job.steps ?? []).filter((s: any) => /yarn install/.test(String(s.run ?? '')));
  const testSteps = (job: any): any[] =>
    (job.steps ?? []).filter((s: any) =>
      /(test:sanity|jest -c scripts\/jest\.config\.js)/.test(String(s.run ?? '')),
    );

  it('every installing job: install has its own timeout, --prefer-offline, runs only on cache miss', () => {
    const installing = jobs.filter(([, j]) => installsOf(j).length > 0);
    expect(installing.length).toBeGreaterThan(0);
    for (const [id, job] of installing) {
      const installs = installsOf(job);
      expect({ id, n: installs.length }).toEqual({ id, n: 1 });
      const i = installs[0];
      expect(i.run).toContain('--frozen-lockfile');
      expect(i.run).toContain('--prefer-offline');
      expect(i.if).toContain("steps.node-modules.outputs.cache-hit != 'true'");
      expect({ id, t: typeof i['timeout-minutes'] }).toEqual({ id, t: 'number' });
      expect(i['timeout-minutes']).toBeLessThanOrEqual(5);
    }
  });

  it('every test step has its own timeout, so a cancelled run shows which step blew the budget', () => {
    let seen = 0;
    for (const [id, job] of jobs) {
      for (const s of testSteps(job)) {
        seen++;
        expect({ id, run: s.run, t: typeof s['timeout-minutes'] }).toEqual({
          id,
          run: s.run,
          t: 'number',
        });
        expect(s['timeout-minutes']).toBeLessThanOrEqual(5);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(7);
  });

  it('every installing job has the node_modules cache keyed on yarn.lock, before the install', () => {
    for (const [id, job] of jobs.filter(([, j]) => installsOf(j).length > 0)) {
      expectNodeModulesCache(id, job);
    }
  });

  it('every job has timeout-minutes <= 5', () => {
    for (const [id, job] of jobs) {
      expect({ id, t: typeof job['timeout-minutes'] }).toEqual({ id, t: 'number' });
      expect(job['timeout-minutes']).toBeLessThanOrEqual(5);
    }
  });

  it.each([
    ['test-gateway', 'gateway'],
    ['test-auth', 'auth'],
    ['test-drafting', 'drafting'],
    ['test-billing', 'billing'],
    ['test-email-worker', 'email-worker'],
    ['web-build', 'web'],
  ])('%s runs test:sanity for %s', (id, name) => {
    const runs = stepRuns(ci.jobs[id]);
    expect(runs.some((r) => r.includes(`@lawie/${name} test:sanity`))).toBe(true);
    expect(runs.some((r) => new RegExp(`@lawie/${name} test( |$)`).test(r))).toBe(false);
  });

  it('email-client sanity runs inside the email-worker job', () => {
    expect(
      stepRuns(ci.jobs['test-email-worker']).some((r) =>
        r.includes('@lawie/email-client test:sanity'),
      ),
    ).toBe(true);
  });

  it('no codecov step in ci.yml', () => {
    for (const [, job] of jobs) {
      for (const s of job.steps ?? []) expect(String(s.uses ?? '')).not.toMatch(/codecov/i);
    }
  });

  it('test-golden-set job exists and runs the golden-set tests', () => {
    expect(ci.jobs['test-golden-set']).toBeDefined();
    expect(
      stepRuns(ci.jobs['test-golden-set']).some((r) => r.includes('scripts/golden-set/__tests__')),
    ).toBe(true);
  });
});

describe('T-688 full-tests.yml', () => {
  const wf = readYaml('.github/workflows/full-tests.yml');
  const on = wf.on ?? wf[true as unknown as string];
  const jobs = Object.values<any>(wf.jobs);
  const allRuns = jobs.flatMap((j) => (j.steps ?? []).map((s: any) => String(s.run ?? '')));

  it('triggers: schedule, push to release/**, workflow_dispatch', () => {
    expect(on.schedule?.length).toBeGreaterThan(0);
    expect(on.push.branches).toContain('release/**');
    expect('workflow_dispatch' in on).toBe(true);
  });

  it.each(['gateway', 'auth', 'drafting', 'billing', 'email-worker', 'email-client', 'web'])(
    'runs the full test script for %s',
    (name) => {
      expect(allRuns.some((r) => new RegExp(`@lawie/${name} test(\\s|$)`).test(r))).toBe(true);
      expect(allRuns.some((r) => r.includes(`@lawie/${name} test:sanity`))).toBe(false);
    },
  );

  it('every job has the node_modules cache and a cache-miss-only --prefer-offline install with a timeout', () => {
    const entries = Object.entries<any>(wf.jobs);
    for (const [id, job] of entries) {
      const installs = (job.steps ?? []).filter((s: any) =>
        /yarn install/.test(String(s.run ?? '')),
      );
      if (installs.length === 0) continue;
      expect({ id, n: installs.length }).toEqual({ id, n: 1 });
      expect(installs[0].run).toContain('--frozen-lockfile');
      expect(installs[0].run).toContain('--prefer-offline');
      expect(installs[0].if).toContain("steps.node-modules.outputs.cache-hit != 'true'");
      expect({ id, t: typeof installs[0]['timeout-minutes'] }).toEqual({ id, t: 'number' });
      expectNodeModulesCache(id, job);
    }
    expect(
      entries.filter(([, j]) =>
        (j.steps ?? []).some((s: any) => /yarn install/.test(String(s.run ?? ''))),
      ).length,
    ).toBeGreaterThanOrEqual(6);
  });

  it('runs web lint', () => {
    expect(allRuns.some((r) => /@lawie\/web (lint|eslint)/.test(r))).toBe(true);
  });

  it('runs the golden-set tests', () => {
    expect(allRuns.some((r) => r.includes('scripts/golden-set/__tests__'))).toBe(true);
  });
});
