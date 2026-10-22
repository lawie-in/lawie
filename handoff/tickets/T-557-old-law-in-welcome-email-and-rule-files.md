# T-557: Old-law wording in the welcome email and five rule packs

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (signed text, AJ-556-M1 to M4 in 02999009), a lead (build), Arjun for the drafting part |
| Mode   | Full chain (email-worker; drafting document rules, legal content) |
| Status | To do. Ready to build, signed text exists. Priya, 22 Oct 2026 |
| Source | Vishal's T-555 report; Ajay 02999009 |

## Part A: welcome email
`apps/email-worker/src/templates/auth/welcome.tsx:52`: replace the whole paragraph with Ajay's text (AJ-556-M1). It also claimed "court-ready", "right sections" and "<5 min". No Hindi. Add the file to `.claude/docs/legal-content-paths.md`. Template test updated to compare the rendered text with the signed string.

## Part B: five rule packs
Five document rule files say "must use BNS (warn if IPC)": discharge, mact, fir_quashing, quashing_528, criminal_appeal. `fir_quashing:277` says "NEVER use IPC". That is wrong for offences before 1 July 2024 (Art. 20(1)). Replacements are Ajay's signed text in AJ-556-M2 and M3; `quashing_528:252` is aligned per M4. The BNS whitelist is fine and stays.

## Part C: Terms page (found by Vishal's T-555 sweep test)
`apps/web/src/app/(marketing)/terms/page.tsx:114-115`: "Criminal drafts use BNS, BNSS and BSA section numbers. The Service does not provide legal advice…". Needs Ajay's signed text and his call on a Terms version bump (if reworded on the same day as T-541's 2026-10-22 bump it may reuse that version; otherwise bump version and "Last updated" in all three places, and note the pre-launch re-accept rule). T-555's sweep test has one named exception for this file; remove the exception here.

## Acceptance criteria
1. Both parts carry Ajay's text byte for byte; tests prove it.
2. Part B: golden / court-rules snapshots are regenerated only where they move (`.claude/docs/golden-snapshots.md`); the diff goes to Ajay.
3. The drafting golden set run does not regress.
4. Ajay byte-checks at READY.
