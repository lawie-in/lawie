# T-297 — court-rules packs: jurisdiction notes state the court by maximum term

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Legal accuracy |
| Owner  | Ajay (rewrites and signs the notes). Lead (build) |
| Mode   | Small fix, legal content (court-rules packs) |
| Status | Wording signed (18e51d6). Build after T-289 merges |

About 29 `court-rules/*.json` files carry a `jurisdictionNote` that states term rules such as "Sessions try > 7 years". After T-289 the court comes only from the First Schedule's "triable by" column, so these notes can contradict the app.

## Acceptance criteria

1. Ajay rewrites each affected note (or signs one shared line), with no court-by-term rule.
2. The lead applies his text exactly; golden snapshots that move go to Ajay (`.claude/docs/golden-snapshots.md`).
3. BNSS 480/483 bail advice is unchanged (still follows the term, per Ajay's T-277 rule).

## Ajay signed (12 Oct 2026, handoff/legal/T-297-jurisdiction-notes-signed.md, 18e51d6)

- A: one shared sentence replaces "Sessions courts try ... exceeding 7 years." in 26 packs.
- B: sessions_generic note rewritten.
- C: cjm_generic stays (a sentencing limit, not a court-by-term rule).
- Not in scope: "S.10 BNSS" for the CJM, which Ajay is checking against the Gazette.

Ready to build after T-289 merges. Moved snapshots go to Ajay.
