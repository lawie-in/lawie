# T-452: Drawer type has no silent default on the s.138 notice

| Field  | Value |
| ------ | ----- |
| Status | To do. V1. Shashank, after T-361. Priya, 15 Oct 2026 |
| Owner  | Shashank (build), Ajay (byte-checks, signed the change) |
| Mode   | Full chain (legal content: apps/drafting/src/config/document-rules/legal_notice_s138.json, web, golden) |

## Source

Shashank's T-361 Explore. Ajay, 15 Oct 2026: yes. A silent "individual" can wrongly withhold the s.141 NI Act (company/firm) content (ai.service.ts S141_DRAWER_TYPES). The field is already `required: true`.

## Acceptance criteria (Ajay's three conditions)

1. Delete `"default": "individual"` at legal_notice_s138.json:88. The drawer-type dropdown shows a neutral prompt ("Select drawer type") with no option preselected; the existing select pattern covers it (no new design; Priya decided, Rajesh not needed). `required: true` blocks submit and generation while it is empty.
2. No server or intake code substitutes "individual" when it is empty. packForDrawer keeps s.141 withheld for an unset value (the T-407 allow-list already does this; add a test).
3. The golden and the t363/t404 tests that assume the default are updated and re-run before the change goes to Anushka. Ajay byte-checks the diff.

## Scope

legal_notice_s138.json, the web form select placeholder, drafting tests and golden entries only.
