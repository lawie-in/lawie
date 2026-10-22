# T-534: Secrets loader (Parameter Store)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Arjun (design), a lead (build) |
| Mode   | Full chain (`packages/shared`: one lead at a time) |
| Status | To do. Founder GO 21 Oct 2026. Priya |
| Source | `handoff/ops/prod-pipeline-and-secrets.md` |

## Acceptance criteria
1. `loadSecrets()` in `packages/shared` reads `/lawie/<env>/<service>` JSON from AWS Parameter Store using the instance role when `SECRETS_BACKEND=ssm`; otherwise it uses the environment as today.
2. One call at each of the six service boot sites.
3. `SECRETS_BACKEND` absent means today's behaviour exactly, so nothing changes until the production box exists.
4. Tests with a stubbed SSM client: success, missing parameter, malformed JSON, access denied (clear error, no secret values in logs).
5. No secret values in logs or error messages, ever.
6. The dev box is untouched.

## Files
packages/shared (new loader, exports, tests); one boot call in each of apps/gateway, auth, drafting, billing, email-worker and the web server entry where it applies. Shared and the boot files are held by one lead alone.

## Arjun (22 Oct 2026) — twelve calls after Explore (Shashank)

1. **`SECRETS_ENV`** (e.g. `prod`), required when `SECRETS_BACKEND=ssm`, refuse boot if missing. It is boot-time infrastructure config, so an env var is right here; T-533's prod compose sets both. Not `NODE_ENV` (develop runs `production`).
2. Literal per boot site: `loadSecrets('gateway')` etc.
3. **SSM fills only unset keys** (dotenv semantics), so a compose `environment:` value wins — predictable, and compose holds no secrets. Add one boot log line naming the keys SSM skipped because they were already set (names only), so a stale override is visible.
4. `secretsmanager` → refuse "not implemented"; unknown values refuse.
5. web: yes, minimal — `loadSecrets('web')` in `instrumentation.ts` `register()` on the nodejs runtime, before Sentry; `NEXT_PUBLIC_*` stay build-time.
6. `@aws-sdk/client-ssm` in `packages/shared` dependencies, lazily required only under `ssm`; never exported from the barrel; services import `@lawie/shared/dist/secrets`. **`yarn.lock` is root config held by Tanvi for T-533** — Priya sequences: either T-534 lands after T-533 merges, or she extends the claim to `yarn.lock` for this one change.
7. Tests in `apps/gateway` (`t534-secrets-loader`, stubbed client) plus one boot-order test per service; `ci.yml` unchanged.
8. **Option A**: thin `index.ts` (dotenv → `await loadSecrets` → `require('./main')`), body moved to `main.ts`; dist entry, Dockerfile CMD and pm2 unchanged; synchronous path when `SECRETS_BACKEND` is absent, so develop's behaviour is byte-identical. Retarget the four tests.
9. Loader failure before Sentry: stderr + exit 1. Accepted.
10. Fail-closed list approved as written; errors carry path and `err.name` only, never a message or value; `AWS_REGION` defaults to `ap-south-1`.
11. CLI/backfill scripts: out of scope, noted as the T-534 follow-up.
12. Fix the example file's comments if Priya clears the file for this ticket.
