'use client';

import {
  Scale,
  Megaphone,
  Home,
  AlignLeft,
  FileText,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/apiFetch';

interface TemplateSummary {
  template_id: string;
  display_name: string;
  category: string;
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

const CATEGORY_COLORS: Record<string, { color: string; border: string; badge: string }> = {
  criminal: {
    color: 'text-blue-500',
    border: 'border-t-blue-400',
    badge: 'bg-blue-50 text-blue-600',
  },
  civil: {
    color: 'text-green-500',
    border: 'border-t-green-400',
    badge: 'bg-green-50 text-green-600',
  },
  corporate: {
    color: 'text-purple-500',
    border: 'border-t-purple-400',
    badge: 'bg-purple-50 text-purple-600',
  },
  family: {
    color: 'text-rose-500',
    border: 'border-t-rose-400',
    badge: 'bg-rose-50 text-rose-600',
  },
};

const CATEGORY_ORDER = ['criminal', 'civil', 'corporate', 'family'];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/documents/template-configs')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setError('Failed to load templates. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = CATEGORY_ORDER.reduce<Record<string, TemplateSummary[]>>((acc, cat) => {
    const items = templates.filter((t) => t.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  // Uncategorised fallback
  const known = new Set(CATEGORY_ORDER);
  const other = templates.filter((t) => !known.has(t.category));
  if (other.length > 0) grouped['other'] = other;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Templates</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Browse all available document templates. Click any to start drafting.
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          <Plus size={13} />
          New document
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-16 text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading templates…</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, items]) => {
            const colors = CATEGORY_COLORS[category] ?? {
              color: 'text-slate-500',
              border: 'border-t-slate-400',
              badge: 'bg-slate-100 text-slate-600',
            };

            return (
              <div key={category}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {category}
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((t) => {
                    const Icon = ICON_MAP[t.icon] ?? FileText;
                    return (
                      <Link
                        key={t.template_id}
                        href="/dashboard/new"
                        className={`group rounded-xl border border-t-[3px] border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md ${colors.border}`}
                      >
                        <div className="flex items-start justify-between">
                          <Icon size={18} className={colors.color} />
                          {t.plan_access === 'pro' && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              PRO
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-800">
                          {t.display_name}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                          {t.description}
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${colors.badge}`}
                          >
                            {category}
                          </span>
                          <span className="text-xs font-medium text-amber-600 opacity-0 transition-opacity group-hover:opacity-100">
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
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <FileText size={28} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No templates available yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
