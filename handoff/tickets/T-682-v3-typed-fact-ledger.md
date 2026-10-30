# T-682 — v3 P1: the fact ledger as an explicit typed store

Status: assigned to tanvi, 29 Oct 2026. Schema first: TS types, Mongo shape, indexes, invariants (one ledger per run, append-only, every fact has source + quote, non-answers = no fact per AJ-655-M1) to Arjun for review BEFORE build.

## Acceptance criteria
1. One typed ledger per run: key, type, value, display form(s), source span, status (held / unresolved / conflict), version.
2. Derived facts are computed in code from held facts (custody-since, amount in words, limitation dates), never by the model.
3. Conflicts (two values for one key) become a question, never a silent pick.
4. The read paths (brief, generation, verifier) go through one ledger API. Existing stored ledgers migrate or are read compatibly.
5. Acceptance cases from Anushka run 5 (golden cases): T-675 no invented facts, T-676 Hinglish/Hindi answers read as facts, T-677 section numbers kept, T-679 given facts reach the draft, T-680 NI Act basics.

## Mode
Full chain. Arjun reviews the schema. Legal: Ajay signs the fact-checker policy only.
