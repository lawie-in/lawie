// T-601 (h): nothing in the new landing folder fetches, reads the environment, injects HTML, loads
// analytics or pulls a new dependency. A text scan, like the other bundle guards.
import fs from 'fs';
import path from 'path';

const DIR = path.resolve(__dirname, '..');
const files = fs.readdirSync(DIR).filter((f) => /\.(ts|tsx)$/.test(f));
const strip = (t: string) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');

const PKG = JSON.parse(fs.readFileSync(path.resolve(DIR, '../../../../package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const KNOWN = new Set([
  ...Object.keys(PKG.dependencies),
  ...Object.keys(PKG.devDependencies ?? {}),
]);

describe('landing folder guard', () => {
  it('scans the expected files', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'ReadingDeskLanding.tsx',
        'HeroFolio.tsx',
        'CoverageDrawers.tsx',
        'SampleDesk.tsx',
        'DemoVideo.tsx',
        'landing-copy.ts',
        'landing-config.ts',
        'useInView.ts',
      ]),
    );
  });

  it.each([
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['sendBeacon', /sendBeacon/],
    ['process.env', /process\.env/],
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML', /\.innerHTML\s*=/],
    ['analytics', /analytics|gtag|dataLayer|posthog|mixpanel|@segment|segment\.com|@sentry/i],
    ['eval', /\beval\s*\(|new Function\(/],
    ['localStorage / cookies', /localStorage|sessionStorage|document\.cookie/],
    ['WebSocket', /WebSocket|EventSource/],
  ])('no %s', (_n, re) => {
    for (const f of files) {
      const code = strip(fs.readFileSync(path.join(DIR, f), 'utf8'));
      expect({ f, hit: re.test(code) }).toEqual({ f, hit: false });
    }
  });

  it('the temporary catalogue-source.ts is gone, and never coexists with the T-600 JSON', () => {
    const temp = path.join(DIR, 'catalogue-source.ts');
    const json = path.resolve(DIR, '../../../data/landing-catalogue.json');
    expect(fs.existsSync(temp)).toBe(false);
    expect(fs.existsSync(json) && fs.existsSync(temp)).toBe(false);
    expect(fs.existsSync(path.resolve(DIR, '../../../lib/landingCatalogue.ts'))).toBe(true);
  });

  it('every landing file reads the catalogue from @/lib/landingCatalogue only', () => {
    for (const f of files) {
      const t = strip(fs.readFileSync(path.join(DIR, f), 'utf8'));
      expect({ f, hit: /catalogue-source|data\/landing-catalogue/.test(t) }).toEqual({
        f,
        hit: false,
      });
    }
  });

  it('imports only the app, react, next and local files (no new dependency)', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const m of fs.readFileSync(path.join(DIR, f), 'utf8').matchAll(/from '([^']+)'/g)) {
        const spec = m[1];
        if (spec.startsWith('.') || spec.startsWith('@/')) continue;
        const pkg = spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : spec.split('/')[0];
        if (!['react', 'next'].includes(pkg) || !KNOWN.has(pkg)) bad.push(`${f}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the page reads only node fs/path (server) and no network', () => {
    const page = fs.readFileSync(path.resolve(DIR, '../../../app/(marketing)/page.tsx'), 'utf8');
    expect(strip(page)).not.toMatch(/\bfetch\s*\(|process\.env|dangerouslySetInnerHTML/);
  });
});
