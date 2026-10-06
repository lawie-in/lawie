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

See also `.claude/docs/golden-snapshots.md` — most of the court-rules paths above are covered by golden snapshot tests that the `tester` must never auto-update.
