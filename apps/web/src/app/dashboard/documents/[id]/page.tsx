'use client';

import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  FileText,
  File,
  Loader2,
  Save,
  Clock,
  X,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import DeleteDocumentDialog, {
  rememberDeleteOutcome,
  type DeleteOutcome,
} from '@/components/documents/DeleteDocumentDialog';
import AnnexuresCard, { annexuresCardVisible } from '@/components/editor/AnnexuresCard';
import { EDITOR_COPY } from '@/components/editor/copy';
import DocumentEditor from '@/components/editor/DocumentEditor';
import ExportBlanksDialog from '@/components/editor/ExportBlanksDialog';
import {
  EXPORT_BLANKS_GO_BACK_EVENT,
  blankListItems,
  blanksInContent,
  downloadBlob,
  exportDocx,
  exportPdf,
  missingAsBlanks,
  type Blank,
  type ExportBlanksGoBackDetail,
} from '@/components/editor/exportUtils';
import { EXPORT_HASH } from '@/components/intake/draftActions';
import NightScope from '@/components/intake/NightScope';
import { folio } from '@/components/intake/nlUi';
import { secondaryButton } from '@/components/intake/ui';
import { Button, ErrorState, Skeleton } from '@/components/ui';
import { useMediaQuery } from '@/components/ui/motion';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/lib/auth';

interface DocumentData {
  _id: string;
  title: string;
  docType: string;
  courtType: string;
  courtName: string;
  // T-674 AC3: the on-screen court label; courtName may be an internal id.
  courtLabel?: string;
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
  /** T-381 — not one of the 32 not_court_documents. Sent by the service; absent means no card. */
  courtDocument?: boolean;
  /** T-381 — the brief or the form inputs hold at least one party. Absent means no card. */
  hasParty?: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type ExportFormat = 'pdf' | 'docx';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Tailwind's `lg` (1024px), where the right rail sits beside the editor. */
const LG_QUERY = '(min-width: 1024px)';

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
  // T-115b — the Delete document button and its dialog (Rajesh's spec §1, §4).
  const [deleteOpen, setDeleteOpen] = useState(false);
  const handleDeleted = (outcome: DeleteOutcome) => {
    rememberDeleteOutcome(outcome);
    router.push('/dashboard/documents');
  };

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

  // T-578: the editor's focus mode is open; the save state then shows in the editor's toolbar.
  const [editorFocusMode, setEditorFocusMode] = useState(false);
  // T-578 (Rajesh's note §2.5): from lg the Annexures row is at the top of the right rail, below
  // lg it is in the editor column. One instance at a time, so the region is never doubled.
  const annexuresInRail = useMediaQuery(LG_QUERY, false);

  // T-521: Retry on a failed load fetches again.
  const [loadKey, setLoadKey] = useState(0);
  const retryLoad = () => {
    setError('');
    setLoading(true);
    setLoadKey((k) => k + 1);
  };

  // Fetch document
  useEffect(() => {
    const token = getAccessToken();
    if (!id) return;
    if (!token) {
      // T-521: no token, no fetch. Show the load error with Retry instead of a skeleton
      // that never ends (Retry sets loading again and lands here).
      setError('Failed to load');
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/api/documents/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Document not found' : 'Failed to load');
        return r.json();
      })
      .then((loaded: DocumentData) => {
        // T-611 (AC 1, 5): a raw {{MISSING: label}} token never reaches the
        // editor; it shows as [To be confirmed: label], as the exports print it.
        // The server serves it so already; this covers any older response. The
        // blank count reads both forms alike, so it does not change.
        const data =
          typeof loaded.content === 'string'
            ? { ...loaded, content: missingAsBlanks(loaded.content) }
            : loaded;
        setDoc(data);
        latestHtmlRef.current = data.content;
        savedHtmlRef.current = data.content;
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, loadKey]);

  // T-521: Export on the draft-ready view opens this page with #export; focus the export
  // buttons so the advocate picks a format here, where export runs as it always has.
  const docLoaded = doc !== null;
  useEffect(() => {
    if (!docLoaded || typeof window === 'undefined' || window.location.hash !== EXPORT_HASH) return;
    const btn = exportButtonRefs.current.pdf;
    btn?.focus();
    btn?.scrollIntoView?.({ block: 'center' });
  }, [docLoaded]);

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

  // Initialise checklist from API response (real filing checklist from template config).
  // T-565 item 39 (Ajay): a template with no checklist shows no checklist — no fallback list.
  useEffect(() => {
    if (doc && checklist.length === 0 && doc.filingChecklist.length > 0) {
      setChecklist(
        doc.filingChecklist.map((text, i) => ({
          text,
          checked: doc.checklistState[i] ?? false,
        })),
      );
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
    downloadBlob(blob, filename);
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
    // T-521 (spec 05): the folio skeleton; "Still working…" after 8s.
    return (
      <NightScope>
        <div className={`${folio} mx-auto max-w-[720px]`}>
          <Skeleton lines={8} />
        </div>
      </NightScope>
    );
  }

  // Error state. T-521: a failed load offers Retry; "Document not found" (404) does not.
  if (error || !doc) {
    const notFound = !error || error === 'Document not found';
    return (
      <NightScope>
        <div className="gap-nl-4 mx-auto flex min-h-[60vh] max-w-[720px] flex-col items-start justify-center">
          <ErrorState
            message={notFound ? 'Document not found' : EDITOR_COPY.loadFailed}
            onRetry={notFound ? undefined : retryLoad}
          />
          <Button variant="ghost" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      </NightScope>
    );
  }

  // The save state: in the header, or in the editor's toolbar while focus mode is open (T-578).
  // T-578 review: text at 4.5:1 or more in both places. The header sits on the Wall ground
  // (Muted: 5.1:1 by day, 6.1:1 at night); the toolbar is slate-50 in both themes (slate-600).
  const renderSaveState = (textClass: string) => (
    <span className={`flex items-center gap-1 text-xs ${textClass}`}>
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
  );

  const annexures = annexuresCardVisible(doc) ? (
    <AnnexuresCard docId={doc._id} title={doc.title} />
  ) : null;

  return (
    // T-138: below md the page is one column that scrolls as one page. The fixed height, the
    // squeezing and the editor's own scroll start at md, where the layout is as it was.
    // T-521: on the Night Library ground (NightScope).
    <NightScope className="flex flex-col gap-4 lg:h-[calc(100vh-4rem)] lg:flex-row">
      {/* Left: Editor. T-578: 8px between rows below lg (the Annexures row is here), so the
          editor starts within the fold budget at 390 and 768. */}
      <div className="flex flex-col gap-2 lg:flex-1 lg:gap-3 lg:overflow-hidden">
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
              <p className="text-xs text-slate-400">{doc.courtLabel ?? ''}</p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 lg:mt-0 lg:shrink-0 lg:flex-nowrap">
            {/* Save status indicator. T-578: in the editor's toolbar while focus mode is open. */}
            {!editorFocusMode && renderSaveState('text-nl-muted')}

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
          // T-521: signed copy row 457. Kept as a banner, not a toast: the T-233 focus
          // handling (Retry and dismiss return focus to the export button) stays as it is.
          <div
            role="alert"
            className="border-nl-err bg-nl-err-light px-nl-3 py-nl-2 gap-nl-2 flex items-center border"
          >
            <AlertTriangle size={14} className="text-nl-err flex-shrink-0" aria-hidden="true" />
            <p className="nl-body-sm text-nl-err flex-1">
              {EDITOR_COPY.exportFailed}{' '}
              <button
                onClick={handleExportRetry}
                aria-disabled={exporting !== null}
                className="nl-focus inline-flex min-h-[44px] items-center font-medium underline underline-offset-4 aria-disabled:cursor-default aria-disabled:opacity-40"
              >
                {EDITOR_COPY.retry}
              </button>
            </p>
            <button
              onClick={handleExportErrorDismiss}
              className="nl-focus text-nl-err inline-flex h-11 w-11 items-center justify-center"
              aria-label="Dismiss export error"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* T-578 notes row (Rajesh's note §2.3, Ajay confirmed 23 Oct): no card, no border, no
            fill; Muted on the Wall ground, 20px lines, 4px apart. Text byte-identical. */}
        {((doc.startingDraft && doc.startingDraftLabel) || doc.disclaimer) && (
          <div className="flex flex-col gap-1">
            {/* T-106/T-125 — the starting-draft label. The service's text; cannot be dismissed. */}
            {doc.startingDraft && doc.startingDraftLabel && (
              <p role="note" className="nl-body-sm text-nl-muted font-medium leading-5">
                {doc.startingDraftLabel}
              </p>
            )}

            {/* T-197 — the signed disclaimer, on every draft. The service's text; not dismissible. */}
            {doc.disclaimer && (
              <div role="note">
                <p className="nl-body-sm text-nl-muted leading-5">{doc.disclaimer}</p>
              </div>
            )}
          </div>
        )}

        {/* T-381 — the Annexures card: court documents with a party only. T-578: below lg here,
            from lg at the top of the right rail. */}
        {/* Crossing 1024px remounts the card and resets its state to idle, by design (T-381). */}
        {!annexuresInRail && annexures}

        {/* Editor */}
        <div className="lg:min-h-0 lg:flex-1">
          <DocumentEditor
            initialContent={doc.content}
            onUpdate={handleEditorUpdate}
            saveState={renderSaveState('text-slate-600')}
            // T-578 (Ajay, 23 Oct): the same T-197 text, pinned in focus mode. Remove this
            // one line to drop the second copy.
            focusFooter={doc.disclaimer}
            onFocusModeChange={setEditorFocusMode}
          />
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
        {/* T-578: from lg the Annexures row is first in the rail, above the filing checklist. */}
        {annexuresInRail && annexures}

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
              <dd className="max-w-[140px] truncate font-medium text-slate-700">
                {doc.courtLabel || '—'}
              </dd>
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

        {/* T-115b — at the bottom, away from Download and Edit, so it is not hit by mistake */}
        <div className="pt-2">
          <button type="button" onClick={() => setDeleteOpen(true)} className={secondaryButton}>
            Delete document
          </button>
        </div>
      </div>

      {deleteOpen && (
        <DeleteDocumentDialog
          documentId={doc._id}
          title={doc.title}
          onClose={() => setDeleteOpen(false)}
          onDeleted={handleDeleted}
        />
      )}
    </NightScope>
  );
}
