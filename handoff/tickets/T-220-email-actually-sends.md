# T-220 — Emails actually reach users

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun (provider, domain, deploy; ADR if not already recorded). Founder (DNS and AWS account access). Lead (build). Anushka (verdict) |
| Mode           | Arjun's call first, then build, full chain (email-worker, infra) |
| Status         | Needs scoping. Waits for Arjun |
| Size           | Arjun S. Build M |
| Depends on     | None |
| Gate           | Before v1 go-live (T-403). T-221 and T-222 cannot send for real without it |
| Branch         | feature/t-220-email-sends |
| Legal sign-off | Through T-225 (content rules, privacy policy line for the provider) |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Problem

`apps/email-worker` and `packages/email-client` exist (queue, SES/SMTP/dry-run providers, one `auth.welcome` stub), but no service calls `enqueue`, and nothing says where the worker runs or which domain it sends from. Today no user receives any email.

## Acceptance criteria

1. Arjun records the provider (SES is the code default), the sending domain and from-address, and where the worker runs, in an ADR or a note in this file.
2. The sending domain has SPF, DKIM and DMARC records; mail to Gmail and Outlook lands in the inbox, not spam (lead's report shows the headers pass).
3. SES is out of the sandbox for the prod account, or the founder decides otherwise.
4. The worker runs next to the other services on develop, reads its queue from the same Redis, and retries a failed send with backoff. A job that keeps failing is kept for `scripts/replay.ts`, not lost.
5. Local and CI use `EMAIL_PROVIDER=dry-run`; no test sends real mail.
6. Logs and Sentry hold the template id and a user id, never the address or the body (same rule as T-210).
7. CI green on email-worker and email-client.

## Out of scope

- Which emails are sent (T-221, T-222, T-224)
- `drafting.draftComplete` and the three `admin.*` templates: not in v1 unless Priya re-scopes
- Marketing email

## References

- `apps/email-worker/src/config/env.ts`, `packages/email-client/src/index.ts`
- T-210, T-225
