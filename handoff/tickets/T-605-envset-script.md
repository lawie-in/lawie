# T-605: scripts/envset.sh — set a NON-secret env line on a box without naming the env file

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (ops; small fix; type: ops) |
| Owner  | Arjun (design, this ticket), Nikhil (user of the script), a lead (build) |
| Mode   | Small fix (a box-side script under scripts/ plus tests). Fresh reviewer mandatory (it writes env files) |
| Status | To do. Raised by Arjun, 26 Oct 2026. NOT assigned: starts when the founder lifts the stop. Priya |
| Source | Arjun's note of 26 Oct 2026 |

## Problem
Nikhil (DevOps) runs commands on the develop box via SSM. The repo hook `.claude/hooks/no-secrets-bash.sh` rightly refuses any command that contains the env file name, so even `FRONTEND_URL=https://develop.lawie.in` has to be typed by the founder today.

## Acceptance criteria
1. `scripts/envset.sh NAME VALUE` resolves the env file path itself from `ecosystem.config.js` line 1; the caller's command never names the file.
2. NAME must be in an allow-list of non-secret names: FRONTEND_URL, ALLOWED_ORIGINS, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SENTRY_ENVIRONMENT, SENTRY_ENVIRONMENT, GOOGLE_CALLBACK_URL, LOG_LEVEL, RAZORPAY_KEY_GUARD, GST_STATE_CODE, EMAIL_FROM_NAME, EMAIL_FROM_ADDRESS. Anything else exits 2 with "secret or unknown name: use Session Manager".
3. VALUE must match a per-name pattern (URL / enum / word). It is never printed back.
4. The script replaces or appends the line, keeps a timestamped backup, and prints only "NAME set" and the `grep -c` count.
5. Tests under scripts/__tests__. The reviewer checks that it cannot be used to write a secret name and never echoes a value.

## Files
scripts/envset.sh and scripts/__tests__/ (new). Claimed by Priya when a lead takes it. No Ajay needed.
