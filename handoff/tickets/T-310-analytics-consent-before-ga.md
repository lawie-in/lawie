# T-310 — Ask for consent before Google Analytics loads (DPDP)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release. Gate before v1 go-live (T-403) |
| Owner  | Rajesh (design). Ajay (wording, signs). Arjun (mechanism). Lead (build, web) |
| Mode   | Small feature (web) |
| Status | Merged into develop_staging (af975f2, 12 Oct 2026). Waiting for Anushka on develop. Founder records the GA property check before prod |

Decision (Priya, 12 Oct 2026, founder has delegated these calls): Google Analytics loads only after the visitor agrees. No consent, no GA script and no `_ga` cookies. Recommended by Ajay for DPDP.

## Acceptance criteria

1. On public pages, a small consent notice offers Accept and Decline (Rajesh designs; Ajay signs the words).
2. GA4 loads only after Accept. Decline or no answer: no GA script, no `_ga` cookie.
3. The choice is remembered and can be changed from the privacy page or footer.
4. T-308's privacy text matches what ships (Ajay re-checks).
5. Checked at 375 and 1280 px.

## Arjun (12 Oct 2026): mechanism

**Rule:** no consent, no Google script, no `_ga` cookie. We do not use Google's Consent Mode; we simply do not load the tag until the visitor agrees.

1. **Root layout** (`layout.tsx`): the two `<Script>` blocks for `gtag` are removed from it. Nothing from Google is in the initial HTML for anyone.
2. **One client component, `AnalyticsConsent`** (new, in `apps/web/src/components/`), rendered in the root layout, does all of it:
   - Reads the choice from `localStorage['lawie.consent.analytics']` = `{ "v": 1, "choice": "granted" | "denied", "at": <ISO time> }`. Every read and write is in try/catch; if storage is blocked the choice is "denied" and the notice shows each visit. No answer or `v` older than the current consent version = ask again.
   - Renders nothing until mounted (no server/client mismatch) and nothing on non-public paths. On a public path with no valid choice it shows the notice (Rajesh's design, Ajay's words): Accept and Decline are equal in weight, neither is pre-selected, the notice does not cover the page, and it is keyboard- and screen-reader reachable.
   - On **Accept**: stores the choice, then appends the `gtag.js` script and initialises it **once** with `send_page_view: false`, `allow_google_signals: false`, `allow_ad_personalization_signals: false`, and sends the page view with the sanitised `page_location` (T-306's helper). Route changes among public pages send a page view through the same helper.
   - On **Decline** (or a later change to Decline): stores the choice, sets `window['ga-disable-G-ZSMN1GPPB5'] = true`, deletes the `_ga` and `_ga_ZSMN1GPPB5` cookies (expire them for the host and the parent domain), and removes the script tag. Nothing further is sent.
   - Exposes `openConsentSettings()` so the footer link "Cookie settings" and a button on `/privacy` reopen the notice. Changing the choice takes effect without a reload.
3. **Public-path allowlist** is the one from T-306, kept in one constant that both the page-view sender and the notice use, so GA and the notice can never disagree about where they run.
4. **No server record.** The choice lives only in the visitor's browser. Whether Lawie must be able to *demonstrate* consent for anonymous visitors, and so would need a server-side log, is Ajay's call; if yes it is a separate small ticket and must store no IP or identifier.
5. **Tests:** no choice → no `googletagmanager` script element and no `_ga` cookie (jest/RTL, and one recorded browser check at 375 and 1280 px); Decline → none, and the `_ga` cookies are cleared if present; Accept → the script appears once and exactly one page view carries a path with no query or hash; Accept then Decline removes the script and cookies and sets the disable flag; blocked `localStorage` → treated as denied, no throw; the notice and the footer link are reachable by keyboard and have accessible names.

**Order:** after T-306 (it owns the page-view helper and the allowlist) and T-308's wording. The same web lead as T-306 builds it. Size S/M.

## Ajay (12 Oct 2026): server-side consent record

Keep a minimal record (DPDP puts the burden of proof on us): a random id (also in localStorage), Accept or Decline, the consent text version, and the time. No IP, no user agent, no account link. Re-ask after 12 months or when the text changes; delete records older than 12 months. Arjun adds the endpoint and TTL to the mechanism.

## Arjun (12 Oct 2026): the server-side consent record (Ajay's ruling)

Ajay's rule: a minimal record of each choice, so Lawie can show consent was given or refused: a random id (also kept in the visitor's `localStorage`), Accept or Decline, the text version, the time; **no IP, no user agent, no link to an account**; 12-month TTL; the visitor is asked again after 12 months.

**Where it lives:** the auth service, as a small public route under the existing `/api/auth` proxy (already behind `publicRateLimiter`, so **no gateway change**). It is not tied to a user, a session or a token; it sits in auth only because auth already has the public-route and rate-limit plumbing.

**Endpoint:** `POST /api/auth/consent` (auth route `POST /consent`, new file `apps/auth/src/routes/consent.routes.ts`, one mount line in `apps/auth/src/app.ts`).
- Body, exactly this and nothing else: `{ "id": "<uuid v4>", "choice": "granted" | "denied", "version": <integer 1..1000> }`. Anything else (extra keys, wrong types, a malformed id): `400 { "error": "invalid_input" }`, no echo. Body limit 1 KB.
- Response `204` with no body. Idempotent: the same `id` and choice again changes nothing but the time.
- Never reads or stores `req.ip`, headers, user agent, cookies or the `Authorization` header; the handler does not log the body, the id or the request headers (Pino `redact` for the route, and a test).

**Collection** `consentrecords` (new model `apps/auth/src/models/Consent.model.ts`): `consentId` (the uuid, unique index), `purpose: 'analytics'` (constant), `choice`, `textVersion` (the `version` sent), `decidedAt`, `previous` (array of the last 5 `{choice, textVersion, decidedAt}`, so a change from Accept to Decline keeps its history), and `expiresAt = decidedAt + 12 months` with a **TTL index (`expireAfterSeconds: 0` on `expiresAt`)**. A new decision for the same id upserts: the old values go into `previous`, `decidedAt` and `expiresAt` move forward. No other fields. Not exposed through any admin route in this ticket.

**Web side (changes to the mechanism above):**
- The `localStorage` value becomes `{ "v": <version>, "id": "<uuid>", "choice": …, "at": <ISO>, "synced": true|false }`. The uuid comes from `crypto.randomUUID()` the first time the visitor decides and stays the same for later changes.
- **Re-ask rule:** a stored choice older than 12 months (`at`) counts as no answer, in addition to the version rule.
- On every Accept or Decline the component POSTs the record with `fetch(..., { keepalive: true })`. **The choice takes effect locally at once and never waits for or depends on the call.** A failed call leaves `synced: false`, and the component retries once on the next public page load. A failure is never shown to the visitor.
- Decline is recorded too (Ajay: both choices).

**Tests:** valid body gives 204 and one row with `expiresAt` 12 months after `decidedAt` (fake clock); the same id with the other choice updates the row and puts the old one in `previous`; invalid bodies (bad uuid, extra key, `version: 0`, `choice: 'maybe'`) give 400; the stored document has no field containing an IP, user agent or user id (assert the exact keys); the TTL index exists with `expireAfterSeconds: 0` (assert the index, do not wait for the monitor); the log capture for a request holds no id and no body. Web: a failed POST leaves the choice in force and `synced: false`; the retry runs once on the next load; a choice 13 months old shows the notice again.

**Note for Ajay (not a blocker):** the platform keeps ordinary access logs (nginx, hosting) with IP addresses regardless; the record above is the only place Lawie links a decision to an id. The privacy page should not claim that no IP address is processed when the page is served.

**Files:** `apps/auth/src/routes/consent.routes.ts`, `apps/auth/src/models/Consent.model.ts`, `apps/auth/src/app.ts` (one line), tests; the web component and its tests. Same lead as T-306/T-299 (auth `app.ts`, web root layout). Size M.

## Arjun (12 Oct 2026): LogoSplash and Google Fonts (Priya and Ajay's question)

**Decision: self-host Fraunces. Do not accept the request.** `LogoSplash.tsx` (l.17-22) appends a `<link>` to `https://fonts.googleapis.com/css2?family=Fraunces…` in the visitor's browser, so every first visit to a public page sends the visitor's IP and user agent to Google before any consent, and it is outside the GA gate. The site already self-hosts Inter and Lora with `next/font/google` (that package downloads the font files at build time and serves them from our own domain, so the browser never contacts Google). Fraunces gets the same treatment.

**Build (inside T-310, web only):**
1. In the marketing layout add `const fraunces = Fraunces({ subsets: ['latin'], weight: '500', axes: ['opsz'], display: 'swap', variable: '--font-fraunces' })` (the same pattern as `Inter` and `Lora` there) and put `fraunces.variable` on the wrapper.
2. In `LogoSplash.tsx` delete the `createElement('link')` block. The SVG text uses the family through the variable: set `font-family` as an inline style, `var(--font-fraunces), 'Times New Roman', Georgia, serif`, not the bare name `Fraunces` (next/font renames the family, so the name `Fraunces` would no longer match). The wait before the animation uses the same name: `document.fonts.load('500 360px var(--font-fraunces)')` does not resolve a variable, so pass the real family string from the font object (`fraunces.style.fontFamily`) into the component as a prop and use it in both places.
3. Check the look against the current splash (Rajesh, one screenshot at 375 and 1280 px in the report).

**Acceptance criterion added to T-310 (AC6): no request to any host other than our own before consent.** A recorded browser check on a fresh profile (no storage), on `/`, `/pricing`, `/terms` and `/privacy`, with the Network panel filtered to third-party hosts: zero requests until Accept is pressed, and after Decline still zero. The lead lists any other host found (images, scripts, embeds, fonts) and either removes or self-hosts it, or tells Priya and Ajay if it cannot be removed. The code read finds no other `<link>` or third-party script in `apps/web/src` besides this one and GA; the browser check is the proof.

## Arjun (12 Oct 2026): Sentry in the browser vs AC6, follow-up ticket

Kunal found that `apps/web/sentry.client.config.ts` runs in production with no tunnel, so every page (public ones too) can call a `sentry.io` host before consent. Checked: `@sentry/nextjs` ^10, no `replayIntegration` anywhere, so Session Replay is **not** actually running (the `replaysOnErrorSampleRate: 1.0` line does nothing without the integration). Decision, as its own small web ticket (not in Kunal's T-310 files; Priya to log it; files `apps/web/sentry.client.config.ts`, `apps/web/next.config.mjs`):

1. **Tunnel.** `tunnelRoute: '/monitoring'` in `withSentryConfig`, so the browser only ever calls our own origin. AC6's "no third-party request before consent" then holds for Sentry.
2. **Less data.** Client `tracesSampleRate: 0` (no performance traces from browsers), delete both `replays*` lines (Replay records the page, which holds document content; it must never be switched on by adding the integration later without a new decision from me and Ajay), `sendDefaultPii: false` explicit, and a `beforeSend` that drops `request.data`, `request.cookies` and `extra`, and keeps only `navigation` and `ui.click` breadcrumbs with `message` removed.
3. **Ajay rules** whether error reporting before consent is allowed as necessary for running the service (it carries no document content after step 2). If he says no, the client `Sentry.init` runs only after `AnalyticsConsent` reports "accepted"; the server and edge configs are unaffected either way.
4. Test: on `/` with no consent, the browser makes no request to any host other than our own (same check as AC6); a thrown test error reaches `/monitoring`.

Addendum (Arjun, 12 Oct 2026): **Ajay ruled** (`T-310-consent-notice-signed.md`, Addendum 1, 93d0fcc): browser error reports are allowed before consent, so step 3's "init after consent" branch is not built. His conditions become ACs of the Sentry ticket: no cookies or local ids (also remove the default `browserSessionIntegration`, so no per-visit session id is sent), no Replay, no form values or document text (the `beforeSend` scrub in step 2), sent via `/monitoring`, Sentry stays in the privacy page's recipients table. Changing any of these needs a new ruling from Ajay.
