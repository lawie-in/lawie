/**
 * T-506 — dashboard summary for one signed-in user, current IST month.
 *
 * Each product decision lives in one constant or filter below so it is easy
 * to change:
 *   - ownDocumentFilter: the user's Documents, not deleted, not fixture
 *   - monthDocumentFilter: ownDocumentFilter + IST month (draftsThisMonth, byType,
 *     byTypeLabelled)
 *   - statusCounts use ownDocumentFilter: ALL-TIME, not month-scoped (Priya, 17 Oct 2026)
 *   - INK_USAGE_REASONS / INK_UNITS_PER_INK: what counts as Ink spent and how it displays
 *     (no flooring: half an Ink shows as .5)
 *   - failedGenerationFilter: every failed attempt this month counts, retries included
 */
import mongoose from 'mongoose';

import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';

import { docTypeLabelForPackId, humaniseDocType } from './doc-type-label';
import { istMonthBounds } from './ist-month';
import { NOT_FIXTURE, NOT_FIXTURE_GENERATION } from './run-origin';

/** inkledger reasons that count as usage (matches billing INK_USAGE_REASONS). */
export const INK_USAGE_REASONS = ['generate', 'regenerate'] as const;
/** inkledger stores 2 units per displayed Ink. */
export const INK_UNITS_PER_INK = 2;
const INK_LEDGER_COLLECTION = 'inkledger';

export interface DashboardSummary {
  month: string;
  draftsThisMonth: number;
  byType: Record<string, number>;
  /**
   * T-689b: the same month's documents by their screen label (the pack's name, else
   * the humanised docType), so a written statement is not counted as "petition".
   * Rows with the same label are merged; sorted by n desc, then label.
   */
  byTypeLabelled: Array<{ key: string; label: string; n: number }>;
  statusCounts: { draft: number; finalised: number; exported: number };
  /** Ink used this IST month (= inkUsedHalfUnits / 2, may end in .5). */
  inkUsed: number;
  /** Ticket T-506 field name; always equal to inkUsed. */
  inkUsedThisMonth: number;
  /** Raw inkledger units spent this IST month (1 Ink = 2 units), never negative. */
  inkUsedHalfUnits: number;
  failedCount: number;
}

interface GroupRow {
  _id: string | null;
  n: number;
}

interface TypePackRow {
  _id: { docType?: string | null; rulePackId?: string | null } | null;
  n: number;
}

/**
 * T-689b: byType by screen label. A row's label is the pack's name for its
 * rulePackId (one lookup per distinct id; the loader caches packs), else the
 * humanised docType; a pack that fails to load falls back and never throws. A row
 * with no docType is left out, as byType leaves it out, so the counts add up to
 * byType's. Rows with the same label merge; the merged row's key is the smallest of
 * its rows' keys (a row's key is its rulePackId when labelled from the pack, else its
 * docType), so it does not depend on aggregate order.
 */
export function labelTypeRows(
  rows: TypePackRow[],
  labelForPackId: (id: unknown) => string | null = docTypeLabelForPackId,
): Array<{ key: string; label: string; n: number }> {
  const packLabels = new Map<string, string | null>();
  const byLabel = new Map<string, { key: string; label: string; n: number }>();
  for (const row of rows) {
    const docType = row._id?.docType;
    if (typeof docType !== 'string' || docType === '' || !(row.n > 0)) continue;
    const packId = row._id?.rulePackId;
    let packLabel: string | null = null;
    if (typeof packId === 'string' && packId !== '') {
      if (!packLabels.has(packId)) packLabels.set(packId, labelForPackId(packId));
      packLabel = packLabels.get(packId) ?? null;
    }
    const label = packLabel ?? humaniseDocType(docType);
    const key = packLabel !== null ? (packId as string) : docType;
    const seen = byLabel.get(label);
    if (seen) {
      seen.n += row.n;
      if (key < seen.key) seen.key = key;
    } else {
      byLabel.set(label, { key, label, n: row.n });
    }
  }
  return [...byLabel.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

export async function getDashboardSummary(
  userId: string,
  now: Date = new Date(),
): Promise<DashboardSummary> {
  const { start, end, month } = istMonthBounds(now);
  const uid = new mongoose.Types.ObjectId(userId);
  const window = { $gte: start, $lt: end };

  const ownDocumentFilter = {
    userId: uid,
    isDeleted: { $ne: true },
    ...NOT_FIXTURE,
  };
  const monthDocumentFilter = { ...ownDocumentFilter, createdAt: window };

  const failedGenerationFilter = {
    userId: uid,
    status: 'failed',
    ...NOT_FIXTURE_GENERATION,
    createdAt: window,
  };

  const db = mongoose.connection.db;

  const [draftsThisMonth, byTypeRows, typePackRows, statusRows, inkRows, failedCount] =
    await Promise.all([
      LawieDocument.countDocuments(monthDocumentFilter),
      LawieDocument.aggregate<GroupRow>([
        { $match: monthDocumentFilter },
        { $group: { _id: '$docType', n: { $sum: 1 } } },
      ]),
      LawieDocument.aggregate<TypePackRow>([
        { $match: monthDocumentFilter },
        {
          $group: {
            _id: { docType: '$docType', rulePackId: '$rulePackId' },
            n: { $sum: 1 },
          },
        },
      ]),
      LawieDocument.aggregate<GroupRow>([
        { $match: ownDocumentFilter },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      db
        ? db
            .collection(INK_LEDGER_COLLECTION)
            .aggregate<{ _id: null; total: number }>([
              {
                $match: {
                  userId: uid,
                  reason: { $in: [...INK_USAGE_REASONS] },
                  createdAt: window,
                },
              },
              { $group: { _id: null, total: { $sum: '$delta' } } },
            ])
            .toArray()
        : Promise.resolve([] as { _id: null; total: number }[]),
      Generation.countDocuments(failedGenerationFilter),
    ]);

  const byType: Record<string, number> = {};
  for (const row of byTypeRows) {
    if (row._id && row.n > 0) byType[row._id] = row.n;
  }
  const byTypeLabelled = labelTypeRows(typePackRows);

  const statusCounts = { draft: 0, finalised: 0, exported: 0 };
  for (const row of statusRows) {
    if (row._id === 'draft' || row._id === 'finalised' || row._id === 'exported') {
      statusCounts[row._id] = row.n;
    }
  }

  // Spends are negative deltas; never report a negative usage.
  const inkSum = inkRows[0]?.total ?? 0;
  const inkUsedHalfUnits = Math.max(0, -inkSum);
  const inkUsed = inkUsedHalfUnits / INK_UNITS_PER_INK;

  return {
    month,
    draftsThisMonth,
    byType,
    byTypeLabelled,
    statusCounts,
    inkUsedThisMonth: inkUsed,
    inkUsed,
    inkUsedHalfUnits,
    failedCount,
  };
}
