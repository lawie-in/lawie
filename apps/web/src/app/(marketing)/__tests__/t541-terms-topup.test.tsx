// T-541 (AJ-535-M5, Ajay): the Terms narrow the top-up Ink promise, so the sentence, the three
// version places and "Last updated" move together. Priya's ruling (22 Oct 2026): the Terms re-accept
// prompt stays parked (V1.1), so there is no prompt to test; the bump and the sentence are tested here.
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import { CONSENT_COPY, TERMS_VERSION } from '@/components/marketing/nl-copy';

import TermsPage from '../terms/page';

jest.mock('@/components/marketing/SiteNav', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/SiteFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/FloatCta', () => ({ __esModule: true, default: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = path.resolve(__dirname, '../../../../../..');
const WEB_SRC = path.join(REPO, 'apps/web/src');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// Typed out independently of the page and the ruling file; both are compared against it below.
const SIGNED =
  'Top-up Ink you buy separately does not expire while your account is open. It ends when your account is closed.';
const OLD_SENTENCE = 'Top-up Ink you buy separately never expires.';

const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

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
function renderedTerms(): string {
  act(() => root.render(<TermsPage />));
  return norm(container.textContent);
}

// The signed text is the backticked string after "Signed:" in the AJ-535-M5 row of the ruling file.
function rulingSentence(): string {
  const row = read('handoff/legal/T-511-copy-rulings-ajay.md')
    .split('\n')
    .find((l) => l.startsWith('| AJ-535-M5 |'));
  expect(row).toBeDefined();
  const m = row!.match(/Signed: `([^`]+)`/);
  expect(m).not.toBeNull();
  return m![1];
}

describe('T-541 AC1: the Terms top-up sentence (AJ-535-M5)', () => {
  it('the ruling file holds exactly the signed sentence, code point for code point', () => {
    const fromRuling = rulingSentence();
    expect(Array.from(fromRuling).map((c) => c.codePointAt(0))).toEqual(
      Array.from(SIGNED).map((c) => c.codePointAt(0)),
    );
  });

  it('the rendered /terms page contains the ruling-file sentence exactly, with the sentence after it intact', () => {
    const text = renderedTerms();
    expect(text).toContain(rulingSentence());
    expect(text).toContain(SIGNED + ' Subscriptions renew automatically until cancelled.');
    expect(text.split(SIGNED)).toHaveLength(2); // once, not duplicated
  });

  it('the old "never expires" sentence is gone from the page', () => {
    const text = renderedTerms();
    expect(text).not.toContain(OLD_SENTENCE);
    expect(text).not.toMatch(/never expires/i);
  });
});

describe('T-541 AC2 (as ruled): version bump, all three places agree', () => {
  it('"Last updated: 22 October 2026" is on the page', () => {
    expect(renderedTerms()).toContain('Last updated: 22 October 2026');
  });

  it('CURRENT_TERMS_VERSION (auth), TERMS_VERSION (web) and the "Last updated" date are the same day', () => {
    const auth = read('apps/auth/src/models/User.model.ts').match(
      /export const CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/,
    );
    expect(auth).not.toBeNull();
    const shown = renderedTerms().match(/Last updated: (\d{1,2}) ([A-Za-z]+) (\d{4})/);
    expect(shown).not.toBeNull();
    const month = new Date(`${shown![2]} 1, 2000 UTC`).getUTCMonth() + 1;
    const iso = `${shown![3]}-${String(month).padStart(2, '0')}-${shown![1].padStart(2, '0')}`;

    expect(iso).toBe('2026-10-22');
    expect(auth![1]).toBe('2026-10-22');
    expect(TERMS_VERSION).toBe('2026-10-22');
    expect(TERMS_VERSION).toBe(auth![1]);
    expect(auth![1]).toBe(iso);
  });

  it('the sign-up consent line shows Terms version 2026-10-22 and Privacy version 2026-10-15', () => {
    const c = CONSENT_COPY;
    const line = c.before + c.terms + c.middle + c.privacy + c.after;
    expect(line).toBe(
      'I have read and agree to the Terms (version 2026-10-22) and the Privacy Policy (version 2026-10-15).',
    );
    expect(CURRENT_PRIVACY_VERSION).toBe('2026-10-15'); // Privacy is not part of this change
  });
});

const ADMIN_DIRS = [path.join(WEB_SRC, 'app/admin'), path.join(WEB_SRC, 'components/admin')];

// Walk apps/web/src for user-facing source. Excluded: __tests__ folders, *.test.ts(x) files, the
// internal admin areas (app/admin, components/admin), and comments (// and /* */, so JSX comments too). String
// literals, JSX text and copy constants are scanned.
function userFacingFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || ADMIN_DIRS.includes(full)) continue;
      userFacingFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('T-541: no other user-facing web copy over-promises top-up Ink', () => {
  const files = userFacingFiles(WEB_SRC);

  it('scans a real set of files, and the terms page is among them', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(path.join(WEB_SRC, 'app/(marketing)/terms/page.tsx'));
    expect(files.some((f) => ADMIN_DIRS.some((d) => f.startsWith(d + path.sep)))).toBe(false);
  });

  it('no file says "never expires" or "permanent" (outside admin, tests and comments)', () => {
    const hits = files
      .filter((f) =>
        /never[\s-]+expires?|permanent/i.test(stripComments(fs.readFileSync(f, 'utf8'))),
      )
      .map((f) => path.relative(REPO, f));
    expect(hits).toEqual([]);
  });
});
