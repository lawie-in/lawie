import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'IPC to BNS Section Converter | Free Tool — Lawie',
  description:
    'Free IPC to BNS, CrPC to BNSS, IEA to BSA section converter. Look up old and new Indian criminal law section numbers. Check the bare act before you rely on a mapping.',
  keywords: [
    'IPC to BNS converter',
    'CrPC to BNSS converter',
    'IEA to BSA converter',
    'section converter',
    'BNS section number',
    'new criminal law sections',
    'Bharatiya Nyaya Sanhita',
    'Bharatiya Nagarik Suraksha Sanhita',
    'Bharatiya Sakshya Adhiniyam',
  ],
};

export default function SectionConverterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
