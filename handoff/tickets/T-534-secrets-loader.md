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
