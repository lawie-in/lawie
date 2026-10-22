# T-555: Old-law wording in four other places, and the README

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (signed text for each place), a lead (build) |
| Mode   | Small fix (web, legal content) |
| Status | Merged into develop_staging ef7fa227 (CI 902 green), 22 Oct 2026; waiting on Anushka's check on develop. Follow-up: T-557. Priya |
| Source | Vishal's T-554 report |

## Places that still say criminal drafts use only BNS, BNSS and BSA
1. `apps/web/src/components/marketing/SiteFooter.tsx:15` (footer on every marketing page)
2. `apps/web/src/app/(marketing)/layout.tsx:33` (metadata description)
3. `apps/web/src/app/(marketing)/about/page.tsx:12` (metadata)
4. `apps/web/src/components/landing/PainSolution.tsx:18` ("auto-maps to the latest BNS, BNSS, and BSA provisions")

AJ-541-M3 ruled only on FAQ line 53. Ajay signs the text for each (same old-law wording or a shorter true one), including the Hindi forms where they exist.

## Also
5. README: Prettier rewrites the Terms version line and the Branch Strategy table (lines ~240-246) because README already fails prettier at HEAD. Fix both together in one doc change.

## Acceptance criteria
Each place carries Ajay's signed text byte for byte, with a pin test; README passes prettier; Ajay byte-checks at READY.

## Ajay's rulings (22 Oct 2026, 9c4ad07e, AJ-555-M1 to M4)
- Footer (`SiteFooter.tsx:15`) and layout meta (`(marketing)/layout.tsx:33`): "Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies."
- About meta (`about/page.tsx:12`): the same sentence, keeping the opening "Why we built Lawie: a drafting assistant for Indian advocates."
- `components/landing/PainSolution.tsx` is never imported: delete it (it carries "5 minutes", "correct" and "no guesswork" claims). Check nothing imports it, including tests.
- `PipelineStatus` line ~251: "Citing BNS / BNSS sections…" becomes "Citing sections…".
- None of these has Hindi.
