# Lawie — Email Address Strategy

**Author:** Madhuri (Content), with infra input deferred to Arjun (CTO) on DKIM/SPF specifics
**Date:** 2026-05-12
**For:** Founder + Vishal (SCRUM-77)
**Domain:** `lawie.in`
**Recommendation summary:** Google Workspace Business Starter for Phase 1. 6 mandatory addresses, 3 nice-to-have, 2 deferred.

---

## TL;DR

- **Default transactional FROM:** `hello@lawie.in` (NOT `noreply@`). Reasoning below.
- **Billing FROM:** `billing@lawie.in` (separate — advocates expect a formal-looking address for tax/accounting trails).
- **REPLY_TO:** `hello@lawie.in` lands in founder inbox in Phase 1 (single shared inbox). Switch to a help-desk tool in Phase 2 when ticket volume justifies it.
- **Workspace cost (Phase 1):** ~₹1,176/month for 6 paid mailboxes on Business Starter (₹196/user/month × 6) + ~10 free aliases. Add one more mailbox per added human; aliases are free.

---

## Why `hello@` and not `noreply@` for transactional emails

Three reasons specific to our advocate cohort:

1. **Advocates reply to emails.** Court-going professionals are not used to "no reply" conventions. If a senior advocate has a question about an invoice or a draft, they will reply to the email they received. Bouncing that reply with a `noreply@` rejection looks dismissive and breaks rapport.
2. **`noreply@` hurts deliverability.** Gmail and major ISPs slightly penalise FROM domains where reply traffic is auto-rejected — it correlates with cold/bulk senders. `hello@` with active monitoring trains positive engagement signals.
3. **Phase 1 inbox volume is manageable.** With ≤25 paid users targeted in 90 days, founder can reasonably triage `hello@` replies daily. We will revisit when volume exceeds ~30 replies/week.

**Trade-off:** Slightly more inbox load for founder. Mitigated by Kavya agent triaging and routing.

---

## Address table

| #   | Address                 | Use case                                                                                                                                                                                            | DKIM/SPF                                                                                                  | Monitored by                                                                                                                                                      | Priority              |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | `hello@lawie.in`        | Default FROM for all transactional emails (welcome, verify, draft-complete, low-credit, all advocate-facing). REPLY_TO target for all advocate emails.                                              | **Yes — required.** SES verified domain. DKIM + SPF + DMARC quarantine.                                   | Human (founder, Phase 1). Triaged daily by Kavya agent.                                                                                                           | **P0**                |
| 2   | `billing@lawie.in`      | FROM for `billing.subscriptionConfirmed`, `billing.paymentFailed`, `billing.monthlyInvoice`, `billing.lowCreditWarning`. Separate FROM so advocates can filter and archive for tax records cleanly. | **Yes — required.** Same DKIM/SPF/DMARC config as `hello@`.                                               | Human (founder + later Vikram CFO). Auto-acknowledgement reply for advocates noting "for billing queries, reply to this email — we respond within 1 working day". | **P0**                |
| 3   | `abhinav@lawie.in`      | Founder's personal address. FROM for `admin.advocatePackInvite` (peer-to-peer outreach), digests received TO this address, internal team comm, any 1:1 advocate correspondence.                     | **Yes — required** (he sends from here).                                                                  | Human (founder).                                                                                                                                                  | **P0**                |
| 4   | `kavya@lawie.in`        | FROM for internal admin emails: `admin.founderDailyDigest`, `admin.referralIssued`. Identifies the agent rather than the system, which makes the founder's daily reading habit cleaner.             | **Yes — required** (sends outbound to founder; ensures messages don't go to spam in founder's own inbox). | Auto (Kavya agent only). Replies routed back to Kavya agent.                                                                                                      | **P0**                |
| 5   | `support@lawie.in`      | Inbound support queries (advocate writes in cold from website or social). Phase 1: forwards to `hello@` (which is founder). Public-facing address on the website and footer.                        | SPF only required for inbound. DKIM optional unless we send FROM here (we won't in Phase 1).              | Human (founder via forward). Phase 2 → help-desk tool (Freshdesk / HelpScout).                                                                                    | **P0**                |
| 6   | `security@lawie.in`     | Vulnerability disclosure, breach reports, abuse reports. Industry standard expected by security researchers and required for some compliance disclosures. Publish on `/security.txt`.               | SPF only required (inbound).                                                                              | Human (founder). Auto-acknowledgement reply: "Received. We respond to security reports within 48 hours."                                                          | **P0**                |
| 7   | `legal@lawie.in`        | Legal notices, DMCA, privacy/data requests (DPDP Act), BCI correspondence. Ajay (CLO) owns this domain.                                                                                             | SPF only required (inbound). DKIM if Ajay sends from here.                                                | Human (Ajay CLO, with founder cc'd). Auto-acknowledgement reply: "Received. Our legal team will respond within 7 working days."                                   | **P0**                |
| 8   | `careers@lawie.in`      | Inbound applications when we open hiring. Not relevant Phase 1, but cheap to set up as an alias now to reserve the address.                                                                         | SPF only (inbound).                                                                                       | Human (founder, Phase 1). Auto-reply: "We are not actively hiring but will keep your CV on file."                                                                 | P1                    |
| 9   | `partnerships@lawie.in` | Inbound from law firms, bar associations, training institutes. Aliased to founder Phase 1.                                                                                                          | SPF only (inbound).                                                                                       | Human (founder).                                                                                                                                                  | P1                    |
| 10  | `news@lawie.in`         | FROM for marketing/newsletter sends (Phase 2). Kept separate from `hello@` so any deliverability/reputation issue on the marketing side does not contaminate transactional.                         | Will require DKIM/SPF/DMARC when activated.                                                               | Outbound only. Replies route to `hello@`.                                                                                                                         | P2 — defer to Phase 2 |
| 11  | `press@lawie.in`        | Inbound from journalists. Defer to Phase 2 when there's a story worth telling.                                                                                                                      | SPF only (inbound).                                                                                       | Human (founder).                                                                                                                                                  | P2                    |

---

## DKIM / SPF / DMARC — quick technical guidance

Owner: Arjun (CTO) — this is his call on exact records, but the policy framing is:

- **All sending addresses** (`hello@`, `billing@`, `abhinav@`, `kavya@`) need full DKIM + SPF + DMARC.
- **SPF record** must include both Google Workspace (`_spf.google.com`) AND AWS SES (`amazonses.com`) — because workspace-originated mail (founder typing in Gmail) and SES-originated mail (BullMQ-queued transactional) both need to pass.
- **DMARC policy:** Start at `p=quarantine; pct=25` for the first month, ramp to `p=quarantine; pct=100`, then to `p=reject` once we're confident no legitimate traffic is being rejected. Aggregate reports to `dmarc@lawie.in` (set up as an alias to founder + a third-party aggregator like dmarcian's free tier).
- **MTA-STS:** Optional but recommended in Phase 2 — gives a small reputation boost with Gmail.

---

## Google Workspace setup recommendation

**Plan:** Business Starter — ₹196/user/month (post-GST).

**Mailboxes to provision (Phase 1, billable):**

| Mailbox            | User                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `abhinav@lawie.in` | Founder (Abhinav)                                                                                                |
| `hello@lawie.in`   | Shared inbox — founder primary, Kavya agent access via OAuth                                                     |
| `billing@lawie.in` | Shared inbox — founder primary, future CFO access                                                                |
| `kavya@lawie.in`   | Agent service account                                                                                            |
| `support@lawie.in` | Forwarding-only alias initially (free) — promote to full mailbox when help-desk tool is added in Phase 2         |
| `legal@lawie.in`   | Forwarding-only alias to Ajay's personal until he gets a dedicated mailbox — promote when Ajay onboards formally |

**Effective billing count for Phase 1:** 4 paid mailboxes (`abhinav`, `hello`, `billing`, `kavya`) at ₹196 each = **₹784/month**. Add the support and legal mailboxes when traffic justifies — total caps at ~₹1,176/month for 6 mailboxes.

**Free aliases (unlimited up to 30/user):** `security@`, `careers@`, `partnerships@`, `press@`, `news@` (until Phase 2 promotes it), `dmarc@`, `postmaster@`, `abuse@` — all alias to founder or to the relevant primary mailbox.

**One-time setup tasks for Arjun:**

1. Verify domain ownership in Workspace admin console.
2. Add MX records for Workspace.
3. Add SPF, DKIM, DMARC TXT records (per section above).
4. Set up AWS SES with `lawie.in` as a verified sending domain — needs separate DKIM keys published to DNS.
5. Add the SES IP/sender to the SPF record.
6. Request SES production access (out of sandbox) before the first live send.

---

## Cost summary

| Item                                                             | Monthly cost               |
| ---------------------------------------------------------------- | -------------------------- |
| Google Workspace Business Starter — 4 mailboxes (Phase 1 launch) | ₹784                       |
| AWS SES — first 62,000 emails/month from EC2                     | Free                       |
| AWS SES — beyond free tier (assume 50k emails/month Phase 1)     | ₹0                         |
| **Total Phase 1**                                                | **~₹784 + applicable GST** |
| Phase 1 plus support + legal mailboxes (when ready)              | ~₹1,176                    |
| Phase 2 add: `news@` mailbox + ESP integration (if needed)       | TBD                        |

---

## What I am explicitly NOT doing in this doc

- **Recommending a help-desk tool** — that's Meera's call for Phase 2 (Freshdesk vs HelpScout vs Crisp).
- **Setting up the actual DNS records** — Arjun's owns implementation.
- **Drafting auto-reply copy** — happy to write those next; flagged but not in this scope.
- **Privacy policy / DPDP compliance copy** — Ajay (CLO) owns the legal text; I'll write the email-facing surfaces once he confirms.

— Madhuri
