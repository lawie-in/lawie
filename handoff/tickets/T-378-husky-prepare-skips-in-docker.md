# T-378 — Husky's prepare script doesn't break Docker builds

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — After v1 |
| Owner  | Lead (root config) |
| Mode   | Small fix |
| Status | To do. Low priority, after v1. Sequence it with ADR-025 D5 (deploys move to the workflows). Arjun, 13 Oct 2026 |
| Source | Mahak, during T-223 review. Not a release risk: today's deploy is pm2 on the host (deploy.sh), and the Dockerfiles aren't on the live path |

## Acceptance criteria

1. The root `prepare` script becomes `node .husky/install.mjs`, which returns silently when `CI` is set or `.git` is absent (husky's own recipe).
2. `apps/auth/Dockerfile` and `apps/email-worker/Dockerfile` set `ENV HUSKY=0`.
3. A Docker build of each image completes `yarn install` without .git.

Files: root package.json (root config, one lead at a time), apps/auth/Dockerfile, apps/email-worker/Dockerfile.
