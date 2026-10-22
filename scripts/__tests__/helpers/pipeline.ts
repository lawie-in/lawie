import fs from 'fs';
import os from 'os';
import path from 'path';

import { parse } from 'yaml';

export const REPO_ROOT = path.resolve(__dirname, '../../..');

export function repoPath(...p: string[]): string {
  return path.join(REPO_ROOT, ...p);
}

export function readRepo(rel: string): string {
  return fs.readFileSync(repoPath(rel), 'utf8');
}

/** Parse YAML with merge keys (<<: *anchor) resolved, as docker compose does. */
export function loadYaml(rel: string): any {
  return parse(readRepo(rel), { merge: true });
}

export function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// GitHub Actions `if:` evaluator for the subset the workflows use:
// context.path, 'string' literals, ==, !=, &&, ||, !, parentheses.
// Unknown context values are '' (GitHub: absent vars are empty strings).
// ---------------------------------------------------------------------------
type Ctx = Record<string, string | undefined>;

export function evalIf(expr: string | boolean | undefined, ctx: Ctx): boolean {
  if (expr === undefined) return true;
  if (typeof expr === 'boolean') return expr;
  const src = expr.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const tokens = src.match(/'(?:[^']|'')*'|==|!=|&&|\|\||!|\(|\)|[A-Za-z_][\w.-]*/g) ?? [];
  if (tokens.join('').length === 0 && src.trim().length) throw new Error(`cannot tokenize: ${src}`);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const primary = (): string | boolean => {
    const t = next();
    if (t === undefined) throw new Error(`unexpected end in: ${src}`);
    if (t === '(') {
      const v = orExpr();
      if (next() !== ')') throw new Error(`missing ) in: ${src}`);
      return v;
    }
    if (t === '!') return !truthy(primary());
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (t === 'true') return true;
    if (t === 'false') return false;
    return ctx[t] ?? '';
  };
  const truthy = (v: string | boolean) => (typeof v === 'boolean' ? v : v !== '');
  const eq = (): string | boolean => {
    let l = primary();
    while (peek() === '==' || peek() === '!=') {
      const op = next();
      const r = primary();
      const same = String(l).toLowerCase() === String(r).toLowerCase();
      l = op === '==' ? same : !same;
    }
    return l;
  };
  const andExpr = (): string | boolean => {
    let l = eq();
    while (peek() === '&&') {
      next();
      const r = eq();
      l = truthy(l) && truthy(r);
    }
    return l;
  };
  const orExpr = (): string | boolean => {
    let l = andExpr();
    while (peek() === '||') {
      next();
      const r = andExpr();
      l = truthy(l) || truthy(r);
    }
    return l;
  };
  const result = orExpr();
  if (pos !== tokens.length) throw new Error(`trailing tokens in: ${src}`);
  return truthy(result);
}

/** Which jobs run (an `if` that is true and every `needs` job ran; no always()). */
export function jobsThatRun(wf: any, ctx: Ctx): string[] {
  const ran = new Set<string>();
  const pending = Object.keys(wf.jobs);
  let progress = true;
  while (progress) {
    progress = false;
    for (const name of [...pending]) {
      const job = wf.jobs[name];
      const needs: string[] = [].concat(job.needs ?? []);
      const ready = needs.every((n) => !pending.includes(n));
      if (!ready) continue;
      pending.splice(pending.indexOf(name), 1);
      progress = true;
      if (needs.every((n) => ran.has(n)) && evalIf(job.if, ctx)) ran.add(name);
    }
  }
  return Object.keys(wf.jobs).filter((j) => ran.has(j));
}

// ---------------------------------------------------------------------------
// .dockerignore matcher (last matching pattern wins; a pattern matching a parent
// directory covers everything below it; `**/` matches zero or more directories).
// ---------------------------------------------------------------------------
export function dockerignorePatterns(content: string): { negate: boolean; re: RegExp }[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const negate = l.startsWith('!');
      const p = (negate ? l.slice(1) : l).replace(/^\/+/, '').replace(/\/+$/, '');
      let re = '';
      for (let i = 0; i < p.length; i++) {
        if (p.startsWith('**/', i)) {
          re += '(?:.*/)?';
          i += 2;
        } else if (p.startsWith('**', i)) {
          re += '.*';
          i += 1;
        } else if (p[i] === '*') re += '[^/]*';
        else if (p[i] === '?') re += '[^/]';
        else re += p[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
      }
      return { negate, re: new RegExp(`^${re}$`) };
    });
}

export function isDockerIgnored(content: string, file: string): boolean {
  const parts = file.split('/');
  let ignored = false;
  for (const { negate, re } of dockerignorePatterns(content)) {
    const hit = parts.some((_, i) => re.test(parts.slice(0, i + 1).join('/')));
    if (hit) ignored = !negate;
  }
  return ignored;
}
