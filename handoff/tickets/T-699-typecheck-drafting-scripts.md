# T-699: The drafting build does not typecheck apps/drafting/scripts

Status: backlog (small). Raised 30 Oct 2026 by Priya from Shashank's T-684b item 8 report.

`yarn workspace @lawie/drafting build` runs tsc on src/ only (tsconfig include), so a type error in a migration script under apps/drafting/scripts/ (e.g. migrate-model-settings.ts, which runs on prod) passes the build.

## Acceptance criteria
1. A typecheck covers apps/drafting/scripts/** (a separate tsconfig.scripts.json with noEmit, run from build or a new script that CI runs).
2. The emitted dist output is unchanged.
3. Proof: a deliberate type error in a script fails the check; the current scripts pass (fix any existing errors in the same ticket or list them).
