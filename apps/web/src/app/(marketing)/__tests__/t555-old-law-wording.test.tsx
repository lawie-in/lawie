// T-555: old-law wording in the footer, the two metadata descriptions and PipelineStatus
// (AJ-555-M1 to M4), the PainSolution delete (AJ-555-M3) and the legal-content paths (AJ-554-M1).
// Each signed string is parsed from the ruling file, so the tests compare the source with Ajay's
// text itself and not with a second copy typed into this file.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { metadata as aboutMetadata } from '../about/page';
import { metadata as marketingMetadata } from '../layout';

import PipelineStatus from '@/components/draft/PipelineStatus';
import SiteFooter from '@/components/marketing/SiteFooter';

jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));
jest.mock('@/components/CookieSettingsButton', () => ({
  __esModule: true,
  default: () => null,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WEB_SRC = resolve(__dirname, '../../..');
const REPO_ROOT = resolve(__dirname, '../../../../../..');
const RULINGS = join(REPO_ROOT, 'handoff/legal/T-511-copy-rulings-ajay.md');

/** The text between backticks after "Signed:" in the given ruling row. */
function signed(id: string): string {
  const row = readFileSync(RULINGS, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`| ${id} |`));
  if (!row) throw new Error(`${id} row not found in the rulings file`);
  const m = /Signed: `([^`]+)`/.exec(row);
  if (!m) throw new Error(`No "Signed:" string in the ${id} row`);
  return m[1];
}

function codePoints(s: string): number[] {
  return Array.from(s, (c) => c.codePointAt(0) as number);
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

describe('T-555 signed strings parse from the ruling file', () => {
  it('M1, M2 and M4 are the rulings Ajay signed', () => {
    expect(signed('AJ-555-M1')).toBe(
      'Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.',
    );
    expect(signed('AJ-555-M2')).toBe(
      'Why we built Lawie: a drafting assistant for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.',
    );
    expect(codePoints(signed('AJ-555-M4'))).toEqual(codePoints('Citing sections…'));
  });
});

describe('T-555 footer tagline (AJ-555-M1)', () => {
  it('renders the signed text exactly, code point for code point', () => {
    act(() => root.render(<SiteFooter />));
    const tag = container.querySelector('.footer-tag');
    expect(tag).not.toBeNull();
    const text = tag?.textContent ?? '';
    expect(text).toBe(signed('AJ-555-M1'));
    expect(codePoints(text)).toEqual(codePoints(signed('AJ-555-M1')));
  });
});

describe('T-555 metadata descriptions (AJ-555-M1, AJ-555-M2)', () => {
  it('the marketing layout description is M1', () => {
    expect(marketingMetadata.description).toBe(signed('AJ-555-M1'));
  });

  it('the about page description is M2', () => {
    expect(aboutMetadata.description).toBe(signed('AJ-555-M2'));
  });
});

describe('T-555 PipelineStatus label (AJ-555-M4)', () => {
  it('shows "Citing sections…" while drafting and not the BNS-only label', () => {
    act(() => root.render(<PipelineStatus state="drafting" />));
    const seen: string[] = [];
    // The status rotates every 6s; step through all ten phrases.
    for (let i = 0; i < 12; i++) {
      seen.push(container.textContent ?? '');
      act(() => {
        jest.advanceTimersByTime(6000);
      });
    }
    const all = seen.join('\n');
    expect(all).toContain(signed('AJ-555-M4'));
    expect(all).toContain('Citing sections…');
    expect(all).not.toContain('Citing BNS / BNSS sections');
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

function sourceFiles(dir: string, includeTests: boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || (!includeTests && name === '__tests__')) continue;
      sourceFiles(full, includeTests, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      if (!includeTests && /\.test\.(ts|tsx)$/.test(name)) continue;
      out.push(full);
    }
  }
  return out;
}

describe('T-555 PainSolution is deleted (AJ-555-M3)', () => {
  it('the file does not exist', () => {
    expect(existsSync(join(WEB_SRC, 'components/landing/PainSolution.tsx'))).toBe(false);
  });

  it('no source file under apps/web/src mentions PainSolution', () => {
    const files = sourceFiles(WEB_SRC, false);
    expect(files.length).toBeGreaterThan(50);
    // Built by concatenation so this file does not match itself.
    const needle = 'Pain' + 'Solution';
    const hits = files.filter((f) => readFileSync(f, 'utf8').includes(needle));
    expect(hits).toEqual([]);
  });
});

describe('T-555 old sentence is gone from user-facing source', () => {
  // terms page carries the same sentence; follow-up ticket for Ajay's signed text and a Terms version decision (lead, 22 Oct)
  // terms/page.tsx: see T-557 Part C (Ajay's text and the Terms version call)
  const TERMS_PAGE = join(WEB_SRC, 'app/(marketing)/terms/page.tsx');
  const hasOldEnding = (f: string) =>
    stripComments(readFileSync(f, 'utf8')).replace(/\s+/g, ' ').includes('BSA section numbers.');

  it('no apps/web/src source file outside tests and comments ends the sentence at "BSA section numbers." (except the terms page)', () => {
    const files = sourceFiles(WEB_SRC, false);
    expect(files).toContain(TERMS_PAGE);
    const hits = files.filter((f) => f !== TERMS_PAGE && hasOldEnding(f));
    expect(hits).toEqual([]);
  });

  it('the terms page exception is still needed (remove it when the terms page is fixed)', () => {
    expect(hasOldEnding(TERMS_PAGE)).toBe(true);
  });

  it('the JSX footer line break does not hide an old ending', () => {
    const footer = stripComments(
      readFileSync(join(WEB_SRC, 'components/marketing/SiteFooter.tsx'), 'utf8'),
    ).replace(/\s+/g, ' ');
    expect(footer).not.toMatch(/BSA section numbers\.\s*</);
  });
});

describe('T-555 legal-content paths (AJ-554-M1)', () => {
  it('lists the faq, privacy and refunds pages', () => {
    const doc = readFileSync(join(REPO_ROOT, '.claude/docs/legal-content-paths.md'), 'utf8');
    for (const page of ['faq', 'privacy', 'refunds']) {
      const path = `apps/web/src/app/(marketing)/${page}/page.tsx`;
      expect(doc).toContain(`\`${path}\``);
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    }
  });
});
