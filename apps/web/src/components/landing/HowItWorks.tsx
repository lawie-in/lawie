import { ListChecks, PenLine, FileDown } from 'lucide-react';

const steps = [
  {
    num: '01',
    icon: ListChecks,
    title: 'Select your document type and court',
    description:
      'Pick from bail applications, legal notices, rent agreements, and more. Choose your court level.',
  },
  {
    num: '02',
    icon: PenLine,
    title: 'Fill in party details and key facts',
    description:
      'Enter names, dates, and relevant facts. Lawie structures everything into the right legal format.',
  },
  {
    num: '03',
    icon: FileDown,
    title: 'Download your court-ready draft in PDF or DOCX',
    description: 'Get a professionally formatted document — ready to review, print, and file.',
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-gradient-to-b from-slate-50 to-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold text-slate-900 sm:text-4xl">How It Works</h2>
        <p className="mt-3 text-center text-lg text-slate-500">
          Three simple steps. One court-ready document.
        </p>

        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="relative text-center">
              {/* Step number badge */}
              <div className="bg-lawie-600 shadow-lawie-600/25 mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
                <step.icon className="h-6 w-6" />
              </div>
              <span className="bg-lawie-50 text-lawie-700 mb-3 inline-block rounded-full px-3 py-0.5 text-xs font-bold tracking-wide">
                STEP {step.num}
              </span>
              <h3 className="text-lg font-semibold text-slate-800">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
