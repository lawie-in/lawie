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
function loadConfig(ws: string): { projects: Project[] } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(path.join(ROOT, ws, 'jest.config.js'));
}
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
      const expected =
        ws === 'apps/web'
          ? ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']
          : ['**/__tests__/**/*.test.ts'];
      expect(full).toEqual(expected);
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

    it('no t373-* or t115a/b/c file is in sanity', () => {
      expect(names.filter((n) => /^t373-/.test(n) || /^t115[abc]/.test(n))).toEqual([]);
    });

    it('sanity has no wildcard entries that could pull in may-move files', () => {
      expect(project('apps/drafting', 'sanity').testMatch.filter(isGlob)).toEqual([]);
    });
  });
});

describe('T-688 ci.yml', () => {
  const ci = readYaml('.github/workflows/ci.yml');
  const jobs = Object.entries<any>(ci.jobs);
  const stepRuns = (job: any): string[] => (job.steps ?? []).map((s: any) => String(s.run ?? ''));

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

  it('runs web lint', () => {
    expect(allRuns.some((r) => /@lawie\/web (lint|eslint)/.test(r))).toBe(true);
  });

  it('runs the golden-set tests', () => {
    expect(allRuns.some((r) => r.includes('scripts/golden-set/__tests__'))).toBe(true);
  });
});
