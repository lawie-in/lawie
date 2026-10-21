/**
 * T-115c (Ajay, handoff/legal/dpdp-v1-calls-signed.md, "T-115c: erase list and Privacy Policy
 * text", e13d474, and the Atlas addendum ef06e89): the §7 paragraph, the §9 bullets, the §3 line
 * and the §5 Atlas row are byte for byte what he signed. The strings are pinned here and also
 * checked against the signed file, so a changed page and a changed ruling both fail.
 */
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import PrivacyPage from '../page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = path.resolve(__dirname, '../../../../../../..');
const signed = fs.readFileSync(path.join(REPO, 'handoff/legal/dpdp-v1-calls-signed.md'), 'utf8');

// Ajay b26b017 (as relayed): the sentence below is out of §7 until a self-serve close alerts the
// operator. S7_SIGNED_E13D474 is the paragraph as e13d474 signed it (in the signed file).
const SENTRY_SENTENCE =
  'Erasure covers our database and session store, and we remove what we can find of your data in our error reports (Sentry). ';
const S7_SIGNED_E13D474 =
  'You can close your account and erase your data from Settings, and delete any single document from the document itself. You can also write to privacy@lawie.in from your account email and we will do it for you. ' +
  SENTRY_SENTENCE +
  'Backup copies are erased within 7 days. We keep payment records and tax invoices for as long as tax law requires; an invoice keeps the name and State printed on it. Erasure cannot reach data already sent to Helicone (see §5) or copies you have downloaded.';
// AJ-517-M15 (Ajay): the page now says contact@lawie.in where e13d474 signed privacy@lawie.in.
// The signed file keeps the original; only the address differs.
const S7 = S7_SIGNED_E13D474.replace(SENTRY_SENTENCE, '').replace(
  'privacy@lawie.in',
  'contact@lawie.in',
);
const S9_EVERYTHING =
  'Everything else (account, case details, drafts): until you close your account or delete the document. Backup copies are erased within 7 days after that.';
const S9_EMAILS = 'Emails we could not send: up to 30 days.';
const S9_EMAILS_SENT = 'Emails we have sent: up to 7 days, even after you close your account.';
const S9_PAYMENT =
  'Payment records and tax invoices: for as long as GST law requires (72 months from the due date of the annual return for the year of the invoice), even after you close your account.';
const S3_LINE =
  'Our servers run on Amazon Web Services in Mumbai, India. Our database is MongoDB Atlas, in India (Mumbai). Our session store is Redis Cloud, which may store data outside India.';

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

const allText = () => norm(container.textContent);
const items = () => Array.from(container.querySelectorAll('li')).map((li) => norm(li.textContent));
const paras = () => Array.from(container.querySelectorAll('p')).map((p) => norm(p.textContent));

describe('the signed texts match the signed file', () => {
  it('the §7 paragraph and §9 bullets are in the ruling (with the link as plain text)', () => {
    const flat = signed.replace(/<a>privacy@lawie\.in<\/a>/g, 'privacy@lawie.in');
    expect(flat).toContain(S7_SIGNED_E13D474);
    expect(signed).toContain(S9_EVERYTHING);
    expect(signed).toContain(S9_EMAILS);
    expect(signed).toContain(S9_PAYMENT);
  });
});

describe('Privacy page, T-115c', () => {
  it('§7: the new paragraph, byte for byte, with the mailto link kept', () => {
    expect(paras()).toContain(S7);
    const link = Array.from(container.querySelectorAll('a')).find(
      (a) =>
        a.getAttribute('href') === 'mailto:contact@lawie.in' &&
        norm(a.parentElement!.textContent).startsWith('You can close'),
    );
    expect(link).toBeDefined();
  });

  it('§7: the old "no delete button; we erase on request" wording is gone everywhere', () => {
    expect(allText()).not.toContain('does not yet have a delete button');
    expect(allText()).not.toContain('we erase on request');
    expect(allText()).not.toContain('until you ask us to erase it');
    expect(allText()).not.toContain('even after you ask us to erase your account');
  });

  it('§9: the three changed bullets and the new one, byte for byte', () => {
    const li = items();
    expect(li).toContain(S9_EVERYTHING);
    expect(li).toContain(S9_EMAILS);
    expect(li).toContain(S9_EMAILS_SENT);
    expect(li).toContain(S9_PAYMENT);
  });

  it('§7: the Sentry sentence is gone from the whole page', () => {
    expect(allText()).not.toContain('error reports (Sentry)');
    expect(allText()).not.toContain('Erasure covers our database and session store');
    expect(S7).not.toContain('Sentry');
  });

  it('§9: "Emails we have sent" sits right after "Emails we could not send", once', () => {
    const li = items();
    const i = li.indexOf(S9_EMAILS);
    expect(li[i + 1]).toBe(S9_EMAILS_SENT);
    expect(li.filter((t) => t === S9_EMAILS_SENT)).toHaveLength(1);
  });

  it('§9: unchanged bullets stay (sessions, fact list, waitlist, logs)', () => {
    const li = items();
    expect(li).toContain('Sign-in sessions: about 24 hours (7 days if you stay signed in).');
    expect(li).toContain('Records of changes to the fact list: 90 days.');
    expect(li).toContain('Server logs: until we delete them.');
    expect(li.some((t) => t.startsWith('Waitlist details: until you ask us to delete them'))).toBe(
      true,
    );
  });

  it('§3: MongoDB Atlas is in India (Mumbai); Redis Cloud may be outside India', () => {
    expect(items()).toContain(S3_LINE);
    expect(allText()).not.toContain('these may store data outside India');
  });

  it('§5: the MongoDB Atlas row says India (Mumbai); Redis Cloud row is unchanged', () => {
    const rows = Array.from(container.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((td) => norm(td.textContent)),
    );
    const atlas = rows.find((r) => r[0] === 'MongoDB Atlas');
    expect(atlas).toEqual([
      'MongoDB Atlas',
      'Account data, case details, drafts',
      'Database',
      'India (Mumbai)',
    ]);
    const redis = rows.find((r) => r[0] === 'Redis Cloud');
    expect(redis).toBeDefined();
    expect(redis![3]).not.toBe('India (Mumbai)');
    expect(allText()).not.toContain('May be outside India Database');
  });

  it('"Last updated" is 21 October 2026 (T-358 moved it from 14 October; the T-115c edits stand)', () => {
    expect(allText()).toContain('21 October 2026');
  });
});
