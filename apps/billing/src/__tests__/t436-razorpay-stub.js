'use strict';
// Preload for the T-436 backfill test (node -r). Replaces the `razorpay` package with a fake whose
// answers come from the T436_RZP_FIXTURE env var (JSON), so the script never reaches Razorpay.
//   { payments: { <paymentId>: {status, amount, created_at} | "throw" },
//     invoices: { <subscriptionId>: { items: [...] } | "throw" } }
const Module = require('module');
const originalLoad = Module._load;

class FakeRazorpay {
  constructor() {
    const fixture = JSON.parse(process.env.T436_RZP_FIXTURE || '{}');
    this.payments = {
      fetch: async (id) => {
        const p = (fixture.payments || {})[id];
        if (p === undefined || p === 'throw')
          throw new Error('fake razorpay: payment not readable');
        return { id, ...p };
      },
    };
    this.invoices = {
      all: async (q) => {
        const r = (fixture.invoices || {})[q.subscription_id];
        if (r === undefined || r === 'throw')
          throw new Error('fake razorpay: invoices not readable');
        return r;
      },
    };
    this.subscriptions = { create: async () => ({}), fetch: async () => ({}) };
  }
}

Module._load = function (request, ...rest) {
  if (request === 'razorpay') return FakeRazorpay;
  return originalLoad.call(this, request, ...rest);
};
