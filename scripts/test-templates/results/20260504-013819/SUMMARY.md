# Lawie · Template Generation Test Run

**Timestamp:** 20260504-013819  
**Endpoint:** `http://localhost:4000/api/documents/generate-from-template`  
**Tested:** 6 templates  

| # | Template | HTTP | Latency | Output Tokens | Notes |
|---|----------|------|---------|---------------|-------|
| 1 | `bail_regular` | 000 | 73ms | n/a | see 01-bail_regular.response.json |
| 2 | `bail_anticipatory` | 000 | 87ms | n/a | see 02-bail_anticipatory.response.json |
| 3 | `legal_notice_s80` | 000 | 70ms | n/a | see 03-legal_notice_s80.response.json |
| 4 | `legal_notice_s138` | 000 | 61ms | n/a | see 04-legal_notice_s138.response.json |
| 5 | `rent_agreement` | 000 | 182ms | n/a | see 05-rent_agreement.response.json |
| 6 | `consumer_complaint` | 000 | 62ms | n/a | see 06-consumer_complaint.response.json |

---

**Result:** 0 passed, 6 failed (of 6)

## Files in this run

Each template produced 3 files in this folder:
- `*.response.json` — full HTTP response body
- `*.headers.txt`   — HTTP headers
- `*.draft.md`      — extracted draft content (for CLO review)

## Next step

Share this folder path with Ajay (CLO) for legal review:
`/Users/abhinavanand/Files/Lawie/scripts/test-templates/results/20260504-013819`
