# T-584: Landing page epic — full drafting coverage, sample drafts, motion, better UI

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Growth (after go-live fixes; not before the ai.* settings and T-583 are done on prod) |
| Owner  | Rajesh (design), Madhuri (copy), Ajay (legal claims), Arjun (constraints), a lead (build, web only) |
| Mode   | Full chain (UI ticket: Rajesh gate) |
| Status | To do. Epic opened by Priya on Arjun's relay of the founder's request, 26 Oct 2026. Design and copy first; no lead touches apps/web/src/app/(marketing) until Rajesh's Figma and handoff spec exist. Priya |
| Source | Founder, 26 Oct 2026, relayed by Arjun |

## Problem
The founder is not happy with the landing page content. The "what we can draft today" section names only a few documents, and Lawie drafts far more ("say a lot and a lot more"). He also wants animations, sample drafts and a more pleasing UI.

## Acceptance criteria
1. Rajesh: redesigned landing under `.claude/docs/ui-quality.md`, with Figma and a handoff spec. Includes motion (emil set), a "sample drafts" section, and a drafting-coverage section that scales to the full template catalogue (86 templates today, grouped by court or matter type), not a hand-picked few.
2. Madhuri: copy for the hero and the coverage section. The coverage list is generated from the templates catalogue, never hand-written, so it cannot go stale.
3. Ajay: signs every claim about what Lawie drafts (BCI advertising rules: no "guaranteed", no comparative claims). Prior ruling on sample drafts applies: redacted, fictional parties, watermark "sample".
4. Arjun's constraints: sample drafts are static assets or pre-generated and reviewed by Ajay; no live Anthropic calls from the marketing page. Animations respect prefers-reduced-motion and the mobile budget in ui-quality.md.
5. Demo video (founder, 26 Oct 2026): a short product demo on the landing page, shown from the real product with fictional, redacted parties (no real client data), with captions and a poster image. Meera/Madhuri write the script, Rajesh sets where it sits on the page, Ajay signs every on-screen claim and the voiceover (BCI rules, "sample" watermark on any draft shown). Served as a static file or from a CDN, lazy-loaded, no autoplay with sound, reduced-motion respected, within the mobile budget in ui-quality.md. No live Anthropic call from the page. Who records and produces it is decided with the founder (screen capture of develop or prod with a test account; Arjun confirms no secrets or PII are visible in frame).
6. Build: one lead, full chain, web only, after 1 to 4 are signed.

## Sequence
Rajesh and Madhuri first, then one lead for the build. Not before the ai.* settings and T-583 are done on prod.

## Files
Claimed by Priya when the build lead is assigned: apps/web/src/app/(marketing)/ landing files and the generated coverage list. Nobody before then.
