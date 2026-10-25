'use client';

// T-511 part A: toasts on @radix-ui/react-toast (spec 3). info, success, error. Info and success
// dismiss after 6s; error stays until closed. Bottom (full width) on mobile, bottom right on
// desktop. 200ms in/out, a fade under reduced motion. Not mounted globally in part A: wrap a
// subtree in <ToastProvider closeLabel=…> and call useToast().show(…).

import * as RadixToast from '@radix-ui/react-toast';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/cn';

export type ToastKind = 'info' | 'success' | 'error';

export const TOAST_AUTO_DISMISS_MS = 6000;
/** Closed toasts leave state after this, even if animationend never fires (reduced motion off
 *  screen, hidden tab, jsdom). Longer than the 200ms exit animation. */
export const TOAST_REMOVE_AFTER_MS = 300;

export interface ToastOptions {
  kind?: ToastKind;
  title?: React.ReactNode;
  message: React.ReactNode;
  /** One action (e.g. Retry). `altText` describes it for screen readers (Radix requirement). */
  action?: { label: string; onClick: () => void; altText?: string };
}

interface ToastItem extends ToastOptions {
  id: number;
  open: boolean;
}

export interface ToastContextValue {
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND: Record<ToastKind, string> = {
  info: 'border-nl-line',
  success: 'border-nl-ok',
  error: 'border-nl-err',
};

export interface ToastProviderProps {
  children: React.ReactNode;
  /** Accessible name of each toast's close button. Required: the copy file has no string yet. */
  closeLabel: string;
  /** Radix viewport region label; Radix's English default is used when omitted. */
  viewportLabel?: string;
}

export function ToastProvider({ children, closeLabel, viewportLabel }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const removeTimers = useRef(new Map<number, number>());

  const remove = useCallback((id: number) => {
    const timer = removeTimers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      removeTimers.current.delete(id);
    }
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setItems((list) => list.map((t) => (t.id === id ? { ...t, open: false } : t)));
      if (!removeTimers.current.has(id)) {
        removeTimers.current.set(
          id,
          window.setTimeout(() => remove(id), TOAST_REMOVE_AFTER_MS),
        );
      }
    },
    [remove],
  );

  useEffect(() => {
    const timers = removeTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setItems((list) => [...list, { kind: 'info', ...options, id, open: true }]);
    return id;
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider
        swipeDirection="right"
        duration={TOAST_AUTO_DISMISS_MS}
        label={viewportLabel}
      >
        {children}
        {items.map((t) => {
          const kind = t.kind ?? 'info';
          return (
            <RadixToast.Root
              key={t.id}
              open={t.open}
              onOpenChange={(open) => {
                if (!open) dismiss(t.id);
              }}
              onAnimationEnd={() => {
                if (!t.open) remove(t.id);
              }}
              // Error stays until closed (spec 3).
              duration={kind === 'error' ? Infinity : TOAST_AUTO_DISMISS_MS}
              type={kind === 'error' ? 'foreground' : 'background'}
              data-kind={kind}
              className={cn(
                'nl nl-toast gap-nl-3 rounded-nl-md bg-nl-card p-nl-4 text-nl-text shadow-nl-card flex items-start border border-l-4',
                KIND[kind],
              )}
            >
              <div className="min-w-0 flex-1">
                {t.title ? (
                  <RadixToast.Title className="nl-h3 text-nl-text">{t.title}</RadixToast.Title>
                ) : null}
                <RadixToast.Description className="nl-body-sm text-nl-soft">
                  {t.message}
                </RadixToast.Description>
              </div>
              {t.action ? (
                <RadixToast.Action
                  altText={t.action.altText ?? t.action.label}
                  onClick={t.action.onClick}
                  className="nl-focus nl-body-sm rounded-nl-md px-nl-3 text-nl-brass-dark inline-flex min-h-[44px] items-center font-medium"
                >
                  {t.action.label}
                </RadixToast.Action>
              ) : null}
              <RadixToast.Close
                aria-label={closeLabel}
                className="nl-focus rounded-nl-md text-nl-muted inline-flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport
          className={cn(
            'nl gap-nl-2 p-nl-4 fixed inset-x-0 bottom-0 z-[100] m-0 flex list-none flex-col outline-none',
            // T-531: clear of the home indicator and the side insets (viewport-fit=cover).
            'pb-[calc(var(--space-4)+env(safe-area-inset-bottom,0px))]',
            'pl-[max(var(--space-4),env(safe-area-inset-left,0px))] pr-[max(var(--space-4),env(safe-area-inset-right,0px))]',
            'min-[641px]:left-auto min-[641px]:w-[420px] min-[641px]:max-w-[100vw]',
          )}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

/** Show and dismiss toasts. Throws outside a ToastProvider so a missing provider is caught early. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
