# Quality gate — Anushka (CQO)

Founder's rule, 8 Oct 2026: nothing goes to production until Anushka, the Chief Quality Officer, has passed it. This file says how.

## Who she is

A lawyer on the board who reports to the founder only. She tests the built product end to end in a browser, the way a practising advocate would use it, and gives the verdict. She has no code access and takes no part in deciding how anything is built. Her briefing lives in the `lawie-team` plugin (`agents/anushka.md`), not in this repo, so the session that builds a change cannot be the session that judges it.

Why she exists: before this rule, the team wrote the code, wrote the test plan and passed its own work. Faults reached the founder that a lawyer would have seen in a minute.

## The rule

1. Pull requests into `develop` merge without her verdict. Their body ends with `Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)`.
2. No pull request into `main` is merged, and nothing goes to the prod env, without one of these three lines on it:
   - `Quality: PASS — Anushka, <date and time>` with her report in a comment;
   - `Quality: nothing to test in the UI — <reason>`, written by the lead, for a change no user can see (documents, CI, tests only);
   - `Quality: overruled by the founder — <reason>`.
3. `FAIL` and `BLOCKED` are not passes. A release with either one waits.
4. The lead who built the change never plays Anushka and never writes her verdict. The lead opens the pull request into `main` with `Quality: waiting for Anushka` in the body and stops. The war-room chat invokes her.
5. What she is sent: what a user should now be able to do (in a user's words), the address to open, the state of the account, and how many drafts she may generate. Never the diff, the ticket's build notes, the developer's test plan or anyone's opinion of the work.
6. Her report goes on the pull request into `main` word for word.
7. `FAIL` → her findings become work for Priya to scope. The fix goes to `develop`, and she tests again from the start, not just the fixed part.
8. She may test any pull request marked "nothing to test in the UI".
9. Only the founder overrules a verdict.

## Where the gate sits

The gate is at the release to production: the merge into `main` and the prod env. `develop` is what runs on AWS behind lawie.in today, with the dashboard disabled so no one uses it by accident. Once a batch of work is done, she tests the develop env end to end as an end-user lawyer. Her `PASS` on that is what lets it go to `main` and prod. Pushes to feature branches and merges into `develop` are not gated.

## What she needs, and what happens without it

She tests a running app in a browser. She cannot sign in (no passwords, no Google sign-in) and cannot start services.

- Today the only place the real app runs with the database and the model is the founder's Mac. So she can test only while the app is running there and a browser on it is signed in.
- When that is not so, her verdict is `BLOCKED` and the release waits. It is never passed "for now".
- A check against a stubbed API is the developer's own check. It is not a quality verdict.

## What her pass does not cover

- She is an AI reviewer with a lawyer's training, not an advocate enrolled with a Bar Council. The advocate test round before release (T-402) still stands.
- The four dev-crew steps (`tester`, `reviewer`) still run before her. She is after them, not instead of them.
- Ajay still signs the legal rules and prompts before they are built (`.claude/docs/legal-content-paths.md`). She judges what came out the other end.

## History

- 6 Oct 2026: gate on every merge into `develop` and `main`. 6 Oct rule superseded for develop on 8 Oct 2026.
