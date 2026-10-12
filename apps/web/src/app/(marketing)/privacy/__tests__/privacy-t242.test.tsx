/**
 * T-242 (Ajay, handoff/legal/T-242-signup-source-signed.md): the Privacy page's §1 bullet and §6 v3
 * are byte for byte what he signed, and the §6 block hashes to the SHA-256 he gave
 * (final newline included).
 *
 * The signed text is read from the signed file itself, so a changed page and a changed ruling
 * both fail here. The page constant is read from source (a Next page cannot export it), and the
 * rendered page is checked too.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import PrivacyPage from '../page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SIGNED_SHA = 'a98bbde316ff1fd6e234beef685124be3cf70a48ca0bc2a8576df14909dc81e8';
const REPO = path.resolve(__dirname, '../../../../../../..');
const signedFile = fs.readFileSync(
  path.join(REPO, 'handoff/legal/T-242-signup-source-signed.md'),
  'utf8',
);
const pageSource = fs.readFileSync(path.resolve(__dirname, '../page.tsx'), 'utf8');

/** The ```text fenced blocks of the signed file, in order. */
const fences = Array.from(signedFile.matchAll(/```text\n([\s\S]*?)\n```/g)).map((m) => m[1]);

// The byte-exact texts, also pinned here so the test fails if the signed file is edited.
const BULLET =
  'How you found us: if the link that brought you to Lawie carried campaign tags, the source, medium and campaign named in it, saved with your account when you sign up.';

function sectionSixFromSource(): string {
  const m = pageSource.match(/const SECTION_6_BODY =\s*\n?\s*"((?:[^"\\]|\\.)*)";/);
  if (!m) throw new Error('SECTION_6_BODY not found');
  // The constant is a double-quoted string literal; evaluate it as JSON-compatible escapes only.
  return JSON.parse(`"${m[1]}"`);
}

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

function renderPage(): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<PrivacyPage />));
  return host;
}

describe('signed file', () => {
  it('has the two fenced texts (bullet, §6 v3)', () => {
    expect(fences).toHaveLength(2);
    expect(fences[0]).toBe(BULLET);
  });
  it('the signed §6 block hashes to the SHA in the ruling', () => {
    expect(crypto.createHash('sha256').update(`${fences[1]}\n`).digest('hex')).toBe(SIGNED_SHA);
    expect(signedFile).toContain(SIGNED_SHA);
  });
});

describe('Privacy page §6 v3', () => {
  it('SECTION_6_BODY equals the signed block byte for byte', () => {
    expect(sectionSixFromSource()).toBe(fences[1]);
  });

  it('SHA-256 of SECTION_6_BODY plus a final newline is the signed value', () => {
    const body = sectionSixFromSource();
    expect(crypto.createHash('sha256').update(`${body}\n`).digest('hex')).toBe(SIGNED_SHA);
    // And not the hash without the newline.
    expect(crypto.createHash('sha256').update(body).digest('hex')).not.toBe(SIGNED_SHA);
  });

  it('the rendered §6 section shows the block exactly', () => {
    const el = renderPage();
    const section = el.querySelector('#browser-storage')!;
    const p = section.querySelector('p')!;
    expect(p.textContent).toBe(fences[1]);
    expect(section.querySelector('h3')!.textContent).toBe('6. Browser Storage and Cookies');
  });

  it('the changed sentence names the campaign tags and the tab', () => {
    expect(sectionSixFromSource()).toContain(
      'We also store your referral code, the campaign tags of the link that brought you to Lawie (until you close the tab), and small display settings in your browser.',
    );
  });
});

describe('Privacy page §1 bullet', () => {
  it('is rendered straight after "Plan, Ink balance, payments and referrals." with Ajay\'s words', () => {
    const el = renderPage();
    const items = Array.from(el.querySelectorAll('#collect li')).map((li) =>
      (li.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    const i = items.indexOf('Plan, Ink balance, payments and referrals.');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(items[i + 1]).toBe(BULLET);
    expect(items.filter((t) => t === BULLET)).toHaveLength(1);
  });
});

describe('Last updated', () => {
  it('stays 12 October 2026 (Ajay: the version, not the date, changes to 2026-10-12b)', () => {
    expect(pageSource).toContain("const PRIVACY_LAST_UPDATED = '12 October 2026';");
    const el = renderPage();
    expect(el.textContent).toContain('12 October 2026');
  });
});
