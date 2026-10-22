/**
 * T-533 static checks: workflows, prod compose, .dockerignore, Dockerfiles, no-secrets.
 * Parses the real files; nothing here talks to AWS, GitHub or Docker.
 */
import fs from 'fs';

import {
  evalIf,
  isDockerIgnored,
  jobsThatRun,
  loadYaml,
  readRepo,
  repoPath,
} from './helpers/pipeline';

const APPS = ['gateway', 'auth', 'drafting', 'billing', 'email-worker', 'web'];
const FORBIDDEN = ['handoff', '.claude', 'CLAUDE.md', '.github/copilot-instructions.md'];

const deploy = loadYaml('.github/workflows/deploy-production.yml');
const guard = loadYaml('.github/workflows/main-guard.yml');
const release = loadYaml('.github/workflows/release-to-main.yml');
const compose = loadYaml('docker-compose.prod.yml');

// YAML 1.1 parsers read the key `on` as boolean true; `yaml` v2 keeps it as 'on'.
const triggers = (wf: any) => wf.on ?? wf[true as any];

describe('evalIf (test helper sanity)', () => {
  it('handles absent vars, ==, !=, &&, ||, parens, !', () => {
    expect(evalIf("vars.A == 'true'", {})).toBe(false);
    expect(evalIf("vars.A != 'true'", {})).toBe(true);
    expect(evalIf("vars.A == 'true'", { 'vars.A': 'true' })).toBe(true);
    expect(evalIf("(vars.A == 'x' || vars.B == 'y') && !(vars.C == 'z')", { 'vars.B': 'y' })).toBe(
      true,
    );
    expect(evalIf("vars.A == 'x' || vars.B == 'y' && vars.C == 'z'", { 'vars.A': 'x' })).toBe(true);
    expect(evalIf(undefined, {})).toBe(true);
  });
});

describe('deploy-production.yml: switch (AC2, AC3, AC5)', () => {
  const jobs = deploy.jobs;

  it('has exactly the expected jobs', () => {
    expect(Object.keys(jobs).sort()).toEqual(
      ['build', 'deploy', 'explain', 'main-guard-check', 'promote', 'rollback'].sort(),
    );
  });

  it('every job has a job-level if; no job runs unconditionally', () => {
    for (const [name, job] of Object.entries<any>(jobs)) {
      expect({ name, hasIf: typeof job.if === 'string' }).toEqual({ name, hasIf: true });
    }
  });

  it('build-side jobs check PIPELINE_BUILD_ENABLED == true', () => {
    for (const j of ['main-guard-check', 'build', 'promote', 'deploy', 'rollback']) {
      expect(String(jobs[j].if)).toContain("vars.PIPELINE_BUILD_ENABLED == 'true'");
    }
  });

  it('deploy and rollback also check PIPELINE_DEPLOY_ENABLED == true', () => {
    for (const j of ['deploy', 'rollback']) {
      expect(String(jobs[j].if)).toContain("vars.PIPELINE_DEPLOY_ENABLED == 'true'");
    }
    for (const j of ['main-guard-check', 'build', 'promote']) {
      expect(String(jobs[j].if)).not.toContain('PIPELINE_DEPLOY_ENABLED');
    }
  });

  it('workflow_dispatch has choice input action (build|deploy|rollback) and string input sha', () => {
    const inputs = triggers(deploy).workflow_dispatch.inputs;
    expect(inputs.action.type).toBe('choice');
    expect(inputs.action.options).toEqual(['build', 'deploy', 'rollback']);
    expect(inputs.sha).toBeDefined();
    expect(inputs.sha.required).toBeFalsy();
  });

  it('push trigger is main only', () => {
    expect(triggers(deploy).push.branches).toEqual(['main']);
  });

  it('deploy needs main-guard-check, build and promote; rollback needs main-guard-check', () => {
    expect([].concat(jobs.deploy.needs).sort()).toEqual(['build', 'main-guard-check', 'promote']);
    expect(jobs.rollback.needs).toContain('main-guard-check');
    expect(jobs.build.needs).toContain('main-guard-check');
    expect(jobs.promote.needs).toEqual(expect.arrayContaining(['main-guard-check', 'build']));
  });

  it('deploy and rollback use the production environment', () => {
    expect(jobs.deploy.environment).toBe('production');
    expect(jobs.rollback.environment).toBe('production');
  });

  it('builds all six images in a matrix', () => {
    expect([...jobs.build.strategy.matrix.svc].sort()).toEqual([...APPS].sort());
  });

  type Case = { name: string; ctx: Record<string, string>; runs: string[] };
  const push = { 'github.event_name': 'push' };
  const dispatch = (action: string) => ({
    'github.event_name': 'workflow_dispatch',
    'inputs.action': action,
  });
  const on = 'true';
  const cases: Case[] = [
    { name: 'push, both absent: no job at all (AC3)', ctx: { ...push }, runs: [] },
    {
      name: 'push, both false strings: no job at all',
      ctx: {
        ...push,
        'vars.PIPELINE_BUILD_ENABLED': 'false',
        'vars.PIPELINE_DEPLOY_ENABLED': 'false',
      },
      runs: [],
    },
    {
      name: 'push, build on, deploy absent: guard, build, promote; no deploy',
      ctx: { ...push, 'vars.PIPELINE_BUILD_ENABLED': on },
      runs: ['main-guard-check', 'build', 'promote'],
    },
    {
      name: 'push, build absent, deploy on: only explain',
      ctx: { ...push, 'vars.PIPELINE_DEPLOY_ENABLED': on },
      runs: ['explain'],
    },
    {
      name: 'push, both on: guard, build, promote, deploy',
      ctx: { ...push, 'vars.PIPELINE_BUILD_ENABLED': on, 'vars.PIPELINE_DEPLOY_ENABLED': on },
      runs: ['main-guard-check', 'build', 'promote', 'deploy'],
    },
    {
      name: 'dispatch build, both absent: only explain',
      ctx: { ...dispatch('build') },
      runs: ['explain'],
    },
    {
      name: 'dispatch deploy, build absent, deploy on: only explain',
      ctx: { ...dispatch('deploy'), 'vars.PIPELINE_DEPLOY_ENABLED': on },
      runs: ['explain'],
    },
    {
      name: 'dispatch rollback, build absent, deploy on: only explain (rollback respects build var)',
      ctx: { ...dispatch('rollback'), 'vars.PIPELINE_DEPLOY_ENABLED': on },
      runs: ['explain'],
    },
    {
      name: 'dispatch build, build on, deploy absent: guard, build, promote',
      ctx: { ...dispatch('build'), 'vars.PIPELINE_BUILD_ENABLED': on },
      runs: ['main-guard-check', 'build', 'promote'],
    },
    {
      name: 'dispatch build, both on: no deploy',
      ctx: {
        ...dispatch('build'),
        'vars.PIPELINE_BUILD_ENABLED': on,
        'vars.PIPELINE_DEPLOY_ENABLED': on,
      },
      runs: ['main-guard-check', 'build', 'promote'],
    },
    {
      name: 'dispatch deploy, both on: guard, build, promote, deploy',
      ctx: {
        ...dispatch('deploy'),
        'vars.PIPELINE_BUILD_ENABLED': on,
        'vars.PIPELINE_DEPLOY_ENABLED': on,
      },
      runs: ['main-guard-check', 'build', 'promote', 'deploy'],
    },
    {
      name: 'dispatch deploy, build on, deploy absent: no deploy, explain says why',
      ctx: { ...dispatch('deploy'), 'vars.PIPELINE_BUILD_ENABLED': on },
      runs: ['main-guard-check', 'build', 'promote', 'explain'],
    },
    {
      name: 'dispatch rollback, both on: guard and rollback; no build, no promote, no deploy',
      ctx: {
        ...dispatch('rollback'),
        'vars.PIPELINE_BUILD_ENABLED': on,
        'vars.PIPELINE_DEPLOY_ENABLED': on,
      },
      runs: ['main-guard-check', 'rollback'],
    },
    {
      name: 'dispatch rollback, build on, deploy absent: rollback does not run, explain says why',
      ctx: { ...dispatch('rollback'), 'vars.PIPELINE_BUILD_ENABLED': on },
      runs: ['main-guard-check', 'explain'],
    },
  ];

  it.each(cases)('truth table: $name', ({ ctx, runs }) => {
    expect(jobsThatRun(deploy, ctx).sort()).toEqual([...runs].sort());
  });

  it('a push never reaches rollback, and rollback never builds', () => {
    for (const b of [undefined, 'true']) {
      for (const d of [undefined, 'true']) {
        const ctx: Record<string, string> = { ...push };
        if (b) ctx['vars.PIPELINE_BUILD_ENABLED'] = b;
        if (d) ctx['vars.PIPELINE_DEPLOY_ENABLED'] = d;
        expect(jobsThatRun(deploy, ctx)).not.toContain('rollback');
      }
    }
  });
});

describe('deploy-production.yml: AWS access and permissions (AC6)', () => {
  const awsJobs = ['build', 'promote', 'deploy', 'rollback'];

  it('each AWS-touching job has id-token: write and uses OIDC role-to-assume from vars', () => {
    for (const j of awsJobs) {
      const job = deploy.jobs[j];
      expect({ j, idToken: job.permissions?.['id-token'] }).toEqual({ j, idToken: 'write' });
      const step = job.steps.find((s: any) =>
        String(s.uses).startsWith('aws-actions/configure-aws-credentials@'),
      );
      expect({ j, found: !!step }).toEqual({ j, found: true });
      expect(step.with['role-to-assume']).toMatch(/\$\{\{\s*vars\.[A-Z_]+\s*\}\}/);
      expect(step.with['aws-access-key-id']).toBeUndefined();
      expect(step.with['aws-secret-access-key']).toBeUndefined();
    }
  });

  it('workflow default permissions are read-only (no id-token at top level)', () => {
    expect(deploy.permissions).toEqual({ contents: 'read' });
  });

  it('the guard and explain jobs get no AWS role', () => {
    for (const j of ['explain', 'main-guard-check']) {
      expect(JSON.stringify(deploy.jobs[j])).not.toContain('configure-aws-credentials');
    }
  });

  it('build scans each image with check-image-no-handoff.sh BEFORE pushing', () => {
    const steps: any[] = deploy.jobs.build.steps;
    const scan = steps.findIndex((s) => String(s.run ?? '').includes('check-image-no-handoff.sh'));
    const push = steps.findIndex((s) => /docker push/.test(String(s.run ?? '')));
    expect(scan).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(scan);
    const buildStep = steps.find((s) =>
      String(s.uses ?? '').startsWith('docker/build-push-action'),
    );
    expect(buildStep.with.push).toBe(false);
    expect(buildStep.with.load).toBe(true);
  });

  it('images are tagged sha-<commit> and `main` moves only in promote via deploy-prod.sh retag', () => {
    expect(deploy.jobs.build.env.IMAGE).toMatch(/lawie-prod-\$\{\{ matrix\.svc \}\}:sha-/);
    const run = deploy.jobs.promote.steps.map((s: any) => s.run ?? '').join('\n');
    expect(run).toContain('deploy-prod.sh retag');
    expect(JSON.stringify(deploy.jobs.build)).not.toMatch(/:main\b/);
  });
});

describe('main-guard.yml (AC11)', () => {
  it('triggers on push to main with no paths / paths-ignore filter', () => {
    const t = triggers(guard);
    expect(t.push.branches).toContain('main');
    expect(t.push['paths-ignore']).toBeUndefined();
    expect(t.push.paths).toBeUndefined();
    expect(JSON.stringify(guard)).not.toMatch(/paths-ignore/);
  });

  it('has a job whose id and name are main-guard', () => {
    expect(guard.jobs['main-guard']).toBeDefined();
    expect(guard.jobs['main-guard'].name).toBe('main-guard');
    expect(guard.jobs['main-guard'].if).toBeUndefined();
  });

  it('is dispatchable (release-to-main starts it, GITHUB_TOKEN pushes trigger nothing)', () => {
    expect(triggers(guard).workflow_dispatch).toBeDefined();
  });

  it('names the four forbidden paths and fails when any exists', () => {
    const run = guard.jobs['main-guard'].steps.map((s: any) => s.run ?? '').join('\n');
    for (const p of FORBIDDEN) expect(run).toContain(p);
    expect(run).toMatch(/exit 1/);
  });

  it('deploy-production has a main-guard-check job that names the same four paths', () => {
    const run = deploy.jobs['main-guard-check'].steps.map((s: any) => s.run ?? '').join('\n');
    for (const p of FORBIDDEN) expect(run).toContain(p);
    expect(run).toMatch(/exit 1/);
    expect(run).toContain('merge-base --is-ancestor');
  });
});

describe('release-to-main.yml (AC10)', () => {
  const job = release.jobs[Object.keys(release.jobs)[0]];
  const script = job.steps.map((s: any) => s.run ?? '').join('\n');

  it('is workflow_dispatch only, with required string input version', () => {
    expect(Object.keys(triggers(release))).toEqual(['workflow_dispatch']);
    const v = triggers(release).workflow_dispatch.inputs.version;
    expect(v.required).toBe(true);
    expect(v.type).toBe('string');
  });

  it('has exactly one job and it uses the production environment', () => {
    expect(Object.keys(release.jobs)).toHaveLength(1);
    expect(job.environment).toBe('production');
  });

  it('permissions include contents: write and actions: write', () => {
    expect(release.permissions.contents).toBe('write');
    expect(release.permissions.actions).toBe('write');
  });

  it('checks out develop', () => {
    const co = job.steps.find((s: any) => String(s.uses).startsWith('actions/checkout'));
    expect(co.with.ref).toBe('develop');
  });

  it('removes the four forbidden paths from the index and the working tree', () => {
    for (const p of FORBIDDEN) expect(script).toContain(p);
    expect(script).toMatch(/git rm .*--cached/);
    expect(script).toMatch(/rm -rf handoff \.claude CLAUDE\.md \.github\/copilot-instructions\.md/);
  });

  it('keeps the rest of .github (workflows) in the release tree', () => {
    expect(script).not.toMatch(/rm -rf[^\n]*\s\.github(\s|$)/);
    expect(script).not.toMatch(/git rm[^\n]*\s\.github(\s|$)/);
  });

  it('commits "release: v<version> from develop@<sha>" and tags v<version>', () => {
    expect(script).toContain('tag="v$VERSION"');
    expect(script).toMatch(/git commit [^\n]*-m "release: \$tag from develop@\$dev_sha"/);
    expect(script).toMatch(/git tag -a "\$tag"/);
  });

  it('validates the version as semver without a leading v', () => {
    expect(script).toContain('^[0-9]+\\.[0-9]+\\.[0-9]+');
  });

  it('pushes main and the tag atomically, never forced', () => {
    expect(script).toMatch(/git push --atomic origin refs\/heads\/main "refs\/tags\/\$TAG"/);
    const pushes = script.split('\n').filter((l) => /git push/.test(l));
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).not.toMatch(/--force|\s-f\s|\+refs/);
  });

  it('dispatches main-guard and deploy-production (action=deploy) with GITHUB_TOKEN', () => {
    expect(script).toMatch(/gh workflow run main-guard\.yml/);
    expect(script).toMatch(/gh workflow run deploy-production\.yml[^\n]*-f action=deploy/);
    const step = job.steps.find((s: any) => String(s.run ?? '').includes('gh workflow run'));
    expect(step.env.GH_TOKEN).toBe('${{ github.token }}');
    expect(JSON.stringify(release)).not.toMatch(/secrets\.(?!GITHUB_TOKEN)/);
  });

  it('is the only way main gets content: no merge, no pull-request creation', () => {
    expect(script).not.toMatch(/git merge\b/);
    expect(script).not.toMatch(/gh pr /);
  });
});

describe('docker-compose.prod.yml', () => {
  const svc = compose.services;

  it('has redis plus the six app services', () => {
    expect(Object.keys(svc).sort()).toEqual(['redis', ...APPS].sort());
  });

  it.each(APPS)('%s: ECR image lawie-prod-%s, from ${ECR_REGISTRY}', (name) => {
    expect(svc[name].image).toMatch(
      new RegExp(`^\\$\\{ECR_REGISTRY(:\\?[^}]*)?\\}/lawie-prod-${name}:\\$\\{TAG(:-main)?\\}$`),
    );
  });

  it('every service has restart: unless-stopped', () => {
    for (const [n, s] of Object.entries<any>(svc)) {
      expect({ n, restart: s.restart }).toEqual({ n, restart: 'unless-stopped' });
    }
  });

  it.each(APPS)('%s: has a healthcheck that probes an HTTP endpoint', (name) => {
    const hc = svc[name].healthcheck;
    expect(hc).toBeDefined();
    expect(hc.test.join(' ')).toMatch(/http:\/\/(localhost|127\.0\.0\.1):\d+/);
    expect(hc.interval).toBeDefined();
    expect(hc.retries).toBeDefined();
  });

  it('redis: no published ports, appendonly yes, a data volume, a healthcheck', () => {
    const r = svc.redis;
    expect(r.ports).toBeUndefined();
    expect(r.command.join(' ')).toMatch(/--appendonly yes/);
    expect(r.volumes.join(' ')).toContain('/data');
    expect(r.healthcheck).toBeDefined();
    expect(compose.volumes).toHaveProperty('redis-data');
  });

  it('no service uses env_file', () => {
    for (const s of Object.values<any>(svc)) expect(s.env_file).toBeUndefined();
    expect(readRepo('docker-compose.prod.yml')).not.toMatch(/env_file/);
  });

  it.each(['gateway', 'auth', 'drafting', 'billing', 'email-worker'])(
    '%s: SECRETS_BACKEND=ssm and SECRETS_ENV=prod',
    (name) => {
      expect(svc[name].environment.SECRETS_BACKEND).toBe('ssm');
      expect(svc[name].environment.SECRETS_ENV).toBe('prod');
    },
  );

  it('web carries no secrets (only NODE_ENV, HOSTNAME, PORT; NEXT_PUBLIC_* are build-time)', () => {
    expect(Object.keys(svc.web.environment).sort()).toEqual(['HOSTNAME', 'NODE_ENV', 'PORT']);
  });

  it('no secret-looking values are inlined in compose environment', () => {
    for (const [n, s] of Object.entries<any>(svc)) {
      for (const k of Object.keys(s.environment ?? {})) {
        expect({
          n,
          k,
          bad: /SECRET_KEY|PASSWORD|API_KEY|TOKEN|MONGO|RAZORPAY|ANTHROPIC|JWT/.test(k),
        }).toEqual({
          n,
          k,
          bad: false,
        });
      }
    }
  });

  it('app ports are published on 127.0.0.1 only', () => {
    for (const name of APPS) {
      for (const p of svc[name].ports ?? []) expect(String(p)).toMatch(/^127\.0\.0\.1:/);
    }
  });

  it('app services wait for redis to be healthy', () => {
    for (const name of ['gateway', 'auth', 'drafting', 'billing', 'email-worker']) {
      expect(svc[name].depends_on.redis.condition).toBe('service_healthy');
    }
  });
});

describe('AC6: no AWS keys in GitHub, nothing references .env files', () => {
  const files = [
    '.github/workflows/deploy-production.yml',
    '.github/workflows/main-guard.yml',
    '.github/workflows/release-to-main.yml',
    'docker-compose.prod.yml',
    'scripts/deploy-prod.sh',
    'scripts/check-image-no-handoff.sh',
    'docs/DEPLOY.md',
  ];

  it.each(files)('%s has no AWS key material', (f) => {
    const text = readRepo(f);
    expect(text).not.toMatch(/AWS_ACCESS_KEY/);
    expect(text).not.toMatch(/AWS_SECRET_ACCESS_KEY/);
    expect(text).not.toMatch(/aws-access-key-id/i);
    expect(text).not.toMatch(/aws-secret-access-key/i);
    expect(text).not.toMatch(/AWS_SESSION_TOKEN/);
  });

  // The implementation currently has zero occurrences of `.env` in these files, so the rule is
  // absolute: any `.env` reference (including a sentence saying it is not used) fails and must be
  // reviewed by a human. env_file and `source .env` style use is covered by the same pattern.
  it.each(files)('%s never references a .env file', (f) => {
    expect(readRepo(f)).not.toMatch(/\.env\b/);
    expect(readRepo(f)).not.toMatch(/env_file/);
  });

  it('no workflow reads or writes secrets.AWS_*', () => {
    for (const f of files.filter((x) => x.includes('workflows'))) {
      expect(readRepo(f)).not.toMatch(/secrets\.AWS_/);
    }
  });

  it('role and registry come from repository variables', () => {
    expect(readRepo('.github/workflows/deploy-production.yml')).toContain('vars.AWS_ROLE_ARN');
    expect(readRepo('.github/workflows/deploy-production.yml')).toContain('vars.ECR_REGISTRY');
  });
});

describe('AC9: no handoff docs in images', () => {
  const ignore = readRepo('.dockerignore');
  const lines = ignore.split('\n').map((l) => l.trim());
  const templatesAt = lines.indexOf('!docs/templates');

  it('keeps the docs/templates re-allow', () => {
    expect(templatesAt).toBeGreaterThan(-1);
    expect(lines).toContain('docs/');
    expect(lines.indexOf('docs/')).toBeLessThan(templatesAt);
  });

  it.each(['handoff/', '.claude/', 'CLAUDE.md', '.github/', '**/*.md'])(
    '.dockerignore has %s AFTER the !docs/templates line',
    (entry) => {
      const at = lines.lastIndexOf(entry);
      expect(at).toBeGreaterThan(templatesAt);
    },
  );

  it('no negation after the five new entries can re-include them', () => {
    const firstNew = lines.indexOf('handoff/');
    expect(lines.slice(firstNew).filter((l) => l.startsWith('!'))).toEqual([]);
  });

  it.each([
    'handoff/tickets/T-533.md',
    'handoff/ops/x.json',
    '.claude/agents/tester.md',
    '.claude/settings.json',
    'CLAUDE.md',
    '.github/copilot-instructions.md',
    '.github/workflows/ci.yml',
    'README.md',
    'apps/web/README.md',
    'packages/shared/docs/notes.md',
    'docs/DEPLOY.md',
    '.env',
    '.env.production',
  ])('ignored by Docker: %s', (f) => {
    expect(isDockerIgnored(ignore, f)).toBe(true);
  });

  it.each([
    'docs/templates/bail_regular.json',
    'docs/templates/rent_agreement.json',
    'apps/web/src/app/page.tsx',
    'apps/gateway/src/index.ts',
    'apps/drafting/package.json',
    'package.json',
    'yarn.lock',
    '.env.example',
  ])('still sent to Docker: %s', (f) => {
    expect(isDockerIgnored(ignore, f)).toBe(false);
  });

  it('every docs/templates file is JSON (so **/*.md cannot hide a template the app reads)', () => {
    const files = fs.readdirSync(repoPath('docs/templates'), { recursive: true }) as string[];
    const regular = files.filter((f) => fs.statSync(repoPath('docs/templates', f)).isFile());
    expect(regular.length).toBeGreaterThan(0);
    for (const f of regular) {
      expect(f.endsWith('.json')).toBe(true);
      expect(isDockerIgnored(ignore, `docs/templates/${f}`)).toBe(false);
    }
  });

  it.each(APPS)('apps/%s/Dockerfile has no `COPY . .` (any form)', (name) => {
    const df = readRepo(`apps/${name}/Dockerfile`);
    expect(df).not.toMatch(/^\s*COPY\s+(--\S+\s+)*\.\s+\.?\/?\s*$/m);
    expect(df).not.toMatch(/^\s*COPY\s+(--\S+\s+)*\.\/?\s+\S+/m);
    expect(df).not.toMatch(/^\s*ADD\s+\.\s/m);
  });

  it('apps/web/Dockerfile builder copies exactly package files, apps/web and packages/shared', () => {
    const df = readRepo('apps/web/Dockerfile');
    expect(df).toMatch(/COPY apps\/web\/ \.\/apps\/web\//);
    expect(df).toMatch(/COPY packages\/shared\/ \.\/packages\/shared\//);
    expect(df).toMatch(/COPY package\.json yarn\.lock \.\//);
  });
});
