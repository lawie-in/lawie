# T-242 — Record where each sign-up came from (UTM and source)

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Meera (the list of sources). Ajay (privacy-policy line, T-235). Anushka (verdict) |
| Mode           | Full chain (auth and web) |
| Status         | Building: kunal (12 Oct 2026). Ajay rules whether UTM may be kept before cookie consent; privacy line under T-235 |

## Acceptance criteria

1. The web app keeps `utm_source`, `utm_medium` and `utm_campaign` from the landing URL until sign-up, using first-party storage only.
2. On sign-up (Google or email), the user record stores the source fields and the time. No third-party tracker is added.
3. An admin can count sign-ups by source. A simple query or endpoint is enough.
4. No personal data goes into logs or Sentry (T-229 rules).
5. T-235: the privacy policy mentions that we keep the source.

## Added (Priya, 12 Oct 2026)

- A `?ref=CODE` link pre-fills the referral box on `/login` (today the code can only be typed in), so offer links work.
- Remove the unused `sessionStorage` `lawie_referral_code` write.
