# For Anushka's next run on develop

Priya collects each lead's "What a user can now do" text here after a merge into `develop_staging`. Anushka gets only this text, the address, the account state and the draft allowance (`.claude/docs/quality-gate.md`). It reaches `develop` when the founder merges `develop_staging`.

## T-208 (shashank, merged to develop_staging d305233, 11 Oct 2026)

- When I sign up with a mistyped email, a short or weak password, or leave my name, email or password out, I see what is wrong instead of "Internal Server Error".
- When I sign in without a password or with a bad email, I am told what is missing.
- If several things are wrong, I see all of them at once.
- Signing up and signing in with correct details works exactly as before.

## T-209 (shashank, merged to develop_staging d35ecee, 11 Oct 2026)

- I can sign up and be signed in straight away, or tap "Sign in" twice, without an error.
- I can be signed in on two tabs or devices at once; logging out of one leaves the other signed in.
- I am not signed out by this release; my existing session keeps working.

## T-197 (mahak, merged to develop_staging d74d063, 11 Oct 2026)

- When my draft is ready, I always see "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.", whether or not the checks flagged anything.
- When the checks flag something and the warning box shows, I see that line once, not twice.
- When I reopen a saved document, I see the same line above the text.
- It reads the same on my phone and on a desktop.
- The Word and PDF files I download have the same footers as before.

## T-210 (shashank, merged to develop_staging 37a1d32, 11 Oct 2026)

- I sign up and sign in exactly as before; nothing looks or works differently.
- My email, name, phone number and password are no longer kept in Lawie's server logs or in error reports, even when something goes wrong while I sign up or sign in.

