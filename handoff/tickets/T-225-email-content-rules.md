# T-225 — What our emails may and may not contain

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Ajay (rules, signs), Arjun (heads-up), Madhuri (applies them to copy) |
| Mode           | Rule first (Ajay) |
| Status         | To do. Waits for Ajay |
| Size           | Ajay S |
| Depends on     | None |
| Gate           | Before any email copy is approved (T-221, T-222, T-224) |
| Branch         | None (rules only; any code change goes to the ticket that needs it) |
| Legal sign-off | Ajay signs in this file |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Problem

The email provider is a third party. Our users are advocates whose matters are confidential, and DPDP applies to the user's own data.

## Acceptance criteria

1. Ajay writes and signs the rules: no case details, document content, client or party names in any email; which emails are transactional and need no consent; what the footer must carry (who we are, contact, privacy policy link, an unsubscribe for anything non-transactional).
2. Ajay says whether the privacy policy must name the email provider (as T-114 did for Helicone) and gives the line.
3. Ajay says whether BCI rules limit what we may say to advocates in a welcome email.
