# T-572: Wire the signed AJ-522 Hindi strings

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (before main; not blocking Anushka's English run) |
| Owner  | Kunal (build, after T-571), Ajay (byte-check) |
| Mode   | Small fix (web only) |
| Status | To do. Raised by Ajay's T-522 approval (AJ-522-BC) and Vishal, 22 Oct 2026. Priya |
| Source | `handoff/legal/T-511-copy-rulings-ajay.md` (AJ-522-S1 to S14 and the M-rows with Hindi); Ajay's note on T-522 |

## Problem
T-522 shipped the English signed strings. The signed Hindi for the same strings (verify page, verify mail landing, login/sign-up messages, the verify prompt and dialogs) is not wired: the app shows English for Hindi users.

## Acceptance criteria
1. Every AJ-522 string that has signed Hindi in Ajay's files shows in Hindi when the language is Hindi: `nl-copy.ts` (AUTH_COPY, VERIFY_COPY), login page, `VerifyEmailPrompt`, verify landing, the sign-up check-your-email page.
2. Byte for byte from the signed text; no machine translation, no paraphrase. A string with no signed Hindi stays English and is listed for Ajay.
3. Tests that the Hindi renders and the English is unchanged.
4. Ajay byte-checks.

## Files
Claimed by Priya when Kunal starts (after T-571). Check against Tanvi's T-565 wave 2b first (nl-copy, VerifyEmailPrompt).
