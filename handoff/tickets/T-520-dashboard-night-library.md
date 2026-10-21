# T-520: Dashboard and app shell in Night Library

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (spec section 03), a web lead (build) |
| Mode   | Full chain (web) |
| Status | In build: Tanvi (21 Oct 2026). Priya |
| Source | T-511 part B; spec `handoff/design/T-511-night-library-spec.md` sections 03 and 08 |

## Scope
"Your shelf" dashboard using the T-506 summary endpoint; mount TopBar (theme toggle in the menu, no second header row), CommandBar (`hotkey={false}` if the section finder stays), the new dashboard layout and sidebar; error pages (404, 500, offline) per section 08.

## Acceptance criteria
1. Eight KPIs per the spec; no time-saved tile; tiles 3, 4, 6, 7 show a skeleton while loading, never a zero; empty, loading and error states as written.
2. Theme toggle (Night, Daylight, System) works and persists; follows the system theme by default.
3. 360px first, no horizontal scroll; reduced-motion stops all effects; loops pause when the tab is hidden.
4. Copy only from the Ajay-signed `handoff/copy/T-511-copy-v1.md`; Ink is "Ink a month", never a draft count.
5. Tests; browser check recorded in the ticket before Anushka tests.

## Arjun (21 Oct 2026) — post-merge UI-quality pass on 748a5264 (Tanvi)

Scores: hierarchy 3/4, a11y 3/4, responsive 3/4; critique 28/40, audit 15/20; review-animations blocks one desktop item. VERDICT pass, no must-fix. Loaded: impeccable (craft-floor, operate, critique, audit) + review-animations. Not loaded: mobile-native, break-ui, animate; no 768 px look anywhere.

Ruling:
- **Fix ticket (Priya posts, engineering, no design decision):** S1 spine hover target moves from under the cursor (group on `<li>`, translate the inner link); S2 "Still working…" off-screen at 360; S6 forced-colors (Windows High Contrast) — bands, meters, skeletons must survive `forced-colors: active`; S7 long unbroken name overflows the greeting (`break-words`). Plus the notes: `dir="auto"` on spine titles, drop the per-tile `<section>` landmarks, make the nudge `role=status` less chatty. That ticket's developer loads `mobile-native`, its tester runs `break-ui`: that is the re-run, not a separate pass.
- **Rajesh (via Priya):** S3 two primary buttons on one screen; S4 spine titles cut to ~10 chars at 360; S5 Ctrl+K owner — spec 2.5 says command bar, code gives it to SectionFinderPanel. One owner, Rajesh picks; Priya records it in the spec.
- **T-523 (Playwright):** 768 px and the 720 px top-bar collapse, app/error page, root loading folio, zero-Ink messages, past_due / ends-at plan tiles, forced colours, 200 % text — the never-captured list becomes T-523's screenshot matrix for the dashboard.

## Arjun (21 Oct 2026, later) — correction: Daylight tokens fail WCAG AA

A second, fresh reviewer computed contrast from the hex values instead of trusting the spec's claims, and Tanvi verified. I re-computed: white on brass `#9C7A2B` = **4.01:1** (spec 2.1 says 4.6); Daylight muted `#6D7A73` = **3.90:1** on wall `#F3EFE4`, **4.23:1** on card `#FBF8F0` (spec says 4.6). Both are under AA's 4.5:1 for text at 14–15 px: primary-button labels (Draft, Top up, Start your first draft, Retry, Back to dashboard) and the muted date line, "Still working…", command-bar placeholder, menu email. Night passes.

Ruling:
- The a11y score for T-520 is **2/4** and the pass is withdrawn to **fail-after-merge**: the merge stays (no reopen), but T-524 is a must-fix, not polish, and the dashboard does not go to `main` with these tokens.
- **Tokens are Rajesh's.** Candidate values, computed: brass fill `#866619` → 5.35:1 with white; muted `#5F6B65` → 4.84:1 on wall, 5.24:1 on card. Rajesh may choose others that clear 4.5:1 on both wall and card; he re-signs spec 2.1 and `DESIGN.md`. Until he answers, T-524's engineering items proceed; the token edit (one `globals.css` change, a shared file: Priya extends the claim) lands when he has signed.
- **Protocol change (ui-quality.md):** a reviewer never takes a contrast figure from a spec or a comment; it computes from the hex pair in the code, for every text/background pair the ticket touches, and prints the ratios in the report. Also: `mobile-native` and `break-ui` are not optional on a web ticket; a reviewer that could not load them says so and the lead runs a second reviewer that does.
- T-524 scope: the four engineering items above, plus spine fixed 52 px at 150 % text scaling, offline banner alignment, `loading.tsx` status region silent for 8 s, forced-colors; design items (two primaries, spine titles, Ctrl+K owner, the two tokens) wait on Rajesh.
