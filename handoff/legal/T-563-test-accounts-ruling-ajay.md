# T-563 test accounts: Ajay's ruling (22 Oct 2026)

Ticket: `handoff/tickets/T-563-test-signup-bypass.md`. This covers consent and data only. Security design is Arjun's.

| Ref | Point | Ruling |
|---|---|---|
| AJ-563-M1 | Consent record | **Yes, record it**, so no code path skips consent. Record it with `acceptedVia: 'test'` and the current Terms and Privacy versions. A test acceptance is never counted, exported or reported as a real user's consent, and never satisfies a re-accept prompt for a real account. |
| AJ-563-M2 | Email address | **Must be on a reserved test domain**: `@example.com`, `@example.org` or any `.test` address (RFC 2606). The server refuses the bypass for any other domain and treats it as a normal sign-up. Otherwise an agent could create a verified account in a real person's name and inbox. That would be a verified identity the person never confirmed, and personal data without notice. |
| AJ-563-M3 | Name | `TEST…` only, as the ticket says. Never a real person's or advocate's name, even after the prefix. |
| AJ-563-M4 | Matter content | Agents enter **synthetic facts only**: no real client, case number, FIR or party name. This goes in the agent test instructions. Generated drafts from test accounts are test data and are never used as samples, marketing or training material. |
| AJ-563-M5 | 30 Ink grant | No user-facing wording. The ledger reason is internal (`test_grant`) and is never shown as a promotion, never appears in public copy, and is excluded from invoices and Ink reports, per the ticket. |
| AJ-563-M6 | Retention | Develop only. Delete test accounts and everything in them (drafts, ledger, consent rows) **within 7 days** of creation, or at the end of each test run, whichever is sooner, using the ticket's delete script. Record the count (no ids) in the run note. No test account or data may reach a production database. |
| AJ-563-M7 | Anushka | If Anushka tests with a bypass account, these rules apply to her account too. She still enters synthetic facts only. |
| AJ-563-M8 | Strings | None. If any user-visible string is added (for example a "test account" badge), I sign it first. |
