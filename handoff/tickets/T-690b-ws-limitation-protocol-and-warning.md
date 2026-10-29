# T-690b: WS change_protocol line and the over-90-day warning (legal content)

Status: backlog (low priority). Raised 29 Oct 2026, Ajay ruling 69f47955 (text in handoff/legal run5-rulings).

## Acceptance criteria
1. document-rules/written_statement.json l.7 change_protocol is replaced with Ajay's signed text (30 days / 90 with leave / 120 commercial), byte for byte.
2. Validation rules l.308-309 stay as they are.
3. No hard 90-day block. When a non-commercial WS is past 90 days from service, show Ajay's signed WARNING text (in run5-rulings) and do not block.
4. Ajay checks the branch SHA before merge and the merged SHA after.
Legal-content path. Small fix.
