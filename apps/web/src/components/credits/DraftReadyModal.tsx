'use client';

import { CheckCircle, Download, X, FileText } from 'lucide-react';

interface Section {
  label: string;
  count?: number;
}

interface DraftReadyModalProps {
  documentLabel: string;
  sections?: Section[];
  onOpenEditor: () => void;
  onDownloadPdf?: () => void;
  onDownloadDocx?: () => void;
  onClose: () => void;
}

export function DraftReadyModal({
  documentLabel,
  sections = [],
  onOpenEditor,
  onDownloadPdf,
  onDownloadDocx,
  onClose,
}: DraftReadyModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header band — success green */}
        <header className="relative overflow-hidden bg-green-50 px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
                <CheckCircle size={15} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-green-700">
                  Draft ready
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900">Your document is ready</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Document info */}
        <div className="px-6 py-5">
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <FileText size={16} className="shrink-0 text-slate-400" />
            <span className="text-sm font-medium text-slate-800">{documentLabel}</span>
          </div>

          {/* Sections cited */}
          {sections.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Sections cited
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sections.map((s, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700"
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Primary CTA */}
          <button
            type="button"
            onClick={onOpenEditor}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Open in editor
          </button>

          {/* Download options */}
          {(onDownloadPdf || onDownloadDocx) && (
            <div className="mt-2 flex gap-2">
              {onDownloadPdf && (
                <button
                  type="button"
                  onClick={onDownloadPdf}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Download size={12} /> PDF
                </button>
              )}
              {onDownloadDocx && (
                <button
                  type="button"
                  onClick={onDownloadDocx}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Download size={12} /> DOCX
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
