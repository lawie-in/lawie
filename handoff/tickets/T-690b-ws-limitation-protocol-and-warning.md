# T-690b: WS change_protocol line and the over-90-day warning (legal content)

Status: backlog (low priority). Raised 29 Oct 2026, Ajay ruling 69f47955 (text in handoff/legal run5-rulings).

## Acceptance criteria
1. document-rules/written_statement.json l.7 change_protocol is replaced with Ajay's signed text (30 days / 90 with leave / 120 commercial), byte for byte.
2. Validation rules l.308-309 stay as they are.
3. No hard 90-day block. When a non-commercial WS is past 90 days from service, show Ajay's signed WARNING text (in run5-rulings) and do not block.
4. Ajay checks the branch SHA before merge and the merged SHA after.
Legal-content path. Small fix.


## REOPENED 30 Oct 2026: Anushka v1.2.7 FAIL (strike 1)
The over-90-day amber warning never appears on the brief path. Her steps: service date 1 July 2026 on the brief and in the draft, "121" typed into Days from service of summons, and no warning on the brief, the ready screen or the draft. The preflight rule is likely reached only on the form route, or the brief never computes days_from_service.
New acceptance criteria:
4. Reproduce on the real update, confirm, generate path with her exact steps.
5. The warning shows on the brief path, before confirm and on the ready screen. Rajesh says where it sits.
6. A real-route test covers the brief path.

## Rajesh placement (30 Oct 2026)
Reuse the existing amber soft-finding card in both places: same markup, role="status" (never alert), AlertTriangle icon in Amber, no button.
(a) Guided brief: directly above the Ink cost line and the Confirm button, inside the brief folio, after the last fact row. It never changes the button or the cost line. It stays while the user edits, unless a date edit clears the condition.
(b) Draft ready: the first item in the checks panel (the rail at 1280, the bottom sheet at 360). It does not appear on the folio. The checks chip count includes it.
Show one instance of the text per screen.
