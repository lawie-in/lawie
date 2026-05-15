# Follow-ups — post Sprint 1 template-wiring (2026-05-12 → 14)

Status reset: every item I drafted yesterday has already been filed as a
SCRUM ticket by Priya. This file now just **points at the canonical tickets**
in [docs/inputToDev.md](docs/inputToDev.md) so anyone reading it cold has the
landscape without needing to spelunk through 3300 lines.

---

## Open tickets (P0 → P1 order)

### SCRUM-84 — Promoter section synthesis (P0, Vishal-Opus)

Build `document_structure.sections` in the promoter from CLO source fields
(`causeTitle.format`, `mandatoryClauses[]`, `prayerTemplate`,
`verificationTemplate`, `prompt_context`, `promptInstructions[]`). Unblocks
the 86 commodity templates so they generate end-to-end instead of producing
empty bodies.

- Spec: [docs/inputToDev.md:2898](docs/inputToDev.md)
- Size: S–M (1–2 days)
- Dependencies: SCRUM-78 (done), SCRUM-82 (in flight)

### SCRUM-89 — CLO form_schema on the 6 originals (P0, Ajay)

Add a `form_schema` block to the 6 production doc-rule JSONs with exact
field-id parity against the production overrides. Path A picked over the
engineer-side alias table — CLO files become the durable single source.
Gates SCRUM-81's PDF byte-diff closeout.

- Spec: [docs/inputToDev.md:3017](docs/inputToDev.md)
- Owner: Ajay — not Vishal
- Size: ~3 hr of CLO authoring

### SCRUM-83 — Section Finder side panel (design upgrade, P1, Vishal-Opus)

The full Rajesh design at
[docs/designs/SectionLookup/Lawie — Section Finder · Print.pdf](docs/designs/SectionLookup/Lawie%20—%20Section%20Finder%20·%20Print.pdf)
— 9 states across 2 layouts (side panel + compact drawer). Upgrades the v1
panel I shipped at commit `4676986` with:

- ⌘K keyboard shortcut + closed-state vertical "SECTION FINDER ⌘K" rail
- Lookup / Recent / Bookmarks tabs
- Typeahead with 3-match preview (sub-200ms, local JSON)
- Rich result card: 4 metadata pills (bailable, cognizable, triable by,
  compoundable), punishment callout, ingredients ordered list, related
  sections, bare-section text
- "Insert citation at cursor" → `editor.commands.insertContent('§303(2) BNS')`
  on TipTap, with 2-second yellow pill highlight
- Inserted section pills clickable → re-opens panel with section pre-loaded
- Recent + Bookmarks persisted in localStorage + backend per-user
- New API endpoints required:
  - `GET /api/sections/search?q=<q>` — typeahead (overlaps with SCRUM-85)
  - `GET /api/sections/:section_id` — full result card
  - `GET|POST|DEL /api/users/me/bookmarks/sections`
  - `GET|POST /api/users/me/recent/sections`

- Spec: [docs/inputToDev.md:2756](docs/inputToDev.md)
- Size: M (3–4 days)
- Acceptance update from ADR-005: "Storybook: all 9 states" replaced with
  "dev-server smoke for each of the 9 states"
- **Don't rebuild** — extend the existing
  [apps/web/src/components/sections/SectionFinderPanel.tsx](apps/web/src/components/sections/SectionFinderPanel.tsx)

### SCRUM-85 — In-form section search typeahead (P1, Vishal-Opus)

`GET /api/sections/search?q=…&code=BNS` + wire
[DynamicFormRenderer.tsx:588](apps/web/src/components/form/DynamicFormRenderer.tsx#L588)
to debounce-fetch it when `field.source === 'bns_mapping'`. Closes the
"sections are not searchable while filing" advocate complaint from the
2026-05-12 morning bug report.

- Spec: [docs/inputToDev.md:2939](docs/inputToDev.md)
- Size: S (0.5 day)
- Overlap: SCRUM-83 wants the same `/api/sections/search` endpoint. Whichever
  ships first builds it; the other consumes it. Coordinate.

### SCRUM-86 — Legal-notice properties fill (P1, Ajay)

Fill `properties: {...}` for the 6 legal*notice*\* doc-rules whose top-level
`type:'object'` sections have no sub-fields enumerated. Drops the boot-time
mismatch log from 33 lines to 0.

- Spec: [docs/inputToDev.md:2976](docs/inputToDev.md)
- Owner: Ajay — not Vishal
- Size: ~1 hr per doc × 6 docs

### SCRUM-90 — Razorpay production config bundle (founder + Vikram)

Set the 4 `RAZORPAY_PLAN_*_MONTHLY/_YEARLY` env vars, webhook URL + secret in
Razorpay dashboard, CFO sign-off on
[apps/billing/src/config/credit-skus.ts](apps/billing/src/config/credit-skus.ts)
thresholds. Bundles items 1–3 of the SCRUM-73 pre-launch checklist.

- Spec: [docs/inputToDev.md:3277](docs/inputToDev.md)
- Owner: Founder / Vikram (CFO)

### SCRUM-92 — Provision `lawie-prod` Atlas cluster (founder + Arjun)

Stop sharing `lawie-dev.bdyi886.mongodb.net` between dev and demo. Create
prod cluster, update `.env.demo` on the EC2 box, run
`yarn workspace @lawie/drafting seed:all` against the new MONGO_URI,
re-deploy.

- Spec: [docs/inputToDev.md:3226](docs/inputToDev.md)
- Owner: Founder / Arjun (provisioning) + Vishal-Opus (re-deploy)

### SCRUM-73 sub-item 4 — Court-rules golden snapshots regen

The 14 pre-existing snapshot diffs from Ajay's 2026-05-11 config refactor.
Regenerate via
`yarn workspace @lawie/drafting test:golden:update` once CLO confirms the JSON
edits are final.

- Spec: [docs/inputToDev.md:3126](docs/inputToDev.md)

---

## Already resolved by ADR

### ADR-005 — Component verification standard (SCRUM-91, Arjun, Done)

CTO call on my Storybook question: **no Storybook**. Standing gate for new
UI components is tsc + dev-server smoke + integration tests where the
component touches the form pipeline. Supersedes SCRUM-79's
Storybook-story requirement and SCRUM-83's
"Storybook: all 9 states" acceptance line.

- ADR: [docs/architecture/adr-005-component-verification-standard.md](docs/architecture/adr-005-component-verification-standard.md)
- Spec: [docs/inputToDev.md:3191](docs/inputToDev.md)

---

## Reporting lens — section coverage across all 92

`template-promoter-diff.md` measures **drift only on the 6 templates that have a
production override** (`docs/templates/*.json`) — for the other 86 there's no
hand-tuned reference to compare against, so the synthesised structure simply
becomes the runtime output.

Current state across the full 92 (post commits `89eedbc` → `c8ab2d5` → `9fadaaf`):

| Group                                                         | Count |
| ------------------------------------------------------------- | ----- |
| Production overrides (6 originals) — override wins at runtime | 6     |
| Auto-promoted, non-empty body                                 | 86    |
| Auto-promoted, empty body (needs CLO follow-up)               | 0     |

If reporting needs change, prefer this lens over the drift table — drift was
the SCRUM-81 gate metric and only covers the 6 retire-vs-keep candidates.

---

## Still informational (no ticket needed)

- **PDF byte-diff for the 6 originals** — folded into SCRUM-81 as a deferred
  test once SCRUM-84 + SCRUM-89 both land. No separate ticket per Priya.
- **Stale legacy templates in Mongo** (5 rows from pre-SCRUM-80 seed, marked
  inactive) — safe to delete after one upgrade cycle. Cosmetic.
- **Husky v9 deprecation warning** — cosmetic, blocks on Husky v10 upgrade.
- **`docs/` gitignore quirk** — 6 force-adds this session. Cleanup ticket
  optional.

---

## Already done (close-out)

- ✅ Sprint 1 template-wiring shipped end-to-end:
  - SCRUM-78 — promoter (`ad486d5`)
  - SCRUM-79 — renderer extension (`ae573e4`)
  - SCRUM-80 — auto-seed (`8bb9987`)
  - SCRUM-81 — structural diff gate (`929f8e1`, PDF byte-diff deferred)
- ✅ Front-end lists all 92 templates with search + category chips (`0caa200`)
- ✅ Section Finder v1 panel mounted globally on dashboard (`4676986`)
  — superseded by SCRUM-83
- ✅ 38 states + 1734 courts seeded on dev/demo Atlas
- ✅ AWS keys rotated, PEM gitignored
- ✅ ADR-005 resolves Storybook question

---

## Suggested next pickup

By priority + my session capacity:

1. **SCRUM-84** (promoter section synthesis, P0, 1–2d) — biggest user
   impact, unblocks 86 templates.
2. **SCRUM-85** (in-form section typeahead, P1, 0.5d) — closes the open
   advocate bug and **also delivers the `/api/sections/search` endpoint
   SCRUM-83 needs**. Doing 85 before 83 is the right ordering.
3. **SCRUM-83** (Section Finder design upgrade, P1, 3–4d) — pick up after
   85 lands so the typeahead endpoint already exists.

Ajay's work (SCRUM-86 + SCRUM-89) and the founder bundles (SCRUM-90,
SCRUM-92) are parallel — they don't block any of the above.
