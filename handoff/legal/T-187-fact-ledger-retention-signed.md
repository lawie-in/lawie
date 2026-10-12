# T-187: Fact Ledger retention and deletion rule (signed)

Signed: Ajay (CLO), 12 Oct 2026 IST. Arjun names the mechanism (AC6). This file is the rule (AC1–5).

## Basis

- DPDP Act 2023, s.8(7): erase personal data once the purpose is no longer served, or when the user withdraws consent, unless the law requires it to be kept.
- s.8(5): reasonable security safeguards.
- s.12: the right to erasure.
- The ledger's purpose is to produce and revise the draft it belongs to.
- DPDP Rules 2025: I have not relied on any specific rule number here (verify before citing one).
- The rule matches the Privacy Policy §9 ("case details, drafts: while your account exists, until you ask us to erase") and is never longer than it.

## Rule

| Item | Kept for | Deleted when | How |
|---|---|---|---|
| `FactLedger`, every version | As long as the draft or matter it belongs to exists | (a) The user deletes that draft or matter, even if the draft itself is only soft-deleted (`isDeleted`). (b) The account is erased. (c) The intake is abandoned: no draft generated and no activity for 30 days. | Hard delete of all versions. No soft delete, no archive copy. |
| `LlmAuxCall` rows with purpose `intake_extract` | Linked to the user while the ledger exists | At the same moment as the ledger | `userId` and `intakeId` are removed, and only cost and usage numbers stay. A row must not keep any field that can be traced back to the user or the matter. |
| Redis `intake_extract` cache entry | At most 24 hours, and never longer than the ledger | When the TTL expires, and also on any ledger deletion above | Expire or delete the key. |
| `runType: "fixture"` ledgers | No limit | — | Synthetic data only. A fixture must never contain real client data. If one does, it falls under this rule as personal data. |

Other conditions:

- No ledger content (`raw_span`, `value`, `display`) goes into logs, Sentry, error responses or analytics (AC10).
- The fact-diff log (T-147d) stays at 90 days, as in Privacy Policy §9.
- Backups: none today (Privacy Policy §3). If backups are added later, this rule needs a fresh sign-off.
- Privacy Policy: no change needed. The 30-day abandoned-intake deletion is shorter than the policy's promise, so it is allowed without new wording.

Mark: **Approved** as the rule. The build (AC7–10) comes back to me for its diff check.

## Addendum 1 (12 Oct 2026 IST): Arjun's mechanism adopted, period set

This replaces the "Kept for" and "Deleted when" columns above. Arjun's table in the ticket (528da94) is approved, with these settings:

| Item | Rule |
|---|---|
| `FactLedger` (all versions) | Period **90 days from its last update** (`expiresAt` reset on each new version; TTL index). Hard delete at the earliest of: the period ending, the user deleting the draft, or the account being erased. The separate 30-day abandoned-intake rule is dropped, because the 90-day TTL covers it. |
| `intake_extract` rows | Unlinked (`userId` and `intakeId` removed) at the same moments. After that, only model, tokens, cost and timestamps stay, which is not personal data. |
| Redis cache | 30 minutes (`EX`), within my 24-hour limit. |
| Fixtures | Golden-set user only, synthetic data, same TTL. Approved. |

Basis is unchanged: DPDP Act 2023 s.8(7) (erase once the purpose is served), s.8(5) (safeguards, with ledger contents encrypted at rest under T-115a) and s.12 (erasure). The 90 days is shorter than Privacy Policy §9's "while your account exists", so no policy change is needed. Signed.

## Addendum 2 (12 Oct 2026 IST): Addendum 1 withdrawn, original rule stands

Our messages crossed. Arjun has already built the mechanism to the original rule (24977d2), so that rule stands and Addendum 1 is withdrawn:

- `FactLedger` lives as long as its draft or matter.
- It is hard-deleted on draft or matter delete (including today's soft-delete), on account erasure, or after 30 days for an intake that was never drafted.
- `intake_extract` rows are unlinked at the same moments, by the daily unlink job.
- Redis TTL is 30 minutes.
- Fixtures are synthetic data only.

Both rules are lawful. This one is final.
