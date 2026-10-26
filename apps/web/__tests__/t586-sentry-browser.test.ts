// T-586: browser-side Sentry init (instrumentation-client.ts), release from SENTRY_RELEASE and an
// explicit environment on server and edge, and the build plumbing (Dockerfile, compose).
// Only dummy DSNs are used. No network: @sentry/nextjs is mocked.
import fs from 'fs';
import path from 'path';

const mockInit = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureRouterTransitionStart: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const TOKEN = 'a1b2c3d4'.repeat(8);
const DUMMY_DSN = 'https://dummykey@localhost/1';

const KEYS = [
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
  'SENTRY_DSN',
  'SENTRY_RELEASE',
  'SENTRY_ENVIRONMENT',
  'NODE_ENV',
] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) if (k !== 'NODE_ENV') delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else (process.env as Record<string, string>)[k] = saved[k] as string;
  }
});
const setEnv = (k: string, v: string) => ((process.env as Record<string, string>)[k] = v);

async function loadClient() {
  mockInit.mockClear();
  jest.resetModules();
  const mod = await import('../instrumentation-client');
  return { mod, calls: mockInit.mock.calls };
}
async function loadConfig(file: 'server' | 'edge') {
  mockInit.mockClear();
  jest.resetModules();
  if (file === 'server') await import('../sentry.server.config');
  else await import('../sentry.edge.config');
  return mockInit.mock.calls[0][0] as Any;
}

const fakeEvent = () => ({
  transaction: `GET /review/${TOKEN}?x=1`,
  request: {
    url: `https://lawie.in/review/${TOKEN}?x=1`,
    data: 'document body',
    cookies: { s: 'c' },
    headers: {
      host: 'lawie.in',
      authorization: 'Bearer jwt-secret',
      cookie: 's=c',
      'x-user-email': 'priya@example.com',
    },
  },
  breadcrumbs: [{ message: `GET /review/${TOKEN}`, data: { url: `/review/${TOKEN}?a=b` } }],
  contexts: { nextjs: { request_path: `/review/${TOKEN}?a=b` } },
});

describe('T-586 AC1 browser init guard (instrumentation-client.ts)', () => {
  it('does not call Sentry.init with the DSN unset', async () => {
    const { calls } = await loadClient();
    expect(calls).toHaveLength(0);
  });

  it('does not call Sentry.init with an empty DSN', async () => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    const { calls } = await loadClient();
    expect(calls).toHaveLength(0);
  });

  it('does not read the server-only SENTRY_DSN', async () => {
    setEnv('SENTRY_DSN', DUMMY_DSN);
    const { calls } = await loadClient();
    expect(calls).toHaveLength(0);
  });

  it('still exports onRouterTransitionStart without a DSN', async () => {
    const { mod } = await loadClient();
    expect(typeof mod.onRouterTransitionStart).toBe('function');
  });

  it('calls Sentry.init once with the DSN, no PII, and no replay, tracing, integrations or release', async () => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', DUMMY_DSN);
    const { calls } = await loadClient();
    expect(calls).toHaveLength(1);
    const opts = calls[0][0];
    expect(opts.dsn).toBe(DUMMY_DSN);
    expect(opts.sendDefaultPii).toBe(false);
    for (const k of [
      'replaysSessionSampleRate',
      'replaysOnErrorSampleRate',
      'tracesSampleRate',
      'integrations',
      'release',
    ]) {
      expect(opts).not.toHaveProperty(k);
    }
    expect(typeof opts.beforeSend).toBe('function');
    expect(typeof opts.beforeSendTransaction).toBe('function');
    expect(typeof opts.beforeBreadcrumb).toBe('function');
  });

  it('is enabled only in production', async () => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', DUMMY_DSN);
    setEnv('NODE_ENV', 'production');
    expect((await loadClient()).calls[0][0].enabled).toBe(true);
    setEnv('NODE_ENV', 'test');
    expect((await loadClient()).calls[0][0].enabled).toBe(false);
  });
});

describe('T-586 AC1 browser scrub', () => {
  it.each(['beforeSend', 'beforeSendTransaction'] as const)('%s scrubs the event', async (name) => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', DUMMY_DSN);
    const { calls } = await loadClient();
    const out = calls[0][0][name](fakeEvent());
    expect(Object.keys(out.request.headers)).toEqual(['host']);
    expect(out.request).not.toHaveProperty('data');
    expect(out.request).not.toHaveProperty('cookies');
    expect(out.request.url).toBe('https://lawie.in/review/[token]');
    expect(out.transaction).toBe('GET /review/[token]');
    expect(out.contexts.nextjs.request_path).toBe('/review/[token]');
    const json = JSON.stringify(out);
    for (const s of ['jwt-secret', 'priya@example.com', 'document body', TOKEN]) {
      expect(json).not.toContain(s);
    }
  });

  it('scrubEvent masks a token URL', async () => {
    const { mod } = await loadClient();
    const out = mod.scrubEvent(fakeEvent() as Any) as Any;
    expect(out.request.url).toBe('https://lawie.in/review/[token]');
  });

  it('filterBreadcrumb drops console breadcrumbs and the init option is wired to the filter', async () => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', DUMMY_DSN);
    const { mod, calls } = await loadClient();
    expect(mod.filterBreadcrumb({ category: 'console', message: 'doc text' })).toBeNull();
    const fetchCrumb = { category: 'fetch' };
    expect(mod.filterBreadcrumb(fetchCrumb)).toBe(fetchCrumb);
    expect(calls[0][0].beforeBreadcrumb({ category: 'console' })).toBeNull();
    // ui.click is dropped (aria-label text such as a document title)
    expect(calls[0][0].beforeBreadcrumb({ category: 'ui.click' })).toBeNull();
    expect(calls[0][0].maxBreadcrumbs).toBe(50);
  });
});

const TITLE = 'Sharma v State of UP';
const TOKEN2 = 'f0e1d2c3'.repeat(8);
const OBJ_ID = '507f1f77bcf86cd799439011';
const clickCrumb = () => ({
  category: 'ui.click',
  message: `button[aria-label="Delete ${TITLE}"]`,
});

describe('T-586 breadcrumb allowlist (leak: ui.click aria-label document titles)', () => {
  it('exports exactly the expected allowlist', async () => {
    const { mod } = await loadClient();
    expect([...mod.BREADCRUMB_CATEGORY_ALLOWLIST].sort()).toEqual(
      ['fetch', 'navigation', 'sentry.event', 'sentry.transaction', 'xhr'].sort(),
    );
  });

  it('keeps every allowlisted category', async () => {
    const { mod } = await loadClient();
    for (const category of mod.BREADCRUMB_CATEGORY_ALLOWLIST as string[]) {
      expect(mod.filterBreadcrumb({ category, message: 'm' })).not.toBeNull();
    }
  });

  it.each([['ui.click'], ['ui.input'], ['console'], ['custom'], ['sentry.other'], ['']])(
    'drops category %p',
    async (category) => {
      const { mod } = await loadClient();
      expect(mod.filterBreadcrumb({ category, message: 'x' })).toBeNull();
    },
  );

  it('drops a crumb with no category', async () => {
    const { mod } = await loadClient();
    expect(mod.filterBreadcrumb({ message: 'x' })).toBeNull();
  });

  it('drops a real-shaped ui.click crumb carrying a document title, via filter and init option', async () => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', DUMMY_DSN);
    const { mod, calls } = await loadClient();
    expect(mod.filterBreadcrumb(clickCrumb())).toBeNull();
    expect(calls[0][0].beforeBreadcrumb(clickCrumb())).toBeNull();
  });
});

describe('T-586 navigation breadcrumb scrub (leak: data.from / data.to)', () => {
  it('masks tokens and cuts query and hash in from and to', async () => {
    const { mod } = await loadClient();
    const out = mod.filterBreadcrumb({
      category: 'navigation',
      data: { from: `/review/${TOKEN}?x=1#h`, to: `/reset-password/${TOKEN2}?e=a@b.co` },
    }) as Any;
    expect(out.data.from).toBe('/review/[token]');
    expect(out.data.to).toBe('/reset-password/[token]');
    const json = JSON.stringify(out);
    for (const s of [TOKEN, TOKEN2, 'a@b.co', 'x=1', '#h']) expect(json).not.toContain(s);
  });

  it('masks an email inside the path', async () => {
    const { mod } = await loadClient();
    const out = mod.filterBreadcrumb({
      category: 'navigation',
      data: { from: '/users/priya@example.com/profile', to: '/dashboard' },
    }) as Any;
    expect(out.data.from).not.toContain('priya@example.com');
    expect(out.data.from).not.toContain('@example.com');
    expect(out.data.to).toBe('/dashboard');
  });

  it('removes a hash on a hash-only change', async () => {
    const { mod } = await loadClient();
    const out = mod.filterBreadcrumb({
      category: 'navigation',
      data: { from: '/dashboard', to: '/dashboard#secret-section' },
    }) as Any;
    expect(out.data).toEqual({ from: '/dashboard', to: '/dashboard' });
  });

  it('leaves non-string from/to and other data keys alone', async () => {
    const { mod } = await loadClient();
    const out = mod.filterBreadcrumb({
      category: 'navigation',
      data: { from: 5, to: null, other: 'keep' },
    }) as Any;
    expect(out.data).toEqual({ from: 5, to: null, other: 'keep' });
  });

  it('returns a navigation crumb with no data unchanged', async () => {
    const { mod } = await loadClient();
    const nav = { category: 'navigation', message: 'x' };
    expect(mod.filterBreadcrumb(nav)).toBe(nav);
  });

  it('does not mutate the input crumb', async () => {
    const { mod } = await loadClient();
    const input = {
      category: 'navigation',
      data: { from: `/review/${TOKEN}?x=1#h`, to: `/reset-password/${TOKEN2}?e=a@b.co` },
    };
    const before = JSON.parse(JSON.stringify(input));
    const out = mod.filterBreadcrumb(input);
    expect(input).toEqual(before);
    expect(out).not.toBe(input);
  });
});

describe('T-586 fetch/xhr breadcrumbs through the full beforeSend', () => {
  const run = async (crumbs: unknown[]) => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', DUMMY_DSN);
    const { calls } = await loadClient();
    const opts = calls[0][0];
    const kept = crumbs.map((c) => opts.beforeBreadcrumb(c)).filter(Boolean);
    return opts.beforeSend({ ...fakeEvent(), breadcrumbs: kept });
  };

  it.each(['fetch', 'xhr'])('%s url token, email and query are gone', async (category) => {
    const out = await run([
      {
        category,
        data: {
          method: 'GET',
          url: `https://lawie.in/review/${TOKEN}?email=priya@example.com&a=b`,
          status_code: 200,
        },
      },
    ]);
    expect(out.breadcrumbs).toHaveLength(1);
    const json = JSON.stringify(out.breadcrumbs);
    for (const s of [TOKEN, 'priya@example.com', 'email=', 'a=b', '?']) {
      expect(json).not.toContain(s);
    }
    expect(out.breadcrumbs[0].data.url).toBe('https://lawie.in/review/[token]');
  });

  it('document id path segments in fetch/xhr urls (real behaviour of the shared scrub)', async () => {
    const out = await run([
      { category: 'fetch', data: { method: 'GET', url: `/api/documents/${OBJ_ID}?x=1` } },
      { category: 'xhr', data: { method: 'GET', url: '/api/documents/12345?x=1' } },
    ]);
    const urls = out.breadcrumbs.map((b: Any) => b.data.url);
    // Query is cut. The ObjectId and numeric id are asserted as the shared scrub leaves them.
    expect(urls[0]).toBe(`/api/documents/${OBJ_ID}`);
    expect(urls[1]).toBe('/api/documents/12345');
  });
});

describe('T-586 full event: breadcrumb filter then beforeSend', () => {
  it('serialised result has no title, token, email or query', async () => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', DUMMY_DSN);
    const { calls } = await loadClient();
    const opts = calls[0][0];
    const crumbs = [
      clickCrumb(),
      {
        category: 'navigation',
        data: {
          from: `/review/${TOKEN}?x=1#h`,
          to: `/reset-password/${TOKEN2}?e=priya@example.com`,
        },
      },
      {
        category: 'fetch',
        data: {
          method: 'POST',
          url: `/api/share/${TOKEN}?email=priya@example.com`,
          status_code: 200,
        },
      },
    ].map((c) => opts.beforeBreadcrumb(c));
    expect(crumbs[0]).toBeNull();
    const out = opts.beforeSend({ ...fakeEvent(), breadcrumbs: crumbs.filter(Boolean) });
    expect(out.breadcrumbs).toHaveLength(2);
    const json = JSON.stringify(out);
    for (const s of [TITLE, 'Delete', TOKEN, TOKEN2, 'priya@example.com', 'x=1', 'email=', 'e=']) {
      expect(json).not.toContain(s);
    }
  });
});

describe('T-586 AC2 browser environment', () => {
  it('uses NEXT_PUBLIC_SENTRY_ENVIRONMENT', async () => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', DUMMY_DSN);
    setEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'staging');
    expect((await loadClient()).calls[0][0].environment).toBe('staging');
  });
  it.each(['', undefined])('falls back to NODE_ENV when it is %p', async (v) => {
    setEnv('NEXT_PUBLIC_SENTRY_DSN', DUMMY_DSN);
    if (v !== undefined) setEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', v);
    setEnv('NODE_ENV', 'production');
    expect((await loadClient()).calls[0][0].environment).toBe('production');
  });
});

describe.each(['server', 'edge'] as const)('T-586 AC2 sentry.%s.config', (file) => {
  it('sets release from SENTRY_RELEASE', async () => {
    setEnv('SENTRY_RELEASE', 'abc123');
    expect((await loadConfig(file)).release).toBe('abc123');
  });
  it('leaves the release key out when unset', async () => {
    expect(await loadConfig(file)).not.toHaveProperty('release');
  });
  it('leaves the release key out when empty', async () => {
    setEnv('SENTRY_RELEASE', '');
    expect(await loadConfig(file)).not.toHaveProperty('release');
  });
  it('uses SENTRY_ENVIRONMENT', async () => {
    setEnv('SENTRY_ENVIRONMENT', 'staging');
    expect((await loadConfig(file)).environment).toBe('staging');
  });
  it.each(['', undefined])('environment falls back to NODE_ENV when it is %p', async (v) => {
    if (v !== undefined) setEnv('SENTRY_ENVIRONMENT', v);
    setEnv('NODE_ENV', 'production');
    expect((await loadConfig(file)).environment).toBe('production');
  });
  it('keeps sendDefaultPii false and both scrub hooks', async () => {
    const opts = await loadConfig(file);
    expect(opts.sendDefaultPii).toBe(false);
    expect(typeof opts.beforeSend).toBe('function');
    expect(typeof opts.beforeSendTransaction).toBe('function');
    expect(opts.tracesSampleRate).toBe(0.2);
  });
  it('enabled toggles with NODE_ENV', async () => {
    setEnv('NODE_ENV', 'production');
    expect((await loadConfig(file)).enabled).toBe(true);
    setEnv('NODE_ENV', 'test');
    expect((await loadConfig(file)).enabled).toBe(false);
  });
});

describe('T-586 server and edge configs stay identical', () => {
  it('byte-identical', () => {
    const r = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    expect(r('sentry.edge.config.ts')).toBe(r('sentry.server.config.ts'));
  });
});

// ── AC3: build plumbing ─────────────────────────────────────────────────────
const REPO = path.resolve(__dirname, '..', '..', '..');
const NAMES = ['NEXT_PUBLIC_SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'SENTRY_RELEASE'];

describe('T-586 AC3 Dockerfile and compose', () => {
  const lines = fs
    .readFileSync(path.join(REPO, 'apps/web/Dockerfile'), 'utf8')
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const buildStep = lines.findIndex((l) => /^RUN\b.*\byarn build\b/.test(l));

  it('has a build step', () => expect(buildStep).toBeGreaterThanOrEqual(0));

  it.each(NAMES)('%s: ARG then ENV before RUN yarn build, names only', (name) => {
    const arg = lines.findIndex((l) => new RegExp(`^ARG\\s+${name}\\s*$`).test(l));
    const env = lines.findIndex((l) =>
      new RegExp(`^ENV\\s+${name}\\s*=\\s*"?\\$\\{?${name}\\}?"?\\s*$`).test(l),
    );
    expect(arg).toBeGreaterThanOrEqual(0);
    expect(env).toBeGreaterThan(arg);
    expect(env).toBeLessThan(buildStep);
  });

  it.each(NAMES)('docker-compose.yml web build args include %s with an empty default', (name) => {
    const text = fs.readFileSync(path.join(REPO, 'docker-compose.yml'), 'utf8');
    expect(text).toMatch(new RegExp(`^\\s+${name}:\\s*\\$\\{${name}:-\\}\\s*$`, 'm'));
  });

  it('scripts/deploy-local.sh sets and exports SENTRY_RELEASE from git rev-parse HEAD after the env is sourced', () => {
    const text = fs.readFileSync(path.join(REPO, 'scripts', 'deploy-local.sh'), 'utf8');
    const line = 'SENTRY_RELEASE=$(git rev-parse HEAD); export SENTRY_RELEASE';
    const exp = text.indexOf(line);
    const src = text.indexOf('eval "$ENV_EXPORTS"');
    expect(src).toBeGreaterThanOrEqual(0);
    expect(exp).toBeGreaterThan(src);
    // No `&&` form: `X=$(false) && export X` does not abort under `set -e`, so a failed
    // git rev-parse would silently continue with an empty release.
    const relLines = text.split('\n').filter((l) => l.includes('SENTRY_RELEASE='));
    expect(relLines).toHaveLength(1);
    expect(relLines[0]).not.toContain('&&');
    expect(text).not.toContain('export SENTRY_RELEASE=$(');
  });
});
