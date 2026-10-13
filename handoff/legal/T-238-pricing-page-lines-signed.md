# T-238: pricing page lines (signed, 12 Oct 2026 IST)

Ajay (CLO). This file is final for the lines below and replaces the earlier wording in `marketing-s1-claims-signed.md` (row "Criminal drafts…" and the Ink row) and in the marketing calendar and strategy notes. Where they differ, this file wins.

| Line | Final wording | Replaces |
|---|---|---|
| Free plan line (sanhitas) | **Criminal drafts use BNS, BNSS and BSA section numbers** | "Criminal drafts cite BNS, BNSS and BSA" (S1 row, 11 Oct) and "use BNS, BNSS and BSA" (the page before T-238) |
| FAQ "What is Ink?" | Ink is Lawie's credit unit. Most documents use 2 Ink; **short documents**, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged. The Free plan gives you 5 Ink (lifetime). Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime. | "short ones" |
| Pack note (about line 196) | Most documents use 2 Ink, **short documents** 1. Buy extra packs anytime. | "Less than ₹16 per document on Solo" |
| "Every line of the draft is yours to change" | Approved | "Court formatting" |
| Badges "Most Popular", "POPULAR", "BEST VALUE" | Removed. "Lowest price per Ink of the 3 packs" may return only if it fits at 375 px and 1280 px and the three pack prices still make it true | |

## Why "use … section numbers" is final

I first wrote "cite" on 11 Oct and changed my mind on 12 Oct. "Cite" promises that every criminal draft carries those Acts; for a matter under the old law the draft still cites IPC/CrPC. "Use BNS, BNSS and BSA section numbers" says only what the packs do for new-law matters and makes no claim about old-law matters. Still never: "updated for the new criminal laws", "validated", or any claim about matters before 1 July 2024.

## For the marketing notes

`calendar-week1.md` (line 32 and every "cite BNS, BNSS and BSA" line) and `strategy.md` (line 23) say 'Never "use"'. They are out of date. Meera or Madhuri update them to this wording; until then this file wins. "Short ones" becomes "short documents" wherever the Ink line appears.

## Marks

| Item | Mark |
|---|---|
| Wording above | Approved |
| Vikram's row 2 | Wording only, no price change: covered |

## Addendum (T-372, merged 587ce69), 13 Oct 2026: the "cost before you generate" line

Line, conditional: `You see the Ink cost before you generate a draft.`

It may go public only when all three hold. Kunal confirms each with a screenshot from develop:

1. Every path that charges Ink (new draft, a brief with no rule pack, regenerate, any add-section or redo action) shows "Uses N Ink" before the charge.
2. The N shown is the N charged. Both read `costForTemplate`, and a test pins that the two are equal.
3. When the cost is unknown, the draft does not start without it. Today the build shows nothing when the cost is unknown; that case must either block or show the cost. Otherwise the line is false.

Until then, the T-238 FAQ line stands as it is. "Uses N Ink" in the app is approved as built.
