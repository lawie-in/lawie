'use strict';
const __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.BACKFILL_FROM = void 0;
exports.runPaymentsBackfill = runPaymentsBackfill;
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
 * Legacy plan grants (Arjun 3b h): see runPaymentsBackfill. A subscription with exactly one
 * un-stamped sub_renewal row and exactly one captured plan charge (paid Razorpay invoices) is
 * attributed: the Payment row gets the grant's delta and the grant is stamped with the payment
 * id (only if empty). Anything else is ambiguous (inkUnits 0, refund manual). Counts reported:
 * attributed / ambiguous / alreadyRecorded. Importing this module (tests) loads nothing and
 * connects nowhere; main() runs only as a script.
 *
 * Plan Ink (Arjun final, 3b): only what the ink ledger confirms THIS payment granted, matched
 * by payment id (confirmedPlanGrantUnits). Plan grants made before the payment id was stored
 * on sub_renewal rows never match, so every pre-deploy plan payment is written with inkUnits 0
 * (no "+N Ink"); a refund of one then resolves as 'unresolved' unless its row already had Ink.
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
const dotenv_1 = require('dotenv');
const fs_1 = require('fs');
const path_1 = require('path');
// apps/billing/scripts -> repo root. Only when run as a script: a test that imports this
// module (runPaymentsBackfill) loads no env file and opens no connection.
const repoRoot = (0, path_1.join)(__dirname, '..', '..', '..');
if (require.main === module) {
  for (const candidate of [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env']) {
    const p = (0, path_1.join)(repoRoot, candidate);
    if ((0, fs_1.existsSync)(p)) {
      (0, dotenv_1.config)({ path: p });
      break;
    }
  }
}
const mongoose_1 = __importDefault(require('mongoose'));
const credit_skus_1 = require('../src/config/credit-skus');
const env_1 = require('../src/config/env');
const razorpay_1 = require('../src/config/razorpay');
const Payment_model_1 = require('../src/models/Payment.model');
const Subscription_model_1 = require('../src/models/Subscription.model');
const payment_record_service_1 = require('../src/services/payment-record.service');
/* eslint-enable import/order, import/first */
const USAGE = 'Usage: backfill-payments.ts [--dry-run | --apply]';
/** Prod go-live, 23 Oct 2026 00:00 IST (Vikram 6). */
exports.BACKFILL_FROM = new Date('2026-10-22T18:30:00.000Z');
const PAGE = 100;
/** Scheme, host(s) and database of a Mongo URI; never credentials or query. gitleaks:allow */
function redactMongoUri(uri) {
  const scheme = /^[a-z+]+:\/\//i.exec(uri)?.[0];
  if (!scheme) return '(unparseable MONGO_URI)';
  const rest = uri.slice(scheme.length);
  const afterCreds = rest.slice(rest.lastIndexOf('@') + 1);
  return scheme + afterCreds.split('?')[0];
}
async function listPayments(fromSec, toSec) {
  const out = [];
  for (let skip = 0; ; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await razorpay_1.razorpay.payments.all({
      from: fromSec,
      to: toSec,
      count: PAGE,
      skip,
    });
    const items = page.items ?? [];
    out.push(...items);
    if (items.length < PAGE) break;
  }
  return out;
}
/** A subscription charge: Razorpay invoice -> subscription -> local row. */
async function subscriptionContext(entity) {
  const invoiceId = typeof entity.invoice_id === 'string' ? entity.invoice_id : '';
  if (!invoiceId) return null;
  let subId = '';
  try {
    const inv = await razorpay_1.razorpay.invoices.fetch(invoiceId);
    subId = typeof inv.subscription_id === 'string' ? inv.subscription_id : '';
  } catch {
    return null;
  }
  if (!subId) return null;
  const sub = await Subscription_model_1.Subscription.findOne({
    razorpaySubscriptionId: subId,
  }).lean();
  if (!sub) return null;
  const plan =
    (sub.planId ? (0, credit_skus_1.findSubscriptionPlan)(sub.planId) : undefined) ??
    (0, credit_skus_1.findPlanByRazorpayId)(String(sub.razorpayPlanId ?? ''));
  // T-646 (Arjun final, 3b): the Ink is what the ledger confirms THIS payment granted (the
  // sub_renewal row for this user carrying this payment id), never the subscription's current
  // plan. Grants made before the payment id was stored never match: 0, no "+N Ink". The plan
  // id is a label only.
  const confirmed = await (0, payment_record_service_1.confirmedPlanGrantUnits)({
    userId: String(sub.userId),
    razorpayPaymentId: typeof entity.id === 'string' ? entity.id : '',
  });
  return {
    userId: String(sub.userId),
    kind: 'plan',
    inkUnits: confirmed ?? 0,
    razorpaySubscriptionId: subId,
    ...(plan ? { planId: plan.id } : {}),
  };
}
/** Un-stamped sub_renewal rows of one subscription (at most 2 read: 0, 1 or "many"). */
async function unstampedGrants(userId, subId) {
  const db = mongoose_1.default.connection.db;
  if (!db || !mongoose_1.default.Types.ObjectId.isValid(userId)) return [];
  return db
    .collection('inkledger')
    .find(
      {
        userId: new mongoose_1.default.Types.ObjectId(userId),
        reason: 'sub_renewal',
        'metadata.razorpaySubscriptionId': subId,
        'metadata.razorpayPaymentId': { $in: [null] },
      },
      { projection: { _id: 1, delta: 1 } },
    )
    .limit(2)
    .toArray();
}
/**
 * The backfill for `payments` (Razorpay payment entities). `apply` defaults to false: the
 * dry run reads only and writes nothing. Needs an open mongoose connection; opens none.
 */
async function runPaymentsBackfill(payments, options = {}) {
  const apply = options.apply === true;
  const deps = {
    subscriptionIdFor: subscriptionIdForPayment,
    countCapturedPlanCharges: countCapturedPlanChargesAtRazorpay,
    log: (line) => console.log(line),
    ...options.deps,
  };
  const inScope = payments
    .filter((p) => p.status === 'captured' || p.status === 'refunded')
    .sort((a, b) => Number(a.created_at ?? 0) - Number(b.created_at ?? 0));
  const counts = {
    inScope: inScope.length,
    written: 0,
    alreadyRecorded: 0,
    attributed: 0,
    ambiguous: 0,
    unattributed: 0,
  };
  const unattributedIds = [];
  const ambiguousIds = [];
  const refundedKeptInkIds = [];
  for (const p of inScope) {
    const id = String(p.id ?? '');
    if (!id) continue;
    const existing = await Payment_model_1.Payment.findOne(
      { razorpayPaymentId: id },
      { inkUnits: 1 },
    ).lean();
    let ctx = await (0, payment_record_service_1.resolvePaymentContext)(p);
    if (!ctx) ctx = await subscriptionContext(p);
    if (!ctx || !ctx.userId || !ctx.kind) {
      counts.unattributed += 1;
      unattributedIds.push(id);
      continue;
    }
    if (typeof p.amount_refunded === 'number' && p.amount_refunded > 0) {
      refundedKeptInkIds.push(id);
    }
    // Recorded by the webhook with Ink: untouched.
    if (existing && existing.inkUnits > 0) {
      counts.alreadyRecorded += 1;
      continue;
    }
    // A plan charge with no payment-id-confirmed grant: the one-shot attribution. Top-ups
    // are never here (their Ink comes from the order's claim).
    if (ctx.kind === 'plan' && !((ctx.inkUnits ?? 0) > 0)) {
      const subId = ctx.razorpaySubscriptionId ?? (await deps.subscriptionIdFor(p));
      let grant = null;
      if (subId) {
        const grants = await unstampedGrants(ctx.userId, subId);
        const charges = grants.length === 1 ? await deps.countCapturedPlanCharges(subId) : 0;
        const delta = grants[0]?.delta;
        if (grants.length === 1 && charges === 1 && typeof delta === 'number' && delta > 0) {
          grant = { _id: grants[0]._id, delta };
        }
      }
      if (grant && apply) {
        // Stamp first, only if still empty; then the row. A rerun after a crash finds the
        // stamp and confirms by payment id.
        const db = mongoose_1.default.connection.db;
        const stamped = db
          ? await db.collection('inkledger').findOneAndUpdate(
              {
                _id: grant._id,
                'metadata.razorpayPaymentId': { $in: [null] },
              },
              { $set: { 'metadata.razorpayPaymentId': id } },
            )
          : null;
        if (!stamped) grant = null;
      }
      if (grant) {
        counts.attributed += 1;
        ctx = { ...ctx, inkUnits: grant.delta };
      } else {
        counts.ambiguous += 1;
        ambiguousIds.push(id);
        deps.log(
          `ambiguous, inkUnits 0, refund stays manual: payment ${id} subscription ${subId ?? 'unknown'}`,
        );
        ctx = { ...ctx, inkUnits: 0 };
      }
    }
    if (apply) {
      const ok = await (0, payment_record_service_1.upsertPaymentFromEntity)(p, ctx, 'backfill');
      if (ok && !existing) counts.written += 1;
    } else if (!existing) {
      counts.written += 1; // would write
    }
  }
  return { counts, unattributedIds, ambiguousIds, refundedKeptInkIds };
}
/** The Razorpay subscription id of a plan charge: its own field, else its invoice's (GET). */
async function subscriptionIdForPayment(entity) {
  if (typeof entity.subscription_id === 'string' && entity.subscription_id) {
    return entity.subscription_id;
  }
  const invoiceId = typeof entity.invoice_id === 'string' ? entity.invoice_id : '';
  if (!invoiceId) return null;
  try {
    const inv = await razorpay_1.razorpay.invoices.fetch(invoiceId);
    return typeof inv.subscription_id === 'string' && inv.subscription_id
      ? inv.subscription_id
      : null;
  } catch {
    return null;
  }
}
/**
 * Captured plan charges in total for a subscription: its PAID Razorpay invoices that carry a
 * payment id (GET only, paged). A charge refunded later was still captured and counts.
 */
async function countCapturedPlanChargesAtRazorpay(subId) {
  let n = 0;
  for (let skip = 0; ; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await razorpay_1.razorpay.invoices.all({
      subscription_id: subId,
      count: PAGE,
      skip,
    });
    const items = page.items ?? [];
    n += items.filter(
      (i) => i.status === 'paid' && typeof i.payment_id === 'string' && i.payment_id,
    ).length;
    if (items.length < PAGE) break;
  }
  return n;
}
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const unknown = args.filter((a) => a !== '--apply' && a !== '--dry-run');
  if (unknown.length > 0 || (apply && args.includes('--dry-run'))) {
    console.error(USAGE);
    process.exit(2);
  }
  const target = redactMongoUri(env_1.env.MONGO_URI);
  console.log(apply ? `--apply: WRITING to ${target}` : `dry run against ${target} (no writes)`);
  await mongoose_1.default.connect(env_1.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  const fromSec = Math.floor(exports.BACKFILL_FROM.getTime() / 1000);
  const toSec = Math.floor(Date.now() / 1000);
  const all = await listPayments(fromSec, toSec);
  const result = await runPaymentsBackfill(all, { apply });
  console.log(JSON.stringify({ apply, listed: all.length, ...result.counts }));
  if (result.unattributedIds.length) {
    console.log(`unattributed payment ids: ${result.unattributedIds.join(', ')}`);
  }
  if (result.refundedKeptInkIds.length) {
    console.log(
      `refunded before deploy, Ink NOT reversed by this script (support to decide): ${result.refundedKeptInkIds.join(', ')}`,
    );
  }
  await mongoose_1.default.disconnect();
  process.exit(0);
}
if (require.main === module) {
  main().catch(async (err) => {
    console.error(`backfill-payments failed: ${err instanceof Error ? err.name : 'unknown'}`);
    try {
      await mongoose_1.default.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  });
}
//# sourceMappingURL=backfill-payments.js.map
