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
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import DocumentEditor from '@/components/editor/DocumentEditor';
import { exportDocx, exportPdf } from '@/components/editor/exportUtils';
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
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
  const [exporting, setExporting] = useState(false);

  // Track the latest HTML for export and auto-save
  const latestHtmlRef = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-save with 2-second debounce
  const saveDocument = useCallback(
    async (html: string) => {
      const token = getAccessToken();
      if (!token || !id) return;

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
        const result = await res.json();
        setDoc((prev) =>
          prev ? { ...prev, version: result.version, updatedAt: result.updatedAt } : prev,
        );
        setSaveStatus('saved');

        // Reset to idle after 2 seconds
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    },
    [id],
  );

  const handleEditorUpdate = useCallback(
    (html: string) => {
      latestHtmlRef.current = html;

      // Clear previous timer
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

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

  const handleExportPdf = async () => {
    if (!doc) return;
    setExporting(true);
    try {
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
        await exportPdf(latestHtmlRef.current, doc.title, isFree);
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
        await exportPdf(latestHtmlRef.current, doc.title, isFree);
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
    } finally {
      setExporting(false);
    }
  };

  const handleExportDocx = async () => {
    if (!doc) return;
    setExporting(true);
    try {
      await exportDocx(latestHtmlRef.current, doc.title, isFree);

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
    } finally {
      setExporting(false);
    }
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
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 md:flex-row">
      {/* Left: Editor */}
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Back to dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-base font-bold capitalize text-slate-900">
                {doc.docType.replace(/_/g, ' ')}
              </h1>
              <p className="text-xs text-slate-400">{doc.courtName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              onClick={() => saveDocument(latestHtmlRef.current)}
              disabled={saveStatus === 'saving'}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              title="Save now"
            >
              <Save size={15} />
            </button>

            {/* Export buttons */}
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
            >
              <FileText size={13} />
              PDF
            </button>
            <button
              onClick={handleExportDocx}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40"
            >
              <File size={13} />
              DOCX
            </button>
          </div>
        </div>

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
        <div className="min-h-0 flex-1">
          <DocumentEditor initialContent={doc.content} onUpdate={handleEditorUpdate} />
        </div>
      </div>

      {/* Right: Sidebar panel — filing checklist + sections cited */}
      <div className="w-full shrink-0 space-y-4 overflow-y-auto md:w-72">
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
