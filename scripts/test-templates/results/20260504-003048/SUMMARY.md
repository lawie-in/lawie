# Lawie · Template Generation Test Run

**Timestamp:** 20260504-003048  
**Endpoint:** `http://localhost:4000/api/documents/generate-from-template`  
**Tested:** 6 templates  

| # | Template | HTTP | Latency | Output Tokens | Notes |
|---|----------|------|---------|---------------|-------|
| 1 | `bail_regular` | 200 | 16452ms | n/a | empty draft body |
| 2 | `bail_anticipatory` | 404 | 76ms | n/a | see 02-bail_anticipatory.response.json |
| 3 | `legal_notice_s80` | 404 | 68ms | n/a | see 03-legal_notice_s80.response.json |
| 4 | `legal_notice_s138` | 404 | 71ms | n/a | see 04-legal_notice_s138.response.json |
| 5 | `rent_agreement` | 404 | 74ms | n/a | see 05-rent_agreement.response.json |
| 6 | `consumer_complaint` | 404 | 68ms | n/a | see 06-consumer_complaint.response.json |

---

**Result:** 1 passed, 5 failed (of 6)

## Files in this run

Each template produced 3 files in this folder:
- `*.response.json` — full HTTP response body
- `*.headers.txt`   — HTTP headers
- `*.draft.md`      — extracted draft content (for CLO review)

## Next step

Share this folder path with Ajay (CLO) for legal review:
`/Users/abhinavanand/Files/Lawie/scripts/test-templates/results/20260504-003048`
