# T-611: fact-checker violation policy and two rulings (Ajay, 26 Oct 2026)

Source: Vishal's proposal of 26 Oct, built on ADR3-L10 and L11 (`ADR-drafting-v3-legal-signoff-ajay.md`). **Signed with the amendments below.** User-facing strings go in byte for byte. P4 and the T-488 hunks need my fresh byte check before merge.

| id | ruling |
| --- | --- |
| P1 | **SIGNED.** The checker never blanks a value the ledger holds. A held value used under the wrong label gets a repair request. If it still conflicts after one repair, the draft is not delivered, no Ink is taken, and the user is asked. Question, signed: `The draft gives <value> as the <label A>, but your facts give it as the <label B>. Which is right?` The labels are the pack's signed field labels. `<value>` is shown to the user only and never logged (ids and labels only in logs and Sentry). |
| P2 | **SIGNED, amended.** A date that appears in a user-given ledger text fact counts as held, so it is never blanked as `unsupported`. Held means the value only. If the draft uses that date in a role the text does not give it, P1 applies. A date the model introduces that appears nowhere in the ledger stays a blank. |
| P3 | **SIGNED.** Amounts in words, including the Indian system (lakh, crore), are read as the figure and judged like digits. A match passes. A mismatch goes through P1 (repair, then ask) and is never blanked or silently corrected. |
| P4 | Accepted in principle (AJ-488-M1: "cheque" alone is no cue; the label window starts after the previous date). **Not signed until** I byte-check the T-611 branch, which carries a5052a6d, 5d62b13f, 01dcc4a4 and the state_of_filing → {state} hunk. |
| P5 | **SIGNED** (L10(a)). amount_in_words is computed by code from cheque_amount, in the format the brief already shows: `Rupees <words> only`. For paise: `Rupees <words> and <words> Paise only`. Indian numbering. If cheque_amount is not held, amount_in_words is not held either; it is never guessed. |
| P6 | **SIGNED** (L10(c)). The gate makes one deterministic fill from the ledger plus one model repair. If the blank is still there, the draft is not delivered, no Ink is taken, and the user is asked. Text, signed: `One detail is needed before the draft: <label>.` A fact the ledger does not hold stays a blank, as today. |
| P7 | **SIGNED** (L10(b)). The editor shows every blank as `[To be confirmed: <label>]`, the already-signed form. Raw `{{MISSING` never reaches the lawyer. |
| R1 | **Ruled.** For regular bail with custody = yes, when the ledger holds arrest_date and no other custody, surrender or remand date: "in custody since" takes arrest_date as a derived fact, shown in the brief as `<date> (date of arrest)` so the advocate sees it before drafting. If the description mentions surrender or a different custody date, ask; do not derive. This lands in T-612 (Tanvi's claim); Priya routes it. |
| R2 | **Ruled.** temporary_injunction_o39 needs a required pack field, signed: label `Relief sought in the main suit`, question `What relief does the main suit ask for?` If it is not answered, the gate asks (P6); it is never written by the model. Shashank's T-613 takes it (he holds the pack); Priya confirms. |

Also recorded: the T-488 correction in `go-live-ruling-23-oct.md` (it was never merged; my "as merged" line did not cover it).

## P4 / T-488 byte check (Ajay, 26 Oct 2026): fix/t-611-missing-facts-gate @ 31bd7994

| item | result |
| --- | --- |
| Fold | 31bd7994 merges 01dcc4a4 into the T-611 branch on f84371a0, with no hand edits. Diff checked: `51d2546d...31bd7994 -- apps/drafting/src`, 5 services and 3 t488 tests. |
| Hashes (sha256, first 16) | fact-verifier `321a8bb22c2be4b5`, ai.service `75c6a69a79f08a90`, intake-brief `22dbfdfaf2281fdc`, template-engine.service `fe84c199452079bf`, fact-ledger.service `75ccfb4e0f98a868`. I recomputed them myself and they match. |
| Cue table | Matches AJ-488-M1: `cheque`/`chek`/`चेक` alone is no cue (DATE_CUE_NOT). "dated" + noun maps to its key. "received" needs a memo word; "sent" needs a notice word. Hindi cues present (jama, dinank, prapt, mila, bheja, प्रस्तुत, अनादरित). |
| a5052a6d | Held date: no label passes, and a label naming its own key passes. Labels that all name other keys are judged against the nearest held one. This is the tightening I approved (AJ-488-M2). Under P1, that `wrong_fact` now becomes a repair, then a question, never a blank; Vishal builds that on top. |
| 5d62b13f | `state_of_filing` → `{state}` only when the State is unanswered (certiorari, quo_warranto, interim_application). OK under T-479. |
| 01dcc4a4 | Comment only. |
| Open from AJ-488-M1 | The `cheque_validity_date` cue ("last", "validity", "printed") is not in the s.138 table. It is handled by the T-192 checks (t192 tests pass). Not a blocker; Vishal confirms in one line that T-192 covers it. |

**P4 SIGNED at 31bd7994.** T-488 counts as merged only when a develop_staging SHA contains 31bd7994; I name that SHA in the T-611 final check.
| P4-F1 | cheque_validity_date: Vishal confirms the s.138 table does not cover it (only the generic stems in cuedKeys). T-611 adds a test: the date held as cheque_validity_date under its own label passes; the same date under another label goes to repair, then ask (P1). Any code change stays inside AJ-488-M1 (cues "last", "validity", "printed"). Checked at the final byte check. |

## T-611 build rulings (Ajay, 26 Oct 2026; Vishal's server build)

| id | ruling |
| --- | --- |
| P-R1 | Repair-prompt "what" lines **approved byte for byte**: P1 `the draft gives "${text}" for ${labelA}, but in FACTS that value is the ${labelB}`; P2 `the draft gives "${text}" for ${labelA}, but in FACTS that value is given in ${labelB}, not as ${labelA}`; P6 `the draft has a blank for ${label}, which is in FACTS; print it in the words of its display in place of the blank`. P3 keeps "differs from FACTS". |
| P-R2 | P3 mismatch question, **signed** (not the P6 line, which wrongly says a detail is missing): `The draft gives <value> for the <label>, but your facts give <held value>. Which is right?` Both values are shown to the user only and never logged. |
| P-R3 | Paise: the brief moves to my form `Rupees <words> and <words> Paise only` in a follow-up ticket (intake-text.ts owner; Priya routes it). Until then the parser reads both forms. |
| P-R4 | D1 bail packs with no repair pass: **accepted for Phase 0.** A conflict withholds the draft, charges no Ink and asks the one question. Report the withhold rate per pack; the repair pass comes in Phase 2 (ADR §7). |
| P-R5 | Bank-role check (drawee branch `wrong_fact`): **bring it under P1 in T-611.** Blanking a held name breaks the signed P1 ("never blanks a value the ledger holds"). |
| P-R6 | Scope confirmed with one change. An uncued amount, or a date that matches no ledger value, is model-introduced and stays a blank. **But** a non-held date or amount under a *held* label goes to repair, then ask (P1/P3), not a blank: the ledger holds the truth for that label, and a blank there is today's fault. The gate still never fills the verifier's blanks silently. |
| P-R7 | The P-R2 question also covers dates, so no separate string. Bank role under P1: label A `bank or branch where the cheque was presented` (the signed ROLE_RULES wording) is **signed**, so the question reads `The draft gives <name> as the bank or branch where the cheque was presented, but your facts give it as the Drawee Branch. Which is right?` The withhold log line `[drafting] draft withheld (kind=<packId>, code=<code>, keys=<keys>)` carries no values and is OK. |
| R2-F1 | R2 is met at intake: `main_suit_relief` (and T-613 `restraint_sought`) are required questions, and the brief cannot be confirmed until they are answered. P6 is unchanged (held facts only). If a draft still has a blank for either, it is a blocking gate finding, never filled by the model. |

## T-611 final byte check (Ajay, 26 Oct 2026): fix/t-611-missing-facts-gate @ d1a318e9

| item | result |
| --- | --- |
| Hashes (sha256, first 16, recomputed myself) | fact-verifier `69fc4333aedde27c`, ai.service `77281116f319daf5`, fact-ledger.service `9e81ab46d63a41a0`, intake-brief `22dbfdfaf2281fdc` and template-engine.service `fe84c199452079bf` (both unchanged since 31bd7994). All match Vishal's. |
| User strings | Byte-identical to the signed text: P6 (ai.service:700), P1 (:705), P-R2/P-R7 (:713), P5 `Rupees … only` / ` and … Paise only` (fact-ledger:1119), P7 `[To be confirmed: …]`, the bank label, and the three repair lines. |
| R2b hunk (ai.service ~2470–2493) | **Approved.** The deterministic fill stays under R2b.1. The held-blank model repair is re-recorded only inside the sentences of the blanks it was asked to fill (R2b.4), so a repair that weakens a mandatory clause stays visible to the missing-clause check. Text facts over 300 characters or with a line break go to the model repair, then the P6 question, not to the code fill. OK. |
| Logs | New lines carry only pack id, runId, code, keys and the error name. No `<value>`, no draft text. |
| P4-F1 | cheque_validity_date test at t611-verifier.test.ts:302; the cue words are unchanged. |

**APPROVED at d1a318e9.** T-611, and with it T-488, counts as merged **only at the develop_staging SHA that contains d1a318e9**, which I record when it lands (go-live correction, 26 Oct). Open follow-up: the paise format in intake-text.ts (P-R3) has the right shape at :288, but its owner confirms it in the P-R3 ticket.

**Merged (Ajay, 27 Oct 2026):** develop_staging `023b08c507ccbfed4b30cab4348a572ce9e3b6a9` contains d1a318e9 (T-611) and 31bd7994 (T-488). I checked this myself with `git merge-base --is-ancestor`, and fact-verifier, ai.service and fact-ledger.service have the same hashes after the merge. This is the "as merged" SHA for T-611 and T-488. CI is pending (Vishal confirms green). Production still needs the founder's release and Anushka's PASS.
| P-R3-BC | T-624 (`fix/t-624-paise-form` @ e038a0a9): **APPROVED.** intake-text.ts:287 gives ` and <words> Paise` → `Rupees … and Fifty Paise only`, the same as P5. Whole-rupee amounts are unchanged. The words comparison reads both orders and keeps rupees and paise apart (120.05 ≠ 100.25). t139 was changed only for the new form. It counts as merged at the develop_staging SHA that contains e038a0a9. |

## Form route (Templates → form), Ajay 27 Oct 2026

| id | ruling |
| --- | --- |
| FR-1 | The signed T-611 policy (P1–P7, P-R1..R7) applies **as is to every path that delivers a draft**, the form route included. No separate policy. Conditions for T-637: (a) the form answers enter the ledger as `source: user`, so P1/P6 treat them as held; (b) the form route enforces the T-629 required fields (`main_suit_relief`, `restraint_sought`, with the same non-answer list) **before** generating, and returns the signed (g) messages; (c) T-628 runs on it (Priya: now). |
| FR-2 | T-637 is a prod release gate, as Priya proposes: no prod release that changes drafting without it. I byte-check T-637 like T-611 (same strings, hashes, logs carry no values). |

## T-637 rulings (Ajay, 27 Oct 2026)

| id | ruling |
| --- | --- |
| FR-3 | Form answers enter the ledger as `asked`: OK. FR-1(a) meant "user-given, not computed". `asked` is user-given, and the verifier treats it the same as `user`. |
| FR-4 | Option **(a)**. On the form route the gate treats `[To be confirmed: <label>]` as a blank **when `<label>` maps to a ledger-held key**: code fill from the ledger, then one repair, then the P6 question. A `[To be confirmed: …]` for a fact the ledger does not hold stays as it is (correct). `_____` blanks are intentional slots (case number, year) and are not touched. No prompt change. |
| FR-5 | Narrow version now: **yes**, for temporary_injunction_o39 only. An empty answer or a §(j)3 non-answer for `main_suit_relief` / `restraint_sought` returns 400 **before any Ink hold**, with the §(g) EN lines in §(j)2 order. The constants go in one small new legal file that T-629 imports, so they are never duplicated. Priya adds the file to legal-content-paths.md. |
| FR-6 | **Release condition.** T-611 (and T-637) protect users only where the ledger runs. `feature.fact_ledger` defaults OFF. No prod release may be described as fixing Anushka's 26 Oct {{MISSING}} faults unless `feature.fact_ledger` is ON in prod for the drafting paths, or the gate is made to run without it. Arjun and the founder decide which; I need the prod flag state named in the release note. |
| FR-5a | Scope is Priya's call: no narrow file in T-637, and the O.39 required fields come with T-629. The legal condition FR-1(b) is unchanged: **T-629 must also cover the form route**, and no O.39 form-route draft reaches prod before it does. T-613, T-628, T-629 and T-637 ship together. |
