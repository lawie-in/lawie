# T-688: legal-gate tests that must stay in the sanity tier (Ajay, CLO)

29 Oct 2026. One complete list. Rule: every test that pins **signed text byte for byte**, or a **gate that stops a wrong draft or takes no Ink**, runs on every push. Route and end-to-end variants of the same gates may move to the full tier, **provided** the unit test of the same gate stays in sanity. Files are in `apps/drafting/src/__tests__/` unless noted. Nothing is deleted.

## A. Signed text, byte for byte

- t136-signed-text
- t371-signed-tables
- t397-ledger-prompts-signed
- t473-signed-labels
- t473-form-labels
- t566-legal-draft-text
- t661-party-ask-lines
- t666-confirm-messages-scope
- t374-skeletons
- t577-skeleton-validator
- court-rules-golden (snapshot)
- court-rules
- t613-o39-injunction
- t644-o39-cause-title
- t650-party-fields
- t612-bail-grounds
- t612-averments
- t612-police-station
- t638-police-station-prose
- t197-disclaimer
- t321-one-disclaimer
- t322-signed-blank-covers-clause

## B. Citations

- t178-family-court-citation
- t248-bnss-citations
- t263-citation-name-match
- t346-citation-check-helper
- t236-recheck-after-citation-removal
- t429-discharge-ni-act-gate

## C. Fact checker and ledger (T-611 policy)

- t611-verifier
- t611-amount-in-words
- t611-gate-helpers
- t611-round2
- t611-review-r1
- t488-verifier-dates
- t488-state-not-in-draft
- t340-fact-alteration-dates
- t241-bail-instructions-assert-facts
- t678-ws-gate
- t638-custody-since
- t638-none-answers
- t660-brief-ledger-agreement

## D. Non-answers and parties (T-511 rulings)

- t629-confirm-block
- t655-ledger-not-known
- t668-typed-not-known-party
- t668b-non-answer-prefix
- t668c-declaration-party
- t381-brief-party-fields

## E. Gates that block before Ink

- t628-prayer-date-gate
- t628-hold
- t637-form-ledger
- bail-guard
- t522-verified-fence

## F. Courts

- t674-court-label
- t674-court-title
- t634-document-court-type

## G. Privacy and logs (no personal data or document content in logs or Sentry)

- t288-ink-log-redaction
- t229-sentry-hooks
- sentry
- t115e-no-matter-label
- t343-privacy-reaccept

## May move to the full tier

These are route and end-to-end versions; their unit tests above stay in sanity:

- t611-gate.routes, t611-d1.routes
- t613-o39-route
- t628-o39-form.routes, t628-o39-gate.routes
- t629-form-route
- t637-brief-gate.routes, t637-form-gate.routes
- t638-custody-since-route
- t674-court-label-routes
- t373-* (renderer rounds)
- t115a/b/c

## Conditions

- **Release:** the full tier must be green on the exact SHA I approve before any release to main.
- **New signed text:** a new signed string or gate test joins sanity by default. Moving it out needs my yes.
- **Budget:** if sanity exceeds 5 minutes, propose cuts to me by name. Do not drop anything from A–G silently.
- **scripts/golden-set** live fixtures are not unit tests and stay where they are now.

## Narrowed ask (Arjun's 5-minute cap, 29 Oct 2026)

**(1) Citation and disclaimer suites that stay in sanity** (unit, fast): t197-disclaimer, t321-one-disclaimer, t248-bnss-citations, t263-citation-name-match. The per-pack citation/disclaimer suites and the PDF render may go to nightly/release. Lists A–G above otherwise stand, so moving anything else needs my yes.

**(2) Ten packs to sample if court-rules must shrink to 2 minutes:** bail_regular, bail_anticipatory, temporary_injunction_o39, quashing_528_bnss, criminal_revision, plaint_recovery, plaint_partition, written_statement, legal_notice_s138, maintenance_bnss_144. These are the live argued packs plus the most-used civil and criminal ones. Also, whatever the sample, the court-rules file `district_court_generic` stays, as do any court-rules file changed in the commit being tested. **The full court-rules run is required green on the approved SHA before release.**
