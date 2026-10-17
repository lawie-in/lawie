'use client';

// T-511 part A: the command bar (spec 3 "Command bar", 2.5; copy 3.5). Radix Popover with our own
// listbox (no cmdk, Arjun 17 Oct). Collapsed: labelled input + "Ctrl K" hint + Draft button. Open:
// a popover list; quick chips while the input is empty, matching items while typing, a no-results
// line when nothing matches. Props only: no routing, no API.
//
// Keyboard: Ctrl+K / Cmd+K focuses it from anywhere while it is mounted (opt out with
// hotkey={false}); ArrowDown/ArrowUp move through the options; Enter picks the highlighted option
// or, with none highlighted, submits the text (Draft); Escape closes.
//
// HOTKEY CONFLICT: components/sections/SectionFinderPanel.tsx also binds Ctrl/Cmd+K on window
// (it toggles the section finder). If both are mounted on one page, both handlers fire. Mount the
// command bar with hotkey={false} on pages that show the section finder until that is resolved.

import * as Popover from '@radix-ui/react-popover';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface CommandBarItem {
  id: string;
  label: string;
  /** Extra words that match this item. */
  keywords?: string[];
}

/** Copy 3.5 (English). */
export const COMMAND_BAR_COPY = {
  label: 'What do you need to draft?',
  placeholder: 'A bail application for a client arrested on Tuesday…',
  hint: 'Ctrl K',
  hintMac: '⌘ K',
  hintAriaLabel: 'Press Control and K to jump here',
  submit: 'Draft',
  noResults: 'No template matches. Describe it in your own words and press Draft.',
} as const;

/** Copy 3.5 quick chips. The ids are what onSelect receives. */
export const DEFAULT_QUICK_CHIPS: CommandBarItem[] = [
  { id: 'bail-application', label: 'Bail application' },
  { id: 'legal-notice', label: 'Legal notice' },
  { id: 'written-statement', label: 'Written statement' },
  { id: 'plaint', label: 'Plaint' },
  { id: 'browse-all-templates', label: 'Browse all templates' },
];

export type CommandBarPhase = 'idle' | 'focus' | 'results' | 'no-results';

/**
 * Default matching: case-insensitive; an item matches when its label or a keyword contains the
 * query, or the query contains the label or keyword (so a typed description finds its template).
 */
export function defaultCommandFilter(items: CommandBarItem[], query: string): CommandBarItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    [item.label, ...(item.keywords ?? [])].some((s) => {
      const t = s.trim().toLowerCase();
      return t.length > 0 && (t.includes(q) || q.includes(t));
    }),
  );
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const source = navigator.platform || navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(source);
}

export interface CommandBarProps {
  /** Searchable items (e.g. templates). */
  items?: CommandBarItem[];
  /** Shown while the input is empty. */
  quickChips?: CommandBarItem[];
  /** An option or quick chip was picked. */
  onSelect: (item: CommandBarItem) => void;
  /** Draft pressed (or Enter with nothing highlighted) with non-empty text. */
  onSubmit: (text: string) => void;
  /** Replaces the default matching. */
  filter?: (items: CommandBarItem[], query: string) => CommandBarItem[];
  maxResults?: number;
  /** Ctrl/Cmd+K focuses this bar while mounted. Default true. */
  hotkey?: boolean;
  /** Draft button spinner. */
  submitting?: boolean;
  disabled?: boolean;
  defaultValue?: string;
  label?: string;
  hideLabel?: boolean;
  placeholder?: string;
  submitLabel?: string;
  /** Visible hint; defaults to "Ctrl K", or "⌘ K" on Apple platforms. */
  hintLabel?: string;
  hintAriaLabel?: string;
  noResultsText?: string;
  className?: string;
}

export function CommandBar({
  items = [],
  quickChips = DEFAULT_QUICK_CHIPS,
  onSelect,
  onSubmit,
  filter = defaultCommandFilter,
  maxResults = 8,
  hotkey = true,
  submitting = false,
  disabled = false,
  defaultValue = '',
  label = COMMAND_BAR_COPY.label,
  hideLabel = false,
  placeholder = COMMAND_BAR_COPY.placeholder,
  submitLabel = COMMAND_BAR_COPY.submit,
  hintLabel,
  hintAriaLabel = COMMAND_BAR_COPY.hintAriaLabel,
  noResultsText = COMMAND_BAR_COPY.noResults,
  className,
}: CommandBarProps) {
  const baseId = `nl-cmd-${useId().replace(/:/g, '')}`;
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const hintId = `${baseId}-hint`;
  const optionId = (i: number) => `${baseId}-option-${i}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(isMacPlatform());
  }, []);

  const typing = query.trim().length > 0;
  const options = useMemo(
    () => (typing ? filter(items, query).slice(0, Math.max(0, maxResults)) : quickChips),
    [typing, filter, items, query, maxResults, quickChips],
  );
  const phase: CommandBarPhase = !open
    ? 'idle'
    : !typing
      ? 'focus'
      : options.length > 0
        ? 'results'
        : 'no-results';

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
    setOpen(true);
  }, []);

  // Ctrl+K / Cmd+K, registered only while mounted and enabled.
  useEffect(() => {
    if (!hotkey || disabled || typeof window === 'undefined') return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (typeof e.key !== 'string' || e.key.toLowerCase() !== 'k') return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      focusInput();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hotkey, disabled, focusInput]);

  // Keep the highlighted option in range when the list changes.
  useEffect(() => {
    setActiveIndex((i) => (i >= options.length ? -1 : i));
  }, [options.length]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const select = useCallback(
    (item: CommandBarItem) => {
      close();
      onSelect(item);
    },
    [close, onSelect],
  );

  const submit = useCallback(() => {
    const text = query.trim();
    if (!text) {
      focusInput();
      return;
    }
    close();
    onSubmit(text);
  }, [query, focusInput, close, onSubmit]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(n > 0 ? 0 : -1);
        } else if (n > 0) {
          setActiveIndex((i) => (i + 1) % n);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(n > 0 ? n - 1 : -1);
        } else if (n > 0) {
          setActiveIndex((i) => (i <= 0 ? n - 1 : i - 1));
        }
        break;
      case 'Enter':
        if (open && activeIndex >= 0 && activeIndex < n) {
          e.preventDefault();
          select(options[activeIndex]);
        }
        // Otherwise the form submits (Draft).
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          close();
        }
        break;
      default:
        break;
    }
  };

  const hint = hintLabel ?? (isMac ? COMMAND_BAR_COPY.hintMac : COMMAND_BAR_COPY.hint);
  const activeId =
    open && activeIndex >= 0 && activeIndex < options.length ? optionId(activeIndex) : undefined;

  return (
    <Popover.Root
      open={open && !disabled}
      onOpenChange={(next) => {
        if (!next) close();
        else setOpen(true);
      }}
    >
      <form
        role="search"
        aria-labelledby={`${inputId}-label`}
        data-phase={phase}
        className={cn('nl gap-nl-2 flex w-full flex-col', className)}
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && !submitting) submit();
        }}
      >
        <label
          id={`${inputId}-label`}
          htmlFor={inputId}
          className={cn('nl-body-sm text-nl-soft font-medium', hideLabel && 'sr-only')}
        >
          {label}
        </label>
        <Popover.Anchor asChild>
          <div
            ref={anchorRef}
            className={cn(
              'gap-nl-2 rounded-nl-md border-nl-line bg-nl-card pl-nl-3 flex w-full items-center border py-1 pr-1',
              'has-[input:focus-visible]:border-nl-brass has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-[3px] has-[input:focus-visible]:outline-[color:var(--brass)]',
              disabled && 'opacity-50',
            )}
          >
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={open && !disabled}
              aria-controls={open && !disabled ? listboxId : undefined}
              aria-activedescendant={activeId}
              aria-describedby={hotkey ? hintId : undefined}
              disabled={disabled}
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setOpen(true)}
              onBlur={(e) => {
                const next = e.relatedTarget as Node | null;
                if (
                  next &&
                  (contentRef.current?.contains(next) || anchorRef.current?.contains(next))
                )
                  return;
                close();
              }}
              onKeyDown={onKeyDown}
              className="nl-body text-nl-text placeholder:text-nl-muted min-h-[44px] min-w-0 flex-1 border-0 bg-transparent p-0 focus:outline-none disabled:cursor-not-allowed"
            />
            {hotkey ? (
              <>
                <kbd
                  aria-hidden="true"
                  className="rounded-nl-sm border-nl-line px-nl-2 font-nl-body text-nl-muted hidden shrink-0 border text-[12px] leading-5 min-[641px]:inline-block"
                >
                  {hint}
                </kbd>
                <span id={hintId} className="sr-only">
                  {hintAriaLabel}
                </span>
              </>
            ) : null}
            <Button type="submit" loading={submitting} disabled={disabled}>
              {submitLabel}
            </Button>
          </div>
        </Popover.Anchor>
      </form>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          // Our listbox carries the semantics; drop Radix's role="dialog" wrapper.
          role={undefined}
          side="bottom"
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          data-phase={phase}
          className="nl rounded-nl-md border-nl-line bg-nl-card p-nl-2 text-nl-text shadow-nl-card z-50 w-[var(--radix-popper-anchor-width)] max-w-[100vw] border"
        >
          <ul
            id={listboxId}
            role="listbox"
            aria-label={label}
            className={cn(
              'm-0 list-none p-0',
              typing ? 'flex flex-col' : 'gap-nl-2 flex flex-wrap',
            )}
          >
            {options.map((item, i) => {
              const active = i === activeIndex;
              return (
                <li
                  key={item.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={active}
                  data-active={active || undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActiveIndex(i)}
                  onClick={() => select(item)}
                  className={cn(
                    'flex min-h-[44px] cursor-pointer items-center',
                    typing
                      ? 'nl-body rounded-nl-sm px-nl-3 text-nl-text'
                      : 'nl-body-sm rounded-nl-pill border-nl-line px-nl-4 text-nl-soft border font-medium',
                    active &&
                      'bg-nl-brass-light text-nl-brass-dark outline outline-2 outline-offset-[1px] outline-[color:var(--brass)]',
                  )}
                >
                  {item.label}
                </li>
              );
            })}
          </ul>
          {phase === 'no-results' ? (
            <p role="status" className="nl-body-sm px-nl-3 py-nl-2 text-nl-soft m-0">
              {noResultsText}
            </p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
