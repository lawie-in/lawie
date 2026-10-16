/**
 * Signed label text (Ajay, T-473, ref f1a18422, handoff/legal/T-473-option-labels-signed.md). Byte for byte; changes need CLO sign-off.
 *
 * Option id (lower-case) to its signed label. Generated from the signed tables
 * (A.1, A.3, A.4, A.5, Other wording); ids are unchanged, only the label shown.
 */
export const OPTION_LABEL_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  no_licensee_takes_keys_flag_lease_re_characterisation_risk:
    'No, licensee takes the keys (risk: may be treated as a lease)',
  not_applicable_different_mortgage_type: 'Not applicable (a different kind of mortgage)',
  not_obtained_flag_risk: 'Not obtained (the partition may not bind the minor)',
  warning_or_written_apology: 'Warning or written apology',
  yes_flag_title_warning: 'Yes (check title before any sale)',
  yes_general_gpa_with_title_flag: 'Yes, a general GPA (check title)',
  no_being_excluded_for_specific_reason_flag:
    'No, excluded for a stated reason (check before signing)',
  company_pvt_ltd_or_ltd: 'Company (private or public limited)',
  s_250_bnss_sessions: 'Sessions case (Section 250 BNSS)',
  sessions_trial_s250: 'Sessions case (Section 250 BNSS)',
  s_262_bnss_warrant_magistrate: 'Warrant case on police report (Section 262 BNSS)',
  warrant_case_by_magistrate_s262: 'Warrant case on police report (Section 262 BNSS)',
  s_268_bnss_warrant_magistrate_complaint: 'Warrant case on complaint (Section 268 BNSS)',
  warrant_case_by_magistrate_complaint_s268: 'Warrant case on complaint (Section 268 BNSS)',
  adultery_13_1_i: 'Adultery (Section 13(1)(i))',
  cruelty_13_1_ia: 'Cruelty (Section 13(1)(ia))',
  desertion_13_1_ib: 'Desertion (Section 13(1)(ib))',
  conversion_13_1_ii: 'Conversion (Section 13(1)(ii))',
  mental_disorder_13_1_iii: 'Mental disorder (Section 13(1)(iii))',
  communicable_disease_13_1_v: 'Venereal disease in a communicable form (Section 13(1)(v))',
  renunciation_13_1_vi: 'Renounced the world (Section 13(1)(vi))',
  presumption_of_death_13_1_vii: 'Not heard of for seven years (Section 13(1)(vii))',
  wife_pre_act_polygamy_13_2_i:
    "Wife: husband's other wife living, pre-Act marriage (Section 13(2)(i))",
  wife_rape_sodomy_13_2_ii:
    'Wife: husband guilty of rape, sodomy or bestiality (Section 13(2)(ii))',
  wife_decree_maintenance_13_2_iii:
    'Wife: maintenance decree or order, no cohabitation for one year (Section 13(2)(iii))',
  wife_repudiation_minor_marriage_13_2_iv:
    'Wife: married before 15, repudiated before 18 (Section 13(2)(iv))',
  adultery_27_1_a: 'Adultery (Section 27(1)(a))',
  desertion_27_1_b: 'Desertion for two years (Section 27(1)(b))',
  imprisonment_7yrs_27_1_c: 'Imprisonment for seven years or more (Section 27(1)(c))',
  cruelty_27_1_d: 'Cruelty (Section 27(1)(d))',
  mental_disorder_27_1_e: 'Mental disorder (Section 27(1)(e))',
  communicable_venereal_disease_27_1_f:
    'Venereal disease in a communicable form (Section 27(1)(f))',
  presumption_of_death_27_1_h: 'Not heard of for seven years (Section 27(1)(h))',
  wife_rape_sodomy_27_1a_i:
    'Wife: husband guilty of rape, sodomy or bestiality (Section 27(1A)(i))',
  wife_decree_maintenance_27_1a_ii:
    'Wife: maintenance decree or order, no cohabitation for one year (Section 27(1A)(ii))',
  communicable_disease: 'Venereal disease in a communicable form',
  physical_abuse_3_a: 'Physical abuse',
  sexual_abuse_3_b: 'Sexual abuse',
  verbal_emotional_abuse_3_c: 'Verbal and emotional abuse',
  economic_abuse_3_d: 'Economic abuse',
  harassment_dowry_3_explanation_i: 'Harassment for dowry (Section 3(b))',
  harm_injury_3_explanation_ii: 'Harm, injury or danger to health or safety (Section 3(a))',
  principal_commissioner_or_commissioner_revision_u_s_263_264:
    'Principal Commissioner or Commissioner: revision order',
  principal_commissioner_or_commissioner_u_s_271:
    'Principal Commissioner or Commissioner: penalty order',
  cit_appeals: 'CIT (Appeals)',
  simple_mortgage_s58_b: 'Simple mortgage (Section 58(b))',
  mortgage_by_conditional_sale_s58_c: 'Mortgage by conditional sale (Section 58(c))',
  usufructuary_mortgage_s58_d: 'Usufructuary mortgage (Section 58(d))',
  english_mortgage_s58_e: 'English mortgage (Section 58(e))',
  mortgage_by_deposit_of_title_deeds_equitable_s58_f:
    'Mortgage by deposit of title deeds (Section 58(f))',
  anomalous_mortgage_s58_g: 'Anomalous mortgage (Section 58(g))',
  forfeiture_under_s111_g_tpa_breach_of_express_condition:
    'Forfeiture: breach of an express condition (Section 111(g) TPA)',
  forfeiture_under_s111_g_tpa_denial_of_landlord_title:
    "Forfeiture: tenant denied the landlord's title (Section 111(g) TPA)",
  art_19_money_payable_for_money_lent: 'Money lent (Article 19)',
  art_22_account_stated: 'Account stated',
  art_23_money_received: "Money received for the plaintiff's use",
  art_34_promissory_note: 'Promissory note',
  art_35_dishonoured_cheque: 'Dishonoured cheque',
  art_55_breach_of_contract_for_payment: 'Breach of contract (Article 55)',
  art_113_residuary: 'No other article applies (Article 113)',
  complainant_against_acquittal_s419: 'Complainant, appeal against acquittal (Section 419(4) BNSS)',
  high_court_from_sessions_s415: 'High Court, appeal from Sessions Court (Section 415 BNSS)',
  sessions_court_from_magistrate_s418: 'Sessions Court, appeal from a Magistrate',
  sessions_court_from_judicial_magistrate_s419:
    'Sessions Court, appeal against acquittal by a Magistrate',
  hc_criminal_s413_bnss: 'High Court (criminal)',
  shares_securities: 'Shares or securities',
  wife_husband: 'Wife or husband',
  parent_child: 'Parent or child',
  uncle_aunt: 'Uncle or aunt',
  no_unregistered: 'No, unregistered',
  muslim_sunni: 'Muslim (Sunni)',
  muslim_shia: 'Muslim (Shia)',
  where_petitioner_resides_respondent_outside_india:
    'Where petitioner resides (respondent outside India)',
  yes_within_1_third: 'Yes, within one-third',
  no_exceeds_requires_heir_consent: "No, exceeds one-third (heirs' consent needed)",
  yes_194_i_company_paying: 'Yes (payer: company or business)',
  yes_194_i: 'Yes (payer: company or business)',
  yes_194_ib_individual_paying: 'Yes (payer: individual or HUF)',
  yes_194_ib: 'Yes (payer: individual or HUF)',
});
