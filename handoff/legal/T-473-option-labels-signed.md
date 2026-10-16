# T-473 option labels: Ajay sign-off

Reviewed: `handoff/legal/T-473-option-labels-for-ajay.md` on `fix/t-473-form-option-labels` @ 42bc94d0.
Decision: approved with the changes below. Every row not listed here is approved as "Now shows". Option ids unchanged. The wording in the tables is signed text: use it byte for byte.

## Court types

Approved as is: Supreme Court, Tribunal, Consumer Commission.

## Rules for all packs

| # | Rule |
|---|---|
| R1 | State names and court names in title case: "Uttar Pradesh", "High Court", "Supreme Court" (fixes `uttar_pradesh` in every pack, `mandamus` "SUPREME COURT", `vakalatnama` "High court"/"Supreme court"). |
| R2 | Do not drop "warning" where it is the relief itself (POSH). The drop rule applies to internal marker words only. |
| R3 | Bare Yes/No (A.2, 34 rows): approved as is. The question carries the meaning. |
| R4 | Where a section number below is removed, it is not verified. Do not add it back without my sign-off. |

## A.1 lost meaning

| Option id | Label |
|---|---|
| `no_licensee_takes_keys_flag_lease_re_characterisation_risk` | No, licensee takes the keys (risk: may be treated as a lease) |
| `not_applicable_different_mortgage_type` | Not applicable (a different kind of mortgage) |
| `not_obtained_flag_risk` | Not obtained (the partition may not bind the minor) |
| `warning_or_written_apology` | Warning or written apology |

## A.3 dropped word

| Option id | Label |
|---|---|
| `yes_flag_title_warning` | Yes (check title before any sale) |
| `yes_general_gpa_with_title_flag` | Yes, a general GPA (check title) |
| `no_being_excluded_for_specific_reason_flag` | No, excluded for a stated reason (check before signing) |

## A.4 abbreviation

| Option id | Label |
|---|---|
| `company_pvt_ltd_or_ltd` | Company (private or public limited) |

## A.5 section references (and the matching Section B rows)

| Pack | Option id | Label |
|---|---|---|
| discharge_application, criminal_revision | `s_250_bnss_sessions`, `sessions_trial_s250` | Sessions case (Section 250 BNSS) |
| discharge_application, criminal_revision | `s_262_bnss_warrant_magistrate`, `warrant_case_by_magistrate_s262` | Warrant case on police report (Section 262 BNSS) |
| discharge_application, criminal_revision | `s_268_bnss_warrant_magistrate_complaint`, `warrant_case_by_magistrate_complaint_s268` | Warrant case on complaint (Section 268 BNSS) |
| divorce_hma | `adultery_13_1_i` | Adultery (Section 13(1)(i)) |
| divorce_hma | `cruelty_13_1_ia` | Cruelty (Section 13(1)(ia)) |
| divorce_hma | `desertion_13_1_ib` | Desertion (Section 13(1)(ib)) |
| divorce_hma | `conversion_13_1_ii` | Conversion (Section 13(1)(ii)) |
| divorce_hma | `mental_disorder_13_1_iii` | Mental disorder (Section 13(1)(iii)) |
| divorce_hma | `communicable_disease_13_1_v` | Venereal disease in a communicable form (Section 13(1)(v)) |
| divorce_hma | `renunciation_13_1_vi` | Renounced the world (Section 13(1)(vi)) |
| divorce_hma | `presumption_of_death_13_1_vii` | Not heard of for seven years (Section 13(1)(vii)) |
| divorce_hma | `wife_pre_act_polygamy_13_2_i` | Wife: husband's other wife living, pre-Act marriage (Section 13(2)(i)) |
| divorce_hma | `wife_rape_sodomy_13_2_ii` | Wife: husband guilty of rape, sodomy or bestiality (Section 13(2)(ii)) |
| divorce_hma | `wife_decree_maintenance_13_2_iii` | Wife: maintenance decree or order, no cohabitation for one year (Section 13(2)(iii)) |
| divorce_hma | `wife_repudiation_minor_marriage_13_2_iv` | Wife: married before 15, repudiated before 18 (Section 13(2)(iv)) |
| divorce_sma | `adultery_27_1_a` | Adultery (Section 27(1)(a)) |
| divorce_sma | `desertion_27_1_b` | Desertion for two years (Section 27(1)(b)) |
| divorce_sma | `imprisonment_7yrs_27_1_c` | Imprisonment for seven years or more (Section 27(1)(c)) |
| divorce_sma | `cruelty_27_1_d` | Cruelty (Section 27(1)(d)) |
| divorce_sma | `mental_disorder_27_1_e` | Mental disorder (Section 27(1)(e)) |
| divorce_sma | `communicable_venereal_disease_27_1_f` | Venereal disease in a communicable form (Section 27(1)(f)) |
| divorce_sma | `presumption_of_death_27_1_h` | Not heard of for seven years (Section 27(1)(h)) |
| divorce_sma | `wife_rape_sodomy_27_1a_i` | Wife: husband guilty of rape, sodomy or bestiality (Section 27(1A)(i)) |
| divorce_sma | `wife_decree_maintenance_27_1a_ii` | Wife: maintenance decree or order, no cohabitation for one year (Section 27(1A)(ii)) |
| judicial_separation | `communicable_disease` | Venereal disease in a communicable form |
| dv_act_complaint | `physical_abuse_3_a` | Physical abuse |
| dv_act_complaint | `sexual_abuse_3_b` | Sexual abuse |
| dv_act_complaint | `verbal_emotional_abuse_3_c` | Verbal and emotional abuse |
| dv_act_complaint | `economic_abuse_3_d` | Economic abuse |
| dv_act_complaint | `harassment_dowry_3_explanation_i` | Harassment for dowry (Section 3(b)) |
| dv_act_complaint | `harm_injury_3_explanation_ii` | Harm, injury or danger to health or safety (Section 3(a)) |
| itat_appeal | `principal_commissioner_or_commissioner_revision_u_s_263_264` | Principal Commissioner or Commissioner: revision order |
| itat_appeal | `principal_commissioner_or_commissioner_u_s_271` | Principal Commissioner or Commissioner: penalty order |
| itat_appeal | `cit_appeals` | CIT (Appeals) |
| mortgage_deed | `simple_mortgage_s58_b` | Simple mortgage (Section 58(b)) |
| mortgage_deed | `mortgage_by_conditional_sale_s58_c` | Mortgage by conditional sale (Section 58(c)) |
| mortgage_deed | `usufructuary_mortgage_s58_d` | Usufructuary mortgage (Section 58(d)) |
| mortgage_deed | `english_mortgage_s58_e` | English mortgage (Section 58(e)) |
| mortgage_deed | `mortgage_by_deposit_of_title_deeds_equitable_s58_f` | Mortgage by deposit of title deeds (Section 58(f)) |
| mortgage_deed | `anomalous_mortgage_s58_g` | Anomalous mortgage (Section 58(g)) |
| plaint_eviction | `forfeiture_under_s111_g_tpa_breach_of_express_condition` | Forfeiture: breach of an express condition (Section 111(g) TPA) |
| plaint_eviction | `forfeiture_under_s111_g_tpa_denial_of_landlord_title` | Forfeiture: tenant denied the landlord's title (Section 111(g) TPA) |
| plaint_recovery | `art_19_money_payable_for_money_lent` | Money lent (Article 19) |
| plaint_recovery | `art_22_account_stated` | Account stated |
| plaint_recovery | `art_23_money_received` | Money received for the plaintiff's use |
| plaint_recovery | `art_34_promissory_note` | Promissory note |
| plaint_recovery | `art_35_dishonoured_cheque` | Dishonoured cheque |
| plaint_recovery | `art_55_breach_of_contract_for_payment` | Breach of contract (Article 55) |
| plaint_recovery | `art_113_residuary` | No other article applies (Article 113) |
| criminal_appeal | `complainant_against_acquittal_s419` | Complainant, appeal against acquittal (Section 419(4) BNSS) |
| criminal_appeal | `high_court_from_sessions_s415` | High Court, appeal from Sessions Court (Section 415 BNSS) |
| criminal_appeal | `sessions_court_from_magistrate_s418` | Sessions Court, appeal from a Magistrate |
| criminal_appeal | `sessions_court_from_judicial_magistrate_s419` | Sessions Court, appeal against acquittal by a Magistrate |
| review_petition | `hc_criminal_s413_bnss` | High Court (criminal) |

## Other wording (A.6 and Section B)

| Option id | Label |
|---|---|
| `shares_securities` | Shares or securities |
| `wife_husband` | Wife or husband |
| `parent_child` | Parent or child |
| `uncle_aunt` | Uncle or aunt |
| `no_unregistered` | No, unregistered |
| `muslim_sunni` | Muslim (Sunni) |
| `muslim_shia` | Muslim (Shia) |
| `where_petitioner_resides_respondent_outside_india` | Where petitioner resides (respondent outside India) |
| `yes_within_1_third` | Yes, within one-third |
| `no_exceeds_requires_heir_consent` | No, exceeds one-third (heirs' consent needed) |
| `yes_194_i_company_paying`, `yes_194_i` | Yes (payer: company or business) |
| `yes_194_ib_individual_paying`, `yes_194_ib` | Yes (payer: individual or HUF) |

## Not verified (verify), removed from labels above

- Limitation Act Articles 22, 23, 34, 35 as matched in the ids: verify. My reading is that account stated and money received sit under other articles.
- BNSS 418 and 419 for appeals to Sessions Court, and 413 for a criminal review in the High Court: verify. I read 413 as the "no appeal unless provided" rule, not a review power.
- Income-tax Act sections 263, 264, 271, 194-I, 194-IB: verify under the Income-tax Act 2025 (T-456). I read a s.264 order as not appealable to the ITAT.
- PWDV clause letters in the ids: the four kinds of abuse are in Explanation I to Section 3, not Section 3(b)-(d).

## Follow-up tickets (Priya)

| # | Ticket |
|---|---|
| F1 | Option ids carry wrong or unverified references and the model sees ids: the ids in "Not verified" above. Rename them with read-time aliases, or send the model the label instead. Until then, the prompt must not cite a section taken from an option id. My re-sign is needed. |
| F2 | itat_appeal: drop s.264 from the revision option once T-456 confirms. |
| F3 | Question labels, outside T-473: TDS thresholds in the lease question; "S.117 Mohammedan law" is a textbook section, not a statute (verify); POSH "S.2(n) categories" also lists Section 3(2) circumstances. |

## Byte check (Ajay, 16 Oct 2026): approved, fix/t-473-form-option-labels @ 2e845e68

- `apps/drafting/src/config/option-label-overrides.ts`: 79 of 79 ids match the signed tables byte for byte. There are no extra ids.
- R1: title case for an all-capitals court name, with "of", "and", "at", "for", "the" and "in" in lower case. For example "High Court of Delhi" is correct and confirmed.
- R2: "Warning or written apology" is kept.
- Old saved answers map to the new labels in `intake-brief.ts` and `draft-renderer.ts`. This is code only and no draft wording changes. OK.
- Follow-ups F1 to F3 are still open.
