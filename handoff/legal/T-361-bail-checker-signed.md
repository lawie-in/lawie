# T-361: bail checker data and lines (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST.

| AC | Ruling and exact text |
|---|---|
| 1 | "BNS 318(4)" and "318(4)" resolve to the same row. The code prefix ("BNS", "BNS ", "BNS-") is stripped before lookup. Both 318(4) (cheating, up to 7 years) and 316(2) (criminal breach of trust, up to 5 years) are offences. |
| 2 | BNS 303(2), punishment line: `Up to 3 years, or fine, or both. On a second or later conviction: rigorous imprisonment of 1 to 5 years, and fine.` Show the first-offence maximum (3 years) as the figure used for ranking. Optional note (show only with the line above): `Where the property is worth less than ₹5,000 and it is a first conviction, community service may be ordered if the property is returned or its value restored.` |
| 3 | "Most serious" ranks by maximum punishment: death > life imprisonment > years (larger first). For the test, 103(1) > 318(4) > 316(2). |
| 4 | A bare number with no code gets: `Add the code before the number, for example BNS 351 or IPC 351.` |

Do not compute or state bailability from the punishment. That comes from the T-289 First Schedule values only.

## Addendum 1: verify-flagged rows (T-371), 13 Oct 2026

The `verify` notes in `bns-offences.json` are my working notes on the signed T-277 table. They do not mean a row is unverified: most say an attribute is null because the First Schedule gives no single answer. The ruling:

| Case | What the checker shows |
|---|---|
| Section in the signed table, attribute has a value | The value. No Gazette line and no verify text, even when the row carries a `verify` note. |
| Section in the signed table, attribute is `null` | Exactly `Depends on the sub-section or the offence — see the BNSS First Schedule.` in place of that value. Never a guess, never "No". |
| Section not in the table, or its mapping row is one of the 4 unverified or null-target rows (T-360) | Exactly `Not verified — check the Gazette` |
| Raw `verify` text | Never shown to a user. |

The "most serious" ranking (AC 3) uses `max_years` only. If a charged section has `max_years: null`, the ranking leaves it out and shows nothing in its place. It is not ranked as the lowest.
