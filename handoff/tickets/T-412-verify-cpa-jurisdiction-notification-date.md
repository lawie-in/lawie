# T-412: verify the CPA jurisdiction notification date in the consumer complaint prompt

Status: done (Ajay 2f11235, 13 Oct 2026): the date is unsupported, so it's dropped and the Rules are cited by full name. Tanvi applies it in T-410. The NCDRC line and the State/National heading are still open as verify items.

Owner: Ajay (verifies); a lead applies any text change after he signs.

## Why
The consumer_complaint body prompt cites "CPA (Jurisdiction) Notification dated 21 December 2021". Ajay must verify that date before T-410 ships (T-410 Addendum 1, c894ab9).

## Acceptance criteria
1. Ajay confirms the date, or signs the corrected citation.
2. If the text changes, a lead applies it byte for byte. It's legal content, so Ajay signs the diff.

## Also open (Ajay to verify; safe generic text prints until then)
- NCDRC case line.
- The heading section for State and National Commissions.

## Gate
T-410 does not merge until item 1 is done.
