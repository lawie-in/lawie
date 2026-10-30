import fs from 'node:fs';
import path from 'node:path';

/**
 * T-698: a docs-only push to develop_staging used to cancel the Scripts tests run of a code merge
 * (one per-ref group with cancel-in-progress). The workflow now has a `changes` job that decides
 * code vs docs-only, and the scripts-tests job takes its concurrency group from that.
 *
 * Reads only .github/workflows/scripts-tests.yml (never handoff/). js-yaml and picomatch are
 * transitive dependencies (hoisted, not declared at the root), the same way t688-test-tiers.test.ts
 * uses js-yaml. picomatch is what dorny/paths-filter uses for globs; minimatch was not needed.
 */
// No @types for either package; they load as untyped modules, so the shapes are declared here.
import yamlModule = require('js-yaml');
import picomatchModule = require('picomatch');

const yaml = yamlModule as unknown as { load: (s: string) => any };
const picomatch = picomatchModule as unknown as (
  glob: string,
  opts?: { dot?: boolean },
) => (file: string) => boolean;

const ROOT = path.resolve(__dirname, '..', '..');
const wf = yaml.load(
  fs.readFileSync(path.join(ROOT, '.github/workflows/scripts-tests.yml'), 'utf8'),
);
const on = wf.on;
const changes = wf.jobs.changes;
const tests = wf.jobs['scripts-tests'];

const CODE_FILTER = ['**', '!handoff/**', '!.claude/docs/**', '!docs/**', '!**/*.md'];

/** The `code: [...]` filter, read back from the one-line inline YAML in `with.filters`. */
const filterStep = changes.steps[1];
const filters = yaml.load(filterStep.with.filters) as { code: string[] };

/**
 * Behavioural model of dorny/paths-filter with predicate-quantifier 'every': a changed file is in
 * the filter if it satisfies EVERY pattern (a '!x' pattern is satisfied by files not matching x);
 * the filter output is true if any changed file is in it. Globs use picomatch with dot:true, as
 * paths-filter does (so .claude/** and .github/** are matched).
 */
function codeOutput(files: string[], patterns: string[] = filters.code): 'true' | 'false' {
  const ms = patterns.map((p) => picomatch(p, { dot: true }));
  return files.some((f) => ms.every((m) => m(f))) ? 'true' : 'false';
}

/** Tiny evaluator for the `${{ ... }}` expressions used here (==, !=, &&, ||, string literals). */
function evalExpr(raw: string, ctx: Record<string, string>): any {
  const m = /^\$\{\{\s*(.*?)\s*\}\}$/.exec(raw);
  if (!m) throw new Error(`not a single expression: ${raw}`);
  const js = m[1].replace(/\b(?:github|needs|steps)(?:\.[A-Za-z_][A-Za-z0-9_-]*)+/g, (id) => {
    if (!(id in ctx)) throw new Error(`unknown context ${id}`);
    return JSON.stringify(ctx[id]);
  });
  return new Function(`return (${js});`)();
}

/** Evaluate the group and cancel-in-progress expressions for a run. */
function concurrencyFor(event: string, ref: string, sha: string, filterCode: string) {
  const codeOut = evalExpr(changes.outputs.code, {
    'github.event_name': event,
    'steps.filter.outputs.code': filterCode,
  });
  // The group expression is one `${{ }}` per ${{ }} part; evaluate each and join the literal text.
  const group = (tests.concurrency.group as string).replace(/\$\{\{.*?\}\}/g, (e) =>
    String(
      evalExpr(e, {
        'github.workflow': 'Scripts tests',
        'github.ref': ref,
        'github.sha': sha,
        'needs.changes.outputs.code': codeOut,
      }),
    ),
  );
  const cancel = evalExpr(tests.concurrency['cancel-in-progress'], {
    'needs.changes.outputs.code': codeOut,
  });
  return { codeOut, group, cancel };
}

const REF = 'refs/heads/develop_staging';
const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('T-698 changes job (docs-only detection)', () => {
  it('has two steps: checkout, then dorny/paths-filter@v3 (id filter), both only on push', () => {
    expect(changes.steps).toHaveLength(2);
    expect(String(changes.steps[0].uses)).toMatch(/^actions\/checkout@/);
    expect(changes.steps[0].if).toBe("github.event_name == 'push'");
    expect(changes.steps[1].uses).toBe('dorny/paths-filter@v3');
    expect(changes.steps[1].id).toBe('filter');
    expect(changes.steps[1].if).toBe("github.event_name == 'push'");
  });

  it('base is the pushed branch (github.ref_name), so the diff is against github.event.before', () => {
    // paths-filter v3 defaults base to the repo's default branch (main). On develop_staging that
    // would diff against main and see every code change on the branch, so a docs push would be
    // called "code". base == the pushed branch makes it diff against the commit before the push.
    expect(filterStep.with.base).toBe('${{ github.ref_name }}');
  });

  it("predicate-quantifier is 'every'", () => {
    expect(filterStep.with['predicate-quantifier']).toBe('every');
  });

  it('the code filter is exactly everything minus handoff, .claude/docs, docs and *.md', () => {
    expect(Object.keys(filters)).toEqual(['code']);
    expect(filters.code).toEqual(CODE_FILTER);
  });

  it('exposes the code output; non-push events are forced to the string true', () => {
    expect(changes.outputs.code).toBe(
      "${{ github.event_name != 'push' && 'true' || steps.filter.outputs.code }}",
    );
    for (const ev of ['pull_request', 'workflow_dispatch']) {
      // Even with the filter step skipped (empty output) or saying false.
      for (const out of ['', 'false']) {
        expect(
          evalExpr(changes.outputs.code, {
            'github.event_name': ev,
            'steps.filter.outputs.code': out,
          }),
        ).toBe('true');
      }
    }
    expect(
      evalExpr(changes.outputs.code, {
        'github.event_name': 'push',
        'steps.filter.outputs.code': 'false',
      }),
    ).toBe('false');
    expect(
      evalExpr(changes.outputs.code, {
        'github.event_name': 'push',
        'steps.filter.outputs.code': 'true',
      }),
    ).toBe('true');
  });

  it('scripts-tests needs changes', () => {
    expect(tests.needs).toBe('changes');
  });
});

describe('T-698 filter globs (picomatch, dot:true, every-semantics)', () => {
  it.each([
    ['handoff ticket', ['handoff/tickets/x.md']],
    ['docs file', ['docs/DEPLOY.md']],
    ['root CLAUDE.md', ['CLAUDE.md']],
    ['.claude/docs', ['.claude/docs/a.md']],
    ['nested README', ['scripts/ab/README.md']],
    ['non-md file under handoff', ['handoff/notes/x.txt']],
    [
      'all of them together',
      [
        'handoff/tickets/x.md',
        'docs/DEPLOY.md',
        'CLAUDE.md',
        '.claude/docs/a.md',
        'scripts/ab/README.md',
      ],
    ],
  ])('docs-only: %s -> code false', (_n, files) => {
    expect(codeOutput(files)).toBe('false');
  });

  it.each([
    ['scripts ts', ['scripts/x.ts']],
    ['.claude/settings.json', ['.claude/settings.json']],
    ['.claude hook', ['.claude/hooks/no-env-print.mjs']],
    ['workflow file', ['.github/workflows/ci.yml']],
    ['app source', ['apps/drafting/src/a.ts']],
    ['package.json', ['package.json']],
    ['mixed docs and code', ['docs/DEPLOY.md', 'scripts/x.ts']],
    ['mixed, code last', ['CLAUDE.md', 'handoff/tickets/x.md', 'apps/drafting/src/a.ts']],
  ])('code: %s -> code true', (_n, files) => {
    expect(codeOutput(files)).toBe('true');
  });

  it('an empty change set is not code', () => {
    expect(codeOutput([])).toBe('false');
  });
});

describe('T-698 concurrency groups (evaluated)', () => {
  it('docs-only push: per-SHA group, cancel-in-progress false', () => {
    const r = concurrencyFor('push', REF, SHA, 'false');
    expect(r.codeOut).toBe('false');
    expect(r.group).toBe(`Scripts tests-${REF}-${SHA}`);
    expect(r.group.endsWith(SHA)).toBe(true);
    expect(r.cancel).toBe(false);
  });

  it('two docs pushes never share a group (so neither cancels the other)', () => {
    const a = concurrencyFor('push', REF, SHA, 'false').group;
    const b = concurrencyFor('push', REF, 'f'.repeat(40), 'false').group;
    expect(a).not.toBe(b);
  });

  it('code push: per-ref "code" group, cancel-in-progress true', () => {
    const r = concurrencyFor('push', REF, SHA, 'true');
    expect(r.group).toBe(`Scripts tests-${REF}-code`);
    expect(r.group.endsWith('-code')).toBe(true);
    expect(r.cancel).toBe(true);
  });

  it('two code pushes to one ref share the group (the newer cancels the older)', () => {
    expect(concurrencyFor('push', REF, SHA, 'true').group).toBe(
      concurrencyFor('push', REF, 'e'.repeat(40), 'true').group,
    );
  });

  it('a docs group never equals the code group of the same ref', () => {
    expect(concurrencyFor('push', REF, SHA, 'false').group).not.toBe(
      concurrencyFor('push', REF, SHA, 'true').group,
    );
  });

  it.each(['pull_request', 'workflow_dispatch'])('%s is code: per-ref group, cancel true', (ev) => {
    // The filter step is skipped for these events, so its output is empty.
    const r = concurrencyFor(ev, 'refs/pull/7/merge', SHA, '');
    expect(r.codeOut).toBe('true');
    expect(r.group).toBe('Scripts tests-refs/pull/7/merge-code');
    expect(r.cancel).toBe(true);
  });
});

describe('T-698 triggers are unchanged', () => {
  it('on.push.paths still lists the docs paths the tests read and the scripts paths', () => {
    for (const p of ['handoff/**', 'CLAUDE.md', 'docs/DEPLOY.md', 'scripts/**']) {
      expect(on.push.paths).toContain(p);
    }
    // T-663: the scripts paths stay listed by name too.
    expect(on.push.paths).toContain('scripts/ci/prefetch-fonts.sh');
  });

  it('pull_request has no paths or paths-ignore filter', () => {
    expect(on.pull_request.paths).toBeUndefined();
    expect(on.pull_request['paths-ignore']).toBeUndefined();
  });

  it('there is no workflow-level concurrency', () => {
    expect(wf.concurrency).toBeUndefined();
  });
});

describe('T-698 test job is otherwise unchanged', () => {
  it('keeps its name and step order: install, shared build, yarn test:scripts last', () => {
    expect(tests.name).toBe('Run scripts tests');
    const runs: string[] = tests.steps.map((s: any) => s.run).filter(Boolean);
    expect(runs).toEqual([
      'yarn install --frozen-lockfile',
      'yarn workspace @lawie/shared build',
      'yarn test:scripts',
    ]);
    expect(tests.steps[tests.steps.length - 1].run).toBe('yarn test:scripts');
  });
});
