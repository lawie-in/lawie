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
