import fs from 'node:fs';
import path from 'node:path';

/**
 * T-593 round 3: a tiny, STRICT parser for the block-YAML subset the workflow file uses, so
 * this test needs no `yaml` package (no root devDependency, no yarn.lock change). Supported:
 * 2-space-style indentation with spaces only; `key: value` and `key:` + nested block maps;
 * `- ` block sequences (an item may start a map: `- run: x` + more keys under it); inline
 * flow lists `[a, 'b']` of scalars; plain, 'single' and "double" quoted scalars; plain
 * true / false / null / ~ / integers; `#` comments (whole-line, or after whitespace outside
 * quotes). Anything else (tabs, block scalars | >, flow maps {}, anchors & aliases * tags !,
 * documents ---, duplicate keys, a sequence at its key's indent, bad indentation) throws, so
 * a workflow change the parser does not understand fails the test loudly instead of being
 * misread. `on` stays the string key "on" (no YAML 1.1 boolean folding).
 */
type Line = { indent: number; text: string; no: number };

function stripComment(s: string): string {
  let quote = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i);
    }
  }
  return s;
}

function toLines(src: string): Line[] {
  const out: Line[] = [];
  src.split(/\r?\n/).forEach((raw, idx) => {
    const no = idx + 1;
    if (/^\s*\t/.test(raw)) throw new Error(`yaml line ${no}: tab indentation`);
    const text = stripComment(raw).trimEnd();
    if (text.trim() === '') return;
    if (text.trim() === '---' || text.trim() === '...') {
      throw new Error(`yaml line ${no}: document markers are not supported`);
    }
    const indent = text.length - text.trimStart().length;
    out.push({ indent, text: text.trimStart(), no });
  });
  return out;
}

function scalar(raw: string, no: number): any {
  const s = raw.trim();
  if (s.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'$/.exec(s);
    if (!m) throw new Error(`yaml line ${no}: bad single-quoted scalar`);
    return m[1].replace(/''/g, "'");
  }
  if (s.startsWith('"')) {
    const m = /^"([^"\\]*)"$/.exec(s);
    if (!m) throw new Error(`yaml line ${no}: unsupported double-quoted scalar`);
    return m[1];
  }
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) throw new Error(`yaml line ${no}: unterminated flow list`);
    const body = s.slice(1, -1).trim();
    if (body === '') return [];
    const items: string[] = [];
    let cur = '';
    let quote = '';
    for (const c of body) {
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === "'" || c === '"') {
        quote = c;
      } else if (c === ',') {
        items.push(cur);
        cur = '';
        continue;
      } else if (c === '[' || c === '{') {
        throw new Error(`yaml line ${no}: nested flow collections are not supported`);
      }
      cur += c;
    }
    if (quote) throw new Error(`yaml line ${no}: unterminated quote in flow list`);
    items.push(cur);
    return items.map((it) => {
      if (it.trim() === '') throw new Error(`yaml line ${no}: empty flow list item`);
      return scalar(it, no);
    });
  }
  if (/^[{|>&*!%@`]/.test(s)) {
    throw new Error(`yaml line ${no}: unsupported scalar start "${s[0]}"`);
  }
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

/**
 * `key: rest` / `key:` -> [key, rest] for a plain key (letters, digits, `_ . / -`); a line
 * that is not a mapping entry -> null. An unquoted `: ` or trailing `:` that is not such a
 * key (e.g. `a b: c`, `'k': v`) throws rather than being read as a scalar.
 */
function splitKey(text: string, no: number): [string, string] | null {
  const m = /^([A-Za-z0-9_][A-Za-z0-9_./-]*):(?:\s+(.*))?$/.exec(text);
  if (m) return [m[1], m[2] ?? ''];
  if (/(?::\s|:$)/.test(stripQuoted(text))) {
    throw new Error(`yaml line ${no}: unsupported mapping key in "${text}"`);
  }
  return null;
}

/** The text with quoted spans blanked, so a `: ` inside quotes is not seen as a key colon. */
function stripQuoted(s: string): string {
  return s.replace(/'(?:[^']|'')*'|"[^"\\]*"/g, (q) => ' '.repeat(q.length));
}

function parseBlock(lines: Line[], i: number, indent: number): [any, number] {
  return lines[i].text === '-' || lines[i].text.startsWith('- ')
    ? parseSeq(lines, i, indent)
    : parseMap(lines, i, indent);
}

function parseMap(lines: Line[], i: number, indent: number): [any, number] {
  const obj: Record<string, any> = {};
  while (i < lines.length && lines[i].indent === indent) {
    const { text, no } = lines[i];
    if (text === '-' || text.startsWith('- ')) {
      throw new Error(`yaml line ${no}: sequence item inside a mapping`);
    }
    const kv = splitKey(text, no);
    if (!kv) throw new Error(`yaml line ${no}: expected "key: value", got "${text}"`);
    const [key, rest] = kv;
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new Error(`yaml line ${no}: duplicate key "${key}"`);
    }
    i += 1;
    if (rest !== '') {
      obj[key] = scalar(rest, no);
    } else if (i < lines.length && lines[i].indent > indent) {
      [obj[key], i] = parseBlock(lines, i, lines[i].indent);
    } else if (
      i < lines.length &&
      lines[i].indent === indent &&
      (lines[i].text === '-' || lines[i].text.startsWith('- '))
    ) {
      throw new Error(`yaml line ${lines[i].no}: sequence at its key's indent is not supported`);
    } else {
      obj[key] = null;
    }
  }
  if (i < lines.length && lines[i].indent > indent) {
    throw new Error(`yaml line ${lines[i].no}: unexpected indentation`);
  }
  return [obj, i];
}

function parseSeq(lines: Line[], i: number, indent: number): [any, number] {
  const arr: any[] = [];
  while (
    i < lines.length &&
    lines[i].indent === indent &&
    (lines[i].text === '-' || lines[i].text.startsWith('- '))
  ) {
    const { text, no } = lines[i];
    const content = text === '-' ? '' : text.slice(2);
    if (content.trim() === '') {
      i += 1;
      if (i >= lines.length || lines[i].indent <= indent) {
        throw new Error(`yaml line ${no}: empty sequence item`);
      }
      let v: any;
      [v, i] = parseBlock(lines, i, lines[i].indent);
      arr.push(v);
    } else if (content.startsWith(' ')) {
      throw new Error(`yaml line ${no}: more than one space after "-"`);
    } else if (splitKey(content, no)) {
      // `- key: v` starts a map whose keys sit at indent + 2 (the column of `key`).
      const copy = lines.slice();
      copy[i] = { indent: indent + 2, text: content, no };
      let v: any;
      [v, i] = parseMap(copy, i, indent + 2);
      arr.push(v);
    } else {
      arr.push(scalar(content, no));
      i += 1;
    }
  }
  if (i < lines.length && lines[i].indent > indent) {
    throw new Error(`yaml line ${lines[i].no}: unexpected indentation`);
  }
  return [arr, i];
}

function parseWorkflowYaml(src: string): any {
  const lines = toLines(src);
  if (lines.length === 0 || lines[0].indent !== 0) throw new Error('yaml: empty or indented');
  const [doc, end] = parseMap(lines, 0, 0);
  if (end !== lines.length) throw new Error(`yaml line ${lines[end].no}: trailing content`);
  return doc;
}

// T-593: the Scripts tests workflow is the only CI that runs scripts/__tests__. These tests pin
// its name and job name (branch protection requires the job's check-run name), triggers, paths
// and the command it runs.
const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW_REL = '.github/workflows/scripts-tests.yml';
const wf = parseWorkflowYaml(fs.readFileSync(path.join(ROOT, WORKFLOW_REL), 'utf8'));
const on = wf.on;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('scripts-tests workflow', () => {
  it('is named "Scripts tests"', () => {
    expect(wf.name).toBe('Scripts tests');
  });

  it('has exactly one job, id scripts-tests, named "Run scripts tests"', () => {
    expect(Object.keys(wf.jobs)).toEqual(['scripts-tests']);
    expect(wf.jobs['scripts-tests'].name).toBe('Run scripts tests');
    // Branch protection requires the job's check-run name ("Run scripts tests"); a PR's check
    // list displays it as "<workflow name> / <job name>", which is what the docs quote.
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

  it('push paths carry exactly the 6 T-688 extras (sanity-tier guard inputs)', () => {
    const extras = [
      'apps/*/jest.config.js',
      'packages/*/jest.config.js',
      'apps/*/package.json',
      'packages/*/package.json',
      '.github/workflows/ci.yml',
      '.github/workflows/full-tests.yml',
    ];
    for (const p of extras) expect(on.push.paths.filter((x: string) => x === p)).toHaveLength(1);
    expect(on.push.paths).toHaveLength(new Set(on.push.paths).size);
    expect(on.push.paths.slice(-extras.length)).toEqual(extras);
  });

  it('installs frozen with PUPPETEER_SKIP_DOWNLOAD "true" and runs yarn test:scripts', () => {
    const steps: any[] = wf.jobs['scripts-tests'].steps;
    const install = steps.find((s) => s.run === 'yarn install --frozen-lockfile');
    expect(install).toBeDefined();
    expect(install.env.PUPPETEER_SKIP_DOWNLOAD).toBe('true');
    expect(steps[steps.length - 1].run).toBe('yarn test:scripts');
    expect(steps.filter((s) => s.run === 'yarn test:scripts')).toHaveLength(1);
  });

  it('builds @lawie/shared once, after install and before yarn test:scripts (T-691 driver needs dist/)', () => {
    const steps: any[] = wf.jobs['scripts-tests'].steps;
    const idx = (cmd: string) => steps.findIndex((s) => s.run === cmd);
    const build = 'yarn workspace @lawie/shared build';
    expect(steps.filter((s) => s.run === build)).toHaveLength(1);
    expect(idx('yarn install --frozen-lockfile')).toBeGreaterThanOrEqual(0);
    expect(idx(build)).toBeGreaterThan(idx('yarn install --frozen-lockfile'));
    expect(idx(build)).toBeLessThan(idx('yarn test:scripts'));
  });

  it('push paths include packages/shared/** and apps/drafting/src/** (T-691)', () => {
    expect(on.push.paths).toContain('packages/shared/**');
    expect(on.push.paths).toContain('apps/drafting/src/**');
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
