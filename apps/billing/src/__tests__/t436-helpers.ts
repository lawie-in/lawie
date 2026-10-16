/**
 * T-436 shared test helpers (not a test file). Fake GST values come from setupEnv.ts.
 */
import crypto from 'crypto';

import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { Invoice } from '../models/Invoice.model';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';

export const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
export const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;

export const sign = (body: string) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

/** POST a signed webhook event. */
export function webhook(event: string, payload: Record<string, unknown>) {
  const body = JSON.stringify({ event, payload });
  return request(app)
    .post('/webhook/razorpay')
    .type('json')
    .set('x-razorpay-signature', sign(body))
    .send(body);
}

export function headers(userId: string, role: 'Admin' | 'Client' = 'Client') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'x@example.com',
    'x-user-name': 'X',
    'x-user-plan': 'free',
    'x-user-role': role,
  };
}

export async function seedUser(
  extra: Record<string, unknown> = {},
): Promise<mongoose.Types.ObjectId> {
  const u = await User.create({
    email: `u${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Asha Verma',
    plan: 'free',
    ...extra,
  } as Record<string, unknown>);
  return u._id as mongoose.Types.ObjectId;
}

export async function seedSub(userId: mongoose.Types.ObjectId, subId = 'sub_t436', over = {}) {
  return Subscription.create({
    userId,
    razorpaySubscriptionId: subId,
    status: 'created',
    ...over,
  });
}

export const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

export interface ChargeOpts {
  subId?: string;
  paymentId?: string | null;
  amount?: number;
  status?: string;
  planId?: string;
  notes?: Record<string, unknown>;
  paidCount?: number;
  start?: string;
  end?: string;
  createdAt?: string;
}

/** subscription.charged / .activated payload. */
export function subPayload(o: ChargeOpts = {}): Record<string, unknown> {
  const start = o.start ?? '2026-03-01T00:00:00Z';
  const end = o.end ?? '2026-03-31T00:00:00Z';
  const notes = o.notes ?? { planId: o.planId ?? 'solo_monthly' };
  const payload: Record<string, unknown> = {
    subscription: {
      entity: {
        id: o.subId ?? 'sub_t436',
        notes,
        paid_count: o.paidCount ?? 1,
        current_start: unix(start),
        current_end: unix(end),
        charge_at: unix(end),
      },
    },
  };
  if (o.paymentId !== null) {
    payload.payment = {
      entity: {
        id: o.paymentId ?? 'pay_t436',
        amount: o.amount ?? 79900,
        status: o.status ?? 'captured',
        created_at: unix(o.createdAt ?? '2026-03-01T00:00:10Z'),
      },
    };
  }
  return payload;
}

export interface TopupOpts {
  userId: string;
  skuId?: string;
  orderId?: string;
  paymentId?: string;
  amount?: number;
  status?: string;
  createdAt?: string;
}

/** order.paid payload (order entity + payment entity). */
export function orderPaidPayload(o: TopupOpts): Record<string, unknown> {
  return {
    order: {
      entity: {
        id: o.orderId ?? 'order_t436',
        notes: { sku_id: o.skuId ?? 'topup_mid', user_id: o.userId },
      },
    },
    payment: {
      entity: {
        id: o.paymentId ?? 'pay_top_t436',
        order_id: o.orderId ?? 'order_t436',
        amount: o.amount ?? 19900,
        status: o.status ?? 'captured',
        created_at: unix(o.createdAt ?? '2026-03-01T00:00:10Z'),
      },
    },
  };
}

/** payment.captured payload: no order entity; notes and order_id on the payment. */
export function paymentCapturedPayload(o: TopupOpts): Record<string, unknown> {
  return {
    payment: {
      entity: {
        id: o.paymentId ?? 'pay_top_t436',
        order_id: o.orderId ?? 'order_t436',
        notes: { sku_id: o.skuId ?? 'topup_mid', user_id: o.userId },
        amount: o.amount ?? 19900,
        status: o.status ?? 'captured',
        created_at: unix(o.createdAt ?? '2026-03-01T00:00:10Z'),
      },
    },
  };
}

export function refundPayload(o: {
  refundId?: string;
  paymentId?: string;
  amount?: number;
  status?: string;
  createdAt?: string;
}): Record<string, unknown> {
  return {
    refund: {
      entity: {
        id: o.refundId ?? 'rfnd_t436',
        payment_id: o.paymentId ?? 'pay_t436',
        amount: o.amount ?? 79900,
        status: o.status ?? 'processed',
        created_at: unix(o.createdAt ?? '2026-03-02T00:00:00Z'),
      },
    },
  };
}

/** Sets env.* GST values for a test and returns a restore function. */
export function withGstEnv(over: Partial<Record<keyof typeof env, string>>): () => void {
  const e = env as unknown as Record<string, string>;
  const saved: Record<string, string> = {};
  for (const [k, v] of Object.entries(over)) {
    saved[k] = e[k];
    e[k] = v as string;
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) e[k] = v;
  };
}

/** An already issued row, written directly (save() on a new row is allowed). */
export async function makeIssued(
  userId: mongoose.Types.ObjectId,
  over: Record<string, unknown> = {},
) {
  const n = Number(over.seq ?? 1);
  const kind = (over.kind as string) ?? 'invoice';
  const issuedAt = (over.issuedAt as Date) ?? new Date('2026-10-05T06:00:00Z');
  return Invoice.create({
    kind,
    state: 'issued',
    paymentId: `pay_${Math.random().toString(36).slice(2)}`,
    userId,
    draft: {
      amount: 79900,
      description: 'Lawie subscription — Solo Monthly, 1 Oct 2026 to 31 Oct 2026',
      paidAt: issuedAt,
      source: 'subscription.charged',
    },
    number: `${kind === 'invoice' ? 'LAW' : 'LCN'}/2026-27/${String(n).padStart(4, '0')}`,
    fy: '2026-27',
    seq: n,
    issuedAt,
    seller: {
      legalName: 'Test Proprietor',
      tradeName: 'Lawie',
      gstin: '20AAAAA0000A1Z5',
      address: '1 Test Road, Test Town 000000',
      stateCode: '20',
      stateName: 'Jharkhand',
    },
    customer: {
      name: 'Asha Verma',
      email: 'asha@example.com',
      stateCode: '20',
      stateName: 'Jharkhand',
    },
    placeOfSupply: { code: '20', name: 'Jharkhand', source: 'user' },
    lines: [
      {
        description: 'Lawie subscription — Solo Monthly, 1 Oct 2026 to 31 Oct 2026',
        sac: '998319',
        ratePercent: 18,
        quantity: 1,
        taxable: 67712,
        amount: 79900,
      },
    ],
    price: 79900,
    taxable: 67712,
    cgst: 6094,
    sgst: 6094,
    igst: 0,
    total: 79900,
    ...over,
  } as Record<string, unknown>);
}

/** A row left in 'issuing' (recorded, not issued). */
export async function recordForTest(userId: mongoose.Types.ObjectId, paymentId = 'pay_rec') {
  return Invoice.create({
    kind: 'invoice',
    state: 'issuing',
    paymentId,
    userId,
    draft: { amount: 100, description: 'd', paidAt: new Date(), source: 'backfill' },
  });
}
