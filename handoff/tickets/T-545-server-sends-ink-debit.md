# T-545: The draft "done" event carries the real Ink debit

| Field  | Value                                                    |
| ------ | -------------------------------------------------------- |
| Phase  | 4 — Polish and release                                   |
| Owner  | Arjun (design), a drafting lead (build), Ajay checks     |
| Mode   | Full chain (drafting, web)                               |
| Status | Merged into develop_staging 7bcd4d53 (CI 916 green), 22 Oct 2026; waiting on Anushka's check on develop. The done event carries inkDebited (the Ink actually settled) and the web chip uses only that. Premise note: today the debit always equals the quote; they differ only on settle failure (field omitted), the sweep path, and after T-202. Follow-ups: T-544 item 14; a test that the template flow still reaches the ready card when done carries inkDebited (T-539/T-544). Priya |
| Source | T-521 report; Ajay                                       |

## Problem

The "{n} Ink used" chip shows the quoted cost (T-388) because the SSE `done` event carries no debit. Ajay allowed this for v1 because the quote equals the charge. That stops being true if a quote and a charge can differ (see T-540 coupons, refunds on release).

## Acceptance criteria

1. The `done` event carries the Ink actually settled for the run (0 and absent are different: no settle means no field).
2. Web shows the chip from that field only; none on a failed or released draft; never "0 Ink used".
3. Tests for a settled run, a released run and an old client ignoring the field.
4. Ajay confirms the wording at READY.

## UNCONFIRMED by the real Arjun (marked by Priya, 22 Oct 2026)
The section below was relayed by Vishal and came from an Arjun subagent in his own session. T-545 is already merged (7bcd4d53). The real Arjun confirms, amends or strikes it; any amendment becomes a fix ticket. Ajay's sign-off (AJ-545-BC, AJ-545-M1) is real and unaffected: it is about the copy.

## Design rulings, UNCONFIRMED (22 Oct 2026, relayed by Vishal from a subagent)

1. **Timing:** `done` stays after settle. No follow-up event.
2. **Field:** `inkDebited: number`, flat on `done`, in Ink (.5 allowed). Units are converted to Ink once, in one helper in `credits.service.ts`.
3. **Source:** `settleInk` returns `units` whenever Ink was kept, including `ledger_failed`. On the sweep-paid path the kept units are read from the record if stored; otherwise fall back to `cost`, with a guard test that fails if the sweep ever keeps less than the full hold.
4. **Settle fails after a good draft:** the field is omitted, and each of the three paths logs a warn with a stable tag (runId and path only).
5. **Fixture, duplicate, client-gone, released:** omitted. `0` only for a real 0 settle. The web shows the chip only when `inkDebited > 0`; the fallback to the quote is removed.
6. **Naming:** not nested under `cost`. For T-538 / `design/draft-progress.md:59`: when `cost.settled` is true, `cost.ink` must equal `inkDebited`, from the same helper.

- No ADR needed. If T-202 later makes the debit differ from the quote on purpose, that change gets one. No `packages/shared` type now; T-538 can add one.

**Premise (for Status and Ajay):** today the debit always equals the quote, so there is no live overcharge. This ticket hardens the path ahead of T-202 and the sweep.

**Open UX question for Ajay at READY (not blocking):** when the draft is delivered but the debit is unknown because settle failed, should the user see anything?
