'use client';

// T-511 part A: confirm / destructive Dialog on @radix-ui/react-dialog (spec 3). A centred
// dialog on desktop, a bottom sheet at <= 640px (T-005 rule; spec 5). Cancel is ghost, confirm is
// primary or destructive (ox fill). All copy from props.

import * as RadixDialog from '@radix-ui/react-dialog';

import { Button } from './Button';

import { cn } from '@/lib/cn';

export type DialogVariant = 'confirm' | 'destructive';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Extra body content under the description. */
  children?: React.ReactNode;
  variant?: DialogVariant;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Confirm shows a spinner; both buttons are disabled. */
  confirmLoading?: boolean;
  /** Inline error under the body (e.g. "Could not cancel your plan. Try again."). */
  error?: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  variant = 'confirm',
  confirmLabel,
  cancelLabel,
  onConfirm,
  confirmLoading = false,
  error,
  className,
}: DialogProps) {
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (confirmLoading && !next) return;
        onOpenChange(next);
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="nl fixed inset-0 z-50 bg-black/50" />
        <RadixDialog.Content
          data-variant={variant}
          // Without a description, tell Radix there is none (no missing-description warning).
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'nl nl-root gap-nl-4 border-nl-line bg-nl-card p-nl-6 text-nl-text shadow-nl-card fixed z-50 flex flex-col border',
            // Bottom sheet at <= 640px.
            'rounded-t-nl-md inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto',
            // Dialog above 640px.
            'min-[641px]:rounded-nl-md min-[641px]:inset-x-auto min-[641px]:bottom-auto min-[641px]:left-1/2 min-[641px]:top-1/2 min-[641px]:w-[min(440px,calc(100vw-32px))] min-[641px]:-translate-x-1/2 min-[641px]:-translate-y-1/2',
            'focus:outline-none',
            className,
          )}
        >
          <RadixDialog.Title className="nl-h2 text-nl-text">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="nl-body text-nl-soft">
              {description}
            </RadixDialog.Description>
          ) : null}
          {children}
          {error ? (
            <p className="nl-body-sm text-nl-err" role="alert">
              {error}
            </p>
          ) : null}
          <div className="gap-nl-3 flex flex-col-reverse min-[641px]:flex-row min-[641px]:justify-end">
            <RadixDialog.Close asChild>
              <Button variant="ghost" disabled={confirmLoading}>
                {cancelLabel}
              </Button>
            </RadixDialog.Close>
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'primary'}
              loading={confirmLoading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
