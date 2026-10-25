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

import { groupByCatalogueCategory } from '@/lib/catalogueGroups';

/**
 * A documents-list row with its T-240 library category. The service always
 * sends these with GET /api/documents/template-configs; they are optional here
 * only so the shared `KindSummary` rows still type-check.
 */
type CatalogueKind = KindSummary & {
  catalogueCategory?: string;
  catalogueCategoryName?: string;
  catalogueCategoryOrder?: number;
};

const catalogueId = (k: CatalogueKind) => k.catalogueCategory ?? k.category;
/** T-345: a raw category id on the fallback path, readable: "civil_suit" -> "Civil suit". */
const readableCategory = (id: string) => {
  const spaced = id.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
const catalogueName = (k: CatalogueKind) => k.catalogueCategoryName ?? readableCategory(k.category);
/** T-365 AC4: the same category grouping the templates library uses. */
const kindCategory = (k: CatalogueKind) => ({
  id: catalogueId(k),
  name: catalogueName(k),
  order: k.catalogueCategoryOrder ?? Number.MAX_SAFE_INTEGER,
});

export default function BrowseTypesStep({
  kinds,
  loading,
  onPick,
  onDescribe,
}: {
  kinds: CatalogueKind[];
  loading: boolean;
  onPick: (kind: KindSummary) => void;
  /** "I do not see my document": describe with nothing set. */
  onDescribe: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  // Catalogue categories (T-240) that have a document, in T-239 order.
  const categories = useMemo(() => groupByCatalogueCategory(kinds, kindCategory), [kinds]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kinds.filter(
      (k) =>
        (category === 'all' || catalogueId(k) === category) &&
        (q === '' ||
          k.display_name.toLowerCase().includes(q) ||
          (k.description ?? '').toLowerCase().includes(q)),
    );
  }, [kinds, query, category]);

  // T-365 AC4: matches grouped under a heading per category, as in the library.
  // A search keeps the grouping and drops the groups with no match.
  const shownGroups = useMemo(() => groupByCatalogueCategory(shown, kindCategory), [shown]);

  const chip = (on: boolean) =>
    `focus-visible:ring-brand-teal inline-flex min-h-[40px] items-center rounded-full border px-3.5 text-sm focus:outline-none focus-visible:ring-2 ${
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
            key={c.id}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
            className={chip(category === c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-brand-muted mt-8 flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading documents…
        </p>
      )}

      <div className="mt-5 space-y-8">
        {shownGroups.map((g) => {
          const headingId = `browse-category-${g.id}`;
          return (
            <section key={g.id} aria-labelledby={headingId}>
              <h2
                id={headingId}
                className="text-brand-muted mb-3 text-xs font-semibold uppercase tracking-wider"
              >
                {g.name}
              </h2>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((k) => (
                  <li key={k.template_id}>
                    <button
                      type="button"
                      onClick={() => onPick(k)}
                      className="border-brand-line focus-visible:ring-brand-teal flex h-full w-full flex-col gap-2 rounded-xl border bg-white p-4 text-left hover:shadow-sm focus:outline-none focus-visible:ring-2"
                    >
                      <span className="text-brand-navy font-semibold">{k.display_name}</span>
                      {k.description && (
                        <span className="text-brand-muted text-sm">{k.description}</span>
                      )}
                      <span className="mt-auto pt-1">
                        <span className={tagPlain}>{g.name}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

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
