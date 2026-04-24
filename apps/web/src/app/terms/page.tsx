import { Scale, ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — Lawie',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <Scale className="text-lawie-600 h-6 w-6" />
          <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
        </div>

        <div className="prose prose-slate max-w-none">
          <p className="text-sm text-slate-500">Last updated: April 2026</p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using Lawie (&quot;the Service&quot;), you agree to be bound by these
            Terms of Service. If you do not agree, please do not use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Lawie is an AI-assisted legal drafting tool designed to help advocates generate
            court-ready document drafts. Lawie is not a law firm and does not provide legal advice.
          </p>

          <h2>3. Disclaimer</h2>
          <p>
            AI-assisted drafting tool — not a substitute for legal advice. All documents generated
            by Lawie should be reviewed by a qualified legal professional before filing.
          </p>

          <h2>4. User Responsibilities</h2>
          <p>
            You are responsible for verifying the accuracy and completeness of any document
            generated using Lawie before use in any legal proceeding.
          </p>

          <h2>5. Contact</h2>
          <p>
            For questions about these terms, please contact us at{' '}
            <a href="mailto:legal@lawie.in">legal@lawie.in</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
