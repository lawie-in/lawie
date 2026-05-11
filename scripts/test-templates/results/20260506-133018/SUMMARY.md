# Lawie · Template Generation Test Run

**Timestamp:** 20260506-133018  
**Endpoint:** `http://localhost:4002/generate-from-template`  
**Tested:** 6 templates  

| # | Template | HTTP | Latency | Output Tokens | Notes |
|---|----------|------|---------|---------------|-------|
| 1 | `bail_regular` | 200 | 15170ms | n/a | empty draft body |
| 2 | `bail_anticipatory` | 200 | 21941ms | n/a | empty draft body |
| 3 | `legal_notice_s80` | 200 | 16490ms | n/a | empty draft body |
| 4 | `legal_notice_s138` | 200 | 8583ms | n/a | empty draft body |
| 5 | `rent_agreement` | 200 | 19885ms | n/a | empty draft body |
| 6 | `consumer_complaint` | 200 | 22449ms | n/a | empty draft body |

---

**Result:** 6 passed, 0 failed (of 6)

## Files in this run

Each template produced 3 files in this folder:
- `*.response.json` — full HTTP response body
- `*.headers.txt`   — HTTP headers
- `*.draft.md`      — extracted draft content (for CLO review)

## Next step

Share this folder path with Ajay (CLO) for legal review:
`/Users/abhinavanand/Files/Lawie/scripts/test-templates/results/20260506-133018`
