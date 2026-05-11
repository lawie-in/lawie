# HR analysis — Pre-generation verification layer scope & ownership
**Date:** 2026-05-08 · **Author:** Rita (HR)

## 1. Ownership model — split, not shared

| Layer | Owner | Edits |
|---|---|---|
| **Rule taxonomy** ("what counts as unusual") | **Ajay (CLO)** | Source of truth. Rule list lives in `/docs/legal/verification_rules.yaml`. |
| **UX shape** (soft-warn vs hard-block, copy, dialog placement, frequency caps) | **Priya (PM)** | Translates Ajay's rules into PRD acceptance criteria. |
| **Implementation** (rules engine, evaluator, telemetry) | **Vishal (Dev)** | Read-only consumer of the YAML. Never authors a rule. |
| **Cost/latency budget per check** | **Vikram + Arjun** | Per existing matrix (pricing/feasibility). |

Why split, not shared: a single owner blocks; shared ownership creates exactly the conflicts in §3. The YAML file is the contract.

## 2. Briefing updates needed — yes, all three

- **Ajay:** Add to scope: *"Source of truth for the pre-generation verification rule taxonomy. Authors and versions `/docs/legal/verification_rules.yaml`. Each rule = id, trigger, severity (block/warn/info), advocate-facing copy."*
- **Priya:** Add to scope: *"Translates Ajay's verification rules into product UX — when to soft-warn vs hard-block, dialog placement, copy tone, frequency caps. Cannot add or remove rules; can override severity for UX reasons with Ajay's countersign."*
- **Vishal:** Add to do-NOT: *"Do not author or modify verification rules — the rules engine reads `/docs/legal/verification_rules.yaml` only. Implementation bugs go to Arjun; rule content questions go to Ajay via Priya."*

## 3. Scope-conflict risk — real, in two places

1. **Severity override.** Ajay says hard-block; Priya wants soft-warn for first 30 days to gather data. **Tie-breaker: Ajay holds final say on legal-correctness severity (per existing matrix row "Marketing claim vs legal accuracy"). Priya can request a time-boxed UX override; Ajay must countersign. Logged in the YAML as `ux_override_until: <date>`.**
2. **Copy.** Ajay drafts the legal substance of the warning; Madhuri/Priya own tone. Ajay has veto on accuracy, not phrasing.

## 4. Onboarding — non-CLO rule proposals

Yes, allowed. Annu (QA, future), Vishal (from production errors), or Madhuri (from advocate feedback) can **propose** rules via PR to the YAML. Ajay is the **only approver**. Path codified in the SOP below — same shape as Vishal's current ticket flow, just routed to Ajay instead of Priya.

## 5. SOP — `/docs/sop/verification_rules.md`

> **Proposing a verification rule.** Anyone may propose. Open a PR adding an entry to `/docs/legal/verification_rules.yaml` with: `id`, `trigger` (input pattern or LLM check), `severity` (`block` / `warn` / `info`), `advocate_copy` (≤160 chars), `rationale` (cite BNS/BNSS/BSA section or BCI rule), `proposed_by`, `date`. Tag **@ajay** for legal review (required) and **@priya** for UX review (required). Ajay approves or rejects on legal merit; Priya approves severity + copy; if they disagree, Ajay's severity stands unless a time-boxed `ux_override_until` is countersigned by both. Vishal then merges and the rules engine picks it up on next deploy — no code change required for new rules of existing trigger types. New trigger *types* require an Arjun ADR. **Testing:** every new rule ships with at least one positive and one negative fixture in `/server/tests/verification/<rule_id>.test.ts`; Vishal will not merge without green CI. **Versioning:** YAML is semver-tagged; Ajay owns the version number.

## Files touched
- `/Users/abhinavanand/Files/Lawie/docs/agents/ajay_briefing.md` — pending edit
- `/Users/abhinavanand/Files/Lawie/docs/agents/priya_briefing.md` — pending edit
- `/Users/abhinavanand/Files/Lawie/docs/agents/vishal_briefing.md` — pending edit
- `/Users/abhinavanand/Files/Lawie/docs/sop/verification_rules.md` — to be created

Ready for next task.
