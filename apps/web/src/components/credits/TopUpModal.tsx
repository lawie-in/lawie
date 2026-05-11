'use client';

/**
 * TopUpModal — purchase one-off credit packs.
 *
 * Design: docs/Pricing Design/3 SKUs _ _199 _ _499 _ _999.png
 *
 * Calls POST /api/billing/topup/order to create a Razorpay order, then opens
 * the Razorpay Checkout overlay. On payment.captured the billing webhook
 * grants topupCredits server-side; this modal triggers a refresh on close so
 * the new balance shows up.
 */

import { Coins, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { notifyCreditsChanged } from '@/hooks/useCredits';
import { apiFetch } from '@/lib/apiFetch';

interface TopupSku {
  id: string;
  credits: number;
  priceInr: number;
  badge?: 'POPULAR' | 'BEST_VALUE';
  pricePerCreditInr: number;
}

// Razorpay Checkout SDK loader
declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function TopUpModal({ onClose }: { onClose: () => void }) {
  const [skus, setSkus] = useState<TopupSku[]>([]);
  const [selectedId, setSelectedId] = useState<string>('topup_60');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await apiFetch('/api/billing/plans');
      if (res.ok) {
        const body = await res.json();
        setSkus(body.topups ?? []);
      }
    })();
  }, []);

  const selected = skus.find((s) => s.id === selectedId);

  const handlePurchase = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      const orderRes = await apiFetch('/api/billing/topup/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuId: selected.id }),
      });
      if (!orderRes.ok) {
        const body = await orderRes.json();
        setError(body.error ?? 'Order creation failed');
        setSubmitting(false);
        return;
      }
      const order = (await orderRes.json()).data as {
        orderId: string;
        amountInr: number;
        credits: number;
        razorpayKeyId: string;
      };

      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        setError('Could not load Razorpay. Please retry or contact support.');
        setSubmitting(false);
        return;
      }
      const rzp = new window.Razorpay({
        key: order.razorpayKeyId,
        amount: order.amountInr * 100,
        currency: 'INR',
        name: 'Lawie',
        description: `${order.credits} credits`,
        order_id: order.orderId,
        theme: { color: '#0f172a' },
        handler: () => {
          notifyCreditsChanged();
          onClose();
        },
        modal: { ondismiss: () => setSubmitting(false) },
      });
      rzp.open();
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              Top up credits
            </span>
            <h2 className="mt-2 text-xl font-bold text-slate-900">Buy credits for your bench</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-6 py-5">
          <p className="mb-4 text-xs text-slate-500">
            Top-up credits <strong>never expire</strong> and stack with any subscription.
          </p>

          <div className="space-y-2">
            {skus.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                Loading SKUs…
              </div>
            )}
            {skus.map((sku) => (
              <button
                key={sku.id}
                type="button"
                onClick={() => setSelectedId(sku.id)}
                className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
                  selectedId === sku.id
                    ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-300/40'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  checked={selectedId === sku.id}
                  onChange={() => setSelectedId(sku.id)}
                  className="h-4 w-4 accent-amber-500"
                />
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    selectedId === sku.id ? 'bg-amber-200' : 'bg-slate-100'
                  }`}
                >
                  <Coins size={16} className="text-amber-600" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {sku.credits} credits
                    </span>
                    {sku.badge && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          sku.badge === 'POPULAR'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-200 text-amber-900'
                        }`}
                      >
                        {sku.badge === 'BEST_VALUE' ? 'Best value' : 'Popular'}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ₹{sku.pricePerCreditInr.toFixed(2)} per credit · ≈{' '}
                    {Math.floor(sku.credits / 2)} bail drafts
                  </p>
                </div>
                <span className="font-mono text-lg font-bold text-slate-900">
                  ₹{sku.priceInr}
                </span>
              </button>
            ))}
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4 rounded-b-2xl">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              You&apos;ll pay
            </p>
            <p className="font-mono text-2xl font-bold text-slate-900">
              ₹{selected?.priceInr ?? 0}{' '}
              <span className="text-xs font-normal text-slate-500">incl. GST</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handlePurchase}
            disabled={!selected || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Pay with Razorpay
          </button>
        </footer>
        {error && (
          <p className="px-6 pb-4 text-xs text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
