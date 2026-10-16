# Judgment-name sweep for T-441 and T-447 to T-451

Vishal, 15 Oct 2026, base 7e94b5e9. Line numbers drift: re-grep on the ticket base. a = model-visible (fix under R1-R7); n = key_citations/\_meta etc., not sent (leave); c = form label. pc = prompt_context, pI = promptInstructions. Files are under apps/drafting/src/config/document-rules/.

## Criminal (T-447; T-441 does bail_cancellation, interim_bail, criminal_revision, bail_anticipatory twin)

- bail_cancellation: a :187 pc, :196 pI
- interim_bail: a :323 pc
- criminal_revision: a pI :231-238, :243, :249, :250
- criminal_appeal: a pI :282-285, :287, :289
- discharge_application: a pI :228-233, :241-244, :248, :250
- fir_quashing: a :12 title, :207/:215/:221 clause names, pI :266, :274, :283-288, :290, :292; c :103; \_meta :7 MANDATORY (R6)
- quashing_528_bnss: a :186 clause name, pI :240-246, :251, :258-262, :265, :266
- suspension_of_sentence: a :177 pc, pI :184, :185
- surrender_application: a :143 pc, :152 pI
- habeas_corpus: a pI :242, :245, :253-257, :263-265, :303 relevantActs
- curative_petition: a :128 system_role, :133; c :72
- review_petition: a pI :254-256, :261-263
- slp: a pI :244-246, :258

## Writs (T-448)

- writ_petition_civil: a pI :235-241, :243, :261 relevantActs; \_meta :7 MANDATORY
- writ_petition_criminal: a pI :229, :231, :232, :235-239, :255, :269 relevantActs; \_meta :7 MANDATORY
- pil: a pI :239, :240, :243, :244, :248-254; \_meta :7 MANDATORY
- certiorari: a :128 system_role
- mandamus: a :7 must_cite[2] (one line with \_meta)
- quo_warranto: a :130 system_role
- cat_oa: a pI :298, :314, :315, :320-326

## Civil and family (T-449, V1.1)

amendment_of_pleadings pI :226-229, :242-244 | condonation_of_delay pI :210-213, :219, :222, :223 | divorce_hma pI :244, :245 | divorce_mutual_consent pI :254; c :148 | dv_act_complaint :257, :263 clause desc, pI :308, :310, :311, :313, :336 relevantActs; c :82 | guardianship_petition :248 clause desc, pI :286, :288, :293 | maintenance_bnss_144 pI :254 | rcr_petition pI :188 | mact_claim :236 relevantActs (an R4 label), pI :281, :287, :291-296, :299 | ibc_application pI :294-300 | itat_appeal pI :272, :274, :275, :283 | rera_complaint pI :283, :292, :299 | plaint_declaration :209 clause desc, pI :268, :277 | plaint_eviction pI :297 | plaint_partition :214 clause desc, pI :278, :285; c :93 | plaint_recovery pI :304; c :202 | plaint_specific_performance :245 clause desc, pI :325-328, :336 | posh_complaint pI :340; \_meta :7 MANDATORY | production_of_documents pI :203-205 | receiver_appointment pI :205, :222, :223 | rejoinder_affidavit :158 addendum | replication pI :200, :201 | restoration_application :118 content_guidance, :152 addendum | written_statement pI :228, :229, :238, :242 | interim_application :135 system_role, :142 (an R4 label) | affidavit_in_support :173 pc, :183 pI | legal_notice_copyright_infringement pI :240. n only: divorce_sma, judicial_separation, plaint_injunction, temporary_injunction_o39.

## Deeds and agreements (T-450, V1.1)

gift_deed pI :293 | gpa :239 clause name (T-451), pI :263, :279, :319 relevantActs | spa :233 clause name (T-451), pI :274, :278 | lease_deed pI :444, :445 | license_agreement pI :362 | mortgage_deed pI :360, :363, :372 | mou pI :350, :352 | partition_deed :194 clause desc, pI :294, :296, :304, :321, :322; \_meta :7 MANDATORY | release_deed pI :285, :286 | sale_deed pI :343, :361, :463 relevantActs | will pI :342, :345 | employment_agreement :117 note, :168 drafting_rules | founders_agreement :169 | franchise_agreement :219 | shareholders_agreement :143 note | service_agreement :75 PRINTED clause content (T-451), :174 | moa :119 note. n only: aoa, nda.

## T-451 (always V1)

The 6 labels (curative :72, fir_quashing :103, divorce_mutual :148, dv_act :82, plaint_recovery :202, plaint_partition :93), service_agreement :75, gpa :239 / spa :233.

## Do not touch (R7)

The \_averments ban lists: \_default 187-192, bail_regular 856-864, default_bail 325-334.

## What the model sees

prompt_context (including system_role, drafting_rules, must_cite, addendum), promptInstructions, clause title/description/content_guidance/note/content, relevantActs descriptions, prayer and verification (rule-pack.service.ts:532-540, :629-633; brief-drafter.ts:2350-2375). Not sent: key_citations, key_precedents, \_meta, validation, checklist.
