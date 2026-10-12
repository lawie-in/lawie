/**
 * Catalogue batch: base, the 92 rule files that existed before T-239 batch 1.
 *
 * Each id's `category` is Ajay's signed filing (T-240, 12 Oct 2026); each
 * `price` is Vikram's T-227 Ink price (11 + 12 Oct 2026), unchanged. Kept as
 * a literal so every entry is visible in review.
 *
 * A new template goes in its own batch file (see ./index.ts), not here.
 */
import type { CatalogueBatch } from './types';

export const BASE_BATCH: CatalogueBatch = {
  name: 'base',
  templates: {
    // #1 criminal_bail_custody
    bail_regular: { category: 'criminal_bail_custody', price: 2 },
    bail_anticipatory: { category: 'criminal_bail_custody', price: 2 },
    bail_before_magistrate: { category: 'criminal_bail_custody', price: 2 },
    bail_cancellation: { category: 'criminal_bail_custody', price: 2 },
    default_bail: { category: 'criminal_bail_custody', price: 2 },
    interim_bail: { category: 'criminal_bail_custody', price: 2 },
    suspension_of_sentence: { category: 'criminal_bail_custody', price: 2 },
    // #2 criminal_complaints_police_trial
    discharge_application: { category: 'criminal_complaints_police_trial', price: 2 },
    surrender_application: { category: 'criminal_complaints_police_trial', price: 2 },
    // #3 criminal_appeals_revisions_quashing
    criminal_appeal: { category: 'criminal_appeals_revisions_quashing', price: 2 },
    criminal_revision: { category: 'criminal_appeals_revisions_quashing', price: 2 },
    fir_quashing: { category: 'criminal_appeals_revisions_quashing', price: 2 },
    quashing_528_bnss: { category: 'criminal_appeals_revisions_quashing', price: 2 },
    // #4 cheque_bounce_ni_act
    legal_notice_s138: { category: 'cheque_bounce_ni_act', price: 1 },
    // #5 civil_plaints_suits
    plaint_declaration: { category: 'civil_plaints_suits', price: 2 },
    plaint_eviction: { category: 'civil_plaints_suits', price: 2 },
    plaint_injunction: { category: 'civil_plaints_suits', price: 2 },
    plaint_partition: { category: 'civil_plaints_suits', price: 2 },
    plaint_recovery: { category: 'civil_plaints_suits', price: 2 },
    plaint_specific_performance: { category: 'civil_plaints_suits', price: 2 },
    // #6 civil_defence_interlocutory
    written_statement: { category: 'civil_defence_interlocutory', price: 2 },
    replication: { category: 'civil_defence_interlocutory', price: 2 },
    amendment_of_pleadings: { category: 'civil_defence_interlocutory', price: 1 },
    condonation_of_delay: { category: 'civil_defence_interlocutory', price: 1 },
    production_of_documents: { category: 'civil_defence_interlocutory', price: 1 },
    receiver_appointment: { category: 'civil_defence_interlocutory', price: 1 },
    temporary_injunction_o39: { category: 'civil_defence_interlocutory', price: 1 },
    // #7 civil_appeals_revision_review_execution
    review_petition: { category: 'civil_appeals_revision_review_execution', price: 2 },
    // #8 family_matrimonial
    divorce_hma: { category: 'family_matrimonial', price: 2 },
    divorce_mutual_consent: { category: 'family_matrimonial', price: 1 },
    divorce_sma: { category: 'family_matrimonial', price: 2 },
    dv_act_complaint: { category: 'family_matrimonial', price: 2 },
    guardianship_petition: { category: 'family_matrimonial', price: 2 },
    judicial_separation: { category: 'family_matrimonial', price: 2 },
    maintenance_bnss_144: { category: 'family_matrimonial', price: 1 },
    rcr_petition: { category: 'family_matrimonial', price: 2 },
    // #10 property_conveyancing
    gift_deed: { category: 'property_conveyancing', price: 2 },
    gpa: { category: 'property_conveyancing', price: 1 },
    joint_development_agreement: { category: 'property_conveyancing', price: 2 },
    lease_deed: { category: 'property_conveyancing', price: 2 },
    license_agreement: { category: 'property_conveyancing', price: 2 },
    mortgage_deed: { category: 'property_conveyancing', price: 2 },
    partition_deed: { category: 'property_conveyancing', price: 2 },
    release_deed: { category: 'property_conveyancing', price: 2 },
    sale_deed: { category: 'property_conveyancing', price: 2 },
    spa: { category: 'property_conveyancing', price: 1 },
    will: { category: 'property_conveyancing', price: 1 },
    // #11 rent_control_tenancy
    rent_agreement: { category: 'rent_control_tenancy', price: 1 },
    // #13 consumer
    consumer_complaint: { category: 'consumer', price: 2 },
    // #14 service_labour
    posh_complaint: { category: 'service_labour', price: 2 },
    cat_oa: { category: 'service_labour', price: 2 },
    // #15 company_insolvency
    aoa: { category: 'company_insolvency', price: 2 },
    moa: { category: 'company_insolvency', price: 2 },
    shareholders_agreement: { category: 'company_insolvency', price: 2 },
    founders_agreement: { category: 'company_insolvency', price: 2 },
    ibc_application: { category: 'company_insolvency', price: 2 },
    // #16 contracts_agreements
    nda: { category: 'contracts_agreements', price: 1 },
    service_agreement: { category: 'contracts_agreements', price: 1 },
    distribution_agreement: { category: 'contracts_agreements', price: 2 },
    employment_agreement: { category: 'contracts_agreements', price: 2 },
    franchise_agreement: { category: 'contracts_agreements', price: 2 },
    loan_agreement: { category: 'contracts_agreements', price: 2 },
    mou: { category: 'contracts_agreements', price: 1 },
    // #17 writs_constitutional
    certiorari: { category: 'writs_constitutional', price: 2 },
    curative_petition: { category: 'writs_constitutional', price: 2 },
    habeas_corpus: { category: 'writs_constitutional', price: 2 },
    interim_application: { category: 'writs_constitutional', price: 2 },
    mandamus: { category: 'writs_constitutional', price: 2 },
    pil: { category: 'writs_constitutional', price: 2 },
    quo_warranto: { category: 'writs_constitutional', price: 2 },
    slp: { category: 'writs_constitutional', price: 2 },
    writ_petition_civil: { category: 'writs_constitutional', price: 2 },
    writ_petition_criminal: { category: 'writs_constitutional', price: 2 },
    // #18 tax
    itat_appeal: { category: 'tax', price: 2 },
    // #21 rera
    rera_complaint: { category: 'rera', price: 2 },
    // #22 mact
    mact_claim: { category: 'mact', price: 2 },
    // #23 notices_replies
    legal_notice_breach_of_contract: { category: 'notices_replies', price: 1 },
    legal_notice_consumer_deficiency: { category: 'notices_replies', price: 1 },
    legal_notice_copyright_infringement: { category: 'notices_replies', price: 1 },
    legal_notice_defamation: { category: 'notices_replies', price: 1 },
    legal_notice_eviction: { category: 'notices_replies', price: 1 },
    legal_notice_trademark_infringement: { category: 'notices_replies', price: 1 },
    legal_notice_s80: { category: 'notices_replies', price: 1 },
    // #24 affidavits_court_forms
    affidavit_in_support: { category: 'affidavits_court_forms', price: 1 },
    counter_affidavit: { category: 'affidavits_court_forms', price: 1 },
    list_of_dates: { category: 'affidavits_court_forms', price: 1 },
    memo_of_parties: { category: 'affidavits_court_forms', price: 1 },
    rejoinder_affidavit: { category: 'affidavits_court_forms', price: 1 },
    restoration_application: { category: 'affidavits_court_forms', price: 1 },
    synopsis: { category: 'affidavits_court_forms', price: 1 },
    vakalatnama: { category: 'affidavits_court_forms', price: 1 },
    affidavit_identity: { category: 'affidavits_court_forms', price: 1 },
  },
};
