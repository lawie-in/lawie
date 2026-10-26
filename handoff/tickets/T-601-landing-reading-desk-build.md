# T-601: Build the landing page, direction B (The Reading Desk)

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Growth (UI; Rajesh gate satisfied by his spec; web only) |
| Owner  | Rajesh (spec), Madhuri (copy), Ajay (claims, signed), Arjun (constraints), Kunal (build) |
| Mode   | Full chain (web). Fresh reviewer; Rajesh checks the 8 acceptance checks; Ajay checks sample PDFs before they are served |
| Status | To do. Raised 26 Oct 2026. Founder chose B. Copy signed by Ajay. Build starts now; the coverage section needs T-600's data file (merge order below). Priya |
| Source | handoff/design/T-584-landing-reading-desk-spec.md, handoff/copy/T-584-landing-copy-v1.md, handoff/legal/T-584-landing-copy-rulings-ajay.md |

## Acceptance criteria
1. Build the landing page per Rajesh's per-section spec, with the 8 acceptance checks in it. Motion per the emil set, prefers-reduced-motion respected, tab-hidden pause, mobile budget in ui-quality.md.
2. Copy: Madhuri's v1, with Ajay's rulings applied as authoritative overrides (06 "changes when the library does"; 08b drop "details redacted"; 09a/b names are obvious placeholders such as Sample Person 1 / Sample Traders; 09c swapped to a maintenance petition because plaints are off in v1; 14-05 the plaints shelf hides, shelves show only with at least one live template; 14-06 HI "बचाव"). Signed lines untouched.
3. Coverage section reads apps/web/src/data/landing-catalogue.json (T-600, Vishal). If T-600 has not merged, build against the agreed shape with a fixture and switch when it lands; the headline number is computed (total rounded down to ten, with "+").
4. Sample drafts are static assets, SAMPLE watermark, fictional parties, no live Anthropic call. Ajay checks the sample PDFs before they are served.
5. Demo video: placement, poster, captions badge and click-to-play only until the real build video exists; MP4 in apps/web/public, at most 3 MB. Ajay's condition: the video is the real build.
6. Ajay's conditions: remove "in English or Hindi" unless Hindi input works end to end; edit and export must be live.
7. Logo fill (wordmark ink-fill, app loading screen) is NOT in this ticket: it is PENDING FOUNDER YES (T-599).
8. Web tests and build green; Rajesh runs his acceptance checks on the build; screenshots in e2e if the harness covers it.

## Files
Lead lists them after Explore, and Priya claims them: expected apps/web/src/app/(marketing)/page.tsx, new components under apps/web/src/components/marketing/landing/, nl-copy.ts, tests, public assets. Not the old-page migration (T-599), not LogoSplash.
