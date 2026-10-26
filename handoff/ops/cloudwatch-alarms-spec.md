# CloudWatch alarms for `lawie-prod` — spec + policy JSON (Nikhil, 26 Oct 2026; founder applies)

Status: **proposal**. Nikhil drafts; the founder creates the SNS topic, alarms, agent install and IAM attachment in the console. Spend: Vikram reviews the estimate below; the founder decides. Nothing here is live.

Scope: prod `i-0e11d3dd5716776ff` (ap-south-1). Develop box: optional, only alarms 1–2, after its capacity decision.
App-level errors stay in Sentry (already wired, T-229/T-586/T-595). This covers the box and reachability.

## 0. Alert destination
SNS topic `lawie-ops-alerts` (ap-south-1), email subscription to the founder (confirm the subscription mail). Every alarm below: `AlarmActions` and `OKActions` → this topic.

## 1. Alarms — built-in EC2 metrics (no agent needed)
| # | Name | Metric (AWS/EC2, dim InstanceId) | Condition | Period × points | Missing data | Action |
|---|---|---|---|---|---|---|
| 1 | `lawie-prod-system-check` | `StatusCheckFailed_System` | Max ≥ 1 | 60s × 2 of 2 | breaching | SNS **+ EC2 recover** (`arn:aws:automate:ap-south-1:ec2:recover`) — keeps instance ID, EIP, volume |
| 2 | `lawie-prod-instance-check` | `StatusCheckFailed_Instance` | Max ≥ 1 | 60s × 3 of 3 | breaching | SNS (+ optional EC2 reboot action — founder's choice) |
| 3 | `lawie-prod-cpu-high` | `CPUUtilization` | Avg > 80% | 300s × 3 of 3 | notBreaching | SNS |
| 4 | `lawie-prod-cpu-credits-low` | `CPUCreditBalance` | Min < 30 | 300s × 3 of 3 | notBreaching | SNS — only matters if credit spec is set to `standard` (hygiene item in the go-live log) |

## 2. Alarms — CloudWatch agent metrics (memory/disk/swap aren't built in)
Prereqs (founder):
- Attach AWS managed policy **`CloudWatchAgentServerPolicy`** to the instance role `lawie-prod-ec2-role` (alongside `AmazonSSMManagedInstanceCore`). IAM change → founder only.
- Install: Systems Manager → Run Command → `AWS-ConfigureAWSPackage`, name `AmazonCloudWatchAgent`, action Install, target `i-0e11d3dd5716776ff`.
- Config: save the JSON below to Parameter Store as `AmazonCloudWatch-lawie-prod` (String, not SecureString — no secrets in it), then Run Command → `AmazonCloudWatch-ManageAgent`, action `configure`, mode `ec2`, config source `ssm`, location `AmazonCloudWatch-lawie-prod`, restart yes.

Agent config (metrics only, no log shipping — logs could carry user data; Sentry covers errors):
```json
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "cwagent" },
  "metrics": {
    "namespace": "Lawie/Prod",
    "append_dimensions": { "InstanceId": "${aws:InstanceId}" },
    "aggregation_dimensions": [["InstanceId"]],
    "metrics_collected": {
      "mem":  { "measurement": ["mem_used_percent"] },
      "swap": { "measurement": ["swap_used_percent"] },
      "disk": { "measurement": ["used_percent"], "resources": ["/"], "drop_device": true }
    }
  }
}
```

| # | Name | Metric (Lawie/Prod, dim InstanceId) | Condition | Period × points | Missing data | Action |
|---|---|---|---|---|---|---|
| 5 | `lawie-prod-mem-high` | `mem_used_percent` | Avg > 85% | 300s × 3 of 3 | notBreaching | SNS |
| 6 | `lawie-prod-disk-high` | `disk_used_percent` | Max > 80% | 300s × 1 of 1 | notBreaching | SNS (today 52%) |
| 7 | `lawie-prod-swap-used` | `swap_used_percent` | Avg > 25% | 300s × 3 of 3 | notBreaching | SNS (today 0) |
| 8 | `lawie-prod-agent-silent` | `mem_used_percent` | SampleCount < 1 | 300s × 3 of 3 | **breaching** | SNS — agent died or box unreachable |

## 3. Reachability (outside AWS)
`https://api.lawie.in/health` and `https://lawie.in/` from outside — UptimeRobot free tier, 5-min checks, email to the founder (already a go-live follow-up). Recommended over Route 53 health checks: free, and it sees Cloudflare/TLS failures the box can't.

## 4. Optional: read-only alarm access for Nikhil's IAM user (IAM change → founder applies)
Lets Nikhil read alarm state and these metrics during an incident; cannot create, change or delete anything. Add as a second statement to `lawie-arjun-ops-policy` (or a separate policy on the same user):
```json
{
  "Sid": "ReadAlarmsAndMetrics",
  "Effect": "Allow",
  "Action": [
    "cloudwatch:DescribeAlarms",
    "cloudwatch:DescribeAlarmHistory",
    "cloudwatch:GetMetricData",
    "cloudwatch:GetMetricStatistics",
    "cloudwatch:ListMetrics"
  ],
  "Resource": "*"
}
```
(`Describe*`/`Get*` on CloudWatch don't support resource-level restriction, hence `*`; they are read-only.) If applied, `.claude/settings.json` needs matching allow rules — Priya ticket.

## 5. Cost estimate (approx; Vikram to confirm against ap-south-1 pricing)
- 8 standard alarms ≈ US$0.10 each/month → ~US$0.80.
- 3 custom agent metrics ≈ US$0.30 each/month → ~US$0.90.
- SNS email: within free tier. UptimeRobot: free.
- **≈ US$1.70/month** for prod. Develop box (alarms 1–2 only): ~US$0.20.

## 6. After apply
Founder tells Nikhil; Nikhil logs one ops-log row. Test: founder uses "Set alarm state" (CLI `set-alarm-state` or console) on `lawie-prod-cpu-high` to ALARM and confirms the mail arrives, then it returns to OK by itself.
