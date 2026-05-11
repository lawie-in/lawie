# Lawie · Template Generation Test Run

**Timestamp:** 20260506-124331  
**Endpoint:** `http://localhost:4002/generate-from-template`  
**Tested:** 6 templates  

| # | Template | HTTP | Latency | Output Tokens | Notes |
|---|----------|------|---------|---------------|-------|
| 1 | `bail_regular` | 200 | 13164ms | n/a | empty draft body |
| 2 | `bail_anticipatory` | 200 | 21191ms | n/a | empty draft body |
| 3 | `legal_notice_s80` | 200 | 18160ms | n/a | empty draft body |
| 4 | `legal_notice_s138` | 200 | 8816ms | n/a | empty draft body |
| 5 | `rent_agreement` | 200 | 23009ms | n/a | empty draft body |
| 6 | `consumer_complaint` | 200 | 24219ms | n/a | empty draft body |

---

**Result:** 6 passed, 0 failed (of 6)

## Files in this run

Each template produced 3 files in this folder:
- `*.response.json` — full HTTP response body
- `*.headers.txt`   — HTTP headers
- `*.draft.md`      — extracted draft content (for CLO review)

## Next step

Share this folder path with Ajay (CLO) for legal review:
`/Users/abhinavanand/Files/Lawie/scripts/test-templates/results/20260506-124331`
