# Environment variables — names only, never values

Founder rule (21 Oct 2026): the founder sets every value himself, so he must know each new variable **before** the deploy that needs it. This file is that list. Priya owns it. **No value, key, secret, or example secret ever goes in this file or anywhere in the repo.**

## The rule

1. A ticket that adds, renames, or removes an environment variable lists it in the ticket under "Env vars" (name, service, secret or public, required or optional, what breaks if unset) **before it is built**.
2. The lead's READY message repeats the list. No list in READY means no slot.
3. Priya adds the row here when the ticket merges, and tells the founder in the next update: "New variable(s) to set before deploying: NAME (service, where)". He sets the values; nobody else holds them.
4. `NEXT_PUBLIC_*` variables are baked in at build time: setting one means rebuilding web, not restarting it.
5. Removed variables are marked `removed`, not deleted, until prod no longer has them.

## Registry

Seeded 21 Oct 2026 from a scan of `process.env.X` in the code. It can miss variables read through a config module or destructuring, so leads correct it when they find a gap.

| Name | Service | Kind | Needed | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` | web | public, build-time | optional | Value is the Grievance Officer's name (AJ-517-M21). Unset shows "For complaints, write to contact@lawie.in." Rebuild web after setting. |
| `NEXT_PUBLIC_API_URL` | web | public, build-time | required | Gateway URL. |
| `MONGO_URI` | all services | secret | required | |
| `REDIS_URL` | services | secret | required | |
| `INTERNAL_SECRET` | services | secret | required | Service-to-service. |
| `RAZORPAY_KEY_ID` | billing | secret | required | Test keys on develop, live keys on prod. Key secret and webhook secret also exist under billing's config; leads confirm their names. |
| `RAZORPAY_KEY_GUARD` | billing | config | prod: `strict` | `strict` refuses to boot on the wrong key mode. |
| `RAZORPAY_ALLOW_TEST_KEYS` | billing | config | must be absent on prod | |
| `SENTRY_DSN` | services | secret | required | |
| `FRONTEND_URL` | services | config | required | |
| `DRAFTING_SERVICE_URL`, `DRAFTING_INTERNAL_URL` | gateway, billing | config | required | |
| `EMAIL_QUEUE_PREFIX` | email-worker | config | optional | |
| `LOG_LEVEL` | services | config | optional | |
| `PUPPETEER_EXECUTABLE_PATH` | drafting | config | optional | |

To fill in by the next ticket that touches them: the Anthropic API key, JWT secrets, SES keys, Google OAuth ids, the `fact_ledger` flag.
