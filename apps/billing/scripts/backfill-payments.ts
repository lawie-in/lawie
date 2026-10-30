/**
 * T-646 (Vikram 6): one-off backfill of the payment history from Razorpay.
 * Runs on prod ONLY, by Arjun / Nikhil. Never run it from a dev seat.
 *
 *   ts-node --transpile-only apps/billing/scripts/backfill-payments.ts            # dry run (default)
 *   ts-node --transpile-only apps/billing/scripts/backfill-payments.ts --apply    # writes
 *
 * Scope (Vikram 6):
 * - Paid and refunded payments only, from prod go-live (BACKFILL_FROM, 23 Oct 2026 IST).
 *   Razorpay statuses 'captured' and 'refunded'. Failed / authorized / created are NOT
 *   backfilled: those rows start at deploy, from the webhook.
 * - The pre-Ink 15 Jun test payment is before the window and so is never touched.
 *
 * Plan Ink (Arjun, 30 Oct): only what the ink ledger confirms that cycle granted
 * (confirmedPlanGrantUnits); an unconfirmed plan payment is written with inkUnits 0.
 *
 * Attribution, per payment (the same resolver the webhook uses):
 *   the existing Payment row; notes (user_id + sku_id); the POST /topup/order row;
 *   the T-413 top-up claim `topup:<order_id>` in inkledger; else, for a subscription charge,
 *   Razorpay invoice -> subscription_id -> the local Subscription row (user, plan).
 *   An unattributable payment is counted and listed by id, never written.
 *
 * Writes go through upsertPaymentFromEntity (source 'backfill'): idempotent on the payment
 * id, statuses only move forward, so a second run, or a run after the webhook already
 * recorded a payment, changes nothing it should not.
 *
 * It does NOT reverse Ink for refunds that happened before deploy (that is the webhook's job
 * from deploy on). Past refunds whose Ink was kept are listed with their payment id for
 * support to decide (Vikram 5: the founder's 25 Oct test refund kept its Ink).
 *
 * Reads Razorpay with GET only. Prints payment ids and counts only; never a name, email,
 * note or amount. Exit codes: 0 done, 1 failed, 2 usage/config.
 */
/* eslint-disable import/order, import/first, no-console */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// apps/billing/scripts -> repo root.
const repoRoot = join(__dirname, '..', '..', '..');
for (const candidate of [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env']) {
  const p = join(repoRoot, candidate);
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}

import mongoose from 'mongoose';

import { findPlanByRazorpayId, findSubscriptionPlan } from '../src/config/credit-skus';
import { env } from '../src/config/env';
import { razorpay } from '../src/config/razorpay';
import { Payment } from '../src/models/Payment.model';
import { Subscription } from '../src/models/Subscription.model';
import { fromUnix } from '../src/services/invoice.service';
import {
  confirmedPlanGrantUnits,
  type PaymentContext,
  resolvePaymentContext,
  upsertPaymentFromEntity,
} from '../src/services/payment-record.service';
/* eslint-enable import/order, import/first */

const USAGE = 'Usage: backfill-payments.ts [--dry-run | --apply]';

/** Prod go-live, 23 Oct 2026 00:00 IST (Vikram 6). */
export const BACKFILL_FROM = new Date('2026-10-22T18:30:00.000Z');
const PAGE = 100;

/** Scheme, host(s) and database of a Mongo URI; never credentials or query. gitleaks:allow */
function redactMongoUri(uri: string): string {
  const scheme = /^[a-z+]+:\/\//i.exec(uri)?.[0];
  if (!scheme) return '(unparseable MONGO_URI)';
  const rest = uri.slice(scheme.length);
  const afterCreds = rest.slice(rest.lastIndexOf('@') + 1);
  return scheme + afterCreds.split('?')[0];
}

type Entity = Record<string, unknown>;

async function listPayments(fromSec: number, toSec: number): Promise<Entity[]> {
  const out: Entity[] = [];
  for (let skip = 0; ; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = (await (razorpay.payments.all as any)({
      from: fromSec,
      to: toSec,
      count: PAGE,
      skip,
    })) as { items?: Entity[] };
    const items = page.items ?? [];
    out.push(...items);
    if (items.length < PAGE) break;
  }
  return out;
}

/** A subscription charge: Razorpay invoice -> subscription -> local row. */
async function subscriptionContext(entity: Entity): Promise<PaymentContext | null> {
  const invoiceId = typeof entity.invoice_id === 'string' ? entity.invoice_id : '';
  if (!invoiceId) return null;
  let subId = '';
  try {
    const inv = (await razorpay.invoices.fetch(invoiceId)) as unknown as Entity;
    subId = typeof inv.subscription_id === 'string' ? inv.subscription_id : '';
  } catch {
    return null;
  }
  if (!subId) return null;
  const sub = await Subscription.findOne({ razorpaySubscriptionId: subId }).lean();
  if (!sub) return null;
  const plan =
    (sub.planId ? findSubscriptionPlan(sub.planId) : undefined) ??
    findPlanByRazorpayId(String((sub as unknown as Entity).razorpayPlanId ?? ''));
  // T-646 (Arjun, 30 Oct, (b)/(d)): the Ink is what the ledger confirms this cycle granted
  // (the sub_renewal row for this user and subscription at the payment's time), never the
  // subscription's current plan. Unconfirmed: 0, so no "+N Ink" is shown. The plan id is a
  // label only.
  const createdAt = fromUnix(entity.created_at, new Date(Number.NaN));
  const confirmed = await confirmedPlanGrantUnits({
    userId: String(sub.userId),
    razorpaySubscriptionId: subId,
    paymentCreatedAt: createdAt,
  });
  return {
    userId: String(sub.userId),
    kind: 'plan',
    inkUnits: confirmed ?? 0,
    razorpaySubscriptionId: subId,
    ...(plan ? { planId: plan.id } : {}),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const unknown = args.filter((a) => a !== '--apply' && a !== '--dry-run');
  if (unknown.length > 0 || (apply && args.includes('--dry-run'))) {
    console.error(USAGE);
    process.exit(2);
  }

  const target = redactMongoUri(env.MONGO_URI);
  console.log(apply ? `--apply: WRITING to ${target}` : `dry run against ${target} (no writes)`);
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });

  const fromSec = Math.floor(BACKFILL_FROM.getTime() / 1000);
  const toSec = Math.floor(Date.now() / 1000);
  const all = await listPayments(fromSec, toSec);
  const inScope = all.filter((p) => p.status === 'captured' || p.status === 'refunded');

  const counts = {
    listed: all.length,
    inScope: inScope.length,
    written: 0,
    already: 0,
    unattributed: 0,
  };
  const unattributed: string[] = [];
  const refundedKeptInk: string[] = [];

  // Oldest first, so createdAt order is natural in the log.
  inScope.sort((a, b) => Number(a.created_at ?? 0) - Number(b.created_at ?? 0));
  for (const p of inScope) {
    const id = String(p.id ?? '');
    if (!id) continue;
    const existing = await Payment.exists({ razorpayPaymentId: id });
    let ctx = await resolvePaymentContext(p);
    if (!ctx) ctx = await subscriptionContext(p);
    if (!ctx || !ctx.userId || !ctx.kind) {
      counts.unattributed += 1;
      unattributed.push(id);
      continue;
    }
    if (typeof p.amount_refunded === 'number' && p.amount_refunded > 0) refundedKeptInk.push(id);
    if (existing) counts.already += 1;
    if (apply) {
      const ok = await upsertPaymentFromEntity(p, ctx, 'backfill');
      if (ok && !existing) counts.written += 1;
    } else if (!existing) {
      counts.written += 1; // would write
    }
  }

  console.log(JSON.stringify({ apply, ...counts }));
  if (unattributed.length) console.log(`unattributed payment ids: ${unattributed.join(', ')}`);
  if (refundedKeptInk.length) {
    console.log(
      `refunded before deploy, Ink NOT reversed by this script (support to decide): ${refundedKeptInk.join(', ')}`,
    );
  }
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err: unknown) => {
  console.error(`backfill-payments failed: ${err instanceof Error ? err.name : 'unknown'}`);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
