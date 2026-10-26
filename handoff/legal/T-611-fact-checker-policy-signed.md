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
