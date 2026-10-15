// T-377: /verify-email gets the same Referrer-Policy: no-referrer header as /auth/callback (T-306),
// so the verification link never leaks through the Referer header.
import { execFileSync } from 'child_process';
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
