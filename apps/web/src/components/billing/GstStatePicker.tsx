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

import { input, label as labelClass, small } from '@/components/intake/ui';
import { PrivacyBlockedNotice } from '@/components/PrivacyUpdatePrompt';
import type { GstStateController } from '@/hooks/useGstState';

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
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={selectId} className={labelClass}>
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
        className={`${input} disabled:opacity-60 ${error ? 'border-brand-error' : ''}`}
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
      <p id={helpId} className={small}>
        {GST_STATE_STRINGS.help}
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-brand-error text-[13px]">
          {error}
        </p>
      )}
      {/* Spec §6: always in the DOM. */}
      <p aria-live="polite" className={`${small} min-h-[1em]`}>
        {live}
      </p>
      <PrivacyBlockedNotice actionKey={gst.actionKey} />
    </div>
  );
}

export default GstStatePicker;
