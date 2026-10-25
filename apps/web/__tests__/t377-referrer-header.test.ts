// T-377: /verify-email gets the same Referrer-Policy: no-referrer header as /auth/callback (T-306),
// so the verification link never leaks through the Referer header.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

const WEB_DIR = path.resolve(__dirname, '..');

let rules: HeaderRule[];

beforeAll(() => {
  // Jest here is CommonJS + ts-jest only, so it cannot import next.config.mjs (top-level ESM import
  // of @sentry/nextjs). Load the real config in a plain Node ESM process and read headers() from it.
  const script =
    "const m=await import('./next.config.mjs');process.stdout.write(JSON.stringify(await m.default.headers()))";
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: WEB_DIR,
    encoding: 'utf8',
  });
  rules = JSON.parse(out) as HeaderRule[];
});

function referrerPolicies(rule: HeaderRule): string[] {
  return rule.headers.filter((h) => h.key.toLowerCase() === 'referrer-policy').map((h) => h.value);
}

describe('T-377 next.config.mjs Referrer-Policy', () => {
  it('headers() survives the sentry wrapper and returns an array', () => {
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  it.each(['/verify-email', '/auth/callback'])('%s gets Referrer-Policy: no-referrer', (source) => {
    const rule = rules.find((r) => r.source === source);
    expect(rule).toBeDefined();
    expect(rule?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
    expect(referrerPolicies(rule as HeaderRule)).toEqual(['no-referrer']);
  });

  it('both sources are present at once', () => {
    const sources = rules.map((r) => r.source);
    expect(sources).toEqual(expect.arrayContaining(['/verify-email', '/auth/callback']));
  });

  it('no source is given a weaker referrer policy', () => {
    const all = rules.flatMap(referrerPolicies);
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const value of all) expect(value).toBe('no-referrer');
  });
});

// T-377b: the nginx access log must not carry the one-time token / single-use Google code that
// sits in the query string of /verify-email and the auth callbacks. nginx is not available in the
// test environment, so we read the real conf, pull out the map regex and replacement, and run the
// table through a JS RegExp. nginx uses PCRE; a JS RegExp with the same named group (?<p>...) is
// an approximation (checked separately against perl by the tester, no differences found).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const NGINX_CONF = path.join(REPO_ROOT, 'docker', 'nginx', 'nginx.prod.conf');

describe('T-377b nginx access-log map', () => {
  const conf = fs.readFileSync(NGINX_CONF, 'utf8');

  function mapLine(): { regex: RegExp; replacement: string } {
    const m = conf.match(/^\s*(~\^\(\?<p>\S+)\s+"([^"]*)";\s*$/m);
    if (!m) throw new Error('map regex line not found in nginx.prod.conf');
    // strip the leading "~" (nginx case-sensitive regex marker)
    return { regex: new RegExp(m[1].slice(1)), replacement: m[2] };
  }

  function logged(uri: string): string {
    const { regex, replacement } = mapLine();
    const m = regex.exec(uri);
    if (!m) return uri; // `default $request_uri;`
    return replacement.replace('$p', (m.groups as { p: string }).p);
  }

  it('the map block is declared over $request_uri with default $request_uri', () => {
    expect(conf).toMatch(/map \$request_uri \$lawie_log_uri\s*\{/);
    expect(conf).toMatch(/default\s+\$request_uri;/);
    expect(mapLine().replacement).toBe('$p?[stripped]');
  });

  it.each([
    ['/verify-email?token=abc', '/verify-email?[stripped]'],
    ['/verify-email/?t=1', '/verify-email?[stripped]'],
    ['/auth/callback?code=x&state=y', '/auth/callback?[stripped]'],
    ['/api/auth/callback?code=x', '/api/auth/callback?[stripped]'],
    ['/auth/google/callback?code=x', '/auth/google/callback?[stripped]'],
    ['/api/auth/google/callback?code=x&state=y', '/api/auth/google/callback?[stripped]'],
    ['/api/auth/google/callback/?code=x', '/api/auth/google/callback?[stripped]'],
  ])('%s is logged as %s with no secret', (uri, expected) => {
    const out = logged(uri);
    expect(out).toBe(expected);
    expect(out).not.toContain('code=');
    expect(out).not.toContain('token=');
  });

  it.each([
    '/verify-email',
    '/api/auth/google/callback',
    '/api/auth/google?next=1',
    '/verify-emailx?t=1',
    '/auth/callbackx?x=1',
    '/api/auth/google/callbackx?x=1',
    '/api/auth/verify-email?token=1',
    '/foo/verify-email?t=1',
    '/pricing?x=1',
  ])('%s is logged unchanged', (uri) => {
    expect(logged(uri)).toBe(uri);
  });

  it('defines log_format lawie_noquery using $lawie_log_uri and never turns the access log off', () => {
    expect(conf).toMatch(/log_format\s+lawie_noquery\b[^;]*\$lawie_log_uri/);
    expect(conf).not.toMatch(/access_log\s+off/);
  });

  it('every access_log line uses lawie_noquery (else nginx falls back to combined and logs the query), exactly 2', () => {
    const lines = conf.split('\n').filter((l) => /^\s*access_log\b/.test(l));
    expect(lines).toHaveLength(2); // port-80 and 443 server blocks
    for (const l of lines) expect(l.trim()).toMatch(/\blawie_noquery;$/);
  });
});

// T-221: the password-reset token is a PATH segment (web page, API check and save), so the T-377
// query-stripping line does not cover it. A second map line logs it as [token]. nginx tries regex
// entries in file order and takes the first match, so logged() walks all of them in order.
describe('T-221 nginx access-log map: reset token', () => {
  const conf = fs.readFileSync(NGINX_CONF, 'utf8');
  const mapBlock = conf.match(/map \$request_uri \$lawie_log_uri\s*\{([\s\S]*?)\n\s*\}/);
  const entries = (mapBlock?.[1] ?? '')
    .split('\n')
    .map((l) => l.match(/^\s*(~\^\(\?<p>\S+)\s+"([^"]*)";\s*$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ regex: new RegExp(m[1].slice(1)), replacement: m[2] }));

  function logged(uri: string): string {
    for (const { regex, replacement } of entries) {
      const m = regex.exec(uri);
      if (m) return replacement.replace('$p', (m.groups as { p: string }).p);
    }
    return uri; // default $request_uri
  }

  const TOKEN = 'ab12'.repeat(16); // 64 hex

  it('the map block has the T-377 line first and a reset-token line after it', () => {
    expect(entries).toHaveLength(2);
    expect(entries[0]!.replacement).toBe('$p?[stripped]');
    expect(entries[1]!.replacement).toBe('$p/[token]');
    expect(conf).toMatch(/default\s+\$request_uri;/);
  });

  it.each([
    [`/api/auth/reset-password/${TOKEN}`, '/api/auth/reset-password/[token]'],
    [`/reset-password/${TOKEN}`, '/reset-password/[token]'],
    [`/reset-password/${TOKEN}?x=1`, '/reset-password/[token]'],
    [`/reset-password/${TOKEN}/?x=1`, '/reset-password/[token]'],
    [`/api/auth/reset-password/${TOKEN}?x=1&y=2`, '/api/auth/reset-password/[token]'],
  ])('%s is logged as %s, with no token', (uri, expected) => {
    const out = logged(uri);
    expect(out).toBe(expected);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toMatch(/[0-9a-f]{16}/);
  });

  it.each([
    '/forgot-password',
    '/reset-password',
    '/reset-password?x=1',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/pricing/reset-password/abc',
    '/foo/reset-password/abc',
  ])('%s is logged unchanged', (uri) => {
    expect(logged(uri)).toBe(uri);
  });

  it('the existing T-377 paths are unaffected by the new line', () => {
    expect(logged('/verify-email?token=abc')).toBe('/verify-email?[stripped]');
    expect(logged('/auth/callback?code=x&state=y')).toBe('/auth/callback?[stripped]');
    expect(logged('/api/auth/google/callback?code=x')).toBe('/api/auth/google/callback?[stripped]');
    expect(logged('/verify-email')).toBe('/verify-email');
    expect(logged('/pricing?x=1')).toBe('/pricing?x=1');
  });
});

describe('T-377b nginx upstream ports match the services PORT defaults', () => {
  const conf = fs.readFileSync(NGINX_CONF, 'utf8');

  it.each(['gateway', 'auth', 'drafting', 'billing'])(
    'upstream %s port equals env.ts default',
    (svc) => {
      const envSrc = fs.readFileSync(
        path.join(REPO_ROOT, 'apps', svc, 'src', 'config', 'env.ts'),
        'utf8',
      );
      const def = envSrc.match(/PORT:[^\n]*default\((\d+)\)/);
      expect(def).not.toBeNull();
      const up = conf.match(
        new RegExp(`upstream\\s+${svc}\\s*\\{\\s*server\\s+${svc}:(\\d+)\\s*;`),
      );
      expect(up).not.toBeNull();
      expect(up?.[1]).toBe(def?.[1]);
    },
  );
});
