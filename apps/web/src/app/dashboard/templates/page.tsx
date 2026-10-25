'use client';

import { Scale, Megaphone, Home, AlignLeft, FileText, ShieldCheck, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { TEMPLATES_LOAD_FAILED } from '@/components/documents/copy';
import NightScope from '@/components/intake/NightScope';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { apiFetch } from '@/lib/apiFetch';
import { groupByCatalogueCategory } from '@/lib/catalogueGroups';

interface TemplateSummary {
  template_id: string;
  display_name: string;
  category: string;
  /** T-240: library category id, display name and T-239 order (from the service). */
  catalogueCategory: string;
  catalogueCategoryName: string;
  catalogueCategoryOrder: number;
  description: string;
  icon: string;
  plan_access: 'free' | 'pro';
  supported_languages: string[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  scales: Scale,
  megaphone: Megaphone,
  home: Home,
  align_left: AlignLeft,
  file_text: FileText,
  shield_check: ShieldCheck,
};

type CategoryColors = { color: string; border: string; badge: string };

// Colours cycle by the category's T-239 order, so a new category needs no edit here.
const CATEGORY_PALETTE: CategoryColors[] = [
  { color: 'text-blue-500', border: 'border-t-blue-400', badge: 'bg-blue-50 text-blue-600' },
  { color: 'text-green-500', border: 'border-t-green-400', badge: 'bg-green-50 text-green-600' },
  {
    color: 'text-purple-500',
    border: 'border-t-purple-400',
    badge: 'bg-purple-50 text-purple-600',
  },
  { color: 'text-rose-500', border: 'border-t-rose-400', badge: 'bg-rose-50 text-rose-600' },
  { color: 'text-amber-500', border: 'border-t-amber-400', badge: 'bg-amber-50 text-amber-600' },
  { color: 'text-teal-500', border: 'border-t-teal-400', badge: 'bg-teal-50 text-teal-600' },
];

function categoryColors(order: number): CategoryColors {
  return CATEGORY_PALETTE[(Math.max(order, 1) - 1) % CATEGORY_PALETTE.length];
}

/** The T-240 library category the service sent with a template. */
const templateCategory = (t: TemplateSummary) => ({
  id: t.catalogueCategory,
  name: t.catalogueCategoryName,
  order: t.catalogueCategoryOrder,
});

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // T-521: the first load, and Retry after a failed one.
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiFetch('/api/documents/template-configs')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setError(TEMPLATES_LOAD_FAILED))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = groupByCatalogueCategory(templates, templateCategory);

  return (
    <NightScope>
      <div className="mb-nl-6 gap-nl-3 flex flex-wrap items-center justify-between">
        <div>
          <h1 className="nl-h1 text-nl-text">Templates</h1>
          <p className="nl-body-sm text-nl-soft mt-nl-1">
            Browse all available document templates. Click any to start drafting.
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="nl-focus gap-nl-2 rounded-nl-md px-nl-4 border-nl-line text-nl-brass-dark inline-flex h-11 items-center border text-[15px] font-medium"
        >
          <Plus size={14} aria-hidden="true" />
          New document
        </Link>
      </div>

      {loading && (
        <div className="border-nl-line bg-nl-card p-nl-4 border">
          <Skeleton lines={6} />
        </div>
      )}

      {error && (
        <div className="border-nl-line bg-nl-card p-nl-4 border">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-8">
          {grouped.map(({ id, name, order, items }) => {
            const colors = categoryColors(order);

            return (
              <div key={id}>
                <h2 className="nl-label text-nl-muted mb-nl-3">{name}</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((t) => {
                    const Icon = ICON_MAP[t.icon] ?? FileText;
                    return (
                      <Link
                        key={t.template_id}
                        // T-365 AC5: open the one flow with this document already chosen.
                        href={`/dashboard/new?kind=${encodeURIComponent(t.template_id)}`}
                        className={`nl-focus border-nl-line bg-nl-card p-nl-4 group block border border-t-[3px] ${colors.border}`}
                      >
                        <div className="flex items-start justify-between">
                          <Icon size={18} className={colors.color} />
                          {t.plan_access === 'pro' && (
                            <span className="bg-nl-brass-light text-nl-brass-dark rounded-full px-2 py-0.5 text-[10px] font-semibold">
                              PRO
                            </span>
                          )}
                        </div>
                        <p className="nl-body text-nl-text mt-nl-2 font-medium">{t.display_name}</p>
                        {t.description && (
                          <p className="nl-body-sm text-nl-soft mt-0.5">{t.description}</p>
                        )}
                        <div className="mt-3 flex items-center justify-between">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.badge}`}
                          >
                            {name}
                          </span>
                          <span className="nl-body-sm text-nl-brass-dark font-medium">
                            Use template →
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {templates.length === 0 && (
            <div className="border-nl-line bg-nl-card p-nl-6 border">
              <EmptyState message="No templates available yet." />
            </div>
          )}
        </div>
      )}
    </NightScope>
  );
}
