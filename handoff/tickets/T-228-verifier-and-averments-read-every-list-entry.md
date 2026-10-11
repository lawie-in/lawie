# T-228 — The verifier and the averments read every entry of a list field

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (signs the change to how averments and checks read list facts), Vishal (build), Anushka (verdict) |
| Mode           | Build, full chain (drafting). Ajay signs the diff before merge |
| Status         | FOLDED INTO T-189 (Priya, 11 Oct 2026 23:15). AC5 of T-189 cannot hold end to end without it. Its acceptance criteria now apply to T-189 |
| Size           | M (1 day) |
| Depends on     | T-189 |
| Gate           | Before `feature.fact_ledger` goes on for real users, next to T-189 |
| Branch         | feature/t-228-verifier-reads-every-list-entry |
| Legal sign-off | Ajay signs the diff to `averments.ts` and `fact-verifier.ts` (how averments unlock and what the verifier counts as left out) |
| Created        | 2026-10-11 |
| Source         | T-189 reviewer round 1 and Ajay's block on 910ced6, 11 Oct 2026. Vishal asked for it |

## Problem

After T-189 the Drafter receives every entry of a list or choices key (for example two sections charged in `bail_regular`). `factsByKey` in `apps/drafting/src/services/averments.ts` still keeps one fact per key (the last entry wins), and `fact-verifier.ts` and `resolveAverments` read through it. So the verifier and averment unlocking see only one entry of a list. A correct draft can get a wrong "left out" result and a paid repair call, or a check can miss a dropped entry. Ajay ruled the fix out of T-189: it changes averment selection and the verifier, so it needs its own sign-off.

## Acceptance criteria

1. The verifier checks each entry of a list or choices key on its own (presence per entry), never one joined string. A draft that writes "318(4) BNS and 319(2) BNS" passes for entries "318(4) BNS" and "319(2) BNS".
2. Averment unlock conditions see every entry of a list or choices key. Single-value keys behave byte for byte as today.
3. No joined `raw_span` that is not the advocate's own text is ever created (Ajay's T-189 point).
4. No repair call fires for a draft that contains every entry.
5. Ajay signs the diff to `averments.ts` and `fact-verifier.ts` in this file before merge.
6. Golden snapshots unchanged unless Ajay signs the change; drafting CI green.

## Out of scope

- Partly resolved list keys (T-188)

## References

- T-189 (Ajay sign-off sections), T-147c, T-147d
