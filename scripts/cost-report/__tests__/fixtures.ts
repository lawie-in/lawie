import { AuxRow, GenerationRow, RateTable } from '../lib/types';

export const RATES: RateTable = {
  'claude-x': {
    inputUsdPerMTok: 3,
    outputUsdPerMTok: 15,
    cacheWriteUsdPerMTok: 6,
    cacheReadUsdPerMTok: 0.3,
  },
};

export const U1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
export const U2 = 'aaaaaaaaaaaaaaaaaaaaaaa2';

let n = 0;
const at = (m: number): Date => new Date(Date.UTC(2026, 9, 15, 5, m));

export function gen(p: Partial<GenerationRow> = {}): GenerationRow {
  n += 1;
  return {
    id: `g${n}`,
    userId: U1,
    documentId: null,
    intakeId: null,
    runId: null,
    runSequence: null,
    runType: 'initial',
    runOrigin: 'user',
    status: 'success',
    docType: 'bail',
    aiModel: 'claude-x',
    costUsd: 0.1,
    costStatus: 'priced',
    createdAt: at(n),
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    ...p,
  };
}

export function aux(p: Partial<AuxRow> = {}): AuxRow {
  n += 1;
  return {
    id: `a${n}`,
    userId: U1,
    intakeId: null,
    purpose: 'intake_extract',
    status: 'success',
    aiModel: 'claude-x',
    costUsd: 0.01,
    costStatus: 'priced',
    runType: 'user',
    createdAt: at(n),
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    ...p,
  };
}

export const WIN = {
  label: 'w1',
  start: new Date('2026-10-15T00:00:00Z'),
  end: new Date('2026-10-16T00:00:00Z'),
};
