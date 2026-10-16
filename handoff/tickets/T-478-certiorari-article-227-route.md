# T-478: Certiorari against a civil court's order: Art. 227 must be possible and survive the verifier

| Field  | Value                                                                 |
| ------ | --------------------------------------------------------------------- |
| Status | To do. V1 BLOCKER (Ajay, 16 Oct 2026). Priya                           |
| Owner  | Tanvi (free), Ajay gates; waits for T-471 to release fact-verifier.ts |
| Mode   | Full chain (legal content, verifier)                                  |

## Source

Mahak, while adding the certiorari golden for T-475 (16 Oct 2026). Ajay's rule: if the impugned order is a civil court's judicial order, the draft must not pray for certiorari under Art. 226; the route is Art. 227. Three faults make that route unreachable:

1. fact-verifier.ts:519 blanks any bare number of 3 or more digits as a case number, so "Article 227" or "226" in a delivered certiorari draft is placeholdered unless the ledger holds it.
2. certiorari.json article_invoked offers only 226, 32, and "226 and 227"; there is no "227 only".
3. The pack's mandatory clause is named jurisdiction_clause_article_226_hc_or_article_32_sc, which may push the model to 226. Only a real-model run tests that (Arjun: with Vikram's cost limit).

## What

Make a certiorari draft against a civil court's judicial order say Art. 227, keep the article number through the verifier, and add "227 only" to the options. Ajay rules the clause name and wording.

## Acceptance criteria

- Fixture 26 (Mahak's golden) passes with the right article and fails on "Article 226" for a civil order.
- The verifier no longer blanks article numbers; case-number blanking still works (tests both ways).
- Ajay's ref; moved goldens to Ajay.

## Ajay's rulings (16 Oct 2026, T-245 file 7d42b105)

1. v1 blocker. A number after Article / Art. / Section / S. / s. / Order / O. / Rule / r. / Schedule / Para is never blanked by the verifier. This affects every writ: "Article 226" is blanked too today.
2. Add the option "Article 227 (judicial order of a civil court)" to article_invoked.
3. Clause id becomes jurisdiction_clause (keep the old id as an alias), name "Jurisdiction", description: "State the Article selected in article_invoked. For a judicial order of a civil court, invoke Article 227, not Article 226."

Order of work: certiorari.json (option, clause rename with alias) can start now; the fact-verifier.ts part waits for Vishal's T-471 to merge (he holds that file).
