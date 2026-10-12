# T-332 — T-310 should-fixes

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Kunal (build, with T-328) |
| Mode   | Small fix (web + auth) |
| Status | Building: kunal, with T-328 (12 Oct 2026) |

## Acceptance criteria

1. Web root layout: `#main` gets `tabIndex=-1` only at focus time, not statically around the whole app.
2. LogoSplash: call `markSplashEnded` before `sessionStorage.setItem`, so a throw from storage never hides the card.
3. Auth consent route: a store failure logs a fixed message with no request data.
4. A test for `CookieSettingsButton`.
