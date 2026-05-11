# Batch 2a Audit — ipc-to-bns.json
Owner: Ajay (CLO) | Date: 2026-05-10 | Scope: complete IPC -> BNS coverage

## Section count
- Before: 302 entries (59% of IPC 1-511 core sections; lettered sub-sections inconsistent)
- After: 576 entries (full IPC 1-511 + all lettered sub-sections 29A, 52A, 108A, 120A/B, 153A/B, 153AA, 165A, 166A/B, 171A-I, 174A, 195A, 216A/B, 225A/B, 228A, 229A, 263A, 292A, 326A/B, 354A-D, 363A, 364A, 366A/B, 370A, 376A/AB/B/C/D/DA/DB/E, 489A-E)
- Coverage: 100% of IPC sections per Indian Kanoon master index

## Schema note
Existing file uses `new` / `old_title` / `new_title` / `type` (not the `bns`/`title`/`old_law`/`new_law` shape in the brief). Preserved existing schema for backward compatibility with consumers (section converter, AI prompt context). `_meta` enrichment merged into the existing `meta` block; added `description`, `owner`, `source`, `change_protocol`, and updated `validated_by`/`last_updated`.

## Repealed without direct BNS equivalent (32 sections)
| IPC | Title | Reason |
|---|---|---|
| 13 | Queen | Repealed Act 3 of 1951 |
| 15 | British India | Repealed AO 1937 |
| 16 | Government of India (old defn) | Repealed AO 1937 |
| 53A | Reference to transportation | Obsolete |
| 56 | Sentence of Europeans/Americans to penal servitude | Repealed Act 17/1949 |
| 58 | Transportation, how dealt with | Obsolete |
| 59 | Transportation instead of imprisonment | Obsolete |
| 61 | Forfeiture of property | Repealed Act 16/1921 |
| 62 | Forfeiture re capital offenders | Repealed Act 16/1921 |
| 138A | Foregoing sections to Indian Marine Service | Repealed Act 35/1934 |
| 153AA | Carrying arms in procession | Subsumed under BNS 196 |
| 161-165, 165A | Public servant gratification / corruption | Now under Prevention of Corruption Act, 1988 |
| 216B | Defn of 'harbour' | Subsumed under BNS 27 |
| 226 | Unlawful return from transportation | Obsolete |
| 263A | Fictitious stamps | Subsumed under BNS 178 |
| 294A | Keeping lottery office | State Public Gambling Acts |
| 303 | Murder by life convict | Struck down Mithu v. Punjab (1983) |
| 309 | Attempt to suicide | Decriminalized; MHA 2017 S.115 |
| 310-311 | Thug / punishment for thug | Obsolete colonial |
| 312 | Causing miscarriage | MTP Act 1971 (2021 amend) |
| 377 | Unnatural offences | Read down Navtej Singh Johar (2018); not in BNS |
| 478 | Trade marks (defn) | Trade Marks Act 1999 |
| 480 | Using false trade mark | Trade Marks Act 1999 |
| 490 | Breach of contract of service during voyage | Repealed 1925 |
| 492 | Breach of contract at distant place | Repealed 1925 |
| 497 | Adultery | Struck down Joseph Shine (2018); not in BNS |

## Errors found in existing 302 mappings (pre-audit)
1. **IPC 305** had `new: "108"` but title "Abetment of suicide of child or insane person" — should be BNS **107** (BNS 108 covers general abetment of suicide). Fixed.
2. **IPC 326A/326B** mapped to `124`/`125` flat — corrected to `124(1)` and `124(2)` per BNS sub-section structure.
3. **IPC 330/331/332/333** mapped flat to `119/120/121/122` — added sub-section qualifiers `(1)/(2)` to match BNS hurt-to-public-servant grouping.
4. **IPC 366A** mapped to BNS 142; correct BNS section for "Procuration of child" is **96**. Fixed.
5. **IPC 370** and **366B** both mapped to `143` — kept 370 -> 143 (trafficking) and remapped 366B -> 141 (importation, child kidnapping cluster).
6. **IPC 380/381** showed `305(a)/305(b)` — verified correct against BNS 305 sub-clause structure.
7. **IPC 390-396** robbery/dacoity numbering was inconsistent (mix of `309(2)/(3)`, `310(2)/(3)/(4)`). Normalised: 390 -> 309(1) robbery defn; 391 -> 310(1) dacoity defn; 392 -> 309(2) punishment for robbery; 395 -> 310(2) punishment for dacoity; 396 -> 310(3) dacoity with murder; 399 -> 310(4) preparation; 400 -> 310(5) gang of dacoits; 402 -> 310(6) assembling. Punishment chain in 308 (extortion) similarly normalised to sub-sections (1)-(7).
8. **IPC 419** corrected from `319(1)` to `319(2)` (punishment sub-clause, not defn).
9. **IPC 498** title was "Marriage ceremony fraudulently gone through" but IPC 498 is "Enticing/detaining married woman" — old_title corrected; mapped to BNS 84 (enticing).
10. **IPC 442/447/448** house-trespass sub-clauses verified against BNS 329(2)/(3)/(4).
11. **IPC 489A-E** were partially mapped to BNS 179/180/181 flat — corrected to BNS 178(3)-(7) per BNS counterfeiting consolidation under section 178.
12. **IPC 153A** was mapped to BNS 196 — verified correct (promoting enmity). Existing entry kept.

## Risk flags
- **Blocker:** None.
- **Risk:** BNS counterfeiting (sections 178-181) collapses IPC's 230-263 + 489A-E series into a single section with multiple sub-clauses. Map uses `178(1)` through `178(25)` as best-effort numbering; advocate review needed against bare act text — flagging for Jharkhand advocate review batch.
- **Risk:** Some IPC sub-section -> BNS sub-section mappings (e.g. 308 extortion chain) are based on Ministry comparison table; recommend cross-check with Ranchi District Court templates before public release.
- **Acceptable:** Definitions chapter (IPC 6-52) merged variably into BNS 2 (definitions) and BNS 6-27 (interpretation). Mappings note `merged` type where IPC term is subsumed without dedicated BNS clause number.

## Schema compliance
- JSON valid (python3 -m json.tool passed)
- All entries include `new` (or null), `old_title`, `new_title` (or null), `type`
- `type` values used: `direct`, `merged`, `partial`, `repealed`
- `notes` added where context required (33 entries)

## File path
`/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/sections/ipc-to-bns.json`

Ready for next task.
