/**
 * T-522 — shared fixture: a drafting user the requireVerifiedEmail fence lets through.
 * Tests only; no bypass exists in source. A test that needs an unverified user passes
 * `emailVerified: false` (the override wins) or uses User.create directly.
 */
import { User } from '../models/User.model';

export async function createVerifiedUser(doc: Record<string, unknown> = {}) {
  // A test that seeds ids in beforeEach (seedVerifiedUsers) may also create the same user itself
  // with other fields; the later call replaces the seeded row.
  if (doc._id !== undefined) await User.deleteOne({ _id: doc._id });
  return User.create({ emailVerified: true, ...doc });
}

/** Seed verified users with fixed ids before every test (setupDb wipes collections after each). */
export function seedVerifiedUsers(...ids: string[]): void {
  beforeEach(async () => {
    for (const id of ids) await createVerifiedUser({ _id: id });
  });
}
