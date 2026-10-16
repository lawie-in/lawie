'use client';

import { FileText, Plus, Loader2, AlertTriangle, Clock, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import DeleteDocumentDialog, {
  DELETE_STATUS_TEXT,
  takeDeleteOutcome,
  type DeleteOutcome,
} from '@/components/documents/DeleteDocumentDialog';
import { apiFetch } from '@/lib/apiFetch';

interface DocumentSummary {
  _id: string;
  title: string;
  docType: string;
  courtName: string;
  status: 'draft' | 'finalised' | 'exported';
  createdAt: string;
}

// T-115b — how long the "Document deleted." line stays (Rajesh's spec §3).
const DELETE_STATUS_MS = 6000;

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  finalised: 'bg-green-100 text-green-700',
  exported: 'bg-blue-100 text-blue-700',
};

export default function MyDocumentsPage() {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // T-115b — delete from the list. The title is shown and used as the button's name only:
  // never logged, never sent to analytics.
  const [deleting, setDeleting] = useState<DocumentSummary | null>(null);
  const [deleteStatus, setDeleteStatus] = useState('');
  // After a delete: the row whose title link takes focus, or null for the h1.
  const [focusAfterDelete, setFocusAfterDelete] = useState<{ id: string | null } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleLinks = useRef(new Map<string, HTMLAnchorElement>());
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showDeleteStatus = useCallback((outcome: DeleteOutcome) => {
    setDeleteStatus(DELETE_STATUS_TEXT[outcome]);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setDeleteStatus(''), DELETE_STATUS_MS);
  }, []);

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

  // Arriving from the document page after a delete there: the status line, focus on the h1.
  useEffect(() => {
    const outcome = takeDeleteOutcome();
    if (!outcome) return;
    showDeleteStatus(outcome);
    headingRef.current?.focus();
  }, [showDeleteStatus]);

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    [],
  );

  // Move focus once the deleted row has left the list (the opener no longer exists).
  useEffect(() => {
    if (!focusAfterDelete) return;
    const link = focusAfterDelete.id ? titleLinks.current.get(focusAfterDelete.id) : undefined;
    (link ?? headingRef.current)?.focus();
    setFocusAfterDelete(null);
  }, [focusAfterDelete, docs]);

  // A quiet reload after a delete: keeps the current list if it fails.
  const refreshDocs = useCallback(() => {
    apiFetch('/api/documents')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setDocs(data.documents ?? []);
      })
      .catch(() => undefined);
  }, []);

  const handleDeleted = (outcome: DeleteOutcome) => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    const i = docs.findIndex((d) => d._id === target._id);
    const next = i >= 0 ? (docs[i + 1] ?? docs[i - 1]) : undefined;
    setDocs((list) => list.filter((d) => d._id !== target._id));
    setFocusAfterDelete({ id: next?._id ?? null });
    showDeleteStatus(outcome);
    refreshDocs();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-bold text-slate-900 focus:outline-none"
          >
            My documents
          </h1>
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

      {/* T-115b — after a delete. "Document deleted." only on a finished erase (200 or 404). */}
      <p role="status" className={deleteStatus ? 'mb-4 text-sm text-slate-700' : 'sr-only'}>
        {deleteStatus}
      </p>

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
                <th className="w-px px-2 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {docs.map((doc) => (
                <tr key={doc._id} className="group hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/documents/${doc._id}`}
                      ref={(el) => {
                        if (el) titleLinks.current.set(doc._id, el);
                        else titleLinks.current.delete(doc._id);
                      }}
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
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => setDeleting(doc)}
                      aria-label={`Delete ${doc.title}`}
                      className="text-brand-error hover:bg-brand-error-light focus-visible:ring-brand-teal inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium focus:outline-none focus-visible:ring-2"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span className="hidden xl:inline">Delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <DeleteDocumentDialog
          documentId={deleting._id}
          title={deleting.title}
          onClose={() => setDeleting(null)}
          onDeleted={handleDeleted}
          fallbackFocusRef={headingRef}
        />
      )}
    </div>
  );
}
