# T-672 — Form page shows the signed line for 400 brief_not_confirmed, not "Something did not work"

Status: backlog (unassigned). Follow-up to T-668 (Vishal's reviewer), 29 Oct 2026. Rajesh OK'd it as a no-design change, with conditions.

## Acceptance criteria
1. apps/web/src/app/dashboard/new/page.tsx (~446-467): a 400 `brief_not_confirmed` shows the server's signed line (data.message) byte for byte in the existing error slot, keeps role="alert", and shows NO Retry. This covers O.39 (T-629) and T-668's 8 packs.
2. Rajesh: focus moves to the party-name input that the line names, when the form shows it; otherwise it stays on the slot. If the line names a field the form doesn't show, fall back to the generic line with Retry hidden, and report it to Rajesh and Ajay (copy gap).
3. Web tests: the signed line shows, there's no Retry, and focus is on the named field.

## Mode
Small fix (web only). UI: Rajesh's conditions above.
