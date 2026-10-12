'use client';

import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileText,
  File,
  Loader2,
  Save,
  Clock,
  X,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import DocumentEditor from '@/components/editor/DocumentEditor';
import ExportBlanksDialog from '@/components/editor/ExportBlanksDialog';
import {
  EXPORT_BLANKS_GO_BACK_EVENT,
  blankListItems,
  blanksInContent,
  exportDocx,
  exportPdf,
  type Blank,
  type ExportBlanksGoBackDetail,
} from '@/components/editor/exportUtils';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/lib/auth';

interface DocumentData {
  _id: string;
  title: string;
  docType: string;
  courtType: string;
  courtName: string;
  content: string;
  status: 'draft' | 'finalised' | 'exported';
  sectionsCited: string[];
  filingChecklist: string[];
  checklistState: boolean[];
  exportedAs: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  /** T-106 — a starting draft keeps its label and footer for good. Both texts come from the service. */
  startingDraft?: boolean;
  startingDraftLabel?: string | null;
  startingDraftFooter?: string | null;
  /** T-197 — the signed disclaimer, shown on every draft. The text comes from the service. */
  disclaimer?: string | null;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type ExportFormat = 'pdf' | 'docx';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function DocumentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [checklist, setChecklist] = useState<{ text: string; checked: boolean }[]>([]);
  // The export being prepared or made; its button shows the spinner, both are disabled.
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  // T-194: the saved draft has blanks — the warning is open, nothing generated yet.
  const [blankWarning, setBlankWarning] = useState<{
    format: ExportFormat;
    blanks: Blank[];
  } | null>(null);
  // T-233: the export that failed, so the banner can offer "Try again" in the same format.
  const [exportError, setExportError] = useState<ExportFormat | null>(null);

  // Track the latest HTML for export and auto-save
  const latestHtmlRef = useRef('');
  // T-152: the text the server last had, so an update that changes nothing schedules no save.
  const savedHtmlRef = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // T-233: the export buttons, so focus has somewhere to go when the error banner closes.
  const exportButtonRefs = useRef<Record<ExportFormat, HTMLButtonElement | null>>({
    pdf: null,
    docx: null,
  });

  const isFree = user?.plan !== 'pro';

  // Fetch document
  useEffect(() => {
    const token = getAccessToken();
    if (!token || !id) return;

    fetch(`${API_URL}/api/documents/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Document not found' : 'Failed to load');
        return r.json();
      })
      .then((data: DocumentData) => {
        setDoc(data);
        latestHtmlRef.current = data.content;
        savedHtmlRef.current = data.content;
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-save with 2-second debounce. T-194: resolves true once the server has
  // the text, false if it could not be saved (the status then shows "Save failed").
  const saveDocument = useCallback(
    async (html: string): Promise<boolean> => {
      const token = getAccessToken();
      if (!token || !id) return false;

      setSaveStatus('saving');
      try {
        const res = await fetch(`${API_URL}/api/documents/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ finalContent: html }),
        });

        if (!res.ok) throw new Error('Save failed');
        savedHtmlRef.current = html;
        const result = await res.json();
        setDoc((prev) =>
          prev ? { ...prev, version: result.version, updatedAt: result.updatedAt } : prev,
        );
        setSaveStatus('saved');

        // Reset to idle after 2 seconds
        setTimeout(() => setSaveStatus('idle'), 2000);
        return true;
      } catch {
        setSaveStatus('error');
        return false;
      }
    },
    [id],
  );

  const handleEditorUpdate = useCallback(
    (html: string) => {
      latestHtmlRef.current = html;

      // Clear previous timer
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      // Nothing changed since the last save (e.g. an edit undone): no save, no new version.
      if (html === savedHtmlRef.current) return;

      // Debounce: save after 2 seconds of inactivity
      saveTimerRef.current = setTimeout(() => {
        saveDocument(html);
      }, 2000);
    },
    [saveDocument],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Initialise checklist from API response (real filing checklist from template config)
  useEffect(() => {
    if (doc && checklist.length === 0) {
      const items =
        doc.filingChecklist.length > 0
          ? doc.filingChecklist.map((text, i) => ({
              text,
              checked: doc.checklistState[i] ?? false,
            }))
          : [
              { text: 'Verify all section references', checked: false },
              { text: 'Review cause title formatting', checked: false },
              { text: 'Confirm party details are correct', checked: false },
              { text: 'Check verification clause details', checked: false },
              { text: 'Attach supporting documents', checked: false },
              { text: 'Print on legal-size paper', checked: false },
            ];
      setChecklist(items);
    }
  }, [doc, checklist.length]);

  // Makes the PDF as today; T-194 adds the header and blank style when the draft has blanks.
  const exportPdfFile = async () => {
    if (!doc) return;
    const token = getAccessToken();
    if (!token) return;

    // Try the server-side Puppeteer route first — it produces filing-grade
    // Times New Roman 12pt double-spaced output with the correct court margins.
    // The client-side fallback (exportPdf) is a degraded copy of that styling
    // and should only run when the server is genuinely unreachable.
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/documents/${id}/export/pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (networkErr) {
      console.warn('[export-pdf] server route unreachable; using client fallback:', networkErr);
      await exportPdf(
        latestHtmlRef.current,
        doc.title,
        isFree,
        doc.startingDraft ? doc.startingDraftFooter : null,
      );
      return;
    }

    if (!response.ok) {
      // Surface the server error so we know WHEN the fallback kicks in. Silent
      // fallback masked a Puppeteer-misconfigured-in-dev bug for advocate-pack
      // PDFs (sans-serif body, 1.6 line-height) — see Vishal session 2026-05-10.
      const body = await response.text().catch(() => '');
      console.error(
        `[export-pdf] server render failed (HTTP ${response.status}); using client fallback. ` +
          `Response: ${body.slice(0, 300)}`,
      );
      await exportPdf(
        latestHtmlRef.current,
        doc.title,
        isFree,
        doc.startingDraft ? doc.startingDraftFooter : null,
      );
      return;
    }

    const blob = await response.blob();
    const filename = `${doc.title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}.pdf`;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Makes the DOCX as today; T-194 adds the header and blank style when the draft has blanks.
  const exportDocxFile = async () => {
    if (!doc) return;
    await exportDocx(
      latestHtmlRef.current,
      doc.title,
      isFree,
      doc.startingDraft ? doc.startingDraftFooter : null,
    );

    // Track DOCX export on server for activation telemetry
    const token = getAccessToken();
    if (token) {
      fetch(`${API_URL}/api/documents/${id}/export/docx`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {
        /* non-critical */
      });
    }
  };

  // T-233: a failed export shows the banner instead of failing silently. The log
  // carries the format and the error only, never the draft's content.
  const exportFile = async (format: ExportFormat) => {
    setExporting(format);
    setExportError(null);
    try {
      await (format === 'pdf' ? exportPdfFile() : exportDocxFile());
    } catch (err) {
      console.error(`[export-${format}] export failed:`, err instanceof Error ? err.name : 'error');
      setExportError(format);
    } finally {
      setExporting(null);
    }
  };

  // T-194, Priya decision 2: save first, then count the blanks of the saved draft
  // the file is built from. No blanks: export as today. Blanks: the warning opens
  // and nothing is generated yet. Save failed: "Save failed" shows, no export.
  const handleExport = async (format: ExportFormat) => {
    if (!doc || exporting) return;
    setExporting(format);
    setExportError(null);
    let handedOff = false;
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const html = latestHtmlRef.current;
      const saved = html === savedHtmlRef.current || (await saveDocument(html));
      if (!saved) return;

      const blanks = blanksInContent(html);
      if (blanks.length > 0) {
        setBlankWarning({ format, blanks });
        return;
      }
      handedOff = true;
      await exportFile(format);
    } catch (err) {
      console.error(`[export-${format}] export failed:`, err instanceof Error ? err.name : 'error');
      setExportError(format);
    } finally {
      if (!handedOff) setExporting(null);
    }
  };

  // T-233: the export buttons stay focusable while an export runs (aria-disabled,
  // not disabled, so focus is not dropped to <body>), so the handlers guard instead.
  const handleExportPdf = () => {
    if (exporting) return;
    void handleExport('pdf');
  };
  const handleExportDocx = () => {
    if (exporting) return;
    void handleExport('docx');
  };
  // T-233: the banner unmounts when the error clears, so focus moves to the
  // export button of the same format first instead of dropping to <body>. If the
  // blank warning reopens, it takes focus itself (ExportBlanksDialog).
  const handleExportRetry = () => {
    if (!exportError || exporting) return;
    const format = exportError;
    exportButtonRefs.current[format]?.focus();
    void handleExport(format);
  };
  const handleExportErrorDismiss = () => {
    if (!exportError) return;
    exportButtonRefs.current[exportError]?.focus();
    setExportError(null);
  };

  const handleBlanksExportAnyway = () => {
    const format = blankWarning?.format;
    setBlankWarning(null);
    if (format) void exportFile(format);
  };

  // "Go back and fill": the dialog closes, then the editor puts the cursor on the first blank.
  const handleBlanksGoBack = () => {
    const first = blankWarning?.blanks[0];
    setBlankWarning(null);
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent<ExportBlanksGoBackDetail>(EXPORT_BLANKS_GO_BACK_EVENT, {
          detail: { text: first?.text },
        }),
      );
    });
  };

  const toggleCheckItem = (index: number) => {
    setChecklist((prev) => {
      const updated = prev.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item,
      );
      // Persist checklist state to API
      const token = getAccessToken();
      if (token && id) {
        fetch(`${API_URL}/api/documents/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ checklistState: updated.map((c) => c.checked) }),
        }).catch(() => {
          /* non-critical — state persists on next save */
        });
      }
      return updated;
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-amber-500" />
      </div>
    );
  }

  // Error state
  if (error || !doc) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <AlertTriangle size={32} className="text-red-400" />
        <p className="text-sm text-slate-600">{error || 'Document not found'}</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    // T-138: below md the page is one column that scrolls as one page. The fixed height, the
    // squeezing and the editor's own scroll start at md, where the layout is as it was.
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-4rem)] lg:flex-row">
      {/* Left: Editor */}
      <div className="flex flex-col gap-3 lg:flex-1 lg:overflow-hidden">
        {/* Header — the title, then the buttons under it below md */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Back to dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            {/* T-138: a guided document's title is typed by the advocate and can be one long
                unbroken word. Below md it may shrink and break; from md it is as it was. */}
            <div className="min-w-0 break-words">
              <h1 className="text-base font-bold capitalize text-slate-900">
                {/* A document with no rule pack has no type of its own: its name is its title. */}
                {doc.docType === 'guided' ? doc.title : doc.docType.replace(/_/g, ' ')}
              </h1>
              <p className="text-xs text-slate-400">{doc.courtName}</p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 lg:mt-0 lg:shrink-0 lg:flex-nowrap">
            {/* Save status indicator */}
            <span className="flex items-center gap-1 text-xs text-slate-400">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 size={12} className="animate-spin" /> Saving…
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <CheckCircle2 size={12} className="text-green-500" /> Saved
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertTriangle size={12} className="text-red-500" /> Save failed
                </>
              )}
              {saveStatus === 'idle' && doc.updatedAt && (
                <>
                  <Clock size={12} /> v{doc.version}
                </>
              )}
            </span>

            {/* Manual save */}
            <button
              onClick={() => void saveDocument(latestHtmlRef.current)}
              disabled={saveStatus === 'saving'}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              title="Save now"
            >
              <Save size={15} />
            </button>

            {/* Export buttons */}
            <button
              ref={(el) => {
                exportButtonRefs.current.pdf = el;
              }}
              onClick={handleExportPdf}
              aria-disabled={exporting !== null}
              aria-busy={exporting === 'pdf'}
              className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 aria-disabled:cursor-default aria-disabled:opacity-40"
            >
              {exporting === 'pdf' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <FileText size={13} />
              )}
              PDF
            </button>
            <button
              ref={(el) => {
                exportButtonRefs.current.docx = el;
              }}
              onClick={handleExportDocx}
              aria-disabled={exporting !== null}
              aria-busy={exporting === 'docx'}
              className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 aria-disabled:cursor-default aria-disabled:opacity-40"
            >
              {exporting === 'docx' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <File size={13} />
              )}
              DOCX
            </button>
          </div>
        </div>

        {/* T-233 — a failed export, with a retry in the same format */}
        {exportError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2"
          >
            <AlertTriangle size={13} className="flex-shrink-0 text-red-500" />
            <p className="flex-1 text-xs text-red-700">
              Export failed. Please try again.{' '}
              <button
                onClick={handleExportRetry}
                aria-disabled={exporting !== null}
                className="font-semibold underline aria-disabled:cursor-default aria-disabled:opacity-40"
              >
                Try again
              </button>
            </p>
            <button
              onClick={handleExportErrorDismiss}
              className="rounded p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600"
              aria-label="Dismiss export error"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* T-106/T-125 — the starting-draft label. It is the service's text and cannot be dismissed. */}
        {doc.startingDraft && doc.startingDraftLabel && (
          <p
            role="note"
            className="border-brand-gold bg-brand-gold-light text-brand-gold-dark rounded-lg border px-3 py-2 text-sm font-semibold"
          >
            {doc.startingDraftLabel}
          </p>
        )}

        {/* T-197 — the signed disclaimer, on every draft. The service's text; not dismissible. */}
        {doc.disclaimer && (
          <div
            role="note"
            className="border-brand-line bg-brand-page rounded-lg border px-3.5 py-2.5"
          >
            <p className="text-brand-navy text-sm">{doc.disclaimer}</p>
          </div>
        )}

        {/* Watermark notice for free tier */}
        {isFree && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <Download size={13} className="flex-shrink-0 text-amber-500" />
            <p className="text-xs text-amber-700">
              Free tier exports include a watermark.{' '}
              <button
                onClick={() => router.push('/dashboard/settings')}
                className="font-semibold underline"
              >
                Upgrade to Pro
              </button>{' '}
              for clean exports.
            </p>
          </div>
        )}

        {/* Editor */}
        <div className="lg:min-h-0 lg:flex-1">
          <DocumentEditor initialContent={doc.content} onUpdate={handleEditorUpdate} />
        </div>
      </div>

      {/* T-194 — the warning before exporting a draft with blanks */}
      {blankWarning && (
        <ExportBlanksDialog
          open
          count={blankWarning.blanks.length}
          items={blankListItems(blankWarning.blanks)}
          format={blankWarning.format}
          onExport={handleBlanksExportAnyway}
          onBack={handleBlanksGoBack}
        />
      )}

      {/* Right: Sidebar panel — filing checklist + sections cited */}
      <div className="w-full shrink-0 space-y-4 overflow-y-auto lg:w-72">
        {/* Filing checklist */}
        {checklist.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Filing checklist
            </h3>
            <ul className="mt-3 space-y-2">
              {checklist.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <button
                    onClick={() => toggleCheckItem(i)}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      item.checked
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-slate-300 hover:border-amber-400'
                    }`}
                  >
                    {item.checked && <CheckCircle2 size={10} />}
                  </button>
                  <span
                    className={`text-xs leading-relaxed ${
                      item.checked ? 'text-slate-400 line-through' : 'text-slate-700'
                    }`}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 h-1 rounded-full bg-slate-100">
              <div
                className="h-1 rounded-full bg-green-500 transition-all"
                style={{
                  width: `${(checklist.filter((c) => c.checked).length / checklist.length) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Sections cited */}
        {doc.sectionsCited.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sections cited
            </h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {doc.sectionsCited.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Document info */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Document info
          </h3>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-400">Type</dt>
              <dd className="font-medium capitalize text-slate-700">
                {doc.docType.replace(/_/g, ' ')}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Court</dt>
              <dd className="max-w-[140px] truncate font-medium text-slate-700">{doc.courtName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Status</dt>
              <dd className="font-medium capitalize text-slate-700">{doc.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Version</dt>
              <dd className="font-medium text-slate-700">{doc.version}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Created</dt>
              <dd className="font-medium text-slate-700">
                {new Date(doc.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
