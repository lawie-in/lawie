# T-239 — Template catalogue: 92 to about 500 (epic)

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Matter context |
| Owner          | Ajay (catalogue, signs every template). Leads (build, by batch). Vikram (prices). Anushka (samples) |
| Mode           | One ticket per batch; full chain; legal content |
| Status         | Plan confirmed by Ajay with amendments, 12 Oct 2026 (founder's goal: about 500 templates by category). Batch 1 waits for T-240 and Ajay's signed specs |
| Depends on     | T-227 (price list in code), T-240 (category list in code) |

## Target: 508 templates (416 new)

C = court-level variant through a `court-rules/` overlay (no new id). S = state law differs, so one id per state.

| # | Category | Today | Target | C | S |
|---|---|---|---|---|---|
| 1 | Criminal: bail and custody | 7 | 35 | Y | Y (Bihar excise, UP Gangsters) |
| 2 | Criminal: complaints, police, trial applications | 2 | 40 | — | partial |
| 3 | Criminal: appeals, revisions, quashing | 4 | 20 | Y | — |
| 4 | Cheque bounce / NI Act | 1 | 10 | — | — |
| 5 | Civil: plaints and suits | 6 | 30 | Y | court fee only |
| 6 | Civil: defence and interlocutory | 7 | 35 | — | — |
| 7 | Civil: appeals, revision, review, execution | 0 | 20 | Y | — |
| 8 | Family and matrimonial | 8 | 35 | Y | — |
| 9 | Succession and probate | 0 | 10 | Y | — |
| 10 | Property and conveyancing | 11 | 35 | — | Y (stamp, registration, CNT/SPT) |
| 11 | Rent control and tenancy | 1 | 10 | — | Y |
| 12 | Revenue and land records | 0 | 15 | — | Y |
| 13 | Consumer | 1 | 12 | Y | — |
| 14 | Service and labour | 2 | 18 | Y | Y (waits for Labour Code rules) |
| 15 | Company and insolvency | 5 | 20 | — | — |
| 16 | Contracts and agreements | 7 | 30 | — | stamp only |
| 17 | Writs and constitutional | 11 | 22 | Y | — |
| 18 | Tax | 1 | 15 | — | — (waits) |
| 19 | IP | 0 | 12 | Y | — |
| 20 | Arbitration and commercial courts | 0 | 12 | Y | — |
| 21 | RERA | 1 | 6 | — | Y |
| 22 | MACT | 1 | 6 | — | — |
| 23 | Notices and replies | 7 | 22 | — | — |
| 24 | Affidavits and court forms | 9 | 25 | Y | Y |
| 25 | RTI | 0 | 5 | — | Y |
| 26 | Banking recovery: DRT and SARFAESI | 0 | 8 | — | — |

## Batches

| Batch | Theme | About |
|---|---|---|
| 1 | The most-needed gaps: criminal complaints and trial applications, NI Act, special-statute bail, CPC interlocutory applications, appeals and execution, family, succession, consumer, notices, deeds, RTI, contempt | 53 |
| 2 | Criminal: High Court appeals, appeal against acquittal, transfer; bail under POCSO, UP Gangsters, Arms, PMLA | 45 |
| 3 | Civil: the rest of interlocutory, execution objections, review, second appeal, more suits | 45 |
| 4 | Family and succession across personal laws; letters of administration; Supreme Court transfer petitions | 40 |
| 5 | State packs (Bihar, Jharkhand, UP, Delhi): rent control, revenue, stamp-sensitive deeds | 40 |
| 6 | Commercial: company/IBC, arbitration, commercial courts, DRT/SARFAESI, the rest of the NI Act | 45 |
| 7 | The rest of contracts and conveyancing | 45 |
| 8 | Consumer, RERA and MACT remainders; service/labour once rules settle | 40 |
| 9 | Writs, RTI, the rest of notices and affidavits | 37 |
| 10 | Tax (Income-tax Act 2025, GST) and IP: last, held until verified | 26 |

Batch 1 is 53 ids: 28 short and 25 long.
- The full list (id, title, category, court, statute, averments, Ink) is in Ajay's plan, posted to his session. Each id gets a signed spec under `handoff/legal/T-239-b1-<id>-signed.md`.
- Every citation marked "verify" stays blocked until Ajay has checked it against the bare act.

## Per template

- **Ajay writes and signs:** `relevantActs` (bare act, dated), mandatory clauses, prayer, verification, cause title, filing checklist (cues only, no amounts), legal prompt parts, the `_averments` entries, and the short/long proposal. He signs a spec under `handoff/legal/`.
- **The lead builds:**
  - `form_schema` from the spec (Ajay signs that diff);
  - the template's place in the seed, the promoter and the category list (T-240);
  - its explicit price (T-227);
  - tests: schema valid, price present, every BNS/BNSS/BSA citation in `config/sections/`, averments load.
- **Anushka samples:**
  - Tier A (liberty or limitation at stake): every template, twice (once with full facts, once with facts missing).
  - Tier B (other court filings): 1 in 3.
  - Tier C (deeds, notices, affidavits): 1 in 5, plus every state template.
  - A failed sample means she re-tests the whole category.

## Blockers and risks (Ajay)

- **Before batch 1:** T-240 moves the category out of the signed rule files and into a list in code, the way T-227 did for price.
- **Limitation:** `_default.json` bans "within limitation" and nothing unlocks it. Ajay writes limitation entries before batch 1 items #23, #28, #29, #30, #31, #41 and #43.
- **Criminal templates:** each asks for the date of offence/FIR and switches between IPC/CrPC and BNS/BNSS (BNSS s.531 savings).
- **State amounts:** stamp duty and court fees are never computed. A cue plus `{{MISSING}}` instead.
- **Jharkhand deeds:** need the CNT/SPT cue before batch 5.
- **Language:** English only in batch 1. Hindi is a separate track, with an advocate reviewer.
- **itat_appeal:** re-verify against the Income-tax Act 2025.
- **Release:** a practising advocate must check each batch before it goes live. Item for the founder's morning report: who that reviewer is.
- **Marketing:** no "500 templates" or "court-ready" claim until those templates have shipped and been signed. Ajay approves the copy.

## Ajay's amendments (12 Oct 2026)

- Specs live under `handoff/legal/`. Categories 15 and 26 are renamed (above).
- Citations #1–#12 and #17 are checked and correct. "verify" stays on #6, #14, #23, #28, #31, #34, #39 and #41.
- The S/L tiers agree with T-227.
- #12 moves to Tier A for sampling.
- Order: criminal specs #1–#17 first. Each spec is its own commit.

## Batch 1 signed specs

Building them needs T-240 and the T-245 mechanics (`procedure_code` and `governing_provision`).

| Specs | Commit | Notes |
|---|---|---|
| #7–#12 | 49bce36 | All 1 Ink. #11 is sampled every time (Tier A). #12 is the granting court only; the superior-court version becomes a batch 2 id, `modification_bail_conditions_superior_court` |
| #1–#6, #13, #15–#17 | 7112d14 | The criminal block is signed. **#14 bail_bihar_prohibition is HELD**: the Bihar Act sections are unchecked, so don't build it. #15 covers the accused's appeal only; the victim's appeal becomes a batch 2 id. #16 needs the DPDP s.9 note. Any IEA→BSA pair in #6, #13–#17 that T-250 changes goes back to Ajay. 16 of 17 are ready to build once T-240 and T-245a are in |

## Batch 1 is fully signed (Ajay, a4e7ace, 12 Oct 2026)

All 53 specs are done: 24 long (2 Ink) and 29 short (1 Ink). #14 bail_bihar_prohibition is HELD until Ajay has checked the Bihar Act sections.

Build tickets:
- T-257: criminal, 16 templates. Needs T-240 and T-245a.
- T-258: civil, 16.
- T-259: family, succession, consumer, 11.
- T-260: notices, deeds, RTI, contempt, 9.

T-258, T-259 and T-260 need only T-240, so they can start as soon as it merges. Each lead builds in their own batch file (T-240 point 9).

Batch 2: Ajay starts the text for the 3 highest-risk families now, then pauses for Anushka's batch 1 results before the rest.

## Batch 2: first three families signed (Ajay, 96da5c8 and 21aa6d9, 12 Oct 2026)

11 specs, `handoff/legal/T-239-b2-<nn>-<id>-signed.md`. Ajay pauses the rest of batch 2 until Anushka's batch 1 results are in.

| # | id | Ink | Tier |
|---|---|---|---|
| 1–4 | bail_pocso, bail_up_gangsters, bail_arms_act, bail_pmla | 2 | A |
| 5–7 | criminal_appeal_sessions_from_magistrate, leave_to_appeal_acquittal_419, state_appeal_inadequate_sentence_418 | 2 | A |
| 8 | application_additional_evidence_432 | 1 | B |
| 9–10 | transfer_petition_hc_447, transfer_petition_sc_446 | 2 | B |
| 11 | transfer_application_sessions_448 | 1 | B |

Build notes: see T-265.
