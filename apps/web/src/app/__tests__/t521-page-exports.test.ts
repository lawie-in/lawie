/**
 * T-521 round 2: a Next.js page.tsx may only export its default component and Next's own route
 * fields. Any other export (a copy constant, a helper) fails `next build`, which tsc and jest
 * do not catch. Scans every page.tsx under src/app.
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const APP = path.resolve(__dirname, '..');
const ALLOWED = new Set([
  'metadata',
  'generateMetadata',
  'viewport',
  'generateViewport',
  'generateStaticParams',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'experimental_ppr',
]);

function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : pages(p);
    return e.name === 'page.tsx' || e.name === 'page.ts' ? [p] : [];
  });
}

/** Names exported as values (not types, not default). */
export function valueExports(src: string): string[] {
  const names: string[] = [];
  const decl = /^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (let m = decl.exec(src); m; m = decl.exec(src)) names.push(m[1]);
  const list = /^export\s*\{([^}]*)\}/gm;
  for (let m = list.exec(src); m; m = list.exec(src)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t || t.startsWith('type ')) continue;
      const as = t.split(/\s+as\s+/);
      const name = (as[1] ?? as[0]).trim();
      if (name !== 'default') names.push(name);
    }
  }
  return names;
}

describe('page.tsx exports (T-521)', () => {
  const files = pages(APP);

  it('finds the pages', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith(path.join('dashboard', 'documents', 'page.tsx')))).toBe(
      true,
    );
  });

  it.each(files.map((f) => [path.relative(APP, f), f]))(
    '%s exports only Next route fields besides default',
    (_rel, file) => {
      const bad = valueExports(fs.readFileSync(file, 'utf8')).filter((n) => !ALLOWED.has(n));
      expect(bad).toEqual([]);
    },
  );

  it('the scanner itself flags a stray constant and ignores types and default', () => {
    expect(
      valueExports('export const DOCUMENTS_COPY = {};\nexport default function P() {}'),
    ).toEqual(['DOCUMENTS_COPY']);
    expect(valueExports('export type A = 1;\nexport interface B {}\nexport default X;')).toEqual(
      [],
    );
    expect(valueExports('export { a, type b, c as d };')).toEqual(['a', 'd']);
    expect(valueExports('export async function f() {}')).toEqual(['f']);
  });
});
