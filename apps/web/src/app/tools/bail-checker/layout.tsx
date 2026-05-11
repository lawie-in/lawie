import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bail Eligibility Checker | BNS Bailable Non-Bailable — Lawie',
  description:
    'Free bail eligibility checker for Indian advocates. Enter BNS or IPC sections to check if an offence is bailable or non-bailable, which court to approach, and which BNSS section to cite.',
  keywords: [
    'bail eligibility checker',
    'bailable non-bailable BNS',
    'BNSS bail section',
    'bail application court',
    'BNS offence classification',
    'IPC to BNS bail',
    'anticipatory bail BNSS 482',
    'regular bail BNSS 480',
  ],
};

export default function BailCheckerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
