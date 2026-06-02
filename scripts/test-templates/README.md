# Document Template Smoke Test

Hits `POST /api/documents/generate-from-template` for all 6 templates and saves the responses for CLO review.

## Run

```bash
# 1. Make sure your local stack is up
cd ~/Files/Lawie
docker compose up -d   # or whatever you use locally

# 2. Confirm the gateway is reachable
curl -s http://localhost:4000/health

# 3. Run the test
bash scripts/test-templates/run-all.sh
```

Override the URL if your gateway runs elsewhere:

```bash
API_URL=http://localhost:8080 bash scripts/test-templates/run-all.sh
```

## What gets tested

| #   | Template             | Court (court_rules)                      | Jurisdiction tested     |
| --- | -------------------- | ---------------------------------------- | ----------------------- |
| 1   | `bail_regular`       | Sessions Court, Patna (`bihar_district`) | S.480 BNSS              |
| 2   | `bail_anticipatory`  | Patna HC (`patna_hc`)                    | S.482 BNSS              |
| 3   | `legal_notice_s80`   | n/a (pre-litigation)                     | S.80 CPC notice to govt |
| 4   | `legal_notice_s138`  | n/a (pre-litigation)                     | S.138 NI Act            |
| 5   | `rent_agreement`     | n/a (contract)                           | TPA 1882, Reg. Act 1908 |
| 6   | `consumer_complaint` | District Consumer Commission, Patna      | CPA 2019                |

All payloads use Bihar / Patna so the new `patna_hc.json` and `bihar_district.json` court-rules are exercised.

## Output

After the run, you'll get a folder like:

```
scripts/test-templates/results/20260503-184500/
├── SUMMARY.md                        ← run summary table
├── _run.log                          ← machine-readable log
├── 01-bail_regular.response.json     ← raw HTTP response
├── 01-bail_regular.headers.txt
├── 01-bail_regular.draft.md          ← extracted draft (CLO reads this)
├── 02-bail_anticipatory.response.json
├── 02-bail_anticipatory.headers.txt
├── 02-bail_anticipatory.draft.md
└── ... (6 templates total → 18 files)
```

Share the `results/<timestamp>/` folder path back in chat — Ajay (CLO) will review each `*.draft.md` against the new court-rule schema and report findings.

## Editing payloads

Each payload is a single JSON file in `payloads/`. Edit values freely — the runner picks up whatever is there.
