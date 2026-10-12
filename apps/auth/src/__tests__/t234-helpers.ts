import mongoose from 'mongoose';

import { ReferralCode } from '../models/ReferralCode.model';

/** Poll until `fn` returns truthy (the signup seed is fired with `void`, so it lands later). */
export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 5000) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() - start > ms) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

export function rawUsers() {
  return mongoose.connection.db!.collection('users');
}

export function ledger() {
  return mongoose.connection.db!.collection('inkledger');
}

export async function makeCode(
  opts: {
    code?: string;
    bonusInk?: number;
    expiresAt?: Date | null;
    maxUses?: number | null;
    uses?: number;
  } = {},
) {
  return ReferralCode.create({
    code: opts.code ?? 'TESTCODE1',
    createdBy: new mongoose.Types.ObjectId(),
    maxUses: opts.maxUses ?? null,
    bonusInk: opts.bonusInk ?? 3,
    expiresAt: opts.expiresAt ?? null,
    uses: opts.uses ?? 0,
  });
}

/** Wait for the fire-and-forget signup seed (both the users write and its ledger row). */
export async function waitForSeed(userId: unknown) {
  await waitFor(async () => ledger().findOne({ userId, reason: 'free_seed' }));
}
