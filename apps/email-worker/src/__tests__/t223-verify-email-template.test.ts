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

let signed: Record<string, string>;
let out: ReturnType<typeof runRender>;

beforeAll(() => {
  signed = signedStrings();
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
      signed.Preheader,
      signed.Greeting.replace('{name}', NAME),
      signed.Body,
      signed.Button,
      signed['Expiry line'],
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
      signed.Body,
      `${signed.Button}: ${URL_}`,
      signed['Expiry line'],
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
