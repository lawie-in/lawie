import { Scale, ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Lawie',
};

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        </div>

        <div className="prose prose-slate max-w-none">
          <p className="text-sm text-slate-500">Last updated: April 2026</p>

          <h2>1. Information We Collect</h2>
          <p>
            When you join our waitlist, we collect your email address. When you use the Service, we
            may collect information you provide in document drafts, usage data, and device
            information.
          </p>

          <h2>2. How We Use Your Information</h2>
          <p>
            We use your information to provide and improve the Service, communicate updates, and
            ensure security. We do not sell your personal data.
          </p>

          <h2>3. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your data. However, no
            method of transmission over the Internet is 100% secure.
          </p>

          <h2>4. Data Retention</h2>
          <p>
            We retain your data only as long as necessary to fulfil the purposes for which it was
            collected, or as required by applicable Indian law.
          </p>

          <h2>5. Contact</h2>
          <p>
            For privacy-related inquiries, please contact us at{' '}
            <a href="mailto:privacy@lawie.in">privacy@lawie.in</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
