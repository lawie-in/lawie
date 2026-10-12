# T-326 — Converter: new-provision rows read "Section NEW-1 IPC"

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (how it looks), Ajay (the words). Lead (build, web) |
| Mode   | Small fix (web) |
| Status | To do. Waits on Rajesh and Ajay. Found by Tanvi in T-280, 12 Oct 2026. Pre-existing |

In the section converter, reverse lookups for provisions that are new in BNS (no IPC equivalent) show "Section NEW-1" under the INDIAN PENAL CODE heading. Copy gives "Section NEW-1 IPC". Both look like a real IPC section.

## Acceptance criteria

1. New-provision rows show what Rajesh and Ajay decide (layout and words), not "Section NEW-1" under IPC.
2. Copy never produces "NEW-n IPC".
3. Check at 375 and 1280 px.
