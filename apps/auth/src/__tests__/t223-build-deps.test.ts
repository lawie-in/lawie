/**
 * T-223 review round 1, must-fix: auth imports @lawie/email-client at runtime, and its dist is
 * gitignored, so CI's test-auth job and apps/auth/Dockerfile have to build it. This guards the
 * regression without running CI or Docker:
 *
 *  ci.yml      the `auth` paths filter includes packages/email-client/** (a change to the client
 *              re-runs auth); test-auth builds @lawie/email-client after install and the shared
 *              build and BEFORE it runs the auth tests.
 *  Dockerfile  both stages copy packages/email-client; the builder builds it before building auth;
 *              the production stage copies its dist from the builder.
 *
 * The files are parsed (YAML / Dockerfile instructions), not grepped, so a build step that only
 * appears in a comment, another job, or after the tests does not satisfy the check.
 * T223_CI_YML and T223_AUTH_DOCKERFILE point the test at a copy (used for mutation checks).
 * `yaml` is not a declared dependency of auth; it is already in the lockfile (hoisted).
 */
import fs from 'fs';
import path from 'path';

import { parse } from 'yaml';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const CI = process.env.T223_CI_YML ?? path.join(REPO, '.github', 'workflows', 'ci.yml');
const DOCKERFILE =
  process.env.T223_AUTH_DOCKERFILE ?? path.join(REPO, 'apps', 'auth', 'Dockerfile');

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  id?: string;
}
interface Workflow {
  jobs: Record<string, { steps?: Step[]; needs?: string[] | string }>;
}

const workflow = parse(fs.readFileSync(CI, 'utf8')) as Workflow;
const steps = (): Step[] => workflow.jobs['test-auth']?.steps ?? [];
const runs = (): string[] => steps().map((s) => s.run ?? '');
const idx = (re: RegExp): number => runs().findIndex((r) => re.test(r));

const INSTALL = /yarn install\b/;
const SHARED_BUILD = /yarn workspace @lawie\/shared build\b/;
const CLIENT_BUILD = /yarn workspace @lawie\/email-client build\b/;
const AUTH_TEST = /yarn workspace @lawie\/auth test\b/;

describe('T-223 CI: test-auth builds @lawie/email-client', () => {
  it('the test-auth job exists and runs the auth tests', () => {
    expect(steps().length).toBeGreaterThan(0);
    expect(idx(AUTH_TEST)).toBeGreaterThanOrEqual(0);
  });

  it('builds @lawie/email-client exactly once in test-auth', () => {
    expect(runs().filter((r) => CLIENT_BUILD.test(r))).toHaveLength(1);
  });

  it('the email-client build comes after install and the shared build, before the auth tests', () => {
    const [install, shared, client, test] = [INSTALL, SHARED_BUILD, CLIENT_BUILD, AUTH_TEST].map(
      idx,
    );
    expect(install).toBeGreaterThanOrEqual(0);
    expect(shared).toBeGreaterThan(install);
    expect(client).toBeGreaterThan(shared);
    expect(test).toBeGreaterThan(client);
  });

  it('the build step is a real run step, not a skipped one (no `if:` that could disable it)', () => {
    const s = steps().find((x) => CLIENT_BUILD.test(x.run ?? ''));
    expect(s).toBeDefined();
    expect((s as Record<string, unknown>).if).toBeUndefined();
    expect((s as Record<string, unknown>)['continue-on-error']).toBeUndefined();
  });
});

describe('T-223 CI: the auth paths filter includes packages/email-client/**', () => {
  function authFilter(): string[] {
    const cs = workflow.jobs['changes']?.steps ?? [];
    const filterStep = cs.find((s) => s.id === 'filter');
    expect(filterStep).toBeDefined();
    // dorny/paths-filter takes its filters as a YAML document inside a string.
    const filters = parse(String(filterStep?.with?.filters)) as Record<string, string[]>;
    return filters.auth ?? [];
  }

  it('keeps apps/auth/** and adds packages/email-client/**', () => {
    const f = authFilter();
    expect(f).toContain('apps/auth/**');
    expect(f).toContain('packages/email-client/**');
  });

  it('test-auth is gated on the auth filter output (so the filter above is what triggers it)', () => {
    const job = workflow.jobs['test-auth'] as { if?: string; needs?: string[] | string };
    expect(String(job.if)).toContain('needs.changes.outputs.auth');
  });
});

/** Dockerfile instructions with line continuations joined, split into stages. */
function stages(): Array<{ name: string; instructions: string[] }> {
  const joined = fs.readFileSync(DOCKERFILE, 'utf8').replace(/\\\r?\n/g, ' ');
  const out: Array<{ name: string; instructions: string[] }> = [];
  for (const line of joined.split(/\r?\n/)) {
    const t = line.trim().replace(/\s+/g, ' ');
    if (!t || t.startsWith('#')) continue;
    const from = /^FROM\s+\S+(?:\s+AS\s+(\S+))?/i.exec(t);
    if (from) out.push({ name: (from[1] ?? '').toLowerCase(), instructions: [] });
    else if (out.length) out[out.length - 1].instructions.push(t);
  }
  return out;
}

describe('T-223 Dockerfile: apps/auth builds and ships @lawie/email-client', () => {
  const stage = (name: string) => {
    const s = stages().find((x) => x.name === name);
    expect(s).toBeDefined();
    return (s as { instructions: string[] }).instructions;
  };

  it('has a builder and a production stage', () => {
    expect(stages().map((s) => s.name)).toEqual(['builder', 'production']);
  });

  it('builder: copies the client manifest before install and its source before the build', () => {
    const ins = stage('builder');
    const manifest = ins.findIndex((i) =>
      /^COPY packages\/email-client\/package\.json \.\/packages\/email-client\/$/.test(i),
    );
    const install = ins.findIndex((i) => /^RUN yarn install\b/.test(i));
    const source = ins.findIndex((i) =>
      /^COPY packages\/email-client\/ \.\/packages\/email-client\/$/.test(i),
    );
    const build = ins.findIndex((i) => CLIENT_BUILD.test(i) && /^RUN\b/.test(i));
    expect(manifest).toBeGreaterThanOrEqual(0);
    expect(install).toBeGreaterThan(manifest);
    expect(source).toBeGreaterThan(install);
    expect(build).toBeGreaterThan(source);
  });

  it('builder: email-client is built after shared and before auth (one RUN or in order)', () => {
    const run = stage('builder')
      .filter((i) => /^RUN\b/.test(i) && /workspace/.test(i))
      .join(' && ');
    const at = (re: RegExp) => run.search(re);
    expect(at(/@lawie\/shared build/)).toBeGreaterThanOrEqual(0);
    expect(at(/@lawie\/email-client build/)).toBeGreaterThan(at(/@lawie\/shared build/));
    expect(at(/@lawie\/auth build/)).toBeGreaterThan(at(/@lawie\/email-client build/));
  });

  it('production: copies the client manifest before the production install', () => {
    const ins = stage('production');
    const manifest = ins.findIndex((i) =>
      /^COPY packages\/email-client\/package\.json \.\/packages\/email-client\/$/.test(i),
    );
    const install = ins.findIndex((i) => /^RUN yarn install\b.*--production/.test(i));
    expect(manifest).toBeGreaterThanOrEqual(0);
    expect(install).toBeGreaterThan(manifest);
  });

  it('production: copies the built client dist from the builder', () => {
    expect(stage('production')).toContain(
      'COPY --from=builder /app/packages/email-client/dist ./packages/email-client/dist',
    );
  });

  it('is consistent with the email-worker Dockerfile, which already does the same', () => {
    const worker = fs.readFileSync(path.join(REPO, 'apps', 'email-worker', 'Dockerfile'), 'utf8');
    expect(worker).toContain('packages/email-client/dist');
    expect(worker).toMatch(/@lawie\/email-client build/);
  });
});

describe('T-223 build deps: why these checks exist', () => {
  it('auth really depends on @lawie/email-client at runtime (a dependency, not a devDependency)', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO, 'apps', 'auth', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.['@lawie/email-client']).toBeDefined();
  });

  it('the client dist is gitignored (so CI must build it)', () => {
    const ignore = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^\/?(\*\*\/)?dist\/?$/m);
  });
});
