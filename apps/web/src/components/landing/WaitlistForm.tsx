'use client';

import { Mail } from 'lucide-react';
import { useState } from 'react';

export default function WaitlistForm({
  ctaText = 'Join the waitlist — Free to start',
}: {
  ctaText?: string;
}) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    // TODO: POST to waitlist API endpoint (SCRUM-28)
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-6 py-4 font-medium text-green-800">
        <Mail className="h-5 w-5" />
        You&apos;re on the list! We&apos;ll reach out soon.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 sm:flex-row"
    >
      <div className="relative w-full flex-1">
        <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="focus:ring-lawie-600 w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-10 pr-4 text-slate-900 transition placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2"
        />
      </div>
      <button
        type="submit"
        className="bg-lawie-600 shadow-lawie-600/25 hover:bg-lawie-700 w-full whitespace-nowrap rounded-xl px-6 py-3.5 font-semibold text-white shadow-lg transition-all active:scale-[0.98] sm:w-auto"
      >
        {ctaText}
      </button>
    </form>
  );
}
