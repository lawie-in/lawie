'use client';

/**
 * B2 Change the document (T-126). A search over the documents by name, with
 * "Something else" always the last row. A dialog on desktop, a bottom sheet on
 * a phone. Escape and Cancel close it with nothing changed.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useRef, useState } from 'react';

import { KindSummary, NO_RULE_PACK } from './briefTypes';
import { input, secondaryButton, small, tagTeal } from './ui';

export default function ChangeDocumentDialog({
  open,
  onOpenChange,
  kinds,
  currentId,
  suggested,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kinds: KindSummary[];
  /** The document in use: a rule-pack id, or null when nothing fits. */
  currentId: string | null;
  /** Ids to list first before the advocate types anything. */
  suggested: string[];
  onChoose: (kindId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q !== '') return kinds.filter((k) => k.display_name.toLowerCase().includes(q));
    const first = new Set([...(currentId ? [currentId] : []), ...suggested]);
    return [
      ...kinds.filter((k) => first.has(k.template_id)),
      ...kinds
        .filter((k) => !first.has(k.template_id))
        .sort(
          (a, b) =>
            a.category.localeCompare(b.category) || a.display_name.localeCompare(b.display_name),
        ),
    ];
  }, [kinds, query, currentId, suggested]);

  const moveFocus = (from: HTMLElement | null, step: 1 | -1) => {
    const options = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    if (options.length === 0) return;
    const at = from ? options.indexOf(from as HTMLButtonElement) : -1;
    const next = at < 0 ? (step === 1 ? 0 : options.length - 1) : at + step;
    options[Math.max(0, Math.min(options.length - 1, next))]?.focus();
  };

  const choose = (id: string) => {
    setQuery('');
    onChoose(id);
  };

  const row =
    'focus-visible:ring-brand-teal flex min-h-[48px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) setQuery('');
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-brand-navy/55 fixed inset-0 z-40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col gap-4 rounded-t-2xl bg-white p-5 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[12vh] sm:max-h-[76vh] sm:w-[560px] sm:-translate-x-1/2 sm:rounded-2xl sm:p-7"
        >
          <Dialog.Title className="font-heading text-brand-navy text-2xl font-semibold">
            Which document do you need?
          </Dialog.Title>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveFocus(null, 1);
              }
            }}
            placeholder="Search by name"
            aria-label="Search documents by name"
            autoFocus
            className={input}
          />
          <p className={small} aria-live="polite">
            {query.trim() === ''
              ? `${kinds.length} documents`
              : `${rows.length} of ${kinds.length} documents`}
          </p>
          <div
            ref={listRef}
            role="listbox"
            aria-label="Documents"
            className="border-brand-line divide-brand-line min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                moveFocus(document.activeElement as HTMLElement, e.key === 'ArrowDown' ? 1 : -1);
              }
            }}
          >
            {rows.map((k) => {
              const current = k.template_id === currentId;
              return (
                <button
                  key={k.template_id}
                  type="button"
                  role="option"
                  aria-selected={current}
                  onClick={() => choose(k.template_id)}
                  className={`${row} ${current ? 'bg-brand-teal-light' : 'bg-white hover:bg-slate-50'}`}
                >
                  <span className="text-brand-navy">
                    {k.display_name}
                    {current && <span className={`${tagTeal} ml-2`}>Current</span>}
                  </span>
                  <span className="text-brand-muted text-xs capitalize">
                    {k.category.replace(/_/g, ' ')}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              role="option"
              aria-selected={currentId === null}
              onClick={() => choose(NO_RULE_PACK)}
              className={`${row} bg-brand-page font-semibold`}
            >
              <span className="text-brand-navy">Something else</span>
              <span className="text-brand-muted text-xs font-normal">Not in this list</span>
            </button>
          </div>
          <div className="flex justify-end">
            <Dialog.Close className={`${secondaryButton} w-full sm:w-auto`}>Cancel</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
