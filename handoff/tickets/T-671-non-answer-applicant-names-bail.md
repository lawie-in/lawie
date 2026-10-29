# T-671 — A non-answer as an applicant or party name blocks Confirm in bail and the remaining packs

Status: backlog (unassigned). The rest of Ajay's AJ-668-M1 ("every pack"), 29 Oct 2026. T-668 covers the plaint packs plus replication and written statement, on both the brief and the form route.

## Acceptance criteria
1. In bail_regular, and in every other pack with an applicant or party-name field outside T-668's 8 packs, a typed non-answer ("Not known", "unknown" and the signed equivalents in the T-655 list) blocks Confirm on the brief and the form route, before any Ink hold.
2. It reuses T-668's helpers (isEmptyOrNonAnswer, partyConfirmLine). No new strings unless Ajay signs them.
3. A test per pack: a non-answer blocks, a real name passes, and nothing prints the literal non-answer.
4. Legal content: Ajay byte-checks before merge.

## Mode
Small fix (drafting, plus web BriefStep if the screen needs it), legal content. Known gap until merged (AJ-668-M1).
