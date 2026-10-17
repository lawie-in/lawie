'use client';

// T-511 part A: Input and Textarea (spec 3). Underline style on the folio, boxed style (1px
// border/line, radius md) in Settings forms. States: default, focus (bottom border brass/fill
// 2px), error (error/text border + message, aria-invalid, aria-describedby), disabled.

import { forwardRef, useId } from 'react';

import { cn } from '@/lib/cn';

export type FieldAppearance = 'underline' | 'boxed';

interface FieldOwnProps {
  /** Visible label. Pass `aria-label` instead only where the design has no visible label. */
  label?: React.ReactNode;
  help?: React.ReactNode;
  /** Error message; sets aria-invalid and is linked with aria-describedby. */
  error?: React.ReactNode;
  appearance?: FieldAppearance;
  /** Class for the wrapper; `className` goes to the control. */
  wrapperClassName?: string;
}

function controlClasses(appearance: FieldAppearance, invalid: boolean): string {
  return cn(
    'nl-focus nl-body block w-full min-h-[44px] text-nl-text placeholder:text-nl-muted',
    'disabled:cursor-not-allowed disabled:opacity-50',
    // Focus adds 1px of bottom border; it comes out of the bottom padding (8px -> 7px), so the
    // control does not grow.
    appearance === 'underline'
      ? 'rounded-none border-0 border-b bg-transparent px-0 py-nl-2 focus:border-b-2 focus:pb-[7px]'
      : 'rounded-nl-md border bg-nl-card px-nl-3 py-nl-2 focus:border-b-2 focus:pb-[7px]',
    invalid ? 'border-nl-err' : 'border-nl-line focus:border-nl-brass',
    'focus:outline-none focus-visible:outline-none',
  );
}

function useFieldIds(id: string | undefined, help: unknown, error: unknown, describedBy?: string) {
  const auto = useId();
  const controlId = id ?? `nl-field-${auto}`;
  const helpId = help ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedByAll = [describedBy, helpId, errorId].filter(Boolean).join(' ') || undefined;
  return { controlId, helpId, errorId, describedByAll };
}

function FieldFrame({
  controlId,
  label,
  help,
  helpId,
  error,
  errorId,
  wrapperClassName,
  children,
}: {
  controlId: string;
  label?: React.ReactNode;
  help?: React.ReactNode;
  helpId?: string;
  error?: React.ReactNode;
  errorId?: string;
  wrapperClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('nl gap-nl-1 flex flex-col', wrapperClassName)}>
      {label ? (
        <label htmlFor={controlId} className="nl-body-sm text-nl-soft font-medium">
          {label}
        </label>
      ) : null}
      {children}
      {help ? (
        <p id={helpId} className="nl-body-sm text-nl-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="nl-body-sm text-nl-err">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = FieldOwnProps & React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, help, error, appearance = 'boxed', wrapperClassName, className, id, ...rest },
  ref,
) {
  const { controlId, helpId, errorId, describedByAll } = useFieldIds(
    id,
    help,
    error,
    rest['aria-describedby'],
  );
  return (
    <FieldFrame
      controlId={controlId}
      label={label}
      help={help}
      helpId={helpId}
      error={error}
      errorId={errorId}
      wrapperClassName={wrapperClassName}
    >
      <input
        ref={ref}
        id={controlId}
        {...rest}
        aria-invalid={error ? true : rest['aria-invalid']}
        aria-describedby={describedByAll}
        className={cn(controlClasses(appearance, Boolean(error)), className)}
      />
    </FieldFrame>
  );
});

export type TextareaProps = FieldOwnProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, help, error, appearance = 'boxed', wrapperClassName, className, id, rows = 4, ...rest },
  ref,
) {
  const { controlId, helpId, errorId, describedByAll } = useFieldIds(
    id,
    help,
    error,
    rest['aria-describedby'],
  );
  return (
    <FieldFrame
      controlId={controlId}
      label={label}
      help={help}
      helpId={helpId}
      error={error}
      errorId={errorId}
      wrapperClassName={wrapperClassName}
    >
      <textarea
        ref={ref}
        id={controlId}
        rows={rows}
        {...rest}
        aria-invalid={error ? true : rest['aria-invalid']}
        aria-describedby={describedByAll}
        className={cn(controlClasses(appearance, Boolean(error)), 'resize-y', className)}
      />
    </FieldFrame>
  );
});
