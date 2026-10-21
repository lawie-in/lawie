# T-521: Intake, editor and draft-ready in Night Library

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (spec sections 04 and 05), a web lead (build) |
| Mode   | Full chain (web) |
| Status | In build: Kunal (21 Oct 2026). Priya |
| Source | T-511 part B; spec `handoff/design/T-511-night-library-spec.md` sections 04 and 05 |

## Scope
Restyle the describe-first intake (T-005 flow unchanged), the documents list, the editor and the draft-ready view on the T-511a components. No behaviour change to drafting.

## Acceptance criteria
1. Every step of the flow shows the specified loading, error and empty states, with the user's text kept on error.
2. Draft ready shows the Ink-used chip and the checks count, with Finalise, Regenerate (confirm dialog) and Export.
3. "The draft did not finish. You were not charged." appears only when that is true.
4. 360px first; reduced-motion; copy only from the signed copy file.
5. Existing intake and editor tests keep passing; new tests for the new states; browser check recorded.
