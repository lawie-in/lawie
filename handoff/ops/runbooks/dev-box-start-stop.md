# Runbook: develop box start / stop (Nikhil)

Founder decision, 26 Oct 2026 (relayed by Arjun): the develop box `i-07925b68d6dd907c4` is resized to **t3.small** and kept **STOPPED**. It runs only when someone needs the develop environment (Anushka's runs, a founder test). Nikhil owns start/stop.

**Status: not yet usable.** Until the founder adds the IAM statement (below), the `CLOUDFLARE_API_TOKEN` is in the session env, and `.claude/settings.json` allows the commands, nothing here is run or dry-run.
- `CLOUDFLARE_API_TOKEN`: **missing** at 26 Oct 11:53 UTC (presence check only).
- Cloudflare zone id for `lawie.in`: `<to record at first use>` (looked up once, step S5).

## Rules
- **Start** only on a request from the founder (Nikhil's chat) or Arjun's session. Priya relays Anushka's need to Arjun; she does not ask Nikhil directly.
- **Never stop while an Anushka run is in progress.** Priya tells Arjun/Nikhil when a run starts and ends. When unsure, ask Arjun; don't stop.
- The box has **no Elastic IP**: its public IP changes on every start. The three DNS records follow it (step S5).
- DNS changes touch **only** these three A records: `develop.lawie.in`, `www.develop.lawie.in`, `develop.api.lawie.in`. Never any other record in the zone (prod lives in the same zone).
- Never print the token. Use it only as `-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"`; check it only as `[ -n "$CLOUDFLARE_API_TOKEN" ] && echo set`.
- Every start and stop → ops-log row, then a report to Arjun.

## START
S1. Confirm who asked and why (founder / Arjun; for Anushka, via Arjun).
S2. Start:
```
aws ec2 start-instances --instance-ids i-07925b68d6dd907c4 --region ap-south-1
aws ec2 wait instance-running --instance-ids i-07925b68d6dd907c4 --region ap-south-1
```
S3. New public IP:
```
aws ec2 describe-instances --instance-ids i-07925b68d6dd907c4 --region ap-south-1 --query 'Reservations[].Instances[].PublicIpAddress' --output text
```
S4. Wait for the SSM agent to come online (1–2 min after boot; pm2 resurrects the six processes on boot), then `lawie-prod-ops action=status` on the box. Not online after ~3 min → report to Arjun, don't loop.
S5. Cloudflare — update the three A records to the new IP:
Command form (must match the allow rules exactly): `curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/...`. The header comes first and the URL straight after it; any other options go after the URL. The URL is never quoted, nothing is piped, and `-v` is never used. Responses are plain JSON with no secrets in them; read the fields directly.
```
# once, then record .result[0].id in this file:
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/zones --get --data-urlencode name=lawie.in
# per record (NAME = develop.lawie.in, www.develop.lawie.in, develop.api.lawie.in); note .id, .content, .proxied:
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records --get --data-urlencode type=A --data-urlencode name=<NAME>
# update; expect "success":true:
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records/<RECORD_ID> -X PATCH -H "Content-Type: application/json" --data '{"content":"<NEW_IP>","ttl":60}'
```
- PATCH changes only `content` and `ttl`; `proxied` is kept as it is.
- Exactly one record must match each name. Zero or more than one → stop and report; don't create or delete records.
- Then check `dig +short develop.api.lawie.in`. If it is grey-cloud, it returns the new IP within ~60s.
S6. `lawie-prod-ops action=health` on the box. Expect 200 on 4000–4003 and 9100, and `3000 / 200` once document v2 is live.
S7. Optional: `https://develop.api.lawie.in/health` from outside → 200 (TLS ok).
S8. Log it in the ops log: `start (IP <new>)`, who asked, the health result. Report to Arjun: who asked, the IP, health.

## STOP
T1. Confirm no Anushka run is in progress (Priya/Arjun) and nobody else is mid-test.
T2. Health snapshot: `action=health` and `action=status` (record pm2 restart counts).
T3. Stop:
```
aws ec2 stop-instances --instance-ids i-07925b68d6dd907c4 --region ap-south-1
aws ec2 wait instance-stopped --instance-ids i-07925b68d6dd907c4 --region ap-south-1
```
T4. Ops-log row: `stop`, who asked, the snapshot result. Report to Arjun. DNS stays pointing at the old IP; that is harmless while the box is stopped, and the next start rewrites it.

## What is lost on stop
- EBS disk, code, env file, certs: kept.
- On-box Redis (if the develop env uses it): in-memory data is lost, so BullMQ jobs queued but not yet run are dropped. That is acceptable for develop.
- If the box is stopped through a renewal window, the certbot timer can't renew. On each start, check expiry with `sudo certbot certificates` (founder; or a document action, see below). Certs last 90 days and renew at 30 days left, so this only matters if the box stays off for weeks.

## Prereqs (founder / Priya) — none done yet
1. **IAM (founder):** add a statement to the ops user's policy. Start/stop is limited to this one instance; describe needs `*`:
```json
{ "Sid": "DevBoxStartStop", "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "arn:aws:ec2:ap-south-1:ACCOUNT_ID:instance/i-07925b68d6dd907c4" }
```
   `ec2:DescribeInstances` is already in `ReadResults`. If the root volume is encrypted with a customer-managed KMS key, start also needs `kms:CreateGrant` on that key; the default `aws/ebs` key needs nothing extra.
2. **Cloudflare token (founder):** use a custom API token with **Zone → DNS → Edit** on zone `lawie.in` only, with IP filtering off (cloud session egress varies) and a TTL of 90 days. Put it in the session environment as `CLOUDFLARE_API_TOKEN`.
   - Risk to know: Cloudflare cannot scope a token to single records. This token could edit prod's `lawie.in` / `api.lawie.in` records too. **Accepted by Arjun on 26 Oct 2026; no separate zone.**
   - Mitigation: the rules above, plus the exact-name match in S5.
   - Alternative: move the develop names to a separate zone (e.g. a `develop.lawie.in` subdomain zone on a paid plan), so the token can't reach prod. That is the founder's call.
3. **`.claude/settings.json` allow rules (Arjun hands the lines to the founder, who pushes them; no Priya ticket):**
   - `aws ec2 start-instances --instance-ids i-07925b68d6dd907c4 *`
   - `aws ec2 stop-instances --instance-ids i-07925b68d6dd907c4 *`
   - `aws ec2 wait instance-running --instance-ids i-07925b68d6dd907c4 *`
   - `aws ec2 wait instance-stopped --instance-ids i-07925b68d6dd907c4 *`
   - `aws ec2 describe-instances --instance-ids i-07925b68d6dd907c4 *`
   - `curl` to `https://api.cloudflare.com/client/v4/zones*`
4. **Document (optional, later):** a `certs` action (`certbot certificates`, read-only) in a v3 of `lawie-prod-ops`.
