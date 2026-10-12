# T-310 — Ask for consent before Google Analytics loads (DPDP)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release. Gate before v1 go-live (T-403) |
| Owner  | Rajesh (design). Ajay (wording, signs). Arjun (mechanism). Lead (build, web) |
| Mode   | Small feature (web) |
| Status | To do. Decided by Priya on Ajay's advice, 12 Oct 2026. After T-306 and T-308 |

Decision (Priya, 12 Oct 2026, founder has delegated these calls): Google Analytics loads only after the visitor agrees. No consent, no GA script and no `_ga` cookies. Recommended by Ajay for DPDP.

## Acceptance criteria

1. On public pages, a small consent notice offers Accept and Decline (Rajesh designs; Ajay signs the words).
2. GA4 loads only after Accept. Decline or no answer: no GA script, no `_ga` cookie.
3. The choice is remembered and can be changed from the privacy page or footer.
4. T-308's privacy text matches what ships (Ajay re-checks).
5. Checked at 375 and 1280 px.
