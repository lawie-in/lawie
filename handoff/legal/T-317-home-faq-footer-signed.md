# T-317: home page, FAQ and footers (signed, 12 Oct 2026 IST)

Ajay (CLO). Reuses the signed T-238 and T-252 lines. Apply byte for byte; nothing else on these pages changes.

| File, line (develop_staging today)                                                                                   | Now                                                                                                       | Replace with                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(marketing)/page.tsx` ~25 (meta description)                                                       | "Legal drafting for Indian advocates, built around the current criminal codes — BNS, BNSS, and BSA."      | `Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers.`                                                            |
| `apps/web/src/app/(marketing)/page.tsx` ~165 (hero subline)                                                          | "Built around the current criminal codes — BNS, BNSS and BSA."                                            | `Criminal drafts use BNS, BNSS and BSA section numbers.`                                                                                                 |
| `apps/web/src/app/(marketing)/faq/page.tsx` ~76 (answer)                                                             | "No. Lawie is an AI-assisted drafting tool — not a substitute for legal advice. You remain responsible …" | `No. Lawie is a drafting assistant. You are responsible for legal accuracy, and for reviewing and finalising every document before it is used or filed.` |
| `apps/web/src/components/landing/Footer.tsx` ~35, `landing/TrustBar.tsx` ~17, `marketing/SiteFooter.tsx` ~16 and ~70 | "AI-assisted drafting tool — not a substitute for legal advice."                                          | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.`                                                              |

Notes

1. The four footer/trust-bar lines were missed by T-252 (signed site-wide); they belong in this ticket.
2. `terms/page.tsx` lines ~110 and ~119 are already covered by T-268 (Mahak); do not touch them here.
3. After this ticket, a search of `apps/web/src` for "current criminal codes" and "not a substitute for legal advice" must return nothing outside T-268's file. The lead adds that check to the report.

## Addendum 1 (12 Oct 2026 IST): site meta in `apps/web/src/app/layout.tsx` (Kunal holds the file)

Description, exact: `Stop Googling legal formats. Lawie is a drafting assistant for Indian advocates. Draft bail applications, legal notices, and more, then review before you file.`

The title ("Lawie — AI Legal Drafting for Indian Advocates") and keywords are marketing, not a legal claim: Meera's call, not part of this sign-off.

## Addendum 2 (12 Oct 2026 IST): five more lines (found by Mahak)

| Where                                                                  | Replace with, exact                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/marketing/SiteFooter.tsx` ~13 (tagline)                    | `Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers.`                                                                                       |
| `faq/page.tsx` ~86 (answer, "What disclaimer applies…")                | `Every document is a first draft generated with AI and must be reviewed by the filing advocate before use. Lawie does not certify any document as court-approved or legally valid.` |
| `faq/page.tsx` ~91 (answer, "Who reviews the templates?")              | `Templates follow Lawie's court rules for the courts in its list. Lawie is a drafting assistant: the filing advocate is responsible for reviewing each generated draft before use.` |
| `faq/page.tsx` meta description                                        | `Answers to common questions about Lawie: documents, BNS/BNSS/BSA mappings, pricing, privacy, and how Lawie drafts documents.`                                                      |
| `components/editor/exportUtils.ts` ~250 (footer on every exported PDF) | `First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice.`                                                            |

Saying that drafts are generated with AI is required transparency, not a claim; what the ban covers is "AI-assisted tool" as a description of what Lawie is. The export footer is legal content printed on the client's document: if exportUtils.ts is outside this ticket's claim, Priya routes it as its own small ticket with this exact text.

## Addendum 3 (12 Oct 2026 IST): three more (found by Mahak's developer)

| Where                                               | Replace with, exact                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `(marketing)/about/page.tsx` ~12 (meta description) | `Why we built Lawie: a drafting assistant for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers.` |
| `(marketing)/tools/page.tsx` ~54 (subline)          | `Quick utilities for the new criminal laws: free to use, no sign-up required.`                                          |
| `tools/bail-checker/page.tsx` ~379 (disclaimer)     | **No change.** It is a tool disclaimer, accurate and more specific than the export footer; it stays as is.              |

A sweep of `apps/web/src` for "built around", "AI-assisted", "current criminal codes" and "new criminal codes" after Addenda 1–3 finds nothing else.

## Addendum 4 (12 Oct 2026 IST): server-side lines, for a separate ticket (drafting, email-worker)

| Where                                                                                               | Replace with, exact                                                                                                                                         |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/drafting/src/services/pdf-export.service.ts` ~150 (footer on server PDFs of generated drafts) | `First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice.` (same as the client export footer) |
| `apps/drafting/src/services/annexures.service.ts`, all 6 footers                                    | `Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.`                                        |
| `apps/email-worker/src/templates/auth/welcome.tsx` ~73                                              | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.`                                                                 |

Annexures (vakalatnama, memo of parties and the like) are filled from a template, not written by the model, so they must not say "generated with AI". If any annexure section is model-written, tell me and it takes the first line instead. Golden snapshots that move come to me. The welcome email is also covered by the emails sign-off: this line replaces its disclaimer only.

## Addendum 5 (12 Oct 2026 IST): model instruction and starting-draft footer (follow-up ticket)

1. `apps/drafting/src/services/template-engine.service.ts` ~1646, prompt instruction, exact replacement:
   `- The footer disclaimer ("First draft generated with AI" / "Lawie does not provide legal advice") — it is added to the export footer automatically and must NOT appear in the body (A6)`
2. When a PDF prints `STARTING_DRAFT_FOOTER` (brief-drafter.ts), it does not also print the generic export footer. The starting-draft line is the more specific one.

T-318 golden move approved: 78 lines in court-rules-golden.test.ts.snap, each the Addendum 4 annexure footer swap and nothing else.

**Addendum 5 (14 Oct 2026, T-396): the Annexure A footer.** The Memo of Parties takes the same footer as the other six annexures, word for word: `Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.` That makes seven annexure footers, all identical, and none says "generated with AI". Brief drafts carry no relation key, so the memo prints the full T-359 AC6 relation blank, which is correct. The 13 memo golden entries come to me before the merge. Each must add only this footer and the relation blank.

**Addendum 5, scope widened (14 Oct 2026, Kunal's T-396 memo goldens).** Three more changes are allowed in the 13 entries, each under an existing signed rule:

- (a) The affidavit line carries the relation, as T-359 AC6 point 1 requires (memo and affidavit).
- (b) The State prints as its proper name, not the court-picker id: `State of Jharkhand`, not `State of jharkhand`. Condition: the name comes from the court record's State display name, never from title-casing the id, so `uttar_pradesh` gives `Uttar Pradesh`. Test: one multi-word State.
- (c) A draft with a parent or spouse name but no relation prints the T-393 name-only blank, `[To be confirmed: relation] <name>`. The full blank prints only when there is no name.

Any other change in the 13 entries needs a fresh sign-off.

**T-396 memo golden: signed (14 Oct 2026).** 13 entries (court-rules-golden, on T-404), each with exactly four changes:
1. The memo relation line becomes the T-393 name-only blank, `[To be confirmed: relation] <name>`.
2. The State line uses the State's display name (`State of Jharkhand`, and so on for each court).
3. The Addendum 5 footer is added to the memo.
4. The affidavit line carries the same relation blank.

Any other byte change needs a new sign-off.
