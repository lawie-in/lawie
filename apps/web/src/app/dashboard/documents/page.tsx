'use client';

import { Plus, Clock, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DOCUMENTS_COPY } from '@/components/documents/copy';
import DeleteDocumentDialog, {
  DELETE_STATUS_TEXT,
  takeDeleteOutcome,
  type DeleteOutcome,
} from '@/components/documents/DeleteDocumentDialog';
import NightScope from '@/components/intake/NightScope';
import { Chip, ErrorState, Skeleton, type ChipVariant } from '@/components/ui';
import { apiFetch } from '@/lib/apiFetch';

/** T-521: a link styled as the primary Button (the empty state's one action is a navigation). */
const primaryLink =
  'nl-focus gap-nl-2 rounded-nl-md px-nl-5 bg-nl-brass text-nl-on-brass inline-flex h-11 min-w-[44px] items-center justify-center whitespace-nowrap text-[15px] font-medium leading-5';
const ghostLink =
  'nl-focus gap-nl-2 rounded-nl-md px-nl-4 border-nl-line text-nl-brass-dark inline-flex h-11 min-w-[44px] items-center justify-center whitespace-nowrap border text-[15px] font-medium leading-5';

interface DocumentSummary {
  _id: string;
  title: string;
  docType: string;
  courtName: string;
  // T-674 AC3: the on-screen court label; courtName may be an internal id.
  courtLabel?: string;
  status: 'draft' | 'finalised' | 'exported';
  createdAt: string;
}

// T-115b — how long the "Document deleted." line stays (Rajesh's spec §3).
const DELETE_STATUS_MS = 6000;

const STATUS_VARIANT: Record<string, ChipVariant> = {
  draft: 'neutral',
  finalised: 'ok',
  exported: 'brass',
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

  // T-521: the first load, and Retry after a failed one.
  const loadDocs = useCallback(() => {
    setLoading(true);
    setError('');
    apiFetch('/api/documents')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load documents');
        return r.json();
      })
      .then((data) => setDocs(data.documents ?? []))
      .catch(() => setError(DOCUMENTS_COPY.loadFailed))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

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

  const th = 'nl-label text-nl-muted px-nl-4 py-nl-3 text-left';
  return (
    <NightScope>
      <div className="mb-nl-6 gap-nl-3 flex flex-wrap items-center justify-between">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="nl-h1 text-nl-text focus:outline-none">
            My documents
          </h1>
          <p className="nl-body-sm text-nl-soft mt-nl-1">
            All your drafted documents in one place.
          </p>
        </div>
        <Link href="/dashboard/new" className={ghostLink}>
          <Plus size={14} aria-hidden="true" />
          New document
        </Link>
      </div>

      {/* T-115b — after a delete. "Document deleted." only on a finished erase (200 or 404). */}
      <p role="status" className={deleteStatus ? 'nl-body-sm text-nl-text mb-nl-4' : 'sr-only'}>
        {deleteStatus}
      </p>

      {loading && (
        <div className="border-nl-line bg-nl-card p-nl-4 border">
          <Skeleton lines={5} />
        </div>
      )}

      {error && (
        <div className="border-nl-line bg-nl-card p-nl-4 border">
          <ErrorState message={error} onRetry={loadDocs} />
        </div>
      )}

      {!loading && !error && docs.length === 0 && (
        <div className="border-nl-line bg-nl-card p-nl-6 gap-nl-3 flex flex-col items-start border">
          <p className="nl-h3 text-nl-text">{DOCUMENTS_COPY.emptyHeading}</p>
          <p className="nl-body text-nl-soft">{DOCUMENTS_COPY.emptyBody}</p>
          <Link href="/dashboard/new" className={primaryLink}>
            {DOCUMENTS_COPY.emptyAction}
          </Link>
        </div>
      )}

      {!loading && !error && docs.length > 0 && (
        <div className="border-nl-line bg-nl-card relative overflow-x-auto border">
          <table className="nl-body-sm w-full">
            <thead>
              <tr className="border-nl-line border-b">
                <th className={th}>Title</th>
                <th className={th}>Type</th>
                <th className={`${th} hidden sm:table-cell`}>Court</th>
                <th className={th}>Status</th>
                <th className={`${th} hidden md:table-cell`}>Date</th>
                <th className="w-px px-2 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-nl-line divide-y">
              {docs.map((doc) => (
                <tr key={doc._id} className="hover:bg-nl-wood group">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/documents/${doc._id}`}
                      ref={(el) => {
                        if (el) titleLinks.current.set(doc._id, el);
                        else titleLinks.current.delete(doc._id);
                      }}
                      // T-544: the 220px cut is CSS only, so the accessible name is already the full
                      // title. `title` is a mouse courtesy (a tooltip with the full title), not the
                      // accessibility fix; no aria-label, so the name stays the visible text.
                      title={doc.title}
                      className="nl-focus text-nl-text group-hover:text-nl-brass-dark block max-w-[220px] truncate font-medium"
                    >
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-nl-soft text-xs capitalize">
                      {doc.docType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className="text-nl-muted max-w-[160px] truncate text-xs">
                      {doc.courtLabel || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Chip variant={STATUS_VARIANT[doc.status] ?? 'neutral'} className="capitalize">
                      {doc.status}
                    </Chip>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="text-nl-muted flex items-center gap-1 text-xs">
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
    </NightScope>
  );
}
