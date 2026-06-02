'use client';

import { FileText, Plus, Loader2, AlertTriangle, Clock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/apiFetch';

interface DocumentSummary {
  _id: string;
  title: string;
  docType: string;
  courtName: string;
  status: 'draft' | 'finalised' | 'exported';
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  finalised: 'bg-green-100 text-green-700',
  exported: 'bg-blue-100 text-blue-700',
};

export default function MyDocumentsPage() {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/documents')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load documents');
        return r.json();
      })
      .then((data) => setDocs(data.documents ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My documents</h1>
          <p className="mt-0.5 text-sm text-slate-500">All your drafted documents in one place.</p>
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
          <span className="text-sm">Loading documents…</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && docs.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <FileText size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">No documents yet</p>
          <p className="mt-1 text-xs text-slate-400">Create your first document to see it here.</p>
          <Link
            href="/dashboard/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
          >
            <Plus size={12} />
            Start drafting
          </Link>
        </div>
      )}

      {!loading && !error && docs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Type</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-slate-400 sm:table-cell">
                  Court
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-slate-400 md:table-cell">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {docs.map((doc) => (
                <tr key={doc._id} className="group hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/documents/${doc._id}`}
                      className="block max-w-[220px] truncate text-xs font-medium text-slate-800 group-hover:text-amber-600"
                    >
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs capitalize text-slate-500">
                      {doc.docType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className="max-w-[160px] truncate text-xs text-slate-400">
                      {doc.courtName || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLES[doc.status] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock size={11} />
                      {new Date(doc.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
