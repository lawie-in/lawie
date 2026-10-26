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
 * allows any 40/64-hex in every column of that table, not only the SHA column. The deny
 * words are matched after splitting `_`, `-`, camelCase and letter-digit / digit-letter
 * boundaries, plus a list of joined compounds (APIKEY, webhooksecret, authtoken) and (T-593)
 * a stem rule: any alphanumeric run that CONTAINS a secret stem (DENY_STEMS: secret, token,
 * password, credential, bearer, apikey, signingkey, ...) is a deny word in any case, so
 * HMACSECRET, RAZORPAYSECRET, MYTOKEN, Hmacsecret, HMAC2SECRET and JWTSECRET are denied like
 * `hmac secret`. Bare `hmac`, `nonce`, `salt`, `seed`, `cred` and `pwd` are NOT stems (legal
 * prose: "HMAC nonce", "credit", PWDVA, PwD); `pwd` counts only as the end of a longer run
 * (DBPWD). Company-secretary words (secretary, secretariat, secretarial) are exempt. An
 * ALL-CAPS run ending in KEY, KEYS, KEYID, WEBHOOK(S) or API after two or more characters is
 * also denied (DENY_CAPS_SUFFIX: RAZORPAYKEY, MYKEY, JWTKEY, RAZORPAYWEBHOOK, RZPAPI), minus
 * a short list of English words (MONKEY, TURKEY, HOCKEY, TURNKEY, OKAPI, ...). All deny
 * tests run on the context after NFKC and with zero-width / soft-hyphen characters removed
 * (denyPlain), so fullwidth or invisibly split labels are denied too.
 *
 * Residual deny gaps (reviewed, accepted for T-593): lower-case or Title-case joined labels
 * on KEY / WEBHOOK / API outside the fixed prefixes (razorpaykey, Mykey, rzpapi) are not
 * denied, to keep monkey, turkey, turnkey prose allowed; an all-caps run with the word as a
 * PREFIX (KEYRAZORPAY, APIRZP, WEBHOOKRZP) is not denied; bare hmac, salt, nonce, seed, cred
 * and pwd are not deny words; Cyrillic / Greek look-alike letters (not folded by NFKC) and
 * invisible characters outside denyPlain's list can still disguise a deny word; the all-caps
 * WAAPI (Web Animations API) and similar acronyms ending in API ARE denied next to a SHA.
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

/**
 * Splits labels into words before the `deny` test: `_`/`-` to spaces, camelCase and
 * letter-digit boundaries split (webhookSecret, apiKey, razorpayKeySecret, authToken, key1).
 */
function denyText(text) {
  return text
    .replace(/[_-]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
}

/** Joined all-caps or lower-case compounds the word split cannot see (APIKEY, webhooksecret). */
const DENY_JOINED =
  /(?:api|auth|access|private|secret|webhook|key|client|bearer|refresh)(?:keys?|secrets?|tokens?|passwords?|pass)/i;

/**
 * T-593: secret stems that deny a SHA label wherever they sit inside a joined alphanumeric
 * run, whatever its case (HMACSECRET, MYTOKEN, Hmacsecret, HMAC2SECRET, dbpasswd). The run is
 * split on every non-alphanumeric character, so HMAC.SECRET and HMAC/SECRET are covered too.
 */
const DENY_STEMS = new RegExp(
  [
    'secret',
    'token',
    'passw(?:or)?d',
    'passphrase',
    'credential',
    'creds',
    'bearer',
    '(?:api|private|priv|access|auth|signing|encryption|hmac|client|master|session|webhook|ssh)keys?',
    '.pwd$', // DBPWD, ROOTPWD; never a bare PWD/PwD (Persons with Disabilities) or PWDVA
  ].join('|'),
  'i',
);
/** English words the stems would otherwise catch (company secretary in legal docs). */
const DENY_STEM_EXEMPT = /^secretar(?:y|ies|iats?|ial)$/i;

/**
 * T-593 round 1: an ALL-CAPS run (as written, after denyPlain) that ENDS with one of the
 * original deny words KEY / KEYS / KEYID / WEBHOOK(S) / API after at least two other
 * characters: RAZORPAYKEY, MYKEY, JWTKEY, ENCKEY, RAZORPAYWEBHOOK, RZPAPI. Suffix only, so
 * all-caps CAPITAL, RAPID, APIARY, KEYBOARD and LAPIS are never caught; lower/Title case
 * (monkey, Turkey) is never caught. All-caps English words ending in KEY or API are exempt.
 */
const DENY_CAPS_SUFFIX = /^[A-Z0-9]{2,}(?:KEY(?:S|ID)?|WEBHOOKS?|API)$/;
const DENY_CAPS_EXEMPT =
  /^(?:MONKEY|TURKEY|HOCKEY|DONKEY|JOCKEY|WHISKEY|LACKEY|FLUNKEY|MALARKEY|TURNKEY|LATCHKEY|HOTKEY|OKAPI)S?$/;

function deniedByStem(text) {
  for (const run of text.match(/[A-Za-z0-9]+/g) || []) {
    if (DENY_STEM_EXEMPT.test(run)) continue;
    if (DENY_STEMS.test(run)) return true;
    if (DENY_CAPS_SUFFIX.test(run) && !DENY_CAPS_EXEMPT.test(run)) return true;
  }
  return false;
}

/**
 * T-593: invisible characters a label could hide behind (zero-width space / non-joiner /
 * joiner, word joiner, invisible operators, Mongolian vowel separator, BOM / zero-width
 * no-break space, soft hyphen). Written as escapes so the source itself carries none.
 */
const INVISIBLE = /[\u00AD\u180E\u200B-\u200D\u2060-\u2064\uFEFF]/g;

/**
 * The context the deny tests see: NFKC first (fullwidth and other compatibility look-alikes
 * become ASCII, e.g. fullwidth SECRET), then invisible characters removed, so SE<ZWSP>CRET
 * and S<SHY>ECRET read as SECRET. Used for the deny tests only, never to find a SHA label.
 */
function denyPlain(text) {
  return text.normalize('NFKC').replace(INVISIBLE, '');
}

function isAllowed(patternName, value, context) {
  for (const a of ALLOW) {
    if (a.pattern !== patternName) continue;
    if (a.lengths && !a.lengths.includes(value.length)) continue;
    if (a.credentials && a.credentials.test(value)) return true;
    if (a.shape && a.shape(value)) return true;
    if (a.context) {
      const masked = context.split(value).join('<HIT>');
      if (a.deny) {
        const plain = denyPlain(masked);
        if (a.deny.test(denyText(plain)) || DENY_JOINED.test(plain) || deniedByStem(plain)) {
          continue;
        }
      }
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
