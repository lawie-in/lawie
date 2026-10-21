# UI quality: the design skills, their order, and the crew's use of them

Founder, 21 Oct 2026: "Integrate these things to deliver ultimate level of fantastic UI" — `emilkowalski/skills`, `impeccable.style`, `tasteskill.dev`, `playwright.dev`. Arjun's ruling on how they fit Lawie.

## What is in the repo (`.claude/skills/`)

Vetted and vendored by Arjun, 21 Oct 2026. Markdown and zero-dependency Node scripts only. Nothing here downloads a binary, phones home, or installs a hook.

| Skill | From | Licence | What we kept / dropped |
|---|---|---|---|
| `impeccable` (SKILL.md + `reference/`) | pbakaus/impeccable 4.7.0 | Apache-2.0 | Kept the playbooks (`critique`, `audit`, `polish`, `typeset`, `layout`, `harden`, `onboard`, `animate`, `distill`, `operate`, `craft-floor`). **Dropped** `scripts/` (a launcher that downloads an engine binary and calls a "roll" API) and the Codex `agents/`. The skill's own "launcher unavailable" path applies: read `PRODUCT.md` and `DESIGN.md` directly. No `/impeccable hooks`. |
| `design-taste-frontend` | Leonxlnx/taste-skill v2 | MIT | Kept SKILL.md, `references/`, `library/` (the 247-site study: directions, type systems, palettes, heroes, sections), `scripts/` (`draw.mjs`, `inspect.mjs`, `lint.mjs`: zero-dep, drive a local Chromium over CDP). **Dropped** `assets/` (starter CSS/JS; we have our own system) and `evals/`. |
| `emil-design-eng`, `animate`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `animation-performance`, `animation-vocabulary`, `mobile-native`, `break-ui`, `pick-ui-library`, `prototype`, `apple-design` | emilkowalski/skills | MIT | Kept the web set. **Dropped** `animate-expo`, `write-swift` (not our stack) and `ask-sonner` (we use Radix toast). |

In a cloud session Chromium is at `/opt/pw-browsers/chromium`: run the taste scripts with `CHROME_PATH=/opt/pw-browsers/chromium node .claude/skills/design-taste-frontend/scripts/inspect.mjs …`.

Update by re-running `npx skills add <repo> -a claude-code` in a scratch directory and copying the same subset; never install straight into the repo, never add the impeccable launcher or hooks. Record the version in this table.

## Order of authority (when the skills disagree)

1. **Rajesh's design** (the Figma + handoff spec on the ticket; T-511 is the current system: Mukta/Tiro, the night-library palette, Radix primitives). A skill never overrides it. If a skill's rule would change something Rajesh specified, the lead asks Rajesh, not the skill.
2. **`DESIGN.md`** at the repo root: Rajesh's spec written in the form `impeccable` reads (tokens, type scale, shape rules, motion rules). Rajesh owns it; `impeccable document` may draft it, Rajesh signs it. Until it exists, the T-511 handoff spec is the DESIGN.md.
3. **`PRODUCT.md`** at the repo root: who the users are (advocates in district courts, phones and old laptops, Hindi and English), what each surface is for. Priya owns it.
4. **`impeccable`**: the process. Every UI ticket uses `critique` and `audit` in review, `polish` and `harden` before the tester, `operate.md` for everything inside the dashboard. Its mode rule holds: the landing page and pricing are *Persuade*; intake, editor, documents, billing, settings are *Operate*; help and legal pages are *Read*.
5. **`design-taste-frontend`**: direction and anti-slop rules for *Persuade* surfaces only (landing, pricing, marketing). Its `draw.mjs` deals directions when a surface has no design yet; with Rajesh's design in hand, use only its `inspect.mjs`/`lint.mjs` house-style checks and the "substance, not restraint" warning. It does not restyle Operate surfaces.
6. **emilkowalski set**: motion and feel. `animate` and `review-animations` for every transition; `mobile-native` for every screen (phones are the primary device); `break-ui` worst-case data in the tester's pass (long party names, 40-page drafts, empty lists, zero Ink); `animation-performance` when anything drops frames; `pick-ui-library` before any hand-rolled component (Radix is the standing answer).

Conflicts the skills themselves create: a skill that wants a new font, a new palette, a new component library, or a "replacement visual world" is asking for a design change. Section 7 of the lead protocol holds: no UI change without Rajesh, no new dependency without an ADR.

## Crew protocol for a UI ticket

- **developer**: load `impeccable` (read `craft-floor.md` before the first edit), `mobile-native`, and `animate` when the ticket has motion. Build to the spec. Run `polish` and `harden` on the changed screens before reporting. Say in the report which skills were loaded and which checks ran.
- **tester**: Jest as today, plus `break-ui` worst-case data on every changed screen. When T-523 lands: the Playwright smoke run with screenshots at 390, 768 and 1280 px, light and dark, attached to the report.
- **reviewer**: run `impeccable critique` and `audit` (scores in the report), `review-animations` when motion changed, and compare against Rajesh's spec. A critique below 3/4 on hierarchy, a11y or responsive is a fail with findings, same as a code fail.
- **doc-writer**: unchanged.
- **lead**: a report that says "skill not loaded" on a UI ticket goes back to the step.

## Playwright (T-523, posted by Priya)

Not in the repo today. Ruling:
- `@playwright/test` in `apps/web` only. Chromium only. Cloud sessions use the pre-installed browser (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, never `playwright install`); CI installs with `--with-deps chromium`.
- `apps/web/e2e/`: smoke flows against `next dev` with the gateway mocked at the network edge (Playwright `page.route`), no live services, no hosted Redis, no real Anthropic calls. Flows: landing → signup → login; dashboard shell; new draft intake to the first SSE token (mocked); billing plan chooser; cancel.
- Screenshots at 390/768/1280, both themes, saved as artefacts; `toHaveScreenshot` goldens only for the shell and landing (anything with model text is never a golden).
- A separate CI job, `web-e2e`, required on `develop_staging`. Also runs `npx impeccable@<pinned> detect apps/web/src --json` as a non-blocking report for the first two weeks, then blocking.
- The crew's `run` skill and the taste `inspect.mjs` use the same Chromium.

## What this does not do

It does not replace Anushka. A green critique, a green audit and a green Playwright run mean the screen is built the way it was designed; whether an advocate can use it is still her `PASS`.
