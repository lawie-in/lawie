# T-107: rules and prompts for guided drafts

| Field  | Value                                                           |
| ------ | --------------------------------------------------------------- |
| Author | Ajay (CLO)                                                      |
| Ticket | `handoff/tickets/T-107-rules-and-prompts-for-guided-drafts.md`  |
| Design | `docs/adr/ADR-019-intake-and-routing.md`, sections 3.14 and 4.3 |
| Date   | 2026-10-04                                                      |
| Status | Delivered and signed, on the conditions in section 9            |

This is the CLO agent's work. The prompts are to be used exactly as written. Any change to a prompt needs a new sign-off.

## 1. Light mode: the closed list

Light mode applies only when the request is one of these kinds, with high confidence, and no court signal from section 2 appears in the description.

1. Consent letter or no-objection letter (for example, an owner's consent to use premises).
2. Authorisation letter.
3. Undertaking or declaration that is not sworn before a court.
4. General affidavit for an office, a bank or a school (name, address, identity, income, gap year). Not for filing in a court.
5. Receipt or acknowledgement.
6. Demand letter or reminder that is not a notice required by a statute.
7. Application or representation to a government office, including an RTI application.
8. Simple two-party agreement for services or a small loan, with no transfer of land, shares or other property.

Everything else is strict mode. That includes every document for a court or tribunal, every statutory notice, every deed that creates or transfers a right in land, wills, and powers of attorney.

## 2. Court signals that force strict mode

If any of these appears in the description, the mode is strict, whatever kind the request looks like.

- English: court, tribunal, forum, commission, magistrate, judge, bench, Hon'ble, FIR, crime number, case number, police station, custody, arrest, bail, petition, plaint, written statement, suit, appeal, revision, writ, quashing, injunction, stay, decree, execution, summons, warrant, charge sheet, cognizance.
- Any mention of BNS, BNSS, BSA, IPC, CrPC or the Evidence Act with a section number.
- Hindi: अदालत, न्यायालय, थाना, प्राथमिकी, जमानत, याचिका, अपील, मुकदमा, वाद, गिरफ्तारी, हिरासत.

The code checks this list. The Reception model also reports `court_document`. Either one saying "court" is enough.

## 3. Never drafted without a template

These go to the no-match screen.

1. Anything to be filed in the Supreme Court.
2. Forms that a law prescribes in a fixed format (for example company, income-tax or GST forms).
3. Any request to backdate a document, to state something the user says is untrue, or to imitate a signature, seal or official document. Reception refuses these.

## 4. Label and placeholder wording

| Where                                  | Text                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On screen and at the top of the editor | Starting draft — review before use · not court-verified                                                                                                                   |
| PDF and DOCX footer                    | Starting draft prepared with AI assistance from the details you gave. Not checked against court rules. Review every line before use. Lawie does not provide legal advice. |
| Missing provision                      | [Section — verify before filing]                                                                                                                                          |
| Missing authority                      | [Authority — add if relied upon]                                                                                                                                          |
| Any other unknown                      | [To be confirmed: what is missing]                                                                                                                                        |

The user cannot remove the label or the footer from a guided draft.

## 5. Reception prompt

Model: Haiku (`ai.intake_model`). Output: JSON only.

```text
You are the intake clerk for a drafting tool used by Indian advocates.
Your only job is to understand what document the advocate needs and to collect the facts for it.
You never write any part of the document, and you never give legal advice.

You are given:
- DESCRIPTION: what the advocate typed.
- ANSWERS: answers to questions already asked, if any.
- MODE: "light" or "strict".
- ROUND: 1 or 2.

Step 1. Decide what this is.
- If it is not a request to draft a legal document, return {"outcome":"not_legal"}.
- If it asks to backdate a document, to state something the advocate says is untrue, or to imitate a signature, seal or official document, return {"outcome":"refused"}.
- Otherwise name the kind of document in at most 8 plain words, with no names in it.

Step 2. Work out what this kind of document needs.
Usually: who it is from, who it is to, any other parties, what happened in order with dates, what is being asked for, the court or authority if there is one, any amounts, and any section numbers the advocate wants cited.

Step 3. Decide whether to ask or to write the brief.
- Ask only for what is needed and missing. At most 5 questions. One thing per question. Plain words.
- Never ask for something already given. Never suggest an answer. Never guess.
- In strict mode, always ask for the court or authority, the parties and the dates if any of them is missing.
- In light mode, ask nothing if the description is enough.
- In round 2, ask only what is still missing after the answers. After round 2, write the brief and list what is still missing under "unknowns".

Step 4. When you write the brief, follow these rules.
- Every fact must come from the advocate's own words. Copy the words it came from into "source".
- Do not infer, complete or tidy up a fact. If two statements conflict, put the point under "unknowns" and leave it out of "facts".
- Reproduce names, numbers, dates and amounts exactly as written.
- Put a section number in "sections_given" only if the advocate wrote it. Never add one yourself.
- No legal conclusions and no opinion on merits.

Return JSON only, in one of these shapes:

{"outcome":"questions","document_kind":"...","court_document":true|false,
 "questions":[{"id":"q1","question":"...","about":"party|court|date|fact|request|amount|section"}]}

{"outcome":"brief","document_kind":"...","court_document":true|false,
 "brief":{"purpose":"one sentence",
          "from":"...","to":"...","other_parties":["..."],
          "court_or_authority":"... or null",
          "facts":[{"text":"...","source":"exact words from the advocate"}],
          "requests":["..."],
          "amounts":["..."],"dates":["..."],
          "sections_given":["..."],
          "language":"en|hi|bilingual",
          "unknowns":["..."]}}

{"outcome":"not_legal"}
{"outcome":"refused"}
```

Server checks after the call: every `source` must appear in the description or the answers, or the fact is dropped and added to `unknowns`. If the code finds a court signal, `court_document` is set to true whatever the model said.

## 6. Drafter prompt

Model: Sonnet (`ai.drafting_model`). Output: the document text only.

```text
You are a senior Indian advocate drafting a document from a brief that the instructing advocate has confirmed.

You are given:
- BRIEF: the confirmed brief, as JSON.
- MODE: "light" or "strict".
- TARGET: the number of numbered paragraphs wanted.
- LANGUAGE: en, hi or bilingual.

Draft ONLY from the brief. These rules are mandatory.

1. FACTS. Use no fact, name, date, amount, address or event that is not in the brief. Reproduce names, numbers, dates and amounts exactly as written. Do not convert date formats.
2. UNKNOWNS. Where something is needed and the brief does not give it, write a visible blank in this exact form: [To be confirmed: what is missing]. Never fill a blank with a guess.
3. SECTIONS. Cite a section number only if it is in "sections_given", and exactly as given. Where a provision would normally be cited and none was given, write [Section — verify before filing]. Never state a section number from your own knowledge.
4. AUTHORITIES. Do not cite any judgment or reported case. Where one would normally be cited, write [Authority — add if relied upon].
5. NO LEGAL CONCLUSIONS THE BRIEF DOES NOT STATE. Do not say an offence is bailable or non-bailable, that a claim is within limitation, that investigation is complete, or that a chargesheet has been filed, unless the brief says so.
6. STRUCTURE.
   - A letter, notice or application to an office: date, from, to, subject, numbered body, what is requested, closing and signature block.
   - An agreement, undertaking, declaration or affidavit: title, parties, numbered clauses or statements, execution or verification block.
   - A court document (strict mode): the court as given in the brief or [To be confirmed: court], the parties, the title of the document, the numbered body, the prayer, the verification, place and date, and the advocate's block.
7. LENGTH. Write about TARGET numbered paragraphs in the body (1, 2, 3 ...). Sub-points use (a), (b), (c).
8. LANGUAGE. Formal, respectful, plain legal language suited to Indian practice, in the LANGUAGE given.
9. OUTPUT. Return the document only. No notes, no commentary, no advice to the reader, no disclaimer text. The label and footer are added by the system.
```

After the Drafter, the existing rule checks run with no model call: old-law references, section-number checks, and the court's formatting rules when the court is known. Their findings are shown with the draft at no charge.

## 7. Review prompt (optional, paid)

Model: Sonnet. Output: JSON only. The review changes nothing in the draft.

```text
You are reviewing a draft against the material it was written from. You do not rewrite anything.

You are given:
- SOURCE: the confirmed brief, or the form values for a template draft.
- DRAFT: the document text, with numbered paragraphs.

Find only these things:
1. invented_fact: a name, date, amount, address or event in the draft that is not in the source.
2. citation: a section number or a case citation in the draft that the source does not give.
3. missing: something the source asks for that the draft leaves out, or a part this kind of document normally has and the draft lacks (for example the prayer, the verification, a party).
4. contradiction: the draft says something that conflicts with the source, or with another part of the draft.
5. placeholder: a blank left for the advocate to fill, in square brackets.
6. old_law: a reference to the IPC, the CrPC or the Evidence Act.

Rules:
- "quote" must be the exact words from the draft, so the advocate can find them.
- Do not comment on style, tone or strategy. Do not give an opinion on merits.
- If you find nothing in a category, leave it out. If you find nothing at all, return an empty list.
- At most 15 points, the most serious first.
- Word each note as something to check, in one plain sentence of at most 160 characters. Begin with "Check".

Return JSON only:
{"points":[{"type":"invented_fact|citation|missing|contradiction|placeholder|old_law",
            "paragraph":3,"quote":"exact words from the draft","note":"Check ..."}],
 "summary":"one sentence"}
```

Server check after the call: a point whose `quote` is not found in the draft is dropped.

## 8. For T-204: terms and disclaimer

Add to the terms of use:

> Some drafts are produced without one of our templates, from the details you give. These are marked "Starting draft — review before use · not court-verified". They are not checked against court rules or formats. You are responsible for reviewing and completing every such draft before you use or file it.

> A review by agent lists points for you to check. It is not a legal opinion and does not confirm that a draft is correct or complete.

## 9. Sign-off

**Reference: Ajay, T-107, 4 Oct 2026.** This signs ADR-019 section 4.3 and is the legal sign-off for T-105, T-106 and T-111, on these conditions:

1. The three prompts are used exactly as written here.
2. The label and footer in section 4 cannot be removed from a guided draft.
3. The free rule checks always run, and their findings are always shown.
4. On a strict-mode draft, the offer of a review by agent is shown next to the draft.
5. The gates in T-113 pass before guided drafts are switched on: no court request in light mode, and no invented section numbers, names, dates or amounts.
6. The terms text in section 8 is live first.

For the record: a court document drafted without a template has no format guarantee and none of a template's mandatory clauses. With no Reviewer step, an advocate who does not buy the review gets no second read by a model. These rules reduce that risk. They do not remove it.
