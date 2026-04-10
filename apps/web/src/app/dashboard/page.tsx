export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-slate-500">Your legal workspace at a glance.</p>
        {/* Dashboard widgets will be built in future sprints */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {['Cases', 'Documents', 'Clients'].map((item) => (
            <div key={item} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-700">{item}</h2>
              <p className="mt-1 text-slate-400 text-sm">Coming in Sprint 2</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
