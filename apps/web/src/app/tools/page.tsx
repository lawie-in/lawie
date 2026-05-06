import { ArrowLeftRight, Scale, Clock, ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Free Legal Tools for Indian Advocates — Lawie',
  description:
    'Free tools for Indian advocates: IPC/CrPC/IEA to BNS/BNSS/BSA section converter, bail eligibility checker, BNSS timeline tracker. No login required.',
};

const tools = [
  {
    title: 'IPC / CrPC / IEA Section Converter',
    description:
      'Convert between old (IPC, CrPC, IEA) and new (BNS, BNSS, BSA) section numbers instantly.',
    href: '/tools/section-converter',
    icon: ArrowLeftRight,
    available: true,
  },
  {
    title: 'Bail Eligibility Checker',
    description:
      'Check if an offence is bailable or non-bailable under BNS/BNSS, and which court to approach.',
    href: '/tools/bail-checker',
    icon: Scale,
    available: false,
  },
  {
    title: 'BNSS Investigation Timeline Tracker',
    description:
      'Calculate custody limits, chargesheet deadlines, and investigation timelines under BNSS.',
    href: '/tools/timeline-tracker',
    icon: Clock,
    available: false,
  },
];

export default function ToolsIndexPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Lawie
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Free Legal Tools</h1>
          <p className="mt-1 text-sm text-slate-500">
            No login required. Built for Indian advocates navigating the new criminal laws.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const Card = (
              <div
                key={tool.href}
                className={`rounded-xl border bg-white p-6 shadow-sm transition-all ${
                  tool.available
                    ? 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                    : 'border-slate-100 opacity-60'
                }`}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <Icon className="h-5 w-5 text-blue-600" />
                </div>
                <h2 className="mb-1 font-semibold text-slate-900">{tool.title}</h2>
                <p className="text-sm text-slate-500">{tool.description}</p>
                {!tool.available && (
                  <span className="mt-3 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                    Coming Soon
                  </span>
                )}
              </div>
            );

            return tool.available ? (
              <Link key={tool.href} href={tool.href}>
                {Card}
              </Link>
            ) : (
              <div key={tool.href}>{Card}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
