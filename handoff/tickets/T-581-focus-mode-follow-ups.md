# T-581: Focus-mode follow-ups (from T-578 round 3)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — UI polish (none blocking; parked until after Anushka's first run) |
| Owner  | Rajesh (design if any), a lead (build; web) |
| Mode   | Small fix (web only) |
| Status | To do. Posted 23 Oct 2026 from Kunal's T-578 report. Priya |
| Source | Kunal's T-578 round 3 report |

## Items
1. Tab is not trapped during the 150 ms exit fade of focus mode.
2. The save state ("Saving / Saved / Save failed") has no `aria-live` region (pre-existing); screen-reader users get no announcement.
3. The real citation-pill click in a browser is covered by jest only; add a Playwright case.
4. A real-browser and screen-reader pass for focus mode is still outstanding (needs a human or Anushka's run; not an agent task).

## Files
Claimed by Priya when a lead takes it; after T-578 has merged.
