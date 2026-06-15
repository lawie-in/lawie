import Image from 'next/image';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <Image
              src="/assets/lawie-lockup.png"
              alt="Lawie"
              width={140}
              height={32}
              className="h-8 w-auto"
            />
            <span className="text-sm text-slate-400">· AI Legal Drafting for Indian Advocates</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <Link href="/terms" className="transition-colors hover:text-slate-800">
              Terms of Service
            </Link>
            <span className="text-slate-300">|</span>
            <Link href="/privacy" className="transition-colors hover:text-slate-800">
              Privacy Policy
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="mt-6 text-center text-xs text-slate-400">
          AI-assisted drafting tool — not a substitute for legal advice.
        </p>
      </div>
    </footer>
  );
}
