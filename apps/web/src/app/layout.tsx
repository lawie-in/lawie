import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';

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
    icon: '/app-icon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-ZSMN1GPPB5"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-ZSMN1GPPB5');
          `}
        </Script>
      </head>
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
