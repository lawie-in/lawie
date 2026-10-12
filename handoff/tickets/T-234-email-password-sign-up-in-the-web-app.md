# T-234 — Email and password sign-up and sign-in in the web app

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Rajesh (design review of the form), Madhuri (copy), Lead (build), Arjun (heads-up), Anushka (verdict) |
| Mode           | Design check first, then build, full chain (web, auth) |
| Status         | Building: kunal (12 Oct 2026). Moved from shashank's queue to the web lane |
| Size           | S to M |
| Depends on     | T-208 (validation messages, merged), T-209 (merged), T-210 (merged). T-221 and T-223 ship with it for v1 |
| Gate           | Before v1 go-live (T-403) |
| Branch         | feature/t-234-password-sign-up |
| Legal sign-off | Not needed for the form. Terms and privacy consent line as today for Google |
| Created        | 2026-10-11 |
| Source         | Founder, 11 Oct 2026 (in the Priya session and on the board): email and password sign-up and sign-in ship in this release, alongside Google. This replaces the 17 May 2026 'Google only for Phase 1' decision. |

## Problem

`apps/web/src/app/(auth)/login/page.tsx` hides the email and password form behind `ENABLE_PASSWORD_LOGIN = false`. The auth API for register and login already works (T-208, T-209, T-210).

## Acceptance criteria

1. The login page offers email and password sign-in and sign-up next to Google, as Rajesh's design check says.
2. Sign-up shows the real validation messages (T-208) and asks for the same consent as Google sign-up.
3. "Forgot password?" goes to T-221's page (ships together, or the link stays hidden until T-221 merges).
4. A new password user gets the same sign-up bonus and referral handling as a Google user; nothing is granted twice.
5. Manual browser check at 375 and 1280 px in the report.

## Design (Rajesh, 11 Oct 2026)

Verdict: reuse the hidden form in `login/page.tsx`. Its structure is fine, but it needs the changes below before it ships. All copy in quotes is a draft for Madhuri to finalise. Written spec only, no new mocks; the T-221 artifact (https://claude.ai/artifact/JqpTng8PhBncn3DcHQC8gf) covers `/forgot-password`.

### Layout (one column, the same at both sizes)

Card order: logo, heading and subline, mode switch, referral box (Create account only), "Continue with Google", divider "or with email", fields, error summary, submit button, consent line, switch link.

| | 375 px | 1280 px |
| --- | --- | --- |
| Card | Full width with 16 px side gutter (`px-4`), padding `p-5` | Centred, `max-w-md` (448 px), padding `p-8` |
| Logo | `h-12`, `mb-6` (today `h-28` pushes the form below the fold) | `h-14`, `mb-8` |
| Inputs and buttons | 48 px tall, `text-base` (16 px) | Same |
| Fold check (375 x 667, sign in) | Submit button sits at about 520 px, above the fold | n/a |

- Remove the amber notice banner ("Sign in with Google to continue."). It contradicts the new form.
- No side hero or image at 1280: keeps the page light on 4G.

### Switching between sign in and sign up

- A segmented control at the top of the card: "Sign in" | "Create account". Full width, 44 px tall, `role="tablist"`.
- A text link at the bottom does the same: "New to Lawie? Create an account" / "Already have an account? Sign in". It replaces "New advocate? Sign in with Google to create your account."
- The mode lives in the URL (`/login?mode=signup`), so marketing CTAs can link straight to Create account and Back works.
- Switching keeps the email, clears the password and any errors, and moves focus to the first empty field.
- Heading per mode: "Sign in to Lawie" / "Create your Lawie account".

| Form field | Sign in | Create account | `autoComplete` | Note |
| --- | --- | --- | --- | --- |
| Full name | no | yes (the API requires `name`) | `name` | Devanagari input falls back to the system font (Noto on Android). That is fine |
| Email | yes | yes | `email` | `type="email"`, no placeholder (drop "you@legalfirm.com", most users are on Gmail) |
| Password | yes | yes | `current-password` / `new-password` | Show/hide toggle needs a 44 x 44 hit area. No confirm-password field: the toggle covers it |
| Password rules | no | yes | n/a | A live checklist under the field that mirrors the API: 8+ characters, one uppercase, one lowercase, one number. Each item ticks as it is met. Neutral styling, not red |

### Where validation messages show

- Client side, check only empty fields and email format, on blur and on submit. Do not disable the submit button for invalid input.
- The 422 response from the server is a single `message` string joined with "; " and has no field names. Show it in an error summary box directly above the submit button: `role="alert"`, `bg-red-50`, `text-red-700`, AlertTriangle icon. Split the string on "; " into a bullet list and move focus to the box.
- Also mark the field: when a message starts with Email, Password/Must contain, or Name, set `aria-invalid` and a red border on that field. It is cheap string matching. Cleaner long term: the API returns `errors: [{ field, message }]` (lead or Arjun to decide, not blocking).

| Response | What shows |
| --- | --- |
| 422 | The summary with the API's messages as a list |
| 409 (email exists) | Summary: the API message plus a "Sign in instead" link, which switches mode and keeps the email |
| 401 (sign in) | "Invalid email or password", plus a second line: "Signed up with Google? Use Continue with Google above." Clear the password and keep the email |
| 403 | The API message as is |
| 429, 5xx, network error | "Couldn't reach Lawie. Check your connection and try again." Inputs keep their values |
| In flight | Spinner on the button with "Signing in…" / "Creating account…". The button is disabled only while the request runs |

- Error text uses `red-700` (6.5:1 on white). The referral box today uses `text-red-500` at 12 px, which is 3.8:1 and fails AA. Fix it in the same change.

### Consent line

- One line in both modes, directly under the submit button. It covers Google and email, because Google sign-in from either tab can create an account. Draft: "By continuing, you agree to Lawie's Terms and Privacy Policy." Both are underlined links that open in a new tab, so typed input is kept.
- Style: `text-sm text-slate-600`. Today the footer links use `slate-400`, which is 2.6:1 and fails AA.
- No checkbox, the same as the Google path.
- UX risk: the page has no consent line today, not even for Google. It only has the footer "Terms · Privacy" links, so "consent as today for Google" means nothing at the moment. This line is new for both paths. Priya to decide whether Ajay should look at the wording.

### Forgot password link

- Sign in mode only. Keep it right-aligned in the password label row.
- Make it a `<Link href="/forgot-password">` (T-221 screen F1). Do not put the email in the URL, because it would land in logs (T-210).
- `text-sm`, `text-lawie-700`, with a 44 px tall hit area. Today it is a 12 px `<span>`, too small to tap.
- Hidden until T-221 merges (AC3). The dead span must not ship.

### Other fixes to the reused form

- Referral modal: the CTA "Claim offer & continue with Google" forces Google. Change it to "Claim offer". It closes the modal and returns to the form. The code then goes with Google (as today) or in the `referralCode` field of the register request.
- Input borders: `slate-300` is 1.5:1, below the 3:1 that WCAG 1.4.11 asks of field boundaries. Use `slate-500`.
- Drop the "••••••••" placeholder. The labels are enough.
- Replace the `alert()` in `handleEmailLogin` (build).

### Screens for the lead's report (375 and 1280)

S1 sign in, S2 create account, S3 422 summary, S4 409, S5 401, S6 in flight, S7 network error, S8 referral applied in Create account.

### Open for Priya

1. Default mode with no `?mode=`: I suggest Sign in, with every marketing CTA linking to `?mode=signup`.
2. The referral box shows only in Create account. A new user who uses Google from the Sign in tab gets no box. Is that OK?
3. Consent wording: does it need Ajay?
4. T-223 option B (verify later) means this flow has no "check your email" step. Please confirm.

## References

- T-208, T-209, T-210, T-221, T-222, T-223

## Priya decisions (11 Oct 2026, night)

1. Default mode: Sign in. "Create account" is one tap away at the top.
2. The referral box shows only in Create account. The referral modal's call to action offers both Google and email, not Google only.
3. Consent line: new for both paths. Ajay writes or approves the exact wording before build.
4. T-223 option B stands: no verify step at sign-up. Verification comes before the second draft (T-223).
5. In scope, because it's the same page: AA contrast for the referral error text, footer links and input borders; tap targets of at least 44 px for Forgot password and the eye toggle.
6. Forgot password stays hidden until T-221 merges, as Rajesh says.


## Ajay consent line (11 Oct 2026)

Checked against the live pages in `apps/web`: `/terms` ("Terms of Service", last updated 1 June 2026) and `/privacy` ("Privacy Policy", last updated 1 June 2026, DPDP Act, 2023).

Exact line, the same in both modes (Sign in and Create account), directly under the submit button, so it also covers "Continue with Google" from either tab:

> By continuing, you agree to Lawie's [Terms of Service](/terms) and confirm you have read our [Privacy Policy](/privacy).

- Link text must match the page titles exactly: "Terms of Service" and "Privacy Policy" (not "Terms" / "Privacy"). Both open in a new tab (`target="_blank" rel="noopener"`).
- "Agree to" the Terms only. Do not write "agree to the Privacy Policy": it is a notice, not a contract, and DPDP consent must not be bundled into contract acceptance (DPDP Act s.6(1)).
- Wording is final. Madhuri may not change it without my sign-off.

### Tick box or "By continuing"

"By continuing" is enough. No checkbox. Approved.

- Terms: a sign-in-wrap line next to the button, with visible links, is a valid electronic acceptance (IT Act 2000 s.10A; Indian Contract Act s.10). Conditions: the line is visible without scrolling at 375 x 667, sits directly under the button, `text-sm text-slate-600` or darker (AA), and is never hidden behind a toggle.
- DPDP basis: account data (name, email, password hash, Google profile) and the case details a user types in are given voluntarily for the purpose of using the Service. That is a legitimate use under DPDP Act s.7(a), so no separate s.6 consent box is needed. The Privacy Policy is the s.5 notice.
- A tick box becomes required only if we add marketing emails or any use beyond running the Service. Then it is a separate, optional, unticked box. Not in v1.

### Conditions for build (Blocker if missing)

1. Record acceptance on the user at account creation, for both email and Google: `termsAcceptedAt` (server time), `termsVersion` (`2026-06-01`), `acceptedVia` (`email` | `google`). Without it we cannot prove acceptance. Lead / Arjun own the field names.
2. Existing Google users signed up with no consent line. Showing the line in Sign in mode covers them from their next sign-in; record `termsAcceptedAt` on that sign-in if it is empty.
3. Do not render the line anywhere except under the submit button; do not pre-tick anything.

### Gaps in the live pages (Risk, not blocking T-234)

- `/privacy` s.1 does not say we receive name, email and profile picture from Google Sign-In, or that we store a password (hashed). Add one sentence before v1 go-live (T-403). I will draft it on request.
- `/privacy` s.3 does not state where data is stored (India residency). Confirm the region with Arjun before v1.
- `/terms` has no eligibility clause (for practising advocates only); `/privacy` s.8 implies it. Separate ticket, not this one.
- The "Legal sign-off" row in this ticket's header ("as today for Google") is now stale. Priya to update it; I have not edited the header.

Status: **Approved** with the three build conditions above.

## Priya (11 Oct 2026, night): added to the acceptance criteria from Ajay's consent ruling

6. Ajay's consent line goes under submit in both tabs, word for word.
7. Auth records `termsAcceptedAt`, `termsVersion` (2026-06-01) and `acceptedVia` (google or password) on sign-up, and for an existing Google user at their next sign-in. This touches `apps/auth` (User model and sign-in paths): the lead claims those files.

## Added (Priya, 12 Oct 2026, from Meera)

- `/login?mode=signup` opens the sign-up form. UTM sign-up links depend on it; today it lands on sign-in.
