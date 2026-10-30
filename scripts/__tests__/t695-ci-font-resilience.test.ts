import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * T-695 (CI font resilience): scripts/ci/prefetch-fonts.sh and scripts/ci/prefetch-fonts.build.sh.
 * No network: a temp dir with STUB `yarn` and `curl` is first on PATH, sleeps are 0, logs go to a
 * temp dir, invocations are counted in a counter file. The repo scripts are only read and run.
 *
 * Fail-first: the same scenario checks are run against MUTATED COPIES of the build wrapper
 * (no PIPESTATUS, retry on every failure, no retry cap) and must report problems.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const BUILD_SH = path.join(ROOT, 'scripts', 'ci', 'prefetch-fonts.build.sh');
const PREFETCH_SH = path.join(ROOT, 'scripts', 'ci', 'prefetch-fonts.sh');
const read = (p: string) => fs.readFileSync(p, 'utf8');

const ERROR_LINE =
  '::error::Web build failed twice on a Google Fonts fetch error (fonts.googleapis.com unreachable or blocked)';
const FONT_ERR = 'Failed to fetch `Lora` from Google Fonts.';
const TS_ERR =
  "src/app/page.tsx(12,3): error TS2322: Type 'string' is not assignable to type 'number'.";

const tmpDirs: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 't695ci-'));
  tmpDirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

interface Attempt {
  code: number;
  out: string;
}
interface Opts {
  builds: Attempt[]; // attempt n uses builds[n-1]; the last one repeats
  curl?: 'ok' | 'fail28' | 'fail6';
  script?: string; // the build wrapper to run (default: the repo one)
  prefetchScript?: string; // PREFETCH_FONTS_SCRIPT
}
interface Result {
  status: number | null;
  stdout: string;
  builds: number;
  curlCalls: string[];
  lines: string[];
  dir: string;
}

const STUB_YARN = `#!/usr/bin/env bash
d="$STUB_DIR"
n=$(( $(cat "$d/yarn-count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$d/yarn-count"
f="$d/build-$n"; [ -f "$f.out" ] || f="$d/build-last"
cat "$f.out"
exit "$(cat "$f.code")"
`;
// ok: a tiny css naming two font urls for css2 requests, bytes for font files; failN: curl's own exit code
const STUB_CURL = `#!/usr/bin/env bash
d="$STUB_DIR"
out=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2;;
    -A|--connect-timeout|--max-time|--retry|--retry-delay|--retry-max-time) shift 2;;
    -*) shift;;
    *) url="$1"; shift;;
  esac
done
echo "$url" >> "$d/curl-calls"
case "$CURL_MODE" in
  fail28) exit 28;;
  fail6) exit 6;;
esac
case "$url" in
  *css2*) printf "@font-face{src:url(https://fonts.gstatic.com/s/a.woff2) format('woff2');}\\n@font-face{src:url(https://fonts.gstatic.com/s/b.woff2) format('woff2');}\\n" > "$out";;
  *) printf 'FONTBYTES' > "$out";;
esac
exit 0
`;

function run(o: Opts): Result {
  const dir = mk();
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'yarn'), STUB_YARN, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'curl'), STUB_CURL, { mode: 0o755 });
  o.builds.forEach((b, i) => {
    fs.writeFileSync(path.join(dir, `build-${i + 1}.out`), `${b.out}\n`);
    fs.writeFileSync(path.join(dir, `build-${i + 1}.code`), String(b.code));
  });
  const last = o.builds[o.builds.length - 1];
  fs.writeFileSync(path.join(dir, 'build-last.out'), `${last.out}\n`);
  fs.writeFileSync(path.join(dir, 'build-last.code'), String(last.code));
  const env: Record<string, string> = {
    PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
    HOME: dir,
    STUB_DIR: dir,
    CURL_MODE: o.curl ?? 'ok',
    FONT_RETRY_SLEEP: '0',
    FONT_CURL_RETRY_DELAY: '0',
    FONT_PREFETCH_BUDGET: '30',
    FONT_RETRY_PREFETCH_BUDGET: '30',
    FONT_PREFETCH_DIR: path.join(dir, 'fonts'),
    WEB_BUILD_LOG_DIR: path.join(dir, 'logs'),
    ...(o.prefetchScript ? { PREFETCH_FONTS_SCRIPT: o.prefetchScript } : {}),
  };
  const r = spawnSync('bash', [o.script ?? BUILD_SH], { env, encoding: 'utf8', timeout: 60_000 });
  const count = (f: string) => (fs.existsSync(path.join(dir, f)) ? read(path.join(dir, f)) : '');
  const stdout = `${r.stdout}${r.stderr}`;
  return {
    status: r.status,
    stdout,
    builds: Number(count('yarn-count').trim() || 0),
    curlCalls: count('curl-calls').split('\n').filter(Boolean),
    lines: stdout.split('\n'),
    dir,
  };
}

const ok = { code: 0, out: 'build ok' };
const failFont = { code: 3, out: FONT_ERR };
const failTs = { code: 3, out: TS_ERR };

// ── scenario checks: each returns the list of problems (empty = the script behaves) ───────────
const checks: Record<string, (s: string) => string[]> = {
  recovery: (script) => {
    const r = run({ script, builds: [failFont, ok] });
    const p: string[] = [];
    if (r.status !== 0) p.push(`exit ${r.status}`);
    if (r.builds !== 2) p.push(`builds ${r.builds}`);
    if (!r.lines.some((l) => l.startsWith('::warning::') && /retrying once/.test(l)))
      p.push('no retry warning');
    return p;
  },
  nonFont: (script) => {
    const r = run({ script, builds: [failTs] });
    const p: string[] = [];
    if (r.status === 0) p.push('exit 0 on a failed build');
    if (r.status !== 3) p.push(`exit ${r.status}, not the build's 3`);
    if (r.builds !== 1) p.push(`builds ${r.builds}`);
    return p;
  },
  twice: (script) => {
    const r = run({ script, builds: [failFont, failFont] });
    const p: string[] = [];
    if (r.status !== 3) p.push(`exit ${r.status}`);
    if (r.builds !== 2) p.push(`builds ${r.builds}`);
    if (r.lines.filter((l) => l === ERROR_LINE).length !== 1)
      p.push('::error:: line not exactly once');
    return p;
  },
};

describe('T-695 build wrapper: scenarios', () => {
  it('1 fonts reachable, build passes: exit 0, one build, no ::error::', () => {
    const r = run({ builds: [ok] });
    expect(r.status).toBe(0);
    expect(r.builds).toBe(1);
    expect(r.stdout).not.toContain('::error::');
    expect(r.stdout).not.toContain('retrying');
    expect(r.stdout).toMatch(/prefetch-fonts: css 6\/6 ok/);
  });

  it('2 first build fails on a font fetch error, then passes: exit 0, two builds, retry warning (AC3)', () => {
    const r = run({ builds: [failFont, ok] });
    expect(r.status).toBe(0);
    expect(r.builds).toBe(2);
    expect(r.lines.some((l) => l.startsWith('::warning::') && l.includes('retrying once'))).toBe(
      true,
    );
    expect(r.stdout).toContain('passed on the retry');
    expect(r.stdout).not.toContain('::error::');
    expect(checks.recovery(BUILD_SH)).toEqual([]);
  });

  it('3 a non-font failure (TypeScript error): non-zero with the build status, one build, no retry', () => {
    const r = run({ builds: [failTs] });
    expect(r.status).toBe(3);
    expect(r.builds).toBe(1);
    expect(r.stdout).toContain('not a Google Fonts fetch error: no retry');
    expect(r.stdout).not.toContain('::warning::Web build hit');
    expect(checks.nonFont(BUILD_SH)).toEqual([]);
  });

  it('4 a font error twice: non-zero, two builds, exactly one ::error:: line with the exact text', () => {
    const r = run({ builds: [failFont, failFont] });
    expect(r.status).toBe(3);
    expect(r.builds).toBe(2);
    expect(r.lines.filter((l) => l === ERROR_LINE)).toHaveLength(1);
    expect(r.lines.filter((l) => l.startsWith('::error::'))).toHaveLength(1);
    expect(checks.twice(BUILD_SH)).toEqual([]);
  });

  it('5 a font error, then a non-font failure on the retry: two builds, non-zero, no ::error::', () => {
    const r = run({ builds: [failFont, failTs] });
    expect(r.status).toBe(3);
    expect(r.builds).toBe(2);
    expect(r.stdout).not.toContain('::error::');
    expect(r.stdout).toContain('retry failed');
  });

  it.each([
    ['28', 'fail28'],
    ['6', 'fail6'],
  ] as const)(
    '6 curl unreachable (exit %s) with a font error then a pass: exit 0, two builds',
    (_c, mode) => {
      const r = run({ builds: [failFont, ok], curl: mode });
      expect(r.status).toBe(0);
      expect(r.builds).toBe(2);
      expect(r.stdout).toContain('::warning::Google Fonts prefetch incomplete');
    },
  );

  it('6 curl unreachable and the build passes: exit 0, one build (offline prefetch never fails the job)', () => {
    const r = run({ builds: [ok], curl: 'fail28' });
    expect(r.status).toBe(0);
    expect(r.builds).toBe(1);
  });

  it('6 curl unreachable and the build fails on fonts twice: fails loudly (the only loud case)', () => {
    const r = run({ builds: [failFont, failFont], curl: 'fail28' });
    expect(r.status).not.toBe(0);
    expect(r.lines.filter((l) => l === ERROR_LINE)).toHaveLength(1);
  });

  it('8 the retry happens only once even if the log keeps matching', () => {
    const r = run({ builds: [failFont] }); // the last attempt repeats
    expect(r.builds).toBe(2);
  });
});

describe('T-695 prefetch-fonts.sh alone', () => {
  const runPrefetch = (curl: 'ok' | 'fail28') => {
    const dir = mk();
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'curl'), STUB_CURL, { mode: 0o755 });
    const r = spawnSync('bash', [PREFETCH_SH], {
      env: {
        PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        HOME: dir,
        STUB_DIR: dir,
        CURL_MODE: curl,
        FONT_PREFETCH_DIR: path.join(dir, 'fonts'),
        FONT_PREFETCH_BUDGET: '30',
        FONT_CURL_RETRY_DELAY: '0',
      },
      encoding: 'utf8',
      timeout: 60_000,
    });
    const calls = fs.existsSync(path.join(dir, 'curl-calls'))
      ? read(path.join(dir, 'curl-calls')).split('\n').filter(Boolean)
      : [];
    return { r, calls, dir };
  };

  it('curl failing: exit 0 and a ::warning::', () => {
    const { r } = runPrefetch('fail28');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('::warning::Google Fonts prefetch incomplete');
    expect(r.stdout).toMatch(/css 0\/6 ok/);
  });

  it('curl succeeding: downloads the 6 css files and the url(...) font files each names; reports css 6/6', () => {
    const { r, calls, dir } = runPrefetch('ok');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/css 6\/6 ok, font files 12\/12 ok/);
    expect(r.stdout).not.toContain('::warning::');
    expect(calls.filter((c) => c.includes('/css2?'))).toHaveLength(6);
    expect(calls.filter((c) => c === 'https://fonts.gstatic.com/s/a.woff2')).toHaveLength(6);
    expect(calls.filter((c) => c === 'https://fonts.gstatic.com/s/b.woff2')).toHaveLength(6);
    expect(
      fs.readdirSync(path.join(dir, 'fonts')).filter((f) => f.startsWith('css-')),
    ).toHaveLength(6);
    expect(
      fs.readdirSync(path.join(dir, 'fonts')).filter((f) => f.startsWith('font-')),
    ).toHaveLength(12);
  });

  it('FONTS_CSS_BASE and FONTS_CSS_QUERIES are honoured (no network host in the calls)', () => {
    const dir = mk();
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'curl'), STUB_CURL, { mode: 0o755 });
    const r = spawnSync('bash', [PREFETCH_SH], {
      env: {
        PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        STUB_DIR: dir,
        CURL_MODE: 'ok',
        FONTS_CSS_BASE: 'http://localhost:1/css2',
        FONTS_CSS_QUERIES: 'family=A\nfamily=B',
        FONT_PREFETCH_DIR: path.join(dir, 'f'),
      },
      encoding: 'utf8',
    });
    expect(r.stdout).toMatch(/css 2\/2 ok/);
    const calls = read(path.join(dir, 'curl-calls')).split('\n');
    expect(calls).toContain('http://localhost:1/css2?family=A');
  });
});

describe('T-695 7: every font-error pattern triggers the retry; unrelated errors do not', () => {
  const FONT_LINES = [
    'GET https://fonts.googleapis.com/css2?family=Lora failed',
    'https://fonts.gstatic.com/s/lora/v1/x.woff2 ETIMEDOUT',
    'Failed to fetch `Lora` from Google Fonts.',
    'There was an issue establishing a connection while requesting https://fonts.googleapis.com/css2?family=Fraunces',
    'Module not found: Error in next/font/google/target.css',
    '@vercel/turbopack-next/internal/font/google/foo.js',
    '[next]/internal/font/google/lora_abc.module.css',
    'Module not found: lora_1a2b.module.css',
  ];
  it.each(FONT_LINES)('retries on: %s', (line) => {
    const r = run({ builds: [{ code: 1, out: line }, ok] });
    expect(r.builds).toBe(2);
    expect(r.status).toBe(0);
  });

  const OTHER = [
    TS_ERR,
    "Module not found: Can't resolve '@/components/Foo'",
    'JavaScript heap out of memory',
    'Failed to compile.',
  ];
  it.each(OTHER)('does not retry on: %s', (line) => {
    const r = run({ builds: [{ code: 1, out: line }, ok] });
    expect(r.builds).toBe(1);
    expect(r.status).toBe(1);
  });
});

describe('T-695 fail-first: the checks catch mutated copies of the wrapper', () => {
  const mutate = (from: string, to: string, ...more: string[]): string => {
    const dir = mk();
    const src = read(BUILD_SH);
    let out = src.replace(from, to);
    for (let i = 0; i < more.length; i += 2) out = out.replace(more[i], more[i + 1]);
    expect(out).not.toBe(src); // the mutation must apply
    const file = path.join(dir, 'prefetch-fonts.build.sh');
    fs.writeFileSync(file, out, { mode: 0o755 });
    return file;
  };

  it('the unmutated wrapper passes all three scenario checks', () => {
    expect(checks.recovery(BUILD_SH)).toEqual([]);
    expect(checks.nonFont(BUILD_SH)).toEqual([]);
    expect(checks.twice(BUILD_SH)).toEqual([]);
  });

  it('without the PIPESTATUS check a failed build is reported as passed (tee status)', () => {
    // pipefail off too, so the pipeline status is tee's, as in a wrapper without the PIPESTATUS read
    const m = mutate('status=${PIPESTATUS[0]}', 'status=$?', 'set -euo pipefail', 'set -eu');
    expect(checks.nonFont(m).length).toBeGreaterThan(0);
  });

  it('retrying on every failure is caught (a TypeScript error builds twice)', () => {
    const m = mutate('if ! is_font_error "$LOG_DIR/web-build-1.log"; then', 'if false; then');
    expect(checks.nonFont(m).length).toBeGreaterThan(0);
  });

  it('without the retry cap a font error keeps building (more than two builds)', () => {
    const m = mutate(
      'build 2 || status=$?',
      'x=0; while true; do build 2 || status=$?; [ "$status" -eq 0 ] && break; x=$((x+1)); [ "$x" -ge 3 ] && break; done',
    );
    expect(checks.twice(m).length).toBeGreaterThan(0);
  });
});

describe('T-695 9: static checks on ci.yml and the scripts', () => {
  const ci = read(path.join(ROOT, '.github', 'workflows', 'ci.yml'));
  const jobStart = ci.indexOf('\n  web-build:');
  const rest = ci.slice(jobStart + 1);
  const next = rest.slice(1).search(/\n {2}[A-Za-z0-9_-]+:\s*\n/);
  const job = next === -1 ? rest : rest.slice(0, next + 1);
  const buildStep = (() => {
    const i = job.indexOf('- name: Build');
    const tail = job.slice(i + 1);
    const n = tail.search(/\n {6}- /);
    return job.slice(i, n === -1 ? undefined : i + 1 + n);
  })();

  it('the Build step runs the wrapper, keeps NODE_ENV production, and times out within 5 minutes', () => {
    expect(jobStart).toBeGreaterThan(0);
    expect(buildStep).toMatch(/run:\s*bash scripts\/ci\/prefetch-fonts\.build\.sh\s*$/m);
    expect(buildStep).toMatch(/NODE_ENV:\s*production/);
    const t = /timeout-minutes:\s*(\d+)/.exec(buildStep);
    expect(t).not.toBeNull();
    expect(Number(t![1])).toBeLessThanOrEqual(5);
  });

  it('the web-build job timeout is still <= 5 minutes', () => {
    const t = /^ {4}timeout-minutes:\s*(\d+)/m.exec(job);
    expect(t).not.toBeNull();
    expect(Number(t![1])).toBeLessThanOrEqual(5);
  });

  it('the scripts print no environment (no env, printenv, export -p, declare -p, set -x)', () => {
    for (const f of [BUILD_SH, PREFETCH_SH]) {
      const code = read(f)
        .split('\n')
        .filter((l) => !/^\s*#/.test(l))
        .join('\n');
      expect(code).not.toMatch(/(^|[;&|(\s])(env|printenv)(\s|$|;)/m);
      expect(code).not.toMatch(/\b(export|declare)\s+-p\b/);
      expect(code).not.toMatch(/\bset\s+-[a-z]*x/);
    }
  });

  /** The css2 query next/font/google makes for one call, from its options. */
  const queryOf = (fn: string, opts: string): string => {
    const family = fn.replace(/_/g, '+');
    const w = /weight:\s*(\[[^\]]*\]|'[^']*')/.exec(opts)?.[1];
    const weights = w ? [...w.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort() : [];
    const axes = /axes:\s*\[([^\]]*)\]/.exec(opts)?.[1];
    const axesList = axes ? [...axes.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    let spec: string;
    if (weights.length > 0) spec = `wght@${weights.join(';')}`;
    else if (family === 'Inter' && axesList.length === 0) spec = 'wght@100..900';
    else if (family === 'Fraunces' && axesList.join(',') === 'opsz')
      spec = 'opsz,wght@9..144,100..900';
    else throw new Error(`unknown variable-font spec for ${family} ${axesList.join(',')}`);
    return `family=${family}:${spec}&display=swap`;
  };

  it('the css2 URLs in prefetch-fonts.sh match the next/font/google calls in both layouts', () => {
    const layouts = [
      path.join(ROOT, 'apps', 'web', 'src', 'app', 'layout.tsx'),
      path.join(ROOT, 'apps', 'web', 'src', 'app', '(marketing)', 'layout.tsx'),
    ].map(read);
    const wanted = new Set<string>();
    for (const src of layouts) {
      const imp = /import\s*\{([^}]*)\}\s*from\s*'next\/font\/google'/.exec(src);
      if (!imp) continue; // a layout moved to next/font/local has nothing to prefetch
      const names = imp[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const fn of names) {
        for (const m of src.matchAll(new RegExp(`=\\s*${fn}\\(\\{([\\s\\S]*?)\\}\\)`, 'g'))) {
          wanted.add(queryOf(fn, m[1]));
        }
      }
    }
    const def = /DEFAULT_QUERIES='([^']*)'/.exec(read(PREFETCH_SH));
    expect(def).not.toBeNull();
    const have = new Set(def![1].split('\n').filter(Boolean));
    expect([...have].sort()).toEqual([...wanted].sort());
  });
});

describe('T-695 10 (AC2): no app code change', () => {
  it('no file under apps/web/src mentions prefetch-fonts', () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'node_modules') walk(p);
        } else if (
          /\.(ts|tsx|js|jsx|mjs|css|json)$/.test(e.name) &&
          read(p).includes('prefetch-fonts')
        ) {
          hits.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, 'apps', 'web', 'src'));
    expect(hits).toEqual([]);
  });
});
