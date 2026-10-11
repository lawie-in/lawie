/**
 * T-147e — fixture isolation (ADR-022, release-blocking).
 *
 * There is no separate dev database: a golden-set run writes to production.
 * Every row such a run writes carries `runType: 'fixture'` (on `Generation`,
 * whose `runType` is already `initial | revision` since T-110, the same
 * marker is `runOrigin: 'fixture'`), and every user-facing list, analytics
 * aggregation and usage or billing counter filters it out.
 *
 * What makes a run a fixture run is the user it runs as, and nothing the
 * request says: the golden-set runner acts as the one reserved user below. A
 * request cannot ask to be a fixture run, so a real user can never hide a
 * draft from billing or from the lists by sending a flag.
 *
 * The reserved id has a zero timestamp, so `new ObjectId()` can never produce
 * it, and the auth service never issues it. The gateway sets the user id from
 * a verified JWT; only a caller holding the internal secret can act as it.
 * The fixture user has no `users` row: no balance, no plan, nothing in any
 * user count.
 */
import type { Schema } from 'mongoose';

export const RUN_ORIGINS = ['user', 'fixture'] as const;
export type RunOrigin = (typeof RUN_ORIGINS)[number];

/** The golden-set fixture user (T-147e). Never a real account. */
export const GOLDEN_SET_USER_ID = '0000000000000000000f147e';

export function isFixtureUser(userId: unknown): boolean {
  if (userId === null || userId === undefined) return false;
  return String(userId).toLowerCase() === GOLDEN_SET_USER_ID;
}

export function runOriginFor(userId: unknown): RunOrigin {
  return isFixtureUser(userId) ? 'fixture' : 'user';
}

/**
 * Filter for `Document`, `LlmAuxCall`, `Event` and `FactLedger`: everything
 * but fixture rows. `$ne` so that rows written before T-147e (no field) stay in.
 */
export const NOT_FIXTURE = Object.freeze({ runType: { $ne: 'fixture' } });

/** The same filter for `Generation`, whose marker is `runOrigin`. */
export const NOT_FIXTURE_GENERATION = Object.freeze({ runOrigin: { $ne: 'fixture' } });

/**
 * Schema plugin: a row written for the fixture user is marked `fixture`
 * before validation, whatever the writer passed. It never turns a row into a
 * `user` row: a row explicitly written as `fixture` stays one (tests do this).
 * Runs on `create()` and `save()`. Every write path for these models uses one
 * of the two; `insertMany` and raw collection writes do not run it.
 */
export function fixtureOriginPlugin(field: 'runType' | 'runOrigin') {
  return (schema: Schema): void => {
    schema.pre('validate', function markFixture(next) {
      const doc = this as unknown as Record<string, unknown> & { set(path: string, v: unknown): void };
      if (isFixtureUser(doc.userId)) doc.set(field, 'fixture');
      next();
    });
  };
}
