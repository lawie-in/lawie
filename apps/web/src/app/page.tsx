import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
      <div className="text-center px-6">
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-white tracking-tight">
            ⚖️ Lawie
          </h1>
          <p className="mt-4 text-xl text-blue-200">
            Modern Legal Tech Platform
          </p>
          <p className="mt-2 text-slate-400 max-w-md mx-auto">
            Streamlining case management, document handling, and client communication for legal professionals.
          </p>
        </div>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/login"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Login
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Dashboard
          </Link>
        </div>
        <p className="mt-8 text-xs text-slate-600">
          Sprint 1 — Foundation & Setup · SCRUM-6
        </p>
      </div>
    </main>
  );
}
