# T-662 — The engine accepts a select value that isn't one of its options

Status: backlog (unassigned). A T-650 follow-up (Tanvi), 29 Oct 2026. Pre-existing for every select field.

## Problem
A non-empty select value other than the listed options (for example an API caller sending "maybe" for plaint_partition other_defendants) is accepted. The draft then prints as if it were the default branch, here a singular title.

## Acceptance criteria
1. The template engine and the form/brief validators reject a select value that isn't one of its options: the form route returns 400 and the brief treats it as unanswered.
2. Option values are compared case-insensitively against the pack's option values.
3. Tests cover one select per pack type, plus the other_defendants case.
