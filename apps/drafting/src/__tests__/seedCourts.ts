/**
 * T-686 — shared fixture: an active Court row for each court id a route test picks.
 * An id-shaped court that has no active row now stops the run (503 court_unavailable), so a
 * route test that picks one seeds it. The row is the real one from indian-courts.json when the
 * id is there; an unknown id (e.g. `test_court`) gets a generic sessions row. Tests only.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { Court } from '../models/Court.model';

interface CourtSeed {
  courtId: string;
  name: string;
  designation: string;
  courtType: string;
  state: string;
  stateId: string;
  city: string;
  formattingRulesRef: string;
  caseNomenclature?: string;
  supportedLanguages?: string[];
}

let catalogue: CourtSeed[] | undefined;
function realCourts(): CourtSeed[] {
  if (!catalogue) {
    const raw = JSON.parse(
      readFileSync(join(__dirname, '..', 'config', 'courts', 'indian-courts.json'), 'utf-8'),
    );
    catalogue = (Array.isArray(raw) ? raw : raw.courts) as CourtSeed[];
  }
  return catalogue;
}

export async function createActiveCourt(courtId: string, overrides: Record<string, unknown> = {}) {
  const real = realCourts().find((c) => c.courtId === courtId);
  const base: CourtSeed = real ?? {
    courtId,
    name: 'District & Sessions Court, Patna',
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    courtType: 'sessions',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  };
  await Court.deleteOne({ courtId });
  return Court.create({ ...base, isActive: true, ...overrides });
}

/** Seed an active Court row for each id before every test (setupDb wipes collections after each). */
export function seedCourts(...courtIds: string[]): void {
  beforeEach(async () => {
    for (const id of courtIds) await createActiveCourt(id);
  });
}
