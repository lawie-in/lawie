import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'IPC to BNS Section Converter | Free Tool — Lawie',
  description:
    'Free IPC to BNS, CrPC to BNSS, IEA to BSA section converter. Instantly look up old and new Indian criminal law section numbers. 500+ validated mappings.',
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
