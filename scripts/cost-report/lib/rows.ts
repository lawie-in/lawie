/**
 * T-453 cost report — the read projections and raw-document -> row
 * normalisation. Pure. The projections are inclusive lists of ids, numbers,
 * statuses and times: no field holding user text is ever selected.
 */
import { AuxRow, GenerationRow, TokenCounts } from './types';

const TOKEN_FIELDS = {
  inputTokens: 1,
  outputTokens: 1,
  cacheCreationInputTokens: 1,
  cacheReadInputTokens: 1,
  cacheCreation5mInputTokens: 1,
} as const;

/** Collection names as Mongoose pluralises them / as set on the model. */
export const COLLECTIONS = {
  generation: 'generations',
  aux: 'llmauxcalls',
  settings: 'appsettings',
} as const;

export const PROJECTIONS = {
  generation: {
    _id: 1,
    userId: 1,
    documentId: 1,
    intakeId: 1,
    runId: 1,
    runSequence: 1,
    runType: 1,
    runOrigin: 1,
    status: 1,
    docType: 1,
    aiModel: 1,
    costUsd: 1,
    costStatus: 1,
    createdAt: 1,
    ...TOKEN_FIELDS,
  },
  aux: {
    _id: 1,
    userId: 1,
    intakeId: 1,
    purpose: 1,
    status: 1,
    aiModel: 1,
    costUsd: 1,
    costStatus: 1,
    runType: 1,
    createdAt: 1,
    ...TOKEN_FIELDS,
  },
  settings: { _id: 0, key: 1, value: 1 },
} as const;

type Raw = Record<string, unknown>;

function idOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && typeof (v as { toHexString?: unknown }).toHexString === 'function') {
    return (v as { toHexString(): string }).toHexString();
  }
  return String(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function tokens(d: Raw): TokenCounts {
  return {
    inputTokens: num(d.inputTokens),
    outputTokens: num(d.outputTokens),
    cacheCreationInputTokens: num(d.cacheCreationInputTokens),
    cacheReadInputTokens: num(d.cacheReadInputTokens),
    cacheCreation5mInputTokens: num(d.cacheCreation5mInputTokens),
  };
}

export function toGenerationRow(d: Raw): GenerationRow {
  return {
    id: idOf(d._id) ?? '',
    userId: idOf(d.userId),
    documentId: idOf(d.documentId),
    intakeId: str(d.intakeId),
    runId: str(d.runId),
    runSequence: numOrNull(d.runSequence),
    runType: str(d.runType),
    runOrigin: str(d.runOrigin),
    status: str(d.status),
    docType: str(d.docType),
    aiModel: str(d.aiModel),
    costUsd: numOrNull(d.costUsd),
    costStatus: str(d.costStatus),
    createdAt: dateOf(d.createdAt),
    ...tokens(d),
  };
}

export function toAuxRow(d: Raw): AuxRow {
  return {
    id: idOf(d._id) ?? '',
    userId: idOf(d.userId),
    intakeId: str(d.intakeId),
    purpose: str(d.purpose),
    status: str(d.status),
    aiModel: str(d.aiModel),
    costUsd: numOrNull(d.costUsd),
    costStatus: str(d.costStatus),
    runType: str(d.runType),
    createdAt: dateOf(d.createdAt),
    ...tokens(d),
  };
}
