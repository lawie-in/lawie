# T-365 AC6: card descriptions (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Covers all 92 packs in `apps/drafting/src/config/document-rules/`.

## Rules

- Each pack gets a top-level `card_description` field holding the exact line below. Template cards, the brief picker and "Browse document types" show only this field.
- `_meta.description` and `description` are internal notes and are never shown to a user. Retire `presentDescription` for card text. Those notes hold unvetted case citations and legal statements that I have not signed.
- A pack with no `card_description` shows no description line. Never fall back to `_meta`.
- Adding or changing a line needs a fresh sign-off. These lines are legal content.
- No case law, thresholds or time limits on cards. Sections are named only where the pack is built on that section.

## Lines

| Pack | `card_description` |
|---|---|
| `affidavit_identity` | A sworn affidavit confirming a person's identity, for banks, offices and property work. |
| `affidavit_in_support` | A sworn affidavit filed with a petition, suit or application to support its facts. |
| `amendment_of_pleadings` | An application under Order 6 Rule 17 CPC to amend a plaint or written statement. |
| `aoa` | Articles of Association setting out a company's internal rules. |
| `bail_anticipatory` | An application for anticipatory bail when arrest is apprehended. |
| `bail_before_magistrate` | A regular bail application before a Magistrate. |
| `bail_cancellation` | An application to cancel bail already granted, or to change its conditions. |
| `bail_regular` | A regular bail application for an accused person in custody. |
| `cat_oa` | An Original Application before the Central Administrative Tribunal on a service matter. |
| `certiorari` | A writ petition asking the High Court or Supreme Court to quash an order. |
| `condonation_of_delay` | An application under Section 5 of the Limitation Act, 1963 to condone delay in filing. |
| `consumer_complaint` | A complaint before a Consumer Commission about defective goods or deficient service. |
| `counter_affidavit` | A counter affidavit replying to the petition on behalf of a respondent. |
| `criminal_appeal` | A criminal appeal under the BNSS against a conviction, acquittal or sentence. |
| `criminal_revision` | A criminal revision petition under the BNSS against an order of a lower criminal court. |
| `curative_petition` | A curative petition before the Supreme Court after a review petition is dismissed. |
| `default_bail` | An application for default bail when the police report is not filed within the period the law allows. |
| `discharge_application` | An application under the BNSS to discharge the accused before charges are framed. |
| `distribution_agreement` | An agreement appointing a distributor or dealer for goods. |
| `divorce_hma` | A contested divorce petition under the Hindu Marriage Act, 1955. |
| `divorce_mutual_consent` | A joint petition for divorce by mutual consent. |
| `divorce_sma` | A contested divorce petition under the Special Marriage Act, 1954. |
| `dv_act_complaint` | An application under the Protection of Women from Domestic Violence Act, 2005. |
| `employment_agreement` | An employment agreement between an employer and an employee. |
| `fir_quashing` | A petition to the High Court under Section 528 BNSS to quash an FIR. |
| `founders_agreement` | An agreement between the co-founders of a business. |
| `franchise_agreement` | An agreement granting a franchise to run a business under a brand. |
| `gift_deed` | A deed gifting movable or immovable property under the Transfer of Property Act, 1882. |
| `gpa` | A General Power of Attorney letting a person act generally for the grantor. |
| `guardianship_petition` | A petition to be appointed guardian of a minor and for the minor's custody. |
| `habeas_corpus` | A writ petition for habeas corpus against unlawful detention. |
| `ibc_application` | An application before the NCLT under the Insolvency and Bankruptcy Code, 2016 to start insolvency proceedings. |
| `interim_application` | An interim application in a pending case. |
| `interim_bail` | An application for bail for a short period while a bail application is pending. |
| `itat_appeal` | An appeal before the Income Tax Appellate Tribunal under Section 253 of the Income-tax Act, 1961. |
| `joint_development_agreement` | An agreement between a landowner and a developer to build on the land and share the result. |
| `judicial_separation` | A petition for judicial separation. |
| `lease_deed` | A long-term lease deed for immovable property under the Transfer of Property Act, 1882. |
| `legal_notice_breach_of_contract` | A legal notice demanding performance or damages for breach of contract. |
| `legal_notice_consumer_deficiency` | A legal notice asking a seller or service provider to remedy a defect or deficiency. |
| `legal_notice_copyright_infringement` | A legal notice to stop copyright infringement under the Copyright Act, 1957. |
| `legal_notice_defamation` | A legal notice about defamatory statements. |
| `legal_notice_eviction` | A legal notice asking a tenant to vacate. |
| `legal_notice_s138` | A demand notice under Section 138 of the Negotiable Instruments Act, 1881 after a cheque is dishonoured. |
| `legal_notice_s80` | A notice to the Government or a public officer under Section 80 CPC before filing a suit. |
| `legal_notice_trademark_infringement` | A legal notice to stop trademark infringement or passing off. |
| `license_agreement` | A leave and licence agreement allowing use of immovable property without a lease. |
| `list_of_dates` | A list of dates and events for filing with a petition. |
| `loan_agreement` | An agreement recording a loan and its repayment terms. |
| `mact_claim` | A claim petition before the Motor Accidents Claims Tribunal under Section 166 of the Motor Vehicles Act, 1988. |
| `maintenance_bnss_144` | An application for maintenance under Section 144 BNSS (Section 125 CrPC). |
| `mandamus` | A writ petition for mandamus directing an authority to perform its legal duty. |
| `memo_of_parties` | A memo of parties listing every party with their addresses. |
| `moa` | A Memorandum of Association setting out a company's name, objects and capital. |
| `mortgage_deed` | A mortgage deed of immovable property under the Transfer of Property Act, 1882. |
| `mou` | A Memorandum of Understanding recording what the parties intend to agree. |
| `nda` | A non-disclosure agreement to keep shared information confidential. |
| `partition_deed` | A deed dividing joint family or co-owned property among its members. |
| `pil` | A public interest litigation petition before the High Court or Supreme Court. |
| `plaint_declaration` | A plaint in a suit for declaration under Section 34 of the Specific Relief Act, 1963. |
| `plaint_eviction` | A plaint in a suit to evict a tenant from premises. |
| `plaint_injunction` | A plaint in a suit for permanent injunction. |
| `plaint_partition` | A plaint in a suit for partition of joint or co-owned property. |
| `plaint_recovery` | A plaint in a suit for recovery of money. |
| `plaint_specific_performance` | A plaint in a suit for specific performance of a contract. |
| `posh_complaint` | A complaint of sexual harassment at the workplace under the POSH Act, 2013. |
| `production_of_documents` | An application under Order 11 CPC for production and inspection of documents. |
| `quashing_528_bnss` | A petition to the High Court under Section 528 BNSS to quash criminal proceedings. |
| `quo_warranto` | A writ petition for quo warranto challenging a person's right to hold a public office. |
| `rcr_petition` | A petition for restitution of conjugal rights. |
| `receiver_appointment` | An application under Order 40 Rule 1 CPC to appoint a receiver. |
| `rejoinder_affidavit` | A rejoinder affidavit replying to the respondent's counter affidavit. |
| `release_deed` | A deed by which a co-owner or heir gives up their share in a property. |
| `rent_agreement` | A rent agreement for residential or commercial premises. |
| `replication` | A replication by the plaintiff to the defendant's written statement. |
| `rera_complaint` | A complaint before the State Real Estate Regulatory Authority under Section 31 of the RERA Act, 2016. |
| `restoration_application` | An application to restore a case dismissed for default. |
| `review_petition` | A petition asking the same court to review its own order. |
| `sale_deed` | A sale deed of immovable property under the Transfer of Property Act, 1882. |
| `service_agreement` | An agreement for services by a contractor or service provider. |
| `shareholders_agreement` | An agreement among a company's shareholders on their rights and duties. |
| `slp` | A Special Leave Petition before the Supreme Court under Article 136 of the Constitution. |
| `spa` | A Special Power of Attorney for a specific act or transaction. |
| `surrender_application` | An application by an accused to surrender before the court. |
| `suspension_of_sentence` | An application to suspend a sentence while an appeal is pending. |
| `synopsis` | A synopsis summarising the case, for filing with a petition. |
| `temporary_injunction_o39` | An application under Order 39 Rules 1 and 2 CPC for a temporary injunction. |
| `vakalatnama` | A vakalatnama authorising an advocate to appear for a client. |
| `will` | A will under the Indian Succession Act, 1925. |
| `writ_petition_civil` | A civil writ petition before the High Court under Article 226 of the Constitution. |
| `writ_petition_criminal` | A criminal writ petition before the High Court under Article 226 of the Constitution. |
| `written_statement` | A written statement by the defendant under Order 8 CPC. |

