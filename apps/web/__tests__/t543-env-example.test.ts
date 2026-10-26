/**
 * T-543: `.env.example` is the single list of variable names, and every NEXT_PUBLIC_* the web app
 * reads must reach `next build` (build ARG in apps/web/Dockerfile + build.args in each compose file
 * that builds web). No Docker, no real env files: only `.env.example`, the Dockerfile, the compose
 * files and source text are read.
 */
import fs from 'fs';
import path from 'path';
// js-yaml ships no types here; the node build is used (the `yaml` package resolves to its ESM browser build under jsdom).
// @ts-expect-error TS7016: no declaration file for js-yaml
import { load } from 'js-yaml';

const YAML = { parse: (s: string): any => load(s) };

const REPO = path.resolve(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const GRIEVANCE = 'NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME';

// ── Dockerfile ───────────────────────────────────────────────────────────────

/** Instructions of the stage named `stage`, comments dropped, continuations joined. */
function stageInstructions(file: string, stage: string): string[] {
  const text = read(file).replace(/\\\r?\n/g, ' ');
  const out: string[] = [];
  let inside = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^FROM\s/i.test(line)) {
      inside = new RegExp(`\\sAS\\s+${stage}\\s*$`, 'i').test(line);
      continue;
    }
    if (inside) out.push(line);
  }
  return out;
}

/** Every NEXT_PUBLIC_* name the web app reads (src, next.config, instrumentation, sentry configs). */
function webPublicVarsRead(): string[] {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'node_modules' || e.name === '.next') continue;
        walk(full);
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) {
        // Only real reads: process.env.X or process.env['X'], not names in comments.
        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) names.add(m[1]);
        for (const m of src.matchAll(/process\.env\[\s*['"](NEXT_PUBLIC_[A-Z0-9_]+)['"]\s*\]/g))
          names.add(m[1]);
      }
    }
  };
  walk(path.join(REPO, 'apps', 'web', 'src'));
  for (const f of [
    'next.config.mjs',
    'instrumentation.ts',
    'instrumentation-client.ts',
    'sentry.server.config.ts',
    'sentry.edge.config.ts',
  ]) {
    const full = path.join(REPO, 'apps', 'web', f);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');
    for (const m of src.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) names.add(m[1]);
  }
  return [...names].sort();
}

describe('T-543 apps/web/Dockerfile build ARGs', () => {
  const builder = stageInstructions('apps/web/Dockerfile', 'builder');
  const idx = (re: RegExp) => builder.findIndex((i) => re.test(i));
  const buildStep = idx(/^RUN\b.*\byarn build\b/);

  it('has a builder stage with a build step', () => {
    expect(builder.length).toBeGreaterThan(0);
    expect(buildStep).toBeGreaterThanOrEqual(0);
  });

  it(`declares ARG ${GRIEVANCE} and the matching ENV before the build step`, () => {
    const arg = idx(new RegExp(`^ARG\\s+${GRIEVANCE}\\s*$`));
    const env = idx(new RegExp(`^ENV\\s+${GRIEVANCE}\\s*=\\s*"?\\$\\{?${GRIEVANCE}\\}?"?\\s*$`));
    expect(arg).toBeGreaterThanOrEqual(0);
    expect(env).toBeGreaterThanOrEqual(0);
    expect(arg).toBeLessThan(env);
    expect(env).toBeLessThan(buildStep);
  });

  it('keeps NEXT_PUBLIC_API_URL ARG/ENV before the build step', () => {
    const arg = idx(/^ARG\s+NEXT_PUBLIC_API_URL\s*$/);
    const env = idx(/^ENV\s+NEXT_PUBLIC_API_URL\s*=\s*"?\$\{?NEXT_PUBLIC_API_URL\}?"?\s*$/);
    expect(arg).toBeGreaterThanOrEqual(0);
    expect(env).toBeGreaterThan(arg);
    expect(env).toBeLessThan(buildStep);
  });

  it('gap guard: the web code reads at least the two known NEXT_PUBLIC_* names', () => {
    // Fails loudly if the scanner breaks and would make the guard below vacuous.
    expect(webPublicVarsRead()).toEqual(expect.arrayContaining(['NEXT_PUBLIC_API_URL', GRIEVANCE]));
  });

  it.each(webPublicVarsRead())(
    'gap guard: %s read by apps/web has a Dockerfile ARG and ENV before build',
    (name) => {
      const arg = idx(new RegExp(`^ARG\\s+${name}\\s*$`));
      const env = idx(new RegExp(`^ENV\\s+${name}\\s*=`));
      expect(arg).toBeGreaterThanOrEqual(0);
      expect(env).toBeGreaterThanOrEqual(0);
      expect(env).toBeLessThan(buildStep);
    },
  );
});

// ── Compose files ────────────────────────────────────────────────────────────

const composeFiles = fs.readdirSync(REPO).filter((f) => /^docker-compose.*\.ya?ml$/.test(f));

/** Compose services whose build uses apps/web/Dockerfile. */
function webBuilds(file: string): { service: string; args: Record<string, string> }[] {
  const doc = YAML.parse(read(file));
  const out: { service: string; args: Record<string, string> }[] = [];
  for (const [service, def] of Object.entries<any>(doc.services ?? {})) {
    const b = def?.build;
    if (b && typeof b === 'object' && /apps\/web\/Dockerfile$/.test(b.dockerfile ?? '')) {
      out.push({ service, args: (b.args ?? {}) as Record<string, string> });
    }
  }
  return out;
}

describe('T-543 compose build.args for web', () => {
  it('finds the compose files', () => {
    expect(composeFiles).toEqual(
      expect.arrayContaining([
        'docker-compose.yml',
        'docker-compose.demo.yml',
        'docker-compose.staging.yml',
      ]),
    );
  });

  it('at least docker-compose.yml and docker-compose.demo.yml build web', () => {
    expect(webBuilds('docker-compose.yml').length).toBeGreaterThan(0);
    expect(webBuilds('docker-compose.demo.yml').length).toBeGreaterThan(0);
  });

  describe.each(composeFiles)('%s', (file) => {
    const builds = webBuilds(file);
    if (builds.length === 0) {
      it('builds no web image, nothing to wire', () => {
        expect(builds).toEqual([]);
      });
      return;
    }
    it.each(builds.map((b) => [b.service, b]))(
      'service %s passes the grievance name with an empty default',
      (_s, b) => {
        expect(b.args[GRIEVANCE]).toBe(`\${${GRIEVANCE}:-}`);
      },
    );
    it.each(builds.map((b) => [b.service, b]))(
      'service %s passes an arg for every Dockerfile NEXT_PUBLIC_* ARG',
      (_s, b) => {
        const dockerArgs = stageInstructions('apps/web/Dockerfile', 'builder')
          .map((i) => /^ARG\s+(NEXT_PUBLIC_[A-Z0-9_]+)\s*$/.exec(i)?.[1])
          .filter(Boolean) as string[];
        for (const name of dockerArgs) expect(Object.keys(b.args)).toContain(name);
      },
    );
  });
});

// ── .env.example ─────────────────────────────────────────────────────────────

const exampleLines = read('.env.example').split(/\r?\n/);

/** Variable lines: NAME=value, or a commented-out `# NAME=value` (an optional name left unset on purpose). */
interface Entry {
  name: string;
  value: string;
  line: number; // 0-based
  commented: boolean;
}
const entries: Entry[] = [];
exampleLines.forEach((l, i) => {
  const live = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(l);
  if (live) return void entries.push({ name: live[1], value: live[2], line: i, commented: false });
  const off = /^#\s([A-Z][A-Z0-9_]*)=(.*)$/.exec(l);
  if (off) entries.push({ name: off[1], value: off[2], line: i, commented: true });
});

describe('T-543 .env.example names', () => {
  it('parses a plausible number of names', () => {
    expect(entries.length).toBeGreaterThanOrEqual(70);
  });

  it('every name appears exactly once (live or commented-out)', () => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
    const dupes = [...counts].filter(([, n]) => n > 1).map(([k]) => k);
    expect(dupes).toEqual([]);
    // No stray second mention in assignment form anywhere else in the file.
    const assignments = exampleLines.filter((l) => /^#?\s*[A-Z][A-Z0-9_]*=/.test(l));
    expect(assignments.length).toBe(entries.length);
  });

  it('every name has a non-empty comment line directly above it', () => {
    const bad = entries
      .filter((e) => {
        const above = exampleLines[e.line - 1] ?? '';
        return !/^#\s*\S/.test(above) || /^#\s[A-Z][A-Z0-9_]*=/.test(above);
      })
      .map((e) => e.name);
    expect(bad).toEqual([]);
  });

  it('comment lines say what the variable is and who reads it', () => {
    const bad = entries
      .filter((e) => !/Read by:|Set by|Also reads/.test(exampleLines[e.line - 1] ?? ''))
      .map((e) => e.name);
    expect(bad).toEqual([]);
  });

  it('all NEXT_PUBLIC_* entries are present and the web header marks them build-time', () => {
    const text = exampleLines.join('\n');
    expect(entries.map((e) => e.name)).toEqual(expect.arrayContaining(webPublicVarsRead()));
    expect(text).toMatch(/BUILD-TIME: every NEXT_PUBLIC_\* value/);
    for (const e of entries.filter((x) => x.name.startsWith('NEXT_PUBLIC_'))) {
      expect(exampleLines[e.line - 1]).toMatch(/BUILD-TIME/);
    }
  });

  it('grievance entry carries the ticket wording, with no name in it', () => {
    const e = entries.find((x) => x.name === GRIEVANCE);
    expect(e).toBeDefined();
    expect(e!.value).toBe('');
    const c = exampleLines[e!.line - 1];
    expect(c).toMatch(/rebuild web/i);
    expect(c).toContain('For complaints, write to contact@lawie.in.');
    expect(c).toContain('AJ-517-M21');
  });

  it('removed names are gone', () => {
    const names = entries.map((e) => e.name);
    for (const gone of [
      'GATEWAY_PORT',
      'AUTH_PORT',
      'DRAFTING_PORT',
      'BILLING_PORT',
      'MONGO_ROOT_USER',
      'MONGO_ROOT_PASS',
    ])
      expect(names).not.toContain(gone);
  });
});

describe('T-543 .env.example holds no real value', () => {
  const secretish = [
    /sk-ant/i,
    /rzp_live/i,
    /rzp_test_[A-Za-z0-9]{6,}/,
    /AKIA[0-9A-Z]{12,}/,
    /AIza[0-9A-Za-z_-]{20,}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /-----BEGIN/,
    /[A-Fa-f0-9]{32,}/, // long hex
    /[A-Za-z0-9+/_-]{32,}={0,2}/, // long base64 / base64url
  ];

  it.each(entries.map((e) => [e.name, e.value]))(
    '%s value looks like a placeholder',
    (_n, value) => {
      for (const re of secretish) expect(value).not.toMatch(re);
    },
  );

  it('no line anywhere (including comments) matches a secret pattern', () => {
    // The comments mention the *prefixes* rzp_test_... / rzp_live_...; those carry no body.
    const hits = exampleLines.filter((l) =>
      [
        /sk-ant-[A-Za-z0-9_-]{10,}/,
        /rzp_(live|test)_[A-Za-z0-9]{6,}/,
        /AKIA[0-9A-Z]{12,}/,
        /[A-Fa-f0-9]{40,}/,
      ].some((re) => re.test(l)),
    );
    expect(hits).toEqual([]);
  });

  it('secret variables are empty', () => {
    const secrets = [
      'INTERNAL_SECRET',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
      'ANTHROPIC_API_KEY',
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
      'GOOGLE_CLIENT_SECRET',
      'AWS_SES_ACCESS_KEY_ID',
      'AWS_SES_SECRET_ACCESS_KEY',
      'SMTP_PASS',
      'SMTP_USER',
    ];
    for (const s of secrets) {
      const e = entries.find((x) => x.name === s);
      expect(e).toBeDefined();
      expect(e!.value).toBe('');
    }
  });
});

describe('T-543 every service config name is in .env.example', () => {
  const names = new Set(entries.map((e) => e.name));
  const services = ['gateway', 'auth', 'drafting', 'billing', 'email-worker'];

  it.each(services)('apps/%s/src/config/env.ts schema keys', (svc) => {
    const src = read('apps', svc, 'src', 'config', 'env.ts');
    const keys = [...src.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):\s*(?:z|\n)/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(3); // the scan must see the schema
    const missing = keys.filter((k) => !names.has(k));
    expect(missing).toEqual([]);
  });
});
