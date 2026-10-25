/**
 * T-358 (Ajay a84e298 and 08a0d09 §8 rows 1-2, handoff/legal/dpdp-v1-calls-signed.md):
 *  - §9 gets the 14 Oct line, byte for byte, straight after the "Everything else" bullet, once;
 *    the 12 Oct wording ("deleted 30 days after sign-up") does not appear;
 *  - "Last updated" moved to 15 October 2026 here, and to 21 October 2026 by T-517 (AJ-517-M19);
 *  - CURRENT_PRIVACY_VERSION is NOT bumped by T-358 itself (no re-accept prompt); T-436 bumps it
 *    to '2026-10-15' (Ajay, GST file Addendum 4) and the pin below follows.
 */
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import PrivacyPage from '../page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = path.resolve(__dirname, '../../../../../../..');
const signed = fs.readFileSync(path.join(REPO, 'handoff/legal/dpdp-v1-calls-signed.md'), 'utf8');
const sharedPrivacy = fs.readFileSync(
  path.join(REPO, 'packages/shared/src/constants/privacy.ts'),
  'utf8',
);

const S9_UNVERIFIED =
  'If you do not verify your email address within 30 days of signing up, we delete your account and everything in it.';
const S9_UNVERIFIED_12_OCT =
  'Accounts whose email address is never verified: deleted 30 days after sign-up.';
const S9_EVERYTHING =
  'Everything else (account, case details, drafts): until you close your account or delete the document. Backup copies are erased within 7 days after that.';

let container: HTMLDivElement;
let root: Root;
const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<PrivacyPage />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const items = () => Array.from(container.querySelectorAll('li')).map((li) => norm(li.textContent));

describe('the signed file holds the line this test pins', () => {
  it('§8 row 1: the 14 Oct line, straight after "Everything else"; row 2: Last updated only', () => {
    expect(signed).toContain('`' + S9_UNVERIFIED + '`');
    expect(signed).toContain('Place it straight after the "Everything else" bullet.');
    expect(signed).toContain('**No: "Last updated" only.**');
  });
});

describe('Privacy page §9, T-358', () => {
  it('has the line byte for byte, once', () => {
    expect(items().filter((t) => t === S9_UNVERIFIED)).toHaveLength(1);
  });

  it('sits straight after the "Everything else" bullet and before the waitlist bullet', () => {
    const li = items();
    const i = li.indexOf(S9_EVERYTHING);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(li[i + 1]).toBe(S9_UNVERIFIED);
    expect(li[i + 2].startsWith('Waitlist details:')).toBe(true);
  });

  it('is in the §9 list (retention), not elsewhere on the page', () => {
    const el = Array.from(container.querySelectorAll('li')).find(
      (li) => norm(li.textContent) === S9_UNVERIFIED,
    );
    expect(el).toBeDefined();
    const text = norm(container.textContent);
    expect(text.split(S9_UNVERIFIED)).toHaveLength(2);
    // The same list holds the other retention bullets.
    const siblings = Array.from(el!.parentElement!.querySelectorAll('li')).map((l) =>
      norm(l.textContent),
    );
    expect(siblings).toContain(S9_EVERYTHING);
  });

  it('the superseded 12 Oct wording is not on the page', () => {
    expect(norm(container.textContent)).not.toContain(S9_UNVERIFIED_12_OCT);
    expect(norm(container.textContent)).not.toContain('deleted 30 days after sign-up');
  });

  it('the existing §9 bullets are untouched', () => {
    const li = items();
    expect(li).toContain('Emails we could not send: up to 30 days.');
    expect(li).toContain('Emails we have sent: up to 7 days, even after you close your account.');
    expect(li).toContain('Sign-in sessions: about 24 hours (7 days if you stay signed in).');
    expect(li).toContain('Server logs: until we delete them.');
  });
});

describe('Last updated and the version', () => {
  it('"Last updated" is 21 October 2026 (T-517 AJ-517-M19 moved it from 15 October; no version bump)', () => {
    const text = norm(container.textContent);
    expect(text).toContain('21 October 2026');
    expect(text).not.toContain('14 October 2026');
    expect(text).not.toContain('15 October 2026');
  });

  it('CURRENT_PRIVACY_VERSION is 2026-10-15, set in shared (T-436 bump, Ajay Addendum 4)', () => {
    expect(sharedPrivacy).toContain("export const CURRENT_PRIVACY_VERSION = '2026-10-15';");
  });

  it('the page source does not set a version of its own', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../page.tsx'), 'utf8');
    expect(src).not.toMatch(/CURRENT_PRIVACY_VERSION\s*=/);
    expect(src).not.toMatch(/2026-10-15/);
  });
});
