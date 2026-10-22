// T-554: FAQ "(one time)" and the old-law criminal-drafts sentence (AJ-511-M7, AJ-541-M2, AJ-541-M3).
// The signed sentence is parsed from the ruling file, so the test compares the rendered page with
// Ajay's text itself and not with a second copy typed into this file.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import FaqPage from '../faq/page';

import { planCards } from '@/components/marketing/nl-copy';

jest.mock('@/components/marketing/SiteNav', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/SiteFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/FloatCta', () => ({ __esModule: true, default: () => null }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WEB_SRC = resolve(__dirname, '../../..');
const REPO_ROOT = resolve(__dirname, '../../../../../..');
const RULINGS = join(REPO_ROOT, 'handoff/legal/T-511-copy-rulings-ajay.md');

/** The text between backticks after "Signed:" in the AJ-541-M3 row. */
function signedSentence(): string {
  const row = readFileSync(RULINGS, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('| AJ-541-M3 |'));
  if (!row) throw new Error('AJ-541-M3 row not found in the rulings file');
  const m = /Signed: `([^`]+)`/.exec(row);
  if (!m) throw new Error('No "Signed:" string in the AJ-541-M3 row');
  return m[1];
}

function codePoints(s: string): number[] {
  return Array.from(s, (c) => c.codePointAt(0) as number);
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderFaq(): string {
  act(() => root.render(<FaqPage />));
  return container.textContent ?? '';
}

describe('T-554 FAQ criminal drafts sentence (AC2, AC3)', () => {
  it('parses the signed string from the ruling file', () => {
    expect(signedSentence()).toBe(
      'Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.',
    );
  });

  it('renders the signed sentence in exactly two answers (free tier, T-564 item 7), code point for code point', () => {
    const signed = signedSentence();
    const text = renderFaq();
    expect(countOccurrences(text, signed)).toBe(2);
    const answers = Array.from(container.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && (el.textContent ?? '').includes(signed),
    );
    expect(answers.length).toBe(2);

    const start = text.indexOf(signed);
    const rendered = text.slice(start, start + signed.length);
    expect(codePoints(rendered)).toEqual(codePoints(signed));
  });

  it('no longer ends the sentence at "section numbers."', () => {
    const text = renderFaq();
    // textContent joins an answer straight onto the next question, so no trailing space to rely on.
    expect(text).not.toContain('BSA section numbers.');
  });
});

describe('T-554 FAQ "(one time)" (AC1)', () => {
  it('has no "(lifetime)' + '" and says "(one time)" twice', () => {
    const text = renderFaq();
    expect(text).not.toContain('(lifetime)');
    expect(text).not.toMatch(/lifetime/i);
    expect(countOccurrences(text, '(one time)')).toBe(2);
  });
});

describe('T-554 Hindi form (AC1)', () => {
  it('the Hindi free-Ink label says "(एक बार)"', () => {
    expect(planCards('hi').free.ink).toContain('(एक बार)');
  });

  it('the old Hindi form is absent from the Hindi label', () => {
    expect(planCards('hi').free.ink).not.toContain('जीवनभर');
  });
});

/** Source text with block and whole-line comments removed. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

function userFacingSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      userFacingSourceFiles(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('T-554 old Hindi "जीवनभर" is gone from user-facing source (AC1)', () => {
  it('appears in no apps/web/src source file outside tests and comments', () => {
    const files = userFacingSourceFiles(WEB_SRC);
    expect(files.length).toBeGreaterThan(50);
    const hits = files.filter((f) => stripComments(readFileSync(f, 'utf8')).includes('जीवनभर'));
    expect(hits).toEqual([]);
  });
});
