# T-449: Civil and family packs: no judgment names in model-visible text

| Field  | Value                                                                     |
| ------ | ------------------------------------------------------------------------- |
| Status | To do. V1.1. After T-441 merges. Priya, 15 Oct 2026                       |
| Owner  | Lead (build), Ajay (byte-checks the diff)                                 |
| Mode   | Full chain (legal content under apps/drafting/src/config/document-rules/) |

## Source

Ajay, 15 Oct 2026, after Vishal's T-441 sweep (about 60 packs name judgments in text the model sees). T-441 covers the four bail/revision packs; this ticket is one group of the rest.

## Scope

All civil and family packs in Vishal's sweep, except the always-V1 items in T-451.

## Rules (Ajay, T-245 file Addendum 8, 15 Oct 2026; apply mechanically)

S = `Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].`

- R1: in model-visible text (promptInstructions, prompt_context, system_role, clause names and descriptions, relevantActs descriptions, notes), delete each judgment name, its citation and its connector ("per", "in", "as held in", "see", "following", "cite … on"). Keep the legal proposition word for word.
- R2: a line that only says to cite a judgment is deleted.
- R3: add S once per pack, as the last promptInstructions entry.
- R4: a name used as a label ("Bhajan Lal categories", "Sarla Verma method") is replaced by a plain description proposed in the diff; Ajay checks each one.
- R5: no new law in any replacement: no new section, case or proposition.
- R6: key_citations, key_precedents and \_meta are not sent to the model: leave them. But change each `_meta.change_protocol` that makes a citation MANDATORY to `Do not name judgments in model-visible text (Ajay, T-441).`
- R7: the \_averments ban lists stay as they are.

Ajay byte-checks each group's diff; he does not pre-sign every line. The file:line list of every pack and string is in handoff/tickets/T-441-judgment-sweep.md (Vishal, 15 Oct; re-grep, line numbers drift).

## Acceptance criteria

1. Every pack in the group follows R1 to R7. S is present once per pack.
2. No sentence in a model-visible field names a judgment; no new law appears.
3. Golden snapshots and tests updated only where the removed text was pinned; Ajay signs any snapshot change.
4. A test pins "no judgment name in model-visible text" for the group's packs.

## Legal sign-off

Ajay byte-checks the diff and signs the R4 replacement descriptions. Reference in the merge commit.
