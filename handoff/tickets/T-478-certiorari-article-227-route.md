# T-478: Certiorari against a civil court's order: Art. 227 must be possible and survive the verifier

| Field  | Value                                                                 |
| ------ | --------------------------------------------------------------------- |
| Status | To do. V1 (Ajay and Arjun to confirm blocker). Priya, 16 Oct 2026      |
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
