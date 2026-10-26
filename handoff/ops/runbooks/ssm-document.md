# Runbook: changing the `lawie-prod-ops` SSM document

Owner: Nikhil drafts and verifies; the **founder** creates the version and sets it default. Written 26 Oct 2026 after the v3 rollout.

## Why the split
The identity that runs `lawie-prod-ops` on prod (`lawie-arjun-ops`) must not also be able to change what the document runs. `ssm:UpdateDocument` + `ssm:UpdateDocumentDefaultVersion` on the same identity would allow any shell on prod, which defeats "prod = allow-listed document only" (`arjun-prod-access.md`). Read rights (`ssm:DescribeDocument`, `ssm:GetDocument`, `ssm:ListDocumentVersions` on the document ARN) are fine and let Nikhil verify.

## 1. Draft (Nikhil)
1. Write the script as plain bash; `bash -n` it; build the JSON with Python (`runCommand` = the script's lines). No secret values, no env-file name literal, no `scp`/`ssh`/IPs.
2. Put the full JSON in `handoff/ops/arjun-prod-access.md` under a new "Document vN" heading with the why and the diff; commit `docs(ops): ...`; Arjun reviews.

## 2. Apply (founder, console, ~2 min)
Systems Manager → Documents → **Owned by me** → `lawie-prod-ops` → **Actions → Create new version** → paste the JSON (format JSON) → **Create new version** → **Versions** tab → select the new version → **Set default version**. Tell Nikhil the version number.

## 3. Verify (Nikhil)
- With read rights: `aws ssm describe-document --name lawie-prod-ops --region ap-south-1 --query 'Document.[DefaultVersion,LatestVersion]'` and `aws ssm get-document --name lawie-prod-ops --region ap-south-1 --query Content --output text` → diff against the JSON in git.
- Without read rights: send a harmless action that only the new version accepts (e.g. v3: `action=health,branch=main`). `InvalidParameters` = the new version is **not** default; stop and tell the founder.
- Then `action=health` on prod and develop; one ops-log row.

## 4. Rollback (founder)
Versions tab → select the previous version → **Set default version**.

## Never
- Never run `action=deploy` without `branch=` (v1's deploy calls the in-git laptop `deploy.sh`: scp of the env file to a stale IP).
- Never hold write rights on the document in an AI session.
