# T-610: matcher bail rules and bail keyword table (Ajay, signed 26 Oct 2026)

Live bail packs in the catalogue (landing-catalogue.json, 26 Oct): bail_regular, bail_anticipatory, bail_before_magistrate, default_bail, interim_bail, bail_cancellation. Packs that are hidden (NDPS, prohibition, JJ, SC/ST) get keywords when they go live, with my sign-off. **Both parts go in byte for byte; any change comes back to me.**

## (A) MATCH_SYSTEM_PROMPT bail rule (replaces the single bail line, ~line 40 of intake.prompts.ts)

```
- Bail: a person who has already been arrested or is in custody needs regular bail. A person who has not been arrested and expects to be arrested needs anticipatory bail (bail_anticipatory: s.482 BNSS, old s.438 CrPC). Never choose an anticipatory bail template when the description says the person has been arrested or is in custody. Never choose a regular bail template when the description says the person has not been arrested. If the description does not say which, use confidence "medium" and list both.
- Regular bail, which court: an application to the Court of Session or the High Court (s.483 BNSS, old s.439 CrPC) is bail_regular, including when a Magistrate has already refused bail. An application to a Magistrate (s.480 BNSS, old s.437 CrPC) is bail_before_magistrate. If the description names neither court, choose bail_regular with confidence "medium" and list bail_before_magistrate second.
- Default bail: choose default_bail only when the description asks for default or statutory bail because the police report was not filed within the period allowed (s.187(3) BNSS, old s.167(2) CrPC). A chargesheet that is still pending does not, on its own, make it default bail.
- Interim bail: choose interim_bail only when the description asks for interim or temporary bail until the main bail application is decided, or for a short period.
- Cancellation: choose bail_cancellation only when the description asks to cancel bail already granted to another person. Never choose it for a person who is seeking bail.
- Section 482: s.482 of the old CrPC is not bail; it is the High Court's inherent power (now s.528 BNSS). Treat s.482 as anticipatory bail only when the description says BNSS or asks for anticipatory bail.
```

## (B) config/intake/match-keywords.json (bail entries)

Rules for the code pass:
1. Keywords rank the top 3 only. They never draft on their own and never spend Ink.
2. Matching ignores case and normalises the prefixes `s.`, `sec.`, `section`, `u/s` and the forms `CrPC`, `Cr.P.C.`, `Cr PC`. Nukta variants (ज़मानत / जमानत) are treated as equal.
3. A section-number phrase counts only if the description also contains `bail`, `जमानत` or `ज़मानत`.

```json
{
  "bail_regular": ["regular bail", "sessions court bail", "bail before the sessions", "bail in the high court", "483 bnss", "439 crpc", "नियमित जमानत"],
  "bail_anticipatory": ["anticipatory bail", "apprehension of arrest", "apprehends arrest", "pre-arrest bail", "482 bnss", "438 crpc", "अग्रिम जमानत"],
  "bail_before_magistrate": ["bail before the magistrate", "magistrate bail", "480 bnss", "437 crpc"],
  "default_bail": ["default bail", "statutory bail", "187(3) bnss", "167(2) crpc"],
  "interim_bail": ["interim bail", "temporary bail", "अंतरिम जमानत"],
  "bail_cancellation": ["cancellation of bail", "cancel bail", "cancel the bail", "439(2) crpc"]
}
```

Tie rules (code, in this order):

| id | rule |
| --- | --- |
| T610-T1 | If a Magistrate refused or rejected bail (`magistrate refused`, `magistrate rejected`, `rejected by the magistrate`, `CJM rejected`, `refused by the magistrate`), bail_regular ranks first, even if a bail_before_magistrate phrase also matches. |
| T610-T2 | A bare `482`, or `482 crpc`, adds no weight to any bail pack (old CrPC s.482 means quashing). |
| T610-T3 | default_bail ranks first only on its own phrases. `chargesheet not filed` / `charge sheet pending` is not a keyword. |
| T610-T4 | bail_cancellation ranks first only on its own phrases. |
| T610-T5 | If anticipatory and regular phrases both match, keyword ranking stops and the model decides (rule A, arrested vs not arrested). |
| T610-T6 | The word `magistrate` alone is not a keyword: it appears in Sessions applications too ("the Magistrate refused"). |

Verify (not in the signed text): the BNSS sub-section for cancellation by the Court of Session / High Court (old s.439(2) CrPC). Only the CrPC form is listed until I confirm it.

| T610-F1 | (B) may be prettier-wrapped. The byte check compares parsed JSON (same keys, strings and order; whitespace ignored), with a canonical diff at READY. (A) stays byte for byte. |
| T610-F2 | T5 fallback: if anticipatory and regular phrases both match and the model fails twice, show bail_regular and bail_anticipatory as two unranked cards (fixed order, neither marked as suggested), with "None of these". Nothing is drafted or charged until the user picks. Fits T5. |
| T610-F3 | Rule 3: prefix matching stays. `bailable`, `non-bailable`, `जमानती` and `गैर-जमानती` count as the bail word: they are bail matters, and keywords only rank. |
| T610-F2a | Interim: option (a) accepted. In the F2 fallback the existing pick screen may pre-check the first card (bail_regular), because the user still has to press Continue and nothing is drafted or charged before that. That beats "not found". Condition: Priya opens a small web ticket (`unranked: true`, nothing pre-selected, Rajesh one line) and it is merged before the next prod cut after T-610. |
| T610-F2b | Bail guard on the F2 fallback: **the guard still runs**, so do not skip it. It only reorders and never removes or picks, under the T-127 signed cues. With T-622 nothing is pre-selected, so an order from the signed cues helps and does not suggest. If the cue is `arrested`, bail_regular goes first; if `expects`, bail_anticipatory goes first; if `both` or `none`, the fixed order from F2 applies. This amends F2 ("fixed order") for this case only. |

## T-610 byte check (Ajay, 26 Oct 2026): fix/t-610-regular-bail-match @ 023fe0a8

| id | result |
| --- | --- |
| T610-BC | **APPROVED.** (A): intake.prompts.ts lines 40–45 are byte-identical to my (A) block (cmp, 6 lines); the prompt hunk replaces only the old bail line. (B): `jq -c` of match-keywords.json is identical to my (B) block. The code carries T1 (refusal phrases as signed), T2 (bare 482 / 482 crpc / magistrate dropped), rule 3 (bail word, F3 prefix) and F2/F2a/F2b. The t292 and t482 prompt hashes were re-pinned only because of this prompt change. It counts as merged only at the develop_staging SHA that contains 023fe0a8, with T-622 in the same release. |
| T610-E1 | Edge: both phrase sets matched and the model answers `is_legal_drafting: false`. A description with bail phrases is legal drafting, so treat this as the F2 fallback (two cards, guard order per F2b), not no_match. Ruling now; it can ship in T-610 or as a follow-up before the T-610/T-622 prod cut. |
| T610-BC2 | E1 delta 023fe0a8 → 1917770a checked: comments plus the E1 branch in intake.service.ts (`needs_choice` with the T5 pair), and tests. No prompt, keyword or legal file changed. **Approved**; T610-BC covers the legal text. It counts as merged at the develop_staging SHA that contains 1917770a, with T-622. |
