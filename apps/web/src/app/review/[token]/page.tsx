'use client';

/**
 * /review/[token] — SCRUM-74
 *
 * Public review portal — Jharkhand advocate hits this URL with a tokenised
 * link from the founder, sees the draft inline, and submits structured
 * feedback. NO auth required: the token IS the auth.
 *
 * Single-shot: once feedback is submitted, the token is marked used and the
 * page shows a thank-you state.
 */

import { AlertTriangle, CheckCircle2, FileText, Loader2, Send } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';

interface FormSchemaItem {
  id: string;
  label: string;
}

interface FormSchema {
  yes_no_items: FormSchemaItem[];
  verdicts: FormSchemaItem[];
}

interface ReviewPayload {
  document: {
    title: string;
    docType: string;
    courtName?: string;
    content: string;
    sectionsCited: string[];
  };
  review: { assignedTo: string; expiresAt: string };
  formSchema: FormSchema;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>('');
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Form state (populated once schema arrives)
  const [yesNo, setYesNo] = useState<Record<string, boolean | null>>({});
  const [verdict, setVerdict] = useState('');
  const [comments, setComments] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // ── Resolve token from params ──────────────────────────────────────────────
  useEffect(() => {
    void params.then((p) => setToken(p.token));
  }, [params]);

  // ── Fetch review payload ────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/drafting/review/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setLoadError(body.error ?? 'Unable to load review.');
            setLoading(false);
          }
          return;
        }
        const payload = (await res.json()) as ReviewPayload;
        if (!cancelled) {
          setData(payload);
          // Pre-init form: every yes/no starts unselected (null)
          const init: Record<string, boolean | null> = {};
          payload.formSchema.yes_no_items.forEach((i) => {
            init[i.id] = null;
          });
          setYesNo(init);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Network error loading review.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── Submit feedback ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    // Validate every yes/no answered
    const unanswered = Object.entries(yesNo).filter(([, v]) => v === null);
    if (unanswered.length > 0) {
      setSubmitError('Please answer every yes/no question.');
      return;
    }
    if (!verdict) {
      setSubmitError('Please select an overall verdict.');
      return;
    }

    setSubmitting(true);
    try {
      const body = { ...yesNo, overallVerdict: verdict, comments };
      const res = await fetch(
        `${API_BASE}/api/drafting/review/${encodeURIComponent(token)}/feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (res.ok) {
        setSubmitted(true);
      } else {
        const errBody = await res.json().catch(() => ({}));
        setSubmitError(errBody.error ?? 'Submission failed.');
      }
    } catch {
      setSubmitError('Network error during submission.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render: loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading review…</span>
        </div>
      </main>
    );
  }

  // ── Render: error ──────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6">
          <AlertTriangle size={20} className="text-red-500" />
          <h1 className="mt-3 text-lg font-semibold text-red-800">Review unavailable</h1>
          <p className="mt-1 text-sm text-red-700">{loadError}</p>
          <p className="mt-4 text-xs text-red-600">
            If you believe this is in error, please contact the founder who shared this link.
          </p>
        </div>
      </main>
    );
  }

  // ── Render: submitted ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 size={32} className="mx-auto text-green-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Thank you</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your feedback has been submitted. The Lawie team will follow up with the honorarium
            within 7 days.
          </p>
        </div>
      </main>
    );
  }

  if (!data) return null;

  // ── Render: review portal ──────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Image
            src="/assets/lawie-lockup.png"
            alt="Lawie"
            width={140}
            height={32}
            className="h-8 w-auto"
          />
          <div className="text-right">
            <p className="text-xs text-slate-400">Reviewing as</p>
            <p className="text-sm font-semibold text-slate-800">{data.review.assignedTo}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_400px]">
        {/* ── Document pane ────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-800">{data.document.title}</h2>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
              <span className="rounded bg-slate-100 px-1.5 py-0.5">
                {data.document.docType.replace(/_/g, ' ')}
              </span>
              {data.document.courtName && <span>· {data.document.courtName}</span>}
            </div>
          </div>
          <article className="max-h-[80vh] overflow-y-auto p-6 font-serif text-sm leading-relaxed text-slate-800">
            {data.document.content.trimStart().startsWith('<') ? (
              <div dangerouslySetInnerHTML={{ __html: data.document.content }} />
            ) : (
              <pre className="whitespace-pre-wrap font-serif">{data.document.content}</pre>
            )}
          </article>
        </section>

        {/* ── Feedback form pane ──────────────────────────────────────────── */}
        <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Review checklist</h2>
          <p className="mt-1 text-xs text-slate-500">
            Eight quick yes/no questions, an overall verdict, and any free-text comments.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {data.formSchema.yes_no_items.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-700">{item.label}</p>
                <div className="mt-2 flex gap-2">
                  {[
                    { v: true, label: 'Yes' },
                    { v: false, label: 'No' },
                  ].map(({ v, label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setYesNo((prev) => ({ ...prev, [item.id]: v }))}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                        yesNo[item.id] === v
                          ? v
                            ? 'border-green-500 bg-green-500 text-white'
                            : 'border-red-500 bg-red-500 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-700">Overall verdict</p>
              <select
                value={verdict}
                onChange={(e) => setVerdict(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select verdict…</option>
                {data.formSchema.verdicts.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700">
                Free-text comments (optional)
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Anything else worth flagging — case law, drafting style, language, citation issues…"
                rows={5}
                maxLength={10_000}
                className="mt-1 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-0.5 text-right text-[10px] text-slate-400">
                {comments.length} / 10000
              </p>
            </div>

            {submitError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
                <AlertTriangle size={12} className="mt-0.5 text-red-500" />
                <p className="text-xs text-red-700">{submitError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Submit feedback
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
