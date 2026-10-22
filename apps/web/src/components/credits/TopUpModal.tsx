'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { CheckCircle2, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { GstStatePicker } from '@/components/billing/GstStatePicker';
import {
  PrivacyBlockedNotice,
  isPrivacyBlocked,
  privacyFetch,
  usePrivacyDescribedBy,
} from '@/components/PrivacyUpdatePrompt';
import {
  Button,
  DIALOG_OVERLAY_CLASS,
  DIALOG_SHEET_CLASS,
  DIALOG_TALL_CAP_CLASS,
  Skeleton,
} from '@/components/ui';
import { openVerifyIfDraftRefused } from '@/components/VerifyEmailPrompt';
import { notifyCreditsChanged } from '@/hooks/useCredits';
import { useGstState } from '@/hooks/useGstState';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/cn';

interface TopupSku {
  id: string;
  ink: number;
  priceInr: number;
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

/**
 * T-565 item 45 (Ajay's pre-Anushka review row 45; copy v1 generic failure): every order failure
 * shows this one signed line with Retry. No billing code, server message or network detail.
 */
const ORDER_FAILED = 'Something did not work. Try again.';

/**
 * T-525: the top-up dialog on the Radix Dialog primitives (components/ui/Dialog.tsx is the
 * confirm/destructive wrapper with a fixed footer, so this builds on the primitives directly).
 * Night Library tokens; a 440px dialog above 640px and a bottom sheet at 640px and below (spec 5).
 * Radix gives role=dialog, the focus trap, Escape, overlay click and focus return; aria-modal is
 * set here because Radix 1.1 does not. Callers mount it while open and pass onClose, as before.
 */
export function TopUpModal({ onClose }: { onClose: () => void }) {
  const [skus, setSkus] = useState<TopupSku[]>([]);
  const [selectedId, setSelectedId] = useState<string>('topup_mid');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const privacyDescribedBy = usePrivacyDescribedBy('topup');
  // T-436: the State for the tax invoice. Asks /me itself: the modal opens from anywhere.
  const gst = useGstState('gst-state-topup');

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [coupon, setCoupon] = useState<{
    code: string;
    discountInr: number;
    finalPriceInr: number;
  } | null>(null);
  const [couponError, setCouponError] = useState('');

  // T-510: the plans list has its own state, separate from the order `error` below. A failed
  // or non-OK request, or an empty list, shows the failed line with Retry (copy T-511 §4.6/§5),
  // never a forever spinner.
  const [plansStatus, setPlansStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const mountedRef = useRef(true);

  const loadPlans = useCallback(async () => {
    setPlansStatus('loading');
    try {
      const res = await apiFetch('/api/billing/plans');
      if (!res?.ok) throw new Error('plans request failed');
      const body = (await res.json()) as { topups?: unknown };
      if (!Array.isArray(body?.topups) || body.topups.length === 0) {
        throw new Error('plans body has no topups');
      }
      if (!mountedRef.current) return;
      setSkus(body.topups as TopupSku[]);
      setPlansStatus('ok');
    } catch {
      if (mountedRef.current) setPlansStatus('error');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadPlans();
    return () => {
      mountedRef.current = false;
    };
  }, [loadPlans]);

  // T-510: Retry unmounts while the list reloads, so focus would fall to <body>. Once the
  // reload settles, put focus back on Retry (failed again) or on the first pack (loaded).
  const retryRef = useRef<HTMLButtonElement>(null);
  const firstSkuRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const payRef = useRef<HTMLButtonElement>(null);
  // T-525: while Razorpay Checkout is up the dialog steps aside (open=false). A modal Radix
  // dialog makes the rest of the page inert (pointer-events and a focus trap), which would
  // include Razorpay's own iframe. Every state lives here, so dismissing Checkout brings the
  // dialog back as it was, with focus on Pay.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const focusPayOnOpen = useRef(false);
  /** True while the dialog is closed for Checkout: its close must not move focus. */
  const closingForCheckout = useRef(false);
  // T-525: the element that opened the dialog, captured once at mount (before Radix moves focus
  // in). There is no Radix Trigger, so Radix would return focus to nothing. A reopen after
  // Checkout keeps this original opener.
  const openerRef = useRef<Element | null>(null);
  useLayoutEffect(() => {
    // StrictMode runs this twice; the second run would capture the dialog title.
    if (openerRef.current === null) openerRef.current = document.activeElement;
  }, []);
  /** Mirrors checkoutOpen for the unmount cleanup below. */
  const checkoutOpenRef = useRef(false);
  /** Focus is returned once per dialog life (onCloseAutoFocus, Checkout success, unmount). */
  const focusRestored = useRef(false);
  const restoreFocus = useCallback(() => {
    if (focusRestored.current) return;
    focusRestored.current = true;
    const opener = openerRef.current;
    if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) {
      opener.focus();
    } else {
      document.getElementById('dashboard-main')?.focus();
    }
  }, []);
  // T-525: unmounted while hidden for Checkout (the Radix Content is already closed, so
  // onCloseAutoFocus does not run): return focus here instead.
  useEffect(
    () => () => {
      if (checkoutOpenRef.current) restoreFocus();
    },
    [restoreFocus],
  );
  const refocusAfterRetry = useRef(false);
  const handleRetryPlans = () => {
    refocusAfterRetry.current = true;
    void loadPlans();
  };
  useEffect(() => {
    if (!refocusAfterRetry.current || plansStatus === 'loading') return;
    refocusAfterRetry.current = false;
    (plansStatus === 'error' ? retryRef.current : firstSkuRef.current)?.focus();
  }, [plansStatus]);

  const selected = skus.find((s) => s.id === selectedId);
  // T-535: the one total the user sees after "You'll pay". The footer renders it and
  // handlePurchase checks the server's order amount against it, so the two cannot drift.
  const displayedTotal = selected ? (coupon ? coupon.finalPriceInr : selected.priceInr) : 0;

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
      // T-436 (spec §2): no State -> the error shows and the select takes focus; Razorpay is
      // not opened. An unsaved pick is saved first (only after privacy acceptance, Ajay 7 (2)).
      if (!(await gst.ensureReady())) return setSubmitting(false);
      const orderRes = await privacyFetch('topup', '/api/billing/topup/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: selected.id,
          ...(coupon ? { couponCode: coupon.code } : {}),
        }),
      });
      if (isPrivacyBlocked(orderRes)) return setSubmitting(false); // T-343
      // T-522 (Rajesh §3, AJ-522-M6): billing refused an unverified email user. The M6 Top-up
      // dialog opens over this one at the moment of the action (no redirect); Buy stays enabled
      // and the pack, coupon and State are kept. M6's portal mounts now, after this dialog's, so
      // at the same z-[60] it stacks above. Closing it returns focus to Buy (Buy is loading, so
      // it is passed explicitly rather than read from document.activeElement).
      if (await openVerifyIfDraftRefused(orderRes, 'topup', payRef.current)) {
        return setSubmitting(false);
      }
      if (!orderRes.ok) {
        setError(ORDER_FAILED);
        setSubmitting(false);
        return;
      }
      const order = (await orderRes.json()).data as
        | {
            orderId: string;
            amountInr: number;
            ink: number;
            razorpayKeyId: string;
          }
        | undefined;

      // T-535: never open Checkout for an amount other than the one shown after "You'll pay"
      // (e.g. a 100% coupon shows ₹0 but the server charges ₹1, or the coupon was dropped
      // server-side; backend fix is T-540). Generic failure copy, T-511 §5. The dialog stays
      // open and Buy stays usable for a retry.
      const amountInr = order?.amountInr;
      if (
        !order ||
        typeof amountInr !== 'number' ||
        !Number.isFinite(amountInr) ||
        !Number.isFinite(displayedTotal) ||
        amountInr !== displayedTotal
      ) {
        setError(ORDER_FAILED);
        setSubmitting(false);
        return;
      }

      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        setError(ORDER_FAILED);
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
          // T-525: the dialog is hidden for Checkout, so Radix will not return focus.
          restoreFocus();
          onClose();
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            focusPayOnOpen.current = true;
            checkoutOpenRef.current = false;
            setCheckoutOpen(false);
          },
        },
      });
      rzp.open();
      // After open(): if it throws, the catch below runs and the dialog stays up.
      closingForCheckout.current = true;
      checkoutOpenRef.current = true;
      setCheckoutOpen(true);
    } catch {
      setError(ORDER_FAILED);
      setSubmitting(false);
    }
  };

  // T-565 item 45: Retry runs Buy again. It unmounts while the order is retried, so once the
  // retry settles with a failure, focus goes back to Retry (as the plans Retry above does).
  const orderRetryRef = useRef<HTMLButtonElement>(null);
  const refocusAfterOrderRetry = useRef(false);
  const handleRetryOrder = () => {
    refocusAfterOrderRetry.current = true;
    void handlePurchase();
  };
  useEffect(() => {
    if (!refocusAfterOrderRetry.current || submitting) return;
    refocusAfterOrderRetry.current = false;
    if (error) orderRetryRef.current?.focus();
  }, [submitting, error]);

  return (
    <RadixDialog.Root
      open={!checkoutOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <RadixDialog.Portal>
        {/* T-549 (Rajesh T-531 F7): the Dialog sheet pattern, on the shared z-[60] layer. */}
        <RadixDialog.Overlay className={DIALOG_OVERLAY_CLASS} />
        <RadixDialog.Content
          aria-modal="true"
          // The note under the title is not a description of the whole dialog; no Radix warning.
          aria-describedby={undefined}
          // T-510: never land on Retry or a pack by default (a first-load failure must not move
          // focus to Retry). Focus the title, so the dialog is announced by name; Tab then goes
          // to Close and on. After Razorpay is dismissed, focus goes back to Pay.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const pay = focusPayOnOpen.current ? payRef.current : null;
            focusPayOnOpen.current = false;
            (pay ?? titleRef.current)?.focus();
          }}
          // T-525: focus goes back to the opener on close or unmount (Escape, Close, overlay,
          // success); if it is gone, to #dashboard-main. Not when hiding for Checkout.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (closingForCheckout.current) {
              closingForCheckout.current = false;
              return;
            }
            restoreFocus();
          }}
          className={cn(
            DIALOG_SHEET_CLASS,
            DIALOG_TALL_CAP_CLASS,
            // Sheet at <= 640px: clear the home indicator and the side insets (viewport-fit=cover).
            // The insets sit on the surface, so each section keeps its px-nl-6 and the border-t
            // dividers stay full width. Reset above 640px.
            'pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]',
            'min-[641px]:pb-0 min-[641px]:pl-0 min-[641px]:pr-0',
          )}
        >
          <header className="px-nl-6 pt-nl-6">
            <div className="gap-nl-3 flex items-start justify-between">
              <div className="min-w-0">
                {/* T-535: signed copy §4.6 (T-511 copy v1). */}
                <RadixDialog.Title
                  ref={titleRef}
                  tabIndex={-1}
                  className="nl-h2 text-nl-text focus:outline-none"
                >
                  Top up Ink
                </RadixDialog.Title>
              </div>
              {/* "Close": functional label, no signed string yet (T-525 report). */}
              <RadixDialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="nl-focus rounded-nl-md text-nl-soft hover:bg-nl-brass-light hover:text-nl-text -mr-nl-2 -mt-nl-1 inline-flex h-11 w-11 shrink-0 select-none items-center justify-center"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </RadixDialog.Close>
            </div>
            <p className="nl-body-sm text-nl-soft mt-nl-2 mb-0">
              Prices include GST. Top-up Ink does not expire while your account is open.
            </p>
          </header>

          {/* SKU list */}
          <div className="space-y-nl-2 px-nl-6 py-nl-4">
            {plansStatus === 'loading' && (
              // T-535: a skeleton with no visible copy (§4.6). The visually hidden "Loading" is the
              // functional status label approved earlier; the bars are aria-hidden.
              <div role="status">
                <span className="sr-only">Loading</span>
                <Skeleton lines={3} slowText="" className="py-nl-2" />
              </div>
            )}
            {plansStatus === 'error' && (
              <div
                role="alert"
                className="gap-nl-3 border-nl-err px-nl-4 py-nl-3 flex items-center justify-between border"
              >
                <p className="nl-body-sm text-nl-err m-0">Could not load top-up plans.</p>
                <Button ref={retryRef} variant="ghost" onClick={handleRetryPlans}>
                  Retry
                </Button>
              </div>
            )}
            {skus.map((sku, i) => {
              const isSelected = selectedId === sku.id;
              return (
                <button
                  key={sku.id}
                  ref={i === 0 ? firstSkuRef : undefined}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedId(sku.id);
                    setCoupon(null);
                    setCouponError('');
                  }}
                  className={cn(
                    'nl-focus gap-nl-3 rounded-nl-md p-nl-4 flex min-h-[44px] w-full select-none items-center border text-left',
                    isSelected
                      ? 'border-nl-brass bg-nl-brass-light'
                      : // T-525: unselected pack boundary is Control Line (WCAG 1.4.11).
                        'hover:bg-nl-brass-light border-[color:var(--line-control)]',
                  )}
                >
                  {/* Selection mark (decorative; the state is aria-pressed). */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      isSelected ? 'border-nl-brass' : 'border-nl-muted',
                    )}
                  >
                    {isSelected ? <span className="bg-nl-brass h-2 w-2 rounded-full" /> : null}
                  </span>
                  {/* T-535: the pack label is §4.6 ("3 Ink, ₹65") from the fetched plan; no
                      "Popular"/"Best value" chip (unsupported claim, t252 M1). */}
                  <span className="nl-body text-nl-text min-w-0 flex-1 font-medium tabular-nums">
                    {`${sku.ink} Ink, ₹${sku.priceInr}`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Coupon input */}
          <div className="border-nl-line px-nl-6 pb-nl-4 pt-nl-4 border-t">
            {coupon ? (
              <div className="bg-nl-ok-light px-nl-3 flex min-h-[44px] items-center justify-between">
                <div className="gap-nl-2 nl-body-sm text-nl-ok flex items-center">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span className="font-medium">{coupon.code}</span>
                  <span className="tabular-nums">− ₹{coupon.discountInr}</span>
                </div>
                {/* "Remove coupon": functional label approved by Priya (T-525). */}
                <button
                  type="button"
                  aria-label="Remove coupon"
                  onClick={() => {
                    setCoupon(null);
                    setCouponInput('');
                  }}
                  className="nl-focus rounded-nl-md text-nl-ok -mr-nl-3 inline-flex h-11 w-11 select-none items-center justify-center"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="gap-nl-2 flex">
                <div className="relative min-w-0 flex-1">
                  <Tag
                    size={16}
                    aria-hidden="true"
                    className="text-nl-muted absolute left-3 top-1/2 -translate-y-1/2"
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
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    className="nl-focus rounded-nl-md bg-nl-card text-nl-text placeholder:text-nl-muted py-nl-2 pr-nl-3 focus:border-nl-brass h-11 w-full border border-[color:var(--line-control)] pl-9 text-[16px] leading-6"
                  />
                </div>
                <Button
                  variant="ghost"
                  onClick={() => void handleApplyCoupon()}
                  disabled={couponValidating || !couponInput.trim()}
                  loading={couponValidating}
                >
                  Apply
                </Button>
              </div>
            )}
            {couponError && <p className="nl-body-sm text-nl-err mt-nl-2 mb-0">{couponError}</p>}
          </div>

          {/* T-436: State picker below the coupon, above Pay (spec §2); tab order coupon, State, Pay. */}
          <div className="px-nl-6 pb-nl-4">
            <GstStatePicker gst={gst} className="w-full" />
          </div>
          {/* T-343: P7 box above the pay button (only after a privacy block). */}
          <div className="px-nl-6">
            <PrivacyBlockedNotice actionKey="topup" />
          </div>
          {/* Footer: total + the one primary button in the dialog. */}
          <footer className="gap-nl-4 border-nl-line px-nl-6 py-nl-4 flex flex-wrap items-center justify-between border-t">
            <div>
              <p className="nl-label text-nl-muted m-0">You&apos;ll pay</p>
              {coupon && selected ? (
                <div className="gap-nl-2 flex items-baseline">
                  <p className="nl-h2 text-nl-text m-0 tabular-nums">
                    ₹{displayedTotal} <span className="nl-body-sm text-nl-soft">incl. GST</span>
                  </p>
                  <p className="nl-body-sm text-nl-muted m-0 tabular-nums line-through">
                    ₹{selected.priceInr}
                  </p>
                </div>
              ) : (
                <p className="nl-h2 text-nl-text m-0 tabular-nums">
                  ₹{displayedTotal} <span className="nl-body-sm text-nl-soft">incl. GST</span>
                </p>
              )}
            </div>
            <Button
              ref={payRef}
              variant="primary"
              onClick={handlePurchase}
              aria-describedby={privacyDescribedBy}
              disabled={!selected}
              loading={submitting}
            >
              Buy
            </Button>
          </footer>
          {error && (
            // T-565 item 45: the signed generic failure + Retry, in the plans-error pattern.
            <div className="px-nl-6 pb-nl-4">
              <div
                role="alert"
                className="gap-nl-3 border-nl-err px-nl-4 py-nl-3 flex items-center justify-between border"
              >
                <p className="nl-body-sm text-nl-err m-0">{error}</p>
                <Button ref={orderRetryRef} variant="ghost" onClick={handleRetryOrder}>
                  Retry
                </Button>
              </div>
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
