import Link from 'next/link';

import LawieLogoMark from '@/components/LawieLogoMark';

export default function Navbar() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-slate-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo — no background, burns into the dark nav */}
        <Link href="/" className="flex items-center">
          <LawieLogoMark variant="light" className="h-9 w-auto" />
        </Link>

        {/* Nav CTA */}
        <Link
          href="/login"
          className="bg-lawie-600 hover:bg-lawie-700 shadow-lawie-600/20 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all active:scale-[0.97]"
        >
          Get Started
        </Link>
      </div>
    </nav>
  );
}
