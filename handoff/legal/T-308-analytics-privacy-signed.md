# T-308: Google Analytics in the Privacy Policy (signed, 12 Oct 2026 IST)

Ajay (CLO). Facts from Arjun's T-306 design: GA4 property loads only on the public marketing routes (allowlist), never on `/auth/*`, `/login`, `/register`, `/dashboard/*`, `/admin/*`; the page view carries the page address without query or hash; gtag sets `_ga` cookies. Apply to `apps/web/src/app/(marketing)/privacy/page.tsx` byte for byte, **only together with or after T-306**. Until T-306 merges, GA runs on every page and this text would be false.

## 1. §6 heading

`6. Browser Storage and Cookies` (replaces `6. Browser Storage (no cookies)`; same in the contents list)

## 2. §6 body (replaces the whole paragraph)

```text
To keep you signed in, we store a sign-in token in your browser's local storage; it carries your name and email. We also store your referral code and small display settings in your browser. Signing out removes the sign-in token. On our public pages, the ones you can open without signing in, Google Analytics sets cookies whose names start with _ga so we can count visits. Google Analytics does not run on the sign-in pages or anywhere inside your account. Lawie sets no other cookies. Clearing your browser's site data removes all of it.
```

## 3. §5 provider row "Google" (replaces `receives` and `why`)

- receives: `Your name, email and Google account ID (if you use Google sign-in); your IP address when our pages load Google Fonts; on our public pages only, your IP address, browser details and the address of the page you visit (Google Analytics)`
- why: `Sign-in; fonts; counting visits to public pages`
- where: unchanged

SHA-256 of the §2 block (between the fences, final newline included): `587f979452fc09dd220c4445e10ded37159cb9b6ced20eb5d8a883936d0f6a69`

## Conditions and open items

1. Arjun confirms before merge: GA4 "Google signals" and ads personalisation are off for the property, and no user id or email is ever sent to GA. If either is on, these lines are incomplete: tell me.
2. Recommendation, not part of the signed text (Priya / Arjun / founder decide): load GA only after the visitor agrees, by a short consent line on the public pages. Counting visits is not needed to run the service, and under the DPDP Act consent is the safer basis. If a consent step is built, I will sign its words and adjust §6.
3. If GA is ever added to a signed-in page, §6 and the provider row must change first.

## Addendum 1 (12 Oct 2026 IST): fonts self-hosted (T-310 AC6)

Arjun: all fonts are self-hosted once T-310 lands; no page calls Google Fonts. When that ships, the §5 Google row becomes:

- receives: `Your name, email and Google account ID (if you use Google sign-in); on our public pages only, and only if you accept analytics, your IP address, browser details and the address of the page you visit (Google Analytics)`
- why: `Sign-in; counting visits to public pages`

Until T-310 ships, keep the row in §3 above (fonts still load from Google then).
