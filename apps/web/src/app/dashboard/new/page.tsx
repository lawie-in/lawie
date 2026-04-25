'use client';

import {
  Scale,
  Megaphone,
  Home,
  AlignLeft,
  FileText,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/lib/auth';

const DOC_TYPES = [
  {
    value: 'bail_application',
    label: 'Bail application',
    description: 'Application for bail in bailable / non-bailable offences (BNSS)',
    icon: Scale,
    color: 'text-blue-500',
    border: 'border-t-blue-400',
  },
  {
    value: 'legal_notice',
    label: 'Legal notice',
    description: 'Formal demand / cease-and-desist notice',
    icon: Megaphone,
    color: 'text-amber-500',
    border: 'border-t-amber-400',
  },
  {
    value: 'complaint',
    label: 'Criminal complaint',
    description: 'Complaint to Magistrate under BNSS Sec. 223',
    icon: AlignLeft,
    color: 'text-red-500',
    border: 'border-t-red-400',
  },
  {
    value: 'petition',
    label: 'Writ petition',
    description: 'Petition before High Court or Supreme Court',
    icon: FileText,
    color: 'text-purple-500',
    border: 'border-t-purple-400',
  },
  {
    value: 'plaint',
    label: 'Civil plaint',
    description: 'Plaint in civil suit (CPC Order VII)',
    icon: FileText,
    color: 'text-green-500',
    border: 'border-t-green-400',
  },
  {
    value: 'injunction',
    label: 'Injunction application',
    description: 'Temporary / permanent injunction (Specific Relief Act)',
    icon: FileText,
    color: 'text-orange-500',
    border: 'border-t-orange-400',
  },
  {
    value: 'affidavit',
    label: 'Affidavit',
    description: 'Sworn affidavit (Oaths Act / BSA)',
    icon: FileText,
    color: 'text-slate-500',
    border: 'border-t-slate-400',
  },
  {
    value: 'rent',
    label: 'Rent agreement',
    description: 'Residential or commercial rent agreement',
    icon: Home,
    color: 'text-teal-500',
    border: 'border-t-teal-400',
  },
] as const;

const COURT_TYPES = [
  { value: 'district_court', label: 'District Court / Sessions Court' },
  { value: 'high_court', label: 'High Court' },
  { value: 'supreme_court', label: 'Supreme Court of India' },
  { value: 'tribunal', label: 'Tribunal / NCLT / NCDRC' },
  { value: 'consumer_forum', label: 'Consumer Forum (District / State / National)' },
  { value: 'family_court', label: 'Family Court' },
] as const;

interface FormData {
  docType: string;
  courtName: string;
  courtType: string;
  petitioner: string;
  respondent: string;
  accusedName: string;
  keyFacts: string;
  reliefPrayer: string;
}

const INITIAL: FormData = {
  docType: '',
  courtName: '',
  courtType: 'district_court',
  petitioner: '',
  respondent: '',
  accusedName: '',
  keyFacts: '',
  reliefPrayer: '',
};

const STEPS = ['Document type', 'Court details', 'Parties', 'Key facts', 'Relief & prayer'];

function InputField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
      />
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
      />
    </div>
  );
}

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i < step ? 'bg-amber-500' : i === step ? 'w-6 bg-amber-400' : 'w-4 bg-slate-200'
          } ${i < step ? 'w-4' : ''}`}
        />
      ))}
      <span className="ml-2 text-xs text-slate-400">
        Step {step + 1} of {total}
      </span>
    </div>
  );
}

function NewDocumentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(() => {
    const typeParam = searchParams.get('type');
    if (typeParam) {
      const match = DOC_TYPES.find((d) => d.value.startsWith(typeParam));
      return { ...INITIAL, docType: match?.value ?? '' };
    }
    return INITIAL;
  });

  const [generating, setGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function set(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function canAdvance(): boolean {
    if (step === 0) return !!form.docType;
    if (step === 1) return !!form.courtName && !!form.courtType;
    if (step === 2) return !!(form.petitioner || form.respondent || form.accusedName);
    if (step === 3) return form.keyFacts.length >= 10;
    if (step === 4) return form.reliefPrayer.length >= 5;
    return false;
  }

  async function handleGenerate() {
    if (!user) return;
    setGenerating(true);
    setGeneratedText('');
    setWarnings([]);
    setError('');

    const token = getAccessToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

    try {
      const res = await fetch(`${apiUrl}/api/documents/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          docType: form.docType,
          courtName: form.courtName,
          courtType: form.courtType,
          partyDetails: {
            ...(form.petitioner && { petitioner: form.petitioner }),
            ...(form.respondent && { respondent: form.respondent }),
            ...(form.accusedName && { accused: form.accusedName }),
          },
          keyFacts: form.keyFacts,
          reliefPrayer: form.reliefPrayer,
          advocateName: user.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? data.message ?? 'Generation failed');
        setGenerating(false);
        return;
      }

      if (!res.body) {
        setError('No response body');
        setGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let reading = true;
      while (reading) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) {
          reading = false;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: warning')) {
            // next line has the data
          } else if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.sections) {
                setWarnings(payload.sections);
              } else if (payload.text) {
                setGeneratedText((prev) => prev + payload.text);
              }
              if (payload.complete) {
                setDone(true);
              }
            } catch {
              // malformed SSE line — skip
            }
          }
        }
      }

      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setGenerating(false);
    }
  }

  if (generating || done) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">
            {done ? 'Document ready' : 'Generating…'}
          </h1>
          {done && (
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
            >
              Back to dashboard
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-700">
                Section numbers not found in BNS/BNSS mapping — verify before filing:
              </p>
              <p className="mt-0.5 text-xs text-amber-600">{warnings.join(', ')}</p>
            </div>
          </div>
        )}

        {done && !error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <CheckCircle2 size={14} className="flex-shrink-0 text-green-600" />
            <p className="text-sm text-green-700">Draft saved to your documents.</p>
          </div>
        )}

        <div className="min-h-[400px] rounded-xl border border-slate-200 bg-white p-6">
          {generating && !generatedText && (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">AI is drafting your document…</span>
            </div>
          )}
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
            {generatedText}
          </pre>
          {generating && generatedText && (
            <span className="inline-block h-4 w-0.5 animate-pulse bg-amber-500 align-bottom" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">New document</h1>
        <div className="mt-3">
          <StepIndicator step={step} total={STEPS.length} />
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`flex-shrink-0 text-xs ${
                i === step
                  ? 'font-semibold text-amber-600'
                  : i < step
                    ? 'text-slate-500'
                    : 'text-slate-300'
              }`}
            >
              {i > 0 && <ChevronRight size={10} className="mr-0.5 inline" />}
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Step 0 — Document type */}
        {step === 0 && (
          <div>
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Select document type</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DOC_TYPES.map(({ value, label, description, icon: Icon, color, border }) => (
                <button
                  key={value}
                  onClick={() => set('docType', value)}
                  className={`rounded-xl border border-t-[3px] border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md ${border} ${
                    form.docType === value ? 'ring-2 ring-amber-400 ring-offset-1' : ''
                  }`}
                >
                  <Icon size={18} className={color} />
                  <p className="mt-2 text-sm font-semibold text-slate-800">{label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 — Court details */}
        {step === 1 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <h2 className="col-span-full text-sm font-semibold text-slate-700">Court details</h2>
            <div className="col-span-full">
              <InputField
                label="Court name"
                value={form.courtName}
                onChange={(v) => set('courtName', v)}
                placeholder="e.g. District & Sessions Court, Saket, New Delhi"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Court type <span className="text-red-400">*</span>
              </label>
              <select
                value={form.courtType}
                onChange={(e) => set('courtType', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              >
                {COURT_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 2 — Party details */}
        {step === 2 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="col-span-full">
              <h2 className="text-sm font-semibold text-slate-700">Party details</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Fill in the relevant parties for your document type.
              </p>
            </div>
            <InputField
              label="Petitioner / Applicant / Plaintiff"
              value={form.petitioner}
              onChange={(v) => set('petitioner', v)}
              placeholder="Full name + s/o / d/o / w/o + address"
            />
            <InputField
              label="Respondent / Defendant / Complainant"
              value={form.respondent}
              onChange={(v) => set('respondent', v)}
              placeholder="Full name + address (or 'The State of [State]')"
            />
            <InputField
              label="Accused (for bail / criminal matters)"
              value={form.accusedName}
              onChange={(v) => set('accusedName', v)}
              placeholder="Full name + age + address (if different from petitioner)"
            />
          </div>
        )}

        {/* Step 3 — Key facts */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">Key facts</h2>
            <p className="text-xs text-slate-400">
              Describe the facts of the matter. Include dates, events, and any relevant FIR / case
              numbers.
            </p>
            <TextareaField
              label="Facts of the case"
              value={form.keyFacts}
              onChange={(v) => set('keyFacts', v)}
              placeholder="e.g. The accused was arrested on DD/MM/YYYY pursuant to FIR No. ___ dated ___ registered at PS ___ under BNS Sections ___. The alleged offence is non-cognizable / bailable. The accused is in judicial custody since ___. He has no prior criminal record…"
              rows={8}
              required
            />
            <p className="text-xs text-slate-400">{form.keyFacts.length} / 5000 characters</p>
          </div>
        )}

        {/* Step 4 — Relief & prayer */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">Relief &amp; prayer</h2>
            <p className="text-xs text-slate-400">
              State exactly what relief you are seeking from the court.
            </p>
            <TextareaField
              label="Relief sought / Prayer"
              value={form.reliefPrayer}
              onChange={(v) => set('reliefPrayer', v)}
              placeholder="e.g. It is therefore most respectfully prayed that this Hon'ble Court may graciously be pleased to: (i) Grant bail to the accused on such terms and conditions as this Hon'ble Court may deem fit and proper; (ii) Pass any other order(s) as this Hon'ble Court may deem fit in the interest of justice."
              rows={6}
              required
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => (step === 0 ? router.push('/dashboard') : setStep((s) => s - 1))}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <ChevronLeft size={14} />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        {step < STEPS.length - 1 ? (
          <button
            disabled={!canAdvance()}
            onClick={() => setStep((s) => s + 1)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <ChevronRight size={14} />
          </button>
        ) : (
          <button
            disabled={!canAdvance() || generating}
            onClick={handleGenerate}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Generating…
              </>
            ) : (
              'Generate document'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function NewDocumentPage() {
  return (
    <Suspense>
      <NewDocumentContent />
    </Suspense>
  );
}
