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

## Arjun (12 Oct 2026): UTM tags off the Google URL (Ajay's condition 3), option (a)

Store server-side; nothing tag-related goes in the state.
1. On `/google`: `SET oauth:utm:<sha256(challenge)> <json> EX 600` (same key shape as T-306's `oauth:code:`). Only `utm_source`, `utm_medium`, `utm_campaign` (allowlist), each trimmed to 100 characters; anything else is dropped. The state carries no `u` field at all.
2. In the passport callback, new-user branch only: read and delete atomically (`MULTI GET+DEL`, as in T-299). Existing users: still delete the key, never read it into anything.
3. **Fail open for tags only.** A Redis error on store or read means the sign-up goes ahead with no tags and a fixed log line (no values). Login never waits on or fails for UTM.
4. Tests: the URL to Google contains no tag value (assert on the redirect `Location`); a new user gets the tags; an existing user's record is unchanged and the key is gone; key expires at 10 min; Redis down → sign-up succeeds, no tags.

## Note (Priya, 12 Oct 2026)

Ajay condition 5 on T-242: deleting an account must remove the whole User document, including `signupSource` (UTM tags and time). No delete path exists today.
