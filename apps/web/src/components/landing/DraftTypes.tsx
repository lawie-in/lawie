import { Gavel, FileText, Home, ShieldAlert, FolderOpen, Download } from 'lucide-react';

const templates = [
  { icon: Gavel, label: 'Bail Applications (Regular + Anticipatory)' },
  { icon: FileText, label: 'Legal Notices (S.80 CPC, S.138 NI Act)' },
  { icon: Home, label: 'Rent Agreements' },
  { icon: ShieldAlert, label: 'Consumer Complaints' },
  { icon: FolderOpen, label: 'Vakalatnama, Affidavits, and 10+ more templates' },
  { icon: Download, label: 'Export as PDF or DOCX — ready to file' },
];

export default function DraftTypes() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="text-center text-3xl font-bold text-slate-900 sm:text-4xl">
          What You Can Draft
        </h2>
        <p className="mt-3 text-center text-lg text-slate-500">
          Court-ready formats — generated in minutes, not hours.
        </p>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <div
              key={t.label}
              className="hover:bg-lawie-50/50 hover:border-lawie-200 flex items-start gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-5 transition-colors"
            >
              <div className="bg-lawie-100 text-lawie-700 shrink-0 rounded-lg p-2.5">
                <t.icon className="h-5 w-5" />
              </div>
              <span className="pt-1 font-medium leading-snug text-slate-700">{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
