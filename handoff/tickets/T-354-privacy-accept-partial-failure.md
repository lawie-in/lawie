# T-354 — Privacy accept: behaviour when the database update fails mid-way

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (whether to reorder). Lead (auth, web) |
| Mode   | Small fix |
| Status | Merged into develop_staging 8e38f59 (kunal, 13 Oct 2026). Waiting for Anushka on develop (screen-reader run) |

If the database update fails after the privacy accept has taken the session, the user sees the P8 error and the next try signs them out. They are not locked out and no session leaks, but it is untested and undocumented.

## Acceptance criteria

1. A test pins today's behaviour (P8, then sign-out on retry, no session leak).
2. A code comment at the accept route explains the order and why.
3. Arjun decides whether to reorder (update first, then rotate the session). If yes, do it here.
4. Screen-reader and reduced-motion checks of the T-343 prompt (untested in T-343) are done and noted, or handed to Anushka's run.

## Arjun (12 Oct 2026): keep the order (option A)

Keep take-session → update → createSession, same as `/refresh`. Reason: the acceptance is a consent record, so it is written only by a request whose session we have just proved live and consumed; reordering (B) lets a revoked session record consent in a race. The cost of A is a rare sign-out after a DB failure, which is safe. Add the comment and the test (AC1-2) as the ticket says.


## Change (Arjun, 27 Oct 2026, T-616b)
The single-use rule now reads: same pair inside the 30 s grace window, 401 after. Privacy re-accept uses the same grace rotation as /refresh.
