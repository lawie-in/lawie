# T-250: corrected IEA to BSA table, BNSS label fixes, and pack citations (signed)

Ajay (CLO), 12 Oct 2026 IST. Replaces my own table `apps/drafting/src/config/sections/iea-to-bsa.json` (validated 10 May 2026), which was wrong.

## What was wrong

Of 185 rows, **117 pointed at the wrong BSA section**. The error is mostly one section too high from IEA 5 to 65 (for example IEA 62 "primary evidence" is BSA 57, not 58; IEA 65 is BSA 60, not 61) and wrong again from IEA 74 on. BSA 61 is a new provision (electronic or digital record), and the table listed a "170A" that does not exist. IEA 100 was marked repealed; it is BSA 103. IEA 65A (BSA 62) and 65B (BSA 63) were already right, and so is every section I cited in T-239 batch 1 (BSA 63 for IEA 65B).

## How it was rebuilt

Each row was matched to the BSA heading in the Gazette text of the Act (170 headings) and to two independent comparison tables; a row is accepted only when the sources agree and the heading is the same provision. No row is set to verify. Sources: the Gazette copy (PRS), the insaaf comparative table, the Project 39A annotated comparison of the Bill (its clause numbers equal the Act's, row by row, by heading). I spot-checked 40 rows myself against my own knowledge of the Act (for example 32→26 dying declaration, 45→39 experts, 113A→117, 113B→118, 114A→120, 27→23(2)); all agree. India Code could not be fetched (error page), so the BNSS checks below rest on one source.

## What the lead does (T-250; shashank)

1. Replace `apps/drafting/src/config/sections/iea-to-bsa.json` with the JSON block in section A, byte for byte. SHA-256 of the block text (the text between the fences, with its final newline): `19a2e8c3276919fdb842c393acf8158a4ff34be976d8206a26c2d9cbefbf8f0b`.
2. In `apps/drafting/src/config/sections/crpc-to-bnss.json`, replace the `new_provisions` object with the block in section B. Nothing else in that file changes.
3. In `apps/drafting/src/config/document-rules/production_of_documents.json`, replace the string that starts `"Para 7: Documents not protected by legal privilege` with the text in section C. Nothing else changes.
4. Tests that count or read these tables: update the expectation only where it asserted a wrong pair, and list each such assertion for me. Golden snapshots that move are listed for me before merge.
5. `grep` the other packs, prompts and tests for any BSA section number (for example "S.xx BSA", "BSA xx"); any that does not match the table below goes to me.

## A. `iea-to-bsa.json` (signed)

```json
{
  "_meta": {
    "description": "IEA 1872 → BSA 2023 section mapping — supports section converter free tool (SCRUM-46) and AI prompt context for advocates citing old IEA numbers",
    "owner": "Ajay (CLO)",
    "validated_by": "Ajay (CLO) - 2026-10-12 - corrected table (T-250)",
    "last_updated": "2026-10-12",
    "source": "Gazette of India Extraordinary 25 Dec 2023 (BSA 2023 headings and text); insaaf IEA/BSA comparative table; Project 39A Bharatiya Sakshya Bill annotated comparison. See sources.md.",
    "change_protocol": "CLO sign-off required; no AI-authored entries"
  },
  "meta": {
    "old_code": "IEA",
    "old_code_full": "Indian Evidence Act, 1872",
    "new_code": "BSA",
    "new_code_full": "Bharatiya Sakshya Adhiniyam, 2023",
    "act_number": "Act No. 47 of 2023",
    "effective_date": "2024-07-01",
    "total_old_sections": 167,
    "total_new_sections": 170,
    "validated_by": "Ajay (CLO) - 2026-10-12 - corrected table (T-250); every row checked against the Gazette headings of the BSA and two comparison tables",
    "last_updated": "2026-10-12"
  },
  "mappings": {
    "1": {
      "new": "1",
      "old_title": "Short title, extent and commencement",
      "new_title": "Short title, application and commencement",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "2": {
      "new": null,
      "old_title": "Repeal of enactments",
      "new_title": null,
      "type": "repealed_no_equivalent",
      "new_law_status": "insaaf shows \"---\"; absent from every clause of the Project 39A table; no Gazette heading or text repeals earlier enactments (BSA 170 repeals only the IEA itself)",
      "source": "insaaf;p39a-absent;gazette-no-heading"
    },
    "3": {
      "new": "2(1)",
      "old_title": "Interpretation clause — Court, Fact, Document, Evidence, Proved etc.",
      "new_title": "Definitions",
      "type": "merged",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 2(1) contains the definitions (Court, document, evidence, fact, proved ...); heading \"Definitions\" = IEA \"Interpretation clause\"."
    },
    "4": {
      "new": "2(1)",
      "old_title": "May presume — Shall presume — Conclusive proof",
      "new_title": "Definitions",
      "type": "merged",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 2(1)(b),(h) and the \"shall presume\" definition sit in 2(1); IEA 4 (may presume / shall presume / conclusive proof) is folded into the BSA definitions."
    },
    "5": {
      "new": "3",
      "old_title": "Evidence may be given of facts in issue and relevant facts",
      "new_title": "Evidence may be given of facts in issue and relevant facts",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "6": {
      "new": "4",
      "old_title": "Relevancy of facts forming part of same transaction (Res gestae)",
      "new_title": "Relevancy of facts forming part of same transaction",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "7": {
      "new": "5",
      "old_title": "Facts which are the occasion, cause or effect of facts in issue",
      "new_title": "Facts which are occasion, cause or effect of facts in issue or relevant facts",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "8": {
      "new": "6",
      "old_title": "Motive, preparation and previous or subsequent conduct",
      "new_title": "Motive, preparation and previous or subsequent conduct",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "9": {
      "new": "7",
      "old_title": "Facts necessary to explain or introduce relevant facts",
      "new_title": "Facts necessary to explain or introduce fact in issue or relevant facts",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "10": {
      "new": "8",
      "old_title": "Things said or done by conspirator in reference to common design",
      "new_title": "Things said or done by conspirator in reference to common design",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "11": {
      "new": "9",
      "old_title": "When facts not otherwise relevant become relevant",
      "new_title": "When facts not otherwise relevant become relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "12": {
      "new": "10",
      "old_title": "In suits for damages — facts tending to enable Court to determine amount are relevant",
      "new_title": "Facts tending to enable Court to determine amount are relevant in suits for damages",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "13": {
      "new": "11",
      "old_title": "Facts relevant when right or custom is in question",
      "new_title": "Facts relevant when right or custom is in question",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "14": {
      "new": "12",
      "old_title": "Facts showing existence of state of mind or of body or bodily feeling",
      "new_title": "Facts showing existence of state of mind, or of body or bodily feeling",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "15": {
      "new": "13",
      "old_title": "Facts bearing on question whether act was accidental or intentional",
      "new_title": "Facts bearing on question whether act was accidental or intentional",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "16": {
      "new": "14",
      "old_title": "Existence of course of business when relevant",
      "new_title": "Existence of course of business when relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "17": {
      "new": "15",
      "old_title": "Admission defined",
      "new_title": "Admission defined",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "18": {
      "new": "16",
      "old_title": "Admission by party to proceeding or his agent",
      "new_title": "Admission by party to proceeding or his agent",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "19": {
      "new": "17",
      "old_title": "Admissions by persons whose position must be proved as against party to suit",
      "new_title": "Admissions by persons whose position must be proved as against party to suit",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "20": {
      "new": "18",
      "old_title": "Admissions by persons expressly referred to by party to suit",
      "new_title": "Admissions by persons expressly referred to by party to suit",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "21": {
      "new": "19",
      "old_title": "Proof of admissions against persons making them and by or on their behalf",
      "new_title": "Proof of admissions against persons making them, and by or on their behalf",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "22": {
      "new": "20",
      "old_title": "When oral admissions as to contents of documents are relevant",
      "new_title": "When oral admissions as to contents of documents are relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "22A": {
      "new": null,
      "old_title": "When oral admission as to electronic records are relevant",
      "new_title": null,
      "type": "repealed_no_equivalent",
      "new_law_status": "Project 39A: \"S. 22A has been deleted\" (annotated text, clause 20); insaaf shows \"---\". Electronic records are covered only through the wider definition of \"document\" in BSA 2(1)(d).",
      "source": "insaaf;p39a-deleted-note;gazette-no-heading"
    },
    "23": {
      "new": "21",
      "old_title": "Admission in civil cases when relevant",
      "new_title": "Admissions in civil cases when relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "24": {
      "new": "22",
      "old_title": "Confession caused by inducement, threat or promise irrelevant in criminal proceeding",
      "new_title": "Confession caused by inducement, threat, coercion or promise, when irrelevant in criminal proceeding",
      "type": "merged",
      "source": "insaaf;p39a;gazette-heading"
    },
    "25": {
      "new": "23(1)",
      "old_title": "Confession to police officer not to be proved",
      "new_title": "Confession to police officer",
      "type": "merged",
      "source": "insaaf;p39a;gazette-heading"
    },
    "26": {
      "new": "23(2)",
      "old_title": "Confession by accused while in custody of police not to be proved against him",
      "new_title": "Confession to police officer",
      "type": "merged",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 23(2): no confession by a person in police custody unless in immediate presence of a Magistrate."
    },
    "27": {
      "new": "23(2)",
      "old_title": "How much of information received from accused may be proved",
      "new_title": "Confession to police officer",
      "type": "merged",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 23(2) proviso: information received from accused leading to discovery may be proved."
    },
    "28": {
      "new": "22",
      "old_title": "Confession made after removal of impression caused by inducement, threat or promise, relevant",
      "new_title": "Confession caused by inducement, threat, coercion or promise, when irrelevant in criminal proceeding",
      "type": "merged",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 22 first proviso: confession after impression of inducement fully removed is relevant."
    },
    "29": {
      "new": "22",
      "old_title": "Confession otherwise relevant not to become irrelevant because of promise of secrecy",
      "new_title": "Confession caused by inducement, threat, coercion or promise, when irrelevant in criminal proceeding",
      "type": "merged",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 22 second proviso: confession not irrelevant merely for promise of secrecy, deception, drunkenness, etc."
    },
    "30": {
      "new": "24",
      "old_title": "Consideration of proved confession affecting person making it and others jointly under trial for same offence",
      "new_title": "Consideration of proved confession affecting person making it and others jointly under trial for same offence",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "31": {
      "new": "25",
      "old_title": "Admissions not conclusive proof but may estop",
      "new_title": "Admissions not conclusive proof, but may estop",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "32": {
      "new": "26",
      "old_title": "Cases in which statement of relevant fact by person who is dead or cannot be found etc. is relevant (Dying declaration)",
      "new_title": "Cases in which statement of relevant fact by person who is dead or cannot be found, etc., is relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "33": {
      "new": "27",
      "old_title": "Relevancy of certain evidence for proving in subsequent proceeding the truth of facts therein stated",
      "new_title": "Relevancy of certain evidence for proving, in subsequent proceeding, truth of facts therein stated",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "34": {
      "new": "28",
      "old_title": "Entries in books of account when relevant",
      "new_title": "Entries in books of account when relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "35": {
      "new": "29",
      "old_title": "Relevancy of entry in public record made in performance of duty",
      "new_title": "Relevancy of entry in public record or an electronic record made in performance of duty",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "36": {
      "new": "30",
      "old_title": "Relevancy of statements in maps, charts and plans",
      "new_title": "Relevancy of statements in maps, charts and plans",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "37": {
      "new": "31",
      "old_title": "Relevancy of statement as to fact of public nature contained in certain Acts or notifications",
      "new_title": "Relevancy of statement as to fact of public nature contained in certain Acts or notifications",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "38": {
      "new": "32",
      "old_title": "Relevancy of statements as to any law contained in law books",
      "new_title": "Relevancy of statements as to any law contained in law books including electronic or digital form",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "39": {
      "new": "33",
      "old_title": "What evidence to be given when statement forms part of conversation, document, electronic record, book or series of letters or papers",
      "new_title": "What evidence to be given when statement forms part of a conversation, document, electronic record, book or series of letters or papers",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "40": {
      "new": "34",
      "old_title": "Previous judgments relevant to bar a second suit or trial",
      "new_title": "Previous judgments relevant to bar a second suit or trial",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "41": {
      "new": "35",
      "old_title": "Relevancy of certain judgments in probate etc. jurisdiction",
      "new_title": "Relevancy of certain judgments in probate, etc., jurisdiction",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "42": {
      "new": "36",
      "old_title": "Relevancy and effect of judgments, orders or decrees other than those mentioned in section 41",
      "new_title": "Relevancy and effect of judgments, orders or decrees, other than those mentioned in section 35",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "43": {
      "new": "37",
      "old_title": "Judgments etc. other than those mentioned in sections 40 to 42 when relevant",
      "new_title": "Judgments, etc., other than those mentioned in sections 34, 35 and 36 when relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "44": {
      "new": "38",
      "old_title": "Fraud or collusion in obtaining judgment or incompetency of Court may be proved",
      "new_title": "Fraud or collusion in obtaining judgment, or incompetency of Court, may be proved",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "45": {
      "new": "39(1)",
      "old_title": "Opinions of experts",
      "new_title": "Opinions of experts",
      "type": "merged",
      "source": "insaaf;p39a;gazette-heading"
    },
    "45A": {
      "new": "39(2)",
      "old_title": "Opinion of Examiner of Electronic Evidence",
      "new_title": "Opinions of experts",
      "type": "merged",
      "source": "insaaf;p39a-annotation;gazette-text",
      "notes": "Gazette BSA 39(2) (Examiner of Electronic Evidence); Project 39A annotation \"IEA, S. 45A\" at clause 39(2)."
    },
    "46": {
      "new": "40",
      "old_title": "Facts bearing upon opinions of experts",
      "new_title": "Facts bearing upon opinions of experts",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "47": {
      "new": "41(1)",
      "old_title": "Opinion as to handwriting when relevant",
      "new_title": "Opinion as to handwriting and signature, when relevant",
      "type": "merged",
      "source": "insaaf;p39a;gazette-heading"
    },
    "47A": {
      "new": "41(2)",
      "old_title": "Opinion as to electronic signature when relevant",
      "new_title": "Opinion as to handwriting and signature, when relevant",
      "type": "merged",
      "source": "insaaf;p39a;gazette-heading",
      "notes": "Gazette BSA 41(2): opinion of Certifying Authority on electronic signature; insaaf 41(2)."
    },
    "48": {
      "new": "42",
      "old_title": "Opinion as to existence of right or custom when relevant",
      "new_title": "Opinion as to existence of general custom or right, when relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "49": {
      "new": "43",
      "old_title": "Opinion as to usages, tenets etc. when relevant",
      "new_title": "Opinion as to usages, tenets, etc., when relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "50": {
      "new": "44",
      "old_title": "Opinion on relationship when relevant",
      "new_title": "Opinion on relationship, when relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "51": {
      "new": "45",
      "old_title": "Grounds of opinion when relevant",
      "new_title": "Grounds of opinion, when relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "52": {
      "new": "46",
      "old_title": "In civil cases character of party is irrelevant",
      "new_title": "In civil cases character to prove conduct imputed, irrelevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "53": {
      "new": "47",
      "old_title": "In criminal cases previous good character relevant",
      "new_title": "In criminal cases previous good character relevant",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "53A": {
      "new": "48",
      "old_title": "Evidence of character or previous sexual experience not relevant in certain cases",
      "new_title": "Evidence of character or previous sexual experience not relevant in certain cases",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "54": {
      "new": "49",
      "old_title": "Previous bad character not relevant except in reply",
      "new_title": "Previous bad character not relevant, except in reply",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "55": {
      "new": "50",
      "old_title": "Character as affecting damages",
      "new_title": "Character as affecting damages",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "56": {
      "new": "51",
      "old_title": "Fact judicially noticeable need not be proved",
      "new_title": "Fact judicially noticeable need not be proved",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "57": {
      "new": "52",
      "old_title": "Facts of which Court must take judicial notice",
      "new_title": "Facts of which Court shall take judicial notice",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "58": {
      "new": "53",
      "old_title": "Facts admitted need not be proved",
      "new_title": "Facts admitted need not be proved",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "59": {
      "new": "54",
      "old_title": "Proof of facts by oral evidence",
      "new_title": "Proof of facts by oral evidence",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "60": {
      "new": "55",
      "old_title": "Oral evidence must be direct",
      "new_title": "Oral evidence to be direct",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "61": {
      "new": "56",
      "old_title": "Proof of contents of documents",
      "new_title": "Proof of contents of documents",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "62": {
      "new": "57",
      "old_title": "Primary evidence",
      "new_title": "Primary evidence",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "63": {
      "new": "58",
      "old_title": "Secondary evidence",
      "new_title": "Secondary evidence",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "64": {
      "new": "59",
      "old_title": "Proof of documents by primary evidence",
      "new_title": "Proof of documents by primary evidence",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "65": {
      "new": "60",
      "old_title": "Cases in which secondary evidence relating to documents may be given",
      "new_title": "Cases in which secondary evidence relating to documents may be given",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "65A": {
      "new": "62",
      "old_title": "Special provisions as to evidence relating to electronic record",
      "new_title": "Special provisions as to evidence relating to electronic record",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "65B": {
      "new": "63",
      "old_title": "Admissibility of electronic records",
      "new_title": "Admissibility of electronic records",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "66": {
      "new": "64",
      "old_title": "Rules as to notice to produce",
      "new_title": "Rules as to notice to produce",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "67": {
      "new": "65",
      "old_title": "Proof of signature and handwriting of person alleged to have signed or written document produced",
      "new_title": "Proof of signature and handwriting of person alleged to have signed or written document produced",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "67A": {
      "new": "66",
      "old_title": "Proof as to electronic signature",
      "new_title": "Proof as to electronic signature",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "68": {
      "new": "67",
      "old_title": "Proof of execution of document required by law to be attested",
      "new_title": "Proof of execution of document required by law to be attested",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "69": {
      "new": "68",
      "old_title": "Proof where no attesting witness found",
      "new_title": "Proof where no attesting witness found",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "70": {
      "new": "69",
      "old_title": "Admission of execution by party to attested document",
      "new_title": "Admission of execution by party to attested document",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "71": {
      "new": "70",
      "old_title": "Proof when attesting witness denies the execution",
      "new_title": "Proof when attesting witness denies execution",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "72": {
      "new": "71",
      "old_title": "Proof of document not required by law to be attested",
      "new_title": "Proof of document not required by law to be attested",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "73": {
      "new": "72",
      "old_title": "Comparison of signature, writing or seal with others admitted or proved",
      "new_title": "Comparison of signature, writing or seal with others admitted or proved",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "73A": {
      "new": "73",
      "old_title": "Proof as to verification of digital signature",
      "new_title": "Proof as to verification of digital signature",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "74": {
      "new": "74(1)",
      "old_title": "Public documents",
      "new_title": "Public and private documents",
      "type": "merged",
      "source": "insaaf;p39a;gazette-heading"
    },
    "75": {
      "new": "74(2)",
      "old_title": "Private documents",
      "new_title": "Public and private documents",
      "type": "merged",
      "source": "insaaf;p39a;gazette-heading",
      "notes": "Gazette BSA 74 heading \"Public and private documents\"; 74(2) lists private documents."
    },
    "76": {
      "new": "75",
      "old_title": "Certified copies of public documents",
      "new_title": "Certified copies of public documents",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "77": {
      "new": "76",
      "old_title": "Proof of documents by production of certified copies",
      "new_title": "Proof of documents by production of certified copies",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "78": {
      "new": "77",
      "old_title": "Proof of other official documents",
      "new_title": "Proof of other official documents",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "79": {
      "new": "78",
      "old_title": "Presumption as to genuineness of certified copies",
      "new_title": "Presumption as to genuineness of certified copies",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "80": {
      "new": "79",
      "old_title": "Presumption as to documents produced as record of evidence",
      "new_title": "Presumption as to documents produced as record of evidence, etc",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "81": {
      "new": "80",
      "old_title": "Presumption as to Gazettes, newspapers, private Acts of Parliament and other documents",
      "new_title": "Presumption as to Gazettes, newspapers, and other documents",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "81A": {
      "new": "81",
      "old_title": "Presumption as to Gazettes in electronic form",
      "new_title": "Presumption as to Gazettes in electronic or digital record",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "82": {
      "new": null,
      "old_title": "Presumption as to document admissible in England without proof of seal or signature",
      "new_title": null,
      "type": "repealed_no_equivalent",
      "new_law_status": "Project 39A Note: \"Section 82 ... deleted from the Bill\"; insaaf \"---\"; no Gazette text on documents admissible in England.",
      "source": "insaaf;p39a-deleted-note;gazette-text-search"
    },
    "83": {
      "new": "82",
      "old_title": "Presumption as to maps or plans made by authority of Government",
      "new_title": "Presumption as to maps or plans made by authority of Government",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "84": {
      "new": "83",
      "old_title": "Presumption as to collections of laws and reports of decisions",
      "new_title": "Presumption as to collections of laws and reports of decisions",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "85": {
      "new": "84",
      "old_title": "Presumption as to powers-of-attorney",
      "new_title": "Presumption as to powers-of-attorney",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "85A": {
      "new": "85",
      "old_title": "Presumption as to electronic agreements",
      "new_title": "Presumption as to electronic agreements",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "85B": {
      "new": "86",
      "old_title": "Presumption as to electronic records and electronic signatures",
      "new_title": "Presumption as to electronic records and electronic signatures",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "85C": {
      "new": "87",
      "old_title": "Presumption as to Electronic Signature Certificates",
      "new_title": "Presumption as to Electronic Signature Certificates",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "86": {
      "new": "88",
      "old_title": "Presumption as to certified copies of foreign judicial records",
      "new_title": "Presumption as to certified copies of foreign judicial records",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "87": {
      "new": "89",
      "old_title": "Presumption as to books, maps and charts",
      "new_title": "Presumption as to books, maps and charts",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "88": {
      "new": null,
      "old_title": "Presumption as to telegraphic messages",
      "new_title": null,
      "type": "repealed_no_equivalent",
      "new_law_status": "Project 39A Note: \"Section 88: Presumption as to telegraphic messages\" deleted; insaaf \"---\". BSA 90 (presumption as to electronic messages) corresponds to IEA 88A only.",
      "source": "insaaf;p39a-deleted-note;gazette-text-search"
    },
    "88A": {
      "new": "90",
      "old_title": "Presumption as to electronic messages",
      "new_title": "Presumption as to electronic messages",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "89": {
      "new": "91",
      "old_title": "Presumption as to due execution etc. of documents not produced",
      "new_title": "Presumption as to due execution, etc., of documents not produced",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "90": {
      "new": "92",
      "old_title": "Presumption as to documents thirty years old",
      "new_title": "Presumption as to documents thirty years old",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "90A": {
      "new": "93",
      "old_title": "Presumption as to electronic records five years old",
      "new_title": "Presumption as to electronic records five years old",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "91": {
      "new": "94",
      "old_title": "Evidence of terms of contracts, grants and other dispositions of property reduced to form of document",
      "new_title": "Evidence of terms of contracts, grants and other dispositions of property reduced to form of document",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "92": {
      "new": "95",
      "old_title": "Exclusion of evidence of oral agreement",
      "new_title": "Exclusion of evidence of oral agreement",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "93": {
      "new": "96",
      "old_title": "Exclusion of evidence to explain or amend ambiguous document",
      "new_title": "Exclusion of evidence to explain or amend ambiguous document",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "94": {
      "new": "97",
      "old_title": "Exclusion of evidence against application of document to existing facts",
      "new_title": "Exclusion of evidence against application of document to existing facts",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "95": {
      "new": "98",
      "old_title": "Evidence as to document meaningless in reference to existing facts",
      "new_title": "Evidence as to document unmeaning in reference to existing facts",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "96": {
      "new": "99",
      "old_title": "Evidence as to application of language which can apply to one only of several persons",
      "new_title": "Evidence as to application of language which can apply to one only of several persons",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "97": {
      "new": "100",
      "old_title": "Evidence as to application of language to one of two sets of facts",
      "new_title": "Evidence as to application of language to one of two sets of facts, to neither of which the whole correctly applies",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "98": {
      "new": "101",
      "old_title": "Evidence as to meaning of illegible characters etc.",
      "new_title": "Evidence as to meaning of illegible characters, etc",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "99": {
      "new": "102",
      "old_title": "Who may give evidence of agreement varying terms of document",
      "new_title": "Who may give evidence of agreement varying terms of document",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "100": {
      "new": "103",
      "old_title": "Saving of provisions of Indian Succession Act relating to wills",
      "new_title": "Saving of provisions of Indian Succession Act relating to wills",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "101": {
      "new": "104",
      "old_title": "Burden of proof",
      "new_title": "Burden of proof",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "102": {
      "new": "105",
      "old_title": "On whom burden of proof lies",
      "new_title": "On whom burden of proof lies",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "103": {
      "new": "106",
      "old_title": "Burden of proof as to particular fact",
      "new_title": "Burden of proof as to particular fact",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "104": {
      "new": "107",
      "old_title": "Burden of proving fact to be proved to make evidence admissible",
      "new_title": "Burden of proving fact to be proved to make evidence admissible",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "105": {
      "new": "108",
      "old_title": "Burden of proving that case of accused comes within exceptions",
      "new_title": "Burden of proving that case of accused comes within exceptions",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "106": {
      "new": "109",
      "old_title": "Burden of proving fact especially within knowledge",
      "new_title": "Burden of proving fact especially within knowledge",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "107": {
      "new": "110",
      "old_title": "Burden of proving death of person known to have been alive within thirty years",
      "new_title": "Burden of proving death of person known to have been alive within thirty years",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "108": {
      "new": "111",
      "old_title": "Burden of proving that person is alive who has not been heard of for seven years",
      "new_title": "Burden of proving that person is alive who has not been heard of for seven years",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "109": {
      "new": "112",
      "old_title": "Burden of proof as to relationship in the cases of partners, landlord and tenant, principal and agent",
      "new_title": "Burden of proof as to relationship in the cases of partners, landlord and tenant, principal and agent",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "110": {
      "new": "113",
      "old_title": "Burden of proof as to ownership",
      "new_title": "Burden of proof as to ownership",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "111": {
      "new": "114",
      "old_title": "Proof of good faith in transactions where one party is in relation of active confidence",
      "new_title": "Proof of good faith in transactions where one party is in relation of active confidence",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "111A": {
      "new": "115",
      "old_title": "Presumption as to certain offences (disturbed areas)",
      "new_title": "Presumption as to certain offences",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "112": {
      "new": "116",
      "old_title": "Birth during marriage, conclusive proof of legitimacy",
      "new_title": "Birth during marriage, conclusive proof of legitimacy",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "113": {
      "new": null,
      "old_title": "Proof of cession of territory",
      "new_title": null,
      "type": "repealed_no_equivalent",
      "new_law_status": "Project 39A Note: \"Section 113: Proof of cession of territory\" deleted; insaaf \"---\"; no Gazette text on cession of territory.",
      "source": "insaaf;p39a-deleted-note;gazette-text-search"
    },
    "113A": {
      "new": "117",
      "old_title": "Presumption as to abetment of suicide by a married woman",
      "new_title": "Presumption as to abetment of suicide by a married woman",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "113B": {
      "new": "118",
      "old_title": "Presumption as to dowry death",
      "new_title": "Presumption as to dowry death",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "114": {
      "new": "119",
      "old_title": "Court may presume existence of certain facts",
      "new_title": "Court may presume existence of certain facts",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "114A": {
      "new": "120",
      "old_title": "Presumption as to absence of consent in certain prosecutions for rape",
      "new_title": "Presumption as to absence of consent in certain prosecution for rape",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "115": {
      "new": "121",
      "old_title": "Estoppel",
      "new_title": "Estoppel",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "116": {
      "new": "122",
      "old_title": "Estoppel of tenant and of licensee of person in possession",
      "new_title": "Estoppel of tenant and of licensee of person in possession",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "117": {
      "new": "123",
      "old_title": "Estoppel of acceptor of bill of exchange, bailee or licensee",
      "new_title": "Estoppel of acceptor of bill of exchange, bailee or licensee",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "118": {
      "new": "124",
      "old_title": "Who may testify",
      "new_title": "Who may testify",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "119": {
      "new": "125",
      "old_title": "Dumb witnesses (witness unable to communicate verbally)",
      "new_title": "Witness unable to communicate verbally",
      "type": "direct",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 125: witness unable to communicate verbally may give evidence in any other manner (IEA 119 dumb witnesses)."
    },
    "120": {
      "new": "126",
      "old_title": "Parties to civil suit and their wives or husbands; Husband or wife of person under criminal trial",
      "new_title": "Competency of husband and wife as witnesses in certain cases",
      "type": "direct",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 126(1)-(2): parties and spouses competent witnesses, spouse in criminal proceedings."
    },
    "121": {
      "new": "127",
      "old_title": "Judges and Magistrates",
      "new_title": "Judges and Magistrates",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "122": {
      "new": "128",
      "old_title": "Communications during marriage",
      "new_title": "Communications during marriage",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "123": {
      "new": "129",
      "old_title": "Evidence as to affairs of State",
      "new_title": "Evidence as to affairs of State",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "124": {
      "new": "130",
      "old_title": "Official communications",
      "new_title": "Official communications",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "125": {
      "new": "131",
      "old_title": "Information as to commission of offences",
      "new_title": "Information as to commission of offences",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "126": {
      "new": "132",
      "old_title": "Professional communications (Advocate-client privilege)",
      "new_title": "Professional communications",
      "type": "merged",
      "source": "insaaf;p39a;gazette-heading"
    },
    "127": {
      "new": "132(3)",
      "old_title": "Section 126 to apply to interpreters etc.",
      "new_title": "Professional communications",
      "type": "merged",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 132(3): \"provisions of this section shall apply to interpreters, and the clerks or employees of advocates\"."
    },
    "128": {
      "new": "133",
      "old_title": "Privilege not waived by volunteering evidence",
      "new_title": "Privilege not waived by volunteering evidence",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "129": {
      "new": "134",
      "old_title": "Confidential communication with legal advisers",
      "new_title": "Confidential communication with legal advisers",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "130": {
      "new": "135",
      "old_title": "Production of title-deeds of witness not a party",
      "new_title": "Production of title-deeds of witness not a party",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "131": {
      "new": "136",
      "old_title": "Production of documents or electronic records which another person having possession could refuse to produce",
      "new_title": "Production of documents or electronic records which another person, having possession, could refuse to produce",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "132": {
      "new": "137",
      "old_title": "Witness not excused from answering on ground that answer will criminate",
      "new_title": "Witness not excused from answering on ground that answer will criminate",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "133": {
      "new": "138",
      "old_title": "Accomplice",
      "new_title": "Accomplice",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "134": {
      "new": "139",
      "old_title": "Number of witnesses",
      "new_title": "Number of witnesses",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "135": {
      "new": "140",
      "old_title": "Order of production and examination of witnesses",
      "new_title": "Order of production and examination of witnesses",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "136": {
      "new": "141",
      "old_title": "Judge to decide as to admissibility of evidence",
      "new_title": "Judge to decide as to admissibility of evidence",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "137": {
      "new": "142",
      "old_title": "Examination-in-chief, cross-examination and re-examination",
      "new_title": "Examination of witnesses",
      "type": "direct",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 142(1)-(3) defines examination-in-chief, cross-examination, re-examination."
    },
    "138": {
      "new": "143",
      "old_title": "Order of examinations",
      "new_title": "Order of examinations",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "139": {
      "new": "144",
      "old_title": "Cross-examination of person called to produce a document",
      "new_title": "Cross-examination of person called to produce a document",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "140": {
      "new": "145",
      "old_title": "Witnesses to character",
      "new_title": "Witnesses to character",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "141": {
      "new": "146",
      "old_title": "Leading questions",
      "new_title": "Leading questions",
      "type": "merged",
      "source": "insaaf;p39a;gazette-heading"
    },
    "142": {
      "new": "146(2)-(3)",
      "old_title": "When they must not be asked",
      "new_title": "Leading questions",
      "type": "merged",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 146(2) (leading questions must not be asked in chief/re-exam if objected) and 146(3) (permitted for introductory/undisputed matters)."
    },
    "143": {
      "new": "146(4)",
      "old_title": "When they may be asked",
      "new_title": "Leading questions",
      "type": "merged",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 146(4): leading questions may be asked in cross-examination."
    },
    "144": {
      "new": "147",
      "old_title": "Evidence as to matters in writing",
      "new_title": "Evidence as to matters in writing",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "145": {
      "new": "148",
      "old_title": "Cross-examination as to previous statements in writing",
      "new_title": "Cross-examination as to previous statements in writing",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "146": {
      "new": "149",
      "old_title": "Questions lawful in cross-examination",
      "new_title": "Questions lawful in cross-examination",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "147": {
      "new": "150",
      "old_title": "When witness to be compelled to answer",
      "new_title": "When witness to be compelled to answer",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "148": {
      "new": "151",
      "old_title": "Court to decide when question shall be asked and when witness compelled to answer",
      "new_title": "Court to decide when question shall be asked and when witness compelled to answer",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "149": {
      "new": "152",
      "old_title": "Question not to be asked without reasonable grounds",
      "new_title": "Question not to be asked without reasonable grounds",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "150": {
      "new": "153",
      "old_title": "Procedure of Court in case of question being asked without reasonable grounds",
      "new_title": "Procedure of Court in case of question being asked without reasonable grounds",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "151": {
      "new": "154",
      "old_title": "Indecent and scandalous questions",
      "new_title": "Indecent and scandalous questions",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "152": {
      "new": "155",
      "old_title": "Questions intended to insult or annoy",
      "new_title": "Questions intended to insult or annoy",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "153": {
      "new": "156",
      "old_title": "Exclusion of evidence to contradict answers to questions testing veracity",
      "new_title": "Exclusion of evidence to contradict answers to questions testing veracity",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "154": {
      "new": "157",
      "old_title": "Question by party to his own witness (Hostile witness)",
      "new_title": "Question by party to his own witness",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "155": {
      "new": "158",
      "old_title": "Impeaching credit of witness",
      "new_title": "Impeaching credit of witness",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "156": {
      "new": "159",
      "old_title": "Questions tending to corroborate evidence of relevant fact admissible",
      "new_title": "Questions tending to corroborate evidence of relevant fact, admissible",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "157": {
      "new": "160",
      "old_title": "Former statements of witness may be proved to corroborate later testimony as to same fact",
      "new_title": "Former statements of witness may be proved to corroborate later testimony as to same fact",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "158": {
      "new": "161",
      "old_title": "What matters may be proved in connection with proved statement relevant under section 32 or 33",
      "new_title": "What matters may be proved in connection with proved statement relevant under section 26 or 27",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "159": {
      "new": "162",
      "old_title": "Refreshing memory",
      "new_title": "Refreshing memory",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "160": {
      "new": "163",
      "old_title": "Testimony to facts stated in document mentioned in section 159",
      "new_title": "Testimony to facts stated in document mentioned in section 162",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "161": {
      "new": "164",
      "old_title": "Right of adverse party as to writing used to refresh memory",
      "new_title": "Right of adverse party as to writing used to refresh memory",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "162": {
      "new": "165",
      "old_title": "Production of documents and translation of documents",
      "new_title": "Production of documents",
      "type": "direct",
      "source": "insaaf;p39a;gazette-text",
      "notes": "Gazette BSA 165 \"Production of documents\" (includes translation provision)."
    },
    "163": {
      "new": "166",
      "old_title": "Giving as evidence of document called for and produced on notice",
      "new_title": "Giving, as evidence, of document called for and produced on notice",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "164": {
      "new": "167",
      "old_title": "Using as evidence of document production of which was refused on notice",
      "new_title": "Using, as evidence, of document production of which was refused on notice",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "165": {
      "new": "168",
      "old_title": "Judge's power to put questions or order production",
      "new_title": "Judge's power to put questions or order production",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    },
    "166": {
      "new": null,
      "old_title": "Power of jury or assessors to put questions",
      "new_title": null,
      "type": "repealed_no_equivalent",
      "new_law_status": "Project 39A Note: \"Section 166: Power of jury or assessors to put questions\" deleted; insaaf \"---\"; BSA 168 is the Judge-only power (IEA 165).",
      "source": "insaaf;p39a-deleted-note;gazette-text-search"
    },
    "167": {
      "new": "169",
      "old_title": "No new trial for improper admission or rejection of evidence",
      "new_title": "No new trial for improper admission or rejection of evidence",
      "type": "direct",
      "source": "insaaf;p39a;gazette-heading"
    }
  },
  "repealed_no_equivalent": [
    {
      "iea_section": "2",
      "title": "Repeal of enactments",
      "reason": "insaaf shows \"---\"; absent from every clause of the Project 39A table; no Gazette heading or text repeals earlier enactments (BSA 170 repeals only the IEA itself)"
    },
    {
      "iea_section": "22A",
      "title": "When oral admission as to electronic records are relevant",
      "reason": "Project 39A: \"S. 22A has been deleted\" (annotated text, clause 20); insaaf shows \"---\". Electronic records are covered only through the wider definition of \"document\" in BSA 2(1)(d)."
    },
    {
      "iea_section": "82",
      "title": "Presumption as to document admissible in England without proof of seal or signature",
      "reason": "Project 39A Note: \"Section 82 ... deleted from the Bill\"; insaaf \"---\"; no Gazette text on documents admissible in England."
    },
    {
      "iea_section": "88",
      "title": "Presumption as to telegraphic messages",
      "reason": "Project 39A Note: \"Section 88: Presumption as to telegraphic messages\" deleted; insaaf \"---\". BSA 90 (presumption as to electronic messages) corresponds to IEA 88A only."
    },
    {
      "iea_section": "113",
      "title": "Proof of cession of territory",
      "reason": "Project 39A Note: \"Section 113: Proof of cession of territory\" deleted; insaaf \"---\"; no Gazette text on cession of territory."
    },
    {
      "iea_section": "166",
      "title": "Power of jury or assessors to put questions",
      "reason": "Project 39A Note: \"Section 166: Power of jury or assessors to put questions\" deleted; insaaf \"---\"; BSA 168 is the Judge-only power (IEA 165)."
    }
  ],
  "new_provisions": {
    "61": {
      "title": "Electronic or digital record",
      "notes": "Electronic or digital record - admissibility/legal effect of electronic records, \"subject to section 63\". Not a re-enactment of any IEA section (IEA 65A/65B are BSA 62/63)."
    },
    "170": {
      "title": "Repeal and savings",
      "notes": "Repeal and savings - repeals the IEA 1872 and saves pending proceedings. No IEA counterpart (IEA 2 repealed earlier enactments; not the same provision)."
    }
  },
  "coverage_summary": {
    "iea_rows_in_table": 185,
    "iea_rows_with_bsa_equivalent_verified": 179,
    "iea_rows_repealed_no_equivalent": 6,
    "iea_rows_verify": 0,
    "bsa_sections_total": 170,
    "bsa_sections_new_without_iea_source": [
      61,
      170
    ],
    "amendment_inserts_included": [
      "22A",
      "45A",
      "47A",
      "53A",
      "65A",
      "65B",
      "67A",
      "73A",
      "81A",
      "85A",
      "85B",
      "85C",
      "88A",
      "90A",
      "111A",
      "113A",
      "113B",
      "114A"
    ]
  }
}
```

## B. `crpc-to-bnss.json` `new_provisions` (signed)

I only checked this object (the `mappings` pairs I checked on 40 sections earlier and they are right; a full recheck of `mappings` against the Gazette is a follow-up ticket for Priya). Replaces the seven old entries: 173(3) and 193(3) were mislabelled, 176(2) was the same item as 173(3), 398 was the wrong number (398 is the witness protection scheme; the victim's appeal is the proviso to 413), and 187(3) is not new.

```json
{
  "173(1)": {
    "title": "Information in cognizable cases may be given orally or by electronic communication (e-FIR)",
    "notes": "New: information given by electronic communication is taken on record on being signed within three days by the person giving it"
  },
  "173(3)": {
    "title": "Preliminary enquiry within fourteen days for offences punishable with three years or more but less than seven years",
    "notes": "New: with the prior permission of an officer not below the rank of Deputy Superintendent of Police"
  },
  "176(3)": {
    "title": "Forensic expert to visit the scene of crime for offences punishable with seven years or more",
    "notes": "New: with videography of the process (Gazette copy of 25 Dec 2023; confirm against India Code)"
  },
  "187(3)": {
    "title": "Maximum period of detention during investigation: ninety days for offences punishable with death, imprisonment for life or imprisonment for ten years or more; sixty days for others",
    "notes": "Carried over from CrPC 167(2); not a new rule"
  },
  "193(3)": {
    "title": "Report of the police officer on completion of investigation; the police officer informs the progress of the investigation to the informant or victim within ninety days",
    "notes": "New: the ninety-day duty to inform the informant or victim is in 193(3)(ii). It is not a limit for filing the report"
  },
  "356": {
    "title": "Trial in absentia of proclaimed offenders",
    "notes": "New: permits trial to proceed where accused absconds"
  },
  "398": {
    "title": "Witness protection scheme",
    "notes": "New: every State Government to prepare and notify a witness protection scheme"
  },
  "413": {
    "title": "Victim's right of appeal against acquittal, conviction for a lesser offence or inadequate compensation",
    "notes": "Proviso to section 413; replaces the label wrongly placed at 398"
  },
  "530": {
    "title": "Trials, inquiries and proceedings to be held in electronic mode",
    "notes": "New: enables virtual court proceedings"
  }
}
```

## C. `production_of_documents.json`, Para 7 (signed text, word for word)

`Para 7: Documents not protected by privilege under the Bharatiya Sakshya Adhiniyam, 2023, which replaced the Indian Evidence Act, 1872. Privileges the advocate should check before listing a document: communications during marriage (BSA 128, IEA 122); evidence as to affairs of State (BSA 129, IEA 123); official communications (BSA 130, IEA 124); professional communications (BSA 132, IEA 126); confidential communications with legal advisers (BSA 134, IEA 129); production of title-deeds of a witness who is not a party (BSA 135, IEA 130). The advocate decides which, if any, applies.`

The old line cited "S.132 BSA (spouses)", "S.134 (state)", "S.136 (title-deeds)" and "S.139 (professional communications)". Each was wrong.

## D. Marks

| Item | Mark |
|---|---|
| Table in A, as the signed `iea-to-bsa.json` | Approved |
| `new_provisions` in B | Approved. 176(3) rests on the Gazette copy alone; I confirm against India Code when it can be fetched |
| Text in C | Approved |
| Packs and specs that cite BSA numbers: `production_of_documents` (fixed by C); T-239 #6, #13 to #17 (BSA 63 for IEA 65B, unchanged) | Approved |
| Anything else in the repo that cites a BSA number | Condition: step 5 above |
| `crpc-to-bnss.json` `mappings` full recheck | Follow-up, not a blocker: the 40 pairs I checked all agree |

## E. The diff (for review)

# IEA to BSA corrected mapping: diff against current iea-to-bsa.json

Rows checked: 185 (IEA 1-167 plus 18 lettered sections). `new` changed: 117. `new` unchanged: 68. Set to verify: 0. Of the changed rows, 6 became "no equivalent" (new = null) and 1 moved from null to a section.

Evidence ids: insaaf = insaaf comparative table; p39a = Project 39A Bill annotated comparison (Bill clause number confirmed equal to Act number by heading); gazette = BSA Gazette heading/text (see sources.md).

## 1. Rows whose `new` changed

| IEA | IEA title | old (current) | new (corrected) | BSA heading (Gazette) | evidence |
|---|---|---|---|---|---|
| 2 | Repeal of enactments | 2(2) | none (no equivalent) | - | insaaf;p39a-absent;gazette-no-heading |
| 4 | May presume — Shall presume — Conclusive proof | 3 | 2(1) | Definitions | insaaf;p39a;gazette-text |
| 5 | Evidence may be given of facts in issue and relevant facts | 4 | 3 | Evidence may be given of facts in issue and relevant facts | insaaf;p39a;gazette-heading |
| 6 | Relevancy of facts forming part of same transaction (Res ges | 5 | 4 | Relevancy of facts forming part of same transaction | insaaf;p39a;gazette-heading |
| 7 | Facts which are the occasion, cause or effect of facts in is | 6 | 5 | Facts which are occasion, cause or effect of facts in issue  | insaaf;p39a;gazette-heading |
| 8 | Motive, preparation and previous or subsequent conduct | 7 | 6 | Motive, preparation and previous or subsequent conduct | insaaf;p39a;gazette-heading |
| 9 | Facts necessary to explain or introduce relevant facts | 8 | 7 | Facts necessary to explain or introduce fact in issue or rel | insaaf;p39a;gazette-heading |
| 10 | Things said or done by conspirator in reference to common de | 9 | 8 | Things said or done by conspirator in reference to common de | insaaf;p39a;gazette-heading |
| 11 | When facts not otherwise relevant become relevant | 10 | 9 | When facts not otherwise relevant become relevant | insaaf;p39a;gazette-heading |
| 12 | In suits for damages — facts tending to enable Court to dete | 11 | 10 | Facts tending to enable Court to determine amount are releva | insaaf;p39a;gazette-heading |
| 13 | Facts relevant when right or custom is in question | 12 | 11 | Facts relevant when right or custom is in question | insaaf;p39a;gazette-heading |
| 14 | Facts showing existence of state of mind or of body or bodil | 13 | 12 | Facts showing existence of state of mind, or of body or bodi | insaaf;p39a;gazette-heading |
| 15 | Facts bearing on question whether act was accidental or inte | 14 | 13 | Facts bearing on question whether act was accidental or inte | insaaf;p39a;gazette-heading |
| 16 | Existence of course of business when relevant | 15 | 14 | Existence of course of business when relevant | insaaf;p39a;gazette-heading |
| 17 | Admission defined | 16 | 15 | Admission defined | insaaf;p39a;gazette-heading |
| 18 | Admission by party to proceeding or his agent | 17 | 16 | Admission by party to proceeding or his agent | insaaf;p39a;gazette-heading |
| 19 | Admissions by persons whose position must be proved as again | 18 | 17 | Admissions by persons whose position must be proved as again | insaaf;p39a;gazette-heading |
| 20 | Admissions by persons expressly referred to by party to suit | 19 | 18 | Admissions by persons expressly referred to by party to suit | insaaf;p39a;gazette-heading |
| 21 | Proof of admissions against persons making them and by or on | 20 | 19 | Proof of admissions against persons making them, and by or o | insaaf;p39a;gazette-heading |
| 22 | When oral admissions as to contents of documents are relevan | 21 | 20 | When oral admissions as to contents of documents are relevan | insaaf;p39a;gazette-heading |
| 22A | When oral admission as to electronic records are relevant | 21 | none (no equivalent) | - | insaaf;p39a-deleted-note;gazette-no-heading |
| 23 | Admission in civil cases when relevant | 22 | 21 | Admissions in civil cases when relevant | insaaf;p39a;gazette-heading |
| 27 | How much of information received from accused may be proved | 23(2) proviso | 23(2) | Confession to police officer | insaaf;p39a;gazette-text |
| 28 | Confession made after removal of impression caused by induce | 24 | 22 | Confession caused by inducement, threat, coercion or promise | insaaf;p39a;gazette-text |
| 29 | Confession otherwise relevant not to become irrelevant becau | 25 | 22 | Confession caused by inducement, threat, coercion or promise | insaaf;p39a;gazette-text |
| 45 | Opinions of experts | 39 | 39(1) | Opinions of experts | insaaf;p39a;gazette-heading |
| 47 | Opinion as to handwriting when relevant | 41 | 41(1) | Opinion as to handwriting and signature, when relevant | insaaf;p39a;gazette-heading |
| 47A | Opinion as to electronic signature when relevant | 42 | 41(2) | Opinion as to handwriting and signature, when relevant | insaaf;p39a;gazette-heading |
| 48 | Opinion as to existence of right or custom when relevant | 43 | 42 | Opinion as to existence of general custom or right, when rel | insaaf;p39a;gazette-heading |
| 49 | Opinion as to usages, tenets etc. when relevant | 44 | 43 | Opinion as to usages, tenets, etc., when relevant | insaaf;p39a;gazette-heading |
| 50 | Opinion on relationship when relevant | 45 | 44 | Opinion on relationship, when relevant | insaaf;p39a;gazette-heading |
| 51 | Grounds of opinion when relevant | 46 | 45 | Grounds of opinion, when relevant | insaaf;p39a;gazette-heading |
| 52 | In civil cases character of party is irrelevant | 47 | 46 | In civil cases character to prove conduct imputed, irrelevan | insaaf;p39a;gazette-heading |
| 53 | In criminal cases previous good character relevant | 48 | 47 | In criminal cases previous good character relevant | insaaf;p39a;gazette-heading |
| 53A | Evidence of character or previous sexual experience not rele | 50 | 48 | Evidence of character or previous sexual experience not rele | insaaf;p39a;gazette-heading |
| 55 | Character as affecting damages | 51 | 50 | Character as affecting damages | insaaf;p39a;gazette-heading |
| 56 | Fact judicially noticeable need not be proved | 52 | 51 | Fact judicially noticeable need not be proved | insaaf;p39a;gazette-heading |
| 57 | Facts of which Court must take judicial notice | 53 | 52 | Facts of which Court shall take judicial notice | insaaf;p39a;gazette-heading |
| 58 | Facts admitted need not be proved | 54 | 53 | Facts admitted need not be proved | insaaf;p39a;gazette-heading |
| 59 | Proof of facts by oral evidence | 55 | 54 | Proof of facts by oral evidence | insaaf;p39a;gazette-heading |
| 60 | Oral evidence must be direct | 56 | 55 | Oral evidence to be direct | insaaf;p39a;gazette-heading |
| 61 | Proof of contents of documents | 57 | 56 | Proof of contents of documents | insaaf;p39a;gazette-heading |
| 62 | Primary evidence | 58 | 57 | Primary evidence | insaaf;p39a;gazette-heading |
| 63 | Secondary evidence | 59 | 58 | Secondary evidence | insaaf;p39a;gazette-heading |
| 64 | Proof of documents by primary evidence | 60 | 59 | Proof of documents by primary evidence | insaaf;p39a;gazette-heading |
| 65 | Cases in which secondary evidence relating to documents may  | 61 | 60 | Cases in which secondary evidence relating to documents may  | insaaf;p39a;gazette-heading |
| 74 | Public documents | 74 | 74(1) | Public and private documents | insaaf;p39a;gazette-heading |
| 75 | Private documents | 75 | 74(2) | Public and private documents | insaaf;p39a;gazette-heading |
| 76 | Certified copies of public documents | 76 | 75 | Certified copies of public documents | insaaf;p39a;gazette-heading |
| 77 | Proof of documents by production of certified copies | 77 | 76 | Proof of documents by production of certified copies | insaaf;p39a;gazette-heading |
| 78 | Proof of other official documents | 78 | 77 | Proof of other official documents | insaaf;p39a;gazette-heading |
| 79 | Presumption as to genuineness of certified copies | 79 | 78 | Presumption as to genuineness of certified copies | insaaf;p39a;gazette-heading |
| 80 | Presumption as to documents produced as record of evidence | 80 | 79 | Presumption as to documents produced as record of evidence,  | insaaf;p39a;gazette-heading |
| 81 | Presumption as to Gazettes, newspapers, private Acts of Parl | 81 | 80 | Presumption as to Gazettes, newspapers, and other documents | insaaf;p39a;gazette-heading |
| 81A | Presumption as to Gazettes in electronic form | 82 | 81 | Presumption as to Gazettes in electronic or digital record | insaaf;p39a;gazette-heading |
| 82 | Presumption as to document admissible in England without pro | 83 | none (no equivalent) | - | insaaf;p39a-deleted-note;gazette-text-search |
| 83 | Presumption as to maps or plans made by authority of Governm | 84 | 82 | Presumption as to maps or plans made by authority of Governm | insaaf;p39a;gazette-heading |
| 84 | Presumption as to collections of laws and reports of decisio | 85 | 83 | Presumption as to collections of laws and reports of decisio | insaaf;p39a;gazette-heading |
| 85 | Presumption as to powers-of-attorney | 86 | 84 | Presumption as to powers-of-attorney | insaaf;p39a;gazette-heading |
| 85A | Presumption as to electronic agreements | 87 | 85 | Presumption as to electronic agreements | insaaf;p39a;gazette-heading |
| 85B | Presumption as to electronic records and electronic signatur | 88 | 86 | Presumption as to electronic records and electronic signatur | insaaf;p39a;gazette-heading |
| 85C | Presumption as to Electronic Signature Certificates | 89 | 87 | Presumption as to Electronic Signature Certificates | insaaf;p39a;gazette-heading |
| 86 | Presumption as to certified copies of foreign judicial recor | 90 | 88 | Presumption as to certified copies of foreign judicial recor | insaaf;p39a;gazette-heading |
| 87 | Presumption as to books, maps and charts | 91 | 89 | Presumption as to books, maps and charts | insaaf;p39a;gazette-heading |
| 88 | Presumption as to telegraphic messages | 92 | none (no equivalent) | - | insaaf;p39a-deleted-note;gazette-text-search |
| 88A | Presumption as to electronic messages | 93 | 90 | Presumption as to electronic messages | insaaf;p39a;gazette-heading |
| 89 | Presumption as to due execution etc. of documents not produc | 94 | 91 | Presumption as to due execution, etc., of documents not prod | insaaf;p39a;gazette-heading |
| 90 | Presumption as to documents thirty years old | 84 | 92 | Presumption as to documents thirty years old | insaaf;p39a;gazette-heading |
| 90A | Presumption as to electronic records five years old | 95 | 93 | Presumption as to electronic records five years old | insaaf;p39a;gazette-heading |
| 91 | Evidence of terms of contracts, grants and other disposition | 96 | 94 | Evidence of terms of contracts, grants and other disposition | insaaf;p39a;gazette-heading |
| 92 | Exclusion of evidence of oral agreement | 97 | 95 | Exclusion of evidence of oral agreement | insaaf;p39a;gazette-heading |
| 93 | Exclusion of evidence to explain or amend ambiguous document | 98 | 96 | Exclusion of evidence to explain or amend ambiguous document | insaaf;p39a;gazette-heading |
| 94 | Exclusion of evidence against application of document to exi | 99 | 97 | Exclusion of evidence against application of document to exi | insaaf;p39a;gazette-heading |
| 95 | Evidence as to document meaningless in reference to existing | 100 | 98 | Evidence as to document unmeaning in reference to existing f | insaaf;p39a;gazette-heading |
| 96 | Evidence as to application of language which can apply to on | 101 | 99 | Evidence as to application of language which can apply to on | insaaf;p39a;gazette-heading |
| 97 | Evidence as to application of language to one of two sets of | 102 | 100 | Evidence as to application of language to one of two sets of | insaaf;p39a;gazette-heading |
| 98 | Evidence as to meaning of illegible characters etc. | 103 | 101 | Evidence as to meaning of illegible characters, etc | insaaf;p39a;gazette-heading |
| 99 | Who may give evidence of agreement varying terms of document | 104 | 102 | Who may give evidence of agreement varying terms of document | insaaf;p39a;gazette-heading |
| 100 | Saving of provisions of Indian Succession Act relating to wi | None | 103 | Saving of provisions of Indian Succession Act relating to wi | insaaf;p39a;gazette-heading |
| 113 | Proof of cession of territory | 117 | none (no equivalent) | - | insaaf;p39a-deleted-note;gazette-text-search |
| 113A | Presumption as to abetment of suicide by a married woman | 116 | 117 | Presumption as to abetment of suicide by a married woman | insaaf;p39a;gazette-heading |
| 113B | Presumption as to dowry death | 117 | 118 | Presumption as to dowry death | insaaf;p39a;gazette-heading |
| 127 | Section 126 to apply to interpreters etc. | 133 | 132(3) | Professional communications | insaaf;p39a;gazette-text |
| 128 | Privilege not waived by volunteering evidence | 134 | 133 | Privilege not waived by volunteering evidence | insaaf;p39a;gazette-heading |
| 129 | Confidential communication with legal advisers | 135 | 134 | Confidential communication with legal advisers | insaaf;p39a;gazette-heading |
| 130 | Production of title-deeds of witness not a party | 136 | 135 | Production of title-deeds of witness not a party | insaaf;p39a;gazette-heading |
| 131 | Production of documents or electronic records which another  | 137 | 136 | Production of documents or electronic records which another  | insaaf;p39a;gazette-heading |
| 132 | Witness not excused from answering on ground that answer wil | 138 | 137 | Witness not excused from answering on ground that answer wil | insaaf;p39a;gazette-heading |
| 133 | Accomplice | 139 | 138 | Accomplice | insaaf;p39a;gazette-heading |
| 134 | Number of witnesses | 140 | 139 | Number of witnesses | insaaf;p39a;gazette-heading |
| 135 | Order of production and examination of witnesses | 141 | 140 | Order of production and examination of witnesses | insaaf;p39a;gazette-heading |
| 136 | Judge to decide as to admissibility of evidence | 142 | 141 | Judge to decide as to admissibility of evidence | insaaf;p39a;gazette-heading |
| 142 | When they must not be asked | 147 | 146(2)-(3) | Leading questions | insaaf;p39a;gazette-text |
| 143 | When they may be asked | 148 | 146(4) | Leading questions | insaaf;p39a;gazette-text |
| 144 | Evidence as to matters in writing | 149 | 147 | Evidence as to matters in writing | insaaf;p39a;gazette-heading |
| 145 | Cross-examination as to previous statements in writing | 150 | 148 | Cross-examination as to previous statements in writing | insaaf;p39a;gazette-heading |
| 146 | Questions lawful in cross-examination | 151 | 149 | Questions lawful in cross-examination | insaaf;p39a;gazette-heading |
| 147 | When witness to be compelled to answer | 152 | 150 | When witness to be compelled to answer | insaaf;p39a;gazette-heading |
| 148 | Court to decide when question shall be asked and when witnes | 153 | 151 | Court to decide when question shall be asked and when witnes | insaaf;p39a;gazette-heading |
| 149 | Question not to be asked without reasonable grounds | 154 | 152 | Question not to be asked without reasonable grounds | insaaf;p39a;gazette-heading |
| 150 | Procedure of Court in case of question being asked without r | 155 | 153 | Procedure of Court in case of question being asked without r | insaaf;p39a;gazette-heading |
| 151 | Indecent and scandalous questions | 156 | 154 | Indecent and scandalous questions | insaaf;p39a;gazette-heading |
| 152 | Questions intended to insult or annoy | 157 | 155 | Questions intended to insult or annoy | insaaf;p39a;gazette-heading |
| 153 | Exclusion of evidence to contradict answers to questions tes | 158 | 156 | Exclusion of evidence to contradict answers to questions tes | insaaf;p39a;gazette-heading |
| 154 | Question by party to his own witness (Hostile witness) | 159 | 157 | Question by party to his own witness | insaaf;p39a;gazette-heading |
| 155 | Impeaching credit of witness | 160 | 158 | Impeaching credit of witness | insaaf;p39a;gazette-heading |
| 156 | Questions tending to corroborate evidence of relevant fact a | 161 | 159 | Questions tending to corroborate evidence of relevant fact,  | insaaf;p39a;gazette-heading |
| 157 | Former statements of witness may be proved to corroborate la | 162 | 160 | Former statements of witness may be proved to corroborate la | insaaf;p39a;gazette-heading |
| 158 | What matters may be proved in connection with proved stateme | 163 | 161 | What matters may be proved in connection with proved stateme | insaaf;p39a;gazette-heading |
| 159 | Refreshing memory | 164 | 162 | Refreshing memory | insaaf;p39a;gazette-heading |
| 160 | Testimony to facts stated in document mentioned in section 1 | 165 | 163 | Testimony to facts stated in document mentioned in section 1 | insaaf;p39a;gazette-heading |
| 161 | Right of adverse party as to writing used to refresh memory | 166 | 164 | Right of adverse party as to writing used to refresh memory | insaaf;p39a;gazette-heading |
| 162 | Production of documents and translation of documents | 167 | 165 | Production of documents | insaaf;p39a;gazette-text |
| 163 | Giving as evidence of document called for and produced on no | 168 | 166 | Giving, as evidence, of document called for and produced on  | insaaf;p39a;gazette-heading |
| 164 | Using as evidence of document production of which was refuse | 169 | 167 | Using, as evidence, of document production of which was refu | insaaf;p39a;gazette-heading |
| 166 | Power of jury or assessors to put questions | 169 | none (no equivalent) | - | insaaf;p39a-deleted-note;gazette-text-search |
| 167 | No new trial for improper admission or rejection of evidence | 170 | 169 | No new trial for improper admission or rejection of evidence | insaaf;p39a;gazette-heading |

## 2. Rows set to verify

None. Every row either had two agreeing sources plus a heading (or Gazette-text) match, or two sources agreeing that the section has no BSA counterpart.

Rows closest to the line (accepted on Gazette-text reading because heading wording differs; see `notes` in the JSON): 3, 4, 26, 27, 28, 29, 45A, 47A, 75, 119, 120, 127, 137, 142, 143, 162.

## 3. Other fixes

- `new_provisions`: removed non-existent "170A" and "63(4)" (63(4) is the certificate sub-section of BSA 63, a re-enactment of IEA 65B(4) with a Schedule form, not a new provision). Now lists BSA 61 (Electronic or digital record) and BSA 170 (Repeal and savings) only: the two Gazette sections no IEA section maps to.
- `repealed_no_equivalent`: was only IEA 100 (wrong: IEA 100 is BSA 103, Saving of provisions of Indian Succession Act relating to wills, same heading). Now IEA 2, 22A, 82, 88, 113, 166 (the last four plus 22A are explicit deletions in Project 39A).
- `old_title` fixed for IEA 19 ("Admissions by persons whose position must be proved as against party to suit") and IEA 20 ("Admissions by persons expressly referred to by party to suit"); the current titles were shifted by one row.
- `new_title` replaced everywhere with the Gazette heading; several current new_title values were invented (e.g. IEA 82 "Presumption as to certain documents", IEA 166 "Power to put questions (juries abolished ...)").
- IEA 3 and 4 both map to BSA 2(1) (current: 3 to 2(1) correct, 4 to BSA 3 wrong). IEA 2 (current 2(2) "Application clause", invented) is now no-equivalent.
- IEA 27 kept at 23(2) (current "23(2) proviso" dropped the qualifier to match the source format; Gazette shows the proviso carries IEA 27). IEA 142 is "146(2)-(3)" and IEA 143 is "146(4)" (Gazette BSA 146 text).
- IEA 126/127: 126 to 132 unchanged; 127 to 132(3) (current 133).
- `type`: recomputed. "merged" where several IEA rows share one BSA section (19 rows); "repealed_no_equivalent" for the 6 deleted rows; others "direct". The current file called 179 rows direct.
- `_meta`/`meta`: validated_by set to PENDING; the previous "Ajay (CLO) validated" line cannot stand for a table with this many errors. `change_protocol` (CLO sign-off, no AI-authored entries) still applies, so this file is a draft for Ajay.
- `coverage_summary` recomputed; the old figure (166 mapped, 1 repealed) was wrong.
- Each row now carries `source`.

## 4. Unchanged rows

1, 3, 24, 25, 26, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45A, 46, 54, 65A, 65B, 66, 67, 67A, 68, 69, 70, 71, 72, 73, 73A, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 111A, 112, 114, 114A, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 137, 138, 139, 140, 141, 165


## F. BNSS label checks (for review)

# BNSS label checks

Source used: `dl/bnss_prs_act.pdf` (Gazette of India Extraordinary, 25 Dec 2023, "The Bharatiya Nagarik Suraksha Sanhita, 2023, No. 46 of 2023"; PRS copy). Text extracted with `pdftotext -layout` into `work/bnss.txt`; line numbers below refer to that file.
`dl/bnss_ic.pdf` is NOT usable: it is a 280-byte Akamai HTML error page ("An error occurred while processing your request"), not a PDF. India Code was therefore not consulted; every quote below is from the PRS/Gazette copy only (single source).

## 1. The four requested subsections

| Provision | Section heading (margin note) | First words of the sub-section (verbatim) |
|---|---|---|
| BNSS 173(1) | "Information in cognizable cases." | "173. (1) Every information relating to the commission of a cognizable offence, irrespective of the area where the offence is committed, may be given orally or by electronic communication to an officer in charge of a police station, and if given— (i) orally, ... (ii) by electronic communication, it shall be taken on record by him on being signed within three days by the person giving it," (lines 3121-3128) |
| BNSS 173(3) | same section | "(3) Without prejudice to the provisions contained in section 175, on receipt of information relating to the commission of any cognizable offence, which is made punishable for three years or more but less than seven years, the officer in charge of the police station may with the prior permission from an officer not below the rank of Deputy Superintendent of Police, considering the nature and gravity of the offence,— (i) proceed to conduct preliminary enquiry to ascertain whether there exists a prima facie case for proceeding in the matter within a period of fourteen days; or (ii) proceed with investigation when there exists a prima facie case." (lines 3159-3165) |
| BNSS 193(3) | "Report of police officer on completion of investigation." | "(3) (i) As soon as the investigation is completed, the officer in charge of the police station shall forward, including through electronic communication to a Magistrate empowered to take cognizance of the offence on a police report, a report in the form as the State Government may, by rules provide, stating—" ... "(ii) the police officer shall, within a period of ninety days, inform the progress of the investigation by any means including through electronic communication to the informant or the victim;" (lines 3686-3702, 3708-3710) |
| BNSS 193(9) | same section | "(9) Nothing in this section shall be deemed to preclude further investigation in respect of an offence after a report under sub-section (3) has been forwarded to the Magistrate and, where upon such investigation, the officer in charge of the police station obtains further evidence, oral or documentary, he shall forward to the Magistrate a further report or reports ..." with proviso "further investigation during the trial may be conducted with the permission of the Court trying the case and the same shall be completed within a period of ninety days which may be extended with the permission of the Court." (lines 3738-3747) |

## 2. Are the current crpc-to-bnss.json labels right?

File: `/home/user/lawie/apps/drafting/src/config/sections/crpc-to-bnss.json`, `new_provisions`.

**"173(3)": "E-FIR - information by electronic communication" is WRONG.**
The electronic-information (e-FIR) rule is in BNSS 173(1), and the 3-day signature rule is 173(1)(ii) (quote above). BNSS 173(3) is the preliminary enquiry within 14 days for offences punishable with 3 years or more but less than 7 years, with prior permission of an officer not below DSP. Correct key/label: "173(1)" (or "173(1)(ii)") for e-FIR; "173(3)" for preliminary enquiry.

**"193(3)": "Police report to be filed within 90 days; extendable up to 180 days by Court" is WRONG.**
193(3)(i) requires the report "as soon as the investigation is completed" (no day limit; 193(1) says "without unnecessary delay"; 193(2) gives two months for the rape/POCSO offences). The 90 days in 193(3)(ii) is the period within which the police must inform the informant/victim of the progress of the investigation. No "180 days" appears in section 193. The only 90-day-extendable-by-Court language in the Chapter is the 193(9) proviso (further investigation during trial, 90 days, extendable with the Court's permission). The only "ninety days ... extended ... one hundred and eighty days" text in the Act is the proviso to section 232 (commitment proceedings, lines 4483-4485). Correct label: "193(3)(ii)": police to inform informant/victim of progress within 90 days (including electronically); report may be forwarded electronically.

## 3. Other entries in new_provisions that look wrong

| Key | Current label | What the Act says | Verdict |
|---|---|---|---|
| 176(2) | "Preliminary inquiry within 14 days for offences punishable 3-7 years" | 176(2) (lines 3243-3248) is about reasons recorded when the officer does not fully comply with 176(1), and notifying the informant. The 14-day preliminary enquiry is 173(3). | WRONG; belongs at 173(3). A genuinely new item in 176 is 176(3) (forensic expert to visit the crime scene for offences punishable with 7 years or more; videography), which is not listed. |
| 187(3) | "Maximum 90 days custody for offences punishable with death/life/10+ years; 60 days for others" | Text matches (lines 3537-3540: ninety days / sixty days). But this 90/60 limit is the CrPC 167(2) rule carried over; the notes ("New", "replaces old 90/60 day formula") overstate it. The new part is 187(2): 15-day police-custody window usable "during the initial forty days or sixty days". | Label text correct, "new" claim doubtful. Needs CLO check against CrPC 167. |
| 356 | "Trial in absentia of proclaimed offenders" | Heading "Inquiry, trial or judgment in absentia of proclaimed offender." (line 6337) | Correct. |
| 398 | "Victim appeal against acquittal or inadequate compensation" | BNSS 398 is "Witness protection scheme": "Every State Government shall prepare and notify a Witness Protection Scheme for the State with a view to ensure protection of the witnesses." (line 7358). The victim's right of appeal is the proviso to BNSS 413 (line 7569). | WRONG number; title is right for 413, and 398 should be "Witness protection scheme". |
| 530 | "Trials, inquiries and proceedings to be held in electronic mode" | Heading "Trial and proceedings to be held in electronic mode." (line 9290) | Correct. |

Summary: of the 7 entries, 2 are correct (356, 530), 4 are wrong in key or label (173(3), 176(2), 193(3), 398) and 1 (187(3)) has the right text but a doubtful "new" claim. Nothing here was changed in the repo; the CLO owns the file (change_protocol: CLO sign-off).


Signed: Ajay (CLO), 12 Oct 2026 IST, for the three replacements above on the conditions in D. Any other change to either table comes back to me.
