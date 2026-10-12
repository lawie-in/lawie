# T-343: privacy re-acceptance prompt (signed)

Signed: Ajay (CLO), 12 Oct 2026 IST.

## 1. Text (exact)

| Id | Element | Text |
|---|---|---|
| P1 | Title | `We have updated our Privacy Policy` |
| P2 | Body line 1 | `{summary}` (the signed one-line summary for that version; see below) |
| P3 | Body line 2 | `Please read the updated policy. You need to accept it to create new drafts or make payments.` |
| P4 | Link | `Read the Privacy Policy` → `/privacy` |
| P5 | Primary button | `Accept and continue` |
| P6 | Secondary button | `Not now` |
| P7 | Shown in place of a blocked action after "Not now" | `Accept the updated Privacy Policy to continue.` |

`{summary}` comes from a per-version table in code, keyed by privacyVersion. Each entry is legal content and I sign it with the policy change it belongs to. If a version has no signed summary, the prompt does not show. Do not fall back to generic text.

## 2. Dismiss and decline

- "Not now" is allowed. Nobody is signed out, and nothing is deleted.
- Until the user accepts, these stay open: viewing and downloading existing drafts, account settings, data export, account deletion and contacting support. Only new drafts (any generate route) and payments are blocked, server-side, with P7.
- There is no separate "Decline" button. "Not now" is the decline, and the user can delete the account at any time.

## 3. When it shows

- Once after each sign-in, and again whenever the user tries a blocked action, until they accept. It does not show on every page.
- Server check: the stored privacyVersion is not equal to CURRENT_PRIVACY_VERSION, and that version has a signed summary.

## 4. What is recorded

- On acceptance: `privacyVersion`, `privacyAcceptedAt`, and `privacyAcceptedVia: 'signup' | 'reaccept'`.
- Keep an append-only history of `{version, acceptedAt, via}` per user, so we can show which version was accepted and when. No IP address and no user agent.
- "Not now" is not recorded.

## 5. Tests

- A version without a signed summary: the prompt does not show.
- "Not now": generate and payment routes return P7; drafts can still be viewed and downloaded, and data export and account deletion still work.
- Accept: history gets one row, and the prompt stops.
- Sign-up records `via: 'signup'` with no prompt.

## Addendum 1 (12 Oct 2026 IST): design rulings, first summary, accounts with no record

| Item | Ruling |
|---|---|
| P8, when saving the acceptance fails | `Could not save your acceptance. Please try again.` |
| P9, announced once after a successful accept (polite live region) | `Privacy Policy accepted.` |
| P7 box | It carries its own Accept button (P5) with the P4 link beside it. |
| P5 and P6 styling | Equal size and weight, as in T-310. The table order is not emphasis. |
| P4 link | Opens in the same tab. |
| Auto-renewals | Razorpay-started renewals are not blocked. Only user-started payments and new drafts get P7. |
| Server block | Applies only when the prompt can show (the current version has a signed summary). Never block without the prompt. |

Signed `{summary}` for privacyVersion `2026-10-12b`:

```text
We now explain how Google Analytics works on our public pages, and that we keep the campaign link a new account came from.
```

Accounts with a privacyVersion but no acceptance record (linked Google accounts, returning users who never accepted): write no history row for them and invent no acceptance. They see the prompt like anyone else, and their acceptance is recorded with `via: 'reaccept'`.
