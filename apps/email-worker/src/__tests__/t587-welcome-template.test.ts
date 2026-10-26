/**
 * T-587 (AJ-587-M1; body AJ-556-M1): the welcome email wording, with the real renderer in a child
 * process (it cannot run in Jest). Every signed string is inline (handoff/ is stripped from the
 * main snapshot). Subject and heading have a no-name form; there is no "Advocate" fallback.
 */
import { renderRealBatch, type RealOutcome } from './helpers/t223-real-render';

const LOGIN = 'https://app.lawie.in/login';
const STREET = '12 Example Marg, Fake Nagar';
const STREET_RANCHI = '12 Example Marg, Fake Nagar, Ranchi, Jharkhand 834001';

const BODY =
  'You can now describe your matter and get a first draft of a bail application, notice, writ or maintenance petition to review and edit before you file. Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.';
const DISCLAIMER =
  'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.';
const FOOTER2 = 'You are receiving this because you have a Lawie account.';
const FOOTER3 = 'Help, data and privacy requests: contact@lawie.in';
const FOOTER4 = 'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms';

const [NAMED, UNNAMED, BLANK, WHITESPACE, CITY, DRY, NONSTRING_NAME, ABSENT_URL] = renderRealBatch([
  { id: 'auth.welcome', data: { name: 'Anita Rao', loginUrl: LOGIN, streetAddress: STREET } },
  { id: 'auth.welcome', data: { name: '', loginUrl: LOGIN, streetAddress: STREET } },
  { id: 'auth.welcome', data: { loginUrl: LOGIN, streetAddress: STREET } },
  { id: 'auth.welcome', data: { name: '   ', loginUrl: LOGIN, streetAddress: STREET } },
  {
    id: 'auth.welcome',
    data: { name: 'Anita Rao', loginUrl: LOGIN, streetAddress: STREET_RANCHI },
  },
  { id: 'auth.welcome', data: { name: 'Anita Rao', loginUrl: LOGIN } },
  { id: 'auth.welcome', data: { name: 42, loginUrl: LOGIN, streetAddress: STREET } },
  { id: 'auth.welcome', data: { name: 'Anita Rao', streetAddress: STREET } },
]) as RealOutcome[];

function ok(o: RealOutcome | undefined): { subject: string; html: string; text: string } {
  if (!o || !o.ok) throw new Error('expected a render');
  return o;
}

/** The html as plain text, entities decoded, whitespace collapsed. */
function plain(html: string): string {
  return html
    .replace(/<!--.*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

describe('T-587 welcome email, with a name (AJ-587-M1)', () => {
  const r = ok(NAMED);
  const text = plain(r.html);

  it('subject is `Welcome to Lawie, {name}`', () => {
    expect(r.subject).toBe('Welcome to Lawie, Anita Rao');
  });
  it('heading is `Welcome, {name}.`', () => {
    expect(text).toContain('Welcome, Anita Rao.');
  });
  it('preheader is `Your Lawie account is ready.` and the old preheader is gone', () => {
    expect(r.html).toContain('Your Lawie account is ready.');
    expect(r.html).not.toContain('AI legal drafting workspace');
  });
  it('body is AJ-556-M1 byte for byte', () => {
    expect(text).toContain(BODY);
  });
  it('button reads `Open your dashboard` and links the login URL', () => {
    expect(text).toContain('Open your dashboard');
    expect(r.html).toContain(`href="${LOGIN}"`);
  });
  it('disclaimer is the signed responsibility line', () => {
    expect(text).toContain(DISCLAIMER);
  });
  it('footer lines 1 to 4 are the signed set, in order', () => {
    const footer1 = `Lawie (Sole Proprietorship), ${STREET}, Ranchi, Jharkhand`;
    for (const line of [footer1, FOOTER2, FOOTER3, FOOTER4]) expect(text).toContain(line);
    const at = [footer1, FOOTER2, FOOTER3, FOOTER4].map((l) => text.indexOf(l));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(text.indexOf(DISCLAIMER)).toBeLessThan(at[0]);
  });
  it('footer line 1 does not repeat the city when the address already names Ranchi', () => {
    const c = plain(ok(CITY).html);
    expect(c).toContain(`Lawie (Sole Proprietorship), ${STREET_RANCHI}`);
    expect(c).not.toContain(`${STREET_RANCHI}, Ranchi, Jharkhand`);
  });
  it('no privacy@ address, no Patna, no unfilled placeholder, no AI-assisted, no court-ready', () => {
    for (const p of [r.html, r.text, r.subject]) {
      expect(p).not.toContain('privacy@lawie.in');
      expect(p).not.toContain('Patna');
      expect(p).not.toMatch(/\[[^\]]*(PIN|registered address|placeholder)[^\]]*\]/i);
      expect(p).not.toMatch(/AI-assisted|court-ready/i);
    }
  });
  it('has no Advocate greeting and no Devanagari (EN only)', () => {
    expect(r.subject).not.toMatch(/Advocate/);
    expect(text).not.toMatch(/Welcome, Advocate/);
    expect(text).not.toMatch(/[ऀ-ॿ]/);
  });
  it('the plain-text part carries the body and the dashboard link', () => {
    expect(r.text.replace(/\s+/g, ' ')).toContain(BODY);
    expect(r.text).toContain(LOGIN);
  });
});

describe('T-587 welcome email, with no usable name', () => {
  it.each([
    ['empty name', UNNAMED],
    ['absent name', BLANK],
    ['whitespace-only name', WHITESPACE],
    ['non-string name', NONSTRING_NAME],
  ])('%s: subject `Welcome to Lawie`, heading `Welcome.`, no "Advocate"', (_label, outcome) => {
    const r = ok(outcome);
    const text = plain(r.html);
    expect(r.subject).toBe('Welcome to Lawie');
    expect(text).toMatch(/(^|\s)Welcome\.(\s|$)/);
    expect(text).not.toMatch(/Welcome, /);
    expect(text).not.toMatch(/Advocate/);
    expect(r.subject).not.toMatch(/Advocate|undefined|null|42/);
    expect(text).not.toMatch(/undefined|null|NaN/);
    expect(text).toContain(BODY);
    expect(text).toContain('Open your dashboard');
  });
});

describe('T-587 welcome email, dry run and defaults', () => {
  it('without a street address (dry run) footer 1 shows the marker, nothing else breaks', () => {
    const t = plain(ok(DRY).html);
    expect(t).toContain(
      'Lawie (Sole Proprietorship), [street address from config], Ranchi, Jharkhand',
    );
    expect(t).toContain(FOOTER2);
  });
  it('without a loginUrl the button falls back to https://lawie.in/login', () => {
    expect(ok(ABSENT_URL).html).toContain('href="https://lawie.in/login"');
  });
});
