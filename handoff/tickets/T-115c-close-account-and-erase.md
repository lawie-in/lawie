# T-115c — Close an account and erase its data

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Arjun designed it |
| Mode           | Build (auth + services + web) |
| Status         | To do. Unassigned. Waits for Rajesh's design and Ajay's text. After T-115a |
| Parent         | T-115 |

Account close (blocked while a subscription is active) goes through `/internal/erase-user`: auth orchestrates, each service erases its own data; `scripts/erase-user.ts` uses the same path. Per Arjun's revised design in `T-115-permanent-delete-and-encrypted-inputs.md`. Billing rows: Ajay decides whether they stay.

## Acceptance criteria

See the slice list and acceptance criteria in `T-115-permanent-delete-and-encrypted-inputs.md` (Arjun, 12 Oct 2026, revised design). Gate before v1 go-live.

## Note (Priya, 12 Oct 2026)

Ajay condition 5 on T-242: deleting an account must remove the whole User document, including `signupSource` (UTM tags and time). No delete path exists today.
