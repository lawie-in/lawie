# T-565: Legal fixes, signed-in app, web (review section C, web items)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (MUST items block Anushka's browser run) |
| Owner  | Lead (build, web), Ajay byte-checks |
| Mode   | Full chain (web, legal content) |
| Status | In progress (Tanvi). Wave 1 merged 90337d84 (CI 936 green); wave 2a merged 2e0c63b7 (22 Oct). Left: OneFlow W13 lines, inkReleased, wave 2b (items 33, 40, 45, 46) after Vishal's T-522 merges. MUST before Anushka. Priya |
| Source | Ajay's pre-Anushka legal review: `handoff/legal/pre-anushka-legal-review-22-oct.md` (22 Oct 2026, b871e0f7) |

## Items
Review section C, web: **29, 31 to 40, 42, 43** MUST; 44 to 51 SHOULD (do them too). 29 watermark notice delete; 31 daily-login line delete; 32 `Prices include GST.`; 33 low-Ink nudge hidden from unverified users; 34 plan name on the sidebar; 35 contact@; 36 empty templates text; 37 and 38 section finder wording and badges; 39 delete the fallback filing checklist; 40 clear the draft-prefill key on sign-out and on read in both flows (code only); 42 DraftReadyStep chip; 43 PipelineStatus (old flow) strings; 44 to 51 as listed (50: delete unused modals once confirmed; 49 needs Priya and Arjun to confirm the Solo gate: ask Priya). Conflicts: DraftReadyStep.tsx is Kunal's until T-544 merges; TopUpModal.tsx, lib/auth.ts, dashboard layout and LowInkNudge relate to Vishal's T-522 claim: wait for his merge for those.

## Rules for every item
Signed fix text is in the review file next to its item number (file:line, current text, signed fix). Paste it **byte for byte**; if a line has moved, find it by the current text. Anything unclear goes to the real Ajay (session_019mZoKeM2MTfCyV5HEZrqnZ), never invented. Files under `.claude/docs/legal-content-paths.md` come back to Ajay for a byte check at READY. Do not touch files held by another lead's claim row; wait for their merge or ask Priya.

## W5 (Ajay, 22 Oct): MUST before main
§NEW-n ids must never show as section names anywhere in the app (finder entries hidden, no raw ids in UI). Part of wave 2a with 42 and 48.
