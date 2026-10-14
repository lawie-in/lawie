# T-358 — Delete email accounts never verified after 30 days

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (auth) |
| Mode   | Small fix |
| Status | To do. Unassigned. After T-223. Not a release gate. From Ajay, 12 Oct 2026 (T-223 sign-off cbe17ce) |
| Source | Ajay: a password sign-up can hold someone else's address; we should not keep it indefinitely |

## Acceptance criteria

1. A daily job in auth deletes accounts with `authProvider` email, `emailVerified` false, no `googleId`, created more than 30 days ago.
2. Deletion uses the same path as account deletion (T-242/T-235): the account and its data go, signupSource included.
3. Logs record only a count of deleted accounts. No address and no userId go to third-party logs.
4. Tests: a 29-day account is kept; a 31-day account is deleted; a verified account and a Google-linked account are kept at any age.
5. Ajay signed (44326dc): 30 days after sign-up confirmed. In the same release, Privacy Policy §9 gets the line "Accounts whose email address is never verified: deleted 30 days after sign-up." Bump the policy version with no change summary, so no re-accept prompt (retention only gets shorter). The policy file is legal content: the lead lists it in the claim.

Out of scope: nothing on warning emails. Ajay a84e298 requires a 7-day notice email before deletion, so it is in scope.

## Arjun (14 Oct, 17:40 UTC) — what an unverified account actually holds

Checked `apps/auth` (`registerUser`, User and Session models) and the gateway/drafting middleware. Ajay's parking condition ("only an email and a password hash") is **not** true:

- Sign-up stores email, password hash, name, role, terms/privacy acceptance times and versions, sanitised UTM tags, and a Session row with IP address and user agent.
- Nothing gates `emailVerified: false` anywhere (no check in the gateway, drafting or auth middleware). An unverified account can log in and create documents, so it can hold case details like any other account.

Ruling: T-358 is a small ticket **after T-115c**, not a separate delete path. A daily sweep in auth selects users with `emailVerified: false` and `createdAt` older than 30 days and runs the same erase orchestration T-115c builds (auth → drafting → billing `/internal/erase-user`). Nothing new to design. Until then the manual erase runbook (T-235) covers a request. Ajay decides whether the policy needs a line for the 30-day unverified deletion; parking is his call knowing the above.
