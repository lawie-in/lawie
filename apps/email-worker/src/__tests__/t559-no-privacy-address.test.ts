/**
 * T-559 (AJ-559-M1): no source under apps/ may print privacy@lawie.in outside a comment, and no
 * registered mail template may render it (HTML or text). The M1 footer replaces it, and
 * passwordReset (which had no footer3 check before) is pinned here.
 *
 * Comments are exempt (signupAttempt.tsx:11, web privacy/page.tsx:37), so the scan strips them
 * first. stripComments is checked on its own so a broken stripper cannot hide a violation.
 * @react-email/render cannot run inside Jest, so templates render in a child process.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const APPS = path.resolve(ROOT, '..');

const ADDRESS = 'privacy@lawie.in';
// Byte for byte from AJ-559-M1 (handoff/legal/T-511-copy-rulings-ajay.md).
const M1_FOOTER3 = 'Help, data and privacy requests: contact@lawie.in';

/**
 * Removes // line comments and block comments. A `//` counts as a comment only at the start of a
 * line or after whitespace, so URLs such as https://lawie.in survive. Newlines are kept.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const SKIP_DIRS = new Set(['__tests__', 'coverage', 'dist', '.next', 'node_modules']);
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html', '.md']);

function walk(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (
      SCAN_EXT.has(path.extname(e.name)) &&
      !/\.test\.[a-z]+$/.test(e.name) &&
      !e.name.endsWith('.d.ts')
    ) {
      out.push(path.join(dir, e.name));
    }
  }
}

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const app of fs.readdirSync(APPS, { withFileTypes: true })) {
    const src = path.join(APPS, app.name, 'src');
    if (app.isDirectory() && fs.existsSync(src)) walk(src, files);
  }
  return files;
}

function violations(files: string[]): string[] {
  const hits: string[] = [];
  for (const f of files) {
    const ext = path.extname(f);
    const raw = fs.readFileSync(f, 'utf8');
    const code = ext === '.json' || ext === '.html' || ext === '.md' ? raw : stripComments(raw);
    if (code.toLowerCase().includes(ADDRESS)) hits.push(path.relative(APPS, f));
  }
  return hits;
}

describe('T-559 stripComments (proves the scan can see and can skip)', () => {
  it('leaves the address in code visible, so it is flagged', () => {
    const src = `const a = 'Write to ${ADDRESS}.';\n`;
    expect(stripComments(src)).toContain(ADDRESS);
  });
  it('flags the address in code that has a URL and a comment on the same line', () => {
    const src = `const u = 'https://lawie.in'; const a = '${ADDRESS}'; // note\n`;
    expect(stripComments(src)).toContain(ADDRESS);
  });
  it('flags the address in a JSX text node next to a block comment', () => {
    const src = `<p>{/* ok */}Write to ${ADDRESS}</p>\n`;
    expect(stripComments(src)).toContain(ADDRESS);
  });
  it('drops the address in a line comment', () => {
    expect(stripComments(`// no ${ADDRESS} address\nconst x = 1;\n`)).not.toContain(ADDRESS);
    expect(stripComments(`const x = 1; // ${ADDRESS}\n`)).not.toContain(ADDRESS);
  });
  it('drops the address in a block comment, single or multi line', () => {
    expect(stripComments(`/* ${ADDRESS} */ const x = 1;`)).not.toContain(ADDRESS);
    expect(stripComments(`/**\n * ${ADDRESS}\n */\nconst x = 1;\n`)).not.toContain(ADDRESS);
  });
  it('keeps URLs with // intact', () => {
    expect(stripComments(`const u = 'https://lawie.in/privacy'; // c\n`)).toContain(
      'https://lawie.in/privacy',
    );
  });
});

describe('T-559 source scan: no privacy@lawie.in under apps/*/src outside comments', () => {
  const files = sourceFiles();

  it('walks the services (sanity: email-worker templates and web are included)', () => {
    const rel = files.map((f) => path.relative(APPS, f).split(path.sep).join('/'));
    expect(rel).toContain('email-worker/src/templates/auth/verifyEmail.tsx');
    expect(rel).toContain('email-worker/src/templates/billing/taxInvoice.tsx');
    expect(rel.some((r) => r.startsWith('web/src/'))).toBe(true);
    expect(rel.some((r) => r.startsWith('auth/src/'))).toBe(true);
    expect(rel.some((r) => r.includes('__tests__'))).toBe(false);
    expect(rel.some((r) => /\/(coverage|dist|node_modules|\.next)\//.test(r))).toBe(false);
  });

  it('the exempt comment hits really exist, so the stripper is what skips them', () => {
    const signup = fs.readFileSync(
      path.join(APPS, 'email-worker/src/templates/auth/signupAttempt.tsx'),
      'utf8',
    );
    expect(signup).toContain('privacy@');
    expect(stripComments(signup)).not.toContain('privacy@');
  });

  it('finds no privacy@lawie.in in code', () => {
    expect(violations(files)).toEqual([]);
  });
});

const NAME = 'Zainab Quasimodo';
const LINK = `https://app.lawie.in/verify-email?token=${'ab'.repeat(32)}`;
const RESET = `https://app.lawie.in/reset-password/${'ab'.repeat(32)}`;
const LOGIN = 'https://app.lawie.in/login';
const INVOICE = {
  invoiceNumber: 'LAW/2026-27/0001',
  creditNoteNumber: 'LCN/2026-27/0001',
  amount: '₹799',
  date: '14 Oct 2026',
  downloadUrl: 'https://app.lawie.in/invoices',
};
const STREET = '12 Example Marg, Fake Nagar';

const CASES: Array<{ id: string; label: string; data: Record<string, unknown> }> = [
  { id: 'auth.welcome', label: 'welcome', data: { name: NAME } },
  { id: 'auth.verifyEmail', label: 'verify', data: { name: NAME, verifyUrl: LINK } },
  {
    id: 'auth.verifyEmail',
    label: 'verify ink granted',
    data: { name: NAME, verifyUrl: LINK, signupInkGranted: true },
  },
  {
    id: 'auth.passwordReset',
    label: 'reset link',
    data: { variant: 'link', resetUrl: RESET, streetAddress: STREET },
  },
  {
    id: 'auth.passwordReset',
    label: 'reset google',
    data: { variant: 'google', loginUrl: LOGIN, streetAddress: STREET },
  },
  {
    id: 'auth.unverifiedDeletionNotice',
    label: 'notice A',
    data: { variant: 'A', name: NAME, verifyUrl: LINK, deletionDate: '21 October 2026' },
  },
  {
    id: 'auth.unverifiedDeletionNotice',
    label: 'notice B',
    data: { variant: 'B', name: NAME, deletionDate: '21 October 2026' },
  },
  {
    id: 'auth.signupAttempt',
    label: 'signup attempt',
    data: {
      signInUrl: LOGIN,
      resetUrl: 'https://app.lawie.in/forgot-password',
      streetAddress: STREET,
    },
  },
  { id: 'billing.taxInvoice', label: 'tax invoice', data: INVOICE },
  { id: 'billing.creditNote', label: 'credit note', data: INVOICE },
];

type Out =
  | { ok: true; subject: string; html: string; text: string }
  | { ok: false; name: string; message: string };

function renderAll(): { ids: string[]; outs: Out[] } {
  const script = `
    require('ts-node').register({ transpileOnly: true });
    const cases = JSON.parse(process.argv[1]);
    const t = require('./src/templates');
    Promise.all(cases.map((c) => t.renderTemplate(c.id, c.data).then(
      (r) => ({ ok: true, ...r }),
      (e) => ({ ok: false, name: e.name, message: e.message }),
    ))).then((outs) => console.log(JSON.stringify({ ids: t.listTemplates(), outs })));`;
  const r = spawnSync(process.execPath, ['-e', script, JSON.stringify(CASES)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
    timeout: 90_000,
  });
  if (r.status !== 0) throw new Error(`render child failed (${r.status})`);
  return JSON.parse(r.stdout.trim().split('\n').pop() as string) as { ids: string[]; outs: Out[] };
}

describe('T-559 rendered mail: no privacy@ in any registered template', () => {
  let res: { ids: string[]; outs: Out[] };
  beforeAll(() => {
    res = renderAll();
  }, 120_000);

  it('every registered template id has a render case here (a new template must be added)', () => {
    const covered = new Set(CASES.map((c) => c.id));
    expect(res.ids.filter((id) => !covered.has(id))).toEqual([]);
  });

  it('every case renders', () => {
    expect(res.outs.map((o, i) => `${CASES[i]!.label}: ${o.ok}`)).toEqual(
      CASES.map((c) => `${c.label}: true`),
    );
  });

  it.each(CASES.map((c, i) => [c.label, i] as const))(
    '%s: no privacy@ in subject, HTML or text',
    (_label, i) => {
      const o = res.outs[i]!;
      if (!o.ok) throw new Error('did not render');
      for (const part of [o.subject, o.html, o.text]) {
        expect(part.toLowerCase()).not.toContain('privacy@');
      }
    },
  );

  it.each([
    ['reset link', 3],
    ['reset google', 4],
  ] as const)('passwordReset footer3 (%s) is the M1 line and no privacy@', (_l, i) => {
    const o = res.outs[i]!;
    if (!o.ok) throw new Error('did not render');
    expect(o.html).toContain(M1_FOOTER3);
    expect(o.text).toContain(M1_FOOTER3);
    expect(o.html).not.toContain('privacy@');
    expect(o.text).not.toContain('privacy@');
  });

  it('the M1 footer is on every footer-carrying template', () => {
    const withFooter = [
      'verify',
      'reset link',
      'reset google',
      'notice A',
      'notice B',
      'signup attempt',
      'tax invoice',
      'credit note',
    ];
    for (const label of withFooter) {
      const o = res.outs[CASES.findIndex((c) => c.label === label)]!;
      if (!o.ok) throw new Error(`${label} did not render`);
      expect(o.text).toContain(M1_FOOTER3);
    }
  });
});
