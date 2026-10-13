# What counts as "legal content"

A ticket touching any of the following requires Ajay's sign-off reference in the handoff packet (see the lead's entry gate in `.claude/agents/vishal.md`), and the `reviewer` should give it extra scrutiny regardless:

- `apps/drafting/src/config/document-rules/`
- `apps/drafting/src/config/court-rules/`
- `apps/drafting/src/config/courts/`
- `apps/drafting/src/config/sections/`
- `docs/templates/*.json`
- The template seed scripts
- `apps/drafting/src/services/ai.service.ts`
- `apps/drafting/src/services/preflight.service.ts`
- `apps/drafting/src/services/intake.prompts.ts` (ADR-019 §3.12, added by T-101)
- `apps/drafting/src/config/intake/` and `apps/drafting/src/services/bail-guard.ts` (the bail cue lists and the bail rule, added by T-122)
- `apps/drafting/src/services/intake-brief.ts` (the rules of the brief: what the model may read, what a date is the date of, when a brief can be confirmed; added by T-105)
- `apps/drafting/src/services/drafter.prompts.ts` and `apps/drafting/src/services/brief-drafter.ts` (the Drafter and repair prompts, the missing-clause rule and the label rule, added by T-106; and, added by T-136, the checks that the draft keeps the brief's facts and is one document, and the rule for removing a repeated system part, all per `handoff/design/T-136-drafter-rules-signed.md`). The T-200 clause-presence check and its cue map (`CLAUSE_CUES`) in the same file also need Ajay's fresh sign-off for any change (T-237, T-241, T-251 and the T-239 specs will each touch it); see `handoff/legal/T-200-r2b-amendment-signed.md`
- `apps/drafting/src/config/document-rules/_averments/` (the per-pack banned and allowed averment lists, already inside `document-rules/` above; added by T-147c). Each file is hash-signed by Ajay and its `signed_by` stays `null` on purpose, so any edit invalidates the sign-off. `yarn workspace @lawie/drafting report:averments --out <file>` prints the sign-off tables with each file's SHA-256.

See also `.claude/docs/golden-snapshots.md` — most of the court-rules paths above are covered by golden snapshot tests that the `tester` must never auto-update.

- `apps/drafting/src/services/citation-check.ts` (removes case law the advocate did not give: T-148, rule matching of case names: T-263). Added by Priya, 12 Oct 2026. Any change comes with Ajay's signed rule.
- `apps/drafting/src/assistant/prompt/` (the Lawie Assistant system prompt, refusal lines and disclaimer: T-253b, ADR-023 section 3b). Added by Arjun, 12 Oct 2026. Any change comes with Ajay's signed text.
- The signed BNS tables and their readers (T-371, ADR-025 D2). Added by the T-371 lead, 13 Oct 2026; Ajay checks this list. Any change comes with Ajay's signed text or table:
  - `apps/drafting/src/config/bns-offences.json`, `apps/drafting/src/config/bns-mapping.json`, `apps/drafting/src/config/bns-triable-by.json`
  - `apps/drafting/src/services/signed-tables.ts` (the loader: what is served, and its SHA-256 in `GET /health`)
  - `apps/drafting/src/services/bns-offence-resolver.ts` (T-277 resolver and `readSectionsCharged`)
  - `apps/drafting/src/services/sections.service.ts` (converter lookups, the tool reader, and Ajay's texts `NOT_VERIFIED`, `VERIFY_CAVEAT`, `ATTRIBUTE_DEPENDS`)
  - `apps/drafting/src/services/bail-check.service.ts` (the bail checker's notes, summary lines and ranking)
  - `apps/drafting/src/services/timeline.service.ts`
  - The three free-tool pages: `apps/web/src/app/tools/section-converter/page.tsx` (including its bulk tab), `apps/web/src/app/tools/bail-checker/page.tsx`, `apps/web/src/app/tools/timeline-tracker/page.tsx`
- `apps/drafting/src/config/document-rules/_skeletons/` (the generated skeleton JSON per pack, ADR-025 D1; already inside `document-rules/` above). Added by Arjun in T-371, 13 Oct 2026. Each file is generated from Ajay's `handoff/legal/skeleton-<pack>-signed.md`; any change comes with his signed skeleton.
