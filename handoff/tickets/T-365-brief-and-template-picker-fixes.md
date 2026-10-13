# T-365 — Brief and template picker: Not known, advocate name, browse, Use template

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Full chain |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-300, T-190, T-199, T-240, T-290, T-309, T-318 |

## Acceptance criteria

1. With the advocate name field empty, drafts print the profile name ("Abhi"), not "[To be confirmed: advocate name]".
2. On the brief, pressing "Not known" selects it; it does not clear the row (investigation stage, named in FIR, cooperation).
3. Anticipatory bail asks about the Section 35 notice and recovery (Ajay's wording, already signed for T-190/T-199 if present; else ask him).
4. "Browse document types" is grouped like the templates library.
5. "Use template →" opens the chosen template, so the section picker is reachable (unblocks T-290, T-309, T-295, T-324, T-291).
6. No card shows internal text such as "Document-rules config for default_bail".
7. Find out why no Vakalatnama or Memo of Parties was produced (T-313, T-318). Fix it here if it's a bug; tell Priya if it's a setting.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.

## Priya's decisions after Mahak's Explore (13 Oct 2026)

- AC1: Mahak builds the one-line fix in brief-drafter.ts after Tanvi's T-357 merges, before Vishal's T-373 needs the file. Ajay confirms that the auto-blank isn't a "typed" value (his T-300 rule).
- AC2: folded into Kunal's T-372. He already holds BriefStep.tsx and OneFlow.tsx.
- AC3: dropped. Ajay's signed T-190 table leaves the s.35 notice and recovery out of anticipatory bail on purpose (it invites "illegal arrest"/"no recovery" averments). Ajay may reopen it with new signed questions; otherwise Anushka's item is answered by his ruling.
- AC4: build now.
- AC5: waits on Arjun. A ?template=<id> link that opens the form reverses ADR-021/T-126 for this path; the alternative is a OneFlow preset.
- AC6: the regex fix now. The 11 empty descriptions and lease_deed's text: Ajay and Arjun choose between pack JSON edits and a code-side description map.
- AC7: moved to T-381 (button plus stored party data).
- Side bug: T-382 (advocate_enrolment vs advocate_enrollment).
