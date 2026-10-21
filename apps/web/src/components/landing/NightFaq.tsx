'use client';

// T-517: FAQ accordion (spec 01: 6 questions, accordion, one open). The first answer is open on
// load; opening another closes it. Disclosure buttons with aria-expanded / aria-controls, inside
// headings. No height animation (nothing to stop under reduced motion).

import { useId, useState } from 'react';

import type { FaqItem } from '@/components/marketing/nl-copy';
import { cn } from '@/lib/cn';

export function NightFaq({ items, lang }: { items: FaqItem[]; lang?: string }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div lang={lang} className="border-nl-line border-t">
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `${base}-panel-${i}`;
        const buttonId = `${base}-button-${i}`;
        return (
          <div key={item.q} className="border-nl-line border-b">
            <h3 className="nl-h3 m-0">
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="nl-focus gap-nl-4 py-nl-4 text-nl-text flex min-h-[44px] w-full items-center justify-between border-0 bg-transparent text-left"
              >
                <span>{item.q}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'text-nl-brass-dark shrink-0 text-2xl leading-none transition-transform duration-150 motion-reduce:transition-none',
                    isOpen && 'rotate-45',
                  )}
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="nl-body text-nl-soft pb-nl-4 max-w-[65ch]"
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
