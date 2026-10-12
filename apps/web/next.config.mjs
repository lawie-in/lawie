/* global process */
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@lawie/shared'],
  images: {
    remotePatterns: [{ protocol: 'http', hostname: 'localhost' }],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },
  // T-306: the Google callback lands on /auth/callback?code=…; no Referer may carry that URL.
  // Scoped to this one path. The page also renders <meta name="referrer"> as a backup.
  async headers() {
    return [
      {
        source: '/auth/callback',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Upload source maps for readable stack traces in Sentry
  silent: !process.env.CI,
  // Disable Sentry telemetry
  telemetry: false,
});
