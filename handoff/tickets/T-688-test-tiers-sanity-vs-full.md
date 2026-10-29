# T-688: Split tests into a sanity tier (every push) and a full tier (release and nightly)

Status: design (Arjun), raised 29 Oct 2026 by the founder
Priority: P1 (process). Owner: Arjun picks the tiers; a lead builds it after that.

## Why
The founder wanted basic sanity tests. Drafting now has 319 test files and about 18,500 cases, because every ticket added its own tNNN file. A full local run takes about 35 minutes and CI takes about 20 more, so each merge costs about an hour and the queue is serial.

## Acceptance criteria
1. A **sanity** tier runs in CI on every push to develop_staging and finishes in under 5 minutes per workspace. It holds:
   - one smoke test per route;
   - the court-rules snapshots;
   - Ink, billing and auth;
   - the legal gates: the non-answer party, the date conflict and the withheld draft.
2. A **full** tier (everything) runs nightly and before every release cut. It never blocks a develop_staging merge. A red nightly run gets a ticket, and the test that caught the problem moves into the sanity tier.
3. Leads run the sanity tier plus their own ticket's tests before merging, not the full suite. CLAUDE.md and dev-lead-protocol.md are updated to match.
4. No test is deleted in this ticket. Pruning, if any, is a later ticket.
5. Ajay confirms that the legal-gate tests are in the sanity tier.
6. Arjun decides how the tiers are marked (path, tag or jest project) and records it in .claude/docs/coverage.md.

## Touches
Root config: ci.yml and the jest configs. One lead holds the root-config slot alone.
