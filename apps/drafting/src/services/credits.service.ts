/**
 * Credits service — bucket-aware credit accounting.
 *
 * Three buckets per user (User collection):
 *   • topupCredits        — purchased one-off, permanent until spent
 *   • earnedCredits       — login/rating bonuses, permanent
 *   • subscriptionCredits — monthly/yearly plan allocation, lapses on cycle
 *
 * Spend order (most-perishable last so users don't lose value):
 *   topupCredits → earnedCredits → subscriptionCredits
 *
 * Every grant + spend writes a CreditLedger row for audit + founder dashboard.
 *
 * Price of each document (T-227, Vikram 11 + 12 Oct 2026): `TEMPLATE_PRICES`
 * in config/catalogue (T-240) is the ONE price list. The price shown
 * (template promoter → Template collection → GET /templates) and the price
 * charged (enforceCredits → spendInk) are both read from it through
 * `costForTemplate`. Rule files' own `creditsCost` fields are ignored. There is no default price: an id with
 * no entry has no price and is refused, never charged.
 */
import { settleYearlyDrip } from '@lawie/shared';
import type { LedgerFact } from '@lawie/shared';
import mongoose, { Types } from 'mongoose';

import { DOC_TYPE_ALIASES, NON_TEMPLATE_PRICES, TEMPLATE_PRICES } from '../config/catalogue';
import { CreditBucket, CreditLedger, CreditSource } from '../models/CreditLedger.model';
import { Generation } from '../models/Generation.model';
import { IInkHold, User } from '../models/User.model';
import type { LoadSkeleton, Skeleton, SkeletonCondition } from '../types/skeleton';

import { APP_SETTING_KEYS, getAppSetting } from './app-settings.service';
import { isFixtureUser } from './run-origin';

// T-240: the price list, the non-template prices and the one alias map live in
// config/catalogue (merged per-batch files, frozen). Re-exported here under
// their T-227 names; they are the same objects, not copies.
export { TEMPLATE_PRICES, NON_TEMPLATE_PRICES, DOC_TYPE_ALIASES as PRICE_ALIASES };

function ownPrice(table: Readonly<Record<string, number>>, id: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;
}

/**
 * The Ink price of a document id, or `undefined` when the id has no price.
 * Callers must refuse an id with no price; they must never substitute a default.
 */
export function costForTemplate(templateId: string): number | undefined {
  const direct = ownPrice(TEMPLATE_PRICES, templateId);
  if (direct !== undefined) return direct;
  const own = ownPrice(NON_TEMPLATE_PRICES, templateId);
  if (own !== undefined) return own;
  if (Object.prototype.hasOwnProperty.call(DOC_TYPE_ALIASES, templateId)) {
    return ownPrice(TEMPLATE_PRICES, DOC_TYPE_ALIASES[templateId]);
  }
  return undefined;
}

// ── Paragraph count and its price (T-577; Arjun, Vikram, Ajay AJ-577-M1..M4) ──
//
// A pack whose signed skeleton declares a body-paragraph block asks the user
// for a total body paragraph count N in [mandatoryCount(pack, facts), cap] and
// is priced by Vikram's Ink bands (AppSettings). Every other pack is priced as
// before by costForTemplate. `quoteDraft` is the ONE place a draft's price is
// computed (T-388: shown = held = debited): enforceCreditsForBrief, the
// template-configs `credits_cost`, the quote route, the hold, the settle and
// the done payload all read it.

/**
 * The facts a pack's mandatory count depends on, as ledger entries (the shape
 * the skeleton's `when` evaluator reads). Brief values without a ledger are
 * turned into entries by `ledgerFactsFromValues`.
 */
export type ParagraphFacts = readonly LedgerFact[];

/** One pack's paragraph block. `mandatory` gives the minimum for these facts. */
export interface ParagraphConfig {
  mandatory: (facts: ParagraphFacts) => number;
  default: number;
  cap: number;
}

/** Where the per-pack block comes from. */
export type ParagraphConfigSource = (templateId: string) => ParagraphConfig | null;

/** Does a skeleton `when` condition hold for these facts? (The skeleton's own evaluator.) */
export type SkeletonWhenHolds = (when: SkeletonCondition, facts: ParagraphFacts) => boolean;

/**
 * T-577 (AJ-577-M5): the paragraph config a signed skeleton declares. Null
 * when the skeleton has no `bodyParagraphs` block (the pack does not ask).
 * `mandatory(facts)` is the number of `required: true` clauses whose `when`
 * holds (no `when` = always), so it cannot drift from the skeleton: for
 * bail_regular 7, or 8 when custody_status applies (AJ-577-M3).
 */
export function paragraphConfigFromSkeleton(
  skeleton: Skeleton | null,
  whenHolds: SkeletonWhenHolds,
): ParagraphConfig | null {
  const block = skeleton?.bodyParagraphs;
  if (!skeleton || !block) return null;
  const required = skeleton.clauses.filter((c) => c.required === true);
  return {
    mandatory: (facts) => required.filter((c) => !c.when || whenHolds(c.when, facts)).length,
    default: block.default,
    cap: block.cap,
  };
}

/**
 * The source for every pack: the loaded skeleton's `bodyParagraphs` block,
 * with `evaluatorFor` giving that pack's `when` evaluator (draft-renderer's
 * skeletonWhenHolds with the pack's option ids and value lists). Read once
 * per pack and kept. A skeleton that cannot be read counts as "does not ask"
 * (today's path).
 */
export function skeletonParagraphSource(
  load: LoadSkeleton,
  evaluatorFor: (packId: string, skeleton: Skeleton) => SkeletonWhenHolds,
): ParagraphConfigSource {
  const cache = new Map<string, ParagraphConfig | null>();
  return (templateId) => {
    const hit = cache.get(templateId);
    if (hit !== undefined) return hit;
    let config: ParagraphConfig | null = null;
    try {
      const skeleton = load(templateId);
      if (skeleton?.bodyParagraphs) {
        config = paragraphConfigFromSkeleton(skeleton, evaluatorFor(templateId, skeleton));
      }
    } catch {
      config = null;
    }
    cache.set(templateId, config);
    return config;
  };
}

/** No pack asks: the source until one is installed (and in a process that never installs one). */
const noPackAsks: ParagraphConfigSource = () => null;
let installedParagraphSource: ParagraphConfigSource = noPackAsks;
let paragraphConfigSource: ParagraphConfigSource = noPackAsks;

/**
 * Install the real source (documents.routes does, at load, with the skeleton
 * source). Kept out of this module so the skeleton and renderer modules are
 * not pulled into every importer of the price list.
 */
export function installParagraphConfigSource(source: ParagraphConfigSource): void {
  installedParagraphSource = source;
  paragraphConfigSource = source;
}

/** The pack's paragraph block, or null when the pack does not ask. */
export function getParagraphConfig(templateId: string): ParagraphConfig | null {
  return paragraphConfigSource(templateId);
}

/**
 * TEST ONLY: replace the paragraph config source (null restores the
 * installed one), so tests can exercise any config. Never called in production.
 */
export function _setParagraphConfigSourceForTests(source: ParagraphConfigSource | null): void {
  paragraphConfigSource = source ?? installedParagraphSource;
}

/**
 * The pack's mandatory body paragraph count for these facts (AJ-577-M2/M3),
 * or null when the pack does not ask. Never below 1.
 */
export function mandatoryCount(templateId: string, facts: ParagraphFacts = []): number | null {
  const config = getParagraphConfig(templateId);
  if (!config) return null;
  const n = config.mandatory(facts);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * The brief's values as ledger-like entries (source `user`, the value as its
 * own display), one per value or per list item, the way the s.138 brief
 * reader builds the brief's entries; the skeleton evaluator then reads them as it
 * reads a ledger (the option-id map turns an option label into its id).
 * Malformed or empty items are skipped.
 */
export function ledgerFactsFromValues(values: unknown): LedgerFact[] {
  const facts: LedgerFact[] = [];
  if (!Array.isArray(values)) return facts;
  for (const item of values) {
    if (!item || typeof item !== 'object') continue;
    const { key, value } = item as { key?: unknown; value?: unknown };
    if (typeof key !== 'string' || key === '') continue;
    const list = Array.isArray(value) ? value : [value];
    list.forEach((v, i) => {
      if (typeof v !== 'string' || v.trim() === '') return;
      const text = v.trim();
      facts.push({
        id: `brief:${key}:${i}`,
        key,
        label: key,
        type: 'text',
        value: text,
        display: text,
        raw_span: '',
        source: 'user',
        confidence: 1,
        required_in_draft: false,
      });
    });
  }
  return facts;
}

/**
 * The facts for a draft: the ledger's entries, plus the brief's for any key
 * the ledger does not hold.
 */
export function paragraphFactsFor(
  values: unknown,
  ledgerFacts?: readonly LedgerFact[],
): ParagraphFacts {
  if (!ledgerFacts) return ledgerFactsFromValues(values);
  const inLedger = new Set(ledgerFacts.map((f) => f.key));
  return [...ledgerFacts, ...ledgerFactsFromValues(values).filter((f) => !inLedger.has(f.key))];
}

/** One Ink band: total body paragraphs `from`..`to` (inclusive) cost `ink` (absolute Ink). */
export interface ParagraphBand {
  from: number;
  to: number;
  ink: number;
}

/** The highest count any band may cover (Vikram: cap 25). */
export const PARAGRAPH_BAND_MAX = 25;

/**
 * Strict shape check of a bands value (Vikram's format, confirmed by Arjun):
 * a non-empty JSON array of {upTo, add} (no other keys), whole numbers,
 * upTo >= 1 and strictly ascending, the last upTo <= 25, add >= 0. `add` is
 * Ink over the pack's class price. Returned as absolute bands: band i covers
 * (previous upTo + 1)..upTo (the first starts at 1) at classPrice + add.
 * Null when anything is off.
 */
export function parseParagraphBands(raw: string, classPrice: number): ParagraphBand[] | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0) return null;
  const bands: ParagraphBand[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const keys = Object.keys(item);
    if (keys.length !== 2 || !['upTo', 'add'].every((k) => keys.includes(k))) return null;
    const { upTo, add } = item as Record<string, unknown>;
    if (typeof upTo !== 'number' || typeof add !== 'number') return null;
    if (!Number.isInteger(upTo) || !Number.isInteger(add)) return null;
    const prev = bands[bands.length - 1];
    const from = prev ? prev.to + 1 : 1;
    if (upTo < from || upTo > PARAGRAPH_BAND_MAX || add < 0) return null;
    bands.push({ from, to: upTo, ink: classPrice + add });
  }
  return bands;
}

/** Keys already warned about (missing or invalid), so each is logged once. */
const warnedBandKeys = new Set<string>();

function warnBandsOnce(key: string, problem: 'missing' | 'invalid' | 'unreadable'): void {
  const tag = `${key}:${problem}`;
  if (warnedBandKeys.has(tag)) return;
  warnedBandKeys.add(tag);
  // The key name only, never the value.
  console.warn(
    `[drafting] paragraph bands ${problem} (key=${key}); the pack is charged its class price`,
  );
}

/** TEST ONLY: forget which band keys were warned about. */
export function _resetParagraphBandWarnings(): void {
  warnedBandKeys.clear();
}

async function readBands(
  key: string,
  classPrice: number,
): Promise<ParagraphBand[] | null | 'missing'> {
  let raw: string;
  try {
    raw = await getAppSetting(key);
  } catch (err) {
    if (err instanceof Error && err.name === 'AppSettingMissingError') return 'missing';
    warnBandsOnce(key, 'unreadable');
    return null;
  }
  const bands = parseParagraphBands(raw, classPrice);
  if (!bands) warnBandsOnce(key, 'invalid');
  return bands;
}

/**
 * The bands for a pack: `pricing.paragraph_bands.<packId>`, else
 * `pricing.paragraph_bands.base_<classPrice>`. Null when both are missing or
 * invalid (one warn per key, key name only).
 */
export async function getParagraphBands(
  templateId: string,
  classPrice: number,
): Promise<ParagraphBand[] | null> {
  return (await getParagraphBandsWithKey(templateId, classPrice))?.bands ?? null;
}

/**
 * getParagraphBands, with the AppSettings key the bands were read from (the
 * pack key, or the `base_<classPrice>` fallback), so a later warning names
 * the key that was actually parsed.
 */
export async function getParagraphBandsWithKey(
  templateId: string,
  classPrice: number,
): Promise<{ bands: ParagraphBand[]; key: string } | null> {
  const prefix = APP_SETTING_KEYS.PARAGRAPH_BANDS_PREFIX;
  const packKey = `${prefix}.${templateId}`;
  const baseKey = `${prefix}.base_${classPrice}`;
  const own = await readBands(packKey, classPrice);
  if (Array.isArray(own)) return { bands: own, key: packKey };
  const base = await readBands(baseKey, classPrice);
  if (Array.isArray(base)) return { bands: base, key: baseKey };
  if (own === 'missing' && base === 'missing') {
    warnBandsOnce(packKey, 'missing');
    warnBandsOnce(baseKey, 'missing');
  }
  return null;
}

function bandFor(bands: readonly ParagraphBand[], n: number): ParagraphBand | undefined {
  return bands.find((b) => n >= b.from && n <= b.to);
}

/** A pack that does not ask: today's price, unchanged. */
export interface FlatQuote {
  asks: false;
  ink: number;
}

/** A pack that asks for a paragraph count. */
export interface ParagraphQuote {
  asks: true;
  /** The Ink for `paragraphs` (the ceiling shown before Generate, AJ-577-M2 (a)). */
  ink: number;
  /** mandatoryCount for these facts. */
  min: number;
  /** The pack's cap. */
  max: number;
  /** The pack's default, clamped into [min, max]. */
  default: number;
  /** The count quoted: the one asked for, else `default`. Can be out of range (see quoteInRange). */
  paragraphs: number;
  /** The bands, clipped to [min, max]. */
  bands: ParagraphBand[];
  /** True when the pack drafts through the D1 skeleton/ledger path: the count is "up to N". */
  ceiling: boolean;
  /** The Ink of the band holding `max`: the most this pack can cost (an out-of-range count is quoted at it). */
  maxInk: number;
  /** All bands as configured, for the settle at the delivered band. */
  allBands: ParagraphBand[];
}

export type DraftQuote = FlatQuote | ParagraphQuote;

/** Is the quoted count inside [min, max]? Always true for a pack that does not ask. */
export function quoteInRange(quote: DraftQuote): boolean {
  return !quote.asks || (quote.paragraphs >= quote.min && quote.paragraphs <= quote.max);
}

/**
 * THE price of one draft (T-388 single source). Undefined when the id has no
 * price (callers refuse it, as costForTemplate's).
 *  - The pack does not ask, or its bands are missing/invalid/do not cover
 *    [min, cap] → {asks:false, ink: costForTemplate} (exactly today's price).
 *    No settings read happens for a pack that does not ask.
 *  - Else → the band for `paragraphs` (default when absent); an out-of-range
 *    count is quoted at `maxInk` and must be refused by the caller (quoteInRange).
 * `ceiling` is the caller's call (it knows whether the run goes down the D1
 * skeleton/ledger path); it is echoed only on an asking quote.
 */
export async function quoteDraft(
  templateId: string,
  input: { paragraphs?: number; facts?: ParagraphFacts; ceiling?: boolean } = {},
): Promise<DraftQuote | undefined> {
  const classPrice = costForTemplate(templateId);
  if (classPrice === undefined) return undefined;
  const flat: FlatQuote = { asks: false, ink: classPrice };
  const config = getParagraphConfig(templateId);
  if (!config) return flat;

  const max = config.cap;
  const min = Math.min(mandatoryCount(templateId, input.facts ?? []) ?? 1, max);
  const read = await getParagraphBandsWithKey(templateId, classPrice);
  if (!read) return flat;
  const allBands = read.bands;
  // The bands must price every count the user may choose. The warning names
  // the key whose bands were parsed (the pack's, or the base fallback).
  for (let n = min; n <= max; n += 1) {
    if (!bandFor(allBands, n)) {
      warnBandsOnce(read.key, 'invalid');
      return flat;
    }
  }
  const def = Math.min(max, Math.max(min, config.default));
  const paragraphs = input.paragraphs ?? def;
  const maxInk = bandFor(allBands, max)!.ink;
  const inRange = paragraphs >= min && paragraphs <= max;
  const ink = inRange ? bandFor(allBands, paragraphs)!.ink : maxInk;
  const bands = allBands
    .filter((b) => b.to >= min && b.from <= max)
    .map((b) => ({ from: Math.max(b.from, min), to: Math.min(b.to, max), ink: b.ink }));
  return {
    asks: true,
    ink,
    min,
    max,
    default: def,
    paragraphs,
    bands,
    ceiling: input.ceiling === true,
    maxInk,
    allBands,
  };
}

/**
 * The Ink a delivered draft is settled at (Vikram: settle at the delivered
 * band, never more than the quote): min(quoted, band of `delivered`). A
 * count no band covers above the bands, or an unknown count (not a whole
 * number >= 1, e.g. the count could not be read), settles at the quote. Below
 * the first band it settles at the first band.
 */
export function settleInkForDelivered(quote: ParagraphQuote, delivered: number): number {
  if (!Number.isInteger(delivered) || delivered < 1) return quote.ink;
  const first = quote.allBands[0];
  const band = delivered < first.from ? first : bandFor(quote.allBands, delivered);
  return band ? Math.min(quote.ink, band.ink) : quote.ink;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface CreditBalance {
  // Legacy credit buckets (kept for backward compat — old enforcement still reads these)
  topupCredits: number;
  earnedCredits: number;
  subscriptionCredits: number;
  total: number;
  // Ink buckets (SCRUM-101) — human-readable Ink values (stored units ÷ 2)
  inkSub: number;
  inkAnnualCarry: number;
  inkTopup: number;
  totalInk: number;
  inkSubMonthlyAllotment: number;
  planTier: 'free' | 'solo' | 'pro';
  billingCycle: 'none' | 'monthly' | 'yearly';
}

function normalizePlanTier(raw: string | undefined): 'free' | 'solo' | 'pro' {
  if (raw === 'practice' || raw === 'solo') return 'solo';
  if (raw === 'firm' || raw === 'pro') return 'pro';
  return 'free';
}

/**
 * T-399: grant any yearly-plan months that have come due (and zero a plan past
 * its paid period) before a balance read or a hold. Best effort: an error is
 * logged and never blocks the read or the hold. Skips the golden-set fixture
 * user (T-147e: no inkledger rows for it).
 */
async function settleYearlyDripBestEffort(userId: string): Promise<void> {
  if (isFixtureUser(userId) || !mongoose.Types.ObjectId.isValid(userId)) return;
  const db = mongoose.connection.db;
  if (!db) return;
  try {
    await settleYearlyDrip({ db, userId: new mongoose.Types.ObjectId(userId) });
  } catch (err) {
    // T-288: the error class only, never the driver's message.
    console.error(
      '[drafting] settleYearlyDrip failed:',
      err instanceof Error ? err.name : 'unknown',
    );
  }
}

export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  const empty: CreditBalance = {
    topupCredits: 0,
    earnedCredits: 0,
    subscriptionCredits: 0,
    total: 0,
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 0,
    totalInk: 0,
    inkSubMonthlyAllotment: 0,
    planTier: 'free',
    billingCycle: 'none',
  };
  if (!mongoose.Types.ObjectId.isValid(userId)) return empty;

  await settleYearlyDripBestEffort(userId);

  const u = await User.findById(userId).lean();
  const topup = u?.topupCredits ?? 0;
  const earned = u?.earnedCredits ?? 0;
  const sub = u?.subscriptionCredits ?? 0;

  // Ink fields stored as ×2 units — divide by 2 for human-readable display
  const inkSubUnits = u?.inkSub ?? 0;
  const inkCarryUnits = u?.inkAnnualCarry ?? 0;
  const inkTopupUnits = u?.inkTopup ?? 0;
  const inkAllotUnits = u?.inkSubMonthlyAllotment ?? 0;

  return {
    topupCredits: topup,
    earnedCredits: earned,
    subscriptionCredits: sub,
    total: topup + earned + sub,
    inkSub: Math.floor(inkSubUnits / 2),
    inkAnnualCarry: Math.floor(inkCarryUnits / 2),
    inkTopup: Math.floor(inkTopupUnits / 2),
    totalInk: Math.floor((inkSubUnits + inkCarryUnits + inkTopupUnits) / 2),
    inkSubMonthlyAllotment: Math.floor(inkAllotUnits / 2),
    planTier: normalizePlanTier(u?.planTier),
    billingCycle: (u?.billingCycle as 'none' | 'monthly' | 'yearly') ?? 'none',
  };
}

// ── Grants ──────────────────────────────────────────────────────────────────

export async function grantCredits(input: {
  userId: string;
  bucket: CreditBucket;
  amount: number;
  source: CreditSource;
  reference?: string;
  templateId?: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const { userId, bucket, amount, source, reference, templateId, metadata } = input;
  if (amount <= 0) throw new Error(`grantCredits: amount must be > 0 (got ${amount})`);
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error(`grantCredits: invalid userId "${userId}"`);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // For 'plan_renewal' the bucket is reset, not incremented — the previous
  // month's subscriptionCredits lapse. Caller passes amount = full plan grant.
  const updateOp =
    source === 'plan_renewal' && bucket === 'subscriptionCredits'
      ? { $set: { subscriptionCredits: amount } }
      : { $inc: { [bucket]: amount } };

  const after = await User.findByIdAndUpdate(userObjectId, updateOp, { new: true }).lean();
  const balanceAfter = (after?.[bucket] as number | undefined) ?? amount;

  await CreditLedger.create({
    userId: userObjectId,
    source,
    bucket,
    amount,
    balanceAfter,
    reference,
    templateId,
    metadata,
  });

  return balanceAfter;
}

// ── Spend ──────────────────────────────────────────────────────────────────

export class InsufficientCreditsError extends Error {
  readonly required: number;
  readonly available: number;
  readonly shortBy: number;
  constructor(required: number, available: number) {
    super(`Insufficient credits — need ${required}, have ${available}`);
    this.name = 'InsufficientCreditsError';
    this.required = required;
    this.available = available;
    this.shortBy = required - available;
  }
}

/**
 * Spend N credits in priority order: topup → earned → subscription.
 * Writes one CreditLedger row per bucket touched. Atomic per-bucket via $inc
 * with a balance guard.
 *
 * Throws InsufficientCreditsError if the total available across all 3 buckets
 * is less than the cost. Re-throws on any DB error.
 */
export async function spendCredits(input: {
  userId: string;
  amount: number;
  templateId?: string;
  reference?: string;
}): Promise<{ spent: Array<{ bucket: CreditBucket; amount: number }>; totalSpent: number }> {
  const { userId, amount, templateId, reference } = input;
  if (amount <= 0) throw new Error(`spendCredits: amount must be > 0 (got ${amount})`);

  const balance = await getCreditBalance(userId);
  if (balance.total < amount) {
    throw new InsufficientCreditsError(amount, balance.total);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  let remaining = amount;
  const spent: Array<{ bucket: CreditBucket; amount: number }> = [];

  // Drain in priority order
  const order: Array<{ bucket: CreditBucket; available: number }> = [
    { bucket: 'topupCredits', available: balance.topupCredits },
    { bucket: 'earnedCredits', available: balance.earnedCredits },
    { bucket: 'subscriptionCredits', available: balance.subscriptionCredits },
  ];

  for (const { bucket, available } of order) {
    if (remaining <= 0) break;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);

    const after = await User.findByIdAndUpdate(
      userObjectId,
      { $inc: { [bucket]: -take } },
      { new: true },
    ).lean();
    const balanceAfter = (after?.[bucket] as number | undefined) ?? 0;

    await CreditLedger.create({
      userId: userObjectId,
      source: 'draft_spent',
      bucket,
      amount: -take,
      balanceAfter,
      reference,
      templateId,
    });

    spent.push({ bucket, amount: take });
    remaining -= take;
  }

  return { spent, totalSpent: amount };
}

// ── Ink spend (new ink system — SCRUM-101) ────────────────────────────────

/**
 * Atomically deduct ink from a user's ink buckets in priority order:
 *   inkSub → inkAnnualCarry → inkTopup
 *
 * Uses a MongoDB aggregation-pipeline update so concurrent drafts can never
 * drive any bucket below zero (no overselling). Writes one inkledger row per
 * bucket touched.
 *
 * costCredits: the template credit cost (1 or 2). Converted to storage units
 * internally (×2) — 1 displayed Ink = 2 storage units.
 */
export async function spendInk(input: {
  userId: string;
  costCredits: number;
  reason: 'generate' | 'regenerate';
  reference?: string;
  /** T-003 §3.8 — which draft/attempt this spend paid for. Optional, no effect on amount or bucket order. */
  runId?: string;
  runSequence?: number;
}): Promise<{ success: boolean; reason?: string }> {
  const { userId, costCredits, reason, reference, runId, runSequence } = input;
  // T-147e: a golden-set run is never charged and writes no inkledger row.
  if (isFixtureUser(userId)) return { success: true, reason: 'fixture_run' };
  if (!mongoose.Types.ObjectId.isValid(userId)) return { success: false, reason: 'user_not_found' };

  const costUnits = costCredits * 2; // 1 Ink = 2 storage units
  const oid = new mongoose.Types.ObjectId(userId);

  // Atomic aggregation-pipeline update.
  // $expr guard ensures total >= costUnits before touching anything.
  // Temp fields (_ds, _r1, _dc, _r2, _dt) capture per-bucket deduction amounts.
  const result = await User.collection.findOneAndUpdate(
    {
      _id: oid,
      $expr: {
        $gte: [{ $add: ['$inkSub', '$inkAnnualCarry', '$inkTopup'] }, costUnits],
      },
    },
    [
      { $set: { _ds: { $min: ['$inkSub', costUnits] } } },
      { $set: { _r1: { $subtract: [costUnits, '$_ds'] } } },
      { $set: { _dc: { $min: ['$inkAnnualCarry', '$_r1'] } } },
      { $set: { _r2: { $subtract: ['$_r1', '$_dc'] } } },
      { $set: { _dt: { $min: ['$inkTopup', '$_r2'] } } },
      {
        $set: {
          inkSub: { $subtract: ['$inkSub', '$_ds'] },
          inkAnnualCarry: { $subtract: ['$inkAnnualCarry', '$_dc'] },
          inkTopup: { $subtract: ['$inkTopup', '$_dt'] },
        },
      },
    ],
    { returnDocument: 'after' },
  );

  if (!result) {
    const exists = await User.exists({ _id: oid });
    return { success: false, reason: exists ? 'insufficient_ink' : 'user_not_found' };
  }

  const doc = result as Record<string, number>;
  const newSub = doc.inkSub ?? 0;
  const newCarry = doc.inkAnnualCarry ?? 0;
  const newTopup = doc.inkTopup ?? 0;
  const totalAfter = newSub + newCarry + newTopup;

  const ds = doc._ds ?? 0;
  const dc = doc._dc ?? 0;
  const dt = doc._dt ?? 0;

  const conn = mongoose.connection;
  if (conn.db) {
    const rows = [];
    if (ds > 0) {
      rows.push({
        userId: oid,
        delta: -ds,
        reason,
        sourceBucket: 'sub',
        balanceAfter: totalAfter + dc + dt,
        reference,
        runId,
        runSequence,
        createdAt: new Date(),
      });
    }
    if (dc > 0) {
      rows.push({
        userId: oid,
        delta: -dc,
        reason,
        sourceBucket: 'annual_carry',
        balanceAfter: totalAfter + dt,
        reference,
        runId,
        runSequence,
        createdAt: new Date(),
      });
    }
    if (dt > 0) {
      rows.push({
        userId: oid,
        delta: -dt,
        reason,
        sourceBucket: 'topup',
        balanceAfter: totalAfter,
        reference,
        runId,
        runSequence,
        createdAt: new Date(),
      });
    }
    if (rows.length > 0) {
      // T-226 AC8: awaited, so the row exists when the caller moves on.
      try {
        await conn.db.collection('inkledger').insertMany(rows);
      } catch (err: unknown) {
        console.error(
          '[drafting] inkledger write failed:',
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // Clean up temp fields. T-226 AC8: awaited, not fire-and-forget.
  try {
    await User.collection.updateOne(
      { _id: oid },
      { $unset: { _ds: '', _r1: '', _dc: '', _r2: '', _dt: '' } },
    );
  } catch {
    // A leftover temp field is harmless: every pipeline that sets them
    // overwrites them first.
  }

  return { success: true };
}

// ── Ink holds (T-226, Arjun 12 Oct 2026) ─────────────────────────────────────
//
// Debit-on-hold on the user document. One atomic write takes the Ink and
// records the hold before any model call; after the run the hold is settled
// (kept, with ledger rows) or released (refunded). Charge rule: Ink is kept
// only when a successful run's draft reached the user.
//
// AC9: holdInk, settleInk, releaseInk, releaseExpiredHolds, extendInkHold
// and (T-577) setHoldSettleUnits are the only code that touches `inkHolds`.
// `inkSettled` is written only by settleInk (in the pull) and read only by
// wasInkSettled. Billing renewal and cancel `$set` the buckets
// and must never touch it.

/**
 * How long a hold lives before the sweep closes it. Above the longest real
 * run: the brief path's SDK worst case (pipeline plus repair pass) is over
 * 15 minutes, so the lead raised it from Arjun's 15 to 30.
 */
export const INK_HOLD_TTL_MS = 30 * 60 * 1000;

/** How often the background sweep runs (startHoldSweep's default). */
export const INK_HOLD_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * T-226 round 3 (Arjun): a live run keeps its own hold alive. withInkHold
 * extends the hold's expiry every 5 minutes, so the sweep only ever sees holds
 * whose owner has stopped.
 */
export const INK_HOLD_HEARTBEAT_MS = 5 * 60 * 1000;

/**
 * Beats stop this long after the hold was taken: past it the run is treated
 * as dead, so a stuck run cannot hold Ink forever.
 */
export const INK_HOLD_MAX_HEARTBEAT_MS = 60 * 60 * 1000;

/**
 * One open hold, as stored in `User.inkHolds`. Units are ×2 storage units;
 * `unit: 'ink2'` lets the T-201 drops migration tell old holds apart.
 */
export type InkHold = IInkHold;

export type HoldInkResult =
  | { ok: true; fixture?: boolean; hold?: InkHold }
  | { ok: false; reason: 'insufficient_ink' | 'duplicate' | 'user_not_found' };

/** Pipeline expression: the field's value, or 0 when it is missing or null. */
const orZero = (field: string) => ({ $ifNull: [field, 0] });

/** The users collection, typed for the hold fields the raw driver writes. */
interface UserInkFields {
  inkSub?: number;
  inkAnnualCarry?: number;
  inkTopup?: number;
  inkHolds?: InkHold[];
  inkSettled?: Array<{ runId: string; runSequence: number; settledAt: Date }>;
}

/**
 * T-545: storage units (×2) to Ink, the unit the user sees (1 Ink = 2 units,
 * so .5 Ink is possible). The one place a settled amount is converted for the
 * SSE `done` event's `inkDebited`; routes never divide by 2 themselves.
 */
export function inkFromUnits(units: number): number {
  return units / 2;
}

/** T-577: Ink to storage units (×2), the inverse of inkFromUnits. Routes never multiply by 2 themselves. */
export function unitsFromInk(ink: number): number {
  return Math.round(ink * 2);
}

/** How many settled-hold keys a user keeps (newest last). */
export const INK_SETTLED_KEEP = 50;
const inkUsers = () => User.collection as unknown as mongoose.mongo.Collection<UserInkFields>;

/** Pipeline expression: does `$$this` (an inkHolds entry) have this key? */
function isHoldFor(runId: string, runSequence: number) {
  return {
    $and: [
      { $eq: ['$$this.runId', { $literal: runId }] },
      { $eq: ['$$this.runSequence', { $literal: runSequence }] },
    ],
  };
}

/**
 * Hold the cost of one draft (AC1). One pipeline findOneAndUpdate on the user:
 * guarded by total >= cost and no existing hold for (runId, runSequence), it
 * takes the units in spendInk's bucket order (inkSub → inkAnnualCarry →
 * inkTopup) and pushes the hold in the same write, so the guard and the debit
 * cannot race. The temp fields are $unset in the same pipeline.
 *
 * A refusal is classified with one re-read: a hold for the key means
 * `duplicate` (1b), otherwise `insufficient_ink` (1a) or `user_not_found`.
 */
export async function holdInk(input: {
  userId: string;
  costCredits: number;
  runId: string;
  runSequence: number;
  /**
   * T-577: the cost is a paragraph-count quote; store it on the hold as
   * `quotedUnits`. Absent → the hold is written exactly as before.
   */
  quoted?: boolean;
}): Promise<HoldInkResult> {
  const { userId, costCredits, runId, runSequence, quoted } = input;
  // T-147e: a golden-set run is never held or charged.
  if (isFixtureUser(userId)) return { ok: true, fixture: true };
  if (!mongoose.Types.ObjectId.isValid(userId)) return { ok: false, reason: 'user_not_found' };

  // T-399: a yearly plan's due monthly Ink lands before the hold is judged.
  await settleYearlyDripBestEffort(userId);

  // Close this user's expired holds first, so a crashed run's Ink is back
  // before this one is judged against the balance.
  try {
    await releaseExpiredHolds(userId);
  } catch (err) {
    // T-288: the error class and ids only, never the driver's message.
    console.error(
      `[drafting] releaseExpiredHolds failed before a hold (runId=${runId}, runSequence=${runSequence}):`,
      err instanceof Error ? err.name : 'unknown',
    );
  }

  const costUnits = costCredits * 2; // 1 Ink = 2 storage units
  const oid = new mongoose.Types.ObjectId(userId);
  const expiresAt = new Date(Date.now() + INK_HOLD_TTL_MS);

  const result = await User.collection.findOneAndUpdate(
    {
      _id: oid,
      // A missing inkHolds matches $not too.
      inkHolds: { $not: { $elemMatch: { runId, runSequence } } },
      $expr: {
        $gte: [
          { $add: [orZero('$inkSub'), orZero('$inkAnnualCarry'), orZero('$inkTopup')] },
          costUnits,
        ],
      },
    },
    [
      { $set: { _ds: { $min: [orZero('$inkSub'), costUnits] } } },
      { $set: { _r1: { $subtract: [costUnits, '$_ds'] } } },
      { $set: { _dc: { $min: [orZero('$inkAnnualCarry'), '$_r1'] } } },
      { $set: { _r2: { $subtract: ['$_r1', '$_dc'] } } },
      { $set: { _dt: { $min: [orZero('$inkTopup'), '$_r2'] } } },
      {
        $set: {
          inkSub: { $subtract: [orZero('$inkSub'), '$_ds'] },
          inkAnnualCarry: { $subtract: [orZero('$inkAnnualCarry'), '$_dc'] },
          inkTopup: { $subtract: [orZero('$inkTopup'), '$_dt'] },
          inkHolds: {
            $concatArrays: [
              { $ifNull: ['$inkHolds', []] },
              [
                {
                  runId: { $literal: runId },
                  runSequence: { $literal: runSequence },
                  units: { $literal: costUnits },
                  split: { sub: '$_ds', carry: '$_dc', topup: '$_dt' },
                  unit: 'ink2',
                  expiresAt: { $literal: expiresAt },
                  ...(quoted === true ? { quotedUnits: { $literal: costUnits } } : {}),
                },
              ],
            ],
          },
        },
      },
      { $unset: ['_ds', '_r1', '_dc', '_r2', '_dt'] },
    ],
    { returnDocument: 'after' },
  );

  if (result) {
    const holds = ((result as { inkHolds?: InkHold[] }).inkHolds ?? []).filter(
      (h) => h.runId === runId && h.runSequence === runSequence,
    );
    return { ok: true, hold: holds[0] };
  }

  const current = await User.collection.findOne({ _id: oid }, { projection: { inkHolds: 1 } });
  if (!current) return { ok: false, reason: 'user_not_found' };
  const holds = ((current as { inkHolds?: InkHold[] }).inkHolds ?? []) as InkHold[];
  if (holds.some((h) => h.runId === runId && h.runSequence === runSequence)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: false, reason: 'insufficient_ink' };
}

/**
 * Heartbeat (T-226 round 3): push a live hold's expiry to now + TTL. One
 * write, only if the hold is still there; never re-creates a hold.
 */
export async function extendInkHold(
  userId: string,
  runId: string,
  runSequence: number,
): Promise<{ extended: boolean }> {
  if (isFixtureUser(userId)) return { extended: false };
  if (!mongoose.Types.ObjectId.isValid(userId)) return { extended: false };
  const oid = new mongoose.Types.ObjectId(userId);
  const r = await inkUsers().updateOne(
    { _id: oid, inkHolds: { $elemMatch: { runId, runSequence } } },
    { $set: { 'inkHolds.$[h].expiresAt': new Date(Date.now() + INK_HOLD_TTL_MS) } },
    { arrayFilters: [{ 'h.runId': runId, 'h.runSequence': runSequence }] },
  );
  return { extended: r.matchedCount > 0 };
}

/**
 * T-577: record on a live hold the units its settle must keep (the delivered
 * band, never above the hold). One write, only if the hold is still there and
 * not yet marked delivered; never re-creates a hold. The sweep and a
 * lost-hold path then settle this figure (settleInk with no actualUnits).
 */
export async function setHoldSettleUnits(
  userId: string,
  runId: string,
  runSequence: number,
  units: number,
): Promise<{ set: boolean }> {
  if (isFixtureUser(userId)) return { set: false };
  if (!mongoose.Types.ObjectId.isValid(userId)) return { set: false };
  if (!Number.isFinite(units) || units < 0) return { set: false };
  const oid = new mongoose.Types.ObjectId(userId);
  const r = await inkUsers().updateOne(
    { _id: oid, inkHolds: { $elemMatch: { runId, runSequence, deliver: { $ne: true } } } },
    [
      {
        $set: {
          inkHolds: {
            $map: {
              input: { $ifNull: ['$inkHolds', []] },
              in: {
                $cond: [
                  isHoldFor(runId, runSequence),
                  {
                    $mergeObjects: [
                      '$$this',
                      { settleUnits: { $min: [{ $literal: units }, '$$this.units'] } },
                    ],
                  },
                  '$$this',
                ],
              },
            },
          },
        },
      },
    ],
  );
  return { set: r.matchedCount > 0 };
}

/**
 * Release a hold (AC3): one findOneAndUpdate that requires the hold, $pulls
 * it and adds each bucket back by its split. Idempotent: with no hold there
 * is nothing to match and nothing changes. No ledger row.
 *
 * `onlyUndelivered` (used only by releaseExpiredHolds, Arjun round 3 item 5):
 * the same write also requires the hold not to be marked `deliver`, so a
 * route settle that marks it between the sweep's read and this write is
 * never refunded. `expiredBy` (also sweep-only, Arjun round 3) requires the
 * hold to be expired at that time in the same write, so a hold a late
 * heartbeat just extended is never released. Route releases pass neither.
 */
export async function releaseInk(
  userId: string,
  runId: string,
  runSequence: number,
  options: { onlyUndelivered?: boolean; expiredBy?: Date } = {},
): Promise<{ released: boolean }> {
  if (isFixtureUser(userId)) return { released: false };
  if (!mongoose.Types.ObjectId.isValid(userId)) return { released: false };
  const oid = new mongoose.Types.ObjectId(userId);
  const holdMatch: Record<string, unknown> = { runId, runSequence };
  if (options.onlyUndelivered) holdMatch.deliver = { $ne: true };
  if (options.expiredBy) holdMatch.expiresAt = { $lte: options.expiredBy };

  const result = await User.collection.findOneAndUpdate(
    { _id: oid, inkHolds: { $elemMatch: holdMatch } },
    [
      {
        $set: {
          _h: {
            $arrayElemAt: [
              {
                $filter: {
                  input: { $ifNull: ['$inkHolds', []] },
                  cond: isHoldFor(runId, runSequence),
                },
              },
              0,
            ],
          },
        },
      },
      {
        $set: {
          inkSub: { $add: [orZero('$inkSub'), orZero('$_h.split.sub')] },
          inkAnnualCarry: { $add: [orZero('$inkAnnualCarry'), orZero('$_h.split.carry')] },
          inkTopup: { $add: [orZero('$inkTopup'), orZero('$_h.split.topup')] },
          inkHolds: {
            $filter: {
              input: { $ifNull: ['$inkHolds', []] },
              cond: { $not: [isHoldFor(runId, runSequence)] },
            },
          },
        },
      },
      { $unset: '_h' },
    ],
    { returnDocument: 'after' },
  );
  return { released: result !== null };
}

/**
 * Settle a hold (AC7, AC8): keep the Ink and write today's inkledger
 * `generate` rows from the hold's split.
 *
 * Order (Arjun, CTO ruling 12 Oct 2026): duplicate rows are made impossible
 * in code, not with an index or a lock.
 *   1. Mark the hold `deliver: true` (and its reference), atomically. From
 *      here on the sweep settles it, never releases it, even with no completed
 *      Generation (e.g. the document save failed while the client was present).
 *   2. $pull the hold (findOneAndUpdate, returnDocument 'before'), returning
 *      any `actualUnits` difference in the same write.
 *   3. Only the caller whose $pull removed the hold writes the ledger rows,
 *      built from the removed hold's split. A caller that finds the hold gone
 *      lost the race and writes nothing (`no_hold`), so a route settle and a
 *      sweep settle can never both write rows.
 *   4. If the ledger write fails after the pull, it is logged at error level
 *      (internal ids and units only) and those rows are lost; the Ink stays
 *      kept (`settled: true, reason: 'ledger_failed'`).
 * The rows are still written as upserts keyed (userId, runId, runSequence,
 * sourceBucket, reason 'generate'), as a second guard against a duplicate.
 *
 * `actualUnits` (T-202): when below the hold, the difference goes back to
 * the buckets in the same write as the $pull. The kept part is taken from the
 * split in spend order, so the refund comes back to the last buckets taken.
 * T-577: a paragraph-count draft passes min(quote, delivered band); with no
 * actualUnits the hold's stored `settleUnits` is used, else the full hold.
 *
 * T-545: `units` is the storage units this settle kept, set whenever Ink was
 * kept (including `ledger_failed`, where the Ink stays kept). It is absent for
 * `fixture_run` (nothing was ever charged) and `no_hold`. It can be 0 only if
 * a real settle kept 0 units.
 *
 * T-577: `onMarked` is called once the step-1 mark has landed (with
 * `settleUnits` when `actualUnits` was given), even if this call then loses
 * the pull to a sweep or throws: from then on a sweep keeps that figure.
 */
export async function settleInk(
  userId: string,
  runId: string,
  runSequence: number,
  actualUnits?: number,
  reference?: string,
  onMarked?: () => void,
): Promise<{
  settled: boolean;
  reason?: 'fixture_run' | 'no_hold' | 'ledger_failed';
  units?: number;
}> {
  if (isFixtureUser(userId)) return { settled: true, reason: 'fixture_run' };
  if (!mongoose.Types.ObjectId.isValid(userId)) return { settled: false, reason: 'no_hold' };
  const oid = new mongoose.Types.ObjectId(userId);

  const current = await inkUsers().findOne(
    { _id: oid, inkHolds: { $elemMatch: { runId, runSequence } } },
    { projection: { inkHolds: 1 } },
  );
  const hold = current?.inkHolds?.find((h) => h.runId === runId && h.runSequence === runSequence);
  if (!hold) return { settled: false, reason: 'no_hold' };

  // 1. Mark it delivered. A re-run (from the sweep) keeps the stored
  // reference unless it is given one.
  const marked = await inkUsers().updateOne(
    { _id: oid, inkHolds: { $elemMatch: { runId, runSequence, expiresAt: hold.expiresAt } } },
    {
      $set: {
        'inkHolds.$[h].deliver': true,
        ...(reference !== undefined ? { 'inkHolds.$[h].reference': reference } : {}),
        // T-577: the settle amount travels with the mark, so a sweep that
        // finishes this settle keeps the same figure.
        ...(actualUnits !== undefined
          ? { 'inkHolds.$[h].settleUnits': Math.max(0, Math.min(actualUnits, hold.units)) }
          : {}),
      },
    },
    { arrayFilters: [{ 'h.runId': runId, 'h.runSequence': runSequence }] },
  );
  if (marked.matchedCount === 0) return { settled: false, reason: 'no_hold' };
  onMarked?.();

  // Holds are never changed after holdInk except for the mark above, and the
  // filter pins this exact hold (expiresAt), so this split is the one pulled.
  // T-577: with no actualUnits, a stored settleUnits (the delivered band) is
  // kept; with neither, the full hold, as before.
  const charged = Math.max(0, Math.min(actualUnits ?? hold.settleUnits ?? hold.units, hold.units));
  const keptSub = Math.min(hold.split.sub, charged);
  const keptCarry = Math.min(hold.split.carry, charged - keptSub);
  const keptTopup = Math.min(hold.split.topup, charged - keptSub - keptCarry);
  const refund = {
    sub: hold.split.sub - keptSub,
    carry: hold.split.carry - keptCarry,
    topup: hold.split.topup - keptTopup,
  };

  // 2. Pull it. The filter pins this exact hold, so a hold re-taken for the
  // same key after a release is never pulled by a stale settle.
  const before = await inkUsers().findOneAndUpdate(
    {
      _id: oid,
      inkHolds: { $elemMatch: { runId, runSequence, expiresAt: hold.expiresAt } },
    },
    {
      $pull: { inkHolds: { runId, runSequence } },
      $inc: { inkSub: refund.sub, inkAnnualCarry: refund.carry, inkTopup: refund.topup },
      // Same write: a durable "this hold was settled" mark (wasInkSettled).
      $push: {
        inkSettled: {
          $each: [{ runId, runSequence, settledAt: new Date() }],
          $slice: -INK_SETTLED_KEEP,
        },
      },
    },
    { returnDocument: 'before' },
  );
  // 3. Hold already gone: another settle or a release won. Write nothing.
  const removed = before?.inkHolds?.find((h) => h.runId === runId && h.runSequence === runSequence);
  if (!before || !removed) return { settled: false, reason: 'no_hold' };

  const ledgerReference = reference ?? removed.reference;
  // Balance after this settle: the hold was already off the buckets, and the
  // refund went back on. Same balanceAfter shape as spendInk's rows.
  const totalAfter =
    (before.inkSub ?? 0) +
    (before.inkAnnualCarry ?? 0) +
    (before.inkTopup ?? 0) +
    refund.sub +
    refund.carry +
    refund.topup;

  const rows: Array<{ sourceBucket: string; delta: number; balanceAfter: number }> = [];
  if (keptSub > 0) {
    rows.push({
      sourceBucket: 'sub',
      delta: -keptSub,
      balanceAfter: totalAfter + keptCarry + keptTopup,
    });
  }
  if (keptCarry > 0) {
    rows.push({
      sourceBucket: 'annual_carry',
      delta: -keptCarry,
      balanceAfter: totalAfter + keptTopup,
    });
  }
  if (keptTopup > 0) {
    rows.push({ sourceBucket: 'topup', delta: -keptTopup, balanceAfter: totalAfter });
  }
  if (rows.length === 0) return { settled: true, units: charged };

  // 4. Only the winner of the pull gets here.
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no database connection');
    const createdAt = new Date();
    await db.collection('inkledger').bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: {
            userId: oid,
            runId,
            runSequence,
            sourceBucket: row.sourceBucket,
            reason: 'generate',
          },
          update: {
            $setOnInsert: {
              userId: oid,
              delta: row.delta,
              reason: 'generate',
              sourceBucket: row.sourceBucket,
              balanceAfter: row.balanceAfter,
              reference: ledgerReference,
              runId,
              runSequence,
              createdAt,
            },
          },
          upsert: true,
        },
      })),
      { ordered: true },
    );
  } catch {
    // Internal ids and units only: no PII, no document content, and not the
    // driver's error text (it can echo the row). The rows are lost (accepted).
    console.error(
      `[drafting] settleInk: inkledger write failed after the hold was settled; rows lost (userId=${userId}, runId=${runId}, runSequence=${runSequence}, units=${charged})`,
    );
    return { settled: true, reason: 'ledger_failed', units: charged };
  }
  return { settled: true, units: charged };
}

/**
 * Was this run's hold settled (by anyone)? True when the settle that pulled
 * it recorded its key in `inkSettled`, in the same write as the pull. A hold
 * that is gone and not here was released. Used by withInkHold before a
 * re-hold, so a hold the sweep (or a concurrent settle) settled is never
 * charged a second time.
 *
 * T-545: the `inkSettled` record holds only the key and `settledAt`, not the
 * kept units, so this cannot report how much was kept. withInkHold sends the
 * held cost for a sweep-paid run, which holds while the sweep settles with no
 * `actualUnits` (it keeps the full hold).
 */
export async function wasInkSettled(
  userId: string,
  runId: string,
  runSequence: number,
): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return false;
  const found = await inkUsers().findOne(
    {
      _id: new mongoose.Types.ObjectId(userId),
      inkSettled: { $elemMatch: { runId, runSequence } },
    },
    { projection: { _id: 1 } },
  );
  return found !== null;
}

/**
 * Close every expired hold (for one user, or for all users): settle it when
 * settleInk already marked it `deliver` (the draft reached the user) or a
 * completed Generation exists for its (runId, runSequence); else release it.
 * The release only matches an undelivered hold; on a miss the user is
 * re-read and a hold now marked `deliver` is settled instead.
 * This also finishes a settle that marked the hold but failed before its
 * $pull. Running it twice changes nothing: a closed hold is gone, and
 * settle/release only act when their own write removes the hold, so the
 * sweep and a route can never both settle (or settle and release) one hold.
 */
export async function releaseExpiredHolds(
  userId?: string,
): Promise<{ settled: number; released: number }> {
  const counts = { settled: 0, released: 0 };
  if (userId !== undefined) {
    if (isFixtureUser(userId) || !mongoose.Types.ObjectId.isValid(userId)) return counts;
  }
  const now = new Date();
  const filter: Record<string, unknown> = { 'inkHolds.expiresAt': { $lte: now } };
  if (userId !== undefined) filter._id = new mongoose.Types.ObjectId(userId);

  const cursor = User.collection.find(filter, { projection: { inkHolds: 1 } });
  for await (const doc of cursor) {
    const ownerId = String(doc._id);
    const holds = ((doc as { inkHolds?: InkHold[] }).inkHolds ?? []).filter(
      (h) => h.expiresAt instanceof Date && h.expiresAt <= now,
    );
    for (const hold of holds) {
      try {
        const generation =
          hold.deliver === true
            ? null
            : await Generation.findOne({
                runId: hold.runId,
                runSequence: hold.runSequence,
                status: 'completed',
              })
                .select('documentId')
                .lean();
        if (hold.deliver === true || generation) {
          // A delivered hold keeps the reference settleInk stored on it.
          const r = await settleInk(
            ownerId,
            hold.runId,
            hold.runSequence,
            undefined,
            generation?.documentId ? String(generation.documentId) : undefined,
          );
          if (r.settled) counts.settled += 1;
        } else {
          const r = await releaseInk(ownerId, hold.runId, hold.runSequence, {
            onlyUndelivered: true,
            expiredBy: now,
          });
          if (r.released) {
            counts.released += 1;
          } else {
            // Missed: re-read. Marked delivered in between (a route settle is
            // under way) → settle it with its stored reference; the pull-first
            // rule makes only one settle write rows. Present but undelivered
            // (a heartbeat extended it, so it is live) → leave it. Gone →
            // nothing to do.
            const again = await inkUsers().findOne(
              {
                _id: new mongoose.Types.ObjectId(ownerId),
                inkHolds: { $elemMatch: { runId: hold.runId, runSequence: hold.runSequence } },
              },
              { projection: { inkHolds: 1 } },
            );
            const latest = again?.inkHolds?.find(
              (h) => h.runId === hold.runId && h.runSequence === hold.runSequence,
            );
            if (latest?.deliver === true) {
              const s2 = await settleInk(ownerId, hold.runId, hold.runSequence);
              if (s2.settled) counts.settled += 1;
            }
          }
        }
      } catch (err) {
        console.error(
          `[drafting] releaseExpiredHolds: could not close hold (runId=${hold.runId}, runSequence=${hold.runSequence}):`,
          err instanceof Error ? err.name : 'unknown',
        );
      }
    }
  }
  return counts;
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

/**
 * Start the background sweep (every 5 min by default). Started where the
 * service boots (index.ts), never from app.ts, which the tests import. The
 * timer is unref'd so it never keeps the process alive. A second call is a
 * no-op; a run still going when the next tick fires is not overlapped.
 */
export function startHoldSweep(intervalMs: number = INK_HOLD_SWEEP_INTERVAL_MS): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    if (sweepRunning) return;
    sweepRunning = true;
    releaseExpiredHolds()
      .catch((err: unknown) => {
        // The error class only (a whole-sweep failure has no single run).
        console.error(
          '[drafting] ink hold sweep failed:',
          err instanceof Error ? err.name : 'unknown',
        );
      })
      .finally(() => {
        sweepRunning = false;
      });
  }, intervalMs);
  sweepTimer.unref();
}

/** Stop the background sweep (SIGTERM). Safe to call when it is not running. */
export function stopHoldSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

// ── Daily login bonus + rating bonus helpers ───────────────────────────────

export const DAILY_LOGIN_BONUS = 2;
export const RATING_BONUS_PER_DRAFT = 1;

/**
 * Grant the daily login bonus if the user hasn't received it today (IST).
 * Returns the amount granted (0 if already claimed today).
 *
 * Called from the auth service /login + /refresh handlers. We use a single
 * atomic findOneAndUpdate guard with $lt on lastLoginBonusAt so simultaneous
 * logins from two devices grant only once.
 */
export async function tryGrantDailyLoginBonus(userId: string): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const updated = await User.findOneAndUpdate(
    {
      _id: new Types.ObjectId(userId),
      $or: [{ lastLoginBonusAt: null }, { lastLoginBonusAt: { $lt: startOfToday } }],
    },
    {
      $inc: { earnedCredits: DAILY_LOGIN_BONUS },
      $set: { lastLoginBonusAt: new Date() },
    },
    { new: true },
  ).lean();

  if (!updated) return 0;

  await CreditLedger.create({
    userId: new Types.ObjectId(userId),
    source: 'login_bonus',
    bucket: 'earnedCredits',
    amount: DAILY_LOGIN_BONUS,
    balanceAfter: updated.earnedCredits ?? DAILY_LOGIN_BONUS,
    reference: 'Daily login bonus',
  });

  return DAILY_LOGIN_BONUS;
}
