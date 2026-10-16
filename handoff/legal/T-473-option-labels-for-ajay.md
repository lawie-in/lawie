# T-473: form option labels, for Ajay to review

The forms used to show internal option names as labels (for example `known_state_custody`). The app now turns them into readable text for display only; the option ids that are stored and used in drafting never change.
The rule (yours): drop the internal words "flag", "warning", "cat" (with its number) and "type" from labels; capitalise the rest; keep known abbreviations in capitals.
Where the result could read ambiguously (two options in one question that look the same, or a bare Yes/No), the row is marked for a hand-written label.
Please do this: in Section A, write your wording in the last column for each row, or leave it blank to accept "Now shows". In Section B, tell us only the ones you want changed.
No pack JSON was edited. Your wording will go in after you reply. Ajay ref: pending.
Totals: 717 options in 55 packs; 263 need a decision (Section A), 454 are listed for the record (Section B).

## Court type labels (new wording, please approve)

These match the web's existing saved-court names. Before, `tribunal` and `consumer_commission` showed their raw ids.

| Court type id         | Now shows           | Ajay's wording |
| --------------------- | ------------------- | -------------- |
| `supreme_court`       | Supreme Court       |                |
| `tribunal`            | Tribunal            |                |
| `consumer_commission` | Consumer Commission |                |

## Intake brief step

The brief's answer choices now use the same readable wording as the forms, so the lists below apply to both.
The brief-step options come from the same rule packs and the same rule, so there are no extra rows.
Old saved briefs still match, because ids are unchanged.

## Section A: Needs a hand-written label (263 rows)

### A.1 lost-meaning (4 rows)

Why flagged: the shortened label may have lost the meaning.

| Pack                | Question (field label)                                                                         | Option id                                                    | Now shows                                             | Ajay's wording |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- | -------------- |
| `license_agreement` | Confirm: licensor retains legal possession and control                                         | `no_licensee_takes_keys_flag_lease_re_characterisation_risk` | No licensee takes keys lease re characterisation risk |                |
| `mortgage_deed`     | If equitable mortgage by deposit of title deeds — is execution at notified town under S.58(f)? | `not_applicable_different_mortgage_type`                     | Not applicable different mortgage                     |                |
| `partition_deed`    | Court permission obtained for minor's interest?                                                | `not_obtained_flag_risk`                                     | Not obtained risk                                     |                |
| `posh_complaint`    | Final relief sought (S.13)                                                                     | `warning_or_written_apology`                                 | Or written apology                                    |                |

### A.2 bare-yes-no (34 rows)

Why flagged: the label is only Yes or No.

| Pack                     | Question (field label)                                         | Option id | Now shows | Ajay's wording |
| ------------------------ | -------------------------------------------------------------- | --------- | --------- | -------------- |
| `bail_anticipatory`      | Whether the applicant has cooperated with the investigation    | `yes`     | Yes       |                |
| `bail_anticipatory`      | Whether the applicant has cooperated with the investigation    | `no`      | No        |                |
| `bail_anticipatory`      | Whether the applicant is named in the FIR                      | `yes`     | Yes       |                |
| `bail_anticipatory`      | Whether the applicant is named in the FIR                      | `no`      | No        |                |
| `bail_anticipatory`      | Whether the applicant is the only earning member of the family | `yes`     | Yes       |                |
| `bail_anticipatory`      | Whether the applicant is the only earning member of the family | `no`      | No        |                |
| `bail_before_magistrate` | Whether the applicant has cooperated with the investigation    | `yes`     | Yes       |                |
| `bail_before_magistrate` | Whether the applicant has cooperated with the investigation    | `no`      | No        |                |
| `bail_before_magistrate` | Whether the applicant is named in the FIR                      | `yes`     | Yes       |                |
| `bail_before_magistrate` | Whether the applicant is named in the FIR                      | `no`      | No        |                |
| `bail_before_magistrate` | Whether the applicant is the only earning member of the family | `yes`     | Yes       |                |
| `bail_before_magistrate` | Whether the applicant is the only earning member of the family | `no`      | No        |                |
| `bail_before_magistrate` | Sureties Available                                             | `yes`     | Yes       |                |
| `bail_before_magistrate` | Sureties Available                                             | `no`      | No        |                |
| `bail_regular`           | Whether the applicant has cooperated with the investigation    | `yes`     | Yes       |                |
| `bail_regular`           | Whether the applicant has cooperated with the investigation    | `no`      | No        |                |
| `bail_regular`           | Whether the applicant is named in the FIR                      | `yes`     | Yes       |                |
| `bail_regular`           | Whether the applicant is named in the FIR                      | `no`      | No        |                |
| `bail_regular`           | Whether the applicant is the only earning member of the family | `yes`     | Yes       |                |
| `bail_regular`           | Whether the applicant is the only earning member of the family | `no`      | No        |                |
| `interim_bail`           | Whether the applicant has cooperated with the investigation    | `yes`     | Yes       |                |
| `interim_bail`           | Whether the applicant has cooperated with the investigation    | `no`      | No        |                |
| `interim_bail`           | Whether the applicant is named in the FIR                      | `yes`     | Yes       |                |
| `interim_bail`           | Whether the applicant is named in the FIR                      | `no`      | No        |                |
| `interim_bail`           | Whether the applicant is the only earning member of the family | `yes`     | Yes       |                |
| `interim_bail`           | Whether the applicant is the only earning member of the family | `no`      | No        |                |
| `itat_appeal`            | Stay application filed? (separate application)                 | `yes`     | yes       |                |
| `itat_appeal`            | Stay application filed? (separate application)                 | `no`      | no        |                |
| `mact_claim`             | Insurance valid on date of accident?                           | `yes`     | yes       |                |
| `mact_claim`             | Insurance valid on date of accident?                           | `no`      | no        |                |
| `sale_deed`              | Is the property agricultural land?                             | `yes`     | yes       |                |
| `sale_deed`              | Is the property agricultural land?                             | `no`      | no        |                |
| `surrender_application`  | Willingness to Cooperate with Investigation                    | `yes`     | Yes       |                |
| `will`                   | Video recording of execution made?                             | `no`      | no        |                |

### A.3 dropped-token (3 rows)

Why flagged: a word was dropped by the rule.

| Pack                          | Question (field label)                                                                                     | Option id                                    | Now shows                             | Ajay's wording |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------- | -------------- |
| `gpa`                         | Does GPA include power to sell immovable property?                                                         | `yes_flag_title_warning`                     | Yes title                             |                |
| `joint_development_agreement` | Is Landowner granting GPA to Developer for sales of Developer's share?                                     | `yes_general_gpa_with_title_flag`            | Yes general GPA with title            |                |
| `partition_deed`              | All living daughters / sons of daughters of coparceners included as coparceners (post-2005 HSA amendment)? | `no_being_excluded_for_specific_reason_flag` | No being excluded for specific reason |                |

### A.4 unknown-acronym (2 rows)

Why flagged: an abbreviation the app does not recognise.

| Pack         | Question (field label)            | Option id                | Now shows              | Ajay's wording |
| ------------ | --------------------------------- | ------------------------ | ---------------------- | -------------- |
| `lease_deed` | Is Lessee an individual / entity? | `company_pvt_ltd_or_ltd` | Company pvt ltd or ltd |                |
| `lease_deed` | Is Lessor an individual / entity? | `company_pvt_ltd_or_ltd` | Company pvt ltd or ltd |                |

### A.5 stiff-section (44 rows)

Why flagged: reads like a bare section reference.

| Pack                    | Question (field label)                              | Option id                                                     | Now shows                                                   | Ajay's wording |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | -------------- |
| `discharge_application` | Applicable BNSS section for discharge               | `s_250_bnss_sessions`                                         | S 250 BNSS sessions                                         |                |
| `discharge_application` | Applicable BNSS section for discharge               | `s_262_bnss_warrant_magistrate`                               | S 262 BNSS warrant magistrate                               |                |
| `discharge_application` | Applicable BNSS section for discharge               | `s_268_bnss_warrant_magistrate_complaint`                     | S 268 BNSS warrant magistrate complaint                     |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `cruelty_13_1_ia`                                             | Cruelty 13 1 ia                                             |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `desertion_13_1_ib`                                           | Desertion 13 1 ib                                           |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `adultery_13_1_i`                                             | Adultery 13 1 i                                             |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `conversion_13_1_ii`                                          | Conversion 13 1 II                                          |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `mental_disorder_13_1_iii`                                    | Mental disorder 13 1 III                                    |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `communicable_disease_13_1_v`                                 | Communicable disease 13 1 v                                 |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `renunciation_13_1_vi`                                        | Renunciation 13 1 VI                                        |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `presumption_of_death_13_1_vii`                               | Presumption of death 13 1 VII                               |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `wife_pre_act_polygamy_13_2_i`                                | Wife pre act polygamy 13 2 i                                |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `wife_rape_sodomy_13_2_ii`                                    | Wife rape sodomy 13 2 II                                    |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `wife_decree_maintenance_13_2_iii`                            | Wife decree maintenance 13 2 III                            |                |
| `divorce_hma`           | Grounds for divorce (multi-select S.13 HMA)         | `wife_repudiation_minor_marriage_13_2_iv`                     | Wife repudiation minor marriage 13 2 IV                     |                |
| `divorce_sma`           | Grounds for divorce u/s 27 SMA                      | `adultery_27_1_a`                                             | Adultery 27 1 a                                             |                |
| `divorce_sma`           | Grounds for divorce u/s 27 SMA                      | `desertion_27_1_b`                                            | Desertion 27 1 b                                            |                |
| `divorce_sma`           | Grounds for divorce u/s 27 SMA                      | `imprisonment_7yrs_27_1_c`                                    | Imprisonment 7yrs 27 1 c                                    |                |
| `divorce_sma`           | Grounds for divorce u/s 27 SMA                      | `cruelty_27_1_d`                                              | Cruelty 27 1 d                                              |                |
| `divorce_sma`           | Grounds for divorce u/s 27 SMA                      | `mental_disorder_27_1_e`                                      | Mental disorder 27 1 e                                      |                |
| `divorce_sma`           | Grounds for divorce u/s 27 SMA                      | `communicable_venereal_disease_27_1_f`                        | Communicable venereal disease 27 1 f                        |                |
| `divorce_sma`           | Grounds for divorce u/s 27 SMA                      | `presumption_of_death_27_1_h`                                 | Presumption of death 27 1 h                                 |                |
| `divorce_sma`           | Grounds for divorce u/s 27 SMA                      | `wife_rape_sodomy_27_1a_i`                                    | Wife rape sodomy 27 1A i                                    |                |
| `dv_act_complaint`      | Types of domestic violence pleaded (S.3 PWDV)       | `sexual_abuse_3_b`                                            | Sexual abuse 3 b                                            |                |
| `dv_act_complaint`      | Types of domestic violence pleaded (S.3 PWDV)       | `verbal_emotional_abuse_3_c`                                  | Verbal emotional abuse 3 c                                  |                |
| `dv_act_complaint`      | Types of domestic violence pleaded (S.3 PWDV)       | `economic_abuse_3_d`                                          | Economic abuse 3 d                                          |                |
| `dv_act_complaint`      | Types of domestic violence pleaded (S.3 PWDV)       | `harassment_dowry_3_explanation_i`                            | Harassment dowry 3 explanation i                            |                |
| `itat_appeal`           | First appellate authority whose order is challenged | `principal_commissioner_or_commissioner_revision_u_s_263_264` | Principal commissioner or commissioner revision u s 263 264 |                |
| `itat_appeal`           | First appellate authority whose order is challenged | `principal_commissioner_or_commissioner_u_s_271`              | Principal commissioner or commissioner u s 271              |                |
| `mortgage_deed`         | Type of mortgage per S.58 TPA                       | `simple_mortgage_s58_b`                                       | Simple mortgage S58 b                                       |                |
| `mortgage_deed`         | Type of mortgage per S.58 TPA                       | `mortgage_by_conditional_sale_s58_c`                          | Mortgage by conditional sale S58 c                          |                |
| `mortgage_deed`         | Type of mortgage per S.58 TPA                       | `usufructuary_mortgage_s58_d`                                 | Usufructuary mortgage S58 d                                 |                |
| `mortgage_deed`         | Type of mortgage per S.58 TPA                       | `english_mortgage_s58_e`                                      | English mortgage S58 e                                      |                |
| `mortgage_deed`         | Type of mortgage per S.58 TPA                       | `mortgage_by_deposit_of_title_deeds_equitable_s58_f`          | Mortgage by deposit of title deeds equitable S58 f          |                |
| `mortgage_deed`         | Type of mortgage per S.58 TPA                       | `anomalous_mortgage_s58_g`                                    | Anomalous mortgage S58 g                                    |                |
| `plaint_eviction`       | Ground for eviction                                 | `forfeiture_under_s111_g_tpa_breach_of_express_condition`     | Forfeiture under S111 g TPA breach of express condition     |                |
| `plaint_eviction`       | Ground for eviction                                 | `forfeiture_under_s111_g_tpa_denial_of_landlord_title`        | Forfeiture under S111 g TPA denial of landlord title        |                |
| `plaint_recovery`       | Limitation Act article relied upon and computation  | `art_19_money_payable_for_money_lent`                         | Art 19 money payable for money lent                         |                |
| `plaint_recovery`       | Limitation Act article relied upon and computation  | `art_22_account_stated`                                       | Art 22 account stated                                       |                |
| `plaint_recovery`       | Limitation Act article relied upon and computation  | `art_23_money_received`                                       | Art 23 money received                                       |                |
| `plaint_recovery`       | Limitation Act article relied upon and computation  | `art_34_promissory_note`                                      | Art 34 promissory note                                      |                |
| `plaint_recovery`       | Limitation Act article relied upon and computation  | `art_35_dishonoured_cheque`                                   | Art 35 dishonoured cheque                                   |                |
| `plaint_recovery`       | Limitation Act article relied upon and computation  | `art_55_breach_of_contract_for_payment`                       | Art 55 breach of contract for payment                       |                |
| `plaint_recovery`       | Limitation Act article relied upon and computation  | `art_113_residuary`                                           | Art 113 residuary                                           |                |

### A.6 short (176 rows)

Why flagged: very short label.

| Pack                          | Question (field label)                                                                 | Option id                   | Now shows                 | Ajay's wording |
| ----------------------------- | -------------------------------------------------------------------------------------- | --------------------------- | ------------------------- | -------------- |
| `amendment_of_pleadings`      | Applicant role in suit                                                                 | `third_party`               | Third party               |                |
| `amendment_of_pleadings`      | Pleading to be amended                                                                 | `written_statement`         | Written statement         |                |
| `amendment_of_pleadings`      | Pleading to be amended                                                                 | `counter_claim`             | Counter claim             |                |
| `amendment_of_pleadings`      | Non-Applicant role in suit                                                             | `third_party`               | Third party               |                |
| `amendment_of_pleadings`      | Stage of suit when amendment sought                                                    | `during_evidence`           | During evidence           |                |
| `amendment_of_pleadings`      | Stage of suit when amendment sought                                                    | `in_appeal`                 | In appeal                 |                |
| `cat_oa`                      | Service status                                                                         | `compulsorily_retired`      | Compulsorily retired      |                |
| `cat_oa`                      | Nature of service matter                                                               | `promotion_denial`          | Promotion denial          |                |
| `cat_oa`                      | Nature of service matter                                                               | `seniority_dispute`         | Seniority dispute         |                |
| `cat_oa`                      | Nature of service matter                                                               | `transfer_challenge`        | Transfer challenge        |                |
| `cat_oa`                      | Nature of service matter                                                               | `compulsory_retirement`     | Compulsory retirement     |                |
| `cat_oa`                      | Nature of service matter                                                               | `suspension_challenge`      | Suspension challenge      |                |
| `cat_oa`                      | Nature of service matter                                                               | `compassionate_appointment` | Compassionate appointment |                |
| `condonation_of_delay`        | Type of proceeding for which delay is sought to be condoned                            | `execution_petition`        | Execution petition        |                |
| `condonation_of_delay`        | Type of proceeding for which delay is sought to be condoned                            | `restoration_application`   | Restoration application   |                |
| `condonation_of_delay`        | Type of proceeding for which delay is sought to be condoned                            | `second_appeal`             | Second appeal             |                |
| `condonation_of_delay`        | Type of proceeding for which delay is sought to be condoned                            | `writ_petition`             | Writ petition             |                |
| `condonation_of_delay`        | Type of proceeding for which delay is sought to be condoned                            | `election_petition`         | Election petition         |                |
| `criminal_appeal`             | Appeal against                                                                         | `sentence_only`             | Sentence only             |                |
| `criminal_appeal`             | Appeal against                                                                         | `inadequate_sentence`       | Inadequate sentence       |                |
| `criminal_appeal`             | Appellant status                                                                       | `convicted_accused`         | Convicted accused         |                |
| `criminal_revision`           | Nature of impugned order                                                               | `cognizance_order`          | Cognizance order          |                |
| `criminal_revision`           | Nature of impugned order                                                               | `maintenance_order`         | Maintenance order         |                |
| `criminal_revision`           | Nature of impugned order                                                               | `sentencing_only`           | Sentencing only           |                |
| `divorce_mutual_consent`      | Governing statute                                                                      | `hma_1955`                  | HMA 1955                  |                |
| `divorce_mutual_consent`      | Governing statute                                                                      | `sma_1954`                  | SMA 1954                  |                |
| `fir_quashing`                | Interim relief sought                                                                  | `stay_investigation`        | Stay investigation        |                |
| `fir_quashing`                | Interim relief sought                                                                  | `stay_arrest`               | Stay arrest               |                |
| `fir_quashing`                | Petitioner arrested / apprehending arrest?                                             | `apprehending_arrest`       | Apprehending arrest       |                |
| `fir_quashing`                | Stage of investigation                                                                 | `investigation_pending`     | Investigation pending     |                |
| `gift_deed`                   | Property type                                                                          | `immovable_property`        | Immovable property        |                |
| `gift_deed`                   | Property type                                                                          | `movable_property`          | Movable property          |                |
| `gift_deed`                   | Property type                                                                          | `shares_securities`         | Shares securities         |                |
| `gift_deed`                   | Relationship of Donee to Donor                                                         | `wife_husband`              | Wife husband              |                |
| `gift_deed`                   | Relationship of Donee to Donor                                                         | `other_relative`            | Other relative            |                |
| `gift_deed`                   | State of execution & registration                                                      | `uttar_pradesh`             | Uttar pradesh             |                |
| `gpa`                         | Powers to be conferred (multi-select)                                                  | `collect_rent`              | Collect rent              |                |
| `gpa`                         | State of execution                                                                     | `uttar_pradesh`             | Uttar pradesh             |                |
| `gpa`                         | State of execution                                                                     | `executed_abroad`           | Executed abroad           |                |
| `guardianship_petition`       | Governing statute                                                                      | `both_concurrent`           | Both concurrent           |                |
| `guardianship_petition`       | Petitioner's relationship to minor                                                     | `grandparent_paternal`      | Grandparent paternal      |                |
| `guardianship_petition`       | Petitioner's relationship to minor                                                     | `grandparent_maternal`      | Grandparent maternal      |                |
| `guardianship_petition`       | Petitioner's relationship to minor                                                     | `uncle_aunt`                | Uncle aunt                |                |
| `guardianship_petition`       | Petitioner's relationship to minor                                                     | `sibling_major`             | Sibling major             |                |
| `guardianship_petition`       | Petitioner's relationship to minor                                                     | `step_parent`               | Step parent               |                |
| `guardianship_petition`       | Petitioner's relationship to minor                                                     | `other_relative`            | Other relative            |                |
| `habeas_corpus`               | Place of detention                                                                     | `unknown_completely`        | Unknown completely        |                |
| `ibc_application`             | Applicant type                                                                         | `bank_nbfc`                 | Bank NBFC                 |                |
| `ibc_application`             | Reply received to S.8 notice                                                           | `yes_disputing`             | Yes disputing             |                |
| `ibc_application`             | Reply received to S.8 notice                                                           | `yes_admitting`             | Yes admitting             |                |
| `ibc_application`             | Reply received to S.8 notice                                                           | `no_reply`                  | No reply                  |                |
| `itat_appeal`                 | Appellant type                                                                         | `assessee_individual`       | Assessee individual       |                |
| `itat_appeal`                 | Appellant type                                                                         | `assessee_huf`              | Assessee HUF              |                |
| `itat_appeal`                 | Appellant type                                                                         | `assessee_firm`             | Assessee firm             |                |
| `itat_appeal`                 | Appellant type                                                                         | `assessee_company`          | Assessee company          |                |
| `itat_appeal`                 | Appellant type                                                                         | `assessee_trust`            | Assessee trust            |                |
| `itat_appeal`                 | Appellant type                                                                         | `revenue_department`        | Revenue department        |                |
| `itat_appeal`                 | First appellate authority whose order is challenged                                    | `cit_appeals`               | CIT appeals               |                |
| `itat_appeal`                 | Stay application filed? (separate application)                                         | `not_applicable`            | Not applicable            |                |
| `joint_development_agreement` | Multiple landowners / co-owners?                                                       | `single_landowner`          | Single landowner          |                |
| `joint_development_agreement` | Applicable RERA authority                                                              | `bihar_rera`                | Bihar RERA                |                |
| `joint_development_agreement` | Applicable RERA authority                                                              | `jharkhand_rera`            | Jharkhand RERA            |                |
| `joint_development_agreement` | Applicable RERA authority                                                              | `not_applicable`            | Not applicable            |                |
| `joint_development_agreement` | State of execution                                                                     | `uttar_pradesh`             | Uttar pradesh             |                |
| `judicial_separation`         | Governing statute                                                                      | `hma_1955`                  | HMA 1955                  |                |
| `judicial_separation`         | Governing statute                                                                      | `sma_1954`                  | SMA 1954                  |                |
| `judicial_separation`         | Grounds for judicial separation (same as S.13 HMA grounds, available under S.10)       | `mental_disorder`           | Mental disorder           |                |
| `judicial_separation`         | Grounds for judicial separation (same as S.13 HMA grounds, available under S.10)       | `communicable_disease`      | Communicable disease      |                |
| `lease_deed`                  | Maintenance — major/structural                                                         | `lessee_all`                | Lessee all                |                |
| `lease_deed`                  | Maintenance — major/structural                                                         | `lessor_all`                | Lessor all                |                |
| `lease_deed`                  | Property type                                                                          | `residential_house`         | Residential house         |                |
| `lease_deed`                  | Property type                                                                          | `apartment_flat`            | Apartment flat            |                |
| `lease_deed`                  | Property type                                                                          | `commercial_shop`           | Commercial shop           |                |
| `lease_deed`                  | Property type                                                                          | `commercial_office`         | Commercial office         |                |
| `lease_deed`                  | Property type                                                                          | `commercial_warehouse`      | Commercial warehouse      |                |
| `lease_deed`                  | Property type                                                                          | `agricultural_land`         | Agricultural land         |                |
| `lease_deed`                  | Property type                                                                          | `open_plot`                 | Open plot                 |                |
| `lease_deed`                  | Renewal option present?                                                                | `no_renewal`                | No renewal                |                |
| `lease_deed`                  | State of execution                                                                     | `uttar_pradesh`             | Uttar pradesh             |                |
| `license_agreement`           | State of execution                                                                     | `uttar_pradesh`             | Uttar pradesh             |                |
| `mact_claim`                  | Driver license status at time of accident                                              | `valid_license`             | Valid license             |                |
| `mact_claim`                  | Driver license status at time of accident                                              | `expired_license`           | Expired license           |                |
| `mact_claim`                  | Driver license status at time of accident                                              | `no_license`                | No license                |                |
| `mact_claim`                  | Offending vehicle type                                                                 | `two_wheeler`               | Two wheeler               |                |
| `mandamus`                    | Court                                                                                  | `supreme_court`             | SUPREME COURT             |                |
| `mortgage_deed`               | Interest basis                                                                         | `simple_interest`           | Simple interest           |                |
| `mortgage_deed`               | Interest basis                                                                         | `compound_monthly`          | Compound monthly          |                |
| `mortgage_deed`               | Interest basis                                                                         | `compound_quarterly`        | Compound quarterly        |                |
| `mortgage_deed`               | Is mortgagee a Bank / NBFC?                                                            | `yes_nbfc`                  | Yes NBFC                  |                |
| `mortgage_deed`               | Repayment schedule — bullet / EMI / interest-only / on-demand                          | `emi_monthly`               | EMI monthly               |                |
| `mortgage_deed`               | Repayment schedule — bullet / EMI / interest-only / on-demand                          | `on_demand`                 | On demand                 |                |
| `mortgage_deed`               | State of execution                                                                     | `uttar_pradesh`             | Uttar pradesh             |                |
| `mou`                         | State of execution                                                                     | `uttar_pradesh`             | Uttar pradesh             |                |
| `partition_deed`              | Status — Mitakshara coparcenary / Dayabhaga / mixed                                    | `mitakshara_coparcenary`    | Mitakshara coparcenary    |                |
| `partition_deed`              | Status — Mitakshara coparcenary / Dayabhaga / mixed                                    | `mixed_school`              | Mixed school              |                |
| `partition_deed`              | State of execution                                                                     | `uttar_pradesh`             | Uttar pradesh             |                |
| `pil`                         | Fundamental / constitutional rights at stake                                           | `article_14`                | Article 14                |                |
| `pil`                         | Fundamental / constitutional rights at stake                                           | `article_19`                | Article 19                |                |
| `pil`                         | Direction for expert committee / amicus curiae / continuing mandamus sought?           | `yes_amicus`                | Yes amicus                |                |
| `pil`                         | Petitioner type                                                                        | `registered_society`        | Registered society        |                |
| `pil`                         | Petitioner type                                                                        | `registered_trust`          | Registered trust          |                |
| `pil`                         | Petitioner type                                                                        | `registered_ngo`            | Registered NGO            |                |
| `plaint_declaration`          | Plaintiff's current possession status (relevant for consequential relief)              | `in_possession`             | In possession             |                |
| `plaint_declaration`          | Plaintiff's current possession status (relevant for consequential relief)              | `joint_possession`          | Joint possession          |                |
| `plaint_declaration`          | Plaintiff's current possession status (relevant for consequential relief)              | `constructive_possession`   | Constructive possession   |                |
| `plaint_partition`            | Nature of property                                                                     | `ancestral_property`        | Ancestral property        |                |
| `plaint_recovery`             | Basis of recovery claim                                                                | `loan_agreement`            | Loan agreement            |                |
| `plaint_recovery`             | Basis of recovery claim                                                                | `promissory_note`           | Promissory note           |                |
| `plaint_recovery`             | Basis of recovery claim                                                                | `dishonoured_cheque`        | Dishonoured cheque        |                |
| `plaint_recovery`             | Basis of recovery claim                                                                | `account_stated`            | Account stated            |                |
| `plaint_recovery`             | Basis of recovery claim                                                                | `services_rendered`         | Services rendered         |                |
| `posh_complaint`              | Committee to receive complaint                                                         | `icc_workplace`             | ICC workplace             |                |
| `posh_complaint`              | Employment type                                                                        | `regular_employee`          | Regular employee          |                |
| `posh_complaint`              | Employment type                                                                        | `temporary_employee`        | Temporary employee        |                |
| `posh_complaint`              | Employment type                                                                        | `contract_worker`           | Contract worker           |                |
| `posh_complaint`              | Employment type                                                                        | `domestic_worker`           | Domestic worker           |                |
| `posh_complaint`              | Nature of sexual harassment (S.2(n) categories)                                        | `showing_pornography`       | Showing pornography       |                |
| `production_of_documents`     | Type of relief sought                                                                  | `all_three`                 | All three                 |                |
| `quashing_528_bnss`           | Grounds for quashing                                                                   | `procedural_illegality`     | Procedural illegality     |                |
| `quashing_528_bnss`           | What is sought to be quashed                                                           | `fir_only`                  | FIR only                  |                |
| `quashing_528_bnss`           | What is sought to be quashed                                                           | `chargesheet_only`          | Chargesheet only          |                |
| `quashing_528_bnss`           | What is sought to be quashed                                                           | `entire_proceedings`        | Entire proceedings        |                |
| `quashing_528_bnss`           | What is sought to be quashed                                                           | `summons_order`             | Summons order             |                |
| `quashing_528_bnss`           | What is sought to be quashed                                                           | `cognizance_order`          | Cognizance order          |                |
| `rcr_petition`                | Governing statute                                                                      | `hma_1955`                  | HMA 1955                  |                |
| `rcr_petition`                | Governing statute                                                                      | `sma_1954`                  | SMA 1954                  |                |
| `receiver_appointment`        | Nature of suit                                                                         | `partnership_dissolution`   | Partnership dissolution   |                |
| `receiver_appointment`        | Nature of suit                                                                         | `mortgage_foreclosure`      | Mortgage foreclosure      |                |
| `receiver_appointment`        | Nature of suit                                                                         | `specific_performance`      | Specific performance      |                |
| `receiver_appointment`        | Nature of suit                                                                         | `execution_proceedings`     | Execution proceedings     |                |
| `receiver_appointment`        | Nature of suit                                                                         | `trust_administration`      | Trust administration      |                |
| `release_deed`                | Relationship of Releasor to Releasee (governs whether co-sharer release / gift / sale) | `parent_child`              | Parent child              |                |
| `release_deed`                | State of execution                                                                     | `uttar_pradesh`             | Uttar pradesh             |                |
| `rera_complaint`              | Complainant type                                                                       | `individual_allottee`       | Individual allottee       |                |
| `rera_complaint`              | Complainant type                                                                       | `joint_allottees`           | Joint allottees           |                |
| `review_petition`             | Status of appeal / SLP against original order                                          | `appeal_pending`            | Appeal pending            |                |
| `review_petition`             | Status of appeal / SLP against original order                                          | `appeal_dismissed`          | Appeal dismissed          |                |
| `review_petition`             | Status of appeal / SLP against original order                                          | `slp_pending`               | SLP pending               |                |
| `review_petition`             | Status of appeal / SLP against original order                                          | `slp_dismissed`             | SLP dismissed             |                |
| `sale_deed`                   | Property type                                                                          | `agricultural_land`         | Agricultural land         |                |
| `sale_deed`                   | Property type                                                                          | `residential_plot`          | Residential plot          |                |
| `sale_deed`                   | Property type                                                                          | `residential_house`         | Residential house         |                |
| `sale_deed`                   | Property type                                                                          | `apartment_flat`            | Apartment flat            |                |
| `sale_deed`                   | Property type                                                                          | `commercial_shop`           | Commercial shop           |                |
| `sale_deed`                   | Property type                                                                          | `commercial_building`       | Commercial building       |                |
| `sale_deed`                   | Property type                                                                          | `industrial_plot`           | Industrial plot           |                |
| `sale_deed`                   | Stamp duty paid by                                                                     | `shared_equally`            | Shared equally            |                |
| `sale_deed`                   | State of execution & registration                                                      | `uttar_pradesh`             | Uttar pradesh             |                |
| `slp`                         | Type of impugned order                                                                 | `final_judgment`            | Final judgment            |                |
| `slp`                         | Type of impugned order                                                                 | `interlocutory_order`       | Interlocutory order       |                |
| `slp`                         | Type of impugned order                                                                 | `interim_order`             | Interim order             |                |
| `slp`                         | Type of impugned order                                                                 | `review_dismissal`          | Review dismissal          |                |
| `slp`                         | Was a review petition filed in HC? Status?                                             | `not_filed`                 | Not filed                 |                |
| `slp`                         | Was a review petition filed in HC? Status?                                             | `filed_pending`             | Filed pending             |                |
| `slp`                         | Was a review petition filed in HC? Status?                                             | `filed_dismissed`           | Filed dismissed           |                |
| `slp`                         | Was a review petition filed in HC? Status?                                             | `not_applicable`            | Not applicable            |                |
| `slp`                         | SLP type                                                                               | `slp_civil`                 | SLP civil                 |                |
| `slp`                         | SLP type                                                                               | `slp_criminal`              | SLP criminal              |                |
| `spa`                         | State of execution                                                                     | `uttar_pradesh`             | Uttar pradesh             |                |
| `spa`                         | State of execution                                                                     | `executed_abroad`           | Executed abroad           |                |
| `temporary_injunction_o39`    | Type of interim relief sought                                                          | `status_quo`                | Status quo                |                |
| `vakalatnama`                 | Variant                                                                                | `criminal_district`         | Criminal district         |                |
| `vakalatnama`                 | Variant                                                                                | `civil_district`            | Civil district            |                |
| `vakalatnama`                 | Variant                                                                                | `high_court`                | High court                |                |
| `vakalatnama`                 | Variant                                                                                | `supreme_court`             | Supreme court             |                |
| `will`                        | If Muslim — is total bequest within 1/3 of estate? (S.117 Mohammedan law)              | `not_applicable`            | Not applicable            |                |
| `will`                        | Medical certificate of sound mind attached?                                            | `not_attached`              | Not attached              |                |
| `will`                        | Will to be registered?                                                                 | `no_unregistered`           | No unregistered           |                |
| `will`                        | Testator religion (governs applicable succession law)                                  | `muslim_sunni`              | Muslim sunni              |                |
| `will`                        | Testator religion (governs applicable succession law)                                  | `muslim_shia`               | Muslim shia               |                |
| `writ_petition_civil`         | Type of writ sought                                                                    | `quo_warranto`              | Quo warranto              |                |
| `writ_petition_civil`         | Type of writ sought                                                                    | `habeas_corpus`             | Habeas corpus             |                |
| `writ_petition_criminal`      | Fundamental rights violated                                                            | `article_14`                | Article 14                |                |
| `writ_petition_criminal`      | Fundamental rights violated                                                            | `article_19`                | Article 19                |                |
| `writ_petition_criminal`      | Fundamental rights violated                                                            | `article_21`                | Article 21                |                |
| `writ_petition_criminal`      | Fundamental rights violated                                                            | `article_22`                | Article 22                |                |

## Section B: Everything else, for the record (454 rows)

### `amendment_of_pleadings` (3)

| Question                            | Option id                        | Now shows                      |
| ----------------------------------- | -------------------------------- | ------------------------------ |
| Stage of suit when amendment sought | `before_issues_framed`           | Before issues framed           |
| Stage of suit when amendment sought | `after_issues_before_evidence`   | After issues before evidence   |
| Stage of suit when amendment sought | `after_evidence_before_judgment` | After evidence before judgment |

### `cat_oa` (22)

| Question                                    | Option id                                      | Now shows                                    |
| ------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Employment category                         | `civilian_central_government`                  | Civilian central government                  |
| Employment category                         | `all_india_service`                            | All india service                            |
| Employment category                         | `psu_employee_under_ata_jurisdiction`          | PSU employee under ATA jurisdiction          |
| Employment category                         | `central_armed_force_civilian`                 | Central armed force civilian                 |
| Employment category                         | `other_central_employee`                       | Other central employee                       |
| Service status                              | `dismissed_under_challenge`                    | Dismissed under challenge                    |
| Service status                              | `removed_under_challenge`                      | Removed under challenge                      |
| Departmental remedy / representation status | `representation_made_no_reply_within_6_months` | Representation made no reply within 6 months |
| Departmental remedy / representation status | `representation_made_rejected`                 | Representation made rejected                 |
| Departmental remedy / representation status | `departmental_appeal_made_pending`             | Departmental appeal made pending             |
| Departmental remedy / representation status | `departmental_appeal_rejected`                 | Departmental appeal rejected                 |
| Departmental remedy / representation status | `departmental_remedy_not_required_or_illusory` | Departmental remedy not required or illusory |
| Nature of service matter                    | `disciplinary_penalty_minor`                   | Disciplinary penalty minor                   |
| Nature of service matter                    | `disciplinary_penalty_major`                   | Disciplinary penalty major                   |
| Nature of service matter                    | `removal_or_dismissal`                         | Removal or dismissal                         |
| Nature of service matter                    | `pay_fixation_or_arrears`                      | Pay fixation or arrears                      |
| Nature of service matter                    | `pension_or_retirement_benefits`               | Pension or retirement benefits               |
| Nature of service matter                    | `selection_or_recruitment_matter`              | Selection or recruitment matter              |
| Nature of service matter                    | `leave_or_allowances`                          | Leave or allowances                          |
| Nature of service matter                    | `acr_or_apar_grading`                          | ACR or APAR grading                          |
| Nature of service matter                    | `deputation_or_repatriation`                   | Deputation or repatriation                   |
| Nature of service matter                    | `other_service_grievance`                      | Other service grievance                      |

### `criminal_appeal` (8)

| Question         | Option id                                         | Now shows                                       |
| ---------------- | ------------------------------------------------- | ----------------------------------------------- |
| Appeal against   | `conditions_of_release`                           | Conditions of release                           |
| Appellant status | `state_against_acquittal`                         | State against acquittal                         |
| Appellant status | `complainant_against_acquittal_s419`              | Complainant against acquittal S419              |
| Appellant status | `victim_against_inadequate_sentence_or_acquittal` | Victim against inadequate sentence or acquittal |
| Appellate forum  | `high_court_from_sessions_s415`                   | High court from sessions S415                   |
| Appellate forum  | `high_court_from_sessions_acquittal_appeal`       | High court from sessions acquittal appeal       |
| Appellate forum  | `sessions_court_from_magistrate_s418`             | Sessions court from magistrate S418             |
| Appellate forum  | `sessions_court_from_judicial_magistrate_s419`    | Sessions court from judicial magistrate S419    |

### `criminal_revision` (7)

| Question                                     | Option id                                                | Now shows                                              |
| -------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Nature of impugned order                     | `framing_of_charge`                                      | Framing of charge                                      |
| Nature of impugned order                     | `refusal_to_discharge`                                   | Refusal to discharge                                   |
| Nature of impugned order                     | `process_summons_order`                                  | Process summons order                                  |
| Nature of impugned order                     | `interlocutory_no_revision`                              | Interlocutory no revision                              |
| Nature of impugned order                     | `conviction_by_magistrate_acquittal_appealed_separately` | Conviction by magistrate acquittal appealed separately |
| Nature of impugned order                     | `other_final_order`                                      | Other final order                                      |
| Status of petitioner in original proceedings | `third_party_aggrieved`                                  | Third party aggrieved                                  |

### `discharge_application` (8)

| Question                                                        | Option id                                   | Now shows                                 |
| --------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| Type of case before lower court                                 | `sessions_trial_s250`                       | Sessions trial S250                       |
| Type of case before lower court                                 | `warrant_case_by_magistrate_s262`           | Warrant case by magistrate S262           |
| Type of case before lower court                                 | `warrant_case_by_magistrate_complaint_s268` | Warrant case by magistrate complaint S268 |
| Type of case before lower court                                 | `special_court_session_level`               | Special court session level               |
| Type of case before lower court                                 | `special_court_magistrate_level`            | Special court magistrate level            |
| Stage — committed / cognizance taken / charges yet to be framed | `committed_to_sessions`                     | Committed to sessions                     |
| Stage — committed / cognizance taken / charges yet to be framed | `cognizance_taken_no_charges_framed`        | Cognizance taken no charges framed        |
| Stage — committed / cognizance taken / charges yet to be framed | `supplementary_chargesheet_filed`           | Supplementary chargesheet filed           |

### `divorce_hma` (4)

| Question                                      | Option id                                           | Now shows                                         |
| --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| Basis for territorial jurisdiction (S.19 HMA) | `where_marriage_solemnised`                         | Where marriage solemnised                         |
| Basis for territorial jurisdiction (S.19 HMA) | `where_respondent_resides`                          | Where respondent resides                          |
| Basis for territorial jurisdiction (S.19 HMA) | `where_parties_last_resided_together`               | Where parties last resided together               |
| Basis for territorial jurisdiction (S.19 HMA) | `where_petitioner_resides_respondent_outside_india` | Where petitioner resides respondent outside india |

### `divorce_mutual_consent` (4)

| Question               | Option id                             | Now shows                           |
| ---------------------- | ------------------------------------- | ----------------------------------- |
| Basis for jurisdiction | `where_marriage_solemnised`           | Where marriage solemnised           |
| Basis for jurisdiction | `where_respondent_resides`            | Where respondent resides            |
| Basis for jurisdiction | `where_parties_last_resided_together` | Where parties last resided together |
| Basis for jurisdiction | `where_petitioner_resides`            | Where petitioner resides            |

### `divorce_sma` (5)

| Question                                      | Option id                              | Now shows                            |
| --------------------------------------------- | -------------------------------------- | ------------------------------------ |
| Grounds for divorce u/s 27 SMA                | `wife_decree_maintenance_27_1a_ii`     | Wife decree maintenance 27 1A II     |
| Basis for territorial jurisdiction (S.31 SMA) | `where_marriage_solemnised`            | Where marriage solemnised            |
| Basis for territorial jurisdiction (S.31 SMA) | `where_respondent_resides`             | Where respondent resides             |
| Basis for territorial jurisdiction (S.31 SMA) | `where_parties_last_resided_together`  | Where parties last resided together  |
| Basis for territorial jurisdiction (S.31 SMA) | `where_petitioner_resides_three_years` | Where petitioner resides three years |

### `dv_act_complaint` (9)

| Question                                                                                                                                                | Option id                                            | Now shows                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Relationship to respondent (S.2(a) and S.2(f) PWDV)                                                                                                     | `live_in_partner_relationship_in_nature_of_marriage` | Live in partner relationship in nature of marriage |
| Relationship to respondent (S.2(a) and S.2(f) PWDV)                                                                                                     | `widowed_daughter_in_law`                            | Widowed daughter in law                            |
| Relationship to respondent (S.2(a) and S.2(f) PWDV)                                                                                                     | `mother_in_law`                                      | Mother in law                                      |
| Relationship to respondent (S.2(a) and S.2(f) PWDV)                                                                                                     | `other_female_in_family_relationship`                | Other female in family relationship                |
| Basis for territorial jurisdiction (S.27 PWDV — where aggrieved resides / carries on business / where respondent resides / where cause of action arose) | `where_aggrieved_resides`                            | Where aggrieved resides                            |
| Basis for territorial jurisdiction (S.27 PWDV — where aggrieved resides / carries on business / where respondent resides / where cause of action arose) | `where_respondent_resides`                           | Where respondent resides                           |
| Basis for territorial jurisdiction (S.27 PWDV — where aggrieved resides / carries on business / where respondent resides / where cause of action arose) | `where_cause_of_action_arose`                        | Where cause of action arose                        |
| Types of domestic violence pleaded (S.3 PWDV)                                                                                                           | `physical_abuse_3_a`                                 | Physical abuse 3 a                                 |
| Types of domestic violence pleaded (S.3 PWDV)                                                                                                           | `harm_injury_3_explanation_ii`                       | Harm injury 3 explanation II                       |

### `fir_quashing` (17)

| Question                                   | Option id                                                 | Now shows                                               |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------- |
| Interim relief sought                      | `stay_coercive_steps`                                     | Stay coercive steps                                     |
| Interim relief sought                      | `stay_chargesheet_filing`                                 | Stay chargesheet filing                                 |
| Interim relief sought                      | `no_interim_relief`                                       | No interim relief                                       |
| Petitioner arrested / apprehending arrest? | `arrested_in_custody`                                     | Arrested in custody                                     |
| Petitioner arrested / apprehending arrest? | `arrested_on_bail`                                        | Arrested on bail                                        |
| Petitioner arrested / apprehending arrest? | `no_arrest_threat_yet`                                    | No arrest threat yet                                    |
| Grounds for quashing invoked (one or more) | `category_1_no_offence_disclosed`                         | Category 1 no offence disclosed                         |
| Grounds for quashing invoked (one or more) | `category_2_no_cognizable_offence_no_magistrate_order`    | Category 2 no cognizable offence no magistrate order    |
| Grounds for quashing invoked (one or more) | `category_3_uncontroverted_allegations_no_offence`        | Category 3 uncontroverted allegations no offence        |
| Grounds for quashing invoked (one or more) | `category_4_only_non_cognizable_no_magistrate_order`      | Category 4 only non cognizable no magistrate order      |
| Grounds for quashing invoked (one or more) | `category_5_absurd_inherently_improbable`                 | Category 5 absurd inherently improbable                 |
| Grounds for quashing invoked (one or more) | `category_6_express_legal_bar_or_efficacious_alternative` | Category 6 express legal bar or efficacious alternative |
| Grounds for quashing invoked (one or more) | `category_7_mala_fide_vendetta`                           | Category 7 mala fide vendetta                           |
| Stage of investigation                     | `fir_just_registered`                                     | FIR just registered                                     |
| Stage of investigation                     | `section_180_statements_being_recorded`                   | Section 180 statements being recorded                   |
| Stage of investigation                     | `investigation_complete_chargesheet_pending`              | Investigation complete chargesheet pending              |
| Stage of investigation                     | `chargesheet_filed_cognizance_not_taken`                  | Chargesheet filed cognizance not taken                  |

### `gift_deed` (11)

| Question                                               | Option id                                 | Now shows                               |
| ------------------------------------------------------ | ----------------------------------------- | --------------------------------------- |
| Mode of acceptance by Donee                            | `physical_acceptance_with_possession`     | Physical acceptance with possession     |
| Mode of acceptance by Donee                            | `express_signed_acceptance_in_deed`       | Express signed acceptance in deed       |
| Mode of acceptance by Donee                            | `implied_acceptance_via_use`              | Implied acceptance via use              |
| Mode of acceptance by Donee                            | `acceptance_by_natural_guardian_minor`    | Acceptance by natural guardian minor    |
| Any conditions attached / revocation events specified? | `unconditional_and_absolute`              | Unconditional and absolute              |
| Any conditions attached / revocation events specified? | `conditional_subject_to_specified_events` | Conditional subject to specified events |
| Any conditions attached / revocation events specified? | `revocable_per_s126_grounds`              | Revocable per S126 grounds              |
| Property type                                          | `money_in_bank`                           | Money in bank                           |
| Has possession been delivered to Donee?                | `yes_simultaneous_with_deed`              | Yes simultaneous with deed              |
| Has possession been delivered to Donee?                | `yes_already_in_possession`               | Yes already in possession               |
| Has possession been delivered to Donee?                | `no_to_be_delivered_on_registration`      | No to be delivered on registration      |

### `gpa` (21)

| Question                                           | Option id                                          | Now shows                                        |
| -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Duration of GPA                                    | `until_revoked_by_grantor`                         | Until revoked by grantor                         |
| Duration of GPA                                    | `fixed_term_with_end_date`                         | Fixed term with end date                         |
| Duration of GPA                                    | `until_specified_event`                            | Until specified event                            |
| Does GPA include power to sell immovable property? | `no_only_management`                               | No only management                               |
| Powers to be conferred (multi-select)              | `manage_immovable_property`                        | Manage immovable property                        |
| Powers to be conferred (multi-select)              | `let_or_lease_property`                            | Let or lease property                            |
| Powers to be conferred (multi-select)              | `negotiate_sale_subject_to_registered_sale_deed`   | Negotiate sale subject to registered sale deed   |
| Powers to be conferred (multi-select)              | `operate_bank_accounts`                            | Operate bank accounts                            |
| Powers to be conferred (multi-select)              | `represent_in_court_litigation`                    | Represent in court litigation                    |
| Powers to be conferred (multi-select)              | `sign_legal_documents`                             | Sign legal documents                             |
| Powers to be conferred (multi-select)              | `file_tax_returns`                                 | File tax returns                                 |
| Powers to be conferred (multi-select)              | `appear_before_govt_authorities_municipal_rto_etc` | Appear before govt authorities municipal RTO etc |
| Powers to be conferred (multi-select)              | `manage_business_or_partnership_interest`          | Manage business or partnership interest          |
| Powers to be conferred (multi-select)              | `execute_contracts_general`                        | Execute contracts general                        |
| Powers to be conferred (multi-select)              | `give_evidence_or_swear_affidavits`                | Give evidence or swear affidavits                |
| Powers to be conferred (multi-select)              | `appoint_advocates_and_substitute_attorneys`       | Appoint advocates and substitute attorneys       |
| Authentication mode                                | `registered_under_s17_registration_act`            | Registered under S17 Registration Act            |
| Authentication mode                                | `consulate_attested_if_grantor_abroad`             | Consulate attested if grantor abroad             |
| Authentication mode                                | `apostilled_if_grantor_in_apostille_country`       | Apostilled if grantor in apostille country       |
| Revocability                                       | `revocable_at_grantor_will`                        | Revocable at grantor will                        |
| Revocability                                       | `irrevocable_for_consideration_s202_ica`           | Irrevocable for consideration S202 ICA           |

### `guardianship_petition` (11)

| Question                           | Option id                         | Now shows                       |
| ---------------------------------- | --------------------------------- | ------------------------------- |
| Governing statute                  | `gwa_1890_secular`                | GWA 1890 secular                |
| Governing statute                  | `hmga_1956_hindu`                 | HMGA 1956 hindu                 |
| Ground for petition                | `death_of_natural_guardian`       | Death of natural guardian       |
| Ground for petition                | `incapacity_of_natural_guardian`  | Incapacity of natural guardian  |
| Ground for petition                | `unfitness_of_natural_guardian`   | Unfitness of natural guardian   |
| Ground for petition                | `custody_dispute_between_parents` | Custody dispute between parents |
| Ground for petition                | `absence_of_natural_guardian`     | Absence of natural guardian     |
| Ground for petition                | `welfare_requires_appointment`    | Welfare requires appointment    |
| Petitioner's relationship to minor | `non_relative_guardian`           | Non relative guardian           |
| Type of guardianship sought        | `guardian_of_person`              | Guardian of person              |
| Type of guardianship sought        | `guardian_of_property`            | Guardian of property            |

### `habeas_corpus` (16)

| Question                                   | Option id                                             | Now shows                                           |
| ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| Has detention order been served on detenu? | `yes_with_grounds`                                    | Yes with grounds                                    |
| Has detention order been served on detenu? | `yes_grounds_not_served`                              | Yes grounds not served                              |
| Has detention order been served on detenu? | `no_order_served`                                     | No order served                                     |
| Place of detention                         | `known_state_custody`                                 | Known state custody                                 |
| Place of detention                         | `known_private_custody`                               | Known private custody                               |
| Place of detention                         | `unknown_likely_state`                                | Unknown likely state                                |
| Place of detention                         | `unknown_likely_private`                              | Unknown likely private                              |
| Type of detention                          | `police_custody_without_production_before_magistrate` | Police custody without production before magistrate |
| Type of detention                          | `police_custody_beyond_24_hours_without_remand`       | Police custody beyond 24 hours without remand       |
| Type of detention                          | `preventive_detention_under_special_law`              | Preventive detention under special law              |
| Type of detention                          | `illegal_private_confinement_minor`                   | Illegal private confinement minor                   |
| Type of detention                          | `illegal_private_confinement_adult_woman`             | Illegal private confinement adult woman             |
| Type of detention                          | `illegal_private_confinement_adult_male`              | Illegal private confinement adult male              |
| Type of detention                          | `custody_post_remand_but_remand_illegal`              | Custody post remand but remand illegal              |
| Type of detention                          | `missing_person_state_action_suspected`               | Missing person state action suspected               |
| Type of detention                          | `child_custody_dispute_unlawful_retention`            | Child custody dispute unlawful retention            |

### `ibc_application` (10)

| Question                     | Option id                              | Now shows                            |
| ---------------------------- | -------------------------------------- | ------------------------------------ |
| Applicant type               | `individual_financial_creditor`        | Individual financial creditor        |
| Applicant type               | `homebuyer_class_creditor`             | Homebuyer class creditor             |
| Applicant type               | `operational_creditor_supplier`        | Operational creditor supplier        |
| Applicant type               | `operational_creditor_employee`        | Operational creditor employee        |
| Applicant type               | `operational_creditor_government_dues` | Operational creditor government dues |
| Applicant type               | `corporate_applicant_self`             | Corporate applicant self             |
| Reply received to S.8 notice | `not_applicable_section_7_or_10`       | Not applicable section 7 or 10       |
| Section invoked              | `section_7_financial_creditor`         | Section 7 financial creditor         |
| Section invoked              | `section_9_operational_creditor`       | Section 9 operational creditor       |
| Section invoked              | `section_10_corporate_applicant`       | Section 10 corporate applicant       |

### `itat_appeal` (3)

| Question                                            | Option id                         | Now shows                       |
| --------------------------------------------------- | --------------------------------- | ------------------------------- |
| Appellant type                                      | `assessee_aop_boi`                | Assessee AOP BOI                |
| First appellate authority whose order is challenged | `national_faceless_appeal_centre` | National faceless appeal centre |
| First appellate authority whose order is challenged | `dispute_resolution_panel_drp`    | Dispute resolution panel DRP    |

### `joint_development_agreement` (18)

| Question                                                               | Option id                                     | Now shows                                   |
| ---------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| Consideration / sharing model                                          | `area_sharing_landowner_gets_specified_units` | Area sharing landowner gets specified units |
| Consideration / sharing model                                          | `revenue_sharing_percent_of_sale_proceeds`    | Revenue sharing percent of sale proceeds    |
| Consideration / sharing model                                          | `fixed_upfront_cash_plus_units`               | Fixed upfront cash plus units               |
| Consideration / sharing model                                          | `hybrid_area_plus_cash`                       | Hybrid area plus cash                       |
| Developer entity type                                                  | `private_limited_company`                     | Private limited company                     |
| Developer entity type                                                  | `public_limited_company`                      | Public limited company                      |
| Is Landowner granting GPA to Developer for sales of Developer's share? | `yes_limited_gpa_for_developer_share_sales`   | Yes limited GPA for developer share sales   |
| Is Landowner granting GPA to Developer for sales of Developer's share? | `no_separate_sale_deeds_for_each_unit`        | No separate sale deeds for each unit        |
| Multiple landowners / co-owners?                                       | `multiple_co_owners_all_parties`              | Multiple co owners all parties              |
| Project type                                                           | `residential_apartment_complex`               | Residential apartment complex               |
| Project type                                                           | `commercial_office_complex`                   | Commercial office complex                   |
| Project type                                                           | `mixed_use_residential_commercial`            | Mixed use residential commercial            |
| Project type                                                           | `individual_villa_or_row_house_layout`        | Individual villa or row house layout        |
| Project type                                                           | `retail_shopping_complex`                     | Retail shopping complex                     |
| Applicable RERA authority                                              | `uttar_pradesh_rera_uprera`                   | Uttar pradesh RERA UPRERA                   |
| Applicable RERA authority                                              | `delhi_rera_or_nct_authority`                 | Delhi RERA or NCT authority                 |
| RERA registration required (project > 500 sqm OR > 8 units)?           | `yes_rera_registration_mandatory`             | Yes RERA registration mandatory             |
| RERA registration required (project > 500 sqm OR > 8 units)?           | `no_below_rera_threshold`                     | No below RERA threshold                     |

### `judicial_separation` (6)

| Question                                                                         | Option id                             | Now shows                           |
| -------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| Grounds for judicial separation (same as S.13 HMA grounds, available under S.10) | `presumption_of_death`                | Presumption of death                |
| Grounds for judicial separation (same as S.13 HMA grounds, available under S.10) | `wife_specific_grounds`               | Wife specific grounds               |
| Basis for jurisdiction                                                           | `where_marriage_solemnised`           | Where marriage solemnised           |
| Basis for jurisdiction                                                           | `where_respondent_resides`            | Where respondent resides            |
| Basis for jurisdiction                                                           | `where_parties_last_resided_together` | Where parties last resided together |
| Basis for jurisdiction                                                           | `where_petitioner_resides`            | Where petitioner resides            |

### `lease_deed` (20)

| Question                                                                                     | Option id                              | Now shows                            |
| -------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| Structural alterations / fit-outs permitted?                                                 | `yes_with_consent_restoration_on_exit` | Yes with consent restoration on exit |
| Structural alterations / fit-outs permitted?                                                 | `no_strict_bar`                        | No strict bar                        |
| Structural alterations / fit-outs permitted?                                                 | `yes_no_restoration_required`          | Yes no restoration required          |
| Is Lessee an individual / entity?                                                            | `huf_through_karta`                    | HUF through karta                    |
| Is Lessor an individual / entity?                                                            | `huf_through_karta`                    | HUF through karta                    |
| Maintenance — major/structural                                                               | `lessor_major_lessee_minor`            | Lessor major lessee minor            |
| Maintenance — major/structural                                                               | `shared_specified_split`               | Shared specified split               |
| Property type                                                                                | `industrial_factory_shed`              | Industrial factory shed              |
| Renewal option present?                                                                      | `yes_at_lessee_option`                 | Yes at lessee option                 |
| Renewal option present?                                                                      | `yes_by_mutual_consent`                | Yes by mutual consent                |
| Escalation frequency                                                                         | `annual_on_anniversary`                | Annual on anniversary                |
| Escalation frequency                                                                         | `biennial_every_2_years`               | Biennial every 2 years               |
| Escalation frequency                                                                         | `triennial_every_3_years`              | Triennial every 3 years              |
| Escalation frequency                                                                         | `lock_in_no_escalation`                | Lock in no escalation                |
| Subletting permitted?                                                                        | `yes_with_lessor_consent`              | Yes with lessor consent              |
| Subletting permitted?                                                                        | `no_strict_bar`                        | No strict bar                        |
| Subletting permitted?                                                                        | `yes_to_associate_companies_only`      | Yes to associate companies only      |
| TDS applicable (rent > Rs.50K/month for individuals u/s 194-IB OR > Rs.2.4L/year u/s 194-I)? | `yes_194_i_company_paying`             | Yes 194 I company paying             |
| TDS applicable (rent > Rs.50K/month for individuals u/s 194-IB OR > Rs.2.4L/year u/s 194-I)? | `yes_194_ib_individual_paying`         | Yes 194 IB individual paying         |
| TDS applicable (rent > Rs.50K/month for individuals u/s 194-IB OR > Rs.2.4L/year u/s 194-I)? | `no_below_threshold`                   | No below threshold                   |

### `license_agreement` (22)

| Question                                                                                               | Option id                                                | Now shows                                              |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------ |
| GST applicable?                                                                                        | `yes_commercial_license_gst_on_fee`                      | Yes commercial license GST on fee                      |
| GST applicable?                                                                                        | `no_residential_exempt`                                  | No residential exempt                                  |
| Purpose / type of license                                                                              | `leave_and_license_residential_maharashtra_pattern`      | Leave and license residential maharashtra pattern      |
| Purpose / type of license                                                                              | `shop_or_office_license_use`                             | Shop or office license use                             |
| Purpose / type of license                                                                              | `warehouse_storage_license`                              | Warehouse storage license                              |
| Purpose / type of license                                                                              | `factory_workspace_license`                              | Factory workspace license                              |
| Purpose / type of license                                                                              | `co_working_seat_license`                                | Co working seat license                                |
| Purpose / type of license                                                                              | `stall_or_kiosk_in_mall_or_complex`                      | Stall or kiosk in mall or complex                      |
| Purpose / type of license                                                                              | `advertising_hoarding_or_billboard_license`              | Advertising hoarding or billboard license              |
| Purpose / type of license                                                                              | `rooftop_telecom_tower_license`                          | Rooftop telecom tower license                          |
| Purpose / type of license                                                                              | `event_space_license`                                    | Event space license                                    |
| Purpose / type of license                                                                              | `atm_kiosk_bank_license`                                 | ATM kiosk bank license                                 |
| Confirm: licensor retains legal possession and control                                                 | `yes_licensor_retains_possession_and_keys`               | Yes licensor retains possession and keys               |
| Confirm: license is for non-exclusive use OR for designated portion only (preserves license character) | `non_exclusive_designated_seat`                          | Non exclusive designated seat                          |
| Confirm: license is for non-exclusive use OR for designated portion only (preserves license character) | `exclusive_use_of_specific_portion_with_licensor_access` | Exclusive use of specific portion with licensor access |
| Confirm: license is for non-exclusive use OR for designated portion only (preserves license character) | `shared_use_with_others`                                 | Shared use with others                                 |
| Renewal option?                                                                                        | `renewable_by_mutual_consent`                            | Renewable by mutual consent                            |
| Renewal option?                                                                                        | `non_renewable_on_term_end`                              | Non renewable on term end                              |
| Renewal option?                                                                                        | `auto_renewal_unless_notice`                             | Auto renewal unless notice                             |
| TDS applicable?                                                                                        | `yes_194_i`                                              | Yes 194 I                                              |
| TDS applicable?                                                                                        | `yes_194_ib`                                             | Yes 194 IB                                             |
| TDS applicable?                                                                                        | `no_below_threshold`                                     | No below threshold                                     |

### `mact_claim` (3)

| Question      | Option id                        | Now shows                      |
| ------------- | -------------------------------- | ------------------------------ |
| Type of claim | `injury_claim_by_victim`         | Injury claim by victim         |
| Type of claim | `death_claim_by_legal_heirs`     | Death claim by legal heirs     |
| Type of claim | `minor_injury_claim_by_guardian` | Minor injury claim by guardian |

### `maintenance_bnss_144` (9)

| Question                                                                                                                          | Option id                              | Now shows                            |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| Applicant capacity                                                                                                                | `divorced_wife_not_remarried`          | Divorced wife not remarried          |
| Applicant capacity                                                                                                                | `minor_legitimate_child`               | Minor legitimate child               |
| Applicant capacity                                                                                                                | `minor_illegitimate_child`             | Minor illegitimate child             |
| Applicant capacity                                                                                                                | `major_child_unable_due_to_disability` | Major child unable due to disability |
| Applicant capacity                                                                                                                | `father_unable_to_maintain`            | Father unable to maintain            |
| Applicant capacity                                                                                                                | `mother_unable_to_maintain`            | Mother unable to maintain            |
| Basis for territorial jurisdiction (S.145 BNSS — where respondent is, or where applicant resides, or where last resided together) | `where_respondent_is`                  | Where respondent is                  |
| Basis for territorial jurisdiction (S.145 BNSS — where respondent is, or where applicant resides, or where last resided together) | `where_applicant_resides`              | Where applicant resides              |
| Basis for territorial jurisdiction (S.145 BNSS — where respondent is, or where applicant resides, or where last resided together) | `where_last_resided_together`          | Where last resided together          |

### `mandamus` (4)

| Question | Option id                 | Now shows               |
| -------- | ------------------------- | ----------------------- |
| Court    | `high_court_of_delhi`     | HIGH COURT OF DELHI     |
| Court    | `high_court_of_patna`     | HIGH COURT OF PATNA     |
| Court    | `high_court_of_jharkhand` | HIGH COURT OF JHARKHAND |
| Court    | `high_court_of_allahabad` | HIGH COURT OF ALLAHABAD |

### `mortgage_deed` (10)

| Question                                                                                       | Option id                                             | Now shows                                           |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Interest basis                                                                                 | `floating_linked_to_repo_rate`                        | Floating linked to repo rate                        |
| If equitable mortgage by deposit of title deeds — is execution at notified town under S.58(f)? | `yes_notified_town`                                   | Yes notified town                                   |
| If equitable mortgage by deposit of title deeds — is execution at notified town under S.58(f)? | `no_not_notified_invalid`                             | No not notified invalid                             |
| Is mortgagee a Bank / NBFC?                                                                    | `yes_bank_or_scheduled_fi`                            | Yes bank or scheduled FI                            |
| Is mortgagee a Bank / NBFC?                                                                    | `no_individual_or_other`                              | No individual or other                              |
| Is possession transferred to mortgagee (usufructuary or English)?                              | `yes_usufructuary_possession_with_rent_offset`        | Yes usufructuary possession with rent offset        |
| Is possession transferred to mortgagee (usufructuary or English)?                              | `yes_english_with_proviso_for_redemption`             | Yes english with proviso for redemption             |
| Is possession transferred to mortgagee (usufructuary or English)?                              | `no_simple_or_equitable_mortgagor_retains_possession` | No simple or equitable mortgagor retains possession |
| Repayment schedule — bullet / EMI / interest-only / on-demand                                  | `bullet_at_end_of_tenure`                             | Bullet at end of tenure                             |
| Repayment schedule — bullet / EMI / interest-only / on-demand                                  | `interest_only_during_tenure_bullet_principal`        | Interest only during tenure bullet principal        |

### `mou` (13)

| Question                         | Option id                                                | Now shows                                              |
| -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Overall binding character of MOU | `non_binding_except_specified_clauses`                   | Non binding except specified clauses                   |
| Overall binding character of MOU | `binding_subject_to_definitive_agreement`                | Binding subject to definitive agreement                |
| Overall binding character of MOU | `fully_binding_pre_contract`                             | Fully binding pre contract                             |
| Purpose of MOU                   | `mou_for_business_collaboration_partnership_exploration` | MOU for business collaboration partnership exploration |
| Purpose of MOU                   | `mou_for_distribution_or_agency_arrangement`             | MOU for distribution or agency arrangement             |
| Purpose of MOU                   | `mou_for_share_acquisition_or_investment`                | MOU for share acquisition or investment                |
| Purpose of MOU                   | `mou_for_joint_venture_company_formation`                | MOU for joint venture company formation                |
| Purpose of MOU                   | `mou_for_sale_or_purchase_of_assets_or_business`         | MOU for sale or purchase of assets or business         |
| Purpose of MOU                   | `mou_for_strategic_alliance_or_co_marketing`             | MOU for strategic alliance or co marketing             |
| Purpose of MOU                   | `mou_for_supply_or_service_arrangement`                  | MOU for supply or service arrangement                  |
| Purpose of MOU                   | `mou_for_real_estate_or_property_transaction`            | MOU for real estate or property transaction            |
| Purpose of MOU                   | `mou_for_settlement_of_dispute_pre_compromise`           | MOU for settlement of dispute pre compromise           |
| Purpose of MOU                   | `mou_for_employment_consulting_engagement`               | MOU for employment consulting engagement               |

### `partition_deed` (10)

| Question                                                                                                   | Option id                                                 | Now shows                                               |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| Court permission obtained for minor's interest?                                                            | `yes_court_order_no_and_date`                             | Yes court order no and date                             |
| Court permission obtained for minor's interest?                                                            | `not_required_no_minor`                                   | Not required no minor                                   |
| Court permission obtained for minor's interest?                                                            | `applied_for_pending`                                     | Applied for pending                                     |
| All living daughters / sons of daughters of coparceners included as coparceners (post-2005 HSA amendment)? | `yes_all_included`                                        | Yes all included                                        |
| All living daughters / sons of daughters of coparceners included as coparceners (post-2005 HSA amendment)? | `not_applicable_only_widows_or_no_daughters`              | Not applicable only widows or no daughters              |
| Method of partition                                                                                        | `partition_by_metes_and_bounds_specific_property_to_each` | Partition by metes and bounds specific property to each |
| Method of partition                                                                                        | `partition_into_specified_shares_then_property_allotted`  | Partition into specified shares then property allotted  |
| Method of partition                                                                                        | `partition_with_owelty_money_balancing_payment`           | Partition with owelty money balancing payment           |
| Will partition deed be registered?                                                                         | `yes_registered_mandatory_for_immovable`                  | Yes registered mandatory for immovable                  |
| Will partition deed be registered?                                                                         | `no_oral_partition_followed_by_memorandum`                | No oral partition followed by memorandum                |

### `pil` (11)

| Question                                                                     | Option id                    | Now shows                  |
| ---------------------------------------------------------------------------- | ---------------------------- | -------------------------- |
| Fundamental / constitutional rights at stake                                 | `article_21_life_dignity`    | Article 21 life dignity    |
| Fundamental / constitutional rights at stake                                 | `article_21_environment`     | Article 21 environment     |
| Fundamental / constitutional rights at stake                                 | `article_21_health`          | Article 21 health          |
| Fundamental / constitutional rights at stake                                 | `article_21_education`       | Article 21 education       |
| Fundamental / constitutional rights at stake                                 | `article_38_directive`       | Article 38 directive       |
| Fundamental / constitutional rights at stake                                 | `article_47_directive`       | Article 47 directive       |
| Fundamental / constitutional rights at stake                                 | `article_48a_environment`    | Article 48A environment    |
| Direction for expert committee / amicus curiae / continuing mandamus sought? | `yes_expert_committee`       | Yes expert committee       |
| Direction for expert committee / amicus curiae / continuing mandamus sought? | `yes_continuing_mandamus`    | Yes continuing mandamus    |
| Petitioner type                                                              | `individual_public_spirited` | Individual public spirited |
| Petitioner type                                                              | `section_8_company`          | Section 8 company          |

### `plaint_declaration` (14)

| Question                                                                                      | Option id                                                      | Now shows                                                                |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Consequential relief sought (mandatory unless plaintiff in possession; per Anathula Sudhakar) | `possession_of_property`                                       | Possession of property                                                   |
| Consequential relief sought (mandatory unless plaintiff in possession; per Anathula Sudhakar) | `injunction_against_interference`                              | Injunction against interference                                          |
| Consequential relief sought (mandatory unless plaintiff in possession; per Anathula Sudhakar) | `cancellation_of_document`                                     | Cancellation of document                                                 |
| Consequential relief sought (mandatory unless plaintiff in possession; per Anathula Sudhakar) | `recovery_of_office`                                           | Recovery of office                                                       |
| Consequential relief sought (mandatory unless plaintiff in possession; per Anathula Sudhakar) | `no_consequential_relief_plaintiff_in_possession_or_special_c` | No consequential relief plaintiff in possession or special circumstances |
| Nature of declaration sought                                                                  | `declaration_of_title_to_property`                             | Declaration of title to property                                         |
| Nature of declaration sought                                                                  | `declaration_of_status_legitimacy`                             | Declaration of status legitimacy                                         |
| Nature of declaration sought                                                                  | `declaration_of_status_marriage_validity`                      | Declaration of status marriage validity                                  |
| Nature of declaration sought                                                                  | `declaration_of_legal_character`                               | Declaration of legal character                                           |
| Nature of declaration sought                                                                  | `declaration_that_document_void_or_voidable`                   | Declaration that document void or voidable                               |
| Nature of declaration sought                                                                  | `declaration_of_right_to_office`                               | Declaration of right to office                                           |
| Nature of declaration sought                                                                  | `declaration_that_adoption_invalid`                            | Declaration that adoption invalid                                        |
| Nature of declaration sought                                                                  | `declaration_of_co_ownership`                                  | Declaration of co ownership                                              |
| Plaintiff's current possession status (relevant for consequential relief)                     | `out_of_possession`                                            | Out of possession                                                        |

### `plaint_eviction` (14)

| Question                        | Option id                                         | Now shows                                       |
| ------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| Ground for eviction             | `termination_of_month_to_month_tenancy_s106_tpa`  | Termination of month to month tenancy S106 TPA  |
| Ground for eviction             | `expiry_of_fixed_term_lease`                      | Expiry of fixed term lease                      |
| Ground for eviction             | `non_payment_of_rent_with_forfeiture_clause`      | Non payment of rent with forfeiture clause      |
| Ground for eviction             | `subletting_in_breach_of_lease`                   | Subletting in breach of lease                   |
| Why rent control NOT applicable | `premises_exempted_under_state_rent_act`          | Premises exempted under state rent act          |
| Why rent control NOT applicable | `rent_above_threshold_under_state_rent_act`       | Rent above threshold under state rent act       |
| Why rent control NOT applicable | `non_residential_premises_excluded`               | Non residential premises excluded               |
| Why rent control NOT applicable | `newly_constructed_premises_in_exemption_period`  | Newly constructed premises in exemption period  |
| Why rent control NOT applicable | `premises_in_area_not_covered_by_rent_act`        | Premises in area not covered by rent act        |
| Why rent control NOT applicable | `lease_to_company_or_psu_outside_rent_act`        | Lease to company or PSU outside rent act        |
| Tenancy type                    | `month_to_month_tenancy_s106_tpa`                 | Month to month tenancy S106 TPA                 |
| Tenancy type                    | `fixed_term_lease_expired`                        | Fixed term lease expired                        |
| Tenancy type                    | `lease_for_unexpired_term_with_forfeiture_clause` | Lease for unexpired term with forfeiture clause |
| Tenancy type                    | `tenancy_at_sufferance_after_expiry`              | Tenancy at sufferance after expiry              |

### `plaint_injunction` (3)

| Question                  | Option id                        | Now shows                      |
| ------------------------- | -------------------------------- | ------------------------------ |
| Type of injunction sought | `permanent_prohibitory_s38`      | Permanent prohibitory S38      |
| Type of injunction sought | `permanent_mandatory_s39`        | Permanent mandatory S39        |
| Type of injunction sought | `both_prohibitory_and_mandatory` | Both prohibitory and mandatory |

### `plaint_partition` (5)

| Question           | Option id                                                | Now shows                                              |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------ |
| Nature of property | `joint_hindu_family_mitakshara_coparcenary`              | Joint hindu family mitakshara coparcenary              |
| Nature of property | `joint_hindu_family_dayabhaga`                           | Joint hindu family dayabhaga                           |
| Nature of property | `joint_family_self_acquired_thrown_into_common_hotchpot` | Joint family self acquired thrown into common hotchpot |
| Nature of property | `co_owned_property_tenancy_in_common`                    | Co owned property tenancy in common                    |
| Nature of property | `co_owned_property_joint_tenancy`                        | Co owned property joint tenancy                        |

### `plaint_recovery` (3)

| Question                | Option id                    | Now shows                  |
| ----------------------- | ---------------------------- | -------------------------- |
| Basis of recovery claim | `goods_sold_and_delivered`   | Goods sold and delivered   |
| Basis of recovery claim | `money_had_and_received`     | Money had and received     |
| Basis of recovery claim | `breach_of_contract_damages` | Breach of contract damages |

### `plaint_specific_performance` (6)

| Question         | Option id                                  | Now shows                                |
| ---------------- | ------------------------------------------ | ---------------------------------------- |
| Type of contract | `agreement_to_sell_immovable_property`     | Agreement to sell immovable property     |
| Type of contract | `agreement_to_purchase_immovable_property` | Agreement to purchase immovable property |
| Type of contract | `agreement_for_lease`                      | Agreement for lease                      |
| Type of contract | `agreement_for_transfer_of_shares`         | Agreement for transfer of shares         |
| Type of contract | `agreement_for_supply_of_specific_goods`   | Agreement for supply of specific goods   |
| Type of contract | `other_contract_specifically_enforceable`  | Other contract specifically enforceable  |

### `posh_complaint` (26)

| Question                                                              | Option id                                                      | Now shows                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Committee to receive complaint                                        | `local_committee_district`                                     | Local committee district                                              |
| Employment type                                                       | `visitor_or_client`                                            | Visitor or client                                                     |
| Filed by self or authorised person                                    | `by_legal_heir_if_deceased`                                    | By legal heir if deceased                                             |
| Filed by self or authorised person                                    | `by_relative_or_friend_if_unable`                              | By relative or friend if unable                                       |
| Filed by self or authorised person                                    | `by_special_educator_if_disabled`                              | By special educator if disabled                                       |
| Filed by self or authorised person                                    | `by_co_worker_if_unable`                                       | By co worker if unable                                                |
| Final relief sought (S.13)                                            | `action_against_respondent_per_service_rules`                  | Action against respondent per service rules                           |
| Final relief sought (S.13)                                            | `deduction_compensation_from_respondent_salary`                | Deduction compensation from respondent salary                         |
| Final relief sought (S.13)                                            | `compensation_payment_to_complainant`                          | Compensation payment to complainant                                   |
| Final relief sought (S.13)                                            | `action_under_indian_penal_law_bns`                            | Action under indian penal law BNS                                     |
| Final relief sought (S.13)                                            | `any_other_relief`                                             | Any other relief                                                      |
| Interim relief sought (S.12) — transfer / leave / restraining contact | `transfer_of_aggrieved_woman_to_other_workplace`               | Transfer of aggrieved woman to other workplace                        |
| Interim relief sought (S.12) — transfer / leave / restraining contact | `transfer_of_respondent_to_other_workplace`                    | Transfer of respondent to other workplace                             |
| Interim relief sought (S.12) — transfer / leave / restraining contact | `grant_of_leave_up_to_3_months`                                | Grant of leave up to 3 months                                         |
| Interim relief sought (S.12) — transfer / leave / restraining contact | `restraining_respondent_from_reporting_on_work_performance`    | Restraining respondent from reporting on work performance             |
| Interim relief sought (S.12) — transfer / leave / restraining contact | `restraining_respondent_from_supervising_academic_or_professi` | Restraining respondent from supervising academic or professional work |
| Interim relief sought (S.12) — transfer / leave / restraining contact | `any_other_relief`                                             | Any other relief                                                      |
| Nature of sexual harassment (S.2(n) categories)                       | `physical_contact_or_advances`                                 | Physical contact or advances                                          |
| Nature of sexual harassment (S.2(n) categories)                       | `demand_or_request_for_sexual_favours`                         | Demand or request for sexual favours                                  |
| Nature of sexual harassment (S.2(n) categories)                       | `sexually_coloured_remarks`                                    | Sexually coloured remarks                                             |
| Nature of sexual harassment (S.2(n) categories)                       | `other_unwelcome_physical_verbal_nonverbal_conduct_of_sexual_` | Other unwelcome physical verbal nonverbal conduct of sexual nature    |
| Nature of sexual harassment (S.2(n) categories)                       | `implied_or_explicit_promise_of_preferential_treatment`        | Implied or explicit promise of preferential treatment                 |
| Nature of sexual harassment (S.2(n) categories)                       | `implied_or_explicit_threat_of_detrimental_treatment`          | Implied or explicit threat of detrimental treatment                   |
| Nature of sexual harassment (S.2(n) categories)                       | `implied_or_explicit_threat_about_employment_status`           | Implied or explicit threat about employment status                    |
| Nature of sexual harassment (S.2(n) categories)                       | `interference_with_work_or_creating_intimidating_offensive_en` | Interference with work or creating intimidating offensive environment |
| Nature of sexual harassment (S.2(n) categories)                       | `humiliating_treatment_likely_to_affect_health_or_safety`      | Humiliating treatment likely to affect health or safety               |

### `production_of_documents` (4)

| Question              | Option id                | Now shows              |
| --------------------- | ------------------------ | ---------------------- |
| Type of relief sought | `discovery_o11_r12`      | Discovery O11 R12      |
| Type of relief sought | `production_o11_r14`     | Production O11 R14     |
| Type of relief sought | `inspection_o11_r15`     | Inspection O11 R15     |
| Type of relief sought | `interrogatories_o11_r1` | Interrogatories O11 R1 |

### `quashing_528_bnss` (9)

| Question                     | Option id                                         | Now shows                                       |
| ---------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| Grounds for quashing         | `no_offence_disclosed`                            | No offence disclosed                            |
| Grounds for quashing         | `ingredients_not_made_out`                        | Ingredients not made out                        |
| Grounds for quashing         | `facts_absurd_inherently_improbable`              | Facts absurd inherently improbable              |
| Grounds for quashing         | `express_legal_bar`                               | Express legal bar                               |
| Grounds for quashing         | `civil_dispute_criminal_colour`                   | Civil dispute criminal colour                   |
| Grounds for quashing         | `mala_fide_personal_vendetta`                     | Mala fide personal vendetta                     |
| Grounds for quashing         | `compromise_compoundable_offence`                 | Compromise compoundable offence                 |
| Grounds for quashing         | `settlement_in_matrimonial_or_commercial_dispute` | Settlement in matrimonial or commercial dispute |
| What is sought to be quashed | `complaint_case_proceedings`                      | Complaint case proceedings                      |

### `rcr_petition` (3)

| Question                           | Option id                             | Now shows                           |
| ---------------------------------- | ------------------------------------- | ----------------------------------- |
| Basis for territorial jurisdiction | `where_marriage_solemnised`           | Where marriage solemnised           |
| Basis for territorial jurisdiction | `where_respondent_resides`            | Where respondent resides            |
| Basis for territorial jurisdiction | `where_parties_last_resided_together` | Where parties last resided together |

### `receiver_appointment` (1)

| Question       | Option id                          | Now shows                        |
| -------------- | ---------------------------------- | -------------------------------- |
| Nature of suit | `company_oppression_mismanagement` | Company oppression mismanagement |

### `release_deed` (9)

| Question                                                                               | Option id                                                    | Now shows                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Is release WITH consideration?                                                         | `yes_with_monetary_consideration`                            | Yes with monetary consideration                            |
| Is release WITH consideration?                                                         | `yes_with_non_monetary_consideration_natural_love`           | Yes with non monetary consideration natural love           |
| Is release WITH consideration?                                                         | `no_pure_relinquishment_treated_as_gift_if_to_non_co_sharer` | No pure relinquishment treated as gift if to non co sharer |
| Relationship of Releasor to Releasee (governs whether co-sharer release / gift / sale) | `co_sharer_or_co_heir_in_inherited_property`                 | Co sharer or co heir in inherited property                 |
| Relationship of Releasor to Releasee (governs whether co-sharer release / gift / sale) | `co_owner_purchased_jointly`                                 | Co owner purchased jointly                                 |
| Relationship of Releasor to Releasee (governs whether co-sharer release / gift / sale) | `co_partner_in_business_asset`                               | Co partner in business asset                               |
| Relationship of Releasor to Releasee (governs whether co-sharer release / gift / sale) | `unrelated_co_owner`                                         | Unrelated co owner                                         |
| Is releasee an existing co-sharer / co-owner?                                          | `yes_releasee_is_co_sharer_concessional_stamp`               | Yes releasee is co sharer concessional stamp               |
| Is releasee an existing co-sharer / co-owner?                                          | `no_releasee_acquires_anew_treat_as_gift_or_sale`            | No releasee acquires anew treat as gift or sale            |

### `rera_complaint` (12)

| Question            | Option id                                | Now shows                              |
| ------------------- | ---------------------------------------- | -------------------------------------- |
| Complainant type    | `association_of_allottees`               | Association of allottees               |
| Complainant type    | `promoter_against_allottee`              | Promoter against allottee              |
| Complainant type    | `real_estate_agent`                      | Real estate agent                      |
| Nature of grievance | `delay_in_possession`                    | Delay in possession                    |
| Nature of grievance | `refund_with_interest`                   | Refund with interest                   |
| Nature of grievance | `non_completion_of_promised_amenities`   | Non completion of promised amenities   |
| Nature of grievance | `deviation_from_sanctioned_plan`         | Deviation from sanctioned plan         |
| Nature of grievance | `defects_in_construction`                | Defects in construction                |
| Nature of grievance | `violation_of_advertisement_promises`    | Violation of advertisement promises    |
| Nature of grievance | `non_registration_of_project_under_rera` | Non registration of project under RERA |
| Nature of grievance | `failure_to_form_association`            | Failure to form association            |
| Nature of grievance | `wrongful_termination_by_promoter`       | Wrongful termination by promoter       |

### `review_petition` (10)

| Question                                      | Option id                                           | Now shows                                         |
| --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| Status of appeal / SLP against original order | `no_appeal_filed`                                   | No appeal filed                                   |
| Status of appeal / SLP against original order | `no_appeal_available`                               | No appeal available                               |
| Court jurisdictional basis for review         | `sc_article_137`                                    | SC article 137                                    |
| Court jurisdictional basis for review         | `hc_writ_article_226_inherent`                      | HC writ article 226 inherent                      |
| Court jurisdictional basis for review         | `hc_civil_order_47_cpc`                             | HC civil order 47 CPC                             |
| Court jurisdictional basis for review         | `hc_criminal_s413_bnss`                             | HC criminal S413 BNSS                             |
| Court jurisdictional basis for review         | `district_court_order_47_cpc`                       | District court order 47 CPC                       |
| Ground for review                             | `discovery_of_new_and_important_matter_or_evidence` | Discovery of new and important matter or evidence |
| Ground for review                             | `mistake_or_error_apparent_on_face_of_record`       | Mistake or error apparent on face of record       |
| Ground for review                             | `any_other_sufficient_reason`                       | Any other sufficient reason                       |

### `sale_deed` (5)

| Question        | Option id                        | Now shows                      |
| --------------- | -------------------------------- | ------------------------------ |
| Mode of payment | `full_advance_cash_demand_draft` | Full advance cash demand draft |
| Mode of payment | `instalments_with_dates`         | Instalments with dates         |
| Mode of payment | `cheque_with_no_and_bank`        | Cheque with no and bank        |
| Mode of payment | `rtgs_neft_with_utr`             | RTGS NEFT with UTR             |
| Mode of payment | `mix_part_cash_part_bank`        | Mix part cash part bank        |

### `spa` (17)

| Question                        | Option id                                                      | Now shows                                                           |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| SPA expires on                  | `completion_of_specified_transaction`                          | Completion of specified transaction                                 |
| SPA expires on                  | `fixed_end_date`                                               | Fixed end date                                                      |
| SPA expires on                  | `earlier_of_completion_or_date`                                | Earlier of completion or date                                       |
| Authentication mode             | `registered_under_s17_registration_act`                        | Registered under S17 Registration Act                               |
| Authentication mode             | `consulate_attested_if_grantor_abroad`                         | Consulate attested if grantor abroad                                |
| Authentication mode             | `apostilled_if_grantor_in_apostille_country`                   | Apostilled if grantor in apostille country                          |
| Specific transaction authorised | `execute_sale_deed_specified_property_to_specified_buyer`      | Execute sale deed specified property to specified buyer             |
| Specific transaction authorised | `execute_purchase_sale_deed_specified_property_from_specified` | Execute purchase sale deed specified property from specified seller |
| Specific transaction authorised | `execute_lease_deed_specified_property_to_specified_lessee`    | Execute lease deed specified property to specified lessee           |
| Specific transaction authorised | `represent_in_specified_case_and_court`                        | Represent in specified case and court                               |
| Specific transaction authorised | `operate_specified_bank_account_specific_purpose`              | Operate specified bank account specific purpose                     |
| Specific transaction authorised | `register_or_mutate_specified_property`                        | Register or mutate specified property                               |
| Specific transaction authorised | `appear_before_specified_authority_for_specified_matter`       | Appear before specified authority for specified matter              |
| Specific transaction authorised | `execute_partition_deed_for_specified_family`                  | Execute partition deed for specified family                         |
| Specific transaction authorised | `transfer_specified_securities_or_demat_account`               | Transfer specified securities or demat account                      |
| Specific transaction authorised | `collect_specified_dues_or_payments`                           | Collect specified dues or payments                                  |
| Specific transaction authorised | `sign_specified_contract_specified_party_specified_subject`    | Sign specified contract specified party specified subject           |

### `temporary_injunction_o39` (4)

| Question                      | Option id                       | Now shows                     |
| ----------------------------- | ------------------------------- | ----------------------------- |
| Type of interim relief sought | `prohibitory_injunction_o39_r1` | Prohibitory injunction O39 R1 |
| Type of interim relief sought | `mandatory_injunction_o39_r1`   | Mandatory injunction O39 R1   |
| Type of interim relief sought | `ad_interim_ex_parte`           | Ad interim ex parte           |
| Type of interim relief sought | `restraint_on_alienation`       | Restraint on alienation       |

### `will` (9)

| Question                                                                  | Option id                                                      | Now shows                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| If Muslim — is total bequest within 1/3 of estate? (S.117 Mohammedan law) | `yes_within_1_third`                                           | Yes within 1 third                                                             |
| If Muslim — is total bequest within 1/3 of estate? (S.117 Mohammedan law) | `no_exceeds_requires_heir_consent`                             | No exceeds requires heir consent                                               |
| Medical certificate of sound mind attached?                               | `yes_attached_for_aged_or_ill_testator`                        | Yes attached for aged or ill testator                                          |
| Probate jurisdiction applicable?                                          | `yes_property_in_bombay_calcutta_madras_hc_ordinary_original_` | Yes property in bombay calcutta madras HC ordinary original civil jurisdiction |
| Probate jurisdiction applicable?                                          | `yes_christian_parsi_will`                                     | Yes christian parsi will                                                       |
| Probate jurisdiction applicable?                                          | `no_hindu_will_outside_metros`                                 | No hindu will outside metros                                                   |
| Will to be registered?                                                    | `yes_registered_voluntary`                                     | Yes registered voluntary                                                       |
| Testator religion (governs applicable succession law)                     | `hindu_buddhist_sikh_jain`                                     | Hindu buddhist sikh jain                                                       |
| Video recording of execution made?                                        | `yes_for_evidentiary_value`                                    | Yes for evidentiary value                                                      |

### `writ_petition_civil` (3)

| Question                                                  | Option id                                                     | Now shows                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Alternative remedy — exhausted / unavailable / inadequate | `inadequate_or_illusory`                                      | Inadequate or illusory                                      |
| Alternative remedy — exhausted / unavailable / inadequate | `violation_of_natural_justice_or_fundamental_right_exception` | Violation of natural justice or fundamental right exception |
| Alternative remedy — exhausted / unavailable / inadequate | `vires_challenge_exception`                                   | Vires challenge exception                                   |

### `writ_petition_criminal` (12)

| Question          | Option id                              | Now shows                            |
| ----------------- | -------------------------------------- | ------------------------------------ |
| FIR status        | `fir_not_registered_despite_complaint` | FIR not registered despite complaint |
| FIR status        | `fir_registered_but_no_investigation`  | FIR registered but no investigation  |
| FIR status        | `fir_registered_biased_investigation`  | FIR registered biased investigation  |
| FIR status        | `no_fir_required_for_this_grievance`   | No FIR required for this grievance   |
| Type of grievance | `illegal_detention_short_of_habeas`    | Illegal detention short of habeas    |
| Type of grievance | `custodial_torture_or_death`           | Custodial torture or death           |
| Type of grievance | `refusal_to_register_fir`              | Refusal to register FIR              |
| Type of grievance | `biased_or_tardy_investigation`        | Biased or tardy investigation        |
| Type of grievance | `departmental_misconduct_by_police`    | Departmental misconduct by police    |
| Type of grievance | `request_for_cbi_or_sit_transfer`      | Request for CBI or sit transfer      |
| Type of grievance | `compensation_for_state_action`        | Compensation for state action        |
| Type of grievance | `fake_encounter_or_police_excess`      | Fake encounter or police excess      |
