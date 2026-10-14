/**
 * T-115b — erase one document, hard and at once (Arjun, T-115 decision 11 and
 * the 14 Oct 19:30 rulings in T-115b).
 *
 * `DELETE /documents/:id` first sets `deletion.requestedAt` and `isDeleted:
 * true` on the row, so every read that already filters `isDeleted` hides it.
 * Then `eraseDocument` runs the steps below. Each step is idempotent, there is
 * no transaction (the drafting suites stay on a standalone MongoMemoryServer),
 * and the document row goes LAST, so a row that still has `deletion` set is an
 * erase that has not finished. The sweep (`startDocumentEraseSweep`, at boot
 * and on an interval) re-runs those until they are done.
 *
 *   1. links: save the intake ids and ledger ids on the marker, before the
 *      steps that remove or unset what they are read from
 *   2. reviewfeedbacks, reviewtokens: deleted by documentId
 *   3. factdiffs: deleted by documentId and by ledgerId (deleteFactDiffsFor)
 *   4. factledgers, llmauxcalls: deleted through the saved intake/ledger ids
 *   5. generations, usagelogs, templateusages (documentId) and events (docId):
 *      kept, ids and numbers only, with the link unset
 *   6. documents: the row itself
 *
 * A FactLedger or LlmAuxCall row that another live document also reaches (the
 * same intake, or a FactDiff of another document on the same ledger) is left
 * for that document.
 *
 * Not erased here, because nothing holds them per document: Redis keys are
 * per user or per intake with short TTLs (`intake:*`), and exports are made on
 * request and never stored. No Ink is refunded.
 *
 * Logs hold ids, the collection name, `err.name` and counts only. Never a
 * field value, a title or content, and nothing is sent to Sentry.
 */
import mongoose, { Types } from 'mongoose';

import logger from '../config/logger';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { FactDiff } from '../models/FactDiff.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { ReviewFeedback } from '../models/ReviewFeedback.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { TemplateUsage } from '../models/TemplateUsage.model';
import { UsageLog } from '../models/UsageLog.model';

import { deleteFactDiffsFor } from './fact-diff-log';

export type EraseCollection =
  | 'links'
  | 'reviewfeedbacks'
  | 'reviewtokens'
  | 'factdiffs'
  | 'factledgers'
  | 'llmauxcalls'
  | 'generations'
  | 'usagelogs'
  | 'templateusages'
  | 'events'
  | 'documents';

export interface EraseResult {
  /** True only when every step finished and the document row is gone. */
  done: boolean;
  /** Rows removed (or unlinked, for the kept collections) per collection in this run. */
  counts: Partial<Record<EraseCollection, number>>;
  /** The collection whose step failed, when `done` is false. */
  failedAt?: EraseCollection;
}

interface Links {
  intakeIds: string[];
  ledgerIds: Types.ObjectId[];
}

function unique<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) seen.set(key(item), item);
  return [...seen.values()];
}

/**
 * Step 1. Reads the links still present, adds them to the ones already saved
 * on the marker ($addToSet), and returns the full set. Null when the document
 * row is already gone (a finished erase).
 */
async function saveLinks(docId: Types.ObjectId): Promise<Links | null> {
  const current = await LawieDocument.findOne({
    _id: docId,
    'deletion.requestedAt': { $exists: true },
  })
    .select('deletion')
    .lean();
  if (!current) return null;

  const intakeFound = (await Generation.distinct('intakeId', { documentId: docId })).filter(
    (v): v is string => typeof v === 'string' && v !== '',
  );
  const intakeIds = unique([...(current.deletion?.intakeIds ?? []), ...intakeFound], (v) => v);
  const ledgerFromDiffs = (await FactDiff.distinct('ledgerId', { documentId: docId })).filter(
    (v): v is Types.ObjectId => v instanceof Types.ObjectId,
  );
  const ledgerFromIntakes =
    intakeIds.length === 0
      ? []
      : (
          await FactLedgerModel.find({ intakeId: { $in: intakeIds } })
            .select('_id')
            .lean()
        ).map((l) => l._id as Types.ObjectId);
  const ledgerIds = unique(
    [...(current.deletion?.ledgerIds ?? []), ...ledgerFromDiffs, ...ledgerFromIntakes],
    (v) => String(v),
  );

  await LawieDocument.updateOne(
    { _id: docId, 'deletion.requestedAt': { $exists: true } },
    {
      $addToSet: {
        'deletion.intakeIds': { $each: intakeIds },
        'deletion.ledgerIds': { $each: ledgerIds },
      },
    },
  );
  return { intakeIds, ledgerIds };
}

/** The saved links minus anything another document still reaches. Read-only. */
async function erasableLinks(docId: Types.ObjectId, links: Links): Promise<Links> {
  const otherDoc = { $nin: [null, docId] };
  const sharedIntakes = new Set(
    links.intakeIds.length === 0
      ? []
      : (
          await Generation.distinct('intakeId', {
            intakeId: { $in: links.intakeIds },
            documentId: otherDoc,
          })
        ).map(String),
  );
  const sharedLedgers = new Set(
    links.ledgerIds.length === 0
      ? []
      : (
          await FactDiff.distinct('ledgerId', {
            ledgerId: { $in: links.ledgerIds },
            documentId: otherDoc,
          })
        ).map(String),
  );
  const ledgerRows =
    links.ledgerIds.length === 0
      ? []
      : await FactLedgerModel.find({ _id: { $in: links.ledgerIds } })
          .select('_id intakeId')
          .lean();
  for (const l of ledgerRows) {
    if (l.intakeId && sharedIntakes.has(l.intakeId)) sharedLedgers.add(String(l._id));
  }
  return {
    intakeIds: links.intakeIds.filter((id) => !sharedIntakes.has(id)),
    ledgerIds: links.ledgerIds.filter((id) => !sharedLedgers.has(String(id))),
  };
}

/**
 * Runs every erase step for one document that has the delete marker. Never
 * throws: a failed step stops the run (the document row stays, still hidden)
 * and is reported in the result. Safe to run again, and safe to run at the
 * same time as another run for the same document.
 */
export async function eraseDocument(documentId: string): Promise<EraseResult> {
  const counts: EraseResult['counts'] = {};
  if (!mongoose.isValidObjectId(documentId)) return { done: true, counts };
  const docId = new Types.ObjectId(documentId);
  let step: EraseCollection = 'links';

  try {
    const saved = await saveLinks(docId);
    if (saved === null) return { done: true, counts };
    const { intakeIds, ledgerIds } = await erasableLinks(docId, saved);

    step = 'reviewfeedbacks';
    counts.reviewfeedbacks = (await ReviewFeedback.deleteMany({ documentId: docId })).deletedCount;

    step = 'reviewtokens';
    counts.reviewtokens = (await ReviewToken.deleteMany({ documentId: docId })).deletedCount;

    step = 'factdiffs';
    let diffs = await deleteFactDiffsFor({ documentId });
    for (const ledgerId of ledgerIds) {
      diffs += await deleteFactDiffsFor({ ledgerId: String(ledgerId) });
    }
    counts.factdiffs = diffs;

    step = 'factledgers';
    counts.factledgers =
      ledgerIds.length === 0
        ? 0
        : (await FactLedgerModel.deleteMany({ _id: { $in: ledgerIds } })).deletedCount;

    step = 'llmauxcalls';
    counts.llmauxcalls =
      intakeIds.length === 0
        ? 0
        : (await LlmAuxCall.deleteMany({ intakeId: { $in: intakeIds } })).deletedCount;

    step = 'generations';
    counts.generations = (
      await Generation.updateMany({ documentId: docId }, { $unset: { documentId: 1 } })
    ).modifiedCount;

    step = 'usagelogs';
    counts.usagelogs = (
      await UsageLog.updateMany({ documentId: docId }, { $unset: { documentId: 1 } })
    ).modifiedCount;

    step = 'templateusages';
    counts.templateusages = (
      await TemplateUsage.updateMany({ documentId: docId }, { $unset: { documentId: 1 } })
    ).modifiedCount;

    step = 'events';
    counts.events = (await Event.updateMany({ docId }, { $unset: { docId: 1 } })).modifiedCount;

    step = 'documents';
    counts.documents = (
      await LawieDocument.deleteOne({ _id: docId, 'deletion.requestedAt': { $exists: true } })
    ).deletedCount;
  } catch (err) {
    logger.warn(
      {
        documentId,
        collection: step,
        errName: err instanceof Error ? err.name : 'UnknownError',
        counts,
      },
      'Document erase step failed; the sweep will retry',
    );
    return { done: false, counts, failedAt: step };
  }

  logger.info({ documentId, counts }, 'Document erased');
  return { done: true, counts };
}

// ── The sweep ───────────────────────────────────────────────────────────────

/** How often the sweep runs (startDocumentEraseSweep's default). */
export const DOCUMENT_ERASE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** Documents finished per sweep run, oldest request first. */
export const DOCUMENT_ERASE_SWEEP_BATCH = 50;

export interface EraseSweepCounts {
  found: number;
  finished: number;
  pending: number;
}

/** One sweep run: re-runs the erase for every document that still has the marker. */
export async function runDocumentEraseSweep(): Promise<EraseSweepCounts> {
  const docs = await LawieDocument.find({ 'deletion.requestedAt': { $exists: true } })
    .select('_id')
    .sort({ 'deletion.requestedAt': 1 })
    .limit(DOCUMENT_ERASE_SWEEP_BATCH)
    .lean();
  const counts: EraseSweepCounts = { found: docs.length, finished: 0, pending: 0 };
  for (const doc of docs) {
    const result = await eraseDocument(String(doc._id));
    if (result.done) counts.finished += 1;
    else counts.pending += 1;
  }
  if (counts.found > 0) logger.info(counts, 'Document erase sweep');
  return counts;
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

function sweepTick(): void {
  if (sweepRunning) return;
  sweepRunning = true;
  runDocumentEraseSweep()
    .catch((err: unknown) => {
      logger.warn(
        { errName: err instanceof Error ? err.name : 'UnknownError' },
        'Document erase sweep failed',
      );
    })
    .finally(() => {
      sweepRunning = false;
    });
}

/**
 * Start the sweep: one run now (so an erase cut off by a crash or restart is
 * finished at boot), then every `intervalMs`. Started where the service boots
 * (index.ts), never from app.ts, which the tests import. The timer is unref'd
 * so it never keeps the process alive. A second call is a no-op; a run still
 * going when the next tick fires is not overlapped.
 */
export function startDocumentEraseSweep(
  intervalMs: number = DOCUMENT_ERASE_SWEEP_INTERVAL_MS,
): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepTick, intervalMs);
  sweepTimer.unref();
  sweepTick();
}

/** Stop the sweep. Safe to call when it is not running. */
export function stopDocumentEraseSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}
