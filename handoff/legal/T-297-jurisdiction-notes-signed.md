# T-297: court-rules jurisdiction notes (signed, 12 Oct 2026 IST)

Ajay (CLO). Apply after T-289 merges. Change only the sentences named here; every other sentence in each `jurisdictionNote` stays byte for byte.

## A. Shared sentence (26 files under `apps/drafting/src/config/court-rules/`)

Find, exact: `Sessions courts try offences punishable with imprisonment exceeding 7 years.`
Replace with the block below (one sentence, no trailing newline in the JSON string):

```text
Which court tries an offence is set by the First Schedule to BNSS, not by the length of the sentence.
```

## B. `sessions_generic.json`, whole note

```text
Tries the offences that the First Schedule to BNSS makes triable by the Court of Session, and cases committed to it by a Magistrate. Hears bail applications under Section 483 BNSS.
```

Why: 483 bail is not limited to Sessions-triable offences, so "for non-bailable offences triable by Sessions Court" is dropped.

## C. `cjm_generic.json`: no wording change

"May pass any sentence … exceeding seven years (S.23 BNSS)" is a sentencing limit, not a rule of which court tries what, so it stays. Separate item, not for this ticket: "S.10 BNSS" for the CJM is **verify** (I have not checked it against the Gazette); do not change it under T-297.

SHA-256, each block between its fences with the final newline: A `32c958e86b86d9e6d83b41f347a74d4b766340745877c50d2e9bd201abf01858`; B `74a3aff7d34ed8fd68efaf4d1c31b6a8fef92e3cc9acd37e9e0960d3d018f58e`.

Rules
1. No court-by-term sentence may remain in any `jurisdictionNote` (test: none contains "exceeding 7 years" except the CJM sentencing line).
2. BNSS 480/483 bail advice in bail-check is unchanged (T-277 rule).
3. Moved golden snapshots come to me with the diff.
