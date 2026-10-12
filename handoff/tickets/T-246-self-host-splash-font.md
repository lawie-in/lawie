# T-246 — Self-host the Google Font in LogoSplash

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Rajesh (the font must look the same) |
| Mode           | Small fix (web) |
| Status         | To do. Unassigned. Ajay's T-235 follow-up, 12 Oct 2026 |

`apps/web/src/components/marketing/LogoSplash.tsx:21` fetches Google Fonts at runtime, which sends every visitor's IP to Google. Serve the font through `next/font`, self-hosted at build time like the other fonts.

## Acceptance criteria

1. No request goes to fonts.googleapis.com or fonts.gstatic.com when the page loads.
2. The splash looks the same.
