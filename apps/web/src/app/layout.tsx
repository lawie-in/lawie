import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { AuthProvider } from '@/context/AuthContext';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Lawie — AI Legal Drafting for Indian Advocates',
  description:
    'Stop Googling legal formats. Lawie is an AI-powered drafting tool built for young Indian advocates. Generate bail applications, legal notices, and more — court-ready, in under 5 minutes.',
  keywords: [
    'legal drafting',
    'AI legal tool',
    'Indian advocates',
    'bail application',
    'legal notice',
    'court-ready documents',
    'BNS',
    'BNSS',
    'BSA',
  ],
  icons: {
    icon: '/app-icon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
