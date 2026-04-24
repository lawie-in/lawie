import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import WaitlistForm from './WaitlistForm';

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 pt-16 text-white">
      {/* Subtle grid pattern overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-60" />

      <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28 lg:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left — copy & CTAs */}
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300">
              AI-powered drafting for Indian advocates
            </div>

            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Stop Googling legal formats.{' '}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                Start drafting court-ready documents.
              </span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-blue-100/80">
              Lawie is an AI-powered drafting tool built for young Indian advocates. Generate bail
              applications, legal notices, and more — formatted for your court, with the right
              sections, in under 5 minutes.
            </p>

            {/* Primary CTA */}
            <div className="mt-8">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 font-semibold text-slate-900 shadow-xl transition-all hover:bg-blue-50 active:scale-[0.98]"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Secondary CTA — waitlist */}
            <div className="mt-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-blue-300/70">
                Or join the early-access waitlist
              </p>
              <WaitlistForm ctaText="Join the waitlist — Free" />
            </div>
          </div>

          {/* Right — hero banner */}
          <div className="hidden items-center justify-center lg:flex">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl shadow-black/40 ring-1 ring-white/10">
              <Image
                src="/assets/lawie_hero_banner_1200x600.svg"
                alt="Lawie — Draft. Review. File. Built for Indian advocates."
                width={600}
                height={310}
                priority
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
