/**
 * T-358: the unverified-account deletion notice carries Ajay's signed strings byte for byte
 * (handoff/legal/dpdp-v1-calls-signed.md "Update (14 Oct 2026)" a84e298 and §8 row 3 08a0d09).
 * The expected strings are written out here from the signed file, NOT imported from the template,
 * so a drift in the source fails. The real renderer runs in a child process (it cannot run in
 * Jest), as t223-verify-email-template does.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SIGNED = path.resolve(ROOT, '..', '..', 'handoff', 'legal');

const LINK = `https://app.lawie.in/verify-email?token=${'ef'.repeat(32)}`;
const DATE = '21 October 2026';
const NAME = 'Zainab Quasimodo';

const SUBJECT = 'Verify your email to keep your Lawie account';
const PREHEADER =
  'We will delete your account on 21 October 2026 unless you verify your email address.';
const BODY =
  'Please verify your email address. If it is not verified by 21 October 2026, we will delete your Lawie account and everything in it.';
const BUTTON = 'Verify email address';
const FOOTER = [
  'Lawie (Sole Proprietorship), Ranchi, Jharkhand',
  'You are receiving this because this email address was used to sign up for Lawie.',
  'Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in',
  'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms',
];

interface Out {
  ok: boolean;
  subject: string;
  html: string;
  text: string;
  name: string;
  message: string;
}
function runRender(data: Record<string, unknown>): Out {
  const script = `
    require('ts-node').register({ transpileOnly: true });
    const data = JSON.parse(process.argv[1]);
    require('./src/templates').renderTemplate('auth.unverifiedDeletionNotice', data).then(
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
  return JSON.parse(r.stdout.trim().split('\n').pop() as string) as Out;
}
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

let full: Out;
let noName: Out;
beforeAll(() => {
  full = runRender({ variant: 'A', name: NAME, verifyUrl: LINK, deletionDate: DATE });
  noName = runRender({ variant: 'A', name: '', verifyUrl: LINK, deletionDate: DATE });
}, 120_000);

describe('signed source files hold the strings this test pins', () => {
  it('dpdp-v1-calls-signed.md has the body, subject, preheader, button and footer lines', () => {
    const md = fs.readFileSync(path.join(SIGNED, 'dpdp-v1-calls-signed.md'), 'utf8');
    expect(md).toContain('`' + BODY.replace('21 October 2026', '{date}') + '`');
    expect(md).toContain('`' + SUBJECT + '`');
    expect(md).toContain('`' + PREHEADER.replace('21 October 2026', '{date}') + '`');
    expect(md).toContain('`' + BUTTON + '`');
    expect(md).toContain('`' + FOOTER[0] + '`');
    expect(md).toContain('`' + FOOTER[1] + '`');
  });
});

describe('subject', () => {
  it('is the signed subject, with no name, no address, no date', () => {
    expect(full.ok).toBe(true);
    expect(full.subject).toBe(SUBJECT);
    expect(
      runRender({
        variant: 'A',
        name: 'a@b.com Other',
        verifyUrl: LINK,
        deletionDate: '1 January 2027',
      }).subject,
    ).toBe(SUBJECT);
  });
});

describe('HTML', () => {
  it('holds the preheader, greeting, body, button label and four footer lines word for word', () => {
    const text = visible(full.html);
    for (const s of [PREHEADER, `Hello ${NAME},`, BODY, BUTTON, ...FOOTER]) {
      expect(text).toContain(s);
    }
  });

  it('the button is a link to the verify URL labelled "Verify email address"', () => {
    expect(full.html).toMatch(
      new RegExp(`<a[^>]*href="${LINK.replace(/[.?]/g, '\\$&')}"[^>]*>${BUTTON}</a>`),
    );
  });

  it('shows the date once in the preheader and once in the body, unchanged', () => {
    const text = visible(full.html);
    expect(text.split(DATE).length - 1).toBe(2);
  });
});

describe('plain text', () => {
  it('is exactly the signed lines with "Verify email address: {url}" in place of the button', () => {
    expect(full.text).toBe(
      [`Hello ${NAME},`, '', BODY, '', `${BUTTON}: ${LINK}`, '', '--', ...FOOTER, ''].join('\n'),
    );
  });
});

describe('greeting variants', () => {
  it('"Hello {name}," with a name', () => {
    expect(full.text.split('\n')[0]).toBe(`Hello ${NAME},`);
    expect(visible(full.html)).toContain(`Hello ${NAME},`);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['absent', undefined],
  ])('"Hello," when the name is %s', (_l, name) => {
    const out =
      name === undefined
        ? runRender({ variant: 'A', verifyUrl: LINK, deletionDate: DATE })
        : runRender({ variant: 'A', name, verifyUrl: LINK, deletionDate: DATE });
    expect(out.ok).toBe(true);
    expect(out.text.split('\n')[0]).toBe('Hello,');
    expect(visible(out.html)).toContain('Hello,');
    expect(out.text).not.toContain('Hello ,');
    expect(out.text).not.toContain('{name}');
  });

  it('the empty-name variant is otherwise identical', () => {
    expect(noName.text.split('\n').slice(1)).toEqual(full.text.split('\n').slice(1));
  });
});

describe('date', () => {
  it('is printed exactly as given (auth formats it in IST: D Month YYYY)', () => {
    for (const d of ['21 October 2026', '5 March 2027', '1 January 2027']) {
      const out = runRender({ variant: 'A', name: NAME, verifyUrl: LINK, deletionDate: d });
      expect(out.text).toContain(
        `If it is not verified by ${d}, we will delete your Lawie account and everything in it.`,
      );
      expect(visible(out.html)).toContain(
        `We will delete your account on ${d} unless you verify your email address.`,
      );
    }
  });
});

describe('refuses to render without its link or its date', () => {
  it.each([
    ['A without verifyUrl', { variant: 'A', name: NAME, deletionDate: DATE }],
    ['A with empty verifyUrl', { variant: 'A', name: NAME, verifyUrl: '', deletionDate: DATE }],
    ['A without deletionDate', { variant: 'A', name: NAME, verifyUrl: LINK }],
    ['A with empty deletionDate', { variant: 'A', name: NAME, verifyUrl: LINK, deletionDate: '' }],
    ['A with neither', { variant: 'A', name: NAME }],
    ['no variant', { name: NAME, verifyUrl: LINK, deletionDate: DATE }],
    ['unknown variant', { variant: 'C', name: NAME, verifyUrl: LINK, deletionDate: DATE }],
    ['lower-case variant', { variant: 'a', name: NAME, verifyUrl: LINK, deletionDate: DATE }],
    ['B without deletionDate', { variant: 'B', name: NAME }],
    ['B with empty deletionDate', { variant: 'B', name: NAME, deletionDate: '' }],
    [
      'B with a verifyUrl (a link that cannot work is never sent)',
      { variant: 'B', name: NAME, verifyUrl: LINK, deletionDate: DATE },
    ],
  ])('%s', (_l, data) => {
    const out = runRender(data);
    expect(out.ok).toBe(false);
    // The error names the missing field, never a value.
    expect(out.message).not.toContain(NAME);
    expect(out.message).not.toContain(LINK);
    expect(out.message).not.toContain('{date}');
  });
});

describe('footer (variant A)', () => {
  it('has no [registered address] or [PIN] placeholder, in HTML or text', () => {
    for (const part of [full.html, full.text]) {
      expect(part).not.toContain('[registered address]');
      expect(part).not.toContain('[PIN]');
      expect(part).not.toMatch(/\[[^\]]+\]/);
      expect(part).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });
});

// ── Variant B (Ajay §9, 3f94ce9): deactivated account, no link ──────────────

const B_SUBJECT = 'Your deactivated Lawie account will be deleted';
const B_PREHEADER = 'We will delete it on 21 October 2026 unless you write to us before then.';
const B_BODY =
  'This Lawie account was deactivated and its email address was never verified. We will delete the account and everything in it on 21 October 2026. If you want to keep it, write to privacy@lawie.in from this email address before then.';

describe('variant B', () => {
  let b: Out;
  let bNoName: Out;
  beforeAll(() => {
    b = runRender({ variant: 'B', name: NAME, deletionDate: DATE });
    bNoName = runRender({ variant: 'B', name: '', deletionDate: DATE });
  }, 120_000);

  it('the signed file holds the B strings this test pins', () => {
    const md = fs.readFileSync(path.join(SIGNED, 'dpdp-v1-calls-signed.md'), 'utf8');
    expect(md).toContain('Subject: `' + B_SUBJECT + '`');
    expect(md).toContain('Preheader: `' + B_PREHEADER.replace(DATE, '{date}') + '`');
    expect(md).toContain('Body: `' + B_BODY.replace(DATE, '{date}') + '`');
  });

  it('subject is the signed B subject, with no name, address or date', () => {
    expect(b.ok).toBe(true);
    expect(b.subject).toBe(B_SUBJECT);
    expect(
      runRender({ variant: 'B', name: 'a@b.com', deletionDate: '1 January 2027' }).subject,
    ).toBe(B_SUBJECT);
  });

  it('HTML holds the preheader, greeting, body and the four footer lines word for word', () => {
    const text = visible(b.html);
    for (const s of [B_PREHEADER, `Hello ${NAME},`, B_BODY, ...FOOTER]) expect(text).toContain(s);
  });

  it('plain text is exactly greeting, body, footer: no button, no link line', () => {
    expect(b.text).toBe([`Hello ${NAME},`, '', B_BODY, '', '--', ...FOOTER, ''].join('\n'));
  });

  it('has no link and no button: no <a href> to a verify URL, no "Verify email address"', () => {
    expect(b.html).not.toContain('verify-email');
    expect(b.html).not.toContain(BUTTON);
    expect(b.text).not.toContain(BUTTON);
    expect(b.text).not.toContain('http://');
    expect(b.text).not.toMatch(/https:\/\/app\./);
    // The only links are the footer's privacy and terms pages.
    const hrefs = Array.from(b.html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
    for (const h of hrefs) expect(h).toMatch(/^(https:\/\/lawie\.in\/(privacy|terms)|mailto:)/);
  });

  it('greeting variants: "Hello," with an empty name; otherwise identical', () => {
    expect(bNoName.text.split('\n')[0]).toBe('Hello,');
    expect(bNoName.text.split('\n').slice(1)).toEqual(b.text.split('\n').slice(1));
  });

  it('the date is printed as given, in preheader and body', () => {
    const out = runRender({ variant: 'B', name: NAME, deletionDate: '5 March 2027' });
    expect(out.text).toContain('We will delete the account and everything in it on 5 March 2027.');
    expect(visible(out.html)).toContain(
      'We will delete it on 5 March 2027 unless you write to us before then.',
    );
  });

  it('footer has no placeholders', () => {
    for (const part of [b.html, b.text]) {
      expect(part).not.toContain('[registered address]');
      expect(part).not.toContain('[PIN]');
      expect(part).not.toMatch(/\[[^\]]+\]/);
      expect(part).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it('A and B differ only where signed: subject, preheader, body, button/link', () => {
    expect(full.subject).not.toBe(b.subject);
    expect(full.text).toContain(BUTTON);
    expect(b.text).not.toContain(BODY);
  });
});

// ── `$` replacement patterns in a name or a date are inserted literally ─────

describe('$ patterns are literal', () => {
  const NASTY = "$& $' $` $$ $1 $<x>";
  it.each(['A', 'B'] as const)(
    'variant %s: a name with $ patterns appears verbatim, once, in text and HTML',
    (variant) => {
      const data: Record<string, unknown> = { variant, name: NASTY, deletionDate: DATE };
      if (variant === 'A') data.verifyUrl = LINK;
      const out = runRender(data);
      expect(out.ok).toBe(true);
      expect(out.text.split('\n')[0]).toBe(`Hello ${NASTY},`);
      expect(visible(out.html)).toContain(`Hello ${NASTY},`);
      // The expanded forms (the matched text, the text before/after) must not have crept in.
      expect(out.text.split('\n')[0]).not.toContain('{name}');
      expect(out.text.split('\n')[0]).not.toContain('Hello Hello');
    },
  );

  it.each(['A', 'B'] as const)(
    'variant %s: a date with $ patterns appears verbatim in preheader and body',
    (variant) => {
      const date = "$& 2026 $' $` $$";
      const data: Record<string, unknown> = { variant, name: NAME, deletionDate: date };
      if (variant === 'A') data.verifyUrl = LINK;
      const out = runRender(data);
      expect(out.ok).toBe(true);
      const bodyLine = out.text.split('\n')[2];
      expect(bodyLine).toContain(
        `${variant === 'A' ? 'If it is not verified by' : 'We will delete the account and everything in it on'} ${date}`,
      );
      expect(bodyLine).not.toContain('{date}');
      expect(visible(out.html)).toContain(date.replace(/'/g, "'"));
      expect(out.text.split(date).length - 1).toBe(1);
    },
  );

  it('a name equal to "{date}" or "{name}" is not expanded a second time', () => {
    const out = runRender({ variant: 'A', name: '{date}', verifyUrl: LINK, deletionDate: DATE });
    expect(out.text.split('\n')[0]).toBe('Hello {date},');
  });
});
