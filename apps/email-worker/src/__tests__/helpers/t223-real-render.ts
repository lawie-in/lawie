/**
 * T-223: renders a template with the REAL renderer (and so the real footer) in a child process,
 * because @react-email/render cannot run inside Jest (dynamic import). Same approach as
 * t223-verify-email-template.test.ts. The child gets a bare environment: templates read no env.
 */
import { spawnSync } from 'child_process';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');

export interface RealRendered {
  subject: string;
  html: string;
  text: string;
}

export function renderReal(templateId: string, data: Record<string, unknown>): RealRendered {
  const script = `
    require('ts-node').register({ transpileOnly: true });
    const [id, data] = [process.argv[1], JSON.parse(process.argv[2])];
    require('./src/templates').renderTemplate(id, data).then(
      (r) => console.log(JSON.stringify({ ok: true, ...r })),
      (e) => console.log(JSON.stringify({ ok: false, name: e.name })),
    );`;
  const r = spawnSync(process.execPath, ['-e', script, templateId, JSON.stringify(data)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (r.status !== 0) throw new Error(`render child failed (${r.status})`);
  const out = JSON.parse(r.stdout.trim().split('\n').pop() as string) as RealRendered & {
    ok: boolean;
  };
  if (!out.ok) throw new Error(`render child could not render ${templateId}`);
  return { subject: out.subject, html: out.html, text: out.text };
}

/**
 * T-436 (b/c): the merge fields billing.taxInvoice and billing.creditNote refuse to render
 * without. Spread into the "render every template" sentinels so the sweeps stay meaningful.
 */
export const INVOICE_SENTINEL_FIELDS = {
  invoiceNumber: 'LAW/2026-27/0001',
  creditNoteNumber: 'LCN/2026-27/0001',
  amount: '₹799',
  date: '14 Oct 2026',
  downloadUrl: 'https://app.lawie.in/invoices',
};

/** T-522: the merge fields auth.signupAttempt refuses to render without (plain pages, no token). */
export const SIGNUP_ATTEMPT_SENTINEL_FIELDS = {
  signInUrl: 'https://app.lawie.in/login',
  resetUrl: 'https://app.lawie.in/forgot-password',
};

export type RealOutcome =
  | { ok: true; subject: string; html: string; text: string }
  | { ok: false; name: string; message: string };

/**
 * T-436: renders several (template, data) cases in ONE child process (the child start-up is the
 * slow part) and reports a refusal as data instead of throwing, so a test can assert on the
 * error's message. Same bare environment as renderReal.
 */
export function renderRealBatch(
  cases: Array<{ id: string; data: Record<string, unknown> }>,
): RealOutcome[] {
  const script = `
    require('ts-node').register({ transpileOnly: true });
    const cases = JSON.parse(process.argv[1]);
    const { renderTemplate } = require('./src/templates');
    Promise.all(cases.map((c) => renderTemplate(c.id, c.data).then(
      (r) => ({ ok: true, ...r }),
      (e) => ({ ok: false, name: e.name, message: e.message }),
    ))).then((out) => console.log(JSON.stringify(out)));`;
  const r = spawnSync(process.execPath, ['-e', script, JSON.stringify(cases)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (r.status !== 0) throw new Error(`render child failed (${r.status})`);
  return JSON.parse(r.stdout.trim().split('\n').pop() as string) as RealOutcome[];
}
