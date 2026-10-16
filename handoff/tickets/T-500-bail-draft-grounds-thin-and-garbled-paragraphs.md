# T-500: Bail draft grounds are thin and several paragraphs are garbled

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 (major) (Priya, 16 Oct 2026); Ajay rules wording |
| Owner  | Mahak (while T-472 waits for Arjun), Ajay signs |
| Mode   | Full chain (drafting prompt / legal content) |

## Source

Anushka's bail re-run, 16 Oct 2026 (handoff/quality/2026-10-16-bail-rerun-ledger-on-FAIL.md).

## What she saw

- Para 10: "elderly mother aged 72 who depends on him depend on the applicant." (a dependants sentence glued twice).
- Para 8 lists one ground only, "(a) no likelihood of tampering"; the civil-dispute point sits alone as para 9; the mother is not argued as a ground. Her description gave three grounds. Run 4 argued them.
- Para 6: "The criminal antecedents of the applicant are: never been accused in any other case." (fragment pasted into a sentence).
- "Police Station Kadamkuan Police Station" (label repeated in the value).

## What

Find where the grounds are taken from (ledger/brief facts vs the description) and make every ground the advocate states appear as a numbered ground; build sentences from facts without gluing ("The applicant has no criminal antecedents."); strip a repeated label from names. Wording that is legal content goes to Ajay.

## Acceptance criteria

- Her exact description gives all three grounds, a clean dependants paragraph, a clean antecedents sentence, "Kadamkuan Police Station" once.
- Golden fixture 27 extended (assertions Ajay signs); no regression elsewhere.

## Ajay's ruling (088fc4f7, 16 Oct 2026; exact text in the T-245 file)

A signed grounds lead-in, then each of the advocate's grounds as its own (a), (b), (c), with none dropped or merged and the mother argued as a ground. Antecedents get three signed variants (none, listed, unknown). Dependants are one clean sentence each. Police station: strip the repeated words and print "Police Station {name}".
