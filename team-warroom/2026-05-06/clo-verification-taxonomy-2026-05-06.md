# Lawie Pre-Generation Verification Taxonomy
**Author:** Ajay (CLO) | **Date:** 2026-05-06 | **Status:** Draft for Arjun/Vikram/Meera

**Summary: 24 triggers across 7 categories. 17 RULE (deterministic), 7 LLM-assisted. 9 HARD BLOCK, 15 SOFT WARN.**

---

## A. Section vs Facts Mismatch (5 triggers)

| Trigger | Detection | Type | Severity | Clarification Q | Why it matters | Freq |
|---|---|---|---|---|---|---|
| BNS 103 (Murder) on living victim | Section=103 AND narrative regex `(survived\|injured\|hospitalised\|recovering\|alive\|treatment)` AND no `(died\|deceased\|expired\|death)` | LLM | HARD BLOCK | "You've selected BNS 103 (Murder) but the facts mention the victim is receiving treatment. Did the victim die? If not, BNS 109 (attempt to murder) or 117 (grievous hurt) may apply." | Filing murder charges on a living victim is a frivolous-pleading risk; magistrate dismissal | rare |
| BNS 105 (Culpable homicide) on living victim | Section=105 AND no death keywords in narrative | LLM | HARD BLOCK | "BNS 105 requires death of the victim. The narrative doesn't establish death — please confirm or revise the section." | Same as above | rare |
| BNS 117 (Grievous hurt) without grievous-hurt facts | Section=117 AND narrative lacks `(fracture\|permanent\|disfigur\|emasculat\|loss of\|20 days\|hospitalis)` | LLM | SOFT WARN | "BNS 117 requires grievous hurt as defined in s.116 (fracture, permanent damage, 20+ days hospitalisation). Are any of these present in your facts?" | Section 115 (simple hurt) likely correct; charge gets reduced anyway | sometimes |
| BNS 64 (Rape) on male victim without specifying gender | Section=64 AND narrative pronouns suggest male victim | LLM | HARD BLOCK | "BNS 64 (rape) applies where the victim is a woman. Please confirm the victim's gender — if male, see BNS 74-76 / POCSO." | Wrong-gender filing kills the FIR | rare |
| BNS 318 (Cheating) without inducement element | Section=318 AND narrative lacks `(induce\|deceive\|misrepresent\|false\|promise)` | LLM | SOFT WARN | "BNS 318 requires dishonest inducement. Could you specify what false representation was made?" | Drafts get returned for re-pleading | sometimes |

---

## B. Date / Number Consistency (4 triggers — all RULE)

| Trigger | Detection | Type | Severity | Clarification Q | Why it matters | Freq |
|---|---|---|---|---|---|---|
| FIR number-year vs FIR-date-year mismatch | Regex `(\d+)/(\d{4})` on FIR no, compare year-suffix to year of FIR date field | RULE | HARD BLOCK | "FIR number is 091/2021 but FIR date is 06.01.2026. Years don't match — which is correct?" | The v3 defect; magistrate flag | sometimes |
| Future date in past-event field | `field IN (incident_date, fir_date, arrest_date) AND value > today` | RULE | HARD BLOCK | "Incident date is 12.08.2027, which is in the future. Please correct." | Obvious typo, embarrassing if filed | sometimes |
| Petitioner age/DOB inconsistency | `today - dob != stated_age ± 1yr` | RULE | SOFT WARN | "Stated age is 28 but DOB gives 31. Please confirm." | Age affects juvenile, senior-citizen routes | often |
| Event-date precedes petitioner DOB | `incident_date < petitioner_dob` | RULE | HARD BLOCK | "Incident date is before petitioner's date of birth. Please verify." | Logical impossibility | rare |

---

## C. Jurisdictional Mismatch (3 triggers — all RULE)

| Trigger | Detection | Type | Severity | Clarification Q | Why it matters | Freq |
|---|---|---|---|---|---|---|
| Court state vs PS state mismatch | Lookup PS pincode/district to state; compare to court state | RULE | HARD BLOCK | "Court selected is Jharkhand HC but the police station is in Patna (Bihar). Should this be Patna HC?" | Wrong forum = return-of-paper | sometimes |
| Pecuniary jurisdiction breach | If consumer_complaint AND claim > 50,00,000 AND forum=District | RULE | HARD BLOCK | "Claim amount is Rs. 75 lakh, which exceeds District Consumer Commission limit (Rs. 50 lakh). Move to State Commission?" | s.34 CPA 2019 — ultra vires | sometimes |
| Forum vs cause-of-action mismatch | Doc=consumer_complaint AND offence_type=criminal | RULE | HARD BLOCK | "You've chosen Consumer Commission but the cause of action looks criminal. Did you mean a Magistrate complaint under BNSS 223?" | Forum-shopping inference | rare |

---

## D. Identity / Party (3 triggers)

| Trigger | Detection | Type | Severity | Clarification Q | Why it matters | Freq |
|---|---|---|---|---|---|---|
| Same name on both sides | Fuzzy match (Levenshtein < 2) petitioner vs respondent name | RULE | HARD BLOCK | "Petitioner and respondent appear to have the same name. Please verify." | Copy-paste error; cause-title defect | sometimes |
| Petitioner age < 18 | `age < 18` | RULE | SOFT WARN | "Petitioner is a minor. Application should typically be filed through a natural guardian/next friend per O.XXXII CPC. Continue?" | Maintainability objection | rare |
| Married female + only father's name | Title contains `(Smt\.|W/o)` AND only `S/o` provided, no `W/o` | RULE | SOFT WARN | "Petitioner is described as Smt. but only father's name is given. Add husband's name (W/o) for cause-title?" | District court convention; clerks reject | often |

---

## E. Procedural / Bailability (3 triggers — all RULE)

| Trigger | Detection | Type | Severity | Clarification Q | Why it matters | Freq |
|---|---|---|---|---|---|---|
| Anticipatory bail for bailable offence | doc=anticipatory_bail AND all sections in `bailable_set` (BNS 115, etc.) | RULE | HARD BLOCK | "All sections cited are bailable. Anticipatory bail under BNSS 482 isn't required — bail is a matter of right under BNSS 478. Proceed?" | Wastes court time; BCI ethics | sometimes |
| Regular bail without arrest | doc=regular_bail AND arrest_date empty | RULE | SOFT WARN | "No arrest date provided. If not yet arrested, anticipatory bail (BNSS 482) may be the correct route." | Maintainability | sometimes |
| Bail under non-existent / wrong section | Bail section not in BNSS 478-484 set | RULE | HARD BLOCK | "Section cited isn't in the BNSS bail chapter (478-484). Please correct." | Pleading defect | rare |

---

## F. Document-Specific (4 triggers — all RULE)

| Trigger | Detection | Type | Severity | Clarification Q | Why it matters | Freq |
|---|---|---|---|---|---|---|
| s.138 NI notice — no cheque amount | doc=legal_notice_s138 AND cheque_amount empty | RULE | HARD BLOCK | "Cheque amount is required for a s.138 NI Act notice. Please add." | Notice invalid | often |
| s.138 — no dishonour reason | dishonour_reason empty | RULE | HARD BLOCK | "Bank's dishonour reason (e.g., 'insufficient funds') is required to establish s.138 ingredients." | Cause of action incomplete | often |
| Rent agreement above registration threshold | rent_pm × 12 > 1,00,000 (varies by state) AND term ≥ 12mo AND registration=No | RULE | SOFT WARN | "Annual rent crosses the registration threshold for [state]. Unregistered, this is inadmissible under s.17 Registration Act. Register?" | Inadmissibility | sometimes |
| Vakalatnama without bar-enrolment no | doc=vakalatnama AND advocate_enrolment_no empty | RULE | HARD BLOCK | "Bar enrolment number missing. Required under BCI Rules." | Vakalatnama rejected by registry | often |

---

## G. Free-Text Red Flags (LLM-assisted only — 2 triggers)

| Trigger | Detection | Type | Severity | Clarification Q | Why it matters | Freq |
|---|---|---|---|---|---|---|
| Internal contradiction in narrative | LLM check: "Does this narrative contradict itself on who did what to whom?" | LLM | SOFT WARN | "The narrative says petitioner was at home at 9pm but also at the scene at 9:15pm. Please clarify the timeline." | False statement risk under BNS 227-229 | sometimes |
| Role inversion (petitioner = aggressor) | LLM: petitioner described as person who initiated assault despite filing as victim | LLM | HARD BLOCK | "The narrative suggests the petitioner was the aggressor. Should this be a defence-side draft, or are facts mis-stated?" | False FIR; criminal liability for advocate too | rare |

---

## Three Questions

**1. Haiku or Sonnet for LLM checks?** Use **Sonnet** for category A (section-facts) and category G (narrative contradictions); Haiku for nothing in this layer. Section-facts mismatch needs the model to reason over BNS definitions plus advocate-written Hinglish narratives — Haiku misses idiomatic death-vs-injury language ("zakhmi halat mein," "haalat naazuk thi") and won't reliably distinguish 117 from 115. The cost delta is ~Rs. 0.30 per draft; the cost of a missed murder-on-living-victim slipping through is reputational extinction. Vikram will push back — defend with: pre-gen check fires once per draft, not per token streamed; this is the cheapest place in the pipeline to put smart compute.

**2. Tone — respectful, not directive.** "We noticed the facts mention the victim is recovering. Could you confirm BNS 103 is the right section, or should this be 109/117?" — never "ERROR: incompatible." Three reasons: (a) the advocate is the legal authority, not us; directive tone implies we know better, which is both wrong and Rule 36-adjacent; (b) for HARD BLOCK we still phrase as "please resolve before we generate" — block the action, not the dignity; (c) advocate-respectful tone is a moat — competitors will sound like compilers.

**3. BCI Rule 36 / second-guessing risk.** The opposite — verification *reduces* liability. Rule 36 prohibits advertising and solicitation; it doesn't speak to product UX. The relevant frame is professional negligence (s.35 Advocates Act + BCI standards): a tool that silently produces a defective draft when red flags were detectable is closer to negligent assistance. Verification questions reframe Lawie as a careful drafting assistant that flags for advocate review — strengthening our disclaimer ("advocate is responsible for legal accuracy"). One guardrail: never phrase a clarification as legal advice ("you should file under 117 instead") — phrase as a question ("did you intend 103 or 117?"). The advocate decides; we ask.

Ready for next task.
