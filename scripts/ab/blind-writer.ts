/**
 * T-691 — the blind writer of the drafter A/B (Opus 5.5 vs Sonnet 5.5).
 *
 * Pure apart from the files it writes: no import from the drafting app, no
 * env read. Takes the drafts of a run and writes, under `<outRoot>/<stamp>/`:
 *
 *   scoring/D01.md .. DNN.md   one per draft, in a seeded random order: the
 *                              matter's title, the facts given and the
 *                              delivered text (or "WITHHELD by the gates" and
 *                              the reason code). No model, effort, tokens,
 *                              cost, timing, ids or arm label. For Anushka.
 *   metrics.json               by blind id: tokens, cost, fact-checker
 *                              findings, placeholders, withheld. For Vikram.
 *   KEY.sealed.json            blind id -> {fixtureId, model, runId} and the
 *                              shuffle seed, AES-256-GCM under a scrypt key
 *                              from a passphrase (Arjun's). Mode 0600.
 *
 * Nothing here prints. The caller prints counts and paths only.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ── Input ──────────────────────────────────────────────────────────────────

/** What the pipeline did with one draft. */
export type AbOutcome =
  | { kind: 'delivered'; text: string }
  /** The delivery gate withheld it (T-611): fact_needed or fact_conflict. Scored as withheld. */
  | { kind: 'withheld'; code: string }
  /** The run broke before a draft (intake, HTTP, harness). Not a model verdict. */
  | { kind: 'failed'; code: string };

export interface AbTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface AbMetrics {
  /** The Drafter stage of this draft only (body calls of its run). */
  tokens: AbTokens;
  /** The shared intake of the matter (one intake, both drafts). Same in both drafts of a matter. */
  intakeTokens: AbTokens;
  costUsd: {
    /** Body calls at the model's rates, cache classes at their own rates. */
    raw: number;
    /** The same tokens with every cached token priced as plain input. */
    uncachedEquivalent: number;
  };
  /** Fact-checker (verifier) findings of the run, every phase. */
  factDiffs: number;
  placeholders: {
    /** `{{MISSING: ` in the delivered text. */
    missingMarkers: number;
    /** `[To be confirmed: ` in the delivered text. */
    toBeConfirmed: number;
    /** Rendered clauses with status `missing` (D1 packs). */
    renderedMissing: number;
  };
  withheld: boolean;
  /** There is no legal-reviewer call in the v2 pipeline. */
  legalReviewer: 'n/a';
  /** Arjun (T-691): this draft's spend (its arm's calls) at the driver's rates, in $ and ₹. */
  spend?: { usd: number; inr: number };
  /** The matter's shared intake spend, $ and ₹. Same in both drafts of a matter. */
  intakeSpend?: { usd: number; inr: number };
}

export interface AbDraft {
  fixtureId: string;
  /** The forced drafter model of the arm. Goes to the sealed key only. */
  model: string;
  /** The run id. Goes to the sealed key only. */
  runId: string | null;
  title: string;
  /** The facts as the advocate gave them (description and answers). */
  facts: string;
  outcome: AbOutcome;
  metrics: AbMetrics;
}

export interface WriteOptions {
  /** The folder the stamped run folder is made in (scripts/ab/out by default in the driver). */
  outRoot: string;
  /** Seals KEY.sealed.json. Never written anywhere in clear. */
  passphrase: string;
  /** Shuffle seed. From crypto when absent; tests pass one. Stored inside the sealed key only. */
  seed?: number;
  /** Folder name under outRoot. A UTC timestamp when absent. */
  stamp?: string;
}

export interface WriteResult {
  dir: string;
  scoringDir: string;
  scoringFiles: string[];
  metricsPath: string;
  keyPath: string;
  counts: { drafts: number; delivered: number; withheld: number; failed: number };
  warnings: {
    /** Drafts whose body names a model family. The body is left as delivered. */
    modelWordInBody: number;
    /** Metadata (title, facts, reason codes) where a model word was replaced. */
    modelWordInMetadata: number;
  };
}

// ── Blinding ───────────────────────────────────────────────────────────────

/** Model family words, case-insensitive. */
export const MODEL_WORDS = /claude|opus|sonnet|haiku/gi;
const MODEL_WORD_TEST = /claude|opus|sonnet|haiku/i;

/** Metadata only: replace model words. Never used on a draft body. */
export function scrubMetadata(text: string): { text: string; replaced: boolean } {
  const replaced = MODEL_WORD_TEST.test(text);
  return { text: replaced ? text.replace(MODEL_WORDS, '[model]') : text, replaced };
}

export function bodyNamesModel(text: string): boolean {
  return MODEL_WORD_TEST.test(text);
}

/** A reason code as printed to the scorer: lower-case letters, digits and underscores only. */
export function safeCode(code: string): string {
  const c = scrubMetadata(code)
    .text.toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return c.slice(0, 40) || 'unknown';
}

/** mulberry32: a small seeded PRNG, enough for an order nobody can guess without the seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates with the seeded PRNG. Returns a new array. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rnd = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function randomSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}

export function blindId(index: number, total: number): string {
  return `D${String(index + 1).padStart(Math.max(2, String(total).length), '0')}`;
}

/** Placeholder counts in a delivered text. */
export function countPlaceholders(text: string | null): {
  missingMarkers: number;
  toBeConfirmed: number;
} {
  if (!text) return { missingMarkers: 0, toBeConfirmed: 0 };
  return {
    missingMarkers: text.split('{{MISSING: ').length - 1,
    toBeConfirmed: text.split('[To be confirmed: ').length - 1,
  };
}

/** One scoring file. Holds no model, effort, tokens, cost, timing, ids or arm. */
export function renderScoringFile(
  id: string,
  d: Pick<AbDraft, 'title' | 'facts' | 'outcome'>,
): { text: string; metadataScrubbed: boolean; bodyNamesModel: boolean } {
  const title = scrubMetadata(d.title);
  const facts = scrubMetadata(d.facts);
  const lines = [
    `# ${id}`,
    '',
    '## Matter',
    '',
    title.text,
    '',
    '## Facts given',
    '',
    facts.text,
    '',
    '## Draft',
    '',
  ];
  let names = false;
  if (d.outcome.kind === 'delivered') {
    names = bodyNamesModel(d.outcome.text);
    lines.push(d.outcome.text);
  } else if (d.outcome.kind === 'withheld') {
    lines.push('**WITHHELD by the gates**', '', `Reason code: ${safeCode(d.outcome.code)}`);
  } else {
    lines.push(
      '**NOT PRODUCED** (the run stopped before a draft; not a drafting result)',
      '',
      `Reason code: ${safeCode(d.outcome.code)}`,
    );
  }
  lines.push('');
  return {
    text: lines.join('\n'),
    metadataScrubbed: title.replaced || facts.replaced,
    bodyNamesModel: names,
  };
}

// ── Sealed key ─────────────────────────────────────────────────────────────

export interface KeyEntry {
  fixtureId: string;
  model: string;
  runId: string | null;
}

export interface KeyPayload {
  version: 1;
  seed: number;
  entries: Record<string, KeyEntry>;
}

interface SealedFile {
  v: 1;
  alg: 'aes-256-gcm';
  kdf: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  tag: string;
  ct: string;
}

const AAD = Buffer.from('lawie-t691-ab-key-v1');
const SCRYPT = { N: 1 << 15, r: 8, p: 1 } as const;
/** scrypt needs 128 * N * r bytes (32 MiB here); Node's default ceiling is exactly that, so raise it. */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
export const MIN_PASSPHRASE = 12;

function deriveKey(passphrase: string, salt: Buffer, N: number, r: number, p: number): Buffer {
  return scryptSync(passphrase, salt, 32, { N, r, p, maxmem: SCRYPT_MAXMEM });
}

export function seal(payload: KeyPayload, passphrase: string): SealedFile {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE)
    throw new Error(`the key passphrase must be at least ${MIN_PASSPHRASE} characters`);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    v: 1,
    alg: 'aes-256-gcm',
    kdf: 'scrypt',
    ...SCRYPT,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

/** Open a KEY.sealed.json. Throws on a wrong passphrase or a changed file (GCM tag). */
export function unseal(path: string, passphrase: string): KeyPayload {
  const s = JSON.parse(readFileSync(path, 'utf8')) as SealedFile;
  if (s.v !== 1 || s.alg !== 'aes-256-gcm' || s.kdf !== 'scrypt')
    throw new Error('not a T-691 sealed key');
  const key = deriveKey(passphrase, Buffer.from(s.salt, 'base64'), s.N, s.r, s.p);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(s.iv, 'base64'));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(s.tag, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(s.ct, 'base64')), decipher.final()]);
  return JSON.parse(pt.toString('utf8')) as KeyPayload;
}

// ── Write ──────────────────────────────────────────────────────────────────

export function defaultStamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

export function writeBlind(drafts: readonly AbDraft[], opts: WriteOptions): WriteResult {
  if (drafts.length === 0) throw new Error('no drafts to write');
  // Fails before anything is written when the passphrase is too short.
  if (typeof opts.passphrase !== 'string' || opts.passphrase.length < MIN_PASSPHRASE)
    throw new Error(`the key passphrase must be at least ${MIN_PASSPHRASE} characters`);
  const seed = opts.seed ?? randomSeed();
  const dir = join(opts.outRoot, opts.stamp ?? defaultStamp());
  const scoringDir = join(dir, 'scoring');
  mkdirSync(scoringDir, { recursive: true });

  const order = seededShuffle(drafts, seed);
  const entries: Record<string, KeyEntry> = {};
  const metrics: Record<string, AbMetrics> = {};
  const scoringFiles: string[] = [];
  const counts = { drafts: order.length, delivered: 0, withheld: 0, failed: 0 };
  const warnings = { modelWordInBody: 0, modelWordInMetadata: 0 };

  order.forEach((d, i) => {
    const id = blindId(i, order.length);
    const file = renderScoringFile(id, d);
    if (file.bodyNamesModel) warnings.modelWordInBody += 1;
    if (file.metadataScrubbed) warnings.modelWordInMetadata += 1;
    const path = join(scoringDir, `${id}.md`);
    writeFileSync(path, file.text);
    scoringFiles.push(path);
    counts[d.outcome.kind] += 1;
    entries[id] = { fixtureId: d.fixtureId, model: d.model, runId: d.runId };
    metrics[id] = { ...d.metrics, withheld: d.outcome.kind === 'withheld', legalReviewer: 'n/a' };
  });

  const metricsPath = join(dir, 'metrics.json');
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));

  const keyPath = join(dir, 'KEY.sealed.json');
  const sealed = seal({ version: 1, seed, entries }, opts.passphrase);
  writeFileSync(keyPath, JSON.stringify(sealed), { mode: 0o600 });
  chmodSync(keyPath, 0o600); // the mode above is masked by umask and ignored for an existing file

  return { dir, scoringDir, scoringFiles, metricsPath, keyPath, counts, warnings };
}
