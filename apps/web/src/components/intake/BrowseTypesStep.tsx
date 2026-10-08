'use client';

/**
 * G1 Browse document types (T-126, decision D1). The old gallery, kept as a
 * way to browse. A card no longer opens a form: it opens the describe screen
 * with the document already set.
 */
import { Loader2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { KindSummary } from './briefTypes';
import { h1, input, linkButton, sub, tagPlain } from './ui';

export default function BrowseTypesStep({
  kinds,
  loading,
  onPick,
  onDescribe,
}: {
  kinds: KindSummary[];
  loading: boolean;
  onPick: (kind: KindSummary) => void;
  /** "I do not see my document": describe with nothing set. */
  onDescribe: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const k of kinds) counts.set(k.category, (counts.get(k.category) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }, [kinds]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kinds.filter(
      (k) =>
        (category === 'all' || k.category === category) &&
        (q === '' ||
          k.display_name.toLowerCase().includes(q) ||
          k.description.toLowerCase().includes(q)),
    );
  }, [kinds, query, category]);

  const chip = (on: boolean) =>
    `focus-visible:ring-brand-teal inline-flex min-h-[40px] items-center rounded-full border px-3.5 text-sm capitalize focus:outline-none focus-visible:ring-2 ${
      on ? 'bg-brand-navy border-brand-navy font-medium text-white' : 'border-brand-line bg-white'
    }`;

  return (
    <div className="mx-auto w-full max-w-[960px]">
      <h1 className={h1}>Browse document types</h1>
      <p className={sub}>
        {kinds.length > 0 ? `${kinds.length} documents. ` : ''}Pick one and describe your matter. We
        ask for the details it needs.
      </p>

      <div className="relative mt-6">
        <Search
          size={16}
          aria-hidden="true"
          className="text-brand-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          aria-label="Search documents by name"
          className={`${input} pl-9`}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Category">
        <button
          type="button"
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
          className={chip(category === 'all')}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={chip(category === c)}
          >
            {c.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-brand-muted mt-8 flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading documents…
        </p>
      )}

      <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((k) => (
          <li key={k.template_id}>
            <button
              type="button"
              onClick={() => onPick(k)}
              className="border-brand-line focus-visible:ring-brand-teal flex h-full w-full flex-col gap-2 rounded-xl border bg-white p-4 text-left hover:shadow-sm focus:outline-none focus-visible:ring-2"
            >
              <span className="text-brand-navy font-semibold">{k.display_name}</span>
              <span className="text-brand-muted text-sm">{k.description}</span>
              <span className="mt-auto pt-1">
                <span className={`${tagPlain} capitalize`}>{k.category.replace(/_/g, ' ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!loading && shown.length === 0 && (
        <p className="text-brand-muted mt-6 text-sm">No document has that name.</p>
      )}

      <p className="mt-8 text-center">
        <button type="button" onClick={onDescribe} className={linkButton}>
          I do not see my document
        </button>
      </p>
    </div>
  );
}
