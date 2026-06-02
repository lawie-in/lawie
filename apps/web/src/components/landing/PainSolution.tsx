import { Clock, FileWarning, Shuffle } from 'lucide-react';

const cards = [
  {
    icon: Clock,
    pain: 'Spent 3 hours drafting a bail application from scratch?',
    solution: 'Lawie generates it in 5 minutes — with correct BNS sections and court formatting.',
  },
  {
    icon: FileWarning,
    pain: 'Registry returned your document for wrong formatting?',
    solution:
      'Lawie formats for your specific court — District Court, Sessions Court, or High Court.',
  },
  {
    icon: Shuffle,
    pain: 'Confused between old IPC and new BNS sections?',
    solution: 'Lawie auto-maps to the latest BNS, BNSS, and BSA provisions. No more guesswork.',
  },
];

export default function PainSolution() {
  return (
    <section className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold text-slate-900 sm:text-4xl">
          Sound familiar?
        </h2>
        <p className="mt-3 text-center text-lg text-slate-500">
          Young advocates face these problems every single day.
        </p>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.pain}
              className="group relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="group-hover:bg-lawie-50 group-hover:text-lawie-600 mb-5 inline-flex rounded-xl bg-red-50 p-3 text-red-500 transition-colors">
                <card.icon className="h-6 w-6" />
              </div>

              <p className="font-semibold leading-snug text-slate-800">&ldquo;{card.pain}&rdquo;</p>

              <div className="my-4 h-px bg-slate-100" />

              <p className="leading-relaxed text-slate-600">{card.solution}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
