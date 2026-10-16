/**
 * T-221 AC2 / AC5 / AC6 (email-worker template): E1 (link) and E2 (Google-only) render with the
 * signed strings, no name or address, the Ranchi footer, and refuse to render on bad data. Uses
 * the real renderer in a child process (it cannot run in Jest).
 */
import { renderRealBatch, type RealOutcome } from './helpers/t223-real-render';

const URL_ = `https://app.lawie.in/reset-password/${'ab'.repeat(32)}`;
const LOGIN = 'https://app.lawie.in/login';
const STREET = '12 Example Marg, Fake Nagar';
const STREET_RANCHI = '12 Example Marg, Fake Nagar, Ranchi, Jharkhand 834001';
const MARKER = '[street address from config]';
// Footer line 1 is built from the supplier address at send time (Ajay condition 1).
const FOOTER1 = `Lawie (Sole Proprietorship), ${STREET}, Ranchi, Jharkhand`;
const FOOTER1_CITY = `Lawie (Sole Proprietorship), ${STREET_RANCHI}`;
const FOOTER1_MARKER = `Lawie (Sole Proprietorship), ${MARKER}, Ranchi, Jharkhand`;

const outcomes = renderRealBatch([
  { id: 'auth.passwordReset', data: { variant: 'link', resetUrl: URL_, streetAddress: STREET } },
  { id: 'auth.passwordReset', data: { variant: 'google', loginUrl: LOGIN, streetAddress: STREET } },
  { id: 'auth.passwordReset', data: { variant: 'A', resetUrl: URL_ } },
  { id: 'auth.passwordReset', data: { variant: 'link' } },
  { id: 'auth.passwordReset', data: { variant: 'link', resetUrl: '' } },
  { id: 'auth.passwordReset', data: { variant: 'google' } },
  { id: 'auth.passwordReset', data: { variant: 'google', loginUrl: LOGIN, resetUrl: URL_ } },
  { id: 'auth.passwordReset', data: { variant: 'link', resetUrl: URL_, loginUrl: LOGIN } },
  { id: 'auth.passwordReset', data: {} },
  // Footer forms.
  {
    id: 'auth.passwordReset',
    data: { variant: 'link', resetUrl: URL_, streetAddress: STREET_RANCHI },
  },
  { id: 'auth.passwordReset', data: { variant: 'link', resetUrl: URL_ } },
  { id: 'auth.passwordReset', data: { variant: 'google', loginUrl: LOGIN, streetAddress: STREET } },
  {
    id: 'auth.passwordReset',
    data: { variant: 'google', loginUrl: LOGIN, streetAddress: STREET_RANCHI },
  },
  { id: 'auth.passwordReset', data: { variant: 'link', resetUrl: URL_, streetAddress: '   ' } },
]);
const ok = (o: RealOutcome) => {
  if (!o.ok) throw new Error('expected a render');
  return o;
};
const [LINK, GOOGLE, ...REST] = outcomes;
const REFUSED = REST.slice(0, 7);
const [LINK_CITY, LINK_MARKER, GOOGLE_PLAIN, GOOGLE_CITY, LINK_BLANK] = REST.slice(7);

describe('E1 link variant', () => {
  const r = ok(LINK!);
  it('subject, button and 30-minute single-use wording', () => {
    expect(r.subject).toBe('Reset your Lawie password');
    expect(r.html).toContain('Set a new password');
    expect(r.html).toContain('This link works once and expires in 30 minutes.');
    expect(r.html).toContain('signed out on your other devices');
  });
  it('html button and text part both carry the reset URL', () => {
    expect(r.html).toContain(`href="${URL_}"`);
    expect(r.text).toContain(`Set a new password: ${URL_}`);
  });
  it('signed Ranchi footer in html and as its own text line; no Patna or placeholder', () => {
    expect(r.html).toContain(FOOTER1);
    expect(r.text.split('\n').map((l) => l.trim())).toContain(FOOTER1);
    for (const p of [r.html, r.text, r.subject]) {
      expect(p).not.toContain('Patna');
      expect(p).not.toMatch(/\[[^\]]*(PIN|registered address|placeholder)[^\]]*\]/i);
    }
  });
  it('no name, greeting or address in the body', () => {
    for (const p of [r.html, r.text]) {
      expect(p).not.toMatch(/\bHi\b|\bHello\b|\bDear\b/);
      expect(p).not.toMatch(/@(?!lawie\.in)[a-z0-9.-]+\.[a-z]{2,}/i);
    }
  });
});

describe('E2 Google-only variant (AC6)', () => {
  const r = ok(GOOGLE!);
  it('says to sign in with Google and carries the login URL', () => {
    expect(r.subject).toBe('Sign in to Lawie with Google');
    expect(r.html).toContain('Continue with Google');
    expect(r.html).toContain(`href="${LOGIN}"`);
    expect(r.text).toContain(`Go to sign in: ${LOGIN}`);
  });
  it('has no reset link, no expiry claim, same signed footer', () => {
    for (const p of [r.html, r.text]) {
      expect(p).not.toContain('reset-password');
      expect(p).not.toContain('expires in 30 minutes');
      expect(p).toContain(FOOTER1);
    }
  });
});

describe('footer line 1 is built from the supplier address (Ajay condition 1)', () => {
  const lineOf = (o: RealOutcome) =>
    ok(o)
      .text.split('\n')
      .map((l) => l.trim());
  it('address without a city: "<address>, Ranchi, Jharkhand"', () => {
    for (const o of [LINK!, GOOGLE_PLAIN!]) {
      expect(ok(o).html).toContain(FOOTER1);
      expect(lineOf(o)).toContain(FOOTER1);
    }
  });
  it('address that already names Ranchi: city is not repeated', () => {
    for (const o of [LINK_CITY!, GOOGLE_CITY!]) {
      expect(ok(o).html).toContain(FOOTER1_CITY);
      expect(lineOf(o)).toContain(FOOTER1_CITY);
      expect(ok(o).text.match(/Ranchi/g)).toHaveLength(1);
      expect(ok(o).text).not.toContain('Ranchi, Jharkhand, Ranchi');
    }
  });
  it('no address (dry run): visible marker in line 1, html and text', () => {
    for (const o of [LINK_MARKER!, LINK_BLANK!]) {
      expect(ok(o).html).toContain(MARKER);
      expect(lineOf(o)).toContain(FOOTER1_MARKER);
    }
  });
  it('the old static footer is gone', () => {
    for (const o of [LINK!, GOOGLE_PLAIN!, LINK_MARKER!]) {
      expect(lineOf(o)).not.toContain('Lawie (Sole Proprietorship), Ranchi, Jharkhand');
    }
  });
});

describe('refuses to render (message names no value)', () => {
  it('every bad combination is refused', () => {
    expect(REFUSED).toHaveLength(7);
    for (const o of REFUSED) {
      expect(o.ok).toBe(false);
      if (!o.ok) {
        expect(o.message).toContain('auth.passwordReset');
        expect(o.message).not.toContain('reset-password/');
        expect(o.message).not.toContain('ab'.repeat(32));
      }
    }
  });
});
