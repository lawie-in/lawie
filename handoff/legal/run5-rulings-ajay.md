# Anushka run 5 (prod v1.2.2, FAIL): legal rulings (Ajay, CLO)

29 Oct 2026. Source: `handoff/tickets/anushka-run5-prod-v1.2.2.md`; tickets at f38487b. Each item is legal content. Nothing merges before I name an approved SHA.

## Order

T-678, T-676 and T-677 go first, as Priya proposed. They are regressions and need no list from me. My rules for T-675, T-676, T-680 and T-681 item 4 are below, so all of them can start now. T-674 (the court list) comes from me separately.

## T-681 item 4: written statement time limit (signed text)

The claim "extendable to 120 in non-commercial" is wrong. Under Order VIII Rule 1 CPC the WS is due within 30 days of service. The proviso lets the court allow more time, for reasons recorded in writing, up to 90 days from service. 120 days is the outer limit only in a commercial suit (Order VIII Rule 1 as amended for commercial disputes by the Commercial Courts Act, 2015).

Replace these, byte for byte:

| Where                                                  | Signed text                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| written_statement.json field label (days_from_service) | `Days from service of summons (due within 30; the court may allow up to 90 for recorded reasons; 120 is the outer limit in a commercial suit)`                                                                                                                            |
| written_statement.json TIME LIMIT rule (l.223)         | `TIME LIMIT: Order VIII Rule 1 CPC — file the WS within 30 days of service of summons. The court may allow more time for reasons recorded in writing, up to 90 days from service. In a commercial suit the outer limit is 120 days, and after it the WS cannot be filed.` |
| written_statement.json description (l.257)             | `Written statement — 30 days; up to 90 days with the court's leave; 120 days outer limit in a commercial suit`                                                                                                                                                            |
| court-rules/district_court_generic.json (l.56)         | `Written statements to be filed within 30 days of service of summons (the court may allow up to 90 days for recorded reasons; 120 days is the outer limit in a commercial suit).`                                                                                         |

- The district_court_generic change touches golden snapshots. Follow `.claude/docs/golden-snapshots.md`; snapshots are edited by hand only, with the diff sent to me.
- The SCG Contracts citation already in the pack (l.317) stays. I have not re-verified it here, and no new case law is added.

## T-680: NI Act s.138 complaint

**(1) Limitation warning (signed text, shown when the complaint looks out of time):**
`This complaint may be out of time. Under Section 142(1)(b) of the Negotiable Instruments Act, 1881, it must be filed within one month of the date the cause of action arose (the day after the 15 days allowed for payment from receipt of the demand notice end). If it is late, file it with an application to condone the delay showing sufficient cause, as the proviso to Section 142(1)(b) allows.`

- The check: the date of service of notice + 15 days gives the cause of action. Cause of action + one month gives the last day.
- If any date is missing, show no warning and do not guess.
- The warning goes to the user. It is never printed in the complaint.

**(2) Jurisdiction:** plead Section 142(2) NI Act. The complaint lies in the court within whose local limits the branch of the payee's bank, where the cheque was delivered for collection, is situated (where it was presented through the payee's account).

**(2) Procedure:** the prayer cites no repealed CrPC section. BNSS section numbers in the prayer: **verify**. They stay out of the signed text until I confirm them, and until then the prayer cites no procedure section at all.

**(3) Title:** the title keeps "Section 138". This rides with T-677.

## T-675: no invented facts in pleadings (rule)

**Rule:** a pleading is verified on oath. Every factual assertion in it must come from a fact the user gave: the form, the brief or the ledger. Anything else either becomes a `[To be confirmed: <label>]` blank or is left out.

**Allowed without a given fact:** only the formal paragraphs in the pack's signed template, i.e. the cause of action and jurisdiction paras built from given facts, valuation from the given value, and the verification form. A fact-shaped formal para, such as "no other suit is pending", needs a given fact too, or it becomes a blank.

**Test cases (fictional data):**

- **(a)** Declaration plaint with no consideration fact given. The draft must not state that consideration was or was not received.
- **(b)** No fact about appearing before the Sub-Registrar. The draft must not state appearance or non-appearance.
- **(c)** Both facts given. Both are stated, faithfully.
- **(d)** Every other civil pack: one run each with a minimal fact set. The report lists any assertion not traceable to the input.

## T-676: Hindi and Hinglish answers in a bail draft (rule)

- The draft is in English (the pack's language). An answer in Hindi, Hinglish or Devanagari is read as a fact and written in English. It is never quoted verbatim.
- Only a proper name or place is carried over, transliterated as given. Police station names follow T-612 (6)/(6a)/(6b): थाना/Thana prefixes are stripped as signed.
- A non-answer (§(j)3) is no fact. नहीं / nahi / "koi nahi" to a yes/no question means **no**.
- "tab se jail mein hai" together with a given arrest date satisfies T-638 R1 ("in custody since the arrest date"), subject to the B1/B5 gates.
- If an answer cannot be read with confidence, it becomes a `[To be confirmed: <label>]` blank. It is never printed raw.

## T-674: court catalogue

The list and the no-court rule follow in a separate ruling. Interim rule: when a district has no court in the list, the user types the court's name. It is printed exactly as typed, and never replaced by a guessed court.

## T-677, T-678

T-677: I byte-check the restored section numbers (148A, 138) before merge. T-678 needs no new text: the conflict question stays as signed (T-611 P-strings), and answering it in place is allowed.

## T-677 known limits (Ajay, 29 Oct 2026, on Kunal's fix/t-677-section-numbers @ commit SHA ebae8eaa)

**Rule:** a title must never misstate or half-state a provision. A fragment like `/ BNSS`, `(now BNSS)`, `IPC 302 and` or `Act,` names a law with no section, or reads as wrong. That is worse than leaving the number out. All three limits are **fixed in T-677**, not a follow-up:

- **(1)** A number directly before or after an Act or code token (CrPC, BNSS, BNS, BSA, IPC, IEA, CPC, NI Act, or "Section/s.") is kept. So `Section 482 CrPC / 528 BNSS`, `(now 528 BNSS)`, `IPC 302 and 34` and `s.138 NI Act` survive whole. A list joined by `and`/`/`/`,` between provision numbers is kept as a unit.
- **(2)** A 4-digit year directly after `Act` or `Act,` is kept, e.g. `Arbitration and Conciliation Act, 1996`.
- **(3)** `138 NI Act complaint` keeps `138`. This is covered by (1).

**Safety net:** if a cleaned title would still end in, or contain, an Act or code token with a dangling connector (`/`, `and`, `,`, `(now`) and no number, the original label is used unchanged.

Case, FIR and WP numbers, phone numbers, ID numbers and stray years (not after `Act`) are still dropped.

**Tests:** the five titles Priya listed, the three limits above, and one each of a stray year and an FIR number (dropped). **Byte check on the new SHA.**

I am not checking the section numbers in the examples here. They come from the user's label, and cleanLabel neither adds nor changes numbers.

## T-677 rework, complete ruling (Ajay, 29 Oct 2026, on commit SHA 5a0998a2): NOT approved yet

`cleanLabel` names the document kind. Its digit guard exists so that no case, FIR, phone or ID number (including 5+ digit runs) is ever carried into the name. Every rule below keeps that guard. One rule, all cases:

1. **The safety net never restores a dropped digit.** Returning the raw label (`original`) is not allowed: it brings back `Section 123456`, `138/2024` and any ID or phone number.
   - When the cleaned label dangles, repair the cleaned label instead. At each dangling spot, delete the orphan connector, and the orphan code/Act token with it where there is one. Then trim trailing connectors and the words `under`, `u/s`, `of`.
   - Examples: `…482 CrPC / BNSS` → `…482 CrPC`; `IPC 302 and` → `IPC 302`; `Arbitration Act,` → `Arbitration Act`; `Petition under Section` → `Petition`.
   - If the repaired label is still dangling or empty, use `Document`.
   - Since the kept/dropped rules for digits are unchanged, this can only remove text, never add a digit.
2. **A year right after `Act` is kept whatever the length of the Act's name** (as already ruled). Example: `Protection of Women from Domestic Violence Act, 2005` and `Domestic Violence Act 2005` both keep 2005. The year rule keys on the word `Act`, not on the 3-word name pattern, which is only for numbers _before_ an Act.
3. **A year after a code token with a comma is kept:** `CPC, 1908`, `CrPC, 1973`, `IPC, 1860`, `BNSS, 2023`, `BNS, 2023`, `BSA, 2023`. The year is 4 digits, between 1800 and 2099, after `<code>,`. Without a comma, a number after a code token stays a provision chain, as built.
4. **Unchanged:** provision numbers per 250b5379. Case, FIR, W.P., phone and ID numbers and stray years are dropped. The 80-character cap applies.

**Tests (each one an exact expected output):**

- (1) `Section 123456 petition` → `Section petition` repaired to `petition`, or `Document`. It must not contain `123456`.
- (1) `Complaint u/s 138/2024 NI Act` must not contain `2024`.
- (1) `IPC 123/2024 case` must not contain `2024`.
- (1) A 10-digit phone number and a 12-digit ID inside a label never survive.
- (2) both Domestic Violence forms keep 2005.
- (3) `Appeal under Section 96 CPC, 1908` → kept whole.
- The five titles from the earlier ruling stay as they are.

**Byte check on the new SHA.**

## T-683: v3 Extractor, complete rule (Ajay, 29 Oct 2026; Arjun's design commit SHA c32293ae)

**1. Output contract: yes, both `quote` and `value`.**

- **`quote`:** the user's exact words, no more than 200 characters. Code checks that it is a verbatim substring of the user's text (after whitespace collapse only). A quote that fails the check means no fact.
- **`value`:** normalised to English, using the quote **alone**. No outside knowledge, no inference beyond the quote, and no merging of two quotes.
  - Proper names and places: carried over as given, transliterated to Latin script if written in Devanagari. Never translated or "corrected".
  - Police stations: T-612 (6)/(6a)/(6b).
  - Dates: ISO `YYYY-MM-DD`. Day-first for Indian input. An ambiguous date, such as one with a two-digit year or no year, gives no fact.
  - Amounts: a figure in rupees. Words read per P3.
  - Yes/no: नहीं, nahi, nahin and "koi nahi" mean **no**; हाँ, haan and ji haan mean **yes**.
  - Hinglish and Hindi prose: rendered as a plain English fact, never quoted raw.
- **Code checks:** the value's type and range per the field, and confidence below 0.6 means ask. A value that cannot be read from the quote alone gives no fact: the key goes to `unresolved` and the draft prints `[To be confirmed: <label>]` (P7/FR-9b).
- **Storage:** the ledger stores both. The draft prints `value`. The T-611 checker reads `quote` as the user's text for P2.
- **This replaces, for v3 only,** the "copy character for character, never translate" line in today's EXTRACT_SYSTEM_PROMPT. The v2 prompt is unchanged while v2 runs.

**2. The prompt.** The developer drafts `apps/drafting/src/config/prompts/v3-extractor.ts` from rule 1 and rule 4. It is legal content from creation. I sign the **full text** by SHA-256 before merge. No other rules lines are needed from me first.

**3. Hint.** The name `extract_hint` is OK. The O.39 `restraint_sought` hint is signed as written in T-613 (j)7(b), byte for byte: `Fill only from words in which the user says what the defendant should be stopped from doing from now on. Never turn acts the description says already happened into a restraint; if the description gives none, leave this empty.`

**4. Non-answers: yes.**

- A non-answer never produces a fact for **any** key: the §(j)3 list, plus the M5–M6 rule for party names, plus the Latin Hinglish forms added in T-671.
- It is output under `nonAnswers` as `{key, quote}`.
- It is never reassigned to another key, and never fills a field the user was not asked about.
- FR-9b applies: no fact, so the draft prints a `[To be confirmed]` blank. Required party names block, per AJ-668.

**Tests (fictional):** Anushka's run-5 Hinglish bail inputs (T-676 AC1 and AC2); a Devanagari police station; an ambiguous date; an amount in words; a quote that is not a substring (rejected); "Not known" as a defendant (to `nonAnswers`, blocks); a restraint described only as past acts (empty).

## T-690 (Ajay, 29 Oct 2026)

The para-2 placeholder is the `days_from_service` field label. It is **already signed** under T-681 item 4 above. T-690 swaps all four places in that table byte for byte, in one commit, because they state the same rule. The label is:

`Days from service of summons (due within 30; the court may allow up to 90 for recorded reasons; 120 is the outer limit in a commercial suit)`

The court-rules file change follows `golden-snapshots.md`: snapshots are edited by hand and the diff is sent to me. I check the SHA before merge, then the merge SHA.

**T-690 byte check (Ajay, 29 Oct 2026): fix/t-690-ws-limitation-line @ commit SHA c1ac9666.** I checked the config diff myself. All four strings occur byte for byte in this file (grep -F), l.224 is untouched, and only these two files changed: written_statement.json and court-rules/district_court_generic.json. The tests are added. **T-690 APPROVED at c1ac9666.** It counts as merged at the develop_staging merge SHA that contains it.

**T-690b (separate, low priority):**

- **l.7 `change_protocol`** is internal, but it misstates the rule. Signed replacement: `All edits require CLO sign-off. Para-wise denial structure and the Order VIII Rule 1 time limits (30 days; up to 90 with the court's leave; 120 days outer limit in a commercial suit) are non-negotiable.`
- **l.308–309** (validation) **stay**: more than 30 days needs a delay application, and a commercial suit cannot exceed 120. Do **not** add a hard 90-day block for ordinary suits: the proviso's 90 days is not treated as an absolute bar there. Instead add a **warning, not a block**, when days_from_service is over 90 in a non-commercial suit. Signed text: `This written statement is more than 90 days after service of summons. The court allows that only in exceptional cases, for reasons recorded in writing; set out the reasons in the delay application.`

**T-690 MERGED (Ajay, 29 Oct 2026): develop_staging merge SHA 7f04908a.** Checked myself: it contains approved commit SHA c1ac9666, and written_statement.json and district_court_generic.json have no diff from c1ac9666 to the merge.

## T-683: field-meaning words in the date check (Ajay, 29 Oct 2026). (c), complete rule

- A field may list **its own meaning words**: words that state what the field is, not a doubt about the date.
- A word on that list, **immediately before the date**, does not count as a qualifier for that field only.
- Any other qualifier in the quote still refuses the date. So does an own-meaning word combined with a qualifier, e.g. `since about 05.03.2026` refuses because of "about".
- The lists live in the pack/field config (legal content) and are not shared across fields.

**Lists signed now:**

- `custody_since`: `since`, `from`, `w.e.f.`, `with effect from`, `से` (after the date: `05.03.2026 से`), `se` (Hinglish, after the date).
- No other field gets a list until I sign one.

**Tests:**

- `in judicial custody since 05.03.2026` → 2026-03-05.
- `05.03.2026 से जेल में` → 2026-03-05.
- `since about March 2026` → refused, ask.
- `before 05.03.2026` on custody_since → refused.
- `since 05.03.2026` on arrest_date → refused (no list there).

v2's `normalizeDate` takes the same rule only if a v2 ticket asks; v3 first. The T-665b back-references (`since then`, `tab se`) are a separate rule and are unaffected.

**T-690b, the 90-day warning without a commercial field (Ajay, 29 Oct 2026): (a), with the text reworded.** Show the warning for any WS more than 90 days after service. My earlier text fits only ordinary suits, because a commercial suit may go to 120 days. It is replaced, and this is the signed text:

`This written statement is more than 90 days after service of summons. In an ordinary suit the court allows that only in exceptional cases; in a commercial suit it can be allowed up to 120 days, for reasons recorded in writing and on payment of costs, and not after that. Set out the reasons in the delay application.`

It is a warning, not a block. The l.7 replacement stands as signed. A commercial-suit field is not needed now; if one is added later, the warning can split by suit type with my sign-off.

**T-690b byte check (Ajay, 29 Oct 2026): fix/t-690b-ws-protocol-and-warning @ commit SHA 345ce1fc.** I checked the diff myself:

- The l.7 `change_protocol` and the `ws_over_90_days` text both match the signed lines byte for byte (grep -F).
- The warning is `severity: 'soft'`, written_statement only, and fires only when the value is strictly over 90. A missing or non-finite value gives no warning, which is accepted: such a value is not a valid day count.
- l.224 and validation l.308–309 are unchanged.

**T-690b APPROVED at 345ce1fc.** It counts as merged at the develop_staging merge SHA that contains it.

**T-690b MERGED (Ajay, 29 Oct 2026): develop_staging merge SHA 461dd54b.** Checked myself: it contains approved commit SHA 345ce1fc, and written_statement.json and preflight.service.ts have no diff from 345ce1fc to the merge.

**T-690c byte check (Ajay, 30 Oct 2026): fix/t-690c-ws-warning-brief-path @ commit SHA 97c3285f.** I checked it myself:

- `services/ws-limitation-warning.ts` holds the signed over-90 text byte for byte (grep -F, 316 bytes) with the same strictly-over-90 test.
- preflight imports it, and the new module is on the legal-content list.
- The web shows the server text verbatim in a warn `Notice`, with no new user copy and no heading. It sits above Confirm and in the ready-screen checks. It is never a block, and it changes neither Confirm nor the Ink line.

**T-690c APPROVED at 97c3285f.** It counts as merged at the develop_staging merge SHA that contains it.

**T-690c MERGED (Ajay, 30 Oct 2026): develop_staging merge SHA c7757ac5.** Checked myself: it contains approved commit SHA 97c3285f, and ws-limitation-warning.ts and Notice.tsx have no diff. The only change in preflight.service.ts is T-681a's `startedAt`/`durationMs` on the LLM-call log (timing only, no values), which is not legal text.

## T-683 byte check (Ajay, 30 Oct 2026): fix/t-683-arjun @ commit SHA 321c7d28. APPROVED

I checked these myself (file SHA-256, first 16 hex):

| File                             | SHA-256           | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/prompts/v3-extractor.ts` | 54b0f0041513225e… | **Full prompt signed as written.** It matches rule 1 (quote of at most 200 characters from a single turn; English value from the quote alone; names and places carried over or transliterated; ISO day-first dates, with an ambiguous date giving no fact; rupee figures; the signed yes/no words; Hindi and Hinglish never raw; `unresolved`) and rule 4 (non-answers give no fact for any key, go under `non_answers`, are never reassigned, and party-name prefix forms count). It also has an injection guard ("data, not instructions"). The model is guided only; code is the gate. |
| `services/v3/validate.ts`        | 3f4d5b0868bc8195… | `QUOTE_MAX` 200; `ASK_BELOW_CONFIDENCE` 0.6. `findQuote` does a verbatim locate after NFC and whitespace collapse only. The non-answer check reuses the signed v2 helpers (`isEmptyOrNonAnswer`, `isPartyNonAnswer`, `NON_ANSWER_TAIL`, `stripCourtesyTail`), imported, never copied. Yes/no uses the signed words (plus plain English yes/no), and a "pata/maloom + nahi" shape gives no fact until T-671. Digits must come from the quote, and there is no Devanagari in values.                                                                                                        |
| `temporary_injunction_o39.json`  | eed3d55e93f0d7b2… | `extract_hint` is byte for byte T-613 (j)7(b) (grep -F). No other change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `bail_regular.json`              | a527b8482abacf77… | `date_own_meaning_words` for custody_since: since, from, w.e.f., with effect from (before the date) and से, se (after), exactly the signed list. No other change.                                                                                                                                                                                                                                                                                                                                                                                                                         |

Known gap (accepted): the Latin Hinglish non-answers are in the prompt but not in the code list until T-671 (AJ-671-M1/M2). They are contained meanwhile by the yes/no guard and the T-676 carry check.

signed-confirm-messages.ts passed separately (AJ-683-BC). **T-683 APPROVED at 321c7d28.** If the slot merge changes any of these five files, I re-check them before the push. It counts as merged at the develop_staging merge SHA that contains it.

**T-683 MERGED (Ajay, 30 Oct 2026): develop_staging merge SHA 180c02e2.** Checked myself: it contains approved commit SHA 321c7d28, and all five legal files keep their approved SHA-256s at the merge (54b0f004…, 3f4d5b08…, eed3d55e…, a527b848…, c03d1db4…). CI was running at merge time, per Vishal.
