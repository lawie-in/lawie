# T-310: analytics consent notice strings (signed, 12 Oct 2026 IST)

Ajay (CLO). For `handoff/design/T-310-consent-notice.md` §5 (Rajesh, 0289e14). Ship byte for byte; no other words in the card.

| Id | Exact string |
|---|---|
| S1 | `Analytics cookies` |
| S2 | `With your permission, Google Analytics counts visits to our public pages. It sets cookies and sends your IP address, browser details and the page address to Google. It loads only if you accept.` |
| S3 | `Privacy Policy` |
| S4 | `Your current choice: Accepted.` / `Your current choice: Declined.` |
| S5 | `Decline` |
| S6 | `Accept` |
| S7 | `Choice saved. Analytics is on.` |
| S8 | `Choice saved. Analytics is off.` |
| S9 | `Cookie settings` |
| S10 | `Change cookie settings` |

Design decisions D1–D6 approved as legal: equal buttons, Decline first, no pre-selection, no close button that looks like consent, nothing loads without an answer.

## Flags

- **R2 (Google Fonts before consent).** Not a consent problem: fonts are needed to show the page, and the Privacy Policy already says Google receives the IP when pages load Google Fonts. Still, my recommendation to Arjun is to self-host the font so nothing goes to Google before an answer. No notice text depends on it, and S2 does not claim otherwise.
- **R3.** Covered by T-308: §6 becomes "Browser Storage and Cookies"; S3 keeps `#browser-storage`.
- **R1.** Accept for v1 (Priya).

## §6 text once T-310 ships (replaces the T-308 §6 block)

Ship this instead of the T-308 §6 block when T-310 is live. If T-308 ships first, ship the T-308 block, then this one with T-310.

```text
To keep you signed in, we store a sign-in token in your browser's local storage; it carries your name and email. We also store your referral code and small display settings in your browser. Signing out removes the sign-in token. On our public pages, the ones you can open without signing in, Google Analytics loads only if you accept it in the cookie notice; it then sets cookies whose names start with _ga so we can count visits. It does not run on the sign-in pages or anywhere inside your account. We keep a record of your choice (a random number, the choice, the version of the notice and the time, but not your name, email or IP address) for 12 months, and ask again after 12 months or when the notice changes. You can change your choice at any time with Cookie settings at the bottom of every public page. Lawie sets no other cookies. Clearing your browser's site data removes what is stored in your browser.
```

SHA-256 of the block above (between the fences, final newline included): `ecd2b0be2d751d0e194c7fe5f81cb8edc3342aa2a5f28eb39d04d5976f66a4be`
