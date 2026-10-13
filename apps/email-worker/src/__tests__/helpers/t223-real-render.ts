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
