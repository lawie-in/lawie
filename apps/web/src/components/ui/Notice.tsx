// T-690b (Rajesh, 30 Oct 2026): Notice, an inline note inside a folio or panel. `warn` is the
// amber soft-finding look: amber-soft fill (--warn-light), 1px --line border, radius 4
// (--radius-md), padding 12/16, AlertTriangle 20px in amber (--warn), text in Body Small in the
// Text colour. role="status", never alert. No button, no dismiss, no heading: the text is the
// only content and is printed as passed (signed copy is never reworded or cut; it wraps).
// The spec's --amber / --amber-soft are the Night Library --warn / --warn-light tokens.

import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/cn';

export type NoticeVariant = 'warn';

export interface NoticeProps {
  variant: NoticeVariant;
  /** The signed text, shown verbatim. */
  text: string;
  className?: string;
}

const VARIANT: Record<NoticeVariant, { box: string; icon: string }> = {
  warn: { box: 'bg-nl-warn-light', icon: 'text-nl-warn' },
};

export function Notice({ variant, text, className }: NoticeProps) {
  const look = VARIANT[variant];
  return (
    <div
      role="status"
      data-variant={variant}
      className={cn(
        'nl border-nl-line rounded-nl-md gap-nl-3 px-nl-4 py-nl-3 flex items-start border',
        look.box,
        className,
      )}
    >
      <AlertTriangle size={20} aria-hidden="true" className={cn('flex-none', look.icon)} />
      <p className="nl-body-sm text-nl-text min-w-0 flex-1 whitespace-pre-line break-words">
        {text}
      </p>
    </div>
  );
}
