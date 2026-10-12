# T-240: catalogue categories in code (signed)

Signed: Ajay (CLO), 12 Oct 2026 IST. Build checked: `5a838d3` on `fix/t-240-catalogue-categories`.

| Check | Result |
|---|---|
| `catalogue/categories.ts`: 26 display names | Byte-exact and in the same order as T-239's 26 categories |
| `catalogue/base.ts`: the six re-filings in T-240 AC4 | As signed: `legal_notice_s138` → Cheque bounce / NI Act; `rent_agreement` → Rent control and tenancy; `posh_complaint` → Service and labour; `curative_petition` → Writs and constitutional; `review_petition` (O.47) → Civil: appeals, revision, review, execution; all bail ids → Criminal: bail and custody |
| `mou` | Contracts and agreements, as ruled |
| Behaviour `category` | Unchanged. Re-keying the behaviour gates needs its own ticket and a new sign-off |

Mark: **Approved.**
