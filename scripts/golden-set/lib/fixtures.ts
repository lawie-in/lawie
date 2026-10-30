/**
 * T-147e — loading and checking the fixture files. Pure apart from reading
 * the fixtures directory.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { Fixture, REVIEW_STATUS, SEEDED_PACKS } from './types';

export const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

export class FixtureFileError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = 'FixtureFileError';
  }
}

const ID = /^[0-9a-z][0-9a-z-]*$/;

/** The problems with one fixture, in plain words. Empty when it is well-formed. */
export function checkFixture(f: Partial<Fixture>): string[] {
  const problems: string[] = [];
  const need = (cond: boolean, msg: string) => {
    if (!cond) problems.push(msg);
  };
  need(
    typeof f.id === 'string' && ID.test(f.id),
    'id must be lower-case letters, digits and dashes',
  );
  need(typeof f.pack === 'string' && /^[a-z0-9_]+$/.test(f.pack), 'pack must be a rule-pack id');
  need(typeof f.title === 'string' && f.title.length > 0, 'title is required');
  need(
    typeof f.risk === 'string' && f.risk.length >= 10,
    'risk must name the failure or risk covered',
  );
  need(typeof f.source === 'string' && f.source.length > 0, 'source is required');
  need(f.review === REVIEW_STATUS, `review must read "${REVIEW_STATUS}"`);
  need(f.ajay === null || typeof f.ajay === 'string', 'ajay must be null or a reason');
  need(
    typeof f.description === 'string' && f.description.length >= 20,
    'description of at least 20 characters',
  );
  need(
    f.court === null ||
      (typeof f.court === 'object' &&
        typeof f.court?.court === 'string' &&
        typeof f.court?.state === 'string' &&
        typeof f.court?.court_type === 'string'),
    'court must be null or { state, court_type, court }',
  );
  const e = f.expect;
  need(typeof e === 'object' && e !== null, 'expect is required');
  if (e) {
    const count =
      (e.not_written?.length ?? 0) +
      (e.absent?.length ?? 0) +
      (e.present?.length ?? 0) +
      (e.exact?.length ?? 0) +
      (e.ledger?.length ?? 0);
    need(count > 0, 'expect must hold at least one explicit expectation');
    for (const t of [...(e.absent ?? []), ...(e.present ?? []), ...(e.exact ?? [])]) {
      need(
        Array.isArray(t.any_of) &&
          t.any_of.length > 0 &&
          t.any_of.every((s) => typeof s === 'string' && s.length > 0),
        'every text expectation needs a non-empty any_of',
      );
      need(typeof t.why === 'string' && t.why.length > 0, 'every expectation needs a why');
    }
    for (const l of e.ledger ?? []) {
      need(typeof l.key === 'string', 'ledger expectation needs a key');
      need(
        (l.display !== undefined) !== (l.unresolved === true),
        `ledger ${l.key}: give display or unresolved: true, not both`,
      );
    }
  }
  for (const [variant, r] of Object.entries(f.recorded ?? {})) {
    // T-683: extract is one reply (every call) or a non-empty list (one per call).
    const extractOk =
      typeof r.extract === 'string' ||
      (Array.isArray(r.extract) &&
        r.extract.length > 0 &&
        r.extract.every((x: unknown) => typeof x === 'string'));
    need(
      typeof r.reception === 'string' && extractOk && typeof r.drafter === 'string',
      `recorded.${variant} needs reception, extract and drafter replies`,
    );
  }
  return problems;
}

/** Every fixture file, sorted by id. Throws FixtureFileError on a malformed file or a duplicate id. */
export function loadFixtures(dir: string = FIXTURES_DIR): Fixture[] {
  const out: Fixture[] = [];
  const seen = new Set<string>();
  for (const file of readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    let parsed: Fixture;
    try {
      parsed = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as Fixture;
    } catch (err) {
      throw new FixtureFileError(file, `is not valid JSON (${(err as Error).message})`);
    }
    const problems = checkFixture(parsed);
    if (problems.length > 0) throw new FixtureFileError(file, problems.join('; '));
    if (seen.has(parsed.id)) throw new FixtureFileError(file, `duplicate id ${parsed.id}`);
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

/** AC3: at least 15 fixtures across the five seeded packs, each pack used. */
export function checkComposition(fixtures: Fixture[]): string[] {
  const problems: string[] = [];
  const onSeeded = fixtures.filter((f) => (SEEDED_PACKS as readonly string[]).includes(f.pack));
  if (onSeeded.length < 15) {
    problems.push(`${onSeeded.length} fixtures on the five seeded packs; at least 15 are needed`);
  }
  for (const pack of SEEDED_PACKS) {
    if (!fixtures.some((f) => f.pack === pack)) problems.push(`no fixture for ${pack}`);
  }
  return problems;
}

/** The fixtures picked by `--only a,b` (ids or id prefixes). All when none given. */
export function selectFixtures(all: Fixture[], only: string[] | null): Fixture[] {
  if (!only || only.length === 0) return all;
  return all.filter((f) => only.some((o) => f.id === o || f.id.startsWith(`${o}-`)));
}
