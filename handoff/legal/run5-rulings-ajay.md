# Anushka run 5 (prod v1.2.2, FAIL): legal rulings (Ajay, CLO)

29 Oct 2026. Source: `handoff/tickets/anushka-run5-prod-v1.2.2.md`; tickets at f38487b. Each item is legal content. Nothing merges before I name an approved SHA.

## Order

T-678, T-676 and T-677 go first, as Priya proposed. They are regressions and need no list from me. My rules for T-675, T-676, T-680 and T-681 item 4 are below, so all of them can start now. T-674 (the court list) comes from me separately.

## T-681 item 4: written statement time limit (signed text)

The claim "extendable to 120 in non-commercial" is wrong. Under Order VIII Rule 1 CPC the WS is due within 30 days of service. The proviso lets the court allow more time, for reasons recorded in writing, up to 90 days from service. 120 days is the outer limit only in a commercial suit (Order VIII Rule 1 as amended for commercial disputes by the Commercial Courts Act, 2015).

Replace these, byte for byte:

| Where | Signed text |
|---|---|
| written_statement.json field label (days_from_service) | `Days from service of summons (due within 30; the court may allow up to 90 for recorded reasons; 120 is the outer limit in a commercial suit)` |
| written_statement.json TIME LIMIT rule (l.223) | `TIME LIMIT: Order VIII Rule 1 CPC — file the WS within 30 days of service of summons. The court may allow more time for reasons recorded in writing, up to 90 days from service. In a commercial suit the outer limit is 120 days, and after it the WS cannot be filed.` |
| written_statement.json description (l.257) | `Written statement — 30 days; up to 90 days with the court's leave; 120 days outer limit in a commercial suit` |
| court-rules/district_court_generic.json (l.56) | `Written statements to be filed within 30 days of service of summons (the court may allow up to 90 days for recorded reasons; 120 days is the outer limit in a commercial suit).` |

- The district_court_generic change touches golden snapshots. Follow `.claude/docs/golden-snapshots.md`; snapshots are edited by hand only, with the diff sent to me.
- The SCG Contracts citation already in the pack (l.317) stays. I have not re-verified it here, and no new case law is added.

## T-680: NI Act s.138 complaint

**(1) Limitation warning (signed text, shown when the complaint looks out of time):**
`This complaint may be out of time. Under Section 142(1)(b) of the Negotiable Instruments Act, 1881, it must be filed within one month of the date the cause of action arose (the day after the 15 days allowed for payment from receipt of the demand notice end). If it is late, file it with an application to condone the delay showing sufficient cause, as the proviso to Section 142(1)(b) allows.`

- The check: the date of service of notice + 15 days gives the cause of action. Cause of action + one month gives the last day.
- If any date is missing, show no warning and do not guess.
- The warning goes to the user. It is never printed in the complaint.

**(2) Jurisdiction:** plead Section 142(2) NI Act. The complaint lies in the court within whose local limits the branch of the payee's bank, where the cheque was delivered for collection, is situated (where it was presented through the payee's account).

**(2) Procedure:** the prayer cites no repealed CrPC section. BNSS section numbers in the prayer: **verify**. They stay out of the signed text until I confirm them, and until then the prayer cites no procedure section at all.

**(3) Title:** the title keeps "Section 138". This rides with T-677.

## T-675: no invented facts in pleadings (rule)

**Rule:** a pleading is verified on oath. Every factual assertion in it must come from a fact the user gave: the form, the brief or the ledger. Anything else either becomes a `[To be confirmed: <label>]` blank or is left out.

**Allowed without a given fact:** only the formal paragraphs in the pack's signed template, i.e. the cause of action and jurisdiction paras built from given facts, valuation from the given value, and the verification form. A fact-shaped formal para, such as "no other suit is pending", needs a given fact too, or it becomes a blank.

**Test cases (fictional data):**
- **(a)** Declaration plaint with no consideration fact given. The draft must not state that consideration was or was not received.
- **(b)** No fact about appearing before the Sub-Registrar. The draft must not state appearance or non-appearance.
- **(c)** Both facts given. Both are stated, faithfully.
- **(d)** Every other civil pack: one run each with a minimal fact set. The report lists any assertion not traceable to the input.

## T-676: Hindi and Hinglish answers in a bail draft (rule)

- The draft is in English (the pack's language). An answer in Hindi, Hinglish or Devanagari is read as a fact and written in English. It is never quoted verbatim.
- Only a proper name or place is carried over, transliterated as given. Police station names follow T-612 (6)/(6a)/(6b): थाना/Thana prefixes are stripped as signed.
- A non-answer (§(j)3) is no fact. नहीं / nahi / "koi nahi" to a yes/no question means **no**.
- "tab se jail mein hai" together with a given arrest date satisfies T-638 R1 ("in custody since the arrest date"), subject to the B1/B5 gates.
- If an answer cannot be read with confidence, it becomes a `[To be confirmed: <label>]` blank. It is never printed raw.

## T-674: court catalogue

The list and the no-court rule follow in a separate ruling. Interim rule: when a district has no court in the list, the user types the court's name. It is printed exactly as typed, and never replaced by a guessed court.

## T-677, T-678

T-677: I byte-check the restored section numbers (148A, 138) before merge. T-678 needs no new text: the conflict question stays as signed (T-611 P-strings), and answering it in place is allowed.
