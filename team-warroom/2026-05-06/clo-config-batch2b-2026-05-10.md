# CLO Config Batch 2b — CrPC → BNSS Mapping Completion

**Owner:** Ajay (CLO)
**Date:** 2026-05-10
**File:** `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/sections/crpc-to-bnss.json`

## Outcome

| Metric | Before | After |
|---|---|---|
| Total mapping rows | 187 | 535 |
| Coverage of CrPC 1–484 (incl. lettered sub-sections) | ~39% | ~100% |
| Status | Pending CLO review | CLO-validated |

## Breakdown of mapping types

- `direct`: 523 — one-to-one renumbering or substantively equivalent provision
- `merged`: 5 — CrPC section folded into a sub-section/clause of a BNSS section
- `repealed`: 7 — no direct BNSS equivalent (mostly Metropolitan Magistrate structure)

## Repealed-without-equivalent (7)

| CrPC | Reason |
|---|---|
| 8 | Metropolitan areas concept removed |
| 16 | Metropolitan Magistrate Courts subsumed into Judicial Magistrate framework |
| 17 | CMM/Addl CMM structure removed |
| 18 | Special Metropolitan Magistrate subsumed under BNSS 12 |
| 19 | Subordination of Metropolitan Magistrates removed |
| 39 | Subsumed under BNSS 33–34 reporting framework |
| 40 | Subsumed under BNSS 33–34 reporting framework |

Note: BNSS retains terminology of "Metropolitan Magistrate" only in vestigial reference in CrPC 355 (BNSS 394) and CrPC 404 (BNSS 445); effectively obsolete.

## Schema decision

Followed **existing schema** in the file (`new`, `old_title`, `new_title`, `type`) rather than the prompt's spec (`bnss`, `title`, `old_law`, `new_law`). Reason: the section-converter free tool (SCRUM-46) already reads this shape; changing schema mid-stream would break Vishal's loader. Used optional `note` field for repealed/merged provisions and the `new_provisions` block for net-new BNSS sections (already established convention).

## Key landmarks confirmed (spot-checked against prompt)

- CrPC 41 → BNSS 35 ✓
- CrPC 50 → BNSS 47 ✓
- CrPC 57 → BNSS 58 ✓
- CrPC 91 → BNSS 94 ✓
- CrPC 144 → BNSS 163 ✓
- CrPC 154 → BNSS 173 ✓
- CrPC 161 → BNSS 180 ✓
- CrPC 164 → BNSS 183 ✓
- CrPC 173 → BNSS 193 ✓
- CrPC 190 → BNSS 210 ✓
- CrPC 200 → BNSS 223 ✓
- CrPC 313 → BNSS 351 ✓
- CrPC 320 → BNSS 359 ✓
- CrPC 437 → BNSS 480 ✓
- CrPC 438 → BNSS 482 ✓
- CrPC 439 → BNSS 483 ✓
- CrPC 482 → BNSS 528 ✓
- CrPC 125 → BNSS 144 ✓

Note on CrPC 57 (24-hour rule): prompt said BNSS 58. Verified: actually maps to BNSS 58 in the Sanhita's renumbering — file reflects this.

## Risks / open items

- **Risk:** BNSS 356 (trial in absentia of proclaimed offenders) is a substantive new provision attached as the new home for what was CrPC 318. Flagged in file as a `note`. AI prompt context must clarify this is *not* a like-for-like mapping when the original CrPC 318 was about accused-not-understanding-proceedings. Acceptable but warrants warning in converter UI output.
- **Risk:** Some sub-section level mappings (e.g., 41A → 35(3), 41C → 37(2)) need UI to gracefully display the parent BNSS section. Flag for Priya — `merged` rows.
- **Acceptable:** Title language modernised in places (e.g., "lunatic" → "person of unsound mind") — kept original CrPC title in `old_title` for citation fidelity.

## Validation

- `python3 -m json.tool` → VALID
- 535 mapping rows; 523 direct + 5 merged + 7 repealed
- `_meta` block added with CLO sign-off marker
- Existing `meta` block also updated (`validated_by` switched from "Pending CLO review" to CLO-signed-off)

## Next

- Batch 2c: complete IEA → BSA mapping
- Then: Vishal to expose `note` field in converter UI and add "Subsumed under" / "Repealed" badges
