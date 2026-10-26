# T-618: Top-up GST State is pre-set to Delhi

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P1; from the prod quality check of 26 Oct 2026) |
| Owner  | Kunal/Tanvi (web); Vikram and Ajay glance |
| Mode   | Small fix |
| Status | To do. Raised by Priya from Anushka's prod FAIL, 26 Oct 2026. Not assigned: starts when the founder lifts the stop. Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
The top-up GST State is pre-set to 'Delhi'. A Patna advocate who does not change it gets an invoice for the wrong State (wrong CGST/SGST vs IGST). Quality report item 7.

## Acceptance criteria
1. No default State: the user's profile State pre-fills, otherwise the field is empty and required.
2. Test: a profile with Bihar pre-fills Bihar; no profile leaves it empty and blocks pay until chosen.

## Files
Lead lists after Explore (web billing top-up + billing invoice (compliance)). Claimed by Priya.
