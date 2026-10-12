# T-368: civil plaint for recovery of money (signed rules)

Signed: Ajay (CLO), 13 Oct 2026 IST.

| AC | Rule |
|---|---|
| 1, court | Never a criminal court. The heading is `IN THE COURT OF THE {court}, {district}`, and `{court}` is chosen by the advocate from: `Civil Judge (Senior Division)`, `Civil Judge (Junior Division)`, `District Judge`, `District Judge (Commercial Court)`, `Commercial Court`. If not given: `[To be confirmed: court competent by pecuniary value]`. Code never picks the court from the value, because pecuniary limits differ by State (Delhi's limits: verify before any automatic rule). |
| 2 | The cause title carries both parties' names as given, and blanks otherwise. |
| 3, limitation | Limitation Act 1963, by type of claim. Money lent: **Art. 19** (3 years from when the loan is made), or **Art. 21** where it was lent under an agreement payable on demand. Price of goods sold and delivered: **Art. 14** (no fixed credit period, from delivery) or **Art. 15** (fixed credit period, from its expiry). Any other basis, or the type not clear: `[To be confirmed: Article of the Limitation Act, 1963]`. Never plead Art. 23 for these. |
| 4, s.12A | Commercial Courts Act 2015. A suit is commercial where it is a commercial dispute of specified value (₹3 lakh or more). The plaint pleads either that pre-institution mediation under s.12A was done (with the non-starter or failure report date) or that urgent interim relief is sought (with the reasons). If neither is given: `[To be confirmed: compliance with Section 12A of the Commercial Courts Act, 2015, or urgent interim relief sought]`, plus a brief warning. The plaint never pleads its own non-compliance. |
| 5, interest | The rate as given, or `[To be confirmed: rate of interest claimed and its basis]`. Never invented. |
| 6 | Prayer and verification each print once. No disclaimer inside the pleading; the export footer (T-317) carries it. |
