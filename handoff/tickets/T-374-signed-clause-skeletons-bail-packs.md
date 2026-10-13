# T-374 — Signed clause skeletons for the four bail packs

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead B (drafting config) + Ajay (writes the skeletons) |
| Mode   | Full chain |
| Status | Merged into develop_staging 1c9da98 (tanvi, 13 Oct 2026). Ajay signed 63707f7. Priya, 13 Oct 2026 |
| Source | ADR-025 (Arjun, 13 Oct 2026, handoff/tickets/ADR-025-structured-drafting-and-signed-data.md) |

## Acceptance criteria

**The build spec is in ADR-025 (ebea19e): skeleton format, Drafter tool schema, renderer rules, tests, and the two-lead split with the interface fixed. Build to it.** Lead A needs no skeleton from Ajay to begin. Questions go straight to Arjun. Scope from ADR-025 D1:
- A skeleton loader for Ajay-signed pack skeletons.
- Migration of the `bail_*` packs (regular, anticipatory, default, Magistrate) onto skeletons.
- Ajay writes the four skeletons in parallel, from his T-359 signed text.

Skeleton slot list for Ajay: ADR-025 (40a4e6e). Ajay has it and is writing the four skeletons.

## Ajay's skeletons signed (07706c2, handoff/legal/skeleton-*-signed.md)

All four are signed and sent to Tanvi. The rules: each clause uses fixed signed text or the advocate's own words. Antecedents and earlier applications are blanks when missing. Roots, character, flight risk and custody length get no clause unless the advocate gave the fact. Magistrate bail uses 478 or 480 depending on the bailability selected, and carries the woman proviso. Default bail uses 187(3) and the T-251 lines.

**Update:** Ajay re-signed the skeletons with Arjun's clause ids at 0204a7e, which supersedes 07706c2. Tanvi has the new SHAs.

## Arjun (13 Oct 2026, loader design)

1. File-name lookup `_skeletons/<packId>.json`, no pointer key in the pack: approved. "Point at" in the ADR means this. No file → `null` → today's path.
2. Hash test: pin the SHA of the signed md as the other legal tests do, and deep-equal the parsed fenced block against the parsed `_skeletons/*.json` (not raw bytes, so a formatter run cannot fail it).
3. Alias map lives in `rule-pack.service.ts`, exported: T-382 reuses it for `advocate_enrolment`.
4. Grounds mismatch: skeleton item ids must equal the pack's `grounds_for_bail` option ids, never a parallel list; Ajay fixes the skeleton side, not the pack. Where the pack takes grounds as free text (Magistrate), the skeleton's grounds clause is `source: advocate`, `list: true`, one item per ledger ground, no fixed options.

**Update (Ajay, b61aaf9):** the anticipatory and Magistrate skeletons are at v2, because Tanvi found their grounds didn't match the packs. bail_regular and default_bail are unchanged (0204a7e). Dependency (Arjun or Tanvi to settle with Vishal's T-373): the brief must write facts_narrative into the ledger for the Magistrate pack, or its facts clause always renders blank.

## Arjun (13 Oct 2026): two alias maps, not one

Option (b). They do different jobs. `FIELD_ALIASES` (T-382) rewrites a stored key on read, one direction only: `advocate_enrolment → advocate_enrollment`. `SLOT_ALIASES` (ADR L102, the three pairs) is a lookup the loader/renderer uses to resolve a skeleton slot against the pack's own key — try the slot name, then its alias, in either direction — and never writes or adds a key to form data. Both exported from `rule-pack.service.ts`. `readFormInputs` applies `FIELD_ALIASES` only. A test: resolving a default_bail or Magistrate draft adds no `father_name`, `address` or `sections_charged` key.

**Update (Ajay, eaf715c):** the Magistrate skeleton is re-signed as v3, fixing Tanvi's loader error. All four skeletons should now validate.

**Update (Ajay, d87355a):** skeletons re-signed; antecedents now has its own "none" list. Tanvi is re-validating.
