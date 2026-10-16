# Drafting v2: legal constraints (Ajay, CLO)

For Arjun's architecture (handoff/design/drafting-v2/). These are constraints, not a review. Items marked **verify** are not settled law in my view yet. They stay out of any signed text until I confirm them.

## 1. Source classes and weight

Order of force (top wins on conflict):

1. Constitution.
2. Central and State Acts, including Schedules, and the CPC Appendix forms that are part of the statute. A State law that is repugnant to a Central law on a Concurrent List subject yields to it (Art. 254), unless it received the President's assent.
3. Rules, regulations and bye-laws: subordinate, and valid only within the parent Act.
4. Notifications: commencement, extension, Schedule amendments and rates. These often decide whether a provision applies at all (e.g. the BNS/BNSS/BSA commencement), so they are a **separate class, never optional**.
5. State amendments to central procedural Acts (CPC, CrPC/BNSS, Stamp Act, Court-fees). These are tagged by State.
6. Court rules: SC Rules 2013, each HC's Rules and Original Side Rules, Family Court and Tribunal rules. These are tagged by court.
7. Practice directions, circulars and standing orders of a court: binding on filings in that court, tagged by court and date.
8. Judgments:
   - SC: binds every court (Art. 141). A larger bench prevails over a smaller one, and a bench is bound by an earlier bench of equal or larger strength.
   - Own-State HC: binds the courts below it.
   - Other HCs: persuasive.
   - Tribunals: persuasive outside their own hierarchy.
   - Foreign courts: persuasive only.
   - Store **bench strength** and **paragraph-level ratio vs obiter**. Only the ratio binds.
9. Commentaries, treatises and private form books: **never an authority**. They may guide structure, but must never carry a legal proposition alone.

Missing from your list: notifications (4), state amendments (5), practice directions and circulars (7), the statute's own forms, and statutory Schedules.

## 2. Judgment status

"Good-law status + date + source" is not enough. Each judgment needs:

- **status**: one of good; overruled (by id, date, whole or on a point/para); reversed or modified in appeal; per incuriam (declared by id); referred to a larger bench (pending, by id); stayed; or review/curative pending.
- **scope**: which paragraphs or propositions the status affects (the point of law, not the whole judgment).
- **verified_by** and **verified_on**.

"Distinguished" is a note, not a status: the judgment stays good law.

Rules:

- The drafting system cites only judgments whose status is **good as of the drafting date for the point relied on**.
- "Referred to larger bench" may be cited only with a printed flag.
- Unknown status means it is not citable; the slot becomes a blank.

**Who sets status:** a licensed citator feed if the founder licenses one, with my spot checks. Otherwise it starts **CLO-verified**, for the judgments the packs actually rely on. Never infer status from a headnote with the model.

## 3. As-of dates per document family

Rule zero: an **unknown as-of date means a blank, never today** (T-440).

| Family | Substantive law as of | Procedure as of |
|---|---|---|
| Criminal (bail, quashing, revision, appeal, discharge) | Offence date (Art. 20(1): no heavier penalty than at commission) | FIR/complaint registration date, or `procedure_code` (signed T-245 rule; BNSS s.531 savings) |
| Evidence questions in criminal or civil matters | **verify**: BSA transition for pending trials | — |
| Civil suits and replies | Date the cause of action arose | Filing date (CPC, court rules, court fee) |
| Limitation | Computed from the cause-of-action date under the Limitation Act; **verify** any transition | — |
| Deeds and agreements | Execution date (stamp duty schedule of that State on that date; registration law) | Presentation date for registration |
| Notices (s.138 and statutory notices) | Date of the triggering event (e.g. the return memo) | Notice date |
| Family / matrimonial | Marriage date decides which Act or personal law applies | Filing date |
| Tax (IT, GST) | Assessment year / tax period | Filing date. Income-tax Act, 2025 transition: **verify** (T-456) |
| Writs | Law in force at the impugned action; current law for the relief | Filing date |
| Company / IBC | Date of the default or act | Filing date |

One draft never mixes old and new codes for the same question (signed T-245 rule).

## 4. Quoting

- **Sections:** verbatim quotes are allowed and preferred, but only byte-exact from the library version in force on the as-of date, inside quote marks, with the section reference. Never paraphrase inside quote marks. A paraphrase outside quote marks must carry the authority id.
- **Judgments:** quote only paragraph text verbatim, with the para number. A holding may be paraphrased outside quote marks, with the authority id and para.
- **Never quote** headnotes, summaries or commentary text. These are the publisher's copyright, not law. The founder should check whether the reporter's para numbering and citations may be printed under the licence.
- Use the authoritative language text for the court. Machine translation of a statute is never presented as the statute.

## 5. What stays signed by me

Signed by me:

- The source hierarchy and status rules (1, 2).
- The as-of rules per family (3).
- The quoting rules (4).
- The citation format (6).
- The never-list (7).
- The `[To be confirmed: …]` convention.
- The disclaimer lines.
- **Each part's rules and skeleton text**: cause title, parties, jurisdiction, limitation, facts, grounds, prayer, verification, affidavit, annexures, and the advocate block.

A **new document kind** composed only of signed parts still needs a short sign-off of its **registry entry**, not of the parts. The registry entry is:

- statutory basis;
- forum;
- which verification/affidavit form applies;
- mandatory parts;
- court-fee and limitation hint.

That is a one-line review. Until I sign the entry, the kind may be drafted only with a printed banner: "This document type has not yet been reviewed by Lawie's legal team." The founder decides whether the banner is acceptable at launch, or whether unreviewed kinds are hidden instead.

Every family keeps a golden set that I review when its rules change.

## 6. Citation format

- The model never composes a citation. It prints the library's metadata as stored.
- SC: party names (v.), then the **neutral citation** where one exists (e.g. `2023 INSC …`), then one report citation if licensed (SCC preferred, else AIR), then `para N`.
- HC: party names, neutral citation if the HC issues one, else the report citation, then the court, then `para N`.
- Print bench strength when relying on the larger-bench rule.
- No citation in the library means no citation: `[Authority — add if relied upon]` (signed S, T-441).

## 7. Never

1. Never state law without an authority id that resolves in the library; otherwise use a blank.
2. Never invent or assume a fact, date, amount, party, relationship or document. Missing facts become `[To be confirmed: …]`.
3. Never add a **ground** the facts given do not support. Suggested grounds are shown separately for the advocate to accept, never silently inserted.
4. Never insert a judgment the advocate did not accept. Library suggestions are shown as a list; insertion happens on acceptance.
5. Never cite law that is not good as of the date, or commentary as authority.
6. Never compute a deadline or limitation from an unknown or assumed date.
7. Never mix old and new codes for the same question.
8. Never complete an oath, verification or affidavit as if the deponent had sworn it, and never sign as the advocate.
9. Never predict outcomes or give advice to the litigant. Lawie drafts for an advocate.
10. Never alter text the user supplied as a quote (an FIR extract, an order) except to mark it.
11. Never send client facts or document content to third-party logs (existing rule).

Signed: Ajay (CLO), 15 Oct 2026 IST.
