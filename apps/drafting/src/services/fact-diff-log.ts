/**
 * The fact-diff log (T-147d, AC6 and AC7; Ajay's agreed format, ADR-022 open
 * question 4).
 *
 * - `writeFactCheckLog`: one `FactDiff` row per violation per phase, and one
 *   `PlaceholderRate` row per draft. Values are encrypted; no paragraph text.
 * - `deleteFactDiffsFor`: the delete cascade for T-115. Nothing calls it yet.
 * - `buildWeeklyFactDiffReport`: Ajay's weekly review, as Markdown. Pure: the
 *   rows come in already masked (`loadWeeklyFactDiffData`). Names, amounts,
 *   dates, case and FIR numbers, police stations and phone numbers are shown
 *   by shape and difference only; sections, acts, courts, labels, keys and
 *   banned ids in the clear. `userRef` only: no userId, no documentId.
 *
 * Nothing here logs a value: errors are reported by name only.
 */
import { createHash, createHmac } from 'crypto';

import { normalizeDate } from '@lawie/shared';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { FactDiff, FactDiffPath, IFactDiff } from '../models/FactDiff.model';
import { IPlaceholderRate, PlaceholderRate } from '../models/PlaceholderRate.model';
import { decrypt, encrypt } from '../utils/encryption';

import {
  countMissingPlaceholders,
  FactCheckOutcome,
  REPAIR_PROMPT_VERSION,
  VERIFIER_VERSION,
} from './fact-verifier';

export type FactDiffRunType = 'real' | 'fixture';

/** A keyed one-way hash of a user id. Same user, same ref; the id cannot be read back. */
export function userRefOf(userId: string): string {
  return createHmac('sha256', `fact-diff-user-ref:${env.ENCRYPTION_KEY}`)
    .update(String(userId))
    .digest('hex')
    .slice(0, 24);
}

/** First 12 hex characters of the SHA-256 of the loaded rule pack. */
export function rulePackVersionOf(pack: unknown): string {
  return createHash('sha256').update(JSON.stringify(pack)).digest('hex').slice(0, 12);
}

/** The fact ledger's `runType` ('user' | 'fixture') as the log's. */
export function factDiffRunType(ledgerRunType: string | undefined): FactDiffRunType {
  return ledgerRunType === 'fixture' ? 'fixture' : 'real';
}

export interface FactCheckLogInput {
  outcome: FactCheckOutcome;
  runId: string;
  documentId: string | null;
  userId: string;
  ledgerId: string | null;
  rulePack: string;
  rulePackVersion: string;
  runType: FactDiffRunType;
  /** Required items of the pack's checklist. */
  requiredFactCount: number;
  /** The delivered document, for the placeholder count only. Never stored. */
  deliveredText: string;
  /**
   * T-373 (Arjun's ruling B): the drafting path, stored on every row so the
   * weekly review can filter D1 findings. Passed alongside the outcome, not
   * on each FactDiffDraft. Defaults to `legacy`.
   */
  path?: FactDiffPath;
}

function objectIdOrNull(id: string | null): mongoose.Types.ObjectId | null {
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

/** Writes the rows for one draft. Throws only on a database error; the caller catches it. */
export async function writeFactCheckLog(input: FactCheckLogInput): Promise<void> {
  const { outcome } = input;
  const common = {
    runId: input.runId,
    documentId: objectIdOrNull(input.documentId),
    userId: new mongoose.Types.ObjectId(input.userId),
    userRef: userRefOf(input.userId),
    ledgerId: objectIdOrNull(input.ledgerId),
    rulePack: input.rulePack,
    rulePackVersion: input.rulePackVersion,
    verifierVersion: VERIFIER_VERSION,
    repairPromptVersion: REPAIR_PROMPT_VERSION,
    runType: input.runType,
  };
  if (outcome.records.length > 0) {
    await FactDiff.insertMany(
      outcome.records.map((r) => ({
        ...common,
        check: r.check,
        entityType: r.entityType,
        bannedEntryId: r.bannedEntryId,
        ledgerKey: r.ledgerKey,
        label: r.label,
        paragraphIndex: Math.max(0, r.paragraphIndex),
        charOffset: Math.max(0, r.charOffset),
        ledgerValue: r.ledgerValue === null ? null : encrypt(r.ledgerValue),
        draftValue: r.draftValue === null ? null : encrypt(r.draftValue),
        resolution: r.resolution,
        phase: r.phase,
        path: input.path ?? 'legacy',
      })),
    );
  }
  await PlaceholderRate.create({
    rulePack: input.rulePack,
    rulePackVersion: input.rulePackVersion,
    runType: input.runType,
    placeholderCount: countMissingPlaceholders(input.deliveredText),
    verifierPlaceholderCount: outcome.placeholdersAdded,
    requiredFactCount: input.requiredFactCount,
    phase: outcome.afterRepair !== null ? 'after_repair' : 'initial',
    repairRan: outcome.repairRan,
    repairFixed: outcome.repairFixed,
  });
}

/**
 * The delete cascade (T-115, not built yet: nothing calls this). Exactly one
 * of the three ids. Returns the number of rows removed.
 */
export async function deleteFactDiffsFor(
  target: { userId: string } | { documentId: string } | { ledgerId: string },
): Promise<number> {
  const [field, id] = Object.entries(target)[0] as [string, string];
  if (!['userId', 'documentId', 'ledgerId'].includes(field) || !mongoose.isValidObjectId(id)) {
    return 0;
  }
  const result = await FactDiff.deleteMany({ [field]: new mongoose.Types.ObjectId(id) });
  return result.deletedCount ?? 0;
}

// ── Masking for the report ──────────────────────────────────────────────────

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

function tokens(s: string): string[] {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w !== '');
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** `901/2026` -> `999/9999`. */
function shapeOf(s: string): string {
  return s.replace(/\p{L}/gu, 'A').replace(/\d/g, '9');
}

/**
 * What differs between the ledger value and the draft value, by shape only
 * for anything that could identify a person or a matter. Sections, acts,
 * courts and banned phrases are shown as they are.
 */
export function describeDiff(
  entityType: string,
  check: string,
  ledgerValue: string | null,
  draftValue: string | null,
): string {
  const l = ledgerValue ?? '';
  const d = draftValue ?? '';
  const phone = (s: string): boolean => digits(s).length >= 10;
  if (check === 'dropped') return `${entityType}: not in the draft`;
  if (phone(l) || phone(d)) {
    return `phone or long number: ${digits(l).length} digits vs ${digits(d).length}`;
  }
  switch (entityType) {
    case 'section':
    case 'court':
    case 'phrase':
      return ledgerValue === null
        ? `${entityType}: "${d}" (no ledger fact)`
        : `${entityType}: "${l}" vs "${d}"`;
    case 'date': {
      if (ledgerValue === null) return 'date: not in the ledger';
      const a = normalizeDate(l);
      const b = normalizeDate(d);
      if (!b.ok) return 'date: written as a relative or unreadable expression';
      if (!a.ok) return 'date: the ledger holds it unresolved';
      const [ay, am, ad] = a.value.split('-');
      const [by, bm, bd] = b.value.split('-');
      const parts = [ad !== bd && 'day', am !== bm && 'month', ay !== by && 'year'].filter(Boolean);
      return parts.length === 0
        ? 'date: same day, written differently'
        : `date: ${parts.join(' and ')} differs`;
    }
    case 'amount': {
      if (ledgerValue === null) return `amount: ${digits(d).length} digits, not in the ledger`;
      return `amount: ${digits(l).length} digits vs ${digits(d).length}`;
    }
    case 'case_no':
      return ledgerValue === null
        ? `case_no: shape ${shapeOf(d)}, not in the ledger`
        : `case_no: shape ${shapeOf(l)} vs ${shapeOf(d)}`;
    case 'name':
    case 'police_station':
    default: {
      if (ledgerValue === null)
        return `${entityType}: ${tokens(d).length} tokens, not in the ledger`;
      const a = tokens(l).join(' ');
      const b = tokens(d).join(' ');
      return `${entityType}: ${tokens(l).length} tokens vs ${tokens(d).length}, edit distance ${editDistance(a, b)}`;
    }
  }
}

// ── The weekly report ───────────────────────────────────────────────────────

export interface WeeklyReportRow {
  rulePack: string;
  check: string;
  entityType: string;
  label: string;
  ledgerKey: string | null;
  bannedEntryId: string | null;
  userRef: string;
  resolution: string;
  phase: string;
  /** Already masked by `describeDiff`. */
  diff: string;
}

export interface WeeklyRateRow {
  rulePack: string;
  placeholderCount: number;
  requiredFactCount: number;
  repairRan: boolean;
  repairFixed: boolean;
}

export interface WeeklyReportData {
  rows: WeeklyReportRow[];
  rates: WeeklyRateRow[];
  previousRates: WeeklyRateRow[];
  /** Rows of fixture runs in the window, counted but not reported. */
  fixtureRows: number;
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
}

function rateLine(rates: WeeklyRateRow[]): { drafts: number; perDraft: string; share: string } {
  const drafts = rates.length;
  const placeholders = rates.reduce((n, r) => n + r.placeholderCount, 0);
  const required = rates.reduce((n, r) => n + r.requiredFactCount, 0);
  return {
    drafts,
    perDraft: drafts === 0 ? '-' : (placeholders / drafts).toFixed(2),
    share: required === 0 ? '-' : `${((100 * placeholders) / required).toFixed(1)}%`,
  };
}

/** Ajay's weekly review, as Markdown. Pure. */
export function buildWeeklyFactDiffReport(from: Date, to: Date, data: WeeklyReportData): string {
  const out: string[] = [];
  out.push(`# Fact-diff weekly report, ${day(from)} to ${day(to)}`);
  out.push('');
  out.push(
    `Real drafts only. ${data.fixtureRows} fixture rows in the window are not counted. Values are shown by shape and difference only; no user id or document id is in this report.`,
  );

  out.push('', '## Violations by rule pack and check', '');
  const checks = ['unsupported', 'dropped', 'mutation', 'banned'];
  const packs = [...new Set(data.rows.map((r) => r.rulePack))].sort();
  out.push(
    `| Rule pack | ${checks.join(' | ')} | total |`,
    `|---|${checks.map(() => '---:').join('|')}|---:|`,
  );
  for (const p of packs) {
    const counts = checks.map(
      (c) => data.rows.filter((r) => r.rulePack === p && r.check === c).length,
    );
    out.push(`| ${cell(p)} | ${counts.join(' | ')} | ${counts.reduce((a, b) => a + b, 0)} |`);
  }
  if (packs.length === 0) out.push('| (none) | 0 | 0 | 0 | 0 | 0 |');

  out.push('', '## Placeholder rate per rule pack', '');
  out.push(
    '| Rule pack | drafts | placeholders per draft | placeholders / required facts | previous week: drafts | per draft | / required |',
    '|---|---:|---:|---:|---:|---:|---:|',
  );
  const ratePacks = [
    ...new Set([...data.rates, ...data.previousRates].map((r) => r.rulePack)),
  ].sort();
  for (const p of ratePacks) {
    const now = rateLine(data.rates.filter((r) => r.rulePack === p));
    const before = rateLine(data.previousRates.filter((r) => r.rulePack === p));
    out.push(
      `| ${cell(p)} | ${now.drafts} | ${now.perDraft} | ${now.share} | ${before.drafts} | ${before.perDraft} | ${before.share} |`,
    );
  }
  if (ratePacks.length === 0) out.push('| (none) | 0 | - | - | 0 | - | - |');

  out.push('', '## Repairs', '');
  const ran = data.rates.filter((r) => r.repairRan);
  const fixed = ran.filter((r) => r.repairFixed);
  out.push(
    `Repair passes run: ${ran.length}. Fixed the draft (nothing left after the second check): ${fixed.length}${ran.length > 0 ? ` (${((100 * fixed.length) / ran.length).toFixed(1)}%)` : ''}.`,
  );

  out.push('', '## Top 20', '');
  const groups = new Map<string, { row: WeeklyReportRow; n: number; users: Set<string> }>();
  for (const r of data.rows) {
    const k = [r.rulePack, r.check, r.entityType, r.ledgerKey ?? '', r.label, r.diff].join('|');
    const g = groups.get(k) ?? { row: r, n: 0, users: new Set<string>() };
    g.n += 1;
    g.users.add(r.userRef);
    groups.set(k, g);
  }
  out.push(
    '| # | rule pack | check | entity | key | label | difference | rows | users |',
    '|---:|---|---|---|---|---|---|---:|---:|',
  );
  [...groups.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 20)
    .forEach((g, i) => {
      const r = g.row;
      out.push(
        `| ${i + 1} | ${cell(r.rulePack)} | ${r.check} | ${r.entityType} | ${cell(r.ledgerKey ?? '-')} | ${cell(r.label)} | ${cell(r.diff)} | ${g.n} | ${g.users.size} |`,
      );
    });

  out.push('', '## Top 10 banned entries', '');
  const banned = new Map<string, number>();
  for (const r of data.rows) {
    if (r.check === 'banned' && r.bannedEntryId && r.phase === 'initial') {
      const k = `${r.rulePack} / ${r.bannedEntryId}`;
      banned.set(k, (banned.get(k) ?? 0) + 1);
    }
  }
  out.push('| # | rule pack / banned id | drafts |', '|---:|---|---:|');
  [...banned.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k, n], i) => out.push(`| ${i + 1} | ${cell(k)} | ${n} |`));
  out.push('');
  return out.join('\n');
}

function safeDecrypt(v: string | null): string | null {
  if (v === null) return null;
  try {
    return decrypt(v);
  } catch {
    return null;
  }
}

/** The masked rows for the window and the week before. Values are decrypted only to be masked. */
export async function loadWeeklyFactDiffData(from: Date, to: Date): Promise<WeeklyReportData> {
  const week = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - week);
  const window = { createdAt: { $gte: from, $lt: to } };
  const diffs = await FactDiff.find({ ...window, runType: 'real' }).lean<IFactDiff[]>();
  const fixtureRows = await FactDiff.countDocuments({ ...window, runType: 'fixture' });
  const toRate = (r: IPlaceholderRate): WeeklyRateRow => ({
    rulePack: r.rulePack,
    placeholderCount: r.placeholderCount,
    requiredFactCount: r.requiredFactCount,
    repairRan: r.repairRan,
    repairFixed: r.repairFixed,
  });
  const rates = await PlaceholderRate.find({ ...window, runType: 'real' }).lean<
    IPlaceholderRate[]
  >();
  const previous = await PlaceholderRate.find({
    createdAt: { $gte: prevFrom, $lt: from },
    runType: 'real',
  }).lean<IPlaceholderRate[]>();
  return {
    rows: diffs.map((d) => ({
      rulePack: d.rulePack,
      check: d.check,
      entityType: d.entityType,
      label: d.label,
      ledgerKey: d.ledgerKey,
      bannedEntryId: d.bannedEntryId,
      userRef: d.userRef,
      resolution: d.resolution,
      phase: d.phase,
      diff: describeDiff(
        d.entityType,
        d.check,
        safeDecrypt(d.ledgerValue),
        safeDecrypt(d.draftValue),
      ),
    })),
    rates: rates.map(toRate),
    previousRates: previous.map(toRate),
    fixtureRows,
  };
}
