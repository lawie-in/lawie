'use client';

/**
 * T-194 — the warning before exporting a draft that still has blanks (Rajesh's
 * design, claude.ai artifact 6T24aZ5ihZY2R1G7MgZGtA). A dialog on desktop, a
 * bottom sheet on a phone. Nothing is generated until the advocate picks
 * "Export … anyway". Escape and the overlay go back, as "Go back and fill" does.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { useRef } from 'react';

import { primaryButton, secondaryButton } from '../intake/ui';

import { draftHeaderText } from './exportUtils';

/** How many labels the list shows before "and M more". */
const LIST_MAX = 5;

/**
 * Signed by Ajay, 11 Oct 2026, (c). The last sentence of the dialog body, word
 * for word. Changes only with his sign-off.
 */
const DO_NOT_FILE =
  'Do not file this document until each item is filled in or removed. You are responsible for what is filed.';

export default function ExportBlanksDialog({
  open,
  count,
  labels,
  format,
  onExport,
  onBack,
}: {
  open: boolean;
  /** Every blank in the saved draft (the header's N). */
  count: number;
  /** Each blank's label once, in document order. */
  labels: string[];
  format: 'pdf' | 'docx';
  /** Close and export as is, with the header and the blank style. */
  onExport: () => void;
  /** Close and put the cursor on the first blank. */
  onBack: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  // Going back hands focus to the editor, so Radix must not return it to the
  // export button. Exporting lets it return there as usual.
  const exportingRef = useRef(false);

  const shown = labels.slice(0, LIST_MAX);
  const more = labels.length - shown.length;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onBack();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-brand-navy/55 fixed inset-0 z-40" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            backRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            if (!exportingRef.current) e.preventDefault();
            exportingRef.current = false;
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[14vh] sm:w-[480px] sm:-translate-x-1/2 sm:rounded-2xl sm:p-7"
        >
          <span
            aria-hidden="true"
            className="bg-brand-gold-light flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          >
            <AlertTriangle size={20} className="text-brand-gold-dark" />
          </span>

          <Dialog.Title className="font-heading text-brand-navy text-[22px] font-semibold sm:text-2xl">
            {count === 1 ? '1 item still to be confirmed' : `${count} items still to be confirmed`}
          </Dialog.Title>

          <Dialog.Description asChild>
            <div className="text-brand-navy flex flex-col gap-4 text-[15px] leading-6">
              <p>
                They are marked [To be confirmed] in your draft. If you export now, each one prints
                in bold and highlighted, and every page carries this header:
              </p>

              <p className="border-brand-line rounded border border-dashed bg-white px-3 py-2 text-center font-serif text-[13px] font-bold text-black">
                {draftHeaderText(count)}
              </p>

              {shown.length > 0 && (
                <div className="border-brand-line overflow-hidden rounded-lg border">
                  <p className="bg-brand-page text-brand-muted px-3 py-2 text-xs font-semibold">
                    Still blank
                  </p>
                  <ul className="divide-brand-line border-brand-line divide-y border-t">
                    {shown.map((label, i) => (
                      <li key={`${i}-${label}`} className="text-brand-navy px-3 py-2 text-sm">
                        {label}
                      </li>
                    ))}
                    {more > 0 && (
                      <li className="text-brand-muted px-3 py-2 text-sm">and {more} more</li>
                    )}
                  </ul>
                </div>
              )}

              <p>{DO_NOT_FILE}</p>
            </div>
          </Dialog.Description>

          {/* Phone: stacked, "Go back and fill" on top. sm+: one row, export left, go back right. */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                exportingRef.current = true;
                onExport();
              }}
              className={`${secondaryButton} min-h-[48px] w-full sm:w-auto`}
            >
              {format === 'pdf' ? 'Export PDF anyway' : 'Export DOCX anyway'}
            </button>
            <button
              ref={backRef}
              type="button"
              onClick={onBack}
              className={`${primaryButton} w-full sm:w-auto`}
            >
              Go back and fill
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
