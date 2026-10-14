# T-435: post-v1 cleanup: legacy credit fields, UsageLog, inkAnnualCarry

| Field  | Value                                                    |
| ------ | -------------------------------------------------------- |
| Status | Parked (after v1; after T-115c and T-433). Priya, 14 Oct 2026 |
| Owner  | Lead (build), Arjun                                      |
| Mode   | Full chain (auth + drafting + billing + web)             |

## Source

Arjun, 14 Oct 2026, from T-433 and T-434: three leftovers kept in one place.

## Acceptance criteria

1. Remove the legacy User credit fields (subscriptionCredits, topupCredits, earnedCredits) and the old credits system that still reads them (about seven files across auth, drafting and web; T-434's report lists them).
2. Delete apps/drafting/src/models/UsageLog.model.ts (no writer), after T-115c's erase stops referencing it.
3. Drop the inkAnnualCarry field (kept at 0 by T-433; about 60 reads across four workspaces).
