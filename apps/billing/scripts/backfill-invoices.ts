/**
 * T-436 (Arjun, Backfill): one-off — issue GST tax invoices for captured
 * payments that have none.
 *
 *   yarn workspace @lawie/billing backfill:invoices            # dry run (default)
 *   yarn workspace @lawie/billing backfill:invoices --apply    # writes
 *
 * Finds candidates in two places:
 *
 * - Top-ups: `inkledger` rows with reason 'topup_purchase' and a
 *   `metadata.razorpayPaymentId`. Rows without a payment id are counted and
 *   listed, never invoiced (nothing to key on).
 * - Subscriptions: the local Subscription rows give the Razorpay subscription
 *   ids; `paymentHistory` is never written, so the charges themselves come from
 *   Razorpay (`invoices.all({ subscription_id })`, paid ones with a payment id).
 *   A subscription Razorpay cannot return is counted as unreadable. A charge on
 *   a subscription that has no local row is not found by this script.
 *
 * Every candidate's payment is fetched from Razorpay: the invoice uses the
 * amount actually charged (coupons change it) and only a payment whose status
 * is 'captured' is invoiced (refunded or failed ones are listed and skipped).
 * Payments before GST_EFFECTIVE_FROM are skipped. `--apply` issues in payment
 * order (oldest first) through the same record + issue steps as the webhook, so
 * it is idempotent: a payment that already has an invoice is skipped, and a
 * second run issues nothing twice.
 *
 * T-436 (c): each backfilled invoice is emailed once (Ajay, GST file Addendum
 * 7 #4b), but this script does not wait for it: the issue step's enqueue runs
 * in the background and the script exits once done (process.exit after the
 * Mongo disconnect, so an open queue connection cannot hold it). The billing
 * service's invoice sweep sends the emails for any row whose `emailQueuedAt`
 * is still null, once INVOICE_EMAIL_ENABLED is "true" and REDIS_URL is set.
 *
 * The dry run writes nothing to Mongo; it does read from Razorpay (GET only).
 *
 * Needs the billing env of the target environment (MONGO_URI, Razorpay keys,
 * the GST_* values); loads .env.<NODE_ENV> (default development) or .env from
 * the repo root. Prints payment ids, subscription ids and counts only; never a
 * name, email, GSTIN or amount. Exit codes: 0 done, 1 failed, 2 usage/config.
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

import { findSubscriptionPlan, findTopupSku } from '../src/config/credit-skus';
import { env } from '../src/config/env';
import { InvoiceConfigError, readEffectiveFrom, requireInvoiceConfig } from '../src/config/gst';
import { razorpay } from '../src/config/razorpay';
import { Invoice } from '../src/models/Invoice.model';
import { InvoiceCounter } from '../src/models/InvoiceCounter.model';
import { Subscription } from '../src/models/Subscription.model';
import {
  fromUnix,
  issueInvoice,
  recordInvoiceForPayment,
  subscriptionDescription,
  topupDescription,
  type CapturedPayment,
} from '../src/services/invoice.service';
/* eslint-enable import/order, import/first */

const USAGE = 'Usage: yarn workspace @lawie/billing backfill:invoices [--dry-run | --apply]';

/** Scheme, host(s) and database of a Mongo URI; never credentials or query. gitleaks:allow */
function redactMongoUri(uri: string): string {
  const scheme = /^[a-z+]+:\/\//i.exec(uri)?.[0];
  if (!scheme) return '(unparseable MONGO_URI)';
  const rest = uri.slice(scheme.length);
  const afterCreds = rest.slice(rest.lastIndexOf('@') + 1);
  return scheme + afterCreds.split('?')[0];
}

interface Candidate {
  paymentId: string;
  userId: string;
  description: string;
  source: 'topup' | 'subscription';
  razorpayOrderId?: string;
  razorpaySubscriptionId?: string;
}

async function fetchCaptured(
  paymentId: string,
): Promise<{ status: string; amount: number; createdAt: Date } | null> {
  try {
    const p = (await razorpay.payments.fetch(paymentId)) as unknown as Record<string, unknown>;
    return {
      status: String(p.status ?? ''),
      amount: typeof p.amount === 'number' ? p.amount : Number(p.amount),
      createdAt: fromUnix(p.created_at),
    };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const unknown = args.filter((a) => a !== '--apply' && a !== '--dry-run');
  if (unknown.length > 0 || (apply && args.includes('--dry-run'))) {
    console.error(USAGE);
    process.exit(2);
  }

  const effectiveFrom = readEffectiveFrom();
  if (!effectiveFrom) {
    console.error('GST_EFFECTIVE_FROM is not set (or not a date); nothing can be decided.');
    process.exit(2);
  }
  if (apply) {
    try {
      requireInvoiceConfig();
    } catch (err) {
      if (err instanceof InvoiceConfigError) {
        console.error(`GST config incomplete, missing: ${err.missing.join(', ')}`);
        process.exit(2);
      }
      throw err;
    }
  }

  const target = redactMongoUri(env.MONGO_URI);
  if (apply) {
    console.log('='.repeat(72));
    console.log(`  --apply: WRITING to ${target}`);
    console.log('='.repeat(72));
  } else {
    console.log(`Target (dry run, read-only): ${target}`);
  }
  console.log(`GST_EFFECTIVE_FROM: ${effectiveFrom.toISOString()}`);

  // Dry run creates nothing: no collections (autoCreate) and no index builds
  // (autoIndex). Apply: the collections and unique indexes must exist.
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    autoIndex: apply,
    autoCreate: apply,
  });
  try {
    if (apply) await Promise.all([Invoice.init(), InvoiceCounter.init()]);
    const db = mongoose.connection.db;
    if (!db) throw new Error('No database handle after connect');

    const candidates = new Map<string, Candidate>();

    // ── Top-ups ────────────────────────────────────────────────────────────
    const topupRows = await db
      .collection('inkledger')
      .find(
        { reason: 'topup_purchase' },
        { projection: { userId: 1, reference: 1, metadata: 1, delta: 1 } },
      )
      .toArray();
    let topupNoPaymentId = 0;
    for (const r of topupRows) {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const paymentId = typeof meta.razorpayPaymentId === 'string' ? meta.razorpayPaymentId : '';
      if (!paymentId) {
        topupNoPaymentId += 1;
        console.log(`top-up ledger row ${String(r._id)}: no payment id, cannot invoice`);
        continue;
      }
      const sku = typeof meta.topupSkuId === 'string' ? findTopupSku(meta.topupSkuId) : undefined;
      const ink = sku?.ink ?? (typeof r.delta === 'number' ? r.delta / 2 : 0);
      candidates.set(paymentId, {
        paymentId,
        userId: String(r.userId),
        description: topupDescription(ink),
        source: 'topup',
        ...(typeof r.reference === 'string' ? { razorpayOrderId: r.reference } : {}),
      });
    }

    // ── Subscriptions (charges from Razorpay) ──────────────────────────────
    const subs = await Subscription.find({})
      .select('userId razorpaySubscriptionId planId billingCycle')
      .lean();
    let subsUnreadable = 0;
    for (const s of subs) {
      let items: Array<Record<string, unknown>> = [];
      try {
        const res = (await razorpay.invoices.all({
          subscription_id: s.razorpaySubscriptionId,
          count: 100,
        })) as unknown as { items?: Array<Record<string, unknown>> };
        items = res.items ?? [];
      } catch {
        subsUnreadable += 1;
        console.log(`${s.razorpaySubscriptionId}: Razorpay invoices not readable, skipped`);
        continue;
      }
      const plan = s.planId ? findSubscriptionPlan(s.planId) : undefined;
      for (const inv of items) {
        const paymentId = typeof inv.payment_id === 'string' ? inv.payment_id : '';
        if (inv.status !== 'paid' || !paymentId) continue;
        const start =
          typeof inv.billing_start === 'number' ? fromUnix(inv.billing_start) : undefined;
        const end = typeof inv.billing_end === 'number' ? fromUnix(inv.billing_end) : undefined;
        candidates.set(paymentId, {
          paymentId,
          userId: String(s.userId),
          description: subscriptionDescription(
            plan ? { tier: plan.tier, cycle: plan.cycle } : null,
            start,
            end,
          ),
          source: 'subscription',
          razorpaySubscriptionId: s.razorpaySubscriptionId,
        });
      }
    }

    // ── Filter: no invoice yet, captured, on/after the effective date ──────
    const already = new Set(
      (
        await Invoice.find({ kind: 'invoice', paymentId: { $in: [...candidates.keys()] } })
          .select('paymentId state')
          .lean()
      )
        .filter((i) => i.state === 'issued')
        .map((i) => i.paymentId),
    );
    const due: Array<CapturedPayment> = [];
    let notCaptured = 0;
    let beforeEffective = 0;
    let unreadable = 0;
    for (const c of candidates.values()) {
      if (already.has(c.paymentId)) continue;
      const pay = await fetchCaptured(c.paymentId);
      if (!pay) {
        unreadable += 1;
        console.log(`${c.paymentId}: payment not readable from Razorpay, skipped`);
        continue;
      }
      if (pay.status !== 'captured') {
        notCaptured += 1;
        console.log(`${c.paymentId}: status ${pay.status}, no invoice`);
        continue;
      }
      if (pay.createdAt < effectiveFrom) {
        beforeEffective += 1;
        console.log(`${c.paymentId}: before GST_EFFECTIVE_FROM, no invoice`);
        continue;
      }
      due.push({
        paymentId: c.paymentId,
        userId: c.userId,
        amount: pay.amount,
        paidAt: pay.createdAt,
        description: c.description,
        source: 'backfill',
        ...(c.razorpayOrderId ? { razorpayOrderId: c.razorpayOrderId } : {}),
        ...(c.razorpaySubscriptionId ? { razorpaySubscriptionId: c.razorpaySubscriptionId } : {}),
      });
    }
    due.sort(
      (a, b) => a.paidAt.getTime() - b.paidAt.getTime() || a.paymentId.localeCompare(b.paymentId),
    );

    for (const d of due) console.log(`${d.paymentId}: due (${d.paidAt.toISOString()})`);
    console.log(`top-up ledger rows: ${topupRows.length} (no payment id: ${topupNoPaymentId})`);
    console.log(`subscriptions: ${subs.length} (Razorpay unreadable: ${subsUnreadable})`);
    console.log(`candidate payments: ${candidates.size}, already invoiced: ${already.size}`);
    console.log(
      `skipped: not captured ${notCaptured}, before effective date ${beforeEffective}, unreadable ${unreadable}`,
    );
    console.log(`invoices due: ${due.length}`);

    if (!apply) {
      console.log('Dry run: nothing written. Run with --apply to issue.');
      return;
    }

    let issued = 0;
    let failed = 0;
    for (const d of due) {
      try {
        const row = await recordInvoiceForPayment(d);
        if (!row) continue;
        const outcome = await issueInvoice(row._id as mongoose.Types.ObjectId);
        if (outcome === 'issued') issued += 1;
      } catch (err) {
        failed += 1;
        console.log(
          `${d.paymentId}: issue failed (${err instanceof Error ? err.name : 'unknown'})`,
        );
      }
    }
    console.log(`invoices issued: ${issued}, failed: ${failed}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
  // Exit explicitly: a queue connection opened by a background enqueue would
  // otherwise keep the process alive. The sweep sends any email cut off here.
  process.exit(process.exitCode ?? 0);
}

main().catch((err: unknown) => {
  console.error(`Backfill stopped: ${err instanceof Error ? err.name : 'UnknownError'}`);
  void mongoose.disconnect().finally(() => process.exit(1));
});
