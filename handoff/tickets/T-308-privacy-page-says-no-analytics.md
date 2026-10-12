# T-308 — Privacy page says "no analytics", but Google Analytics loads on every page

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (writes and signs the wording). Lead (build, web). Arjun (facts) |
| Mode   | Small fix (web), legal content |
| Status | Merged into develop_staging (991c0f6, 12 Oct 2026). Waiting for Anushka on develop |

T-235's privacy text says "no analytics, no first-party cookies", but `apps/web/src/app/layout.tsx` loads Google Analytics 4 on every page. After T-306, analytics loads on public pages only (Arjun's design). The policy must say exactly what is true.

## Acceptance criteria

1. Arjun states the facts after T-306: which pages load GA4, what it collects, what cookies it sets.
2. Ajay writes and signs the privacy wording (and cookie wording if needed).
3. The lead applies it word for word to `apps/web/src/app/(marketing)/privacy/page.tsx`.

## Arjun (12 Oct 2026): facts for Ajay (AC1) and answers to his three questions

**What the code does today** (`apps/web/src/app/layout.tsx`, read, not browsed): loads `gtag.js` for property `G-ZSMN1GPPB5` in the root layout, so on every page, with `gtag('config', id)` and no other options. Nothing else in `apps/web/src` calls `gtag`, sets a `user_id`, or sends custom events.

**His three questions**
1. **No user id goes to GA: true.** No code sets `user_id` or calls `setUserId`; GA sees only an anonymous browser id (`_ga` cookie). Our code sends no name, email, account id, or document data.
2. **Google signals off: not true today, and the code can make it true.** The tag sets neither option, so the property's admin setting decides. T-306 adds `allow_google_signals: false` and `allow_ad_personalization_signals: false` to the `gtag('config', …)` call, so both are off at the tag whatever the property says. Founder also checks the property (list below).
3. **Ads personalisation off: same fix**, same two flags. We run no Google Ads and no remarketing audiences, and the founder confirms none is linked.

**What GA4 collects once the page is public and consent is given (after T-306 and T-310)**
- Pages: the public marketing pages only (`/`, `/pricing`, `/terms`, `/privacy` and the other public pages); never `/login`, `/register`, `/auth/*`, `/dashboard/*`, `/admin/*`.
- Per page view: the page URL **without query string or hash** (T-306 sanitises it), the page title, the referrer, the language, screen size, browser and operating system, and an approximate location (city/region) that Google derives from the visitor's IP address. GA4 does not store the IP address itself.
- Cookies (first-party, set on our domain by the GA script): `_ga` and `_ga_ZSMN1GPPB5`, lifetime 2 years by Google's default. Nothing else is set by Lawie for analytics.
- Property-level "enhanced measurement" can add scroll depth, outbound clicks, site search, video and file-download events; the founder turns off site search and form interactions (list below).
- Google processes the data on its own servers, including outside India; retention in the property is set by the founder (below).

**Founder, GA Admin (physical, 10 minutes; for the morning report):** (a) Admin → Data collection → **Google signals data collection: off**. (b) Data settings → **Data retention: 2 months** for event data. (c) Data sharing settings: **untick all** (Google products and services, benchmarking, technical support, account specialists). (d) Data streams → web stream → Enhanced measurement: **turn off Site search and Form interactions**. (e) Confirm no Google Ads, BigQuery or Search Console link is attached to the property. (f) Tell Priya who owns the Google account that holds the property, so a controller/processor note can be written.
