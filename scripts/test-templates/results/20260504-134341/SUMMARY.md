# Lawie · Template Generation Test Run

**Timestamp:** 20260504-134341  
**Endpoint:** `http://localhost:4002/generate-from-template`  
**Tested:** 6 templates  

| # | Template | HTTP | Latency | Output Tokens | Notes |
|---|----------|------|---------|---------------|-------|
| 1 | `bail_regular` | 200 | 5088467ms | n/a | empty draft body |
| 2 | `bail_anticipatory` | 200 | 1828256ms | n/a | empty draft body |
| 3 | `legal_notice_s80` | 000 | 604681ms | n/a | see 03-legal_notice_s80.response.json |
| 4 | `legal_notice_s138` | 000 | 2730371ms | n/a | see 04-legal_notice_s138.response.json |
| 5 | `rent_agreement` | 000 | 1092609ms | n/a | see 05-rent_agreement.response.json |
| 6 | `consumer_complaint` | 000 | 300069ms | n/a | see 06-consumer_complaint.response.json |

---

**Result:** 2 passed, 4 failed (of 6)

## Files in this run

Each template produced 3 files in this folder:
- `*.response.json` — full HTTP response body
- `*.headers.txt`   — HTTP headers
- `*.draft.md`      — extracted draft content (for CLO review)

## Next step

Share this folder path with Ajay (CLO) for legal review:
`/Users/abhinavanand/Files/Lawie/scripts/test-templates/results/20260504-134341`
