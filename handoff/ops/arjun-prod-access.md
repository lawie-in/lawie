# Arjun's production access — narrow SSM Run Command, no shell (26 Oct 2026)

Founder decision: give Arjun's cloud session a way to operate the prod box without a shell, without admin, without keys in chat.

Shape: one IAM user `lawie-arjun-ops` → may call `ssm:SendCommand` only on instance `i-0e11d3dd5716776ff` and only with the custom document `lawie-prod-ops`, whose parameters allow-list the commands. No `StartSession`, no S3, no IAM, no console. Key pair goes into the Claude cloud environment settings as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=ap-south-1`; rotate every 30 days; delete when T-533's pipeline removes the need.

## SSM document `lawie-prod-ops` (Command document, schema 2.2, JSON)

```json
{
  "schemaVersion": "2.2",
  "description": "Lawie prod: allow-listed ops for Arjun's session. No free-form shell.",
  "parameters": {
    "action": { "type": "String", "allowedValues": ["status", "logs", "health", "restart", "deploy", "nginx-test", "disk"] },
    "service": { "type": "String", "default": "all", "allowedPattern": "^(all|lawie-(gateway|auth|drafting|billing|email-worker|web))$" },
    "lines": { "type": "String", "default": "100", "allowedPattern": "^[0-9]{1,3}$" }
  },
  "mainSteps": [{
    "action": "aws:runShellScript",
    "name": "run",
    "inputs": {
      "timeoutSeconds": "900",
      "runCommand": [
        "set -u",
        "A='{{ action }}'; S='{{ service }}'; N='{{ lines }}'",
        "run_u() { sudo -u ubuntu -i bash -lc \"$1\"; }",
        "case \"$A\" in",
        "  status) run_u 'pm2 status' ;;",
        "  logs) if [ \"$S\" = all ]; then run_u \"pm2 logs --lines $N --nostream\"; else run_u \"pm2 logs $S --lines $N --nostream\"; fi ;;",
        "  health) for p in 4000 4001 4002 4003 9100 3000; do printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 5 http://127.0.0.1:$p/health || true; done ;;",
        "  restart) if [ \"$S\" = all ]; then run_u 'pm2 restart all --update-env'; else run_u \"pm2 restart $S --update-env\"; fi ;;",
        "  deploy) run_u 'cd ~/lawie && ./deploy.sh' ;;",
        "  nginx-test) nginx -t ;;",
        "  disk) df -h / && free -m ;;",
        "esac"
      ]
    }
  }]
}
```

Note: `logs` prints service logs only; pino never logs secrets, and the no-env-print hook (T-570) applies to the calling session. `deploy` runs the existing `deploy.sh` (pulls `main`).

## IAM policy `lawie-arjun-ops-policy` (replace ACCOUNT_ID)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "SendOnlyOurDocToOurBox", "Effect": "Allow", "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:ap-south-1:ACCOUNT_ID:instance/i-0e11d3dd5716776ff",
        "arn:aws:ssm:ap-south-1:ACCOUNT_ID:document/lawie-prod-ops"
      ] },
    { "Sid": "ReadResults", "Effect": "Allow",
      "Action": ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ssm:ListCommands", "ssm:DescribeInstanceInformation", "ec2:DescribeInstances"],
      "Resource": "*" }
  ]
}
```

## Use from the session

```
aws ssm send-command --instance-ids i-0e11d3dd5716776ff --document-name lawie-prod-ops --parameters action=health
aws ssm get-command-invocation --command-id <id> --instance-id i-0e11d3dd5716776ff
```

Environment needs the `aws` CLI and outbound access to `ssm.ap-south-1.amazonaws.com` / `ec2.ap-south-1.amazonaws.com`.

## Proposed v2 of `lawie-prod-ops` (Nikhil, 26 Oct 2026 — founder applies in the console; not live)

Why: (1) `health` probes `/health` on 3000 and web has no such route, so a healthy web always reads 404; (2) `logs` for a process name the box doesn't have fails with pm2's raw error — the develop box is older and may differ; (3) `restart` uses `pm2 restart --update-env`, but pm2 caches env across `restart` (26 Oct drafting crash-loop) — `reload --update-env` is the documented safe path. Parameters unchanged; IAM policy unchanged.

Diff to `runCommand` (only these three lines change):

```diff
-  "  logs) if [ \"$S\" = all ]; then run_u \"pm2 logs --lines $N --nostream\"; else run_u \"pm2 logs $S --lines $N --nostream\"; fi ;;",
+  "  logs) if [ \"$S\" = all ]; then run_u \"pm2 logs --lines $N --nostream\"; elif run_u \"pm2 describe $S >/dev/null 2>&1\"; then run_u \"pm2 logs $S --lines $N --nostream\"; else echo \"no pm2 process named $S on this box; processes:\"; run_u 'pm2 status'; fi ;;",
-  "  health) for p in 4000 4001 4002 4003 9100 3000; do printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 5 http://127.0.0.1:$p/health || true; done ;;",
+  "  health) for p in 4000 4001 4002 4003 9100; do printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 5 http://127.0.0.1:$p/health || true; done; printf '3000 / '; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 10 http://127.0.0.1:3000/ || true ;;",
-  "  restart) if [ \"$S\" = all ]; then run_u 'pm2 restart all --update-env'; else run_u \"pm2 restart $S --update-env\"; fi ;;",
+  "  restart) if [ \"$S\" = all ]; then run_u 'cd ~/lawie && pm2 reload ecosystem.config.js --update-env'; else run_u \"cd ~/lawie && pm2 reload ecosystem.config.js --only $S --update-env\"; fi ;;",
```

Expected `health` output after v2: `4000 200` … `9100 200`, then `3000 / 200`.

Apply (founder): Systems Manager → Documents → `lawie-prod-ops` → Actions → Create new version → paste the edited JSON → **Set as default version**. Then Nikhil runs `action=health` on both boxes and logs it. Rollback: set the previous version as default.

Session note: the CLI in the cloud session ignores `AWS_REGION`; calls need `--region ap-south-1` after the allow-listed prefix.
