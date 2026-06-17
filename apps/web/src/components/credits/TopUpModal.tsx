'use client';

import { CheckCircle2, Loader2, Tag, Zap, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { notifyCreditsChanged } from '@/hooks/useCredits';
import { apiFetch } from '@/lib/apiFetch';

interface TopupSku {
  id: string;
  ink: number;
  priceInr: number;
  badge?: 'POPULAR' | 'BEST_VALUE';
  pricePerInkInr: number;
}

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
  const [selectedId, setSelectedId] = useState<string>('topup_mid');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [coupon, setCoupon] = useState<{
    code: string;
    discountInr: number;
    finalPriceInr: number;
  } | null>(null);
  const [couponError, setCouponError] = useState('');

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

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponValidating(true);
    setCouponError('');
    setCoupon(null);
    try {
      const code = couponInput.trim().toUpperCase();
      const res = await apiFetch(`/api/billing/validate-coupon/${code}?skuId=${selectedId}`);
      const body = await res.json();
      if (!body.valid) {
        setCouponError(body.reason ?? 'Invalid coupon.');
      } else if (body.finalPriceInr === null || body.finalPriceInr === undefined) {
        setCouponError('Coupon cannot be applied to this item.');
      } else {
        setCoupon({
          code: body.code,
          discountInr: body.discountInr ?? 0,
          finalPriceInr: body.finalPriceInr,
        });
      }
    } catch {
      setCouponError('Could not validate coupon. Try again.');
    } finally {
      setCouponValidating(false);
    }
  };

  const handlePurchase = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      const orderRes = await apiFetch('/api/billing/topup/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: selected.id,
          ...(coupon ? { couponCode: coupon.code } : {}),
        }),
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
        ink: number;
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
        amount: order.amountInr * 100, // server already applied discount
        currency: 'INR',
        name: 'Lawie',
        description: `${order.ink} Ink top-up`,
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

  const SKU_NAMES: Record<string, string> = {
    topup_mini: 'Mini',
    topup_mid: 'Mid',
    topup_max: 'Max',
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
        {/* Header band */}
        <header className="relative overflow-hidden rounded-t-2xl bg-amber-50 px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white">
                <Zap size={15} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                  Top up Ink
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900">Buy Ink for your bench</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Top-up Ink <strong>never expires</strong> and stacks with your subscription.
          </p>
        </header>

        {/* SKU list */}
        <div className="space-y-2 px-6 py-5">
          {skus.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              Loading packs…
            </div>
          )}
          {skus.map((sku) => (
            <button
              key={sku.id}
              type="button"
              onClick={() => {
                setSelectedId(sku.id);
                setCoupon(null);
                setCouponError('');
              }}
              className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
                selectedId === sku.id
                  ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-300/40'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                readOnly
                checked={selectedId === sku.id}
                className="h-4 w-4 accent-amber-500"
              />
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  selectedId === sku.id ? 'bg-amber-200' : 'bg-slate-100'
                }`}
              >
                <Zap size={16} className="text-amber-600" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {SKU_NAMES[sku.id] ?? sku.id} — {sku.ink} Ink
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
                  ₹{sku.pricePerInkInr.toFixed(2)} per Ink · never expires
                </p>
              </div>
              <span className="font-mono text-lg font-bold text-slate-900">₹{sku.priceInr}</span>
            </button>
          ))}
        </div>

        {/* Coupon input */}
        <div className="border-t border-slate-100 px-6 pb-4 pt-3">
          {coupon ? (
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-green-800">
                <CheckCircle2 size={14} className="text-green-500" />
                <span className="font-semibold">{coupon.code}</span>
                <span className="text-green-600">− ₹{coupon.discountInr}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCoupon(null);
                  setCouponInput('');
                }}
                className="text-green-600 hover:text-green-800"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag
                  size={12}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value.toUpperCase());
                    setCouponError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleApplyCoupon();
                  }}
                  placeholder="Coupon code (optional)"
                  maxLength={20}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleApplyCoupon()}
                disabled={couponValidating || !couponInput.trim()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {couponValidating ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
              </button>
            </div>
          )}
          {couponError && <p className="mt-1.5 text-xs text-red-600">{couponError}</p>}
        </div>

        {/* Footer: total + CTA */}
        <footer className="flex items-center justify-between rounded-b-2xl border-t border-slate-100 bg-slate-50 px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              You&apos;ll pay
            </p>
            {coupon && selected ? (
              <div className="flex items-baseline gap-2">
                <p className="font-mono text-2xl font-bold text-slate-900">
                  ₹{coupon.finalPriceInr}{' '}
                  <span className="text-xs font-normal text-slate-500">incl. GST</span>
                </p>
                <p className="font-mono text-sm text-slate-400 line-through">
                  ₹{selected.priceInr}
                </p>
              </div>
            ) : (
              <p className="font-mono text-2xl font-bold text-slate-900">
                ₹{selected?.priceInr ?? 0}{' '}
                <span className="text-xs font-normal text-slate-500">incl. GST</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handlePurchase}
            disabled={!selected || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Pay with Razorpay
          </button>
        </footer>
        {error && <p className="px-6 pb-4 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
