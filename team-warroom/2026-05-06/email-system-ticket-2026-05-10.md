# Email System Ticket — Filed 2026-05-10

## Jira

- **Key:** SCRUM-77
- **URL:** https://abhinava32.atlassian.net/browse/SCRUM-77
- **Type:** Story
- **Priority:** High (P1)
- **Status:** To Do
- **Title:** Email system — BullMQ workers + AWS SES + cross-service producer
- **Assignee:** Abhinav (founder default — Vishal will pick up)
- **Labels:** email, infra, phase-1, P1

Note on numbering: SCRUM-74/75/76 were already taken (advocate-panel review, court-rule golden-master, Helicone runbook). New ticket landed at SCRUM-77.

## inputToDev.md

- **File:** `/Users/abhinavanand/Files/Lawie/docs/inputToDev.md`
- **Entry inserted at line 2278** (immediately after the prior tail `Jira: SCRUM-69 / ---`)
- **Pickup-order update appended after the entry** as a "PICKUP ORDER UPDATE — 10 May 2026" section.

## Pickup-order slot

P1, slotted AFTER the user-facing P0 work (SCRUM-65 annexures pack, SCRUM-71 referral). Specifically position #5 in the revised clean queue:

1. SCRUM-65 — Annexures pack (P0)
2. SCRUM-71 — Referral codes (P0)
3. SCRUM-67 — Grounds-vs-facts coherence (P1)
4. SCRUM-75 — Court-rule golden-master (P1)
5. **SCRUM-77 — Email system (P1)** ← here
6. SCRUM-51 — Hindi/bilingual (Partial)
7. SCRUM-76 — Helicone runbook (P2)
8. SCRUM-59 / SCRUM-73 — Credits (Blocked)

Rationale: email infra is plumbing — it unblocks SCRUM-71 founder-ping email, SCRUM-73 receipt email, and the founder daily digest, but does NOT block advocate-panel review or Phase-1 launch.

## Reference ADR

`/Users/abhinavanand/Library/Application Support/Claude/local-agent-mode-sessions/57384051-4f1b-4a23-8a76-89db28aa1571/7b6b8ec1-f738-459d-a6cf-0b02da2b7191/local_23a57bcc-592d-4d5b-87ab-507762018fd8/outputs/adr-email-system-2026-05-10.md`
(ADR-007, Arjun, 2026-05-10)

## Scope captured (12 work items)

apps/email-worker container; packages/email-client producer; BullMQ email:high + email:low queues; AWS SES ap-south-1 + IAM; DNS DKIM/SPF/DMARC; 11 React Email templates; bounce/complaint suppression list; Sentry instrumentation; DLQ + replay CLI; .env keys (12 required); .env.example + environments.md update; per-service wire-ins (auth, billing, drafting; gateway none).

## Acceptance criteria

14 ACs capturing: <10ms producer p95, request-path independence, all 11 templates render, queue-lag budgets (high <5s p95, low <60s p95), suppression flow, DRY_RUN + DEV_REDIRECT_TO, DLQ replay, idempotency dedupe, Sentry breadcrumb chain, Zod hard-fail on missing env, no PII anywhere, founder digest content + 09:00 IST cadence.

## Effort

L — 4-5 dev-days (Vishal).
