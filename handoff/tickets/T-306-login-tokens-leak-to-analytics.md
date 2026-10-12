# T-306 — Login tokens may be sent to Google Analytics (HIGH, security)

| Field  | Value |
| ------ | ----- |
| Phase  | 0 — Prep |
| Owner  | Arjun (fix design). Lead (build, web). Ajay heads-up (DPDP) |
| Mode   | Small fix (web), security |
| Status | Building: kunal (12 Oct 2026) |

After Google sign-in the app lands on `/auth/callback?accessToken=…`. Google Analytics records `page_location`, so the access token is likely being sent to Google in the page URL.

## Acceptance criteria

1. No token ever appears in a URL that analytics or logs can see: tokens move out of the query string (Arjun picks: fragment, POST, or an httpOnly cookie set by the server), or analytics is not loaded on `/auth/callback` and the URL is cleaned before any page view fires.
2. A test (or a recorded browser check) shows the analytics page view for the callback carries no token.
3. Arjun decides whether already-issued tokens must be rotated; if yes, the founder is told what to do.

## Arjun (12 Oct 2026): fix design

**Confirmed by reading, not by a browser.** `apps/auth/src/routes/oauth.routes.ts` (≈ l.74-78) redirects to `${FRONTEND_URL}/auth/callback?accessToken=…&refreshToken=…`. `apps/web/src/app/layout.tsx` loads `gtag.js` for property `G-ZSMN1GPPB5` on every page with `gtag('config', …)` and default settings, and GA4 sends `page_location` (the full URL, query included) with the automatic page view. So a Google sign-in very likely sends both the access and refresh token to Google Analytics. The same URL also sits in browser history and in any access log that records query strings. Also confirmed: `layout.tsx` is the root layout, so GA is on the authenticated pages too (see Ajay's note below).

**AC1 decision: no tokens in any URL. A one-time code, exchanged by POST.** (A fragment does not fix it: GA can read it from `location`, it stays in history, and it is awkward with Next's router. A cookie means moving the whole token model, which is a separate and larger change.)
1. Auth: on a successful Google callback, create a random code (32 bytes, base64url), store `oauth:code:<sha256(code)>` in Redis with the token pair and a **60 second** TTL, and redirect to `${FRONTEND_URL}/auth/callback?code=<code>`. No token in the redirect.
2. Auth: `POST /oauth/exchange` (public, behind `publicRateLimiter`, reached as `POST /api/auth/oauth/exchange`) takes `{ code }`, does an atomic `GETDEL` of that key, and returns `{ accessToken, refreshToken }` with `Cache-Control: no-store`. Unknown, expired or already used: `400 { error: 'invalid_code' }`, same body for all three. The code is single use and 60 s, so a copy of it that ever reaches a URL log is already dead.
3. Web `/auth/callback`: first action is `history.replaceState` to drop the query string; then POST the code; then `login(...)` and `router.replace('/dashboard')`. The `error` handling keeps working with the **fixed code set** from T-299 (never echo the query value).
4. The error redirects (`?error=…`) and the login pages are unchanged.

**Analytics, in the same ticket (defence in depth and scope):**
- `gtag('config', id, { send_page_view: false })`, plus one small client component that sends the page view itself with `page_location = location.origin + location.pathname` (no query, no hash) and `page_path` likewise.
- GA loads **only on public marketing routes** (an allowlist of pathnames: `/`, `/pricing`, `/terms`, `/privacy`, and the other public pages). Never on `/auth/*`, `/login`, `/register`, `/dashboard/*`, `/admin/*`. If Ajay requires a consent step first, the component is where it goes; this ticket does not build a banner.

**Tests (AC2):** exchange returns the pair once and `invalid_code` the second time; an expired code (fake timers, 61 s) is refused; a code that is a different user's or random is refused; the Google callback redirect URL contains `code=` and neither token; the page-location helper strips query and hash for `/auth/callback?code=x#y`; a recorded browser check (Anushka or the lead, screenshot in the report): Network panel on a real Google sign-in shows no request to `google-analytics.com` or `googletagmanager.com` whose URL or payload contains `accessToken`, `refreshToken` or `code=`.

**AC3: rotation.** Production has no real users yet (fresh environment and new secrets at T-403), so nothing to rotate there. For **develop / any host already serving this build**: once the fix is deployed, the founder flushes all sessions (delete Redis `session:*` and `session:refresh:*`, and the `sessions` collection), so every token that went to GA is dead; access tokens last 24 h and refresh tokens 7 days anyway, so the exposure window closes by itself within a week even without it. Optional, not needed once sessions are flushed: GA Admin → Data deletion requests for the property. **If any real (non-test) user signed in with Google on a public host while GA was live, tell Priya now:** that person's account was exposed for up to 7 days and Ajay decides on notice.

**Ajay (heads-up, found while reading):** `T-235`'s facts say "No analytics" and "no first-party cookies". That is wrong: `layout.tsx` loads Google Analytics 4 on every page, which sets `_ga` cookies, sends the visitor's IP and the page URL to Google, and runs on the authenticated screens too. `/privacy` needs a Google Analytics line (and cookies); whether consent is needed before it loads is his call. Priya to carry this into T-235/T-284.

**Order and files:** build with T-299 (same lead, Kunal: `oauth.routes.ts`, `passport.ts`, `/login`, the callback page; `layout.tsx` and one new component for analytics). Size S/M. HIGH, before v1 go-live. Founder: the session flush on develop after deploy.
