// T-531 AC3, AC5: viewport-fit=cover on the root viewport, and globals.css: scroll padding from
// --nl-bar-h and the reduced-motion opt-out of smooth scrolling.
import { readFileSync } from 'fs';
import { join } from 'path';

import { viewport } from '../layout';

jest.mock('@/components/AnalyticsConsent', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/signup-source', () => ({ SignupSourceCapture: () => null }));

const css = readFileSync(join(__dirname, '..', 'globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const squash = (s: string) => s.replace(/\s+/g, '');

function block(source: string, header: string, from = 0) {
  const at = source.indexOf(header, from);
  if (at < 0) throw new Error(`missing: ${header}`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error('unbalanced');
}

describe('root viewport (AC3)', () => {
  it('is viewport-fit=cover and keeps the two theme-color entries', () => {
    expect(viewport.viewportFit).toBe('cover');
    expect((viewport.themeColor as unknown[]).length).toBe(2);
  });
});

describe('globals.css scroll rules (AC5)', () => {
  // globals.css has two `@layer base` blocks; the scroll rules are in the second.
  const base = squash(block(css, '@layer base', css.indexOf('@layer base') + 1));

  it('smooth scrolling is on by default and scroll-padding-top reads --nl-bar-h (0px fallback)', () => {
    expect(base).toContain('html{scroll-behavior:smooth;}');
    expect(base).toContain('html{scroll-padding-top:var(--nl-bar-h,0px);}');
  });

  it('prefers-reduced-motion: reduce sets html scroll-behavior:auto', () => {
    const reduced = squash(block(css, '@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('html{scroll-behavior:auto;}');
  });

  it('the opt-out is the only scroll-behavior override, and smooth is never set inside a reduced block', () => {
    const all = css.match(/scroll-behavior:\s*[a-z]+/g) ?? [];
    expect(all.map((x) => x.replace(/\s+/g, ''))).toEqual([
      'scroll-behavior:smooth',
      'scroll-behavior:auto',
    ]);
    expect(css.indexOf('scroll-behavior: auto')).toBeGreaterThan(
      css.indexOf('scroll-behavior: smooth'),
    );
  });
});
