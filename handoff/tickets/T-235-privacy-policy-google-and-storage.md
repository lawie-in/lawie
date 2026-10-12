# T-235 — Privacy policy covers Google sign-in data and where data is stored

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Ajay (text, signs), Arjun (where data is stored, facts), Lead (build), Anushka (verdict) |
| Mode           | Text first (Ajay), then build, small fix (web) |
| Status         | Ajay signed the text (handoff/legal/T-235-privacy-policy-signed.md, acfa09b). Small fix, web. Next for mahak after T-194. Condition: before go-live, Arjun confirms a manual erase can be run (Mongo user, documents, ledger, FactDiff, Redis keys); otherwise this is a blocker |
| Size           | Ajay S. Build XS |
| Depends on     | T-220 (email provider line, Ajay's T-225 AC2) |
| Gate           | Before v1 go-live (T-403) |
| Branch         | fix/t-235-privacy-policy |
| Legal sign-off | Ajay signs the text |
| Created        | 2026-10-11 |
| Source         | Ajay, T-234 consent ruling, 11 Oct 2026 |

## Problem

`/privacy` says nothing about the data Lawie gets from Google sign-in, or about where user data is stored. The new consent line points users to it.

## Acceptance criteria

1. Arjun states the facts: what Google sign-in gives us, and where data and backups are stored (region, providers).
2. Ajay writes and signs the new sections, plus the email provider line from T-225.
3. The lead updates `/privacy` and, if Ajay says so, bumps `termsVersion`.

## Facts from Arjun (read-only check of the repo, 12 Oct 2026)

- **Google sign-in:**
  - Scopes are `email` and `profile`.
  - We store email, name and `googleId`. We don't store the picture, and Google's tokens are not kept.
  - Our own tokens go back to the browser in the redirect URL, then into localStorage.
- **Passwords:** bcrypt, cost 12. Reset tokens are stored only as a SHA-256 hash. The user record also holds:
  - phone, Bar Council id, enrolment number, state, practice areas, experience;
  - plan and credits, referral.
- **Sessions:** Redis keeps email, name, role, plan, IP and user agent for 24h (refresh 7d). Mongo keeps hashes, IP and user agent, deleted after about 24h.
- **Documents:**
  - Encrypted (AES-256-GCM): drafts and briefs.
  - Plain text: `formInputs` (party names, FIR, facts) and the Fact Ledger (T-115, T-187).
  - FactDiff is kept 90 days. There is no limit on anything else.
  - Delete path: none. There is no document delete and no account close (T-115).
- **Where it's stored:**
  - MongoDB Atlas M0: region unknown.
  - Redis Cloud: said to be ap-south-1, not confirmed.
  - One AWS EC2 host in ap-south-1.
  - SES in ap-south-1 (not sending yet).
  - No file storage.
- **Third parties:**
  - Anthropic gets prompts, the description, the brief, form data and the account name. Zero retention is unknown (T-118 Records item, Arjun's).
  - Helicone (US) received draft text until 9 Oct. It can't be deleted.
  - Sentry: auth is scrubbed. Gateway and drafting send headers including the user's email and name. Billing, email-worker and web have no scrub. Region unknown.
  - Razorpay gets userId and email in its notes.
  - Google gets the visitor's IP through the Google Fonts fetch in LogoSplash.
  - No analytics.
- **Backups:** none (Atlas M0). Data has been lost once already.
- **Logs:** pm2 files on EC2, with no rotation and no retention set. auth is redacted. email-worker logs recipient addresses.
- **Browser storage:**
  - localStorage: tokens (the JWT carries email and name) and section-finder state.
  - sessionStorage: referral code, splash flag.
  - No first-party cookies.

### Where today's /privacy page is wrong

It must change before go-live:
1. It says sign-in uses cookies. Sign-in uses localStorage.
2. It says case details are encrypted at rest. `formInputs` and the Fact Ledger are plain text.
3. It describes deleting documents and accounts. No delete path exists.
4. It doesn't name Sentry or Redis Cloud, or say that data is processed outside India (Anthropic, probably Sentry).
5. It must not promise backups.

### For the founder to confirm (morning report)

- Atlas region.
- Redis region.
- Sentry region.
- Whether we have an Anthropic zero-retention agreement.
- Whether we move off M0 for backups before v1.
- pm2 log rotation and retention.

## Build notes (Priya, 12 Oct 2026)

- Apply Ajay's signed text word for word on `/privacy`.
- Bump `termsVersion` and send the transactional "policy changed" email. That waits for T-220 sending. Coordinate the version constant with shashank's T-234, which records `termsVersion`.
- The founder's 6 open items don't block this: the fallback wording is true either way.
- For the morning report: the Grievance Officer's name for §11.

## Note (Priya, 12 Oct 2026)

The sign-up source line in the privacy policy (§1 bullet, §6 v3, Ajay signed 6c4f4cd) ships with T-242 (kunal), not under this ticket.
