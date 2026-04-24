import { ShieldCheck, AlertTriangle } from 'lucide-react';

export default function TrustBar() {
  return (
    <section className="bg-lawie-900 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 text-blue-300">
          <ShieldCheck className="h-6 w-6" />
        </div>

        <p className="text-xl font-semibold leading-snug text-white sm:text-2xl">
          Built for advocates, by advocates. Every template reviewed by a practising lawyer.
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          AI-assisted drafting tool — not a substitute for legal advice.
        </div>
      </div>
    </section>
  );
}
