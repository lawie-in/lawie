'use client';

/**
 * T-436 (b) — the State picker before payment (Rajesh's spec,
 * handoff/marketing/state-picker-spec-t436.md; strings, Madhuri,
 * handoff/marketing/copy/t436-ui-strings.md section A, word for word; the help line approved
 * by Ajay).
 *
 * A native <select> of the 36 GST States/UTs (GST_STATES, A-Z by name, code stored, not shown),
 * pre-filled when set, saved on change through useGstState (PATCH /api/auth/me). Never guesses
 * a default. The same component in the Plan block, above Upgrade, and in the top-up modal.
 * Its P7 box (T-343) shows here when a save was blocked for privacy (Ajay, GST Addendum 7 (2)).
 */
import { GST_STATES } from '@lawie/shared';
import { useEffect, useId } from 'react';

import { PrivacyBlockedNotice } from '@/components/PrivacyUpdatePrompt';
import type { GstStateController } from '@/hooks/useGstState';
import { cn } from '@/lib/cn';

/** Madhuri, t436-ui-strings.md section A. Word for word. */
export const GST_STATE_STRINGS = {
  label: 'State',
  placeholder: 'Select your State',
  // Purpose phrase is Ajay's; the sentence approved by Ajay (packet, 15 Oct 2026).
  help: 'We use this to issue GST tax invoices.',
  required: 'Select your State to continue.',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Could not save. Try again.',
} as const;

/** Madhuri, t436-ui-strings.md section C (the settings nag). Word for word. */
export const GST_STATE_NAG_STRINGS = {
  nag: 'Your State is not set.',
  action: 'Set your State',
} as const;

/**
 * T-525: Night Library field look, same as the boxed ui Input (DESIGN.md Inputs: Settings forms):
 * label in Body Small Text Soft, 44px control, 16px text (no iOS focus zoom), 1px Control Line border,
 * 4px radius, Card fill; focus is a 2px Brass bottom border; error is a Rust border; disabled .5.
 * The control stays a native <select> (keyboard, screen readers and the phone picker for free).
 */
const LABEL_CLASS = 'nl-body-sm font-medium text-nl-soft';
const SELECT_CLASS =
  'nl-focus nl-body block w-full min-h-[44px] rounded-nl-md border bg-nl-card px-nl-3 py-nl-2 text-nl-text ' +
  'focus:border-b-2 focus:pb-[7px] focus:outline-none focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
const NOTE_CLASS = 'nl-body-sm text-nl-muted';

/** Spec §3: options A-Z by State name. */
const OPTIONS = [...GST_STATES].sort((a, b) => a.name.localeCompare(b.name, 'en'));

export interface GstStatePickerProps {
  gst: GstStateController;
  /** Fixed id for the select (the settings nag focuses it); default a generated one. */
  id?: string;
  /** Layout: 'max-w-xs' in the Plan block, full width in the modal (spec §3). */
  className?: string;
}

export function GstStatePicker({ gst, id, className = '' }: GstStatePickerProps) {
  const autoId = useId();
  const selectId = id ?? `gst-state-${autoId}`;
  const helpId = `${selectId}-help`;
  const errorId = `${selectId}-error`;

  const { focusTick, selectRef } = gst;
  // Spec §6: a blocked Pay moves focus to the select (never opens the list).
  useEffect(() => {
    if (focusTick > 0) selectRef.current?.focus();
  }, [focusTick, selectRef]);

  const error = gst.requiredError
    ? GST_STATE_STRINGS.required
    : gst.status === 'failed'
      ? GST_STATE_STRINGS.failed
      : '';
  const live =
    gst.status === 'saving'
      ? GST_STATE_STRINGS.saving
      : gst.status === 'saved'
        ? GST_STATE_STRINGS.saved
        : '';

  return (
    <div className={cn('nl gap-nl-1 flex flex-col', className)}>
      <label htmlFor={selectId} className={LABEL_CLASS}>
        {GST_STATE_STRINGS.label}
      </label>
      <select
        id={selectId}
        ref={selectRef}
        value={gst.value}
        onChange={(e) => gst.onChange(e.target.value)}
        disabled={gst.status === 'saving'}
        required
        aria-required="true"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${helpId} ${errorId}` : helpId}
        className={cn(
          SELECT_CLASS,
          error ? 'border-nl-err' : 'focus:border-nl-brass border-[color:var(--line-control)]',
        )}
      >
        <option value="" disabled>
          {GST_STATE_STRINGS.placeholder}
        </option>
        {OPTIONS.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
      <p id={helpId} className={NOTE_CLASS}>
        {GST_STATE_STRINGS.help}
      </p>
      {error && (
        <p id={errorId} role="alert" className="nl-body-sm text-nl-err">
          {error}
        </p>
      )}
      {/* Spec §6: always in the DOM. */}
      <p aria-live="polite" className={cn(NOTE_CLASS, 'min-h-[1em]')}>
        {live}
      </p>
      <PrivacyBlockedNotice actionKey={gst.actionKey} />
    </div>
  );
}

export default GstStatePicker;
