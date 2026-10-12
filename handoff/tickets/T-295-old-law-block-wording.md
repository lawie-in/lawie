# T-295 — Old-law block reads "BNS Section 302 IPC"

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Legal accuracy |
| Owner  | Ajay (writes and signs the wording). Lead (build) |
| Mode   | Small fix, legal content |
| Status | To do. Wording signed (455559c). Soft warning decided; Arjun to confirm mechanism. Then any free lead |

The old-law block in the drafting prompt can read "BNS Section 302 IPC…", which mixes the two codes. Ajay writes the correct wording; a lead applies it.

## Acceptance criteria

1. Ajay's signed wording replaces the mixed line, exactly.
2. A test pins the new wording. Ajay signs the diff as applied; moved snapshots go to him.

## Ajay signed the wording (12 Oct 2026)

`handoff/legal/T-295-old-law-block-signed.md` (455559c, block SHA in that file). The line never puts "BNS" in front of an old-law number.

## Decision: soft, not a hard block (Priya, 12 Oct 2026, on Ajay's advice)

Offences committed before 1 July 2024 are still charged under IPC, so a hard block stops correct drafts. The old-law line becomes a warning the advocate can proceed past; the draft is not stopped. Arjun confirms the mechanism (or objects) in this ticket before the build starts. Ties in with T-245 (old/new law switch).

## Acceptance criteria (added)

3. An IPC section for an offence before 1 July 2024 shows the signed line as a warning and the draft continues.

## Arjun (12 Oct 2026): mechanism confirmed

Soft is the right call, and the mechanism already exists: `preflight.service.ts` findings carry `severity: 'hard' | 'soft'`, and `runPreflight` returns verdict `soft` (not `hard`) when only soft findings exist, so the draft is not stopped. No new machinery.

**Build**
1. In the `legacySectionParts` loop, an IPC, CrPC or IEA entry becomes a finding with `rule_id: 'old_law_section'`, `severity: 'soft'`, and `question` = Ajay's signed block, byte for byte (SHA in `handoff/legal/T-295-old-law-block-signed.md`), one finding per distinct `(code, number)`. It is not filed under `section_whitelist` any more, and no old-law number is ever put through the BNS whitelist.
2. BNS entries keep the existing `section_whitelist` hard block (unknown BNS section). BNSS, BSA and other Acts: no finding (as decided in T-277).
3. The lead checks that the web shows a `soft` verdict with a way to continue, and that the continue path reaches generation with the same inputs. If the web treats `soft` as a stop anywhere, say so in the report and stop; that is a separate UI ticket.
4. The same signed line is what the "use EXACTLY" block carries for these entries (T-277 reader): one source constant, two uses.

**Order:** after T-277 merges. Both claim `preflight.service.ts`; T-277 pins today's hard block with a test, and T-295 replaces that pin (so T-277's merge is not blocked by this ticket).

**T-245 tie-in (do not build here):** once T-245a adds `offence_date` to the packs, the finding becomes date-aware: offence before 1 July 2024 → no finding at all (IPC is the right law); on or after, or no date → the soft finding with the signed line, never an assumption about the law. Until then it is always soft. Ajay confirms that date rule when he signs the T-245a text; it is a small change in the same function.

**Tests (AC3 and pins):** `302 IPC`, `420-IPC`, `CrPC 438`, `IEA 65B` each give the signed line with the code first; the verdict is `soft` and the draft continues; no line contains "BNS" before an old-law number; `BNS 999(1)` still hard-blocks; a mixed list (`BNS 103, IPC 302`) gives one soft finding and no block.
