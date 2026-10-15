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

## Note (Priya, 12 Oct 2026, from Arjun on T-312)

Production starts fresh. If any document saved on develop before T-300 is ever carried into production, reopen T-312 first (repair on read from `doc.templateId`).

## Before release (Priya, 12 Oct 2026)

- T-336: a description-read "None" on earlier bail applications must be confirmed, ledger on or off (Ajay). Merged 273b6d4.
- T-341: warn after drafting when the draft says "first bail application" and it was not confirmed (Ajay). Merged 08103ec.
- T-348: web server and edge Sentry scrub query strings, so UTM never reaches Sentry (Ajay's T-242 condition 3). Merged 66bab38.
- T-338: unasked optional ledger keys must print as blanks before feature.fact_ledger goes on for any user (Ajay gate). Merged 10faf08.
- T-351: no free Ink for an unverified email sign-up (founder, 12 Oct 2026). Merged eae46a9.
- T-223 (merged 9ae7d51) + T-220: email verification link actually sends (founder, 12 Oct 2026).
- T-356: describe-first (and, after T-187 + T-188, the fact ledger) on by default for new users (founder, 12 Oct 2026).

- Production database (Arjun, 14 Oct): its own Atlas cluster, M10 or higher, backups on with 7-day retention. Not `lawie-dev`; develop and prod never share a database.
- Prod cluster, founder steps (Vikram approved, Arjun, 14 Oct): M10 Mumbai, budget about ₹6,500/month + GST, daily snapshots with 7-day retention, no continuous backup; starts only when prod is set up. When creating it: (1) put the GSTIN in the Atlas org billing profile so the GST is input credit; (2) set Atlas billing alerts at ₹7,000 and ₹8,000 a month; (3) set backup retention to 7 days before turning backups on, then tell Ajay (his Privacy §3 condition).

## Email footer, held verify queue and the 30-day sweep: prod order (Arjun, 14 Oct 2026, final; Ajay 8a2b639, 9e42eea)

1. `queue:purge --dry-run`, then `queue:purge` (every held verify job and held `auth.unverifiedDeletionNotice` job; the dry run only counts).
2. Set the registered-address footer env (founder).
3. Deploy.
4. Run `curl <email-worker>/health` by hand and check it returns 200 (the deploy script check is T-442). Also confirm uptime and deploy checks treat it as a real gate.
5. `verify:resend-all --dry-run`, then `verify:resend-all` (one fresh verify email per unverified user, batched under the T-223 cap).
6. Set `UNVERIFIED_SWEEP_ENABLED=true` (default false), then deploy auth.

Arjun says "ready" explicitly when the commands are on the env. T-358 stamps `firstVerifySentAt` on confirmed send; deletion is no earlier than 30 days after the first email that reaches the user. Keeping an unverified account is a manual verify by ops (T-235 runbook).

## Env example files (15 Oct 2026)

The four root env example files (production, staging, demo and the base example) should list the new variables with a comment each: `UNVERIFIED_SWEEP_ENABLED=false` (T-358) and the seven `GST_*` values and billing's `BILLING_SERVICE_URL` / `REDIS_URL` additions (T-436). The lead sandboxes cannot read or edit these files, so Arjun or the founder adds the lines at release time. Do not put real values in them.

## Founder step: nginx access log (T-377 AC2, 15 Oct 2026)

On the web-domain nginx on the EC2 server, apply the snippet in `docs/nginx-access-log.md` (a `map` that replaces the query string with `?[stripped]` for `/verify-email` and `/auth/callback`, used in a custom `log_format`), run `nginx -t`, reload, and check with the one-line grep in that doc that no token shows. Arjun reviews the doc first.

Note (Mahak, T-377): the nginx map regex and `map` value behaviour are unverified until the founder's `nginx -t` on the server. Run it before reload.
