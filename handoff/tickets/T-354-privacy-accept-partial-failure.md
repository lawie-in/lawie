# T-354 — Privacy accept: behaviour when the database update fails mid-way

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (whether to reorder). Lead (auth, web) |
| Mode   | Small fix |
| Status | Building: kunal (12 Oct 2026) |

If the database update fails after the privacy accept has taken the session, the user sees the P8 error and the next try signs them out. They are not locked out and no session leaks, but it is untested and undocumented.

## Acceptance criteria

1. A test pins today's behaviour (P8, then sign-out on retry, no session leak).
2. A code comment at the accept route explains the order and why.
3. Arjun decides whether to reorder (update first, then rotate the session). If yes, do it here.
4. Screen-reader and reduced-motion checks of the T-343 prompt (untested in T-343) are done and noted, or handed to Anushka's run.
