# T-284 — Privacy policy: the waitlist bullets

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Ajay signed the text |
| Mode           | Small fix (web, copy only) |
| Status         | Merged into develop_staging (f1819ef), waiting for Anushka on develop |

The privacy policy does not mention the waitlist. Add exactly the section 2 bullet and the section 9 bullet that Ajay signed in `handoff/legal/emails-waitlist-panel-signed.md` (8b229b4) to `apps/web/src/app/(marketing)/privacy/page.tsx`. Also the retention line for an untouched waitlist entry: 18 months. Ajay signs the diff as applied. Must merge before T-243 goes live.

## Acceptance criteria

1. The two bullets appear word for word; nothing else on the page changes.
2. Hand-check at 375 and 1280 px in the report (`apps/web` has no tests).
