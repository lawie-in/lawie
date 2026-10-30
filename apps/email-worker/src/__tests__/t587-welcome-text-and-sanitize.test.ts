/**
 * T-587 round 2: the welcome plain-text part (exact, from the signed AJ-556-M1 / AJ-587-M1 text)
 * as the real render path returns it, and control characters in the display name.
 * The real renderer runs in a child process (it cannot run in Jest).
 */
import { renderRealBatch, type RealOutcome } from './helpers/t223-real-render';

const LOGIN = 'https://lawie.in/login';
const BODY =
  'You can now describe your matter and get a first draft of a bail application, notice, writ or maintenance petition to review and edit before you file. Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.';
const DISCLAIMER =
  'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.';
const FOOTER2 = 'You are receiving this because you have a Lawie account.';
const FOOTER3 = 'Help, data and privacy requests: contact@lawie.in';
const FOOTER4 = 'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms';

function expected(heading: string, footer1: string): string {
  return [
    heading,
    '',
    BODY,
    '',
    `Open your dashboard: ${LOGIN}`,
    '',
    DISCLAIMER,
    '',
    '--',
    footer1,
    FOOTER2,
    FOOTER3,
    FOOTER4,
    '',
  ].join('\n');
}

const RANCHI_ST = '12 MG Road, Ranchi';
const OTHER_ST = '12 MG Road';
const base = { loginUrl: LOGIN };
const NASTY = ' Asha\r\nBcc: x@y \u0000Rao ';

const [
  NAMED_RANCHI,
  NAMED_OTHER,
  NONAME_RANCHI,
  NONAME_OTHER,
  NASTY_OUT,
  CR_ONLY,
  CTRL_ONLY,
  TAB_DEL,
  NEL,
  DRY,
] = renderRealBatch([
  { id: 'auth.welcome', data: { ...base, name: 'Asha Rao', streetAddress: RANCHI_ST } },
  { id: 'auth.welcome', data: { ...base, name: 'Asha Rao', streetAddress: OTHER_ST } },
  { id: 'auth.welcome', data: { ...base, streetAddress: RANCHI_ST } },
  { id: 'auth.welcome', data: { ...base, streetAddress: OTHER_ST } },
  { id: 'auth.welcome', data: { ...base, name: NASTY, streetAddress: OTHER_ST } },
  { id: 'auth.welcome', data: { ...base, name: '\r\n\r\n', streetAddress: OTHER_ST } },
  {
    id: 'auth.welcome',
    data: { ...base, name: '\u0000\t \u007f\r\n \u001f', streetAddress: OTHER_ST },
  },
  { id: 'auth.welcome', data: { ...base, name: 'A\tB\u007fC', streetAddress: OTHER_ST } },
  { id: 'auth.welcome', data: { ...base, name: 'A\u0085B', streetAddress: OTHER_ST } },
  { id: 'auth.welcome', data: { name: 'Asha Rao' } },
]) as RealOutcome[];

type R = { subject: string; html: string; text: string };
function ok(o: RealOutcome | undefined): R {
  if (!o || !o.ok) throw new Error('expected a render');
  return o;
}
function h1(html: string): string {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (!m) throw new Error('no h1');
  return m[1]!.replace(/<!--.*?-->/g, '');
}

describe('T-587 welcome plain text, exact (via the render path)', () => {
  it('name, Ranchi street', () => {
    expect(ok(NAMED_RANCHI).text).toBe(
      expected('Welcome, Asha Rao.', 'Lawie (Sole Proprietorship), 12 MG Road, Ranchi'),
    );
  });
  it('name, non-Ranchi street gets Ranchi, Jharkhand appended', () => {
    expect(ok(NAMED_OTHER).text).toBe(
      expected('Welcome, Asha Rao.', 'Lawie (Sole Proprietorship), 12 MG Road, Ranchi, Jharkhand'),
    );
  });
  it('no name, Ranchi street', () => {
    expect(ok(NONAME_RANCHI).text).toBe(
      expected('Welcome.', 'Lawie (Sole Proprietorship), 12 MG Road, Ranchi'),
    );
  });
  it('no name, non-Ranchi street', () => {
    expect(ok(NONAME_OTHER).text).toBe(
      expected('Welcome.', 'Lawie (Sole Proprietorship), 12 MG Road, Ranchi, Jharkhand'),
    );
    expect(ok(NONAME_OTHER).subject).toBe('Welcome to Lawie');
  });
  it('no upper-cased heading, no markup, login URL present, footer in order, trailing newline', () => {
    for (const o of [NAMED_RANCHI, NAMED_OTHER, NONAME_RANCHI, NONAME_OTHER]) {
      const { text } = ok(o);
      expect(text).not.toContain('<');
      expect(text).not.toMatch(/WELCOME/);
      expect(text).toContain(LOGIN);
      expect(text.endsWith('\n')).toBe(true);
      const idx = ['Lawie (Sole', FOOTER2, FOOTER3, FOOTER4].map((s) => text.indexOf(s));
      expect(idx.every((i) => i >= 0)).toBe(true);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    }
  });
  it('dry run (no street, no loginUrl) still renders subject, html and text', () => {
    const r = ok(DRY);
    expect(r.subject).toBe('Welcome to Lawie, Asha Rao');
    expect(r.text).toContain('Welcome, Asha Rao.');
    expect(r.text).toContain('https://lawie.in/login');
    expect(r.html).toContain('Open your dashboard');
  });
});

describe('T-587 welcome: control characters in the name', () => {
  it('CR/LF/NUL never reach the subject, html heading or text heading', () => {
    const r = ok(NASTY_OUT);
    const textHeading = r.text.split('\n')[0]!;
    for (const s of [r.subject, h1(r.html), textHeading]) {
      expect(s.includes('\r') || s.includes('\n') || s.includes('\u0000')).toBe(false);
    }
    // only the control run becomes one space; other spaces are kept
    expect(r.subject).toBe('Welcome to Lawie, Asha Bcc: x@y  Rao');
    expect(textHeading).toBe('Welcome, Asha Bcc: x@y  Rao.');
    expect(r.text.split('\n')[1]).toBe('');
    expect(r.text).not.toMatch(/\r/);
  });
  it('tab and DEL become spaces', () => {
    const r = ok(TAB_DEL);
    expect(r.subject).toBe('Welcome to Lawie, A B C');
    expect(r.text.split('\n')[0]).toBe('Welcome, A B C.');
  });
  it('a name of only CR/LF uses the no-name forms', () => {
    const r = ok(CR_ONLY);
    expect(r.subject).toBe('Welcome to Lawie');
    expect(r.text.split('\n')[0]).toBe('Welcome.');
    expect(h1(r.html)).toBe('Welcome.');
  });
  it('a name of only control characters and whitespace uses the no-name forms', () => {
    const r = ok(CTRL_ONLY);
    expect(r.subject).toBe('Welcome to Lawie');
    expect(r.text.split('\n')[0]).toBe('Welcome.');
    expect(h1(r.html)).toBe('Welcome.');
  });
  it('U+0085 is outside the stripped range and is left alone', () => {
    expect(ok(NEL).subject).toBe('Welcome to Lawie, A\u0085B');
  });
});
