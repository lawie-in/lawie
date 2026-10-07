# T-127: rules, prompts and cue lists for the one flow

| Field      | Value                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| Author     | Ajay (CLO)                                                                   |
| Ticket     | `handoff/tickets/T-127-rules-and-prompts-for-the-one-flow.md`                |
| Design     | `docs/adr/ADR-021-one-drafting-flow.md`, sections 3.2 to 3.6 and 5           |
| Base       | `handoff/design/T-107-guided-draft-rules-and-prompts.md`                     |
| Data files | `handoff/data/T-127-bail-cues.json`, `handoff/data/T-127-date-meanings.json` |
| Date       | 2026-10-06                                                                   |
| Status     | Delivered and signed, on the conditions in section 9                         |

This is the CLO agent's work. The prompts and lists are to be used exactly as written. Any change needs a new sign-off. The two data files are the lists for the code. The tables in sections 5 and 6 are printed from them.

## 1. What changes from T-107, and what stays

|                       | No rule pack                | With a rule pack                                                                         |
| --------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| Reception prompt      | T-107, section 5, unchanged | Section 3 of this document                                                               |
| Drafter prompt        | T-107, section 6, unchanged | Section 4 of this document                                                               |
| Light and strict mode | T-107, sections 1 and 2     | Not used. The pack decides (section 2)                                                   |
| Label                 | Always on                   | Off only when every mandatory clause is present and every check passes (ADR-021, rule 6) |
| Placeholders          | T-107, section 4            | The same three placeholders                                                              |
| Never-draft list      | T-107, section 3            | The same list                                                                            |
| Review prompt         | T-107, section 7            | Unchanged                                                                                |

## 2. Rules the code applies

### 2.1 Which packs are court documents

A pack is a court document unless it is in this list. The list is by pack id, so a new pack is a court document until I say otherwise.

- Not court documents (32): `affidavit_identity`, `legal_notice_s138`, `legal_notice_s80`, `rent_agreement`, the 6 other `legal_notice_*` packs, the 10 packs in category `corporate`, and the 12 packs in category `transactional_deed`.
- Court documents (60): every other pack.
- A court signal in the description (T-107, section 2) does not change this for a request that has a pack.

On a court document the user cannot confirm the brief without the court and the parties (decision D2).

### 2.2 The fixed checklist

Every request is asked for these four things, whatever the document:

| Id                  | What it is                                            | Kind      |
| ------------------- | ----------------------------------------------------- | --------- |
| `fixed.first_party` | The person the document is for                        | name      |
| `fixed.other_party` | The person or authority it is against or addressed to | name      |
| `fixed.facts`       | What happened, in order                               | narrative |
| `fixed.relief`      | What is asked for                                     | narrative |

- Where the pack has its own fact for one of these, the pack's fact is used and the fixed item is left out. Nothing is asked twice.
- The court is not on the checklist given to the model. The user chooses it on the brief.
- Court, district and police station are never read by the model (ADR-019, rule 4.1.2, unchanged). They are taken out of the checklist before the model sees it.

### 2.3 Values read from the description

These are ADR-019 rules 4.1.1 to 4.1.5 and they stay as signed. In short:

1. A value is kept only with a quote that is found in the description.
2. A number, an amount or a name must itself appear inside its quote.
3. Two different values for one fact: neither is kept, and the fact is asked.
4. Old-law section numbers are passed through as written.
5. A value read from the description carries the "please check" mark (section 7). A value the user typed does not.

### 2.4 Answers

- An answer to a question is the user's own entry for that fact. It is not read by a model and needs no quote.
- A date is entered in a date control, not as free text.

### 2.5 Order of questions

At most 5 questions a round and 2 rounds (ADR-021, section 3.4). When more than 5 required facts are missing, this is the order:

1. The parties.
2. The numbers and dates that identify the case: FIR number, case number, the date of the order under challenge.
3. The facts and the grounds.
4. Everything else that is required.

Optional facts are never asked. They stay open on the brief.

## 3. Reception prompt, with a rule pack

Model: Haiku (`ai.intake_model`). Output: JSON only. One call for a description. The same description sent again makes no new call.

```text
You are the intake clerk for a drafting tool used by Indian advocates.
Your only job is to read what the advocate wrote and to collect the facts the document needs.
You never write any part of the document, and you never give legal advice.

You are given:
- DOCUMENT: the kind of document the advocate needs.
- DESCRIPTION: what the advocate typed.
- CHECKLIST: the facts this document needs, one per line, in this form:
  id | what it is | kind | required or optional | allowed values, if any

Step 1. Check the request.
- If it is not a request to draft a legal document, return {"outcome":"not_legal"}.
- If it asks to backdate a document, to state something the advocate says is untrue, or to imitate a signature, seal or official document, return {"outcome":"refused"}.

Step 2. Read the DESCRIPTION against each line of the CHECKLIST.
- Record a fact only when the advocate's own words state it. Never infer, complete, assume or guess.
- For every fact, copy into "quote" the exact words it was read from, character for character. Keep the quote short: only the words that state this one fact.
- Names, numbers, amounts, addresses and section numbers: copy them exactly as written. Do not convert old-law section numbers.
- Kind "date": give the value as YYYY-MM-DD. Record a date only when the advocate's words say what it is the date of, and that is the meaning on the CHECKLIST line. The quote must hold that one date and the words that give it its meaning, and no other date.
- A date written next to a number or an event of another kind is not the date of that number or event. "arrested on 15/03/2026 in FIR No. 124/2026" gives the date of arrest. It does not give the date of the FIR.
- Never use one date for two lines, unless the advocate's words say so for both.
- Kind "choice": the value must be one of the allowed values, copied exactly.
- Kind "narrative": use the advocate's own words. You may shorten by leaving words out. Never add a fact, a name, a date, an amount or a section.
- If the advocate states two different values for one line, record neither and put the id in "conflicts".
- If nothing is stated for a line, leave it out. An empty result is acceptable.

Step 3. Write the questions.
- A line is missing when it is marked required and you recorded nothing for it.
- Write one question for each missing line, at most 10, the most important first: the parties, then the numbers and dates that identify the case, then the facts and the grounds, then the rest.
- Ask only about lines of the CHECKLIST. Never ask about anything that is not on it.
- One line per question. Plain words. At most 25 words.
- Never ask for something already given. Never suggest an answer. Never word a question so that it points to one answer.

Return JSON only, with no other text, in one of these shapes:

{"outcome":"read",
 "read":[{"id":"...","value":"..." or ["...","..."],"quote":"exact words from the advocate"}],
 "conflicts":["..."],
 "questions":[{"id":"...","question":"..."}]}

{"outcome":"not_legal"}
{"outcome":"refused"}
```

Server checks after the call. The prompt is never trusted on its own.

1. An `id` that is not on the checklist is dropped, in `read` and in `questions`.
2. Every value goes through the checks in section 2.3.
3. A date goes through the checks in section 6.2 as well. A date that fails is dropped and its fact is asked.
4. A question about a fact that was kept is dropped. A required fact with no value and no question gets a question written by code from its label.
5. The first 5 questions are round 1. The next 5 are round 2. Nothing is asked after that.
6. `not_legal` and `refused` return `no_match`, as today.

## 4. Drafter prompt, with a rule pack

Model: Sonnet (`ai.drafting_model`). One call for the body (decision D6).

```text
You are a senior Indian advocate drafting a document from a brief that the instructing advocate has confirmed.

You are given:
- DOCUMENT: the kind of document.
- BRIEF: the confirmed brief, as JSON. It holds the court, the parties, the facts, each date with what it is the date of, the numbers, the sections the advocate gave, what is asked for, and what is still unknown with the blank to use for each.
- CLAUSES: what this kind of document must contain, one per line, in this form:
  id | title | what it must cover | fixed wording, if any
- INSTRUCTIONS: drafting instructions for this kind of document.
- ACTS: the Acts and sections that belong to this kind of document.
- COURT RULE: the formatting rule of the court, when the court is known.
- SYSTEM PARTS: the parts of the document that the system adds. You do not write them.
- TARGET: the number of numbered paragraphs wanted.
- LANGUAGE: en, hi or bilingual.

These rules are mandatory. Where INSTRUCTIONS says something different, the rule wins.

1. FACTS. Use no fact, name, date, amount, address or event that is not in the BRIEF. Reproduce names, numbers, dates and amounts exactly as written. Do not convert date formats.
2. DATES. Use each date only for what the BRIEF says it is the date of. Never move a date to another event.
3. UNKNOWNS. For everything listed as unknown in the BRIEF, write the blank the BRIEF gives for it, exactly. For anything else that is needed and not given, write [To be confirmed: what is missing]. Never fill a blank with a guess.
4. CLAUSES. Cover every line of CLAUSES, in the order that suits this kind of document. Where a line has fixed wording, use that wording and fill it from the BRIEF. Where the BRIEF does not give what a clause needs, still write the clause and put a blank where the fact belongs. Never leave a clause out. A clause that belongs to one of the SYSTEM PARTS is not yours to write: report it as SYSTEM.
5. SECTIONS. Cite a section only if it is in ACTS or among the sections in the BRIEF, exactly as written there. Where a provision would normally be cited and neither gives it, write [Section — verify before filing]. Never state a section number from your own knowledge.
6. AUTHORITIES. Cite a judgment only if INSTRUCTIONS names it, and copy its citation exactly as INSTRUCTIONS gives it. Where another authority would normally be cited, write [Authority — add if relied upon]. Never cite a judgment from your own knowledge.
7. NO LEGAL CONCLUSIONS THE BRIEF DOES NOT STATE. Do not say an offence is bailable or non-bailable, that a claim is within limitation, that investigation is complete, or that a chargesheet has been filed, unless the BRIEF says so.
8. PARTS. Write the body of the document, and any part this kind of document needs that is not listed under SYSTEM PARTS. Do not write any part listed under SYSTEM PARTS.
9. LENGTH. Write about TARGET numbered paragraphs in the body (1, 2, 3 ...). Sub-points use (a), (b), (c). Do not leave a clause out to keep to TARGET.
10. LANGUAGE. Formal, respectful, plain legal language suited to Indian practice, in the LANGUAGE given.
11. OUTPUT. Write the document first. No notes, no commentary, no advice to the reader, no disclaimer text. Then, on a new line, write exactly:
===CLAUSES===
and under it one line for every line of CLAUSES, in this form:
id: the numbers of the paragraphs that cover it, separated by commas
or
id: SYSTEM
or
id: MISSING
Write nothing after the last of these lines.
```

Server steps after the call:

1. Everything from the line `===CLAUSES===` onwards is cut from the document before it is stored or shown.
2. A clause counts as missing when its line says `MISSING`, when it has no line, when a paragraph number on its line is not in the body, or when it has fixed wording and that wording is not found in the body.
3. A clause reported as `SYSTEM` counts as present only when the system did add that part.
4. If a clause is missing, the repair pass in section 4.1 runs once (decision D3). What is still missing after it is shown to the user, and the draft carries the label.
5. The existing rule checks run with no model call, and their findings are shown at no charge.

For the record: step 2 relies on the Drafter's own report for clauses with no fixed wording. That is a model marking its own work. I accept it as the first check on the conditions in section 9, and the gate in T-113 measures it against a human read. Arjun confirms the mechanism in T-106.

### 4.1 Repair prompt

Used once, only when a clause is missing. Model: Sonnet. Not charged to the user.

```text
You wrote the document below from the confirmed brief. It leaves out the clauses listed under MISSING.

You are given the same BRIEF, CLAUSES, INSTRUCTIONS, ACTS, SYSTEM PARTS and LANGUAGE as before, with:
- DOCUMENT TEXT: the document as you wrote it.
- MISSING: the ids of the clauses that are not covered.

Add the missing clauses. Follow every rule you were given when you wrote the document. In addition:
- Change nothing else. Keep every existing paragraph word for word, except that paragraph numbers may move to make room.
- Where the BRIEF does not give what a missing clause needs, write the clause with a blank where the fact belongs.
- If a missing clause cannot be written at all from the BRIEF and CLAUSES, leave it out and report it as MISSING.

Return the whole document, then the ===CLAUSES=== lines for every clause, in the same form as before.
```

## 5. Bail: the guard and the cue lists

### 5.1 The rule

Regular bail is for a person who has been arrested or is in custody. Anticipatory bail is for a person who has not been arrested and expects to be. Giving one for the other is a legal error.

The guard runs in code after the match call, on the description. It applies only when the result names `bail_regular` or `bail_anticipatory`.

1. Look for the "expects arrest" phrases first. Take every one that is found out of the text.
2. Then look for the "already arrested" words in what is left.
3. Latin-script cues match whole words only. Matching ignores case and extra spaces.

| Found in the description | The match call said                     | Result                                                           |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------- |
| Already arrested only    | `bail_anticipatory` as the single match | The choice screen: Regular Bail first, Anticipatory Bail second  |
| Already arrested only    | A choice list                           | Regular Bail is put first. It is added if it was not there       |
| Expects arrest only      | `bail_regular` as the single match      | The choice screen: Anticipatory Bail first, Regular Bail second  |
| Expects arrest only      | A choice list                           | Anticipatory Bail is put first. It is added if it was not there  |
| Both                     | Either as the single match              | The choice screen, the match call's pick first, the other second |
| Both                     | A choice list                           | No change. The user is already asked                             |
| Neither                  | Anything                                | No change                                                        |
| Any                      | The document the cue points to          | No change                                                        |

- The guard never picks a document for the user. It can only turn a single match into a choice, or change the order of a choice.
- A choice list is never longer than 3.
- The guard is a floor. It does not replace the match prompt.

Reason for "never picks": a cue can belong to another person or another case. "The co-accused was arrested and my client fears arrest" has both. "He was arrested in 2019 in another matter" has an arrest that is not this one. In these cases the advocate decides.

### 5.2 Addition to the match prompt

Add this line to the rules in `MATCH_SYSTEM_PROMPT`, after the line about confidence "low":

```text
- Bail: a person who has already been arrested or is in custody needs regular bail. A person who has not been arrested and expects to be arrested needs anticipatory bail. Never choose an anticipatory bail template when the description says the person has been arrested or is in custody. Never choose a regular bail template when the description says the person has not been arrested. If the description does not say which, use confidence "medium" and list both.
```

### 5.3 The cue lists

| Meaning                             | English                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Hindi                                                                                                                                                                                                                                                                                                                                                                                                                                                | Hinglish                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expects arrest (98)                 | anticipatory bail, pre-arrest bail, pre arrest bail, apprehends arrest, apprehending arrest, apprehension of arrest, apprehension of being arrested, fears arrest, fear of arrest, fearing arrest, afraid of arrest, afraid of being arrested, may be arrested, might be arrested, could be arrested, can be arrested, likely to be arrested, about to be arrested, going to be arrested, will be arrested, threat of arrest, threatening to arrest, wants to arrest, want to arrest, trying to arrest, looking to arrest, before arrest, before he is arrested, before she is arrested, before they are arrested, in the event of arrest, in case of arrest, has not been arrested, have not been arrested, not been arrested, not yet arrested, not arrested, is not in custody, not in custody, protection from arrest, protection against arrest, evading arrest, avoid arrest | अग्रिम जमानत, अग्रिम ज़मानत, गिरफ्तारी की आशंका, गिरफ़्तारी की आशंका, गिरफ्तारी का डर, गिरफ़्तारी का डर, गिरफ्तारी का भय, गिरफ्तारी से पहले, गिरफ़्तारी से पहले, गिरफ्तारी से बचने, गिरफ्तार कर सकती है, गिरफ़्तार कर सकती है, गिरफ्तार किया जा सकता है, गिरफ्तार करना चाहती है, गिरफ्तार नहीं किया गया, गिरफ़्तार नहीं किया गया, गिरफ्तार नहीं हुआ, गिरफ्तार नहीं हुई, अभी गिरफ्तार नहीं, अभी तक गिरफ्तार नहीं, गिरफ्तारी नहीं हुई, हिरासत में नहीं | agrim zamanat, agrim jamanat, giraftari ka dar, giraftari ki aashanka, giraftari ki ashanka, giraftari se pehle, giraftari se pahle, giraftari se bachne, giraftar kar sakti hai, giraftar kar sakte hain, giraftar ho sakta hai, giraftar ho sakti hai, giraftar karna chahti hai, giraftar nahi hua, giraftar nahi hui, giraftar nahin hua, abhi giraftar nahi, abhi tak giraftar nahi, giraftari nahi hui, arrest ho sakta hai, arrest ho sakti hai, arrest kar sakti hai, arrest kar sakte hain, arrest hone wala, arrest hone wali, arrest nahi hua, arrest nahi hui, arrest nahin hua, arrest ka dar, pakad sakti hai, pakad sakte hain, custody mein nahi, hirasat mein nahi |
| Already arrested or in custody (79) | arrested, was arrested, has been arrested, have been arrested, been arrested, under arrest, in custody, in judicial custody, in police custody, judicial custody, police custody, custody since, taken into custody, in jail, in prison, in lock-up, in lockup, in lock up, lodged in, behind bars, remanded, on remand, sent to jail, sent to judicial custody, picked up by police, picked up by the police, detained by police, detained by the police, undertrial, under-trial                                                                                                                                                                                                                                                                                                                                                                                                 | गिरफ्तार कर लिया, गिरफ़्तार कर लिया, गिरफ्तार किया गया, गिरफ़्तार किया गया, गिरफ्तार हो गया, गिरफ्तार हो गई, गिरफ्तार है, गिरफ़्तार है, गिरफ्तार हुआ, गिरफ्तार हुई, हिरासत में, न्यायिक हिरासत, पुलिस हिरासत, अभिरक्षा में, न्यायिक अभिरक्षा, जेल में, कारागार में, जेल भेज, रिमांड, पकड़ लिया, पकड़ कर ले गई, बंद है                                                                                                                                | giraftar kar liya, giraftar kiya gaya, giraftar ho gaya, giraftar ho gayi, giraftar hai, giraftar hua, giraftar hui, giraftaar kar liya, giraftaar hai, arrest kar liya, arrest ho gaya, arrest ho gayi, arrest hua hai, arrest hui hai, hirasat mein, custody mein, jail mein, jail bhej, remand par, remand pe, pakad liya, pakad kar le gayi, pakad kar le gaye, police le gayi, police le gaye, band hai, andar hai                                                                                                                                                                                                                                                             |

## 6. Dates: what a date is the date of

### 6.1 The rule

A date is placed only when the description says what it is the date of (ADR-021, rule 4). The Reception prompt says so. The code checks it again with the lists below.

### 6.2 The checks, in code

A date read by the model for a fact is kept only when all of these hold:

1. Its quote is found in the description.
2. The quote holds exactly one date, and it is the date given.
3. The fact has a kind in section 6.3, and the quote carries a subject cue of that kind. Where the kind also has tie cues, the quote carries one of those as well.
4. The quote does not also carry the cues of another kind that is on this pack's checklist. If it does, the date could belong to either, so it is asked.
5. The same date is not already placed under another fact from the same quote.
6. The fact is not one of two facts of the same kind in this pack (section 6.5).

A date that fails any check is not placed. Its fact is asked. Latin-script cues match whole words only, so "fir" does not match inside "first" or "confirm".

The three texts in T-105 give these results:

| Text                                                        | Date of arrest                               | Date of FIR                                             |
| ----------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| "arrested on 15/03/2026 in FIR No. 124/2026"                | 15 March 2026                                | Asked. The quote has "FIR" but no tie cue               |
| "arrested by Sadar Thana Police on 25th August 2026"        | 25 August 2026                               | Asked. No FIR cue at all                                |
| "FIR No. 124/2026 dated 10/03/2026, arrested on 15/03/2026" | 15 March 2026, from "arrested on 15/03/2026" | 10 March 2026, from "FIR No. 124/2026 dated 10/03/2026" |

### 6.3 The kinds of date

Subject cues say what the date is about. Tie cues, where a kind has them, say that the date belongs to it. English, Hindi and Hinglish cues are in one list.

| Kind               | Shown as                        | Subject cues                                                                                                                                                                                                                  | Tie cues                                                                                    | Pack facts                                                                                                                                                                |
| ------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fir`              | Date of FIR                     | fir, f.i.r, f.i.r., first information report, प्राथमिकी, एफआईआर, एफ.आई.आर                                                                                                                                                     | dated, date, registered, lodged, recorded, filed, दिनांक, तारीख, दर्ज, dinank, tarikh, darj | `fir_date`                                                                                                                                                                |
| `arrest`           | Date of arrest                  | arrested, arrest, apprehended, picked up, गिरफ्तार, गिरफ़्तार, गिरफ्तारी, गिरफ़्तारी, पकड़ा, पकड़ लिया, giraftar, giraftaar, girftar, giraftari, pakda, pakad liya                                                            | None                                                                                        | `arrest_date`                                                                                                                                                             |
| `custody`          | In custody since                | custody, in jail, in prison, lodged in, हिरासत, अभिरक्षा, जेल, कारागार, hirasat, jail                                                                                                                                         | None                                                                                        | `custody_since`                                                                                                                                                           |
| `remand`           | Date of first remand            | remand, remanded, रिमांड, rimand                                                                                                                                                                                              | None                                                                                        | `remand_date`                                                                                                                                                             |
| `detention`        | Date of detention               | detained, detention, detenu, निरुद्ध, नज़रबंद, नजरबंद, बंदी, nazarband, nazarbandi                                                                                                                                            | None                                                                                        | `date_of_detention`                                                                                                                                                       |
| `chargesheet`      | Date of the chargesheet         | chargesheet, charge sheet, charge-sheet, final report, आरोप पत्र, आरोप-पत्र, चार्जशीट, aarop patra, arop patra                                                                                                                | None                                                                                        | `chargesheet_date`                                                                                                                                                        |
| `order`            | Date of the order or judgment   | order, judgment, judgement, decree, convicted, conviction, sentenced, sentence, dismissed, dismissal, rejected, आदेश, निर्णय, फैसला, फ़ैसला, डिक्री, दोषसिद्धि, सजा, सज़ा, खारिज, aadesh, adesh, faisla, nirnay, saza, kharij | None                                                                                        | `impugned_order_date`, `bail_order_date`, `original_order_date`, `date_of_dismissal`, `review_dismissal_date`, `judgment_date`, `original_judgment_date`, `sentence_date` |
| `filing`           | Date of filing                  | filed, filing, instituted, दायर, दाखिल, dayar, dakhil                                                                                                                                                                         | None                                                                                        | `filing_date`, `actual_filing_date`, `appeal_filing_date`, `ws_filing_date`, `review_petition_date_filed`                                                                 |
| `notice`           | Date of the notice              | notice, नोटिस, notis                                                                                                                                                                                                          | None                                                                                        | `legal_notice_date`, `s8_demand_notice_date`                                                                                                                              |
| `demand`           | Date of the demand              | demand, demanded, representation, मांग, माँग, अभ्यावेदन, maang, mang, abhyavedan                                                                                                                                              | None                                                                                        | `demand_made_date`, `demand_made_on`                                                                                                                                      |
| `agreement`        | Date of the agreement           | agreement, contract, deed, executed, signed, entered into, mou, अनुबंध, करार, इकरारनामा, समझौता, निष्पादित, anubandh, karar, ikrarnama, samjhauta                                                                             | None                                                                                        | `effective_date`, `date_of_execution`, `contract_date`, `agreement_for_sale_date`                                                                                         |
| `start`            | Start date                      | commenced, commencement, commencing, started, starts, start date, began, joined, joining, with effect from, w.e.f, w.e.f., शुरू, प्रारंभ, आरंभ, shuru, chalu                                                                  | None                                                                                        | `lease_start_date`, `license_start_date`, `tenancy_start_date`, `joining_date`                                                                                            |
| `end`              | End date                        | ends, ended, end date, expires, expired, expiry, terminated, termination, valid up to, valid till, until, till, समाप्त, खत्म, ख़त्म, तक, samapt, khatam                                                                       | None                                                                                        | `lease_end_date`, `end_date`, `end_date_if_fixed`, `notice_expiry_date`, `expiry_date`                                                                                    |
| `marriage`         | Date of marriage                | married, marriage, solemnised, solemnized, wedding, विवाह, शादी, vivah, shaadi, shadi                                                                                                                                         | None                                                                                        | `marriage_date`                                                                                                                                                           |
| `separation`       | Date of separation              | separated, separation, living separately, living apart, left the matrimonial home, withdrew, deserted, desertion, अलग रह, छोड़ कर, छोड़कर, परित्याग, alag reh, alag rah, chhod kar, chhodkar                                  | None                                                                                        | `separation_date`, `date_of_withdrawal`                                                                                                                                   |
| `incident`         | Date of the incident            | incident, occurrence, occurred, happened, took place, accident, assaulted, cause of action, घटना, दुर्घटना, वारदात, हादसा, ghatna, durghatna, vardat, hadsa                                                                   | None                                                                                        | `incident_date`, `accident_date`, `cause_of_action_date`                                                                                                                  |
| `breach`           | Date of the breach or default   | breach, breached, default, defaulted, failed to pay, उल्लंघन, चूक, ullanghan, chook                                                                                                                                           | None                                                                                        | `date_of_breach`, `default_date`                                                                                                                                          |
| `transaction`      | Date of the purchase or payment | purchased, purchase, bought, paid, payment, transaction, lent, advanced, booked, availed, खरीदा, ख़रीदा, खरीदी, भुगतान, उधार, kharida, kharidi, bhugtan, udhar, udhaar                                                        | None                                                                                        | `transaction_date`, `purchase_date`, `date_of_purchase_or_service`                                                                                                        |
| `cheque`           | Date of the cheque              | cheque, चेक, chek                                                                                                                                                                                                             | dated, date, दिनांक, तारीख, dinank, tarikh                                                  | `cheque_date`                                                                                                                                                             |
| `cheque_presented` | Date the cheque was presented   | presented, presentation, deposited, प्रस्तुत, जमा, jama                                                                                                                                                                       | None                                                                                        | `presentation_date`                                                                                                                                                       |
| `dishonour`        | Date of dishonour               | dishonoured, dishonored, dishonour, dishonor, bounced, returned unpaid, return memo, अनादरित, अनादरण, बाउंस, anadrit, bounce                                                                                                  | None                                                                                        | `dishonour_date`                                                                                                                                                          |
| `hearing`          | Date of hearing                 | next date, hearing, listed, fixed for, सुनवाई, अगली तारीख, पेशी, sunwai, sunvai, agli tarikh, peshi                                                                                                                           | None                                                                                        | `next_hearing_date`, `next_date_missed`                                                                                                                                   |
| `served`           | Date of service or receipt      | served, service, received, receipt, तामील, प्राप्त, tameel, tamil, prapt                                                                                                                                                      | None                                                                                        | `service_of_order_date`, `summons_service_date`, `certified_copy_received_date`                                                                                           |
| `known`            | Date it first came to notice    | came to know, came to notice, learnt, learned, noticed, detected, discovered, knowledge, पता चला, जानकारी, pata chala, jankari                                                                                                | None                                                                                        | `knowledge_of_dismissal_date`, `date_first_noticed`, `date_of_detection`                                                                                                  |
| `possession`       | Date of possession              | possession, handed over, handover, hand over, कब्जा, कब्ज़ा, क़ब्ज़ा, kabza, kabja                                                                                                                                            | None                                                                                        | `promised_possession_date`, `actual_possession_date`, `possession_date`                                                                                                   |
| `birth`            | Date of birth                   | born, date of birth, dob, d.o.b, d.o.b., जन्म, janm, janam                                                                                                                                                                    | None                                                                                        | `minor_dob`                                                                                                                                                               |
| `publication`      | Date of publication             | published, publication, posted, broadcast, aired, telecast, प्रकाशित, छपा, prakashit, chhapa                                                                                                                                  | None                                                                                        | `date_of_publication`                                                                                                                                                     |
| `registration`     | Date of registration            | registered, registration, पंजीकृत, पंजीकरण, panjikrit, panjikaran                                                                                                                                                             | None                                                                                        | `date_of_registration`                                                                                                                                                    |
| `first_use`        | Date of first use               | first used, first use, used since, in use since, user since, using since                                                                                                                                                      | None                                                                                        | `date_of_user`, `date_of_first_use`                                                                                                                                       |
| `appointment`      | Date of appointment             | appointed, appointment, नियुक्त, नियुक्ति, niyukt, niyukti                                                                                                                                                                    | None                                                                                        | `appointment_date`                                                                                                                                                        |
| `leave`            | Date leave was granted          | leave granted, leave of court, leave of the court, permission granted, अनुमति, anumati, ijazat                                                                                                                                | None                                                                                        | `leave_granted_date`, `leave_application_date`                                                                                                                            |

### 6.4 Dates that are never read from the description

- **Always asked (9):** `execution_date`, `date_of_verification`, `application_date`, `due_date_of_filing`, `certified_copy_applied_date`, `limitation_period_start`, `limitation_start_date`, `smr_certificate_date`, `definitive_agreement_deadline`. These are the date of the document itself, a legal conclusion, or a date the description cannot reliably tie to one fact. They are never read from the description. The user enters them.
- **Not a date (3):** `rent_due_date`, `license_fee_payable_on`, `period_elapsed_since_breach`. Named like a date in a pack but holds something else, such as a day of the month or a period.
- A date fact that is in no list here is always asked.

### 6.5 Two facts of one kind in a pack

In these packs two facts share a kind. The code cannot tell which one a date belongs to, so neither is placed from the description. Both are asked.

| Pack                                  | Kind                          | Facts                                                |
| ------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| `criminal_appeal`                     | Date of the order or judgment | `judgment_date`, `sentence_date`                     |
| `curative_petition`                   | Date of the order or judgment | `original_judgment_date`, `review_dismissal_date`    |
| `legal_notice_trademark_infringement` | Date of first use             | `date_of_user`, `date_of_first_use`                  |
| `rera_complaint`                      | Date of possession            | `promised_possession_date`, `actual_possession_date` |

### 6.6 Hindi month names

The date reader in `intake.service.ts` reads English month names only. These are added, so that "15 मार्च 2026" is read: जनवरी, फरवरी (फ़रवरी), मार्च, अप्रैल, मई, जून, जुलाई, अगस्त, सितंबर (सितम्बर), अक्टूबर (अक्तूबर), नवंबर (नवम्बर), दिसंबर (दिसम्बर). The list with numbers is in the data file.

## 7. Wording

### 7.1 On the brief

| Where                                     | Text                                                             |
| ----------------------------------------- | ---------------------------------------------------------------- |
| Mark on a value read from the description | Please check                                                     |
| Help text for the mark                    | We read this from your description. Check it before you confirm. |
| A date, with its meaning                  | Date of arrest: 25 August 2026 · Please check                    |
| A required fact that is not given         | Not given. The draft will show [To be confirmed: date of FIR].   |
| A date found with no stated meaning       | You wrote 25 August 2026. What is it the date of?                |
| Heading of "still unknown"                | Still unknown. These will be blanks in the draft.                |

The words inside the placeholder are the fact's label in lower case, for example `[To be confirmed: date of FIR]`. The two other placeholders in T-107, section 4, are unchanged.

### 7.2 Confirm is off on a court document

| What is missing | Text under the Confirm button                     |
| --------------- | ------------------------------------------------- |
| The court       | Choose the court to continue.                     |
| A party         | Add the name of the {party label} to continue.    |
| Both            | Choose the court and add the parties to continue. |

Nothing else switches Confirm off (decision D2).

### 7.3 On the draft

| State                                               | Label                                                   | Line shown with the draft                                        |
| --------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| Rule pack, every clause present, every check passed | None                                                    | None                                                             |
| Rule pack, a clause missing after the repair pass   | Starting draft — review before use · not court-verified | This draft does not cover: {clause titles}. Add them before use. |
| Rule pack, a check did not pass                     | Starting draft — review before use · not court-verified | {n} checks did not pass. See the findings.                       |
| No rule pack                                        | Starting draft — review before use · not court-verified | None                                                             |

- The footer text for a labelled draft is the one in T-107, section 4.
- The standard disclaimer stays on every draft, labelled or not.
- The user cannot remove the label or the footer.

## 8. Notes for Vishal

- Give the Reception model the checklist ids exactly as the loader returns them (`RulePackFact.key`), so the answer maps back with no guessing.
- The kind on a checklist line comes from the fact's type in the pack: `date` for a date, `choice` when the fact has options, `narrative` for a long text, `amount` for money, `number`, and `text` for the rest. A fact named in section 6.4 as "not a date" is `text`.
- Pack instructions sometimes name a form field, for example "if party_role = Accused". Keep the pack's fact names as the keys in the BRIEF so these still read correctly.
- `SYSTEM PARTS` is the list of parts the code will add for this pack: cause title, prayer, verification, advocate's block. A pack with no prayer or verification template has that part written by the Drafter, so it is not listed.
- The loader does not return `key_citations` (38 packs). Rule 6 of the Drafter prompt allows only the judgments that INSTRUCTIONS names. Do not pass `key_citations` to the Drafter until condition 4 in section 9 is met.

## 9. Sign-off

**Reference: Ajay, T-127, 6 Oct 2026.** This is the legal sign-off for the text used in T-122 (the guard), T-105 (Reception with a pack, the dates) and T-106 (the Drafter with a pack, the repair pass), on these conditions:

1. The three prompts, the line for the match prompt and the two data files are used exactly as written.
2. The server checks in sections 3, 4, 5 and 6 are built as written. A prompt on its own is not a control.
3. The gate in T-113 passes before the flow is switched on for anyone but the founder's test account. It includes: no swap between regular and anticipatory bail, no date under a meaning the description did not give, and no draft with a pack that reaches the user without its label while a clause is missing.
4. Before real users: a practising advocate reads the Hindi and Hinglish lists in sections 5 and 6, and checks the judgments named in the packs' instructions against a law report. These lists and those citations were written by the CLO agent. I have no record that a practising advocate has read either.
5. The conditions in T-107, section 9, still apply to a draft with no pack.

For the record:

- The cue lists cannot be complete. A description that states an arrest in words not on the list passes the guard untouched, and then only the match prompt stands between the user and the wrong document. The brief always shows the kind of document with a way to change it, and that is the last check.
- The date check errs towards asking. A user will sometimes be asked for a date they did write. That is the cost of never placing a date under the wrong meaning.
- 37 packs have no prayer template and 43 have no verification template (T-124 report). For those the Drafter writes the part. It is written under the pack's clauses, but it is not fixed text that I approved. T-128 covers required facts only, so this needs its own ticket.
