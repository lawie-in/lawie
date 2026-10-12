/**
 * T-147c — the averment lists as tables, for Ajay's sign-off.
 *
 * One Markdown table per file in src/config/document-rules/_averments/: each
 * entry's id and kind, the banned phrases, the key and value that unlock it,
 * the allowed averment and the key and value it requires. The header of each
 * table gives the SHA-256 of the file, so a signature names the exact version
 * signed. A key that is not yet a fact of the pack is marked "(not yet a fact
 * of this pack)": until the pack asks for it, the entry stays banned.
 *
 *   yarn workspace @lawie/drafting report:averments
 *   yarn workspace @lawie/drafting report:averments --out <file.md>
 *
 * Reads files only. Needs no database, no model and no .env. Prints no ledger
 * or fact value: there is none here.
 */
/* eslint-disable no-console */
import { createHash } from 'crypto';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

import {
  AllowedEntry,
  AvermentCondition,
  AVERMENTS_DIR,
  BannedEntry,
  DEFAULT_AVERMENTS_ID,
  loadAvermentLists,
  readAvermentFile,
} from '../src/services/averments';
import { buildChecklist } from '../src/services/intake-brief';
import { loadRulePack } from '../src/services/rule-pack.service';

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '—';
}

function describe(c: AvermentCondition | null, known: Set<string> | null): string {
  if (c === null) return 'never (nothing unlocks it)';
  if ('all_of' in c) return `all of: ${c.all_of.map((x) => describe(x, known)).join('; ')}`;
  const mark = known && !known.has(c.key) ? ' (not yet a fact of this pack)' : '';
  const name = `\`${c.key}\`${c.label ? ` "${c.label}"` : ''}${mark}`;
  if (c.present) return `${name} is given`;
  if (c.equals !== undefined) {
    const v = Array.isArray(c.equals) ? c.equals : [c.equals];
    return `${name} is one of: ${v.map((x) => `"${String(x)}"`).join(', ')}`;
  }
  return `${name} is given and is none of: ${(c.not_in ?? []).map((x) => `"${String(x)}"`).join(', ')}`;
}

function table(
  banned: BannedEntry[],
  allowed: AllowedEntry[],
  known: Set<string> | null,
  inherited: Set<string>,
): string {
  const ids = [...new Set([...banned.map((b) => b.id), ...allowed.map((a) => a.id)])];
  const rows = ids.map((id) => {
    const b = banned.find((x) => x.id === id);
    const a = allowed.find((x) => x.id === id);
    return [
      `\`${id}\`${inherited.has(id) ? ' (inherited)' : ''}`,
      (b ?? a)?.kind ?? '',
      b ? b.phrases.map((p) => `"${p}"`).join('; ') : '',
      b ? describe(b.unlocked_by, known) : '',
      a ? a.averment : '',
      a ? describe(a.requires, known) : '',
    ]
      .map(cell)
      .join(' | ');
  });
  return [
    '| id | kind | banned phrase(s) | unlocked when | allowed averment | allowed when |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r} |`),
  ].join('\n');
}

function main(): void {
  const ids = readdirSync(AVERMENTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort((x, y) => (x === DEFAULT_AVERMENTS_ID ? -1 : y === DEFAULT_AVERMENTS_ID ? 1 : x < y ? -1 : 1));
  const generic = readAvermentFile(DEFAULT_AVERMENTS_ID);
  const genericJson = new Set(
    [...(generic?.banned ?? []), ...(generic?.allowed ?? [])].map((e) => JSON.stringify(e)),
  );
  const out: string[] = ['# Averment lists for sign-off (T-147c)', ''];
  for (const id of ids) {
    const raw = readFileSync(join(AVERMENTS_DIR, `${id}.json`));
    const sha = createHash('sha256').update(raw).digest('hex');
    const file = readAvermentFile(id);
    if (!file) continue;
    const pack = id === DEFAULT_AVERMENTS_ID ? null : loadRulePack(id);
    const known = pack ? new Set(buildChecklist(pack).map((i) => i.key)) : null;
    out.push(`## ${id}`, '');
    out.push(`- File: \`apps/drafting/src/config/document-rules/_averments/${id}.json\``);
    out.push(`- SHA-256: \`${sha}\``);
    out.push(`- Signed by: ${file.signed_by ?? 'not signed'}; signed on: ${file.signed_on ?? '—'}`);
    if (id === DEFAULT_AVERMENTS_ID) {
      out.push('- Applies to every pack. A pack with no file of its own uses this list alone.');
      out.push('', table(file.banned, file.allowed, null, new Set()), '');
      continue;
    }
    if (!pack) out.push('- WARNING: there is no rule pack with this id.');
    out.push(`- Also applies: \`_default.json\` (entries with the same id are replaced by this file's).`);
    let banned = file.banned;
    let allowed = file.allowed;
    const inherited = new Set<string>();
    if (file.inherits) {
      out.push(
        `- Inherits: \`${file.inherits}\`, keys renamed: ${
          Object.entries(file.key_map ?? {})
            .map(([from, to]) => `\`${from}\` → \`${to}\``)
            .join(', ') || 'none'
        }`,
      );
      // The effective list, without the default's own unchanged entries.
      const lists = loadAvermentLists(id);
      const own = new Set([...file.banned, ...file.allowed].map((e) => e.id));
      const notDefault = <T>(e: T): boolean => !genericJson.has(JSON.stringify(e));
      banned = lists.banned.filter(notDefault);
      allowed = lists.allowed.filter(notDefault);
      for (const e of [...banned, ...allowed]) if (!own.has(e.id)) inherited.add(e.id);
    }
    out.push('', table(banned, allowed, known, inherited), '');
  }
  const text = out.join('\n');
  const at = process.argv.indexOf('--out');
  if (at !== -1 && process.argv[at + 1]) {
    writeFileSync(resolve(process.argv[at + 1]), text, 'utf-8');
    console.log(`Written: ${resolve(process.argv[at + 1])}`);
  } else {
    console.log(text);
  }
}

main();
