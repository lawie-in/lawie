# T-242: sign-up source (UTM) and ?ref pre-fill (signed)

Signed: Ajay (CLO), 12 Oct 2026 IST.

## Rulings

| Q | Ruling |
|---|---|
| UTM before the cookie card is answered | **Allowed, on conditions 1–6.** First-party, used only to record the sign-up source, and never shared. It is not analytics, so the T-310 consent is not the gate; the Privacy Policy notice (below) is. |
| `?ref=CODE` pre-fill on /login | **Allowed, no consent question.** It fills the box the visitor can see and edit. The referral code is already disclosed in §1 and §6. |

## Conditions

1. **sessionStorage only** (cleared when the tab closes). No localStorage, no cookie.
2. Keep only `utm_source`, `utm_medium` and `utm_campaign`, each trimmed to 100 characters. Drop any value containing `@` or a run of 7 or more digits, because it may be an email address or phone number.
3. Never send these values to Google Analytics or any third party, and never log them in Sentry or the server logs.
4. Copy them to the user record only when an account is created, with the time. Don't attach them to a waitlist row, a draft or any other record.
5. Keep them with the account, and delete them when the account is deleted.
6. Ship the Privacy Policy changes below in the same release, and bump `CURRENT_PRIVACY_VERSION` and "Last updated" to the release date.

## Privacy Policy changes (exact)

§1, new bullet straight after `Plan, Ink balance, payments and referrals.`:

```text
How you found us: if the link that brought you to Lawie carried campaign tags, the source, medium and campaign named in it, saved with your account when you sign up.
```

§6 v3. It replaces the T-310 §6 v2 block (SHA `ecd2b0be…66a4be`), changing one sentence only:

```text
To keep you signed in, we store a sign-in token in your browser's local storage; it carries your name and email. We also store your referral code, the campaign tags of the link that brought you to Lawie (until you close the tab), and small display settings in your browser. Signing out removes the sign-in token. On our public pages, the ones you can open without signing in, Google Analytics loads only if you accept it in the cookie notice; it then sets cookies whose names start with _ga so we can count visits. It does not run on the sign-in pages or anywhere inside your account. We keep a record of your choice (a random number, the choice, the version of the notice and the time, but not your name, email or IP address) for 12 months, and ask again after 12 months or when the notice changes. You can change your choice at any time with Cookie settings at the bottom of every public page. Lawie sets no other cookies. Clearing your browser's site data removes what is stored in your browser.
```

SHA-256 of the §6 v3 block (between the fences, final newline included): `a98bbde316ff1fd6e234beef685124be3cf70a48ca0bc2a8576df14909dc81e8`
