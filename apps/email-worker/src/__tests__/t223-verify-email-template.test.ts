/**
 * T-223: the verify-email template carries Ajay's signed strings word for word
 * (handoff/legal/T-223-verify-email-signed.md, part A), the subject has no address or name, and
 * rendering without a link fails without echoing a value.
 *
 * @react-email/render cannot run inside Jest (dynamic import), so the real renderer runs in a
 * child process under ts-node, exactly as t220-ac8 does for the env module. The signed file is
 * parsed here, so a copy edit that drifts from it fails the test.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SIGNED = path.resolve(ROOT, '..', '..', 'handoff', 'legal', 'T-223-verify-email-signed.md');

const TOKEN = 'ab'.repeat(32);
const URL_ = `https://app.lawie.in/verify-email?token=${TOKEN}`;
const NAME = 'Zainab Quasimodo';
const ADDRESS = 'leak@example.com';

/** Part A rows of the signed file: { 'Subject': 'Verify your Lawie email', ... }. */
function signedStrings(): Record<string, string> {
  const md = fs.readFileSync(SIGNED, 'utf8');
  const a = md.slice(md.indexOf('## A. Email'), md.indexOf('## B. In-app'));
  const rows: Record<string, string> = {};
  for (const line of a.split('\n')) {
    const m = /^\|\s*([^|]+?)\s*\|\s*`(.+)`\s*\|\s*$/.exec(line);
    if (m) rows[m[1]] = m[2];
  }
  return rows;
}

function runRender(data: Record<string, unknown>) {
  const script = `
    require('ts-node').register({ transpileOnly: true });
    const data = JSON.parse(process.argv[1]);
    require('./src/templates').renderTemplate('auth.verifyEmail', data).then(
      (r) => console.log(JSON.stringify({ ok: true, ...r })),
      (e) => console.log(JSON.stringify({ ok: false, name: e.name, message: e.message })),
    );`;
  const r = spawnSync(process.execPath, ['-e', script, JSON.stringify(data)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (r.status !== 0) throw new Error(`render child failed (${r.status})`);
  return JSON.parse(r.stdout.trim().split('\n').pop() as string) as {
    ok: boolean;
    subject: string;
    html: string;
    text: string;
    name: string;
    message: string;
  };
}

/** Visible text of the HTML: tags stripped, entities decoded, zero-width preview padding dropped. */
function visible(html: string): string {
  return html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[\u200B-\u200F\u2060\uFEFF\u00A0]/g, '');
}

// T-522: the three rows Ajay re-signed as AJ-522-S1 (handoff/legal/T-511-copy-rulings-ajay.md),
// byte for byte. They replace the T-223 preheader, body and expiry line (the "24 hours" ones).
const S1 = {
  preheader: 'This link works once and expires in 30 minutes.',
  body: 'Please verify your email address for your Lawie account. You need a verified email to start drafting, buy Ink and receive your 5 sign-up Ink.',
  bodyInkGranted:
    'Please verify your email address for your Lawie account. You need a verified email to start drafting and buy Ink.',
  expiry:
    'This link works once, expires in 30 minutes and signs you in, so do not forward it. If it no longer works, sign in and ask for a new one.',
} as const;

// T-559 (AJ-559-M1), byte for byte from handoff/legal/T-511-copy-rulings-ajay.md. The T-223
// signed file still holds the old privacy@ not-you line; M1(2) supersedes that one row.
const M1_NOT_YOU =
  "Didn't create a Lawie account? Ignore this email: without this link, nothing is verified. To have the account removed, write to contact@lawie.in.";
const M1_FOOTER3 = 'Help, data and privacy requests: contact@lawie.in';

let signed: Record<string, string>;
let out: ReturnType<typeof runRender>;

beforeAll(() => {
  signed = signedStrings();
  signed['Not-you line (line 64)'] = M1_NOT_YOU;
  out = runRender({ name: NAME, verifyUrl: URL_ });
}, 90_000);

describe('T-223 verify-email template: signed strings', () => {
  it('the signed file parses to the rows this test relies on', () => {
    for (const k of [
      'Subject',
      'Preheader',
      'Greeting',
      'Body',
      'Button',
      'Expiry line',
      'Link fallback',
      'Not-you line (line 64)',
      'Help line',
      'Disclaimer',
      'Sign-off',
      'Footer line 2 (this email only)',
    ]) {
      expect(signed[k]).toBeTruthy();
    }
    expect(signed.Subject).toBe('Verify your Lawie email');
    expect(signed.Button).toBe('Verify email');
  });

  it('the subject is exactly the signed subject, with no address and no name', () => {
    expect(out.ok).toBe(true);
    expect(out.subject).toBe(signed.Subject);
    expect(out.subject).not.toContain(NAME);
    expect(out.subject).not.toContain('@');
    const other = runRender({ name: `${ADDRESS} Other`, verifyUrl: URL_ });
    expect(other.subject).toBe(signed.Subject);
  });

  it('the HTML holds every signed string word for word', () => {
    const text = visible(out.html);
    const expected = [
      S1.preheader,
      signed.Greeting.replace('{name}', NAME),
      S1.body,
      signed.Button,
      S1.expiry,
      signed['Link fallback'],
      signed['Not-you line (line 64)'],
      signed['Help line'],
      signed.Disclaimer,
      signed['Sign-off'],
      signed['Footer line 2 (this email only)'],
    ];
    for (const s of expected) expect(text).toContain(s);
  });

  it('the button is a link to the verify URL labelled with the signed button text', () => {
    expect(out.html).toMatch(
      new RegExp(`<a[^>]*href="${URL_.replace(/[.?]/g, '\\$&')}"[^>]*>${signed.Button}</a>`),
    );
  });

  it('the plain text holds the signed body with "Verify email: {verifyUrl}" in place of the button', () => {
    const expected = [
      signed.Greeting.replace('{name}', NAME),
      S1.body,
      `${signed.Button}: ${URL_}`,
      S1.expiry,
      signed['Link fallback'],
      signed['Not-you line (line 64)'],
      signed['Help line'],
      signed.Disclaimer,
      signed['Sign-off'],
      signed['Footer line 2 (this email only)'],
    ];
    for (const s of expected) expect(out.text).toContain(s);
    expect(out.text).toContain(URL_);
  });

  it('AJ-559-M1: not-you line and footer3 use contact@lawie.in, never privacy@', () => {
    const text = visible(out.html);
    for (const part of [text, out.text]) {
      expect(part).toContain(M1_NOT_YOU);
      expect(part).toContain(M1_FOOTER3);
      expect(part).not.toContain('privacy@');
    }
  });

  it('AJ-522-S1: no "24 hours" anywhere (ship gate), and the 30-minute lines are there', () => {
    const text = visible(out.html);
    expect(text).not.toMatch(/24 hours/);
    expect(out.text).not.toMatch(/24 hours/);
    expect(text).toContain('expires in 30 minutes');
    expect(text).toContain('signs you in, so do not forward it');
  });

  it('AJ-522-S1: the default body names the 5 sign-up Ink; the Ink-granted body does not', () => {
    for (const data of [
      { name: NAME, verifyUrl: URL_ },
      { name: NAME, verifyUrl: URL_, signupInkGranted: false },
      { name: NAME, verifyUrl: URL_, signupInkGranted: undefined },
    ]) {
      const r = runRender(data);
      expect(visible(r.html)).toContain(S1.body);
      expect(r.text).toContain(S1.body);
      expect(visible(r.html)).not.toContain(S1.bodyInkGranted);
    }
    const granted = runRender({ name: NAME, verifyUrl: URL_, signupInkGranted: true });
    expect(visible(granted.html)).toContain(S1.bodyInkGranted);
    expect(granted.text).toContain(S1.bodyInkGranted);
    expect(visible(granted.html)).not.toContain('sign-up Ink');
    expect(granted.text).not.toContain('sign-up Ink');
    // only a strict true picks the shorter body
    const loose = runRender({ name: NAME, verifyUrl: URL_, signupInkGranted: 'true' });
    expect(visible(loose.html)).toContain(S1.body);
  });

  it('the name is HTML-escaped in the HTML body', () => {
    const r = runRender({ name: '<script>x</script>', verifyUrl: URL_ });
    expect(r.html).not.toContain('<script>x</script>');
    expect(r.html).toContain('&lt;script&gt;');
  });
});

describe('T-223 verify-email template: no link, no email', () => {
  it.each([
    ['verifyUrl missing', { name: NAME }],
    ['verifyUrl empty', { name: NAME, verifyUrl: '' }],
    ['verifyUrl not a string', { name: NAME, verifyUrl: 42 }],
  ])('%s: render throws, and the message names no value', (_l, data) => {
    const r = runRender(data);
    expect(r.ok).toBe(false);
    expect(r.message).not.toContain(NAME);
    expect(r.message).not.toContain('@');
    expect(r.message).not.toMatch(/https?:/);
  });

  it('job-style data with an address and no link cannot produce an email', () => {
    const r = runRender({ userId: 'user-1', to: ADDRESS, email: ADDRESS });
    expect(r.ok).toBe(false);
    expect(r.message).not.toContain(ADDRESS);
  });
});
