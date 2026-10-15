# T-451: Judgment names in form labels and printed clause text (always V1)

| Field  | Value                                                                     |
| ------ | ------------------------------------------------------------------------- |
| Status | To do. V1. After T-441 merges. Priya, 15 Oct 2026                         |
| Owner  | Lead (build), Ajay (byte-checks the diff)                                 |
| Mode   | Full chain (legal content under apps/drafting/src/config/document-rules/) |

## Source

Ajay, 15 Oct 2026, after Vishal's T-441 sweep (about 60 packs name judgments in text the model sees). T-441 covers the four bail/revision packs; this ticket is one group of the rest.

## Scope

The always-V1 items, signed one by one (Vishal sends Ajay the list):

- the 6 user-facing form labels naming cases (curative, fir_quashing, divorce_mutual, dv_act, plaint_recovery, plaint_partition);
- any judgment inside fixed clause text that prints into the document (for example service_agreement);
- the "Suraj Lamp Disclaimer" clause name (gpa/spa).

File:line list from Vishal's sweep (15 Oct): form labels: curative_petition :72, fir_quashing :103, divorce_mutual_consent :148, dv_act_complaint :82, plaint_recovery :202, plaint_partition :93; printed clause text: service_agreement :75; clause name: gpa :239, spa :233.

Form labels and printed clause text reach the user or the filed document, so they are V1 whatever the pack group.

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

## Acceptance criteria (signed byte-exact by Ajay, 15 Oct 2026, fb7b92b, T-245 file Addendum 8)

| File:line                                  | New text                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| curative_petition.json :72 label           | `Curative ground`                                                                                                                                          |
| fir_quashing.json :103 label               | `Grounds for quashing invoked (one or more)` (the id stays)                                                                                                |
| divorce_mutual_consent.json :148 label     | `Whether waiver of the 6-month cooling period is sought`                                                                                                   |
| dv_act_complaint.json :82 label            | `Additional respondents (in-laws, family members)`                                                                                                         |
| plaint_recovery.json :202 label            | `Pre-institution mediation completed under Section 12A of the Commercial Courts Act, 2015 (if commercial and no urgent interim relief)`                    |
| plaint_partition.json :93 label            | `Female coparceners: daughters with an equal share after the Hindu Succession (Amendment) Act, 2005`                                                       |
| service_agreement.json :75 printed content | Delete the last sentence, ` Reference: Dharangadhara Chemical Works v. Workmen AIR 1957 SC 264 (control test).`. The clause ends at `…all statutory dues.` |
| gpa.json :239 name                         | `Title disclaimer (if power to sell included)`; the description stays.                                                                                     |
| spa.json :233 name                         | `Title disclaimer (if power to sell)`; the description stays.                                                                                              |

Any golden that moves (service_agreement especially) comes to Ajay. No extra round with him otherwise.

## Legal sign-off

Ajay byte-checks the diff and signs the R4 replacement descriptions. Reference in the merge commit.

## Added scope (Ajay, 15 Oct 2026, with T-447 approval)

Three more strings join this ticket. Signed text is in the T-245 file (Ajay 7d77a4e):

1. `fir_quashing` label at :103.
2. `curative_petition` label at :72.
3. `curative_petition` validation rule at :196.

T-447 leaves these three untouched; they ride here, byte-exact from the signed text.

## Two more name carriers (Vishal's T-447 reviewer, 15 Oct 2026)

Both reach the model and need Ajay's decision on the rename (CLAUSE_CUES and the skeletons use them):

1. Clause id `bhajan_lal_paragraph` (fir_quashing, quashing_528_bnss; brief-drafter.ts:299 and :738).
2. Form key `bhajan_lal_categories_invoked` (brief-drafter.ts:280).

## Ajay's rename (15 Oct 2026, T-245 file 15cd74f)

The model sees both ids, so neither can stay:

- Clause id `bhajan_lal_paragraph` becomes `quashing_categories_paragraph` (fir_quashing, quashing_528_bnss).
- Form key `bhajan_lal_categories_invoked` becomes `quashing_categories_invoked`.

CLAUSE_CUES, the skeletons and the saved-form mapping follow the rename. How saved forms that carry the old key are handled is Arjun's call (asked 15 Oct). Any golden that moves goes to Ajay.

## Arjun (15 Oct 2026, 07:15 UTC) — renamed ids: read-time alias, no migration

`bhajan_lal_categories_invoked` → `quashing_categories_invoked` (form key) and `bhajan_lal_paragraph` → `quashing_categories_paragraph` (clause id): alias old → new at the one place form inputs are loaded and the one place clause ids are resolved; write only the new key from now on; one test with an old saved form; comment `// T-451 alias, remove in the post-v1 cleanup`. No migration script (tiny pre-v1 data; a script is irreversible and triggers the rule-7 CI wait).

## Arjun's ruling on saved forms (15 Oct 2026)

Read-time alias, no migration. At the one place form inputs are loaded and the one place clause ids are resolved, map `bhajan_lal_categories_invoked` to `quashing_categories_invoked` and `bhajan_lal_paragraph` to `quashing_categories_paragraph` before use. Write only the new key from now on. One test with an old saved form. Add the comment `// T-451 alias, remove in the post-v1 cleanup` so it lands on the cleanup list. A migration script is out: pre-v1 data is tiny, and a migration would trigger the rule-7 CI wait and cannot be undone.

## Added label (Ajay, 15 Oct 2026, T-449 ruling 4a7c7fb)

`rera_complaint` form label at :155 ("(Pioneer Urban — concurrent remedy)") becomes: "Any previous Consumer / Civil proceedings on same cause? (the consumer remedy is concurrent)". T-449 leaves it untouched.

## Added label (Ajay, 15 Oct 2026, T-449 round 1, 93d63ae)

`ibc_application` form label at :150 ("S.9 — Mobilox test") becomes "…(S.9 — dispute raised before the demand notice) — details". The exact string is in the T-245 file. The clause name at :226 changes in T-449 ("No Pre-existing Dispute (S.9)"), not here.
