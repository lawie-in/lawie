export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome back</h1>
        <p className="text-slate-500 mb-8">Sign in to your Lawie account</p>
        {/* Auth form will be implemented in SCRUM-9 */}
        <div className="p-4 bg-blue-50 rounded-lg text-blue-700 text-sm">
          🚧 Authentication implementation tracked in <strong>SCRUM-9</strong>
        </div>
      </div>
    </main>
  );
}
