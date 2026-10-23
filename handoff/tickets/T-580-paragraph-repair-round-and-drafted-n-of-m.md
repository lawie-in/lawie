# T-580: Legacy-path repair round and "drafted N of M" warning (follow-up to T-577)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Product (follow-up to T-577; after Mahak's T-567 and T-577 have merged; parked until after Anushka's first run) |
| Owner  | Arjun (design, ruling 5), Ajay (the warning string), a lead (build; drafting) |
| Mode   | Full chain (drafting; money-adjacent) |
| Status | To do. Posted 23 Oct 2026 on Arjun's request. Priya |
| Source | T-577 ticket, Shashank's round 2 NOTE; Arjun's ruling 5 |

## Problem
Arjun's T-577 ruling 5 asks for a repair round when the model delivers a different number of paragraphs than asked, and a "drafted N of M" warning on the legacy brief path (hi/bilingual or no ledger). Neither is in T-577's diff because they need `ai.service.ts` and `brief-drafter.ts`, outside T-577's claim. Until this ticket lands, under-delivery on the legacy path settles at the delivered band, which is honest (the charge only goes down) but gives the user no explanation.

## Acceptance criteria
1. On the legacy brief path, if the delivered count is outside the target +-1, one repair round runs; never truncate or pad.
2. After the repair round, a short "drafted N of M" warning shows on draft-ready when still under (Ajay signs the string; he may reuse AJ-577-M1 (3)).
3. The charge still never exceeds the shown ceiling (M6); a test pins it for the repair path.
4. Tests; golden set unchanged for the default count.

## Files
Claimed by Priya when a lead takes it: `apps/drafting/src/services/ai.service.ts`, `brief-drafter.ts`, tests. Not before T-577 and T-567 are merged.

## Added 23 Oct 2026 (Arjun, from T-577 round 3; pre-existing, not blocking)
5. A sweep that reads an Ink hold before the route's settle-units mark lands keeps the full hold while `done` shows the delivered band. It over-reports but never over-charges (M6 holds). Fix: the sweep recomputes the charge from the hold it actually pulled. Test for the race.
