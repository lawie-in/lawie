# T-371 — Legal tables served from the signed files

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay (legal-content-paths) |
| Mode   | Small fix |
| Status | Merged into develop_staging ac0eb57 (shashank, 13 Oct 2026). Ajay signed 7421624. Waiting for Anushka on develop |
| Source | ADR-025 (Arjun, 13 Oct 2026, handoff/tickets/ADR-025-structured-drafting-and-signed-data.md) |

## Acceptance criteria

1. The four signed files (`config/sections/*.json` and `bns-offences.json`) load at boot and are served from memory. Their SHA-256 shows in `/health`.
2. `SectionMapping` in Mongo and its Redis cache are retired from the read path. No reseed is needed for a table change.
3. Every tool (bail checker, converter, bulk converter, timeline, preflight) parses with `readSectionsCharged` (T-277). "BNS 318(4)" and "318(4)" give the same result.
4. An unknown maximum sentence never ranks as infinite.
5. Unknown, `verify`-flagged or missing rows show "Not verified — check the Gazette" (Ajay's text, T-360).
6. `bns-offences.json`, `bns-mapping.json`, `bns-triable-by.json`, the resolver, `timeline.service.ts` and the four free-tool pages are added to `.claude/docs/legal-content-paths.md`.
7. Tests: CrPC 362→403, "BNS 318(4), BNS 316(2)" are offences, an unknown row shows "Not verified", and the /health SHA matches the file.

This replaces the reseed in T-360 and the parser half of T-361.

## Folded in from T-360 (Arjun, 13 Oct)

Shashank's bugs (b)1–5 in T-360 are part of this ticket: the bulk regex for lists of numbers and "Evidence Act", the parent fallback (156(3)→175(3)), labels on unconverted references, "Not verified" in place of "No mapping found", and labels per reference in the bulk UI. Files are added as needed: sections.routes.ts and the web section-converter page.

## Arjun's answers (13 Oct 2026)

1. Three tool pages, not four: converter, bail checker and timeline. ADR-025's "four" was a slip.
2. The hard "Not verified — check the Gazette" goes only on unverified, missing or null rows. Verify-flagged offence rows get a one-line caveat that Ajay signs. The raw verify text is never shown.
3. The wider converter changes the tool only. Draft text stays on the old behaviour until D1, so no ai.service.ts or prompt-assembler.ts change.

**Ajay (e3df5a0, T-361 Addendum 1):** the Gazette line shows only on the 4 unverified or null-target rows and on missing sections. A null attribute gets his fixed "Depends on the sub-section…" line. The raw verify text is never shown.

**Ajay (6526597, handoff/legal/T-371-verify-caveat-signed.md):** the signed caveat line for verify-flagged rows. It supersedes e3df5a0 where they differ. Ajay reviews T-371's legal-content-path files before merge.

**Also (Arjun, 13 Oct):** add `apps/drafting/src/config/document-rules/_skeletons/` (the generated skeleton JSON) to legal-content-paths.md in this ticket.

## Ajay (25b3a26, 13 Oct 2026)

He answered Shashank's six points. Two change: point 1 (a non-offence BNS section keeps the T-277 line) and the converter example.

**Moved out:** the BNS 61(2) bug is its own ticket, T-383 (Ajay's request). Shashank does it after T-371.

**Ajay approved the legal-content diff (51531fe), with one summary-line change (1363d68).**
