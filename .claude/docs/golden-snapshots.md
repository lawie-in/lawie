# Golden snapshot tests (`apps/drafting`)

`apps/drafting/src/__tests__/court-rules.test.ts` and `court-rules-golden.test.ts` are snapshot tests over the court-rules config (`apps/drafting/src/config/court-rules/`, etc.) — see `.claude/docs/legal-content-paths.md` for the full path list these snapshots cover.

`apps/drafting/package.json` has a `test:golden:update` script (`jest --testPathPattern=court-rules-golden --updateSnapshot --forceExit`) that rewrites the golden snapshots to match current output.

**The `tester` agent must never run this script or pass `--updateSnapshot` to any test command.** These snapshots encode legal content — a drafting change that alters generated legal text should fail its snapshot test, not have the snapshot silently rewritten to match. If a golden snapshot test fails:

1. Report it as a failure in the tester report, with the file and the diff.
2. Do not update the snapshot yourself.
3. The lead decides whether the diff is an intended content change (needs Ajay's sign-off per the legal-content gate) or a regression the developer needs to fix.
