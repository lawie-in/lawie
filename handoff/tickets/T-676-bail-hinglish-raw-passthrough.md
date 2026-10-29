# T-676 — Bail draft prints Hinglish and Hindi answers raw (Anushka Blocker 3; regression)

Status: PAUSED, folded into drafting v3 Phase 1 as an acceptance case (founder re-plan via Arjun, 29 Oct 2026). Branch kept.

## Acceptance criteria
1. Answers like "Pehle koi criminal case? नहीं.", "Koi recovery nahi hui", "ek chhota bachcha hai…" and "थाना Govindpura" must never reach the draft verbatim. They're read as facts (नहीं = no; the police station name is cleaned) and written in the draft's language.
2. "tab se jail mein hai" with an arrest date fills custody status (in custody since the arrest date) instead of "[To be confirmed: Custody Status]".
3. Recorded-reply tests reproduce Anushka's exact inputs (fictional data) and fail on the old code.

## Mode
Full chain (drafting), legal content (Ajay).
