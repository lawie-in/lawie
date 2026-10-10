# T-403 — Release v1 to production from main

| Field      | Value                         |
| ---------- | ----------------------------- |
| Phase      | 4 — Polish and v1             |
| Owner      | Vishal, Arjun signs off       |
| Mode       | Release                       |
| Status     | Blocked: T-402 must-fix items |
| Depends on | T-402, T-113                  |
| Branch     | None                          |
| Created    | 2026-10-03                    |

## Goal

Production runs `main`, tagged v1.0.0.

## Context

- On 3 Oct 2026 production runs the brand-assets branch, which is merged to `develop`.
- `main` is the production branch by convention.
- Jira and Notion tickets resume after v1.
- `deploy.sh` is a manual script. It copies `.env.production` to the server and runs `git pull origin main` there. Both deploy workflows in `.github/workflows/` are placeholders.
- `origin/main` was last updated on 16 June 2026 and is 21 commits behind `develop`.
- CI runs only on pushes and pull requests to `develop`, and has no job for `web`.

## Acceptance criteria

- `develop` is merged to `main` and production is deployed from `main`.
- The drops migration (T-201) has run on production with a backup taken first.
- A draft can be generated end to end on production with a real paid account.
- The release is tagged v1.0.0.
- Open local tickets are moved to Jira, and this folder is marked closed in the README.
- How production is deployed today is written down first, because it is not running `main`.
- A rollback step is written and tried before the release.
- The gates in T-113 have passed and `feature.describe_first` is switched on for all users.
- Production is a fresh environment with all-new secrets: `INTERNAL_SECRET`, the JWT secrets, the Anthropic API key, the Razorpay keys and the database credentials. No value is reused from any environment that exists today. The old Anthropic key is revoked. Added 10 Oct 2026 by the founder's decision on T-117 and T-118.
- Decide explicitly whether the production dashboard is switched on at launch. The 'coming soon' switch is server-only and not in git.

## In scope

- Merge, deploy, tag

## Out of scope

- New features

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict               | Note                                                                                          |
| -------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Arjun    | Approved with changes | Feasible. Added two steps: write down how production is deployed today, and prove a rollback. |
