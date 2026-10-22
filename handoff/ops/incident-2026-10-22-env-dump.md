# Incident: container environment printed into a subagent transcript, 22 Oct 2026

Reported by Vishal 09:16 UTC: a tester subagent in his session ran a stray `export -n`, which printed the whole shell environment into its tool output. Nothing was written to a repo file, committed, pushed or sent to a third party. The values sit in that subagent's transcript (Anthropic-hosted session data the founder's account can read). Vishal did not open it.

## What that environment contains (names only, checked from the CTO session's container, which gets the same environment config)

Product and infrastructure secrets are injected into **every** agent session by the cloud environment config:
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, `MONGO_URI` (with credentials), `MONGO_ROOT_PASS`, `REDIS_URL`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_APP_PASSWORD`, `SMTP_PASS`, `HELICONE_API_KEY`, `CODECOV_TOKEN`, `TEST_SIGNUP_BYPASS_SECRET`, plus session-scoped platform tokens (`GITHUB_TOKEN`/`GH_TOKEN`, `CLOUDSDK_AUTH_ACCESS_TOKEN`), which expire with the session.

That is the real finding. The dump is the symptom; **agent sessions should not hold these at all**. Tests run against an in-memory Mongo and mocked Razorpay/Anthropic; no crew step needs a live credential. The one deliberate exception (T-563's bypass secret, for Playwright) was meant for the one session that runs it, not all of them.

## Severity

Medium. No external exposure is known; the transcript is inside the founder's own account. But the values are now in a place no one controls the retention of, and an AWS key pair in an agent environment contradicts the standing rule (17 Oct: no AI session holds admin keys). Rotate, then trim.

## Rotation (founder, in this order; names only here, never values)

1. **AWS access key** — deactivate now, delete after confirming nothing else uses it. If it is the `vishal-botagent` key from the 17 Oct audit, delete the user's keys outright; the SES sender key (`lawie-ses-sender`) belongs on the email-worker box only, never in an agent environment.
2. **Atlas database user** behind `MONGO_URI` — new password (or a new user and drop the old); update the develop box env; `pm2 restart all`.
3. **Razorpay test-mode** key secret and webhook secret — regenerate in the dashboard (test mode), update the box, re-register the webhook secret.
4. **`JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SECRET`, `ENCRYPTION_KEY`** — new values on the develop box. Rotating JWT secrets logs every develop user out (fine). `ENCRYPTION_KEY`: check first what it encrypts at rest (if stored data depends on it, re-encrypt or accept loss on develop — it is a test box).
5. **Google OAuth client secret** and the **Gmail app password / `SMTP_PASS`** — regenerate in Google Cloud / Google account.
6. **Helicone API key** — delete it (Helicone is "not now"; the key should not exist).
7. **Codecov token** — regenerate in Codecov, update the GitHub repository secret.
8. **`TEST_SIGNUP_BYPASS_SECRET`** — regenerate (`lts_` prefix).
GitHub and gcloud tokens: session-scoped, already expired or expiring; nothing to do.

## Trim (founder, cloud environment settings)

Remove every product secret from the agent environment config. Keep only what sessions actually need: nothing from the list above. If a future ticket needs a live value for a browser run, it is added for that run and removed after, and only the bypass secret ever qualifies.

## Process fixes (tickets, Priya)

1. **Hook:** a `PreToolUse` hook in `.claude/settings.json` that blocks Bash commands matching `\b(env|printenv|export -p|export -n|set)\b` with no arguments, `declare -x`, `cat /proc/*/environ`, `node -p process.env`, and `python -c ... os.environ` — the same way the `.env`-filename hook works today. Root config, one lead.
2. **Crew packets:** "never print the environment" joins the crew protocol in `CLAUDE.md` (Priya edits the line).
3. **CI secret scan** already runs gitleaks on commit; add a check that no tool-result file under `handoff/` or `.claude/` contains a value matching the known secret shapes (`rzp_`, `AKIA`, `mongodb+srv://…:…@`, `lts_`).
