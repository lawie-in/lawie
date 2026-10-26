#!/usr/bin/env node
/**
 * T-570: secret-shape scan over the tracked files under handoff/ and .claude/.
 *
 * Usage: node scripts/secret-shape-scan.mjs [--staged] [repo-root]
 *   (default)  every tracked file under handoff/ and .claude/ (CI, `yarn scan:secrets`).
 *   --staged   only the staged content of added/copied/modified/renamed files under
 *              handoff/ and .claude/ (.husky/pre-commit). Deleted files and files outside
 *              those paths are ignored; nothing staged in scope is a clean pass.
 *
 * Prints `file:line  pattern-name` for every hit and NEVER the matched value.
 * Exit codes: 0 clean, 1 at least one hit, 2 the scan could not run (fails closed:
 * a scan that cannot list or read files is a failure, never a pass).
 *
 * This does not depend on gitleaks: it runs the same with or without it.
 *
 * Allowlist rules (ALLOW below) are reviewed exceptions by CONTEXT, never by dropping a
 * pattern. Each entry names one pattern and a context regex that must match the rest of
 * the line (the matched value itself is not used). An entry must never contain a secret
 * value; it describes the surrounding words only.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCAN_DIRS = ['handoff', '.claude'];

/** Secret shapes. Names are what gets printed; the regexes are never printed with a value. */
export const PATTERNS = [
  { name: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'mongo-uri-with-credentials', re: /mongodb(?:\+srv)?:\/\/[^\s:@/]+:[^\s@/]+@/g },
  { name: 'razorpay-key', re: /\brzp_[a-z]+_[A-Za-z0-9]{8,}/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g },
  { name: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { name: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g },
  { name: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: 'private-key-header', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'test-signup-secret', re: /\blts_[A-Za-z0-9_-]{28,}/g },
  // Hex boundaries, not word boundaries: also catches 0x<hex> and secret_<hex>.
  { name: 'long-hex', re: /(?<![0-9A-Fa-f])[0-9A-Fa-f]{32,}(?![0-9A-Fa-f])/g },
];

/**
 * Reviewed context allowlist. `context` is tested against the LABEL CONTEXT of a hit, with
 * the matched value replaced by `<HIT>`, so an entry can only ever describe surrounding text:
 * the hit's own line, the previous non-blank line only if it is a markdown heading, and (for
 * a markdown table row) the table's header row. `deny` cancels the entry when that same
 * context also matches (a "SHA" label next to a secret-ish word is not trusted). `lengths`
 * restricts an entry to values of those exact lengths. `shape` tests the value's shape only
 * (never a literal value).
 *
 * Known residual gaps of the SHA entry (reviewed, accepted): a `# SHA` comment line inside a
 * fenced code block counts as a heading; a table header such as `| Name | SHA-256 | Value |`
 * allows any 40/64-hex in every column of that table, not only the SHA column.
 */
export const ALLOW = [
  // Signed SHA-256 hashes (64 hex) and git commit SHAs (40 hex) in handoff docs: the line,
  // a heading right above it (e.g. "## Final ship SHA") or the table header names SHA, and
  // nothing in that context says secret, key, token, password, webhook or api.
  {
    pattern: 'long-hex',
    lengths: [40, 64],
    context: /\bSHA(?:-?256|-?1)?\b/i,
    // Whole words, tested with `_` and `-` read as spaces: RAZORPAY_KEY_SECRET, api_key and
    // webhook-secret are denied; rapid, capital, monkey and keyboard are not.
    deny: /\b(?:secrets?|keys?|tokens?|passwords?|webhooks?|api)\b/i,
    reason: 'a content hash or commit SHA labelled as one',
  },
  // A 40-hex commit SHA as the ref in a GitHub blob/tree/commit URL (vendored skill docs).
  {
    pattern: 'long-hex',
    lengths: [40],
    context: /github\.com\/[^\s)]*\/(?:blob|tree|commit)\/<HIT>/,
    reason: 'commit SHA in a GitHub permalink',
  },
  // Zero-entropy placeholders (one or two distinct characters, e.g. all zeros).
  {
    pattern: 'long-hex',
    shape: (v) => new Set(v.toLowerCase()).size <= 2,
    reason: 'zero-entropy placeholder',
  },
  // Mongo URIs whose credential part is a placeholder, e.g. `user:pass@`, `<user>:<password>@`,
  // `…:…@`, `${USER}:${PASS}@`, `***:***@`. Tested on the matched credentials themselves,
  // which for these entries are placeholders by construction (no secret can match).
  {
    pattern: 'mongo-uri-with-credentials',
    credentials:
      /^mongodb(?:\+srv)?:\/\/(?:<[^>]*>|\$\{[^}]*\}|\.{3}|…|\*+|x+|user(?:name)?|USER(?:NAME)?|pass(?:word)?|PASS(?:WORD)?):(?:<[^>]*>|\$\{[^}]*\}|\.{3}|…|\*+|x+|pass(?:word)?|PASS(?:WORD)?|secret|SECRET)@$/,
    reason: 'placeholder credentials in a doc example',
  },
];

/** The hit's line, a markdown heading right above it and, for a table row, the header row. */
function contextOf(lines, i) {
  const parts = [lines[i]];
  for (let j = i - 1; j >= 0; j -= 1) {
    if (lines[j].trim() !== '') {
      if (/^\s{0,3}#{1,6}\s/.test(lines[j])) parts.push(lines[j]);
      break;
    }
  }
  if (/^\s*\|/.test(lines[i])) {
    let h = i;
    while (h > 0 && /^\s*\|/.test(lines[h - 1])) h -= 1;
    parts.push(lines[h]);
  }
  return parts.join('\n');
}

function isAllowed(patternName, value, context) {
  for (const a of ALLOW) {
    if (a.pattern !== patternName) continue;
    if (a.lengths && !a.lengths.includes(value.length)) continue;
    if (a.credentials && a.credentials.test(value)) return true;
    if (a.shape && a.shape(value)) return true;
    if (a.context) {
      const masked = context.split(value).join('<HIT>');
      if (a.deny && a.deny.test(masked.replace(/[_-]/g, ' '))) continue;
      if (a.context.test(masked)) return true;
    }
  }
  return false;
}

/** Scans one file's text; returns [{ line, name }] with no values. */
export function scanText(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      for (const m of line.matchAll(p.re)) {
        if (!isAllowed(p.name, m[0], contextOf(lines, i))) {
          hits.push({ line: i + 1, name: p.name });
          break;
        }
      }
    }
  });
  return hits;
}

/**
 * Staged blobs (the index content that will be committed, not the working tree) of the
 * added, copied, modified or renamed files under handoff/ and .claude/. Deleted files and
 * files outside those paths are ignored. Read with one `git cat-file --batch` process.
 */
function stagedBlobs(root) {
  const out = execFileSync(
    'git',
    ['-C', root, 'diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR', '--', ...SCAN_DIRS],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const files = out.split('\0').filter(Boolean);
  if (files.length === 0) return [];
  const batch = execFileSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: files.map((f) => `:${f}\n`).join(''),
    maxBuffer: 512 * 1024 * 1024,
  });
  const blobs = [];
  let pos = 0;
  for (const rel of files) {
    const nl = batch.indexOf(0x0a, pos);
    const header = batch.subarray(pos, nl).toString('utf8');
    const m = /^\S+ (\S+) (\d+)$/.exec(header);
    if (!m) throw new Error('unexpected cat-file output');
    const size = Number(m[2]);
    const start = nl + 1;
    blobs.push({ rel, buf: m[1] === 'blob' ? batch.subarray(start, start + size) : null });
    pos = start + size + 1;
  }
  return blobs;
}

function report(hitsFor, count, label) {
  let total = 0;
  for (const { rel, buf } of hitsFor) {
    if (!buf || buf.includes(0)) continue; // binary or not a blob (e.g. a submodule)
    for (const h of scanText(buf.toString('utf8'))) {
      console.log(`${rel}:${h.line}  ${h.name}`);
      total += 1;
    }
  }
  if (total > 0) {
    console.error(
      `secret-shape-scan: ${total} hit(s) in ${count} ${label} under handoff/ and .claude/. ` +
        'Values are not printed. Do not commit; report file:line and pattern name to Arjun.',
    );
    return 1;
  }
  console.log(`secret-shape-scan: clean (${count} ${label} under handoff/ and .claude/).`);
  return 0;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args = process.argv.slice(2);
  const staged = args.includes('--staged');
  const positional = args.filter((a) => !a.startsWith('--'));
  const unknown = args.filter((a) => a.startsWith('--') && a !== '--staged');
  if (unknown.length || positional.length > 1) {
    console.error('Usage: node scripts/secret-shape-scan.mjs [--staged] [repo-root]');
    return 2;
  }
  const root = path.resolve(positional[0] || path.join(here, '..'));

  if (staged) {
    // Pre-commit mode: only what this commit adds or changes. Nothing staged in scope = clean.
    let blobs;
    try {
      blobs = stagedBlobs(root);
    } catch {
      console.error(
        'secret-shape-scan: could not read the staged files (git failed); failing closed.',
      );
      return 2;
    }
    return report(blobs, blobs.length, 'staged files');
  }

  let files;
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', ...SCAN_DIRS], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    files = out.split('\0').filter(Boolean);
  } catch {
    console.error(
      'secret-shape-scan: could not list tracked files (git ls-files failed); failing closed.',
    );
    return 2;
  }
  if (files.length === 0) {
    console.error(
      'secret-shape-scan: no tracked files under handoff/ or .claude/; failing closed.',
    );
    return 2;
  }

  const blobs = [];
  for (const rel of files) {
    try {
      blobs.push({ rel, buf: readFileSync(path.join(root, rel)) });
    } catch {
      // A tracked file deleted in the working tree has nothing to scan.
    }
  }
  return report(blobs, files.length, 'tracked files');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
