# T-688: Split tests into a sanity tier (every push) and a full tier (release and nightly)

Status: assigned to shashank, 29 Oct 2026 (Arjun ruled the design; waiting on Ajay to confirm the legal-gate list), raised 29 Oct 2026 by the founder
Priority: P1 (process). Owner: Arjun picks the tiers; a lead builds it after that.

## Why
The founder wanted basic sanity tests. Drafting now has 319 test files and about 18,500 cases, because every ticket added its own tNNN file. A full local run takes about 35 minutes and CI takes about 20 more, so each merge costs about an hour and the queue is serial.

## Acceptance criteria
1. A **sanity** tier runs in CI on every push to develop_staging and finishes in **under 5 minutes total, across all workspaces combined** (founder, 29 Oct 2026). This is a hard cap. It holds:
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

## Arjun's ruling (29 Oct 2026)
- **Mechanism:** Jest `projects` in each workspace.
  - A `sanity` project whose testMatch is an explicit list of globs; the `full` project is everything, unchanged. No file moves, renames or tags.
  - ci.yml runs `test --selectProjects sanity` on every push (blocking).
  - A new full-tests.yml runs the full tier nightly on develop_staging and on every push to release/**.
  - Coverage thresholds apply to the full tier only.
  - A scripts test checks that every sanity glob matches at least one file and sets minimum file counts: drafting 25, web 10, auth 10, billing 6.
- **Sanity contents:**
  - drafting:
    - route smoke: bail_regular and one plaint, intake confirm including the T-668c 400;
    - court-rules snapshots;
    - Ink hold, credits and cost cap;
    - the delivery gate: T-611, T-637 and T-678;
    - fact-ledger and confirmState: t644, t668*;
    - t607 settings;
    - PDF and annexure unit tests;
    - the legal gates, which Ajay confirms.
  - web: t616, BriefStep and OneFlow confirm, useSubscribe, t543, dashboard typed text, t642.
  - auth: t616b, t642, t298 and t673, t657.
  - billing: t413, t415 and t646 webhook grant, the GST invoice gate, t583.
  - email-worker, gateway, shared and scripts: the whole suite.
- **Cap (founder):** the whole sanity CI run takes no more than 5 minutes of wall-clock time, with all workspaces running in parallel. A run over 5 minutes fails the T-688 acceptance and the sanity list gets trimmed.
- **Lead:** shashank. Root config, so he holds the slot alone. His claim covers ci.yml, the new full-tests.yml, the five jest.config files and scripts/__tests__.
