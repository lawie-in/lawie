# T-609: /admin/ai-config shows every ai.* setting, including ai.intake_model, and a missing-keys banner

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (ops hygiene; web + drafting admin route) |
| Owner  | Arjun (design), a lead (build). No Rajesh: admin, existing layout |
| Mode   | Small fix (web admin page + the drafting admin route) |
| Status | To do. Raised by Arjun, 26 Oct 2026, from T-607. Not assigned: starts when the stop lifts. Priya |
| Source | T-607: ai.intake_model was missing on prod and the admin page has no row for it, so it could only be seeded from the box |

## Acceptance criteria
1. /admin/ai-config adds a row for `ai.intake_model` (editable like the other two), so no model setting is console-only.
2. The optional `ai.effort.*` and `ai.cap.*` keys appear read-only.
3. A boot-time check lists missing REQUIRED ai.* keys in a banner on the page (reuse T-585's config_warnings).
4. Tests; web and drafting tests and build green. No new env.

## Files
Lead lists after Explore: the admin page under apps/web, the drafting admin settings route (apps/drafting/src/routes/app-settings.routes.ts, admin-overview.routes.ts) and tests. Claimed by Priya.
