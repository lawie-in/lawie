/**
 * T-522 (AJ-522-M5, AJ-522-S9): the auth.signupAttempt mail. Subject and body are Ajay's M5 text;
 * sign-off, footer 1-4 are the S9-approved lines; bare URLs to the plain sign-in and
 * forgot-password pages; no privacy@ address anywhere; refuses to render without its links.
 * Real renderer in a child process (it cannot run in Jest).
 */
import { renderRealBatch, type RealOutcome } from './helpers/t223-real-render';

// Byte for byte from handoff/legal/T-511-copy-rulings-ajay.md (AJ-522-M5, AJ-522-S9).
const SUBJECT = 'About your Lawie account';
const BODY =
  'Someone tried to create a Lawie account with this email. If it was you, sign in or reset your password. If not, you can ignore this email.';
const SIGN_OFF = 'Team Lawie';
const FOOTER2 = 'You are receiving this because you have a Lawie account.';
const FOOTER3 = 'Help, data and privacy requests: contact@lawie.in';
const FOOTER4 = 'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms';

const SIGN_IN = 'https://app.lawie.in/login';
const RESET = 'https://app.lawie.in/forgot-password';
const STREET = '12 Example Marg, Fake Nagar';
const STREET_RANCHI = '12 Example Marg, Fake Nagar, Ranchi, Jharkhand 834001';
const MARKER = '[street address from config]';

const outcomes = renderRealBatch([
  {
    id: 'auth.signupAttempt',
    data: { signInUrl: SIGN_IN, resetUrl: RESET, streetAddress: STREET },
  },
  {
    id: 'auth.signupAttempt',
    data: { signInUrl: SIGN_IN, resetUrl: RESET, streetAddress: STREET_RANCHI },
  },
  { id: 'auth.signupAttempt', data: { signInUrl: SIGN_IN, resetUrl: RESET } },
  { id: 'auth.signupAttempt', data: { resetUrl: RESET } },
  { id: 'auth.signupAttempt', data: { signInUrl: SIGN_IN } },
  { id: 'auth.signupAttempt', data: { signInUrl: '', resetUrl: RESET } },
  { id: 'auth.signupAttempt', data: { signInUrl: SIGN_IN, resetUrl: 42 } },
  { id: 'auth.signupAttempt', data: {} },
  {
    id: 'auth.signupAttempt',
    data: { signInUrl: SIGN_IN, resetUrl: RESET, name: 'Leaky Name', email: 'leak@example.com' },
  },
]);
const ok = (o: RealOutcome | undefined) => {
  if (!o || !o.ok) throw new Error('expected a render');
  return o;
};
const [PLAIN, CITY, NO_STREET, ...REST] = outcomes;
const REFUSED = REST.slice(0, 5);
const LEAKY = REST[5];

const visible = (html: string) =>
  html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[\u200b-\u200f\u2060\ufeff\u00a0]/g, '');

describe('T-522 signupAttempt: signed strings', () => {
  const r = ok(PLAIN);

  it('subject is exactly the signed subject', () => {
    expect(r.subject).toBe(SUBJECT);
  });

  it('body is exactly the signed M5 text, in the html and the plain text', () => {
    expect(visible(r.html)).toContain(BODY);
    expect(r.text).toContain(BODY);
    // not widened into "log in or reset"
    expect(r.text).not.toMatch(/log in/i);
  });

  it('sign-off and footers 2, 3, 4 are the S9 lines', () => {
    for (const s of [SIGN_OFF, FOOTER2, FOOTER3, FOOTER4]) {
      expect(visible(r.html)).toContain(s);
      expect(r.text).toContain(s);
    }
  });

  it('footer 1 is the reset mail line with the street address', () => {
    const line = `Lawie (Sole Proprietorship), ${STREET}, Ranchi, Jharkhand`;
    expect(visible(r.html)).toContain(line);
    expect(r.text).toContain(line);
  });

  it('footer 1 does not repeat the city when the street address already names it', () => {
    const c = ok(CITY);
    const line = `Lawie (Sole Proprietorship), ${STREET_RANCHI}`;
    expect(c.text).toContain(line);
    expect(c.text).not.toMatch(/Ranchi, Jharkhand 834001, Ranchi/);
  });

  it('with no street address the footer shows the visible marker (dry run)', () => {
    const n = ok(NO_STREET);
    expect(n.text).toContain(`Lawie (Sole Proprietorship), ${MARKER}, Ranchi, Jharkhand`);
  });

  it('there is no privacy@lawie.in anywhere (S9 / AJ-559-M1)', () => {
    for (const o of [PLAIN, CITY, NO_STREET]) {
      const x = ok(o);
      expect(x.html).not.toMatch(/privacy@/i);
      expect(x.text).not.toMatch(/privacy@/i);
    }
  });

  it('shows the two page URLs bare and as links, with no token and no button label', () => {
    expect(r.text).toContain(SIGN_IN);
    expect(r.text).toContain(RESET);
    expect(r.html).toContain(`href="${SIGN_IN}"`);
    expect(r.html).toContain(`href="${RESET}"`);
    expect(r.html + r.text).not.toMatch(/token/i);
  });
});

describe('T-522 signupAttempt: no data beyond the links', () => {
  it('renders the same body whatever name or email appear in the data, and never echoes them', () => {
    const l = ok(LEAKY);
    expect(l.html).not.toContain('Leaky Name');
    expect(l.html).not.toContain('leak@example.com');
    expect(l.text).not.toContain('Leaky Name');
    expect(l.text).not.toContain('leak@example.com');
    expect(l.subject).toBe(SUBJECT);
  });

  it.each([
    ['signInUrl missing'],
    ['resetUrl missing'],
    ['signInUrl empty'],
    ['resetUrl not a string'],
    ['no data'],
  ])('%s: render throws, and the message names no value', (_l) => {
    const i = [
      'signInUrl missing',
      'resetUrl missing',
      'signInUrl empty',
      'resetUrl not a string',
      'no data',
    ].indexOf(_l);
    const o = REFUSED[i]!;
    expect(o.ok).toBe(false);
    if (!o.ok) {
      expect(o.message).not.toMatch(/https?:/);
      expect(o.message).not.toContain('@');
    }
  });
});
