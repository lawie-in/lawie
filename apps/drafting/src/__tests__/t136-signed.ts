/**
 * Reads Ajay's signed text for T-136 out of the signed file, so that no test
 * retypes legal wording. Not a test file: it has no tests of its own.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export const SIGNED_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'handoff',
  'design',
  'T-136-drafter-rules-signed.md',
);

export const signedFile = (): string => readFileSync(SIGNED_PATH, 'utf8').replace(/\r\n/g, '\n');

const PART_2_MARK = '\n# PART 2\n';

export function part1(): string {
  const text = signedFile();
  return text.slice(text.indexOf('\n# PART 1\n'), text.indexOf(PART_2_MARK));
}

export function part2(): string {
  const text = signedFile();
  return text.slice(text.indexOf(PART_2_MARK));
}

/** The fenced code blocks of a text, in order. */
export function codeBlocks(text: string): string[] {
  return [...text.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
}

/** The last table row that starts with `| <id> |` and holds a quoted text. */
export function lastRow(text: string, id: string): string {
  const rows = text
    .split('\n')
    .filter((l) => l.startsWith(`| ${id} |`) && /"/.test(l.slice(`| ${id} |`.length)));
  if (rows.length === 0) throw new Error(`no row ${id}`);
  return rows[rows.length - 1];
}

/** The quoted strings of a table row, with \" turned back into ". */
export function quoted(row: string): string[] {
  return [...row.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
}

/** The signed template of a finding row: the quoted text of the last cell. */
export function signedRowText(part: string, id: string): string {
  const q = quoted(lastRow(part, id));
  return q[q.length - 1];
}

/** Part 2, D2: the text after "Text to use for a date that comes only from the description:". */
export function signedD2(): string {
  const p = part2();
  const at = p.indexOf('Text to use for a date that comes only from the description:');
  const rest = p.slice(at).split('\n').slice(1);
  const line = rest.find((l) => l.trim().startsWith('"'));
  if (!line) throw new Error('no D2 text');
  return line.trim().replace(/^"|"$/g, '');
}

/** Part 1, C5: the quoted paragraph under "Text to use:". */
export function signedC5(): string {
  const p = part1();
  const at = p.indexOf('### C5');
  const rest = p.slice(at).split('\n');
  const line = rest.find((l) => l.trim().startsWith('"'));
  if (!line) throw new Error('no C5 text');
  return line.trim().replace(/^"|"$/g, '');
}

/** Part 2, condition 2: the text after `Text: "` up to the quote before "How this is shown". */
export function signedBriefLine(): string {
  const p = part2();
  const at = p.indexOf('Text: "');
  const end = p.indexOf('" How this is shown', at);
  if (at < 0 || end < 0) throw new Error('no brief-screen line');
  return p.slice(at + 'Text: "'.length, end);
}

/** Fill `{name}` placeholders of a signed template. */
export function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(values)) out = out.split(`{${k}}`).join(v);
  return out;
}

/** The signed text of finding C1..C4 (part 1) with its placeholders filled. */
export function signedFinding(
  id: 'C1' | 'C2' | 'C3' | 'C4',
  values: Record<string, string>,
): string {
  return fill(signedRowText(part1(), id), values);
}
