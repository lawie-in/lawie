# T-310 — Ask for consent before Google Analytics loads (DPDP)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release. Gate before v1 go-live (T-403) |
| Owner  | Rajesh (design). Ajay (wording, signs). Arjun (mechanism). Lead (build, web) |
| Mode   | Small feature (web) |
| Status | To do. Decided by Priya on Ajay's advice, 12 Oct 2026. After T-306 and T-308 |

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
