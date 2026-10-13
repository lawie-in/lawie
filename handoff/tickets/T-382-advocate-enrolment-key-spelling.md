# T-382 — Typed enrolment number is ignored in seven packs

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting config) + Ajay (pack JSON is legal content) |
| Mode   | Small fix |
| Status | Mahak, together with T-365 AC6: one claim on the pack files, not blocked by T-374 after all: Tanvi's loader doesn't edit the bail_*.json packs (13 Oct). Arjun's b8099fb. Rename in 7 packs, a read-side alias for saved drafts, and preflight reads the new key |
| Source | default_bail, bail_before_magistrate and interim_bail spell `advocate_enrolment`; the code reads `advocate_enrollment` |

## Acceptance criteria

1. A typed enrolment number prints in default_bail, bail_before_magistrate and interim_bail drafts.
2. One spelling everywhere. Either rename the key in the three packs (legal content, Ajay signs) or have the code read both (Arjun's choice). Coordinate with T-374, which moves the bail packs onto skeletons.
3. A test for each of the three packs.

## Ajay (13 Oct 2026)

There are 7 packs, not 3: bail_before_magistrate, bail_cancellation, default_bail, interim_bail, surrender_application, suspension_of_sentence and vakalatnama. Rename the id to `advocate_enrollment`. It's a key-only change with the labels unchanged, and Ajay signs it. preflight.service.ts reads a third spelling, `advocate_enrolment_no` (for Arjun). Arjun decides whether the code also reads the old key for saved drafts.

## Arjun (13 Oct 2026)

- Rename the key to `advocate_enrollment` in the seven packs, as Ajay signed.
- The code reads the old key for saved drafts: one read-side alias where form data is loaded for a draft (`advocate_enrolment` → `advocate_enrollment`, only when the new key is absent). No write-side alias; new drafts carry the new key only. Same alias map as ADR-025's slot list, so T-374 reuses it.
- `preflight.service.ts` F4: read `advocate_enrollment` (after the alias). Drop `advocate_enrolment_no`; nothing writes it.
- Update the five test files that still spell `advocate_enrolment`. One test per pack (AC3) plus one for the alias.
- Same claim as T-365 AC6's pack edits, so the seven packs change once.

**Ajay (48f35e1):** the key in the vakalatnama validation rule text is renamed too; the word "enrolment" in prose stays. His 46 T-239 batch-1 specs now use advocate_enrollment.

## Arjun (13 Oct 2026, Mahak's three)

- (a) `GET /templates` card_description: request-time registry lookup by template_id. No new model field, no seed: seeds go stale (see T-360). Same for `GET /templates/:id`.
- (b) One alias map, exported from `services/rule-pack.service.ts` (where I put it for Tanvi, T-374). Whoever lands first creates it; the other imports. No second copy, no new config file.
- (c) The alias is applied wherever stored data enters the pipeline through the same helper: `readFormInputs` for drafts, and the brief path only if it loads a stored intake's form data from before the deploy through another function (Mahak checks). Same helper, never a second map. No write-side alias.

## Arjun (13 Oct 2026)

"(after the alias)" was loose wording. The alias is for stored drafts, not request bodies. Preflight F4 reads a fresh request body, which after the rename only ever carries `advocate_enrollment`, so T-387 AC2 is right.
