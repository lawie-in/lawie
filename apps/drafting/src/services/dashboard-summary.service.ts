/**
 * T-506 — dashboard summary for one signed-in user, current IST month.
 *
 * Each product decision lives in one constant or filter below so it is easy
 * to change:
 *   - ownDocumentFilter: the user's Documents, not deleted, not fixture
 *   - monthDocumentFilter: ownDocumentFilter + IST month (draftsThisMonth, byType)
 *   - statusCounts use ownDocumentFilter: ALL-TIME, not month-scoped (Priya, 17 Oct 2026)
 *   - INK_USAGE_REASONS / INK_UNITS_PER_INK: what counts as Ink spent and how it displays
 *     (no flooring: half an Ink shows as .5)
 *   - failedGenerationFilter: every failed attempt this month counts, retries included
 */
import mongoose from 'mongoose';

import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';

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

  const [draftsThisMonth, byTypeRows, statusRows, inkRows, failedCount] = await Promise.all([
    LawieDocument.countDocuments(monthDocumentFilter),
    LawieDocument.aggregate<GroupRow>([
      { $match: monthDocumentFilter },
      { $group: { _id: '$docType', n: { $sum: 1 } } },
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
    statusCounts,
    inkUsedThisMonth: inkUsed,
    inkUsed,
    inkUsedHalfUnits,
    failedCount,
  };
}
