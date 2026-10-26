# T-607: Drafting fails on prod at the first step: "Could not read your description" (P0)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (P0, prod down for drafting) |
| Owner  | Arjun (diagnosis), Nikhil (box checks), a lead (fix if it is code) |
| Mode   | Diagnose first; small fix if code, ops if config |
| Status | To do. Raised 26 Oct 2026 from Anushka's prod smoke (FAIL). Priya |
| Source | Anushka's report: 4 attempts on lawie.in, Anand Test account |

## What was seen
Every attempt at the first step (describe-first) shows `Could not read your description. Try again.` (DESCRIBE_FAILED in apps/web/src/components/intake/BriefStep.tsx:442) after about 15 seconds. No brief, no questions, no draft. Four routes tried: dashboard box (657 chars), retry twice, New document one-line, Templates > Regular Bail one-line. Ink stayed at 28 (no charge). Earlier today the admin AI configuration page showed both AI models as Live and the Documents page showed 0 generations, so drafting may never have worked on lawie.in.

## First suspects (Priya, to be checked, not proven)
1. The three ai.* AppSettings (ai.drafting_model, ai.preflight_model, ai.intake_model) were unset at go-live (Arjun's finding; T-585 now reports them in drafting's /health `config_warnings`). Check `/health` on the prod drafting service.
2. ANTHROPIC key or egress from the new prod box; model name in the settings not valid; a 15 s upstream timeout between gateway and drafting.
3. Drafting service not running or not reachable from the gateway on the new box (health gate only checked some paths).

## Acceptance criteria
1. Root cause stated in this ticket (log line, config key, or code path).
2. Fix applied (ops: AppSettings/env by the founder; or code by a lead). Name any env or setting only; no values.
3. Anushka reruns the same bail matter end to end: brief, questions, draft, blanks, Ink charge.
4. A regression guard if it was code or a silent config gap (for example the describe step surfaces the real reason class, not a generic message).
