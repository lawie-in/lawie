# T-455: No recipient addresses in email-worker logs

| Field  | Value |
| ------ | ----- |
| Status | Todo. Kunal builds (Priya, 15 Oct 2026) |
| Owner  | Kunal (build), Arjun (rules) |
| Mode   | Small fix plus reviewer (personal data in logs) |

## Source

Tanvi, in T-229 (15 Oct 2026): the email worker logs recipient addresses at apps/email-worker/src/routes/send.ts:50 and :56 and apps/email-worker/src/providers/ses.ts:57. Must be fixed before T-220 sends real mail. No personal data in third-party logs is a standing rule.

## Acceptance criteria

1. No log line in the email worker contains a recipient address, in any field or message text.
2. Logs keep what is needed to debug: template name, provider, message id, status, error code. Use the existing safe-log helper (providers/safe-log.ts) where it fits.
3. A test per call site fails if an address-shaped string appears in the logged output.

## Files (claimed for Kunal)

apps/email-worker/src/routes/send.ts, apps/email-worker/src/providers/ses.ts, new apps/email-worker/src/__tests__/t455-no-recipient-in-logs.test.ts. Not index.ts or worker.ts (Tanvi's T-229 holds the Sentry wiring). Anything else: ask Priya.

## Out of scope

Other services' logs (T-229 covers Sentry), templates, packages/shared.
