# T-255: corrected CrPC to BNSS table (signed)

Ajay (CLO), 12 Oct 2026 IST. Replaces `apps/drafting/src/config/sections/crpc-to-bnss.json` (my table of 10 May 2026). `new_provisions` inside it is the object I signed in T-250 section B, unchanged.

## What was wrong

Of 535 rows, **103 pointed at a wrong place** (97 at a wrong BNSS section, 6 at a section that was deleted), and 2 were wrongly marked repealed (CrPC 39 and 40 are BNSS 33 and 34). The errors cluster in Chapter II (CrPC 11 to 41D, shifted by one or two), CrPC 84 to 90 and 105A to 105L, CrPC 318 and 356 to 371, and CrPC 405 to 431. CrPC 10, 27, 144A, 153, 355 and 404 are deleted in the BNSS and were given sections. CrPC 166A and 166B are BNSS 112 and 113, not 186(2) and 186(3). **CrPC 358 to 362 are BNSS 399 to 403** (compensation to persons groundlessly arrested is 399, not 398, which is the witness protection scheme).

Every pair I rely on in the signed texts is unchanged: 154, 156, 41, 57, 97, 125, 127, 167, 173, 190, 200, 202, 204, 205, 227, 239, 245, 311, 317, 319, 320, 372, 374, 378, 389, 397, 401, 437, 438, 439, 451, 457, 482. **One of my own pairs was wrong: CrPC 362 is BNSS 403, not 402** (BNSS 402 is "Special reasons to be recorded in certain cases", CrPC 361). I corrected it in T-245 (`review_petition`, citation fix 1).

## How it was rebuilt

All 531 BNSS headings were taken from the Gazette copy (PRS). Each CrPC section was matched to two independent comparison tables (CAPT Bhopal / Anil Kishore Yadav, and the UP Police "Corresponding Section Table"), which agree on all 524 sections that were not deleted; a row is accepted only when both agree and the BNSS heading is the same provision. Seven rows with low heading similarity were read in the Gazette text. India Code and the Project 39A BNSS table could not be fetched; both comparison tables probably descend from the same official comparison, so the Gazette headings are the independent check.

## What the lead does (shashank, with T-250)

1. Replace `apps/drafting/src/config/sections/crpc-to-bnss.json` with the JSON block below, byte for byte. SHA-256 of the block text (between the fences, with its final newline): `b9276355f73e62195c9a5755a30a9d5f01b708543b70f1615b793d9b57af8cd7`.
2. Tests that read this table: change an expectation only where it asserted a wrong pair, and list each for me. Moved golden snapshots are listed for me before merge.
3. `grep` the packs, prompts, tests and the section-finder tool for any BNSS section number outside this table's targets; anything that does not match goes to me. The 36 packs with BNSS citations were checked on the pairs in the second paragraph.
4. The pack JSONs that cite the wrong pair are fixed through T-245 (`review_petition`: S.413 to S.403).

## Marks

| Item | Mark |
|---|---|
| Table as the signed `crpc-to-bnss.json` | Approved |
| `new_provisions` | As signed in T-250 |
| Sub-section targets (41A to 35(3), 357B to 396(7)) | Acceptable: from the UP table and a read of the Gazette text |
| Deleted rows (CrPC 10, 27, 144A, 153, 355, 404 and the five older repeals) | Acceptable: UP table marks them deleted and no Gazette heading matches |
| India Code check | Follow-up when it can be fetched |

## The table (signed)

```json
{
  "meta": {
    "old_code": "CrPC",
    "old_code_full": "Code of Criminal Procedure, 1973",
    "new_code": "BNSS",
    "new_code_full": "Bharatiya Nagarik Suraksha Sanhita, 2023",
    "act_number": "Act No. 46 of 2023",
    "effective_date": "2024-07-01",
    "total_old_sections": 484,
    "total_new_sections": 531,
    "validated_by": "Ajay (CLO) - 2026-10-12 - corrected table (T-255); every row checked against the Gazette headings of the BNSS and two comparison tables",
    "last_updated": "2026-10-12",
    "description": "CrPC 1973 → BNSS 2023 section mapping — supports section converter free tool (SCRUM-46) and AI prompt context for advocates citing old CrPC numbers",
    "owner": "Ajay (CLO)",
    "source": "CrPC->BNSS mapping rechecked row by row (T-255): CAPT Bhopal/Kerala Prisons correspondence table + UP Police corresponding-section table, headings checked against the Gazette BNSS (Act 46 of 2023)",
    "change_protocol": "CLO sign-off required; no AI-authored entries"
  },
  "mappings": {
    "1": {
      "new": "1",
      "old_title": "Short title, extent and commencement",
      "new_title": "Short title, extent and commencement",
      "type": "direct",
      "source": "KER(line 8)+UP; GAZ BNSS 1 'Short title, extent and commencement'"
    },
    "2": {
      "new": "2",
      "old_title": "Definitions",
      "new_title": "Definitions",
      "type": "direct",
      "source": "KER(line 11)+UP; GAZ BNSS 2 'Definitions'"
    },
    "3": {
      "new": "3",
      "old_title": "Construction of references",
      "new_title": "Construction of references",
      "type": "direct",
      "source": "KER(line 58)+UP; GAZ BNSS 3 'Construction of references'"
    },
    "4": {
      "new": "4",
      "old_title": "Trial of offences under IPC and other laws",
      "new_title": "Trial of offences under Bharatiya Nyaya Sanhita, 2023 and other laws",
      "type": "direct",
      "source": "KER(line 63)+UP; GAZ BNSS 4 'Trial of offences under Bharatiya Nyaya Sanhita, 2023 and other laws'"
    },
    "5": {
      "new": "5",
      "old_title": "Saving",
      "new_title": "Saving",
      "type": "direct",
      "source": "KER(line 66)+UP; GAZ BNSS 5 'Saving'"
    },
    "6": {
      "new": "6",
      "old_title": "Classes of Criminal Courts",
      "new_title": "Classes of Criminal Courts",
      "type": "direct",
      "source": "KER(line 67)+UP; GAZ BNSS 6 'Classes of Criminal Courts'"
    },
    "7": {
      "new": "7",
      "old_title": "Territorial divisions",
      "new_title": "Territorial divisions",
      "type": "direct",
      "source": "KER(line 69)+UP; GAZ BNSS 7 'Territorial divisions'"
    },
    "8": {
      "new": null,
      "old_title": "Metropolitan areas",
      "new_title": null,
      "type": "repealed",
      "note": "Metropolitan area concept removed under BNSS",
      "source": "UP+KER(absence)+GAZ(no heading)"
    },
    "9": {
      "new": "8",
      "old_title": "Court of Session",
      "new_title": "Court of Session",
      "type": "direct",
      "source": "KER(line 70)+UP; GAZ BNSS 8 'Court of Session'"
    },
    "10": {
      "new": null,
      "old_title": "Assistant Sessions Judges",
      "new_title": null,
      "type": "repealed",
      "source": "UP+KER(absence)+GAZ(no heading)",
      "note": "Deleted in BNSS (UP Police correspondence table: Deleted; no BNSS section)"
    },
    "11": {
      "new": "9",
      "old_title": "Courts of Judicial Magistrates",
      "new_title": "Courts of Judicial Magistrates",
      "type": "direct",
      "source": "KER(line 77)+UP; GAZ BNSS 9 'Courts of Judicial Magistrates'"
    },
    "12": {
      "new": "10",
      "old_title": "Chief Judicial Magistrate and Additional Chief Judicial Magistrate",
      "new_title": "Chief Judicial Magistrate and Additional Chief Judicial Magistrate, etc",
      "type": "direct",
      "source": "KER(line 79)+UP; GAZ BNSS 10 'Chief Judicial Magistrate and Additional Chief Judicial Magistrate, etc'"
    },
    "13": {
      "new": "11",
      "old_title": "Special Judicial Magistrates",
      "new_title": "Special Judicial Magistrates",
      "type": "direct",
      "source": "KER(line 82)+UP; GAZ BNSS 11 'Special Judicial Magistrates'"
    },
    "14": {
      "new": "12",
      "old_title": "Local jurisdiction of Judicial Magistrates",
      "new_title": "Local Jurisdiction of Judicial Magistrates",
      "type": "direct",
      "source": "KER(line 83)+UP; GAZ BNSS 12 'Local Jurisdiction of Judicial Magistrates'"
    },
    "15": {
      "new": "13",
      "old_title": "Subordination of Judicial Magistrates",
      "new_title": "Subordination of Judicial Magistrates",
      "type": "direct",
      "source": "KER(line 88)+UP; GAZ BNSS 13 'Subordination of Judicial Magistrates'"
    },
    "16": {
      "new": null,
      "old_title": "Courts of Metropolitan Magistrates",
      "new_title": null,
      "type": "repealed",
      "note": "Metropolitan Magistrate Courts subsumed into Judicial Magistrate framework",
      "source": "UP+KER(absence)+GAZ(no heading)"
    },
    "17": {
      "new": null,
      "old_title": "Chief Metropolitan Magistrate and Additional Chief Metropolitan Magistrate",
      "new_title": null,
      "type": "repealed",
      "note": "Metropolitan structure removed",
      "source": "UP+KER(absence)+GAZ(no heading)"
    },
    "18": {
      "new": null,
      "old_title": "Special Metropolitan Magistrates",
      "new_title": null,
      "type": "repealed",
      "note": "Subsumed under BNSS 12 (Special Judicial Magistrates)",
      "source": "UP+KER(absence)+GAZ(no heading)"
    },
    "19": {
      "new": null,
      "old_title": "Subordination of Metropolitan Magistrates",
      "new_title": null,
      "type": "repealed",
      "note": "Metropolitan structure removed",
      "source": "UP+KER(absence)+GAZ(no heading)"
    },
    "20": {
      "new": "14",
      "old_title": "Executive Magistrates",
      "new_title": "Executive Magistrates",
      "type": "direct",
      "source": "KER(line 90)+UP; GAZ BNSS 14 'Executive Magistrates'"
    },
    "21": {
      "new": "15",
      "old_title": "Special Executive Magistrates",
      "new_title": "Special Executive Magistrates",
      "type": "direct",
      "source": "KER(line 92)+UP; GAZ BNSS 15 'Special Executive Magistrates'"
    },
    "22": {
      "new": "16",
      "old_title": "Local jurisdiction of Executive Magistrates",
      "new_title": "Local Jurisdiction of Executive Magistrates",
      "type": "direct",
      "source": "KER(line 95)+UP; GAZ BNSS 16 'Local Jurisdiction of Executive Magistrates'"
    },
    "23": {
      "new": "17",
      "old_title": "Subordination of Executive Magistrates",
      "new_title": "Subordination of Executive Magistrates",
      "type": "direct",
      "source": "KER(line 97)+UP; GAZ BNSS 17 'Subordination of Executive Magistrates'"
    },
    "24": {
      "new": "18",
      "old_title": "Public Prosecutors",
      "new_title": "Public Prosecutors",
      "type": "direct",
      "source": "KER(line 99)+UP; GAZ BNSS 18 'Public Prosecutors'"
    },
    "25": {
      "new": "19",
      "old_title": "Assistant Public Prosecutors",
      "new_title": "Assistant Public Prosecutors",
      "type": "direct",
      "source": "KER(line 100)+UP; GAZ BNSS 19 'Assistant Public Prosecutors'"
    },
    "25A": {
      "new": "20",
      "old_title": "Directorate of Prosecution",
      "new_title": "Directorate of Prosecution",
      "type": "direct",
      "source": "KER(line 104)+UP; GAZ BNSS 20 'Directorate of Prosecution'"
    },
    "26": {
      "new": "21",
      "old_title": "Courts by which offences are triable",
      "new_title": "Courts by which offences are triable",
      "type": "direct",
      "source": "KER(line 107)+UP; GAZ BNSS 21 'Courts by which offences are triable'"
    },
    "27": {
      "new": null,
      "old_title": "Jurisdiction in case of juveniles",
      "new_title": null,
      "type": "repealed",
      "source": "UP+KER(absence)+GAZ(no heading)",
      "note": "Deleted in BNSS (UP Police correspondence table: Deleted; no BNSS section)"
    },
    "28": {
      "new": "22",
      "old_title": "Sentences which High Courts and Sessions Judges may pass",
      "new_title": "Sentences which High Courts and Sessions Judges may pass",
      "type": "direct",
      "source": "KER(line 109)+UP; GAZ BNSS 22 'Sentences which High Courts and Sessions Judges may pass'"
    },
    "29": {
      "new": "23",
      "old_title": "Sentences which Magistrates may pass",
      "new_title": "Sentences which Magistrates may pass",
      "type": "direct",
      "source": "KER(line 112)+UP; GAZ BNSS 23 'Sentences which Magistrates may pass'"
    },
    "30": {
      "new": "24",
      "old_title": "Sentence of imprisonment in default of fine",
      "new_title": "Sentence of imprisonment in default of fine",
      "type": "direct",
      "source": "KER(line 116)+UP; GAZ BNSS 24 'Sentence of imprisonment in default of fine'"
    },
    "31": {
      "new": "25",
      "old_title": "Sentence in cases of conviction of several offences at one trial",
      "new_title": "Sentence in cases of conviction of several offences at one trial",
      "type": "direct",
      "source": "KER(line 118)+UP; GAZ BNSS 25 'Sentence in cases of conviction of several offences at one trial'"
    },
    "32": {
      "new": "26",
      "old_title": "Mode of conferring powers",
      "new_title": "Mode of conferring powers",
      "type": "direct",
      "source": "KER(line 121)+UP; GAZ BNSS 26 'Mode of conferring powers'"
    },
    "33": {
      "new": "27",
      "old_title": "Powers of officers appointed",
      "new_title": "Powers of officers appointed",
      "type": "direct",
      "source": "KER(line 122)+UP; GAZ BNSS 27 'Powers of officers appointed'"
    },
    "34": {
      "new": "28",
      "old_title": "Withdrawal of powers",
      "new_title": "Withdrawal of powers",
      "type": "direct",
      "source": "KER(line 123)+UP; GAZ BNSS 28 'Withdrawal of powers'"
    },
    "35": {
      "new": "29",
      "old_title": "Powers of Judges and Magistrates exercisable by their successors-in-office",
      "new_title": "Powers of Judges and Magistrates exercisable by their successors-in-office",
      "type": "direct",
      "source": "KER(line 124)+UP; GAZ BNSS 29 'Powers of Judges and Magistrates exercisable by their successors-in-office'"
    },
    "36": {
      "new": "30",
      "old_title": "Powers of superior officers of police",
      "new_title": "Powers of superior officers of police",
      "type": "direct",
      "source": "KER(line 127)+UP; GAZ BNSS 30 'Powers of superior officers of police'"
    },
    "37": {
      "new": "31",
      "old_title": "Public when to assist Magistrates and police",
      "new_title": "Public when to assist Magistrates and police",
      "type": "direct",
      "source": "KER(line 132)+UP; GAZ BNSS 31 'Public when to assist Magistrates and police'"
    },
    "38": {
      "new": "32",
      "old_title": "Aid to person other than police officer executing warrant",
      "new_title": "Aid to person, other than police officer, executing warrant",
      "type": "direct",
      "source": "KER(line 134)+UP; GAZ BNSS 32 'Aid to person, other than police officer, executing warrant'"
    },
    "39": {
      "new": "33",
      "old_title": "Public to give information of certain offences",
      "new_title": "Public to give information of certain offences",
      "type": "direct",
      "source": "KER(line 137)+UP; GAZ BNSS 33 'Public to give information of certain offences'"
    },
    "40": {
      "new": "34",
      "old_title": "Duty of officers employed in connection with affairs of a village to make certain report",
      "new_title": "Duty of officers employed in connection with affairs of a village to make certain report",
      "type": "direct",
      "source": "KER(line 139)+UP; GAZ BNSS 34 'Duty of officers employed in connection with affairs of a village to make certain report'"
    },
    "41": {
      "new": "35",
      "old_title": "When police may arrest without warrant",
      "new_title": "When police may arrest without warrant",
      "type": "direct",
      "source": "KER(line 143)+UP; GAZ BNSS 35 'When police may arrest without warrant'"
    },
    "41A": {
      "new": "35(3)",
      "old_title": "Notice of appearance before police officer",
      "new_title": "When police may arrest without warrant",
      "type": "merged",
      "source": "KER(line 143)+UP; GAZ BNSS 35 'When police may arrest without warrant'; BNSS 35(3) text read: police notice of appearance (CrPC 41A)"
    },
    "41B": {
      "new": "36",
      "old_title": "Procedure of arrest and duties of officer making arrest",
      "new_title": "Procedure of arrest and duties of officer making arrest",
      "type": "direct",
      "source": "KER(line 149)+UP; GAZ BNSS 36 'Procedure of arrest and duties of officer making arrest'"
    },
    "41C": {
      "new": "37",
      "old_title": "Control room at districts",
      "new_title": "Designated police officer",
      "type": "merged",
      "source": "KER(line 152)+UP; GAZ BNSS 37 'Designated police officer'; BNSS 37(a) text read: police control room in every district (CrPC 41C(1)); heading renamed to Designated police officer"
    },
    "41D": {
      "new": "38",
      "old_title": "Right of arrested person to meet an advocate of his choice during interrogation",
      "new_title": "Right of arrested person to meet an advocate of his choice during interrogation",
      "type": "direct",
      "source": "KER(line 156)+UP; GAZ BNSS 38 'Right of arrested person to meet an advocate of his choice during interrogation'"
    },
    "42": {
      "new": "39",
      "old_title": "Arrest on refusal to give name and residence",
      "new_title": "Arrest on refusal to give name and residence",
      "type": "direct",
      "source": "KER(line 159)+UP; GAZ BNSS 39 'Arrest on refusal to give name and residence'"
    },
    "43": {
      "new": "40",
      "old_title": "Arrest by private person and procedure on such arrest",
      "new_title": "Arrest by private person and procedure on such arrest",
      "type": "direct",
      "source": "KER(line 161)+UP; GAZ BNSS 40 'Arrest by private person and procedure on such arrest'"
    },
    "44": {
      "new": "41",
      "old_title": "Arrest by Magistrate",
      "new_title": "Arrest by Magistrate",
      "type": "direct",
      "source": "KER(line 165)+UP; GAZ BNSS 41 'Arrest by Magistrate'"
    },
    "45": {
      "new": "42",
      "old_title": "Protection of members of the Armed Forces from arrest",
      "new_title": "Protection of members of Armed Forces from arrest",
      "type": "direct",
      "source": "KER(line 166)+UP; GAZ BNSS 42 'Protection of members of Armed Forces from arrest'"
    },
    "46": {
      "new": "43",
      "old_title": "How arrests are made",
      "new_title": "Arrest how made",
      "type": "direct",
      "source": "KER(line 168)+UP; GAZ BNSS 43 'Arrest how made'"
    },
    "47": {
      "new": "44",
      "old_title": "Search of place entered by person sought to be arrested",
      "new_title": "Search of place entered by person sought to be arrested",
      "type": "direct",
      "source": "KER(line 171)+UP; GAZ BNSS 44 'Search of place entered by person sought to be arrested'"
    },
    "48": {
      "new": "45",
      "old_title": "Pursuit of offenders into other jurisdictions",
      "new_title": "Pursuit of offenders into other jurisdictions",
      "type": "direct",
      "source": "KER(line 173)+UP; GAZ BNSS 45 'Pursuit of offenders into other jurisdictions'"
    },
    "49": {
      "new": "46",
      "old_title": "No unnecessary restraint",
      "new_title": "No unnecessary restraint",
      "type": "direct",
      "source": "KER(line 177)+UP; GAZ BNSS 46 'No unnecessary restraint'"
    },
    "50": {
      "new": "47",
      "old_title": "Person arrested to be informed of grounds of arrest and of right to bail",
      "new_title": "Person arrested to be informed of grounds of arrest and of right to bail",
      "type": "direct",
      "source": "KER(line 178)+UP; GAZ BNSS 47 'Person arrested to be informed of grounds of arrest and of right to bail'"
    },
    "50A": {
      "new": "48",
      "old_title": "Obligation of person making arrest to inform about the arrest",
      "new_title": "Obligation of person making arrest to inform about arrest, etc., to relative or friend",
      "type": "direct",
      "source": "KER(line 181)+UP; GAZ BNSS 48 'Obligation of person making arrest to inform about arrest, etc., to relative or friend'"
    },
    "51": {
      "new": "49",
      "old_title": "Search of arrested persons",
      "new_title": "Search of arrested person",
      "type": "direct",
      "source": "KER(line 185)+UP; GAZ BNSS 49 'Search of arrested person'"
    },
    "52": {
      "new": "50",
      "old_title": "Power to seize offensive weapons",
      "new_title": "Power to seize offensive weapons",
      "type": "direct",
      "source": "KER(line 187)+UP; GAZ BNSS 50 'Power to seize offensive weapons'"
    },
    "53": {
      "new": "51",
      "old_title": "Examination of accused by medical practitioner at request of police officer",
      "new_title": "Examination of accused by medical practitioner at request of police officer",
      "type": "direct",
      "source": "KER(line 189)+UP; GAZ BNSS 51 'Examination of accused by medical practitioner at request of police officer'"
    },
    "53A": {
      "new": "52",
      "old_title": "Examination of person accused of rape by medical practitioner",
      "new_title": "Examination of person accused of rape by medical practitioner",
      "type": "direct",
      "source": "KER(line 198)+UP; GAZ BNSS 52 'Examination of person accused of rape by medical practitioner'"
    },
    "54": {
      "new": "53",
      "old_title": "Examination of person in custody by medical practitioner",
      "new_title": "Examination of arrested person by medical officer",
      "type": "direct",
      "source": "KER(line 201)+UP; GAZ BNSS 53 'Examination of arrested person by medical officer'"
    },
    "54A": {
      "new": "54",
      "old_title": "Identification of person arrested",
      "new_title": "Identification of person arrested",
      "type": "direct",
      "source": "KER(line 204)+UP; GAZ BNSS 54 'Identification of person arrested'"
    },
    "55": {
      "new": "55",
      "old_title": "Procedure when police officer deputes subordinate to arrest without warrant",
      "new_title": "Procedure when police officer deputes subordinate to arrest without warrant",
      "type": "direct",
      "source": "KER(line 208)+UP; GAZ BNSS 55 'Procedure when police officer deputes subordinate to arrest without warrant'"
    },
    "55A": {
      "new": "56",
      "old_title": "Health and safety of arrested person",
      "new_title": "Health and safety of arrested person",
      "type": "direct",
      "source": "KER(line 211)+UP; GAZ BNSS 56 'Health and safety of arrested person'"
    },
    "56": {
      "new": "57",
      "old_title": "Person arrested to be taken before Magistrate or officer in charge of police station",
      "new_title": "Person arrested to be taken before Magistrate or officer in charge of police station",
      "type": "direct",
      "source": "KER(line 213)+UP; GAZ BNSS 57 'Person arrested to be taken before Magistrate or officer in charge of police station'"
    },
    "57": {
      "new": "58",
      "old_title": "Person arrested not to be detained more than twenty-four hours",
      "new_title": "Person arrested not to be detained more than twenty-four hours",
      "type": "direct",
      "source": "KER(line 216)+UP; GAZ BNSS 58 'Person arrested not to be detained more than twenty-four hours'"
    },
    "58": {
      "new": "59",
      "old_title": "Police to report apprehensions",
      "new_title": "Police to report apprehensions",
      "type": "direct",
      "source": "KER(line 222)+UP; GAZ BNSS 59 'Police to report apprehensions'"
    },
    "59": {
      "new": "60",
      "old_title": "Discharge of person apprehended",
      "new_title": "Discharge of person apprehended",
      "type": "direct",
      "source": "KER(line 224)+UP; GAZ BNSS 60 'Discharge of person apprehended'"
    },
    "60": {
      "new": "61",
      "old_title": "Power on escape to pursue and retake",
      "new_title": "Power, on escape, to pursue and retake",
      "type": "direct",
      "source": "KER(line 226)+UP; GAZ BNSS 61 'Power, on escape, to pursue and retake'"
    },
    "60A": {
      "new": "62",
      "old_title": "Arrest to be made strictly according to the Code",
      "new_title": "Arrest to be made strictly according to Sanhita",
      "type": "direct",
      "source": "KER(line 228)+UP; GAZ BNSS 62 'Arrest to be made strictly according to Sanhita'"
    },
    "61": {
      "new": "63",
      "old_title": "Form of summons",
      "new_title": "Form of summons",
      "type": "direct",
      "source": "KER(line 230)+UP; GAZ BNSS 63 'Form of summons'"
    },
    "62": {
      "new": "64",
      "old_title": "Summons how served",
      "new_title": "Summons how served",
      "type": "direct",
      "source": "KER(line 234)+UP; GAZ BNSS 64 'Summons how served'"
    },
    "63": {
      "new": "65",
      "old_title": "Service of summons on corporate bodies and societies",
      "new_title": "Service of summons on corporate bodies, firms, and societies",
      "type": "direct",
      "source": "KER(line 237)+UP; GAZ BNSS 65 'Service of summons on corporate bodies, firms, and societies'"
    },
    "64": {
      "new": "66",
      "old_title": "Service when persons summoned cannot be found",
      "new_title": "Service when persons summoned cannot be found",
      "type": "direct",
      "source": "KER(line 240)+UP; GAZ BNSS 66 'Service when persons summoned cannot be found'"
    },
    "65": {
      "new": "67",
      "old_title": "Procedure when service cannot be effected as before provided",
      "new_title": "Procedure when service cannot be effected as before provided",
      "type": "direct",
      "source": "KER(line 242)+UP; GAZ BNSS 67 'Procedure when service cannot be effected as before provided'"
    },
    "66": {
      "new": "68",
      "old_title": "Service on government servant",
      "new_title": "Service on Government servant",
      "type": "direct",
      "source": "KER(line 245)+UP; GAZ BNSS 68 'Service on Government servant'"
    },
    "67": {
      "new": "69",
      "old_title": "Service of summons outside local limits",
      "new_title": "Service of summons outside local limits",
      "type": "direct",
      "source": "KER(line 247)+UP; GAZ BNSS 69 'Service of summons outside local limits'"
    },
    "68": {
      "new": "70",
      "old_title": "Proof of service in such cases and when serving officer not present",
      "new_title": "Proof of service in such cases and when serving officer not present",
      "type": "direct",
      "source": "KER(line 249)+UP; GAZ BNSS 70 'Proof of service in such cases and when serving officer not present'"
    },
    "69": {
      "new": "71",
      "old_title": "Service of summons on witness by post",
      "new_title": "Service of summons on witness",
      "type": "direct",
      "source": "KER(line 253)+UP; GAZ BNSS 71 'Service of summons on witness'"
    },
    "70": {
      "new": "72",
      "old_title": "Form of warrant of arrest and duration",
      "new_title": "Form of warrant of arrest and duration",
      "type": "direct",
      "source": "KER(line 258)+UP; GAZ BNSS 72 'Form of warrant of arrest and duration'"
    },
    "71": {
      "new": "73",
      "old_title": "Power to direct security to be taken",
      "new_title": "Power to direct security to be taken",
      "type": "direct",
      "source": "KER(line 260)+UP; GAZ BNSS 73 'Power to direct security to be taken'"
    },
    "72": {
      "new": "74",
      "old_title": "Warrants to whom directed",
      "new_title": "Warrants to whom directed",
      "type": "direct",
      "source": "KER(line 262)+UP; GAZ BNSS 74 'Warrants to whom directed'"
    },
    "73": {
      "new": "75",
      "old_title": "Warrant may be directed to any person",
      "new_title": "Warrant may be directed to any person",
      "type": "direct",
      "source": "KER(line 263)+UP; GAZ BNSS 75 'Warrant may be directed to any person'"
    },
    "74": {
      "new": "76",
      "old_title": "Warrant directed to police officer",
      "new_title": "Warrant directed to police officer",
      "type": "direct",
      "source": "KER(line 266)+UP; GAZ BNSS 76 'Warrant directed to police officer'"
    },
    "75": {
      "new": "77",
      "old_title": "Notification of substance of warrant",
      "new_title": "Notification of substance of warrant",
      "type": "direct",
      "source": "KER(line 268)+UP; GAZ BNSS 77 'Notification of substance of warrant'"
    },
    "76": {
      "new": "78",
      "old_title": "Person arrested to be brought before Court without delay",
      "new_title": "Person arrested to be brought before Court without delay",
      "type": "direct",
      "source": "KER(line 270)+UP; GAZ BNSS 78 'Person arrested to be brought before Court without delay'"
    },
    "77": {
      "new": "79",
      "old_title": "Where warrant may be executed",
      "new_title": "Where warrant may be executed",
      "type": "direct",
      "source": "KER(line 272)+UP; GAZ BNSS 79 'Where warrant may be executed'"
    },
    "78": {
      "new": "80",
      "old_title": "Warrant forwarded for execution outside jurisdiction",
      "new_title": "Warrant forwarded for execution outside jurisdiction",
      "type": "direct",
      "source": "KER(line 274)+UP; GAZ BNSS 80 'Warrant forwarded for execution outside jurisdiction'"
    },
    "79": {
      "new": "81",
      "old_title": "Warrant directed to police officer for execution outside jurisdiction",
      "new_title": "Warrant directed to police officer for execution outside jurisdiction",
      "type": "direct",
      "source": "KER(line 277)+UP; GAZ BNSS 81 'Warrant directed to police officer for execution outside jurisdiction'"
    },
    "80": {
      "new": "82",
      "old_title": "Procedure of arrest of person against whom warrant issued",
      "new_title": "Procedure on arrest of person against whom warrant issued",
      "type": "direct",
      "source": "KER(line 280)+UP; GAZ BNSS 82 'Procedure on arrest of person against whom warrant issued'"
    },
    "81": {
      "new": "83",
      "old_title": "Procedure by Magistrate before whom such person arrested is brought",
      "new_title": "Procedure by Magistrate before whom such person arrested is brought",
      "type": "direct",
      "source": "KER(line 283)+UP; GAZ BNSS 83 'Procedure by Magistrate before whom such person arrested is brought'"
    },
    "82": {
      "new": "84",
      "old_title": "Proclamation for person absconding",
      "new_title": "Proclamation for person absconding",
      "type": "direct",
      "source": "KER(line 286)+UP; GAZ BNSS 84 'Proclamation for person absconding'"
    },
    "83": {
      "new": "85",
      "old_title": "Attachment of property of person absconding",
      "new_title": "Attachment of property of person absconding",
      "type": "direct",
      "source": "KER(line 290)+UP; GAZ BNSS 85 'Attachment of property of person absconding'"
    },
    "84": {
      "new": "87",
      "old_title": "Claims and objections to attachment",
      "new_title": "Claims and objections to attachment",
      "type": "direct",
      "source": "KER(line 295)+UP; GAZ BNSS 87 'Claims and objections to attachment'"
    },
    "85": {
      "new": "88",
      "old_title": "Release, sale and restoration of attached property",
      "new_title": "Release, sale and restoration of attached property",
      "type": "direct",
      "source": "KER(line 297)+UP; GAZ BNSS 88 'Release, sale and restoration of attached property'"
    },
    "86": {
      "new": "89",
      "old_title": "Appeal from order rejecting application for restoration of attached property",
      "new_title": "Appeal from order rejecting application for restoration of attached property",
      "type": "direct",
      "source": "KER(line 299)+UP; GAZ BNSS 89 'Appeal from order rejecting application for restoration of attached property'"
    },
    "87": {
      "new": "90",
      "old_title": "Issue of warrant in lieu of, or in addition to, summons",
      "new_title": "Issue of warrant in lieu of, or in addition to, summons",
      "type": "direct",
      "source": "KER(line 302)+UP; GAZ BNSS 90 'Issue of warrant in lieu of, or in addition to, summons'"
    },
    "88": {
      "new": "91",
      "old_title": "Power to take bond for appearance",
      "new_title": "Power to take bond or bail bond for appearance",
      "type": "direct",
      "source": "KER(line 304)+UP; GAZ BNSS 91 'Power to take bond or bail bond for appearance'"
    },
    "89": {
      "new": "92",
      "old_title": "Arrest on breach of bond for appearance",
      "new_title": "Arrest on breach of bond or bail bond for appearance",
      "type": "direct",
      "source": "KER(line 310)+UP; GAZ BNSS 92 'Arrest on breach of bond or bail bond for appearance'"
    },
    "90": {
      "new": "93",
      "old_title": "Provisions of this Chapter generally applicable to summons and warrants of arrest",
      "new_title": "Provisions of this Chapter generally applicable to summons and warrants of arrest",
      "type": "direct",
      "source": "KER(line 312)+UP; GAZ BNSS 93 'Provisions of this Chapter generally applicable to summons and warrants of arrest'"
    },
    "91": {
      "new": "94",
      "old_title": "Summons to produce document or other thing",
      "new_title": "Summons to produce document or other thing",
      "type": "direct",
      "source": "KER(line 316)+UP; GAZ BNSS 94 'Summons to produce document or other thing'"
    },
    "92": {
      "new": "95",
      "old_title": "Procedure as to letters and telegrams",
      "new_title": "Procedure as to letters",
      "type": "direct",
      "source": "KER(line 326)+UP; GAZ BNSS 95 'Procedure as to letters'"
    },
    "93": {
      "new": "96",
      "old_title": "When search-warrant may be issued",
      "new_title": "When search-warrant may be issued",
      "type": "direct",
      "source": "KER(line 328)+UP; GAZ BNSS 96 'When search-warrant may be issued'"
    },
    "94": {
      "new": "97",
      "old_title": "Search of place suspected to contain stolen property, forged documents etc.",
      "new_title": "Search of place suspected to contain stolen property, forged documents, etc",
      "type": "direct",
      "source": "KER(line 330)+UP; GAZ BNSS 97 'Search of place suspected to contain stolen property, forged documents, etc'"
    },
    "95": {
      "new": "98",
      "old_title": "Power to declare certain publications forfeited and to issue search-warrants",
      "new_title": "Power to declare certain publications forfeited and to issue search-warrants for same",
      "type": "direct",
      "source": "KER(line 334)+UP; GAZ BNSS 98 'Power to declare certain publications forfeited and to issue search-warrants for same'"
    },
    "96": {
      "new": "99",
      "old_title": "Application to High Court to set aside declaration of forfeiture",
      "new_title": "Application to High Court to set aside declaration of forfeiture",
      "type": "direct",
      "source": "KER(line 338)+UP; GAZ BNSS 99 'Application to High Court to set aside declaration of forfeiture'"
    },
    "97": {
      "new": "100",
      "old_title": "Search for persons wrongfully confined",
      "new_title": "Search for persons wrongfully confined",
      "type": "direct",
      "source": "KER(line 341)+UP; GAZ BNSS 100 'Search for persons wrongfully confined'"
    },
    "98": {
      "new": "101",
      "old_title": "Power to compel restoration of abducted females",
      "new_title": "Power to compel restoration of abducted females",
      "type": "direct",
      "source": "KER(line 343)+UP; GAZ BNSS 101 'Power to compel restoration of abducted females'"
    },
    "99": {
      "new": "102",
      "old_title": "Direction etc. of search warrants",
      "new_title": "Direction, etc., of search-warrants",
      "type": "direct",
      "source": "KER(line 345)+UP; GAZ BNSS 102 'Direction, etc., of search-warrants'"
    },
    "100": {
      "new": "103",
      "old_title": "Persons in charge of closed place to allow search",
      "new_title": "Persons in charge of closed place to allow search",
      "type": "direct",
      "source": "KER(line 347)+UP; GAZ BNSS 103 'Persons in charge of closed place to allow search'"
    },
    "101": {
      "new": "104",
      "old_title": "Disposal of things found in search beyond jurisdiction",
      "new_title": "Disposal of things found in search beyond jurisdiction",
      "type": "direct",
      "source": "KER(line 349)+UP; GAZ BNSS 104 'Disposal of things found in search beyond jurisdiction'"
    },
    "102": {
      "new": "106",
      "old_title": "Power of police officer to seize certain property",
      "new_title": "Power of police officer to seize certain property",
      "type": "direct",
      "source": "KER(line 365)+UP; GAZ BNSS 106 'Power of police officer to seize certain property'"
    },
    "103": {
      "new": "108",
      "old_title": "Magistrate may direct search in his presence",
      "new_title": "Magistrate may direct search in his presence",
      "type": "direct",
      "source": "KER(line 369)+UP; GAZ BNSS 108 'Magistrate may direct search in his presence'"
    },
    "104": {
      "new": "109",
      "old_title": "Power to impound document etc. produced",
      "new_title": "Power to impound document, etc., produced",
      "type": "direct",
      "source": "KER(line 371)+UP; GAZ BNSS 109 'Power to impound document, etc., produced'"
    },
    "105": {
      "new": "110",
      "old_title": "Reciprocal arrangements regarding processes",
      "new_title": "Reciprocal arrangements regarding processes",
      "type": "direct",
      "source": "KER(line 373)+UP; GAZ BNSS 110 'Reciprocal arrangements regarding processes'"
    },
    "105A": {
      "new": "111",
      "old_title": "Definitions — letters of request",
      "new_title": "Definitions",
      "type": "direct",
      "source": "KER(line 375)+UP; GAZ BNSS 111 'Definitions'"
    },
    "105B": {
      "new": "114",
      "old_title": "Assistance in securing transfer of persons",
      "new_title": "Assistance in securing transfer of persons",
      "type": "direct",
      "source": "KER(line 385)+UP; GAZ BNSS 114 'Assistance in securing transfer of persons'"
    },
    "105C": {
      "new": "115",
      "old_title": "Assistance in relation to orders of attachment or forfeiture of property",
      "new_title": "Assistance in relation to orders of attachment or forfeiture of property",
      "type": "direct",
      "source": "KER(line 387)+UP; GAZ BNSS 115 'Assistance in relation to orders of attachment or forfeiture of property'"
    },
    "105D": {
      "new": "116",
      "old_title": "Identifying unlawfully acquired property",
      "new_title": "Identifying unlawfully acquired property",
      "type": "direct",
      "source": "KER(line 390)+UP; GAZ BNSS 116 'Identifying unlawfully acquired property'"
    },
    "105E": {
      "new": "117",
      "old_title": "Seizure or attachment of unlawfully acquired property",
      "new_title": "Seizure or attachment of property",
      "type": "direct",
      "source": "KER(line 392)+UP; GAZ BNSS 117 'Seizure or attachment of property'"
    },
    "105F": {
      "new": "118",
      "old_title": "Management of properties seized or forfeited",
      "new_title": "Management of properties seized or forfeited under this Chapter",
      "type": "direct",
      "source": "KER(line 394)+UP; GAZ BNSS 118 'Management of properties seized or forfeited under this Chapter'"
    },
    "105G": {
      "new": "119",
      "old_title": "Notice of forfeiture of property",
      "new_title": "Notice of forfeiture of property",
      "type": "direct",
      "source": "KER(line 400)+UP; GAZ BNSS 119 'Notice of forfeiture of property'"
    },
    "105H": {
      "new": "120",
      "old_title": "Forfeiture of property in certain cases",
      "new_title": "Forfeiture of property in certain cases",
      "type": "direct",
      "source": "KER(line 402)+UP; GAZ BNSS 120 'Forfeiture of property in certain cases'"
    },
    "105I": {
      "new": "121",
      "old_title": "Fine in lieu of forfeiture",
      "new_title": "Fine of in lieu forfeiture",
      "type": "direct",
      "source": "KER(line 404)+UP; GAZ BNSS 121 'Fine of in lieu forfeiture'"
    },
    "105J": {
      "new": "122",
      "old_title": "Certain transfers to be null and void",
      "new_title": "Certain transfers to be null and void",
      "type": "direct",
      "source": "KER(line 405)+UP; GAZ BNSS 122 'Certain transfers to be null and void'"
    },
    "105K": {
      "new": "123",
      "old_title": "Procedure in respect of letter of request",
      "new_title": "Procedure in respect of letter of request",
      "type": "direct",
      "source": "KER(line 407)+UP; GAZ BNSS 123 'Procedure in respect of letter of request'"
    },
    "105L": {
      "new": "124",
      "old_title": "Application of this Chapter",
      "new_title": "Application of this Chapter",
      "type": "direct",
      "source": "KER(line 409)+UP; GAZ BNSS 124 'Application of this Chapter'"
    },
    "106": {
      "new": "125",
      "old_title": "Security for keeping peace on conviction",
      "new_title": "Security for keeping peace on conviction",
      "type": "direct",
      "source": "KER(line 410)+UP; GAZ BNSS 125 'Security for keeping peace on conviction'"
    },
    "107": {
      "new": "126",
      "old_title": "Security for keeping the peace in other cases",
      "new_title": "Security for keeping peace in other cases",
      "type": "direct",
      "source": "KER(line 412)+UP; GAZ BNSS 126 'Security for keeping peace in other cases'"
    },
    "108": {
      "new": "127",
      "old_title": "Security for good behaviour from persons disseminating seditious matters",
      "new_title": "Security for good behaviour from persons disseminating certain matters",
      "type": "direct",
      "source": "KER(line 414)+UP; GAZ BNSS 127 'Security for good behaviour from persons disseminating certain matters'"
    },
    "109": {
      "new": "128",
      "old_title": "Security for good behaviour from suspected persons",
      "new_title": "Security for good behaviour from suspected persons",
      "type": "direct",
      "source": "KER(line 417)+UP; GAZ BNSS 128 'Security for good behaviour from suspected persons'"
    },
    "110": {
      "new": "129",
      "old_title": "Security for good behaviour from habitual offenders",
      "new_title": "Security for good behaviour from habitual offenders",
      "type": "direct",
      "source": "KER(line 419)+UP; GAZ BNSS 129 'Security for good behaviour from habitual offenders'"
    },
    "111": {
      "new": "130",
      "old_title": "Order to be made",
      "new_title": "Order to be made",
      "type": "direct",
      "source": "KER(line 425)+UP; GAZ BNSS 130 'Order to be made'"
    },
    "112": {
      "new": "131",
      "old_title": "Procedure in respect of person present in court",
      "new_title": "Procedure in respect of person present in Court",
      "type": "direct",
      "source": "KER(line 427)+UP; GAZ BNSS 131 'Procedure in respect of person present in Court'"
    },
    "113": {
      "new": "132",
      "old_title": "Summons or warrant in case of person not so present",
      "new_title": "Summons or warrant in case of person not so present",
      "type": "direct",
      "source": "KER(line 429)+UP; GAZ BNSS 132 'Summons or warrant in case of person not so present'"
    },
    "114": {
      "new": "133",
      "old_title": "Copy of order to accompany summons or warrant",
      "new_title": "Copy of order to accompany summons or warrant",
      "type": "direct",
      "source": "KER(line 431)+UP; GAZ BNSS 133 'Copy of order to accompany summons or warrant'"
    },
    "115": {
      "new": "134",
      "old_title": "Power to dispense with personal attendance",
      "new_title": "Power to dispense with personal attendance",
      "type": "direct",
      "source": "KER(line 433)+UP; GAZ BNSS 134 'Power to dispense with personal attendance'"
    },
    "116": {
      "new": "135",
      "old_title": "Inquiry as to truth of information",
      "new_title": "Inquiry as to truth of information",
      "type": "direct",
      "source": "KER(line 435)+UP; GAZ BNSS 135 'Inquiry as to truth of information'"
    },
    "117": {
      "new": "136",
      "old_title": "Order to give security",
      "new_title": "Order to give security",
      "type": "direct",
      "source": "KER(line 437)+UP; GAZ BNSS 136 'Order to give security'"
    },
    "118": {
      "new": "137",
      "old_title": "Discharge of person informed against",
      "new_title": "Discharge of person informed against",
      "type": "direct",
      "source": "KER(line 438)+UP; GAZ BNSS 137 'Discharge of person informed against'"
    },
    "119": {
      "new": "138",
      "old_title": "Commencement of period for which security is required",
      "new_title": "Commencement of period for which security is required",
      "type": "direct",
      "source": "KER(line 444)+UP; GAZ BNSS 138 'Commencement of period for which security is required'"
    },
    "120": {
      "new": "139",
      "old_title": "Contents of bond",
      "new_title": "Contents of bond",
      "type": "direct",
      "source": "KER(line 447)+UP; GAZ BNSS 139 'Contents of bond'"
    },
    "121": {
      "new": "140",
      "old_title": "Power to reject sureties",
      "new_title": "Power to reject sureties",
      "type": "direct",
      "source": "KER(line 448)+UP; GAZ BNSS 140 'Power to reject sureties'"
    },
    "122": {
      "new": "141",
      "old_title": "Imprisonment in default of security",
      "new_title": "Imprisonment in default of security",
      "type": "direct",
      "source": "KER(line 449)+UP; GAZ BNSS 141 'Imprisonment in default of security'"
    },
    "123": {
      "new": "142",
      "old_title": "Power to release persons imprisoned for failing to give security",
      "new_title": "Power to release persons imprisoned for failing to give security",
      "type": "direct",
      "source": "KER(line 451)+UP; GAZ BNSS 142 'Power to release persons imprisoned for failing to give security'"
    },
    "124": {
      "new": "143",
      "old_title": "Security for unexpired period of bond",
      "new_title": "Security for unexpired period of bond",
      "type": "direct",
      "source": "KER(line 454)+UP; GAZ BNSS 143 'Security for unexpired period of bond'"
    },
    "125": {
      "new": "144",
      "old_title": "Order for maintenance of wives, children and parents",
      "new_title": "Order for maintenance of wives, children and parents",
      "type": "direct",
      "source": "KER(line 456)+UP; GAZ BNSS 144 'Order for maintenance of wives, children and parents'"
    },
    "126": {
      "new": "145",
      "old_title": "Procedure for maintenance",
      "new_title": "Procedure",
      "type": "direct",
      "source": "KER(line 458)+UP; GAZ BNSS 145 'Procedure'"
    },
    "127": {
      "new": "146",
      "old_title": "Alteration in allowance",
      "new_title": "Alteration in allowance",
      "type": "direct",
      "source": "KER(line 460)+UP; GAZ BNSS 146 'Alteration in allowance'"
    },
    "128": {
      "new": "147",
      "old_title": "Enforcement of order of maintenance",
      "new_title": "Enforcement of order of maintenance",
      "type": "direct",
      "source": "KER(line 461)+UP; GAZ BNSS 147 'Enforcement of order of maintenance'"
    },
    "129": {
      "new": "148",
      "old_title": "Dispersal of assembly by use of civil force",
      "new_title": "Dispersal of assembly by use of civil force",
      "type": "direct",
      "source": "KER(line 463)+UP; GAZ BNSS 148 'Dispersal of assembly by use of civil force'"
    },
    "130": {
      "new": "149",
      "old_title": "Use of armed forces to disperse assembly",
      "new_title": "Use of armed forces to disperse assembly",
      "type": "direct",
      "source": "KER(line 465)+UP; GAZ BNSS 149 'Use of armed forces to disperse assembly'"
    },
    "131": {
      "new": "150",
      "old_title": "Power of certain armed force officers to disperse assembly",
      "new_title": "Power of certain armed force officers to disperse assembly",
      "type": "direct",
      "source": "KER(line 472)+UP; GAZ BNSS 150 'Power of certain armed force officers to disperse assembly'"
    },
    "132": {
      "new": "151",
      "old_title": "Protection against prosecution for acts done under preceding sections",
      "new_title": "Protection against prosecution for acts done under sections 148, 149 and 150",
      "type": "direct",
      "source": "KER(line 474)+UP; GAZ BNSS 151 'Protection against prosecution for acts done under sections 148, 149 and 150'"
    },
    "133": {
      "new": "152",
      "old_title": "Conditional order for removal of nuisance",
      "new_title": "Conditional order for removal of nuisance",
      "type": "direct",
      "source": "KER(line 478)+UP; GAZ BNSS 152 'Conditional order for removal of nuisance'"
    },
    "134": {
      "new": "153",
      "old_title": "Service or notification of order",
      "new_title": "Service or notification of order",
      "type": "direct",
      "source": "KER(line 480)+UP; GAZ BNSS 153 'Service or notification of order'"
    },
    "135": {
      "new": "154",
      "old_title": "Person to whom order is addressed to obey or show cause",
      "new_title": "Person to whom order is addressed to obey or show cause",
      "type": "direct",
      "source": "KER(line 482)+UP; GAZ BNSS 154 'Person to whom order is addressed to obey or show cause'"
    },
    "136": {
      "new": "155",
      "old_title": "Consequences of failing to do so",
      "new_title": "Penalty for failure to comply with section 154",
      "type": "direct",
      "source": "KER(line 489)+UP; GAZ BNSS 155 'Penalty for failure to comply with section 154'; BNSS 155 text read: same penalty-on-non-compliance provision as CrPC 136 (order under 133/154)"
    },
    "137": {
      "new": "156",
      "old_title": "Procedure where existence of public right is denied",
      "new_title": "Procedure where existence of public right is denied",
      "type": "direct",
      "source": "KER(line 492)+UP; GAZ BNSS 156 'Procedure where existence of public right is denied'"
    },
    "138": {
      "new": "157",
      "old_title": "Procedure where person against whom order made appears to show cause",
      "new_title": "Procedure where person against whom order is made under section 152 appears to show cause",
      "type": "direct",
      "source": "KER(line 494)+UP; GAZ BNSS 157 'Procedure where person against whom order is made under section 152 appears to show cause'"
    },
    "139": {
      "new": "158",
      "old_title": "Power of Magistrate to direct local investigation and examination of expert",
      "new_title": "Power of Magistrate to direct local investigation and examination of an expert",
      "type": "direct",
      "source": "KER(line 498)+UP; GAZ BNSS 158 'Power of Magistrate to direct local investigation and examination of an expert'"
    },
    "140": {
      "new": "159",
      "old_title": "Power of Magistrate to furnish written instructions etc.",
      "new_title": "Power of Magistrate to furnish written instructions, etc",
      "type": "direct",
      "source": "KER(line 501)+UP; GAZ BNSS 159 'Power of Magistrate to furnish written instructions, etc'"
    },
    "141": {
      "new": "160",
      "old_title": "Procedure on order being made absolute and consequences of disobedience",
      "new_title": "Procedure on order being made absolute and consequences of disobedience",
      "type": "direct",
      "source": "KER(line 504)+UP; GAZ BNSS 160 'Procedure on order being made absolute and consequences of disobedience'"
    },
    "142": {
      "new": "161",
      "old_title": "Injunction pending inquiry",
      "new_title": "Injunction pending inquiry",
      "type": "direct",
      "source": "KER(line 508)+UP; GAZ BNSS 161 'Injunction pending inquiry'"
    },
    "143": {
      "new": "162",
      "old_title": "Magistrate may prohibit repetition or continuance of public nuisance",
      "new_title": "Magistrate may prohibit repetition or continuance of public nuisance",
      "type": "direct",
      "source": "KER(line 509)+UP; GAZ BNSS 162 'Magistrate may prohibit repetition or continuance of public nuisance'"
    },
    "144": {
      "new": "163",
      "old_title": "Power to issue order in urgent cases of nuisance or apprehended danger",
      "new_title": "Power to issue order in urgent cases of nuisance or apprehended danger",
      "type": "direct",
      "source": "KER(line 512)+UP; GAZ BNSS 163 'Power to issue order in urgent cases of nuisance or apprehended danger'"
    },
    "144A": {
      "new": null,
      "old_title": "Power to prohibit carrying arms in procession or mass drill",
      "new_title": null,
      "type": "repealed",
      "source": "UP+KER(absence)+GAZ(no heading)",
      "note": "Deleted in BNSS (UP Police correspondence table: Deleted; no BNSS section)"
    },
    "145": {
      "new": "164",
      "old_title": "Procedure where dispute concerning land or water is likely to cause breach of peace",
      "new_title": "Procedure where dispute concerning land or water is likely to cause breach of peace",
      "type": "direct",
      "note": "BNSS consolidates 144A and 145 series — see BNSS 164-167 for full procedure",
      "source": "KER(line 515)+UP; GAZ BNSS 164 'Procedure where dispute concerning land or water is likely to cause breach of peace'"
    },
    "146": {
      "new": "165",
      "old_title": "Power to attach subject of dispute and to appoint receiver",
      "new_title": "Power to attach subject of dispute and to appoint receiver",
      "type": "direct",
      "source": "KER(line 519)+UP; GAZ BNSS 165 'Power to attach subject of dispute and to appoint receiver'"
    },
    "147": {
      "new": "166",
      "old_title": "Dispute concerning right of use of land or water",
      "new_title": "Dispute concerning right of use of land or water",
      "type": "direct",
      "source": "KER(line 522)+UP; GAZ BNSS 166 'Dispute concerning right of use of land or water'"
    },
    "148": {
      "new": "167",
      "old_title": "Local inquiry",
      "new_title": "Local inquiry",
      "type": "direct",
      "source": "KER(line 525)+UP; GAZ BNSS 167 'Local inquiry'"
    },
    "149": {
      "new": "168",
      "old_title": "Police to prevent cognizable offences",
      "new_title": "Police to prevent cognizable offences",
      "type": "direct",
      "source": "KER(line 526)+UP; GAZ BNSS 168 'Police to prevent cognizable offences'"
    },
    "150": {
      "new": "169",
      "old_title": "Information of design to commit cognizable offences",
      "new_title": "Information of design to commit cognizable offences",
      "type": "direct",
      "source": "KER(line 528)+UP; GAZ BNSS 169 'Information of design to commit cognizable offences'"
    },
    "151": {
      "new": "170",
      "old_title": "Arrest to prevent commission of cognizable offences",
      "new_title": "Arrest to prevent commission of cognizable offences",
      "type": "direct",
      "source": "KER(line 534)+UP; GAZ BNSS 170 'Arrest to prevent commission of cognizable offences'"
    },
    "152": {
      "new": "171",
      "old_title": "Prevention of injury to public property",
      "new_title": "Prevention of injury to public property",
      "type": "direct",
      "source": "KER(line 537)+UP; GAZ BNSS 171 'Prevention of injury to public property'"
    },
    "153": {
      "new": null,
      "old_title": "Inspection of weights and measures",
      "new_title": null,
      "type": "repealed",
      "source": "UP+KER(absence)+GAZ(no heading)",
      "note": "Deleted in BNSS (UP Police correspondence table: Deleted; no BNSS section)"
    },
    "154": {
      "new": "173",
      "old_title": "Information in cognizable cases (FIR)",
      "new_title": "Information in cognizable cases",
      "type": "direct",
      "source": "KER(line 548)+UP; GAZ BNSS 173 'Information in cognizable cases'"
    },
    "155": {
      "new": "174",
      "old_title": "Information as to non-cognizable cases and investigation of such cases",
      "new_title": "Information as to non-cognizable cases and investigation of such cases",
      "type": "direct",
      "source": "KER(line 562)+UP; GAZ BNSS 174 'Information as to non-cognizable cases and investigation of such cases'"
    },
    "156": {
      "new": "175",
      "old_title": "Police officer's power to investigate cognizable cases",
      "new_title": "Police officer's power to investigate cognizable case",
      "type": "direct",
      "source": "KER(line 565)+UP; GAZ BNSS 175 'Police officer's power to investigate cognizable case'"
    },
    "157": {
      "new": "176",
      "old_title": "Procedure for investigation",
      "new_title": "Procedure for investigation",
      "type": "direct",
      "source": "KER(line 570)+UP; GAZ BNSS 176 'Procedure for investigation'"
    },
    "158": {
      "new": "177",
      "old_title": "Report how submitted",
      "new_title": "Report how submitted",
      "type": "direct",
      "source": "KER(line 577)+UP; GAZ BNSS 177 'Report how submitted'"
    },
    "159": {
      "new": "178",
      "old_title": "Power to hold investigation or preliminary inquiry",
      "new_title": "Power to hold investigation or preliminary inquiry",
      "type": "direct",
      "source": "KER(line 580)+UP; GAZ BNSS 178 'Power to hold investigation or preliminary inquiry'"
    },
    "160": {
      "new": "179",
      "old_title": "Police officer's power to require attendance of witnesses",
      "new_title": "Police officer's power to require attendance of witnesses",
      "type": "direct",
      "source": "KER(line 582)+UP; GAZ BNSS 179 'Police officer's power to require attendance of witnesses'"
    },
    "161": {
      "new": "180",
      "old_title": "Examination of witnesses by police",
      "new_title": "Examination of witnesses by police",
      "type": "direct",
      "source": "KER(line 586)+UP; GAZ BNSS 180 'Examination of witnesses by police'"
    },
    "162": {
      "new": "181",
      "old_title": "Statements to police not to be signed; use of statements in evidence",
      "new_title": "Statements to police and use thereof",
      "type": "direct",
      "source": "KER(line 588)+UP; GAZ BNSS 181 'Statements to police and use thereof'; same provision, heading shortened"
    },
    "163": {
      "new": "182",
      "old_title": "No inducement to be offered",
      "new_title": "No inducement to be offered",
      "type": "direct",
      "source": "KER(line 590)+UP; GAZ BNSS 182 'No inducement to be offered'"
    },
    "164": {
      "new": "183",
      "old_title": "Recording of confessions and statements",
      "new_title": "Recording of confessions and statements",
      "type": "direct",
      "source": "KER(line 591)+UP; GAZ BNSS 183 'Recording of confessions and statements'"
    },
    "164A": {
      "new": "184",
      "old_title": "Medical examination of the victim of rape",
      "new_title": "Medical examination of victim of rape",
      "type": "direct",
      "source": "KER(line 602)+UP; GAZ BNSS 184 'Medical examination of victim of rape'"
    },
    "165": {
      "new": "185",
      "old_title": "Search by police officer",
      "new_title": "Search by police officer",
      "type": "direct",
      "source": "KER(line 605)+UP; GAZ BNSS 185 'Search by police officer'"
    },
    "166": {
      "new": "186",
      "old_title": "When officer in charge of police station may require another to issue search-warrant",
      "new_title": "When officer in charge of police station may require another to issue search-warrant",
      "type": "direct",
      "source": "KER(line 611)+UP; GAZ BNSS 186 'When officer in charge of police station may require another to issue search-warrant'"
    },
    "166A": {
      "new": "112",
      "old_title": "Letter of request to competent authority for investigation in country outside India",
      "new_title": "Letter of request to competent authority for investigation in a country or place outside India",
      "type": "direct",
      "source": "KER(line 376)+UP; GAZ BNSS 112 'Letter of request to competent authority for investigation in a country or place outside India'"
    },
    "166B": {
      "new": "113",
      "old_title": "Letter of request from country outside India to court or authority for investigation in India",
      "new_title": "Letter of request from a country or place outside India to a Court or an authority for investigation in India",
      "type": "direct",
      "source": "KER(line 380)+UP; GAZ BNSS 113 'Letter of request from a country or place outside India to a Court or an authority for investigation in India'"
    },
    "167": {
      "new": "187",
      "old_title": "Procedure when investigation cannot be completed in twenty-four hours",
      "new_title": "Procedure when investigation cannot be completed in twenty-four hours",
      "type": "direct",
      "source": "KER(line 615)+UP; GAZ BNSS 187 'Procedure when investigation cannot be completed in twenty-four hours'"
    },
    "168": {
      "new": "188",
      "old_title": "Report of investigation by subordinate police officer",
      "new_title": "Report of investigation by subordinate police officer",
      "type": "direct",
      "source": "KER(line 632)+UP; GAZ BNSS 188 'Report of investigation by subordinate police officer'"
    },
    "169": {
      "new": "189",
      "old_title": "Release of accused when evidence deficient",
      "new_title": "Release of accused when evidence deficient",
      "type": "direct",
      "source": "KER(line 634)+UP; GAZ BNSS 189 'Release of accused when evidence deficient'"
    },
    "170": {
      "new": "190",
      "old_title": "Cases to be sent to Magistrate when evidence is sufficient",
      "new_title": "Cases to be sent to Magistrate, when evidence is sufficient",
      "type": "direct",
      "source": "KER(line 636)+UP; GAZ BNSS 190 'Cases to be sent to Magistrate, when evidence is sufficient'"
    },
    "171": {
      "new": "191",
      "old_title": "Complainant and witnesses not to be required to accompany police officer",
      "new_title": "Complainant and witnesses not to be required to accompany police officer and not to be subject to restraint",
      "type": "direct",
      "source": "KER(line 639)+UP; GAZ BNSS 191 'Complainant and witnesses not to be required to accompany police officer and not to be subject to restraint'"
    },
    "172": {
      "new": "192",
      "old_title": "Diary of proceedings in investigation",
      "new_title": "Diary of proceedings in investigation",
      "type": "direct",
      "source": "KER(line 644)+UP; GAZ BNSS 192 'Diary of proceedings in investigation'"
    },
    "173": {
      "new": "193",
      "old_title": "Report of police officer on completion of investigation (Charge sheet)",
      "new_title": "Report of police officer on completion of investigation",
      "type": "direct",
      "source": "KER(line 646)+UP; GAZ BNSS 193 'Report of police officer on completion of investigation'"
    },
    "174": {
      "new": "194",
      "old_title": "Police to inquire and report on suicide etc.",
      "new_title": "Police to enquire and report on suicide, etc",
      "type": "direct",
      "source": "KER(line 676)+UP; GAZ BNSS 194 'Police to enquire and report on suicide, etc'"
    },
    "175": {
      "new": "195",
      "old_title": "Power to summon persons",
      "new_title": "Power to summon persons",
      "type": "direct",
      "source": "KER(line 679)+UP; GAZ BNSS 195 'Power to summon persons'"
    },
    "176": {
      "new": "196",
      "old_title": "Inquiry by Magistrate into cause of death",
      "new_title": "Inquiry by Magistrate into cause of death",
      "type": "direct",
      "source": "KER(line 685)+UP; GAZ BNSS 196 'Inquiry by Magistrate into cause of death'"
    },
    "177": {
      "new": "197",
      "old_title": "Ordinary place of inquiry and trial",
      "new_title": "Ordinary place of inquiry and trial",
      "type": "direct",
      "source": "KER(line 687)+UP; GAZ BNSS 197 'Ordinary place of inquiry and trial'"
    },
    "178": {
      "new": "198",
      "old_title": "Place of inquiry or trial",
      "new_title": "Place of inquiry or trial",
      "type": "direct",
      "source": "KER(line 689)+UP; GAZ BNSS 198 'Place of inquiry or trial'"
    },
    "179": {
      "new": "199",
      "old_title": "Offence triable where act is done or consequence ensues",
      "new_title": "Offence triable where act is done or consequence ensues",
      "type": "direct",
      "source": "KER(line 690)+UP; GAZ BNSS 199 'Offence triable where act is done or consequence ensues'"
    },
    "180": {
      "new": "200",
      "old_title": "Place of trial where act is offence by reason of relation to other offence",
      "new_title": "Place of trial where act is an offence by reason of relation to other offence",
      "type": "direct",
      "source": "KER(line 692)+UP; GAZ BNSS 200 'Place of trial where act is an offence by reason of relation to other offence'"
    },
    "181": {
      "new": "201",
      "old_title": "Place of trial in case of certain offences",
      "new_title": "Place of trial in case of certain offences",
      "type": "direct",
      "source": "KER(line 695)+UP; GAZ BNSS 201 'Place of trial in case of certain offences'"
    },
    "182": {
      "new": "202",
      "old_title": "Offences committed by letters etc.",
      "new_title": "Offences committed by means of electronic communications, letters, etc",
      "type": "direct",
      "source": "KER(line 698)+UP; GAZ BNSS 202 'Offences committed by means of electronic communications, letters, etc'; same provision (electronic communications added)"
    },
    "183": {
      "new": "203",
      "old_title": "Offence committed on journey or voyage",
      "new_title": "Offence committed on journey or voyage",
      "type": "direct",
      "source": "KER(line 704)+UP; GAZ BNSS 203 'Offence committed on journey or voyage'"
    },
    "184": {
      "new": "204",
      "old_title": "Place of trial for offences triable together",
      "new_title": "Place of trial for offences triable together",
      "type": "direct",
      "source": "KER(line 706)+UP; GAZ BNSS 204 'Place of trial for offences triable together'"
    },
    "185": {
      "new": "205",
      "old_title": "Power to order cases to be tried in different sessions divisions",
      "new_title": "Power to order cases to be tried in different sessions divisions",
      "type": "direct",
      "source": "KER(line 708)+UP; GAZ BNSS 205 'Power to order cases to be tried in different sessions divisions'"
    },
    "186": {
      "new": "206",
      "old_title": "High Court to decide in case of doubt of district in which inquiry or trial shall take place",
      "new_title": "High Court to decide, in case of doubt, district where inquiry or trial shall take place",
      "type": "direct",
      "source": "KER(line 711)+UP; GAZ BNSS 206 'High Court to decide, in case of doubt, district where inquiry or trial shall take place'"
    },
    "187": {
      "new": "207",
      "old_title": "Power to issue summons or warrant for offence committed beyond local jurisdiction",
      "new_title": "Power to issue summons or warrant for offence committed beyond local jurisdiction",
      "type": "direct",
      "source": "KER(line 715)+UP; GAZ BNSS 207 'Power to issue summons or warrant for offence committed beyond local jurisdiction'"
    },
    "188": {
      "new": "208",
      "old_title": "Offence committed outside India",
      "new_title": "Offence committed outside India",
      "type": "direct",
      "source": "KER(line 719)+UP; GAZ BNSS 208 'Offence committed outside India'"
    },
    "189": {
      "new": "209",
      "old_title": "Receipt of evidence relating to offences committed outside India",
      "new_title": "Receipt of evidence relating to offences committed outside India",
      "type": "direct",
      "source": "KER(line 721)+UP; GAZ BNSS 209 'Receipt of evidence relating to offences committed outside India'"
    },
    "190": {
      "new": "210",
      "old_title": "Cognizance of offences by Magistrates",
      "new_title": "Cognizance of offences by Magistrate",
      "type": "direct",
      "source": "KER(line 724)+UP; GAZ BNSS 210 'Cognizance of offences by Magistrate'"
    },
    "191": {
      "new": "211",
      "old_title": "Transfer on application of the accused",
      "new_title": "Transfer on application of accused",
      "type": "direct",
      "source": "KER(line 728)+UP; GAZ BNSS 211 'Transfer on application of accused'"
    },
    "192": {
      "new": "212",
      "old_title": "Making over of cases to Magistrates",
      "new_title": "Making over of cases to Magistrates",
      "type": "direct",
      "source": "KER(line 730)+UP; GAZ BNSS 212 'Making over of cases to Magistrates'"
    },
    "193": {
      "new": "213",
      "old_title": "Cognizance of offences by Courts of Session",
      "new_title": "Cognizance of offences by Court of Session",
      "type": "direct",
      "source": "KER(line 732)+UP; GAZ BNSS 213 'Cognizance of offences by Court of Session'"
    },
    "194": {
      "new": "214",
      "old_title": "Additional and Assistant Sessions Judges to try cases made over to them",
      "new_title": "Additional Sessions Judges to try cases made over to them",
      "type": "direct",
      "source": "KER(line 734)+UP; GAZ BNSS 214 'Additional Sessions Judges to try cases made over to them'"
    },
    "195": {
      "new": "215",
      "old_title": "Prosecution for contempt of lawful authority of public servants, for offences against public justice and for offences relating to documents given in evidence",
      "new_title": "Prosecution for contempt of lawful authority of public servants, for offences against public justice and for offences relating to documents given in evidence",
      "type": "direct",
      "source": "KER(line 737)+UP; GAZ BNSS 215 'Prosecution for contempt of lawful authority of public servants, for offences against public justice and for offences relating to documents given in evidence'"
    },
    "195A": {
      "new": "216",
      "old_title": "Procedure for witnesses in case of threatening etc.",
      "new_title": "Procedure for witnesses in case of threatening, etc",
      "type": "direct",
      "source": "KER(line 744)+UP; GAZ BNSS 216 'Procedure for witnesses in case of threatening, etc'"
    },
    "196": {
      "new": "217",
      "old_title": "Prosecution for offences against the State and for criminal conspiracy to commit such offence",
      "new_title": "Prosecution for offences against State and for criminal conspiracy to commit such offence",
      "type": "direct",
      "source": "KER(line 749)+UP; GAZ BNSS 217 'Prosecution for offences against State and for criminal conspiracy to commit such offence'"
    },
    "197": {
      "new": "218",
      "old_title": "Prosecution of Judges and public servants",
      "new_title": "Prosecution of Judges and public servants",
      "type": "direct",
      "source": "KER(line 753)+UP; GAZ BNSS 218 'Prosecution of Judges and public servants'"
    },
    "198": {
      "new": "219",
      "old_title": "Prosecution for offences against marriage",
      "new_title": "Prosecution for offences against marriage",
      "type": "direct",
      "source": "KER(line 761)+UP; GAZ BNSS 219 'Prosecution for offences against marriage'"
    },
    "198A": {
      "new": "220",
      "old_title": "Prosecution of offences under section 498A of IPC",
      "new_title": "Prosecution of offences under section 85 of Bharatiya Nyaya Sanhita, 2023",
      "type": "direct",
      "source": "KER(line 765)+UP; GAZ BNSS 220 'Prosecution of offences under section 85 of Bharatiya Nyaya Sanhita, 2023'"
    },
    "198B": {
      "new": "221",
      "old_title": "Cognizance of offence",
      "new_title": "Cognizance of offence",
      "type": "direct",
      "source": "KER(line 769)+UP; GAZ BNSS 221 'Cognizance of offence'"
    },
    "199": {
      "new": "222",
      "old_title": "Prosecution for defamation",
      "new_title": "Prosecution for defamation",
      "type": "direct",
      "source": "KER(line 770)+UP; GAZ BNSS 222 'Prosecution for defamation'"
    },
    "200": {
      "new": "223",
      "old_title": "Examination of complainant",
      "new_title": "Examination of complainant",
      "type": "direct",
      "source": "KER(line 775)+UP; GAZ BNSS 223 'Examination of complainant'"
    },
    "201": {
      "new": "224",
      "old_title": "Procedure by Magistrate not competent to take cognizance of case",
      "new_title": "Procedure by Magistrate not competent to take cognizance of case",
      "type": "direct",
      "source": "KER(line 789)+UP; GAZ BNSS 224 'Procedure by Magistrate not competent to take cognizance of case'"
    },
    "202": {
      "new": "225",
      "old_title": "Postponement of issue of process",
      "new_title": "Postponement of issue of process",
      "type": "direct",
      "source": "KER(line 795)+UP; GAZ BNSS 225 'Postponement of issue of process'"
    },
    "203": {
      "new": "226",
      "old_title": "Dismissal of complaint",
      "new_title": "Dismissal of complaint",
      "type": "direct",
      "source": "KER(line 797)+UP; GAZ BNSS 226 'Dismissal of complaint'"
    },
    "204": {
      "new": "227",
      "old_title": "Issue of process",
      "new_title": "Issue of process",
      "type": "direct",
      "source": "KER(line 798)+UP; GAZ BNSS 227 'Issue of process'"
    },
    "205": {
      "new": "228",
      "old_title": "Magistrate may dispense with personal attendance of accused",
      "new_title": "Magistrate may dispense with personal attendance of accused",
      "type": "direct",
      "source": "KER(line 801)+UP; GAZ BNSS 228 'Magistrate may dispense with personal attendance of accused'"
    },
    "206": {
      "new": "229",
      "old_title": "Special summons in cases of petty offence",
      "new_title": "Special summons in cases of petty offence",
      "type": "direct",
      "source": "KER(line 804)+UP; GAZ BNSS 229 'Special summons in cases of petty offence'"
    },
    "207": {
      "new": "230",
      "old_title": "Supply to the accused of copy of police report and other documents",
      "new_title": "Supply to accused of copy of police report and other documents",
      "type": "direct",
      "source": "KER(line 814)+UP; GAZ BNSS 230 'Supply to accused of copy of police report and other documents'"
    },
    "208": {
      "new": "231",
      "old_title": "Supply of copies of statements and documents to accused in other cases triable by Court of Session",
      "new_title": "Supply of copies of statements and documents to accused in other cases triable by Court of Session",
      "type": "direct",
      "source": "KER(line 821)+UP; GAZ BNSS 231 'Supply of copies of statements and documents to accused in other cases triable by Court of Session'"
    },
    "209": {
      "new": "232",
      "old_title": "Commitment of case to Court of Session when offence is triable exclusively by it",
      "new_title": "Commitment of case to Court of Session when offence is triable exclusively by it",
      "type": "direct",
      "source": "KER(line 825)+UP; GAZ BNSS 232 'Commitment of case to Court of Session when offence is triable exclusively by it'"
    },
    "210": {
      "new": "233",
      "old_title": "Procedure to be followed when there is complaint case and police investigation in respect of the same offence",
      "new_title": "Procedure to be followed when there is a complaint case and police investigation in respect of same offence",
      "type": "direct",
      "source": "KER(line 841)+UP; GAZ BNSS 233 'Procedure to be followed when there is a complaint case and police investigation in respect of same offence'"
    },
    "211": {
      "new": "234",
      "old_title": "Contents of charge",
      "new_title": "Contents of charge",
      "type": "direct",
      "source": "KER(line 846)+UP; GAZ BNSS 234 'Contents of charge'"
    },
    "212": {
      "new": "235",
      "old_title": "Particulars as to time, place and person",
      "new_title": "Particulars as to time, place and person",
      "type": "direct",
      "source": "KER(line 847)+UP; GAZ BNSS 235 'Particulars as to time, place and person'"
    },
    "213": {
      "new": "236",
      "old_title": "When manner of committing offence must be stated",
      "new_title": "When manner of committing offence must be stated",
      "type": "direct",
      "source": "KER(line 849)+UP; GAZ BNSS 236 'When manner of committing offence must be stated'"
    },
    "214": {
      "new": "237",
      "old_title": "Words in charge taken in sense of law under which offence is punishable",
      "new_title": "Words in charge taken in sense of law under which offence is punishable",
      "type": "direct",
      "source": "KER(line 851)+UP; GAZ BNSS 237 'Words in charge taken in sense of law under which offence is punishable'"
    },
    "215": {
      "new": "238",
      "old_title": "Effect of errors",
      "new_title": "Effect of errors",
      "type": "direct",
      "source": "KER(line 854)+UP; GAZ BNSS 238 'Effect of errors'"
    },
    "216": {
      "new": "239",
      "old_title": "Court may alter charge",
      "new_title": "Court may alter charge",
      "type": "direct",
      "source": "KER(line 855)+UP; GAZ BNSS 239 'Court may alter charge'"
    },
    "217": {
      "new": "240",
      "old_title": "Recall of witnesses when charge altered",
      "new_title": "Recall of witnesses when charge altered",
      "type": "direct",
      "source": "KER(line 856)+UP; GAZ BNSS 240 'Recall of witnesses when charge altered'"
    },
    "218": {
      "new": "241",
      "old_title": "Separate charges for distinct offences",
      "new_title": "Separate charges for distinct offences",
      "type": "direct",
      "source": "KER(line 858)+UP; GAZ BNSS 241 'Separate charges for distinct offences'"
    },
    "219": {
      "new": "242",
      "old_title": "Three offences of same kind within year may be charged together",
      "new_title": "Offences of same kind within year may be charged together",
      "type": "direct",
      "source": "KER(line 860)+UP; GAZ BNSS 242 'Offences of same kind within year may be charged together'"
    },
    "220": {
      "new": "243",
      "old_title": "Trial for more than one offence",
      "new_title": "Trial for more than one offence",
      "type": "direct",
      "source": "KER(line 863)+UP; GAZ BNSS 243 'Trial for more than one offence'"
    },
    "221": {
      "new": "244",
      "old_title": "Where it is doubtful what offence has been committed",
      "new_title": "Where it is doubtful what offence has been committed",
      "type": "direct",
      "source": "KER(line 866)+UP; GAZ BNSS 244 'Where it is doubtful what offence has been committed'"
    },
    "222": {
      "new": "245",
      "old_title": "When offence proved included in offence charged",
      "new_title": "When offence proved included in offence charged",
      "type": "direct",
      "source": "KER(line 868)+UP; GAZ BNSS 245 'When offence proved included in offence charged'"
    },
    "223": {
      "new": "246",
      "old_title": "What persons may be charged jointly",
      "new_title": "What persons may be charged jointly",
      "type": "direct",
      "source": "KER(line 870)+UP; GAZ BNSS 246 'What persons may be charged jointly'"
    },
    "224": {
      "new": "247",
      "old_title": "Withdrawal of remaining charges on conviction on one of several charges",
      "new_title": "Withdrawal of remaining charges on conviction on one of several charges",
      "type": "direct",
      "source": "KER(line 872)+UP; GAZ BNSS 247 'Withdrawal of remaining charges on conviction on one of several charges'"
    },
    "225": {
      "new": "248",
      "old_title": "Trial to be conducted by Public Prosecutor",
      "new_title": "Trial to be conducted by Public Prosecutor",
      "type": "direct",
      "source": "KER(line 875)+UP; GAZ BNSS 248 'Trial to be conducted by Public Prosecutor'"
    },
    "226": {
      "new": "249",
      "old_title": "Opening case for prosecution",
      "new_title": "Opening case for prosecution",
      "type": "direct",
      "source": "KER(line 877)+UP; GAZ BNSS 249 'Opening case for prosecution'"
    },
    "227": {
      "new": "250",
      "old_title": "Discharge",
      "new_title": "Discharge",
      "type": "direct",
      "source": "KER(line 879)+UP; GAZ BNSS 250 'Discharge'"
    },
    "228": {
      "new": "251",
      "old_title": "Framing of charge",
      "new_title": "Framing of charge",
      "type": "direct",
      "source": "KER(line 885)+UP; GAZ BNSS 251 'Framing of charge'"
    },
    "229": {
      "new": "252",
      "old_title": "Conviction on plea of guilty",
      "new_title": "Conviction on plea of guilty",
      "type": "direct",
      "source": "KER(line 890)+UP; GAZ BNSS 252 'Conviction on plea of guilty'"
    },
    "230": {
      "new": "253",
      "old_title": "Date for prosecution evidence",
      "new_title": "Date for prosecution evidence",
      "type": "direct",
      "source": "KER(line 891)+UP; GAZ BNSS 253 'Date for prosecution evidence'"
    },
    "231": {
      "new": "254",
      "old_title": "Evidence for prosecution",
      "new_title": "Evidence for prosecution",
      "type": "direct",
      "source": "KER(line 893)+UP; GAZ BNSS 254 'Evidence for prosecution'"
    },
    "232": {
      "new": "255",
      "old_title": "Acquittal",
      "new_title": "Acquittal",
      "type": "direct",
      "source": "KER(line 899)+UP; GAZ BNSS 255 'Acquittal'"
    },
    "233": {
      "new": "256",
      "old_title": "Entering upon defence",
      "new_title": "Entering upon defence",
      "type": "direct",
      "source": "KER(line 900)+UP; GAZ BNSS 256 'Entering upon defence'"
    },
    "234": {
      "new": "257",
      "old_title": "Arguments",
      "new_title": "Arguments",
      "type": "direct",
      "source": "KER(line 901)+UP; GAZ BNSS 257 'Arguments'"
    },
    "235": {
      "new": "258",
      "old_title": "Judgment of acquittal or conviction",
      "new_title": "Judgment of acquittal or conviction",
      "type": "direct",
      "source": "KER(line 902)+UP; GAZ BNSS 258 'Judgment of acquittal or conviction'"
    },
    "236": {
      "new": "259",
      "old_title": "Previous conviction",
      "new_title": "Previous conviction",
      "type": "direct",
      "source": "KER(line 910)+UP; GAZ BNSS 259 'Previous conviction'"
    },
    "237": {
      "new": "260",
      "old_title": "Procedure in cases instituted under section 199(2)",
      "new_title": "Procedure in cases instituted under sub-section (2) of section 222",
      "type": "direct",
      "source": "KER(line 911)+UP; GAZ BNSS 260 'Procedure in cases instituted under sub-section (2) of section 222'"
    },
    "238": {
      "new": "261",
      "old_title": "Compliance with section 207",
      "new_title": "Compliance with section 230",
      "type": "direct",
      "source": "KER(line 914)+UP; GAZ BNSS 261 'Compliance with section 230'"
    },
    "239": {
      "new": "262",
      "old_title": "When accused shall be discharged",
      "new_title": "When accused shall be discharged",
      "type": "direct",
      "source": "KER(line 915)+UP; GAZ BNSS 262 'When accused shall be discharged'"
    },
    "240": {
      "new": "263",
      "old_title": "Framing of charge",
      "new_title": "Framing of charge",
      "type": "direct",
      "source": "KER(line 921)+UP; GAZ BNSS 263 'Framing of charge'"
    },
    "241": {
      "new": "264",
      "old_title": "Conviction on plea of guilty",
      "new_title": "Conviction on plea of guilty",
      "type": "direct",
      "source": "KER(line 924)+UP; GAZ BNSS 264 'Conviction on plea of guilty'"
    },
    "242": {
      "new": "265",
      "old_title": "Evidence for prosecution",
      "new_title": "Evidence for prosecution",
      "type": "direct",
      "source": "KER(line 925)+UP; GAZ BNSS 265 'Evidence for prosecution'"
    },
    "243": {
      "new": "266",
      "old_title": "Evidence for defence",
      "new_title": "Evidence for defence",
      "type": "direct",
      "source": "KER(line 933)+UP; GAZ BNSS 266 'Evidence for defence'"
    },
    "244": {
      "new": "267",
      "old_title": "Evidence for prosecution — complaint cases",
      "new_title": "Evidence for prosecution",
      "type": "direct",
      "source": "KER(line 937)+UP; GAZ BNSS 267 'Evidence for prosecution'"
    },
    "245": {
      "new": "268",
      "old_title": "When accused shall be discharged — complaint cases",
      "new_title": "When accused shall be discharged",
      "type": "direct",
      "source": "KER(line 938)+UP; GAZ BNSS 268 'When accused shall be discharged'"
    },
    "246": {
      "new": "269",
      "old_title": "Procedure where accused is not discharged",
      "new_title": "Procedure where accused is not discharged",
      "type": "direct",
      "source": "KER(line 940)+UP; GAZ BNSS 269 'Procedure where accused is not discharged'"
    },
    "247": {
      "new": "270",
      "old_title": "Evidence for defence",
      "new_title": "Evidence for defence",
      "type": "direct",
      "source": "KER(line 945)+UP; GAZ BNSS 270 'Evidence for defence'"
    },
    "248": {
      "new": "271",
      "old_title": "Acquittal or conviction",
      "new_title": "Acquittal or conviction",
      "type": "direct",
      "source": "KER(line 946)+UP; GAZ BNSS 271 'Acquittal or conviction'"
    },
    "249": {
      "new": "272",
      "old_title": "Absence of complainant",
      "new_title": "Absence of complainant",
      "type": "direct",
      "source": "KER(line 947)+UP; GAZ BNSS 272 'Absence of complainant'"
    },
    "250": {
      "new": "273",
      "old_title": "Compensation for accusation without reasonable cause",
      "new_title": "Compensation for accusation without reasonable cause",
      "type": "direct",
      "source": "KER(line 950)+UP; GAZ BNSS 273 'Compensation for accusation without reasonable cause'"
    },
    "251": {
      "new": "274",
      "old_title": "Substance of accusation to be stated",
      "new_title": "Substance of accusation to be stated",
      "type": "direct",
      "source": "KER(line 953)+UP; GAZ BNSS 274 'Substance of accusation to be stated'"
    },
    "252": {
      "new": "275",
      "old_title": "Conviction on plea of guilty",
      "new_title": "Conviction on plea of guilty",
      "type": "direct",
      "source": "KER(line 957)+UP; GAZ BNSS 275 'Conviction on plea of guilty'"
    },
    "253": {
      "new": "276",
      "old_title": "Conviction on plea of guilty in absence of accused in petty cases",
      "new_title": "Conviction on plea of guilty in absence of accused in petty cases",
      "type": "direct",
      "source": "KER(line 958)+UP; GAZ BNSS 276 'Conviction on plea of guilty in absence of accused in petty cases'"
    },
    "254": {
      "new": "277",
      "old_title": "Procedure when not convicted",
      "new_title": "Procedure when not convicted",
      "type": "direct",
      "source": "KER(line 961)+UP; GAZ BNSS 277 'Procedure when not convicted'"
    },
    "255": {
      "new": "278",
      "old_title": "Acquittal or conviction",
      "new_title": "Acquittal or conviction",
      "type": "direct",
      "source": "KER(line 963)+UP; GAZ BNSS 278 'Acquittal or conviction'"
    },
    "256": {
      "new": "279",
      "old_title": "Non-appearance or death of complainant",
      "new_title": "Non-appearance or death of complainant",
      "type": "direct",
      "source": "KER(line 964)+UP; GAZ BNSS 279 'Non-appearance or death of complainant'"
    },
    "257": {
      "new": "280",
      "old_title": "Withdrawal of complaint",
      "new_title": "Withdrawal of complaint",
      "type": "direct",
      "source": "KER(line 967)+UP; GAZ BNSS 280 'Withdrawal of complaint'"
    },
    "258": {
      "new": "281",
      "old_title": "Power to stop proceedings in certain cases",
      "new_title": "Power to stop proceedings in certain cases",
      "type": "direct",
      "source": "KER(line 968)+UP; GAZ BNSS 281 'Power to stop proceedings in certain cases'"
    },
    "259": {
      "new": "282",
      "old_title": "Power of Court to convert summons-cases into warrant-cases",
      "new_title": "Power of Court to convert summons-cases into warrant-cases",
      "type": "direct",
      "source": "KER(line 975)+UP; GAZ BNSS 282 'Power of Court to convert summons-cases into warrant-cases'"
    },
    "260": {
      "new": "283",
      "old_title": "Power to try summarily",
      "new_title": "Power to try summarily",
      "type": "direct",
      "source": "KER(line 978)+UP; GAZ BNSS 283 'Power to try summarily'"
    },
    "261": {
      "new": "284",
      "old_title": "Summary trial by Magistrate of second class",
      "new_title": "Summary trial by Magistrate of second class",
      "type": "direct",
      "source": "KER(line 984)+UP; GAZ BNSS 284 'Summary trial by Magistrate of second class'"
    },
    "262": {
      "new": "285",
      "old_title": "Procedure for summary trials",
      "new_title": "Procedure for summary trials",
      "type": "direct",
      "source": "KER(line 986)+UP; GAZ BNSS 285 'Procedure for summary trials'"
    },
    "263": {
      "new": "286",
      "old_title": "Record in summary trials",
      "new_title": "Record in summary trials",
      "type": "direct",
      "source": "KER(line 988)+UP; GAZ BNSS 286 'Record in summary trials'"
    },
    "264": {
      "new": "287",
      "old_title": "Judgment in cases tried summarily",
      "new_title": "Judgment in cases tried summarily",
      "type": "direct",
      "source": "KER(line 989)+UP; GAZ BNSS 287 'Judgment in cases tried summarily'"
    },
    "265": {
      "new": "288",
      "old_title": "Language of record and judgment",
      "new_title": "Language of record and judgment",
      "type": "direct",
      "source": "KER(line 991)+UP; GAZ BNSS 288 'Language of record and judgment'"
    },
    "265A": {
      "new": "289",
      "old_title": "Application of the Chapter — plea bargaining",
      "new_title": "Application of Chapter",
      "type": "direct",
      "source": "KER(line 993)+UP; GAZ BNSS 289 'Application of Chapter'"
    },
    "265B": {
      "new": "290",
      "old_title": "Application for plea bargaining",
      "new_title": "Application for plea bargaining",
      "type": "direct",
      "source": "KER(line 995)+UP; GAZ BNSS 290 'Application for plea bargaining'"
    },
    "265C": {
      "new": "291",
      "old_title": "Guidelines for mutually satisfactory disposition",
      "new_title": "Guidelines for mutually satisfactory disposition",
      "type": "direct",
      "source": "KER(line 1001)+UP; GAZ BNSS 291 'Guidelines for mutually satisfactory disposition'"
    },
    "265D": {
      "new": "292",
      "old_title": "Report of the mutually satisfactory disposition",
      "new_title": "Report of mutually satisfactory disposition to be submitted before Court",
      "type": "direct",
      "source": "KER(line 1003)+UP; GAZ BNSS 292 'Report of mutually satisfactory disposition to be submitted before Court'"
    },
    "265E": {
      "new": "293",
      "old_title": "Disposal of the case",
      "new_title": "Disposal of case",
      "type": "direct",
      "source": "KER(line 1006)+UP; GAZ BNSS 293 'Disposal of case'"
    },
    "265F": {
      "new": "294",
      "old_title": "Judgment of the Court",
      "new_title": "Judgment of Court",
      "type": "direct",
      "source": "KER(line 1011)+UP; GAZ BNSS 294 'Judgment of Court'"
    },
    "265G": {
      "new": "295",
      "old_title": "Finality of the judgment",
      "new_title": "Finality of judgment",
      "type": "direct",
      "source": "KER(line 1012)+UP; GAZ BNSS 295 'Finality of judgment'"
    },
    "265H": {
      "new": "296",
      "old_title": "Power of the Court in plea bargaining",
      "new_title": "Power of Court in plea bargaining",
      "type": "direct",
      "source": "KER(line 1013)+UP; GAZ BNSS 296 'Power of Court in plea bargaining'"
    },
    "265I": {
      "new": "297",
      "old_title": "Period of detention undergone by the accused to be set off",
      "new_title": "Period of detention undergone by accused to be set off against sentence of imprisonment",
      "type": "direct",
      "source": "KER(line 1020)+UP; GAZ BNSS 297 'Period of detention undergone by accused to be set off against sentence of imprisonment'"
    },
    "265J": {
      "new": "298",
      "old_title": "Savings",
      "new_title": "Savings",
      "type": "direct",
      "source": "KER(line 1024)+UP; GAZ BNSS 298 'Savings'"
    },
    "265K": {
      "new": "299",
      "old_title": "Statements of accused not to be used",
      "new_title": "Statements of accused not to be used",
      "type": "direct",
      "source": "KER(line 1025)+UP; GAZ BNSS 299 'Statements of accused not to be used'"
    },
    "265L": {
      "new": "300",
      "old_title": "Non-application of the Chapter",
      "new_title": "Non-application of Chapter",
      "type": "direct",
      "source": "KER(line 1027)+UP; GAZ BNSS 300 'Non-application of Chapter'"
    },
    "266": {
      "new": "301",
      "old_title": "Definitions for Chapter — attendance of prisoners",
      "new_title": "Definitions",
      "type": "direct",
      "source": "KER(line 1029)+UP; GAZ BNSS 301 'Definitions'"
    },
    "267": {
      "new": "302",
      "old_title": "Power to require attendance of prisoners",
      "new_title": "Power to require attendance of prisoners",
      "type": "direct",
      "source": "KER(line 1030)+UP; GAZ BNSS 302 'Power to require attendance of prisoners'"
    },
    "268": {
      "new": "303",
      "old_title": "Power of State Government to exclude certain persons from operation of section 267",
      "new_title": "Power of State Government or Central Government to exclude certain persons from operation of section 302",
      "type": "direct",
      "source": "KER(line 1032)+UP; GAZ BNSS 303 'Power of State Government or Central Government to exclude certain persons from operation of section 302'"
    },
    "269": {
      "new": "304",
      "old_title": "Officer in charge of prison to abstain from carrying out order in certain contingencies",
      "new_title": "Officer in charge of prison to abstain from carrying out order in certain contingencies",
      "type": "direct",
      "source": "KER(line 1036)+UP; GAZ BNSS 304 'Officer in charge of prison to abstain from carrying out order in certain contingencies'"
    },
    "270": {
      "new": "305",
      "old_title": "Prisoner to be brought to court in custody",
      "new_title": "Prisoner to be brought to Court in custody",
      "type": "direct",
      "source": "KER(line 1040)+UP; GAZ BNSS 305 'Prisoner to be brought to Court in custody'"
    },
    "271": {
      "new": "306",
      "old_title": "Power to issue commission for examination of witness in prison",
      "new_title": "Power to issue commission for examination of witness in prison",
      "type": "direct",
      "source": "KER(line 1042)+UP; GAZ BNSS 306 'Power to issue commission for examination of witness in prison'"
    },
    "272": {
      "new": "307",
      "old_title": "Language of Courts",
      "new_title": "Language of Courts",
      "type": "direct",
      "source": "KER(line 1045)+UP; GAZ BNSS 307 'Language of Courts'"
    },
    "273": {
      "new": "308",
      "old_title": "Evidence to be taken in presence of accused",
      "new_title": "Evidence to be taken in presence of accused",
      "type": "direct",
      "source": "KER(line 1046)+UP; GAZ BNSS 308 'Evidence to be taken in presence of accused'"
    },
    "274": {
      "new": "309",
      "old_title": "Record in summons-cases and inquiries",
      "new_title": "Record in summons-cases and inquiries",
      "type": "direct",
      "source": "KER(line 1049)+UP; GAZ BNSS 309 'Record in summons-cases and inquiries'"
    },
    "275": {
      "new": "310",
      "old_title": "Record in warrant cases",
      "new_title": "Record in warrant-cases",
      "type": "direct",
      "source": "KER(line 1051)+UP; GAZ BNSS 310 'Record in warrant-cases'"
    },
    "276": {
      "new": "311",
      "old_title": "Record in trial before Court of Session",
      "new_title": "Record in trial before Court of Session",
      "type": "direct",
      "source": "KER(line 1052)+UP; GAZ BNSS 311 'Record in trial before Court of Session'"
    },
    "277": {
      "new": "312",
      "old_title": "Language of record of evidence",
      "new_title": "Language of record of evidence",
      "type": "direct",
      "source": "KER(line 1054)+UP; GAZ BNSS 312 'Language of record of evidence'"
    },
    "278": {
      "new": "313",
      "old_title": "Procedure in regard to such evidence when completed",
      "new_title": "Procedure in regard to such evidence when completed",
      "type": "direct",
      "source": "KER(line 1056)+UP; GAZ BNSS 313 'Procedure in regard to such evidence when completed'"
    },
    "279": {
      "new": "314",
      "old_title": "Interpretation of evidence to accused or his pleader",
      "new_title": "Interpretation of evidence to accused or his advocate",
      "type": "direct",
      "source": "KER(line 1058)+UP; GAZ BNSS 314 'Interpretation of evidence to accused or his advocate'"
    },
    "280": {
      "new": "315",
      "old_title": "Remarks respecting demeanour of witness",
      "new_title": "Remarks respecting demeanour of witness",
      "type": "direct",
      "source": "KER(line 1060)+UP; GAZ BNSS 315 'Remarks respecting demeanour of witness'"
    },
    "281": {
      "new": "316",
      "old_title": "Record of examination of accused",
      "new_title": "Record of examination of accused",
      "type": "direct",
      "source": "KER(line 1064)+UP; GAZ BNSS 316 'Record of examination of accused'"
    },
    "282": {
      "new": "317",
      "old_title": "Interpreter to be bound to interpret truthfully",
      "new_title": "Interpreter to be bound to interpret truthfully",
      "type": "direct",
      "source": "KER(line 1071)+UP; GAZ BNSS 317 'Interpreter to be bound to interpret truthfully'"
    },
    "283": {
      "new": "318",
      "old_title": "Record in High Court",
      "new_title": "Record in High Court",
      "type": "direct",
      "source": "KER(line 1073)+UP; GAZ BNSS 318 'Record in High Court'"
    },
    "284": {
      "new": "319",
      "old_title": "When attendance of witness may be dispensed with and commission issued",
      "new_title": "When attendance of witness may be dispensed with and commission issued",
      "type": "direct",
      "source": "KER(line 1074)+UP; GAZ BNSS 319 'When attendance of witness may be dispensed with and commission issued'"
    },
    "285": {
      "new": "320",
      "old_title": "Commission to whom to be issued",
      "new_title": "Commission to whom to be issued",
      "type": "direct",
      "source": "KER(line 1077)+UP; GAZ BNSS 320 'Commission to whom to be issued'"
    },
    "286": {
      "new": "321",
      "old_title": "Execution of commissions",
      "new_title": "Execution of commissions",
      "type": "direct",
      "source": "KER(line 1079)+UP; GAZ BNSS 321 'Execution of commissions'"
    },
    "287": {
      "new": "322",
      "old_title": "Parties may examine witnesses",
      "new_title": "Parties may examine witnesses",
      "type": "direct",
      "source": "KER(line 1082)+UP; GAZ BNSS 322 'Parties may examine witnesses'"
    },
    "288": {
      "new": "323",
      "old_title": "Return of commission",
      "new_title": "Return of commission",
      "type": "direct",
      "source": "KER(line 1084)+UP; GAZ BNSS 323 'Return of commission'"
    },
    "289": {
      "new": "324",
      "old_title": "Adjournment of proceeding",
      "new_title": "Adjournment of proceeding",
      "type": "direct",
      "source": "KER(line 1086)+UP; GAZ BNSS 324 'Adjournment of proceeding'"
    },
    "290": {
      "new": "325",
      "old_title": "Execution of foreign commissions",
      "new_title": "Execution of foreign commissions",
      "type": "direct",
      "source": "KER(line 1087)+UP; GAZ BNSS 325 'Execution of foreign commissions'"
    },
    "291": {
      "new": "326",
      "old_title": "Deposition of medical witness",
      "new_title": "Deposition of medical witness",
      "type": "direct",
      "source": "KER(line 1089)+UP; GAZ BNSS 326 'Deposition of medical witness'"
    },
    "291A": {
      "new": "327",
      "old_title": "Identification report of Magistrate",
      "new_title": "Identification report of Magistrate",
      "type": "direct",
      "source": "KER(line 1091)+UP; GAZ BNSS 327 'Identification report of Magistrate'"
    },
    "292": {
      "new": "328",
      "old_title": "Evidence of officers of Mint",
      "new_title": "Evidence of officers of Mint",
      "type": "direct",
      "source": "KER(line 1093)+UP; GAZ BNSS 328 'Evidence of officers of Mint'"
    },
    "293": {
      "new": "329",
      "old_title": "Reports of certain Government scientific experts",
      "new_title": "Reports of certain Government scientific experts",
      "type": "direct",
      "source": "KER(line 1096)+UP; GAZ BNSS 329 'Reports of certain Government scientific experts'"
    },
    "294": {
      "new": "330",
      "old_title": "No formal proof of certain documents",
      "new_title": "No formal proof of certain documents",
      "type": "direct",
      "source": "KER(line 1099)+UP; GAZ BNSS 330 'No formal proof of certain documents'"
    },
    "295": {
      "new": "331",
      "old_title": "Affidavit in proof of conduct of public servants",
      "new_title": "Affidavit in proof of conduct of public servants",
      "type": "direct",
      "source": "KER(line 1110)+UP; GAZ BNSS 331 'Affidavit in proof of conduct of public servants'"
    },
    "296": {
      "new": "332",
      "old_title": "Evidence of formal character on affidavit",
      "new_title": "Evidence of formal character on affidavit",
      "type": "direct",
      "source": "KER(line 1112)+UP; GAZ BNSS 332 'Evidence of formal character on affidavit'"
    },
    "297": {
      "new": "333",
      "old_title": "Authorities before whom affidavits may be sworn",
      "new_title": "Authorities before whom affidavits may be sworn",
      "type": "direct",
      "source": "KER(line 1114)+UP; GAZ BNSS 333 'Authorities before whom affidavits may be sworn'"
    },
    "298": {
      "new": "334",
      "old_title": "Previous conviction or acquittal how proved",
      "new_title": "Previous conviction or acquittal how proved",
      "type": "direct",
      "source": "KER(line 1116)+UP; GAZ BNSS 334 'Previous conviction or acquittal how proved'"
    },
    "299": {
      "new": "335",
      "old_title": "Record of evidence in absence of accused",
      "new_title": "Record of evidence in absence of accused",
      "type": "direct",
      "source": "KER(line 1118)+UP; GAZ BNSS 335 'Record of evidence in absence of accused'"
    },
    "300": {
      "new": "337",
      "old_title": "Person once convicted or acquitted not to be tried for same offence",
      "new_title": "Person once convicted or acquitted not to be tried for same offence",
      "type": "direct",
      "source": "KER(line 1124)+UP; GAZ BNSS 337 'Person once convicted or acquitted not to be tried for same offence'"
    },
    "301": {
      "new": "338",
      "old_title": "Appearance by Public Prosecutors",
      "new_title": "Appearance by Public Prosecutors",
      "type": "direct",
      "source": "KER(line 1127)+UP; GAZ BNSS 338 'Appearance by Public Prosecutors'"
    },
    "302": {
      "new": "339",
      "old_title": "Permission to conduct prosecution",
      "new_title": "Permission to conduct prosecution",
      "type": "direct",
      "source": "KER(line 1129)+UP; GAZ BNSS 339 'Permission to conduct prosecution'"
    },
    "303": {
      "new": "340",
      "old_title": "Right of person against whom proceedings are instituted to be defended",
      "new_title": "Right of person against whom proceedings are instituted to be defended",
      "type": "direct",
      "source": "KER(line 1131)+UP; GAZ BNSS 340 'Right of person against whom proceedings are instituted to be defended'"
    },
    "304": {
      "new": "341",
      "old_title": "Legal aid to accused at State expense in certain cases",
      "new_title": "Legal aid to accused at State expense in certain cases",
      "type": "direct",
      "source": "KER(line 1134)+UP; GAZ BNSS 341 'Legal aid to accused at State expense in certain cases'"
    },
    "305": {
      "new": "342",
      "old_title": "Procedure when corporation or registered society is an accused",
      "new_title": "Procedure when corporation or registered society is an accused",
      "type": "direct",
      "source": "KER(line 1136)+UP; GAZ BNSS 342 'Procedure when corporation or registered society is an accused'"
    },
    "306": {
      "new": "343",
      "old_title": "Tender of pardon to accomplice",
      "new_title": "Tender of pardon to accomplice",
      "type": "direct",
      "source": "KER(line 1139)+UP; GAZ BNSS 343 'Tender of pardon to accomplice'"
    },
    "307": {
      "new": "344",
      "old_title": "Power to direct tender of pardon",
      "new_title": "Power to direct tender of pardon",
      "type": "direct",
      "source": "KER(line 1142)+UP; GAZ BNSS 344 'Power to direct tender of pardon'"
    },
    "308": {
      "new": "345",
      "old_title": "Trial of person not complying with conditions of pardon",
      "new_title": "Trial of person not complying with conditions of pardon",
      "type": "direct",
      "source": "KER(line 1144)+UP; GAZ BNSS 345 'Trial of person not complying with conditions of pardon'"
    },
    "309": {
      "new": "346",
      "old_title": "Power to postpone or adjourn proceedings",
      "new_title": "Power to postpone or adjourn proceedings",
      "type": "direct",
      "source": "KER(line 1147)+UP; GAZ BNSS 346 'Power to postpone or adjourn proceedings'"
    },
    "310": {
      "new": "347",
      "old_title": "Local inspection",
      "new_title": "Local inspection",
      "type": "direct",
      "source": "KER(line 1160)+UP; GAZ BNSS 347 'Local inspection'"
    },
    "311": {
      "new": "348",
      "old_title": "Power to summon material witness, or examine person present",
      "new_title": "Power to summon material witness, or examine person present",
      "type": "direct",
      "source": "KER(line 1161)+UP; GAZ BNSS 348 'Power to summon material witness, or examine person present'"
    },
    "311A": {
      "new": "349",
      "old_title": "Power of Magistrate to order person to give specimen signatures or handwriting",
      "new_title": "Power of Magistrate to order person to give specimen signatures or handwriting, etc",
      "type": "direct",
      "source": "KER(line 1164)+UP; GAZ BNSS 349 'Power of Magistrate to order person to give specimen signatures or handwriting, etc'"
    },
    "312": {
      "new": "350",
      "old_title": "Expenses of complainants and witnesses",
      "new_title": "Expenses of complainants and witnesses",
      "type": "direct",
      "source": "KER(line 1169)+UP; GAZ BNSS 350 'Expenses of complainants and witnesses'"
    },
    "313": {
      "new": "351",
      "old_title": "Power to examine the accused",
      "new_title": "Power to examine accused",
      "type": "direct",
      "source": "KER(line 1171)+UP; GAZ BNSS 351 'Power to examine accused'"
    },
    "314": {
      "new": "352",
      "old_title": "Oral arguments and memorandum of arguments",
      "new_title": "Oral arguments and memorandum of arguments",
      "type": "direct",
      "source": "KER(line 1173)+UP; GAZ BNSS 352 'Oral arguments and memorandum of arguments'"
    },
    "315": {
      "new": "353",
      "old_title": "Accused person to be competent witness",
      "new_title": "Accused person to be competent witness",
      "type": "direct",
      "source": "KER(line 1175)+UP; GAZ BNSS 353 'Accused person to be competent witness'"
    },
    "316": {
      "new": "354",
      "old_title": "No influence to be used to induce disclosure",
      "new_title": "No influence to be used to induce disclosure",
      "type": "direct",
      "source": "KER(line 1177)+UP; GAZ BNSS 354 'No influence to be used to induce disclosure'"
    },
    "317": {
      "new": "355",
      "old_title": "Provision for inquiries and trial being held in absence of accused in certain cases",
      "new_title": "Provision for inquiries and trial being held in absence of accused in certain cases",
      "type": "direct",
      "source": "KER(line 1179)+UP; GAZ BNSS 355 'Provision for inquiries and trial being held in absence of accused in certain cases'"
    },
    "318": {
      "new": "357",
      "old_title": "Procedure where accused does not understand proceedings",
      "new_title": "Procedure where accused does not understand proceedings",
      "type": "direct",
      "note": "BNSS 356 substantially expands to permit trial in absentia of proclaimed offenders",
      "source": "KER(line 1186)+UP; GAZ BNSS 357 'Procedure where accused does not understand proceedings'"
    },
    "319": {
      "new": "358",
      "old_title": "Power to proceed against other persons appearing to be guilty of offence",
      "new_title": "Power to proceed against other persons appearing to be guilty of offence",
      "type": "direct",
      "source": "KER(line 1189)+UP; GAZ BNSS 358 'Power to proceed against other persons appearing to be guilty of offence'"
    },
    "320": {
      "new": "359",
      "old_title": "Compounding of offences",
      "new_title": "Compounding of offences",
      "type": "direct",
      "source": "KER(line 1192)+UP; GAZ BNSS 359 'Compounding of offences'"
    },
    "321": {
      "new": "360",
      "old_title": "Withdrawal from prosecution",
      "new_title": "Withdrawal from prosecution",
      "type": "direct",
      "source": "KER(line 1198)+UP; GAZ BNSS 360 'Withdrawal from prosecution'"
    },
    "322": {
      "new": "361",
      "old_title": "Procedure in cases which Magistrate cannot dispose of",
      "new_title": "Procedure in cases which Magistrate cannot dispose of",
      "type": "direct",
      "source": "KER(line 1204)+UP; GAZ BNSS 361 'Procedure in cases which Magistrate cannot dispose of'"
    },
    "323": {
      "new": "362",
      "old_title": "Procedure when, after commencement of inquiry or trial, Magistrate finds case should be committed",
      "new_title": "Procedure when after commencement of inquiry or trial, Magistrate finds case should be committed",
      "type": "direct",
      "source": "KER(line 1206)+UP; GAZ BNSS 362 'Procedure when after commencement of inquiry or trial, Magistrate finds case should be committed'"
    },
    "324": {
      "new": "363",
      "old_title": "Trial of persons previously convicted of offences against coinage, stamp law or property",
      "new_title": "Trial of persons previously convicted of offences against coinage, stamp-law or property",
      "type": "direct",
      "source": "KER(line 1210)+UP; GAZ BNSS 363 'Trial of persons previously convicted of offences against coinage, stamp-law or property'"
    },
    "325": {
      "new": "364",
      "old_title": "Procedure when Magistrate cannot pass sentence sufficiently severe",
      "new_title": "Procedure when Magistrate cannot pass sentence sufficiently severe",
      "type": "direct",
      "source": "KER(line 1214)+UP; GAZ BNSS 364 'Procedure when Magistrate cannot pass sentence sufficiently severe'"
    },
    "326": {
      "new": "365",
      "old_title": "Conviction or commitment on evidence partly recorded by one Magistrate and partly by another",
      "new_title": "Conviction or commitment on evidence partly recorded by one Magistrate and partly by another",
      "type": "direct",
      "source": "KER(line 1217)+UP; GAZ BNSS 365 'Conviction or commitment on evidence partly recorded by one Magistrate and partly by another'"
    },
    "327": {
      "new": "366",
      "old_title": "Court to be open",
      "new_title": "Court to be open",
      "type": "direct",
      "source": "KER(line 1221)+UP; GAZ BNSS 366 'Court to be open'"
    },
    "328": {
      "new": "367",
      "old_title": "Procedure in case of accused being lunatic",
      "new_title": "Procedure in case of accused being person of unsound mind",
      "type": "direct",
      "source": "KER(line 1222)+UP; GAZ BNSS 367 'Procedure in case of accused being person of unsound mind'"
    },
    "329": {
      "new": "368",
      "old_title": "Procedure in case of person of unsound mind tried before Court",
      "new_title": "Procedure in case of person of unsound mind tried before Court",
      "type": "direct",
      "source": "KER(line 1226)+UP; GAZ BNSS 368 'Procedure in case of person of unsound mind tried before Court'"
    },
    "330": {
      "new": "369",
      "old_title": "Release of person of unsound mind pending investigation or trial",
      "new_title": "Release of person of unsound mind pending investigation or trial",
      "type": "direct",
      "source": "KER(line 1229)+UP; GAZ BNSS 369 'Release of person of unsound mind pending investigation or trial'"
    },
    "331": {
      "new": "370",
      "old_title": "Resumption of inquiry or trial",
      "new_title": "Resumption of inquiry or trial",
      "type": "direct",
      "source": "KER(line 1232)+UP; GAZ BNSS 370 'Resumption of inquiry or trial'"
    },
    "332": {
      "new": "371",
      "old_title": "Procedure on accused appearing before Magistrate or Court",
      "new_title": "Procedure on accused appearing before Magistrate or Court",
      "type": "direct",
      "source": "KER(line 1234)+UP; GAZ BNSS 371 'Procedure on accused appearing before Magistrate or Court'"
    },
    "333": {
      "new": "372",
      "old_title": "When accused appears to have been of sound mind",
      "new_title": "When accused appears to have been of sound mind",
      "type": "direct",
      "source": "KER(line 1237)+UP; GAZ BNSS 372 'When accused appears to have been of sound mind'"
    },
    "334": {
      "new": "373",
      "old_title": "Judgment of acquittal on ground of unsoundness of mind",
      "new_title": "Judgment of acquittal on ground of unsoundness of mind",
      "type": "direct",
      "source": "KER(line 1243)+UP; GAZ BNSS 373 'Judgment of acquittal on ground of unsoundness of mind'"
    },
    "335": {
      "new": "374",
      "old_title": "Person acquitted on such ground to be detained in safe custody",
      "new_title": "Person acquitted on ground of unsoundness of mind to be detained in safe custody",
      "type": "direct",
      "source": "KER(line 1246)+UP; GAZ BNSS 374 'Person acquitted on ground of unsoundness of mind to be detained in safe custody'"
    },
    "336": {
      "new": "375",
      "old_title": "Power of State Government to empower officer in charge to discharge",
      "new_title": "Power of State Government to empower officer in charge to discharge",
      "type": "direct",
      "source": "KER(line 1249)+UP; GAZ BNSS 375 'Power of State Government to empower officer in charge to discharge'"
    },
    "337": {
      "new": "376",
      "old_title": "Procedure where lunatic prisoner is reported capable of making his defence",
      "new_title": "Procedure where prisoner of unsound mind is reported capable of making his defence",
      "type": "direct",
      "source": "KER(line 1252)+UP; GAZ BNSS 376 'Procedure where prisoner of unsound mind is reported capable of making his defence'"
    },
    "338": {
      "new": "377",
      "old_title": "Procedure where lunatic detained as fit to be released",
      "new_title": "Procedure where person of unsound mind detained is declared fit to be released",
      "type": "direct",
      "source": "KER(line 1257)+UP; GAZ BNSS 377 'Procedure where person of unsound mind detained is declared fit to be released'"
    },
    "339": {
      "new": "378",
      "old_title": "Delivery of lunatic to care of relative or friend",
      "new_title": "Delivery of person of unsound mind to care of relative or friend",
      "type": "direct",
      "source": "KER(line 1260)+UP; GAZ BNSS 378 'Delivery of person of unsound mind to care of relative or friend'"
    },
    "340": {
      "new": "379",
      "old_title": "Procedure in cases mentioned in section 195",
      "new_title": "Procedure in cases mentioned in section 215",
      "type": "direct",
      "source": "KER(line 1263)+UP; GAZ BNSS 379 'Procedure in cases mentioned in section 215'"
    },
    "341": {
      "new": "380",
      "old_title": "Appeal",
      "new_title": "Appeal",
      "type": "direct",
      "source": "KER(line 1265)+UP; GAZ BNSS 380 'Appeal'"
    },
    "342": {
      "new": "381",
      "old_title": "Power to order costs",
      "new_title": "Power to order costs",
      "type": "direct",
      "source": "KER(line 1266)+UP; GAZ BNSS 381 'Power to order costs'"
    },
    "343": {
      "new": "382",
      "old_title": "Procedure of Magistrate taking cognizance",
      "new_title": "Procedure of Magistrate taking cognizance",
      "type": "direct",
      "source": "KER(line 1267)+UP; GAZ BNSS 382 'Procedure of Magistrate taking cognizance'"
    },
    "344": {
      "new": "383",
      "old_title": "Summary procedure for trial for giving false evidence",
      "new_title": "Summary procedure for trial for giving false evidence",
      "type": "direct",
      "source": "KER(line 1269)+UP; GAZ BNSS 383 'Summary procedure for trial for giving false evidence'"
    },
    "345": {
      "new": "384",
      "old_title": "Procedure in certain cases of contempt",
      "new_title": "Procedure in certain cases of contempt",
      "type": "direct",
      "source": "KER(line 1271)+UP; GAZ BNSS 384 'Procedure in certain cases of contempt'"
    },
    "346": {
      "new": "385",
      "old_title": "Procedure where Court considers that case should not be dealt with under section 345",
      "new_title": "Procedure where Court considers that case should not be dealt with under section 384",
      "type": "direct",
      "source": "KER(line 1273)+UP; GAZ BNSS 385 'Procedure where Court considers that case should not be dealt with under section 384'"
    },
    "347": {
      "new": "386",
      "old_title": "When Registrar or Sub-Registrar to be deemed a Civil Court",
      "new_title": "When Registrar or Sub-Registrar to be deemed a Civil Court",
      "type": "direct",
      "source": "KER(line 1277)+UP; GAZ BNSS 386 'When Registrar or Sub-Registrar to be deemed a Civil Court'"
    },
    "348": {
      "new": "387",
      "old_title": "Discharge of offender on submission of apology",
      "new_title": "Discharge of offender on submission of apology",
      "type": "direct",
      "source": "KER(line 1280)+UP; GAZ BNSS 387 'Discharge of offender on submission of apology'"
    },
    "349": {
      "new": "388",
      "old_title": "Imprisonment or committal of person refusing to answer or produce document",
      "new_title": "Imprisonment or committal of person refusing to answer or produce document",
      "type": "direct",
      "source": "KER(line 1282)+UP; GAZ BNSS 388 'Imprisonment or committal of person refusing to answer or produce document'"
    },
    "350": {
      "new": "389",
      "old_title": "Summary procedure for punishment for non-attendance by witness in obedience to summons",
      "new_title": "Summary procedure for punishment for non-attendance by a witness in obedience to summons",
      "type": "direct",
      "source": "KER(line 1287)+UP; GAZ BNSS 389 'Summary procedure for punishment for non-attendance by a witness in obedience to summons'"
    },
    "351": {
      "new": "390",
      "old_title": "Appeals from convictions under sections 344, 345, 349 and 350",
      "new_title": "Appeals from convictions under sections 383, 384, 388 and 389",
      "type": "direct",
      "source": "KER(line 1291)+UP; GAZ BNSS 390 'Appeals from convictions under sections 383, 384, 388 and 389'"
    },
    "352": {
      "new": "391",
      "old_title": "Certain Judges and Magistrates not to try certain offences when committed before themselves",
      "new_title": "Certain Judges and Magistrates not to try certain offences when committed before themselves",
      "type": "direct",
      "source": "KER(line 1294)+UP; GAZ BNSS 391 'Certain Judges and Magistrates not to try certain offences when committed before themselves'"
    },
    "353": {
      "new": "392",
      "old_title": "Judgment",
      "new_title": "Judgment",
      "type": "direct",
      "source": "KER(line 1298)+UP; GAZ BNSS 392 'Judgment'"
    },
    "354": {
      "new": "393",
      "old_title": "Language and contents of judgment",
      "new_title": "Language and contents of judgment",
      "type": "direct",
      "source": "KER(line 1305)+UP; GAZ BNSS 393 'Language and contents of judgment'"
    },
    "355": {
      "new": null,
      "old_title": "Metropolitan Magistrate's judgment",
      "new_title": null,
      "type": "repealed",
      "note": "Deleted in BNSS (UP Police correspondence table: Deleted; no BNSS section)",
      "source": "UP+KER(absence)+GAZ(no heading)"
    },
    "356": {
      "new": "394",
      "old_title": "Order for notifying address of previously convicted offender",
      "new_title": "Order for notifying address of previously convicted offender",
      "type": "direct",
      "source": "KER(line 1307)+UP; GAZ BNSS 394 'Order for notifying address of previously convicted offender'"
    },
    "357": {
      "new": "395",
      "old_title": "Order to pay compensation",
      "new_title": "Order to pay compensation",
      "type": "direct",
      "source": "KER(line 1310)+UP; GAZ BNSS 395 'Order to pay compensation'"
    },
    "357A": {
      "new": "396",
      "old_title": "Victim compensation scheme",
      "new_title": "Victim compensation scheme",
      "type": "direct",
      "source": "KER(line 1311)+UP; GAZ BNSS 396 'Victim compensation scheme'"
    },
    "357B": {
      "new": "396(7)",
      "old_title": "Compensation to be in addition to fine under section 326A or section 376D of IPC",
      "new_title": "Victim compensation scheme",
      "type": "direct",
      "source": "KER(line 1311)+UP; GAZ BNSS 396 'Victim compensation scheme'; BNSS 396(7) text read: compensation in addition to fine (CrPC 357B)"
    },
    "357C": {
      "new": "397",
      "old_title": "Treatment of victims",
      "new_title": "Treatment of victims",
      "type": "merged",
      "note": "Subsumed in BNSS 397 victim treatment framework",
      "source": "KER(line 1321)+UP; GAZ BNSS 397 'Treatment of victims'"
    },
    "358": {
      "new": "399",
      "old_title": "Compensation to persons groundlessly arrested",
      "new_title": "Compensation to persons groundlessly arrested",
      "type": "direct",
      "source": "KER(line 1327)+UP; GAZ BNSS 399 'Compensation to persons groundlessly arrested'"
    },
    "359": {
      "new": "400",
      "old_title": "Order to pay costs in non-cognizable cases",
      "new_title": "Order to pay costs in non-cognizable cases",
      "type": "direct",
      "source": "KER(line 1329)+UP; GAZ BNSS 400 'Order to pay costs in non-cognizable cases'"
    },
    "360": {
      "new": "401",
      "old_title": "Order to release on probation of good conduct or after admonition",
      "new_title": "Order to release on probation of good conduct or after admonition",
      "type": "direct",
      "source": "KER(line 1332)+UP; GAZ BNSS 401 'Order to release on probation of good conduct or after admonition'"
    },
    "361": {
      "new": "402",
      "old_title": "Special reasons to be recorded in certain cases",
      "new_title": "Special reasons to be recorded in certain cases",
      "type": "direct",
      "source": "KER(line 1336)+UP; GAZ BNSS 402 'Special reasons to be recorded in certain cases'"
    },
    "362": {
      "new": "403",
      "old_title": "Court not to alter judgment",
      "new_title": "Court not to alter judgment",
      "type": "direct",
      "source": "KER(line 1339)+UP; GAZ BNSS 403 'Court not to alter judgment'"
    },
    "363": {
      "new": "404",
      "old_title": "Copy of judgment to be given to the accused",
      "new_title": "Copy of judgment to be given to accused and other persons",
      "type": "direct",
      "source": "KER(line 1340)+UP; GAZ BNSS 404 'Copy of judgment to be given to accused and other persons'"
    },
    "364": {
      "new": "405",
      "old_title": "Judgment when to be translated",
      "new_title": "Judgment when to be translated",
      "type": "direct",
      "source": "KER(line 1345)+UP; GAZ BNSS 405 'Judgment when to be translated'"
    },
    "365": {
      "new": "406",
      "old_title": "Court of Session to send copy of finding and sentence to District Magistrate",
      "new_title": "Court of Session to send copy of finding and sentence to District Magistrate",
      "type": "direct",
      "source": "KER(line 1347)+UP; GAZ BNSS 406 'Court of Session to send copy of finding and sentence to District Magistrate'"
    },
    "366": {
      "new": "407",
      "old_title": "Sentence of death to be submitted to High Court for confirmation",
      "new_title": "Sentence of death to be submitted by Court of Session for confirmation",
      "type": "direct",
      "source": "KER(line 1350)+UP; GAZ BNSS 407 'Sentence of death to be submitted by Court of Session for confirmation'"
    },
    "367": {
      "new": "408",
      "old_title": "Power to direct further inquiry or additional evidence",
      "new_title": "Power to direct further inquiry to be made or additional evidence to be taken",
      "type": "direct",
      "source": "KER(line 1353)+UP; GAZ BNSS 408 'Power to direct further inquiry to be made or additional evidence to be taken'"
    },
    "368": {
      "new": "409",
      "old_title": "Power of High Court to confirm sentence or annul conviction",
      "new_title": "Power of High Court to confirm sentence or annul conviction",
      "type": "direct",
      "source": "KER(line 1357)+UP; GAZ BNSS 409 'Power of High Court to confirm sentence or annul conviction'"
    },
    "369": {
      "new": "410",
      "old_title": "Confirmation or new sentence to be signed by two Judges",
      "new_title": "Confirmation or new sentence to be signed by two Judges",
      "type": "direct",
      "source": "KER(line 1360)+UP; GAZ BNSS 410 'Confirmation or new sentence to be signed by two Judges'"
    },
    "370": {
      "new": "411",
      "old_title": "Procedure in case of difference of opinion",
      "new_title": "Procedure in case of difference of opinion",
      "type": "direct",
      "source": "KER(line 1363)+UP; GAZ BNSS 411 'Procedure in case of difference of opinion'"
    },
    "371": {
      "new": "412",
      "old_title": "Procedure in cases submitted to High Court for confirmation",
      "new_title": "Procedure in cases submitted to High Court for confirmation",
      "type": "direct",
      "source": "KER(line 1365)+UP; GAZ BNSS 412 'Procedure in cases submitted to High Court for confirmation'"
    },
    "372": {
      "new": "413",
      "old_title": "No appeal to lie unless otherwise provided",
      "new_title": "No appeal to lie unless otherwise provided",
      "type": "direct",
      "source": "KER(line 1368)+UP; GAZ BNSS 413 'No appeal to lie unless otherwise provided'"
    },
    "373": {
      "new": "414",
      "old_title": "Appeal from orders requiring security or refusal to accept or rejecting surety for keeping peace etc.",
      "new_title": "Appeal from orders requiring security or refusal to accept or rejecting surety for keeping peace or good behaviour",
      "type": "direct",
      "source": "KER(line 1370)+UP; GAZ BNSS 414 'Appeal from orders requiring security or refusal to accept or rejecting surety for keeping peace or good behaviour'"
    },
    "374": {
      "new": "415",
      "old_title": "Appeals from convictions",
      "new_title": "Appeals from convictions",
      "type": "direct",
      "source": "KER(line 1376)+UP; GAZ BNSS 415 'Appeals from convictions'"
    },
    "375": {
      "new": "416",
      "old_title": "No appeal in certain cases when accused pleads guilty",
      "new_title": "No appeal in certain cases when accused pleads guilty",
      "type": "direct",
      "source": "KER(line 1378)+UP; GAZ BNSS 416 'No appeal in certain cases when accused pleads guilty'"
    },
    "376": {
      "new": "417",
      "old_title": "No appeal in petty cases",
      "new_title": "No appeal in petty cases",
      "type": "direct",
      "source": "KER(line 1380)+UP; GAZ BNSS 417 'No appeal in petty cases'"
    },
    "377": {
      "new": "418",
      "old_title": "Appeal by State Government against sentence",
      "new_title": "Appeal by State Government against sentence",
      "type": "direct",
      "source": "KER(line 1382)+UP; GAZ BNSS 418 'Appeal by State Government against sentence'"
    },
    "378": {
      "new": "419",
      "old_title": "Appeal in case of acquittal",
      "new_title": "Appeal in case of acquittal",
      "type": "direct",
      "source": "KER(line 1385)+UP; GAZ BNSS 419 'Appeal in case of acquittal'"
    },
    "379": {
      "new": "420",
      "old_title": "Appeal against conviction by High Court in certain cases",
      "new_title": "Appeal against conviction by High Court in certain cases",
      "type": "direct",
      "source": "KER(line 1386)+UP; GAZ BNSS 420 'Appeal against conviction by High Court in certain cases'"
    },
    "380": {
      "new": "421",
      "old_title": "Special right of appeal in certain cases",
      "new_title": "Special right of appeal in certain cases",
      "type": "direct",
      "source": "KER(line 1388)+UP; GAZ BNSS 421 'Special right of appeal in certain cases'"
    },
    "381": {
      "new": "422",
      "old_title": "Appeal to Court of Session how heard",
      "new_title": "Appeal to Court of Session how heard",
      "type": "direct",
      "source": "KER(line 1390)+UP; GAZ BNSS 422 'Appeal to Court of Session how heard'"
    },
    "382": {
      "new": "423",
      "old_title": "Petition of appeal",
      "new_title": "Petition of appeal",
      "type": "direct",
      "source": "KER(line 1392)+UP; GAZ BNSS 423 'Petition of appeal'"
    },
    "383": {
      "new": "424",
      "old_title": "Procedure when appellant in jail",
      "new_title": "Procedure when appellant in jail",
      "type": "direct",
      "source": "KER(line 1393)+UP; GAZ BNSS 424 'Procedure when appellant in jail'"
    },
    "384": {
      "new": "425",
      "old_title": "Summary dismissal of appeal",
      "new_title": "Summary dismissal of appeal",
      "type": "direct",
      "source": "KER(line 1395)+UP; GAZ BNSS 425 'Summary dismissal of appeal'"
    },
    "385": {
      "new": "426",
      "old_title": "Procedure for hearing appeals not dismissed summarily",
      "new_title": "Procedure for hearing appeals not dismissed summarily",
      "type": "direct",
      "source": "KER(line 1397)+UP; GAZ BNSS 426 'Procedure for hearing appeals not dismissed summarily'"
    },
    "386": {
      "new": "427",
      "old_title": "Powers of the Appellate Court",
      "new_title": "Powers of Appellate Court",
      "type": "direct",
      "source": "KER(line 1400)+UP; GAZ BNSS 427 'Powers of Appellate Court'"
    },
    "387": {
      "new": "428",
      "old_title": "Judgments of subordinate Appellate Court",
      "new_title": "Judgments of subordinate Appellate Court",
      "type": "direct",
      "source": "KER(line 1402)+UP; GAZ BNSS 428 'Judgments of subordinate Appellate Court'"
    },
    "388": {
      "new": "429",
      "old_title": "Order of High Court on appeal to be certified to lower court",
      "new_title": "Order of High Court on appeal to be certified to lower Court",
      "type": "direct",
      "source": "KER(line 1404)+UP; GAZ BNSS 429 'Order of High Court on appeal to be certified to lower Court'"
    },
    "389": {
      "new": "430",
      "old_title": "Suspension of sentence pending the appeal; release of appellant on bail",
      "new_title": "Suspension of sentence pending appeal; release of appellant on bail",
      "type": "direct",
      "source": "KER(line 1407)+UP; GAZ BNSS 430 'Suspension of sentence pending appeal; release of appellant on bail'"
    },
    "390": {
      "new": "431",
      "old_title": "Arrest of accused in appeal from acquittal",
      "new_title": "Arrest of accused in appeal from acquittal",
      "type": "direct",
      "source": "KER(line 1410)+UP; GAZ BNSS 431 'Arrest of accused in appeal from acquittal'"
    },
    "391": {
      "new": "432",
      "old_title": "Appellate Court may take further evidence or direct it to be taken",
      "new_title": "Appellate Court may take further evidence or direct it to be taken",
      "type": "direct",
      "source": "KER(line 1412)+UP; GAZ BNSS 432 'Appellate Court may take further evidence or direct it to be taken'"
    },
    "392": {
      "new": "433",
      "old_title": "Procedure where Judges of Court of Appeal are equally divided",
      "new_title": "Procedure where Judges of Court of appeal are equally divided",
      "type": "direct",
      "source": "KER(line 1415)+UP; GAZ BNSS 433 'Procedure where Judges of Court of appeal are equally divided'"
    },
    "393": {
      "new": "434",
      "old_title": "Finality of judgments and orders on appeal",
      "new_title": "Finality of judgments and orders on appeal",
      "type": "direct",
      "source": "KER(line 1419)+UP; GAZ BNSS 434 'Finality of judgments and orders on appeal'"
    },
    "394": {
      "new": "435",
      "old_title": "Abatement of appeals",
      "new_title": "Abatement of appeals",
      "type": "direct",
      "source": "KER(line 1421)+UP; GAZ BNSS 435 'Abatement of appeals'"
    },
    "395": {
      "new": "436",
      "old_title": "Reference to High Court",
      "new_title": "Reference to High Court",
      "type": "direct",
      "source": "KER(line 1422)+UP; GAZ BNSS 436 'Reference to High Court'"
    },
    "396": {
      "new": "437",
      "old_title": "Disposal of case according to decision of High Court",
      "new_title": "Disposal of case according to decision of High Court",
      "type": "direct",
      "source": "KER(line 1423)+UP; GAZ BNSS 437 'Disposal of case according to decision of High Court'"
    },
    "397": {
      "new": "438",
      "old_title": "Calling for records to exercise powers of revision",
      "new_title": "Calling for records to exercise powers of revision",
      "type": "direct",
      "source": "KER(line 1425)+UP; GAZ BNSS 438 'Calling for records to exercise powers of revision'"
    },
    "398": {
      "new": "439",
      "old_title": "Power to order inquiry",
      "new_title": "Power to order inquiry",
      "type": "direct",
      "source": "KER(line 1427)+UP; GAZ BNSS 439 'Power to order inquiry'"
    },
    "399": {
      "new": "440",
      "old_title": "Sessions Judge's powers of revision",
      "new_title": "Sessions Judge's powers of revision",
      "type": "direct",
      "source": "KER(line 1428)+UP; GAZ BNSS 440 'Sessions Judge's powers of revision'"
    },
    "400": {
      "new": "441",
      "old_title": "Power of Additional Sessions Judge",
      "new_title": "Power of Additional Sessions Judge",
      "type": "direct",
      "source": "KER(line 1430)+UP; GAZ BNSS 441 'Power of Additional Sessions Judge'"
    },
    "401": {
      "new": "442",
      "old_title": "High Court's powers of revision",
      "new_title": "High Court's powers of revision",
      "type": "direct",
      "source": "KER(line 1432)+UP; GAZ BNSS 442 'High Court's powers of revision'"
    },
    "402": {
      "new": "443",
      "old_title": "Power of High Court to withdraw or transfer revision cases",
      "new_title": "Power of High Court to withdraw or transfer revision cases",
      "type": "direct",
      "source": "KER(line 1434)+UP; GAZ BNSS 443 'Power of High Court to withdraw or transfer revision cases'"
    },
    "403": {
      "new": "444",
      "old_title": "Option of Court to hear parties",
      "new_title": "Option of Court to hear parties",
      "type": "direct",
      "source": "KER(line 1437)+UP; GAZ BNSS 444 'Option of Court to hear parties'"
    },
    "404": {
      "new": null,
      "old_title": "Statement by Metropolitan Magistrate of grounds of his decision",
      "new_title": null,
      "type": "repealed",
      "source": "UP+KER(absence)+GAZ(no heading)",
      "note": "Deleted in BNSS (UP Police correspondence table: Deleted; no BNSS section)"
    },
    "405": {
      "new": "445",
      "old_title": "High Court's order to be certified to lower court",
      "new_title": "High Court's order to be certified to lower Court",
      "type": "direct",
      "source": "KER(line 1439)+UP; GAZ BNSS 445 'High Court's order to be certified to lower Court'"
    },
    "406": {
      "new": "446",
      "old_title": "Power of Supreme Court to transfer cases and appeals",
      "new_title": "Power of Supreme Court to transfer cases and appeals",
      "type": "direct",
      "source": "KER(line 1441)+UP; GAZ BNSS 446 'Power of Supreme Court to transfer cases and appeals'"
    },
    "407": {
      "new": "447",
      "old_title": "Power of High Court to transfer cases and appeals",
      "new_title": "Power of High Court to transfer cases and appeals",
      "type": "direct",
      "source": "KER(line 1443)+UP; GAZ BNSS 447 'Power of High Court to transfer cases and appeals'"
    },
    "408": {
      "new": "448",
      "old_title": "Power of Sessions Judge to transfer cases and appeals",
      "new_title": "Power of Sessions Judge to transfer cases and appeals",
      "type": "direct",
      "source": "KER(line 1446)+UP; GAZ BNSS 448 'Power of Sessions Judge to transfer cases and appeals'"
    },
    "409": {
      "new": "449",
      "old_title": "Withdrawal of cases and appeals by Sessions Judges",
      "new_title": "Withdrawal of cases and appeals by Sessions Judges",
      "type": "direct",
      "source": "KER(line 1449)+UP; GAZ BNSS 449 'Withdrawal of cases and appeals by Sessions Judges'"
    },
    "410": {
      "new": "450",
      "old_title": "Withdrawal of cases by Judicial Magistrates",
      "new_title": "Withdrawal of cases by Judicial Magistrates",
      "type": "direct",
      "source": "KER(line 1451)+UP; GAZ BNSS 450 'Withdrawal of cases by Judicial Magistrates'"
    },
    "411": {
      "new": "451",
      "old_title": "Making over or withdrawal of cases by Executive Magistrates",
      "new_title": "Making over or withdrawal of cases by Executive Magistrates",
      "type": "direct",
      "source": "KER(line 1453)+UP; GAZ BNSS 451 'Making over or withdrawal of cases by Executive Magistrates'"
    },
    "412": {
      "new": "452",
      "old_title": "Reasons to be recorded",
      "new_title": "Reasons to be recorded",
      "type": "direct",
      "source": "KER(line 1456)+UP; GAZ BNSS 452 'Reasons to be recorded'"
    },
    "413": {
      "new": "453",
      "old_title": "Execution of order passed under section 368",
      "new_title": "Execution of order passed under section 409",
      "type": "direct",
      "source": "KER(line 1457)+UP; GAZ BNSS 453 'Execution of order passed under section 409'"
    },
    "414": {
      "new": "454",
      "old_title": "Execution of sentence of death passed by High Court",
      "new_title": "Execution of sentence of death passed by High Court",
      "type": "direct",
      "source": "KER(line 1459)+UP; GAZ BNSS 454 'Execution of sentence of death passed by High Court'"
    },
    "415": {
      "new": "455",
      "old_title": "Postponement of execution of sentence of death in case of appeal to Supreme Court",
      "new_title": "Postponement of execution of sentence of death in case of appeal to Supreme Court",
      "type": "direct",
      "source": "KER(line 1462)+UP; GAZ BNSS 455 'Postponement of execution of sentence of death in case of appeal to Supreme Court'"
    },
    "416": {
      "new": "456",
      "old_title": "Postponement of capital sentence on pregnant woman",
      "new_title": "Commutation of sentence of death on pregnant woman",
      "type": "direct",
      "source": "KER(line 1465)+UP; GAZ BNSS 456 'Commutation of sentence of death on pregnant woman'; BNSS 456 text read: commutation/postponement for pregnant woman (CrPC 416)"
    },
    "417": {
      "new": "457",
      "old_title": "Power to appoint place of imprisonment",
      "new_title": "Power to appoint place of imprisonment",
      "type": "direct",
      "source": "KER(line 1468)+UP; GAZ BNSS 457 'Power to appoint place of imprisonment'"
    },
    "418": {
      "new": "458",
      "old_title": "Execution of sentence of imprisonment",
      "new_title": "Execution of sentence of imprisonment",
      "type": "direct",
      "source": "KER(line 1471)+UP; GAZ BNSS 458 'Execution of sentence of imprisonment'"
    },
    "419": {
      "new": "459",
      "old_title": "Direction of warrant for execution",
      "new_title": "Direction of warrant for execution",
      "type": "direct",
      "source": "KER(line 1473)+UP; GAZ BNSS 459 'Direction of warrant for execution'"
    },
    "420": {
      "new": "460",
      "old_title": "Warrant with whom to be lodged",
      "new_title": "Warrant with whom to be lodged",
      "type": "direct",
      "source": "KER(line 1475)+UP; GAZ BNSS 460 'Warrant with whom to be lodged'"
    },
    "421": {
      "new": "461",
      "old_title": "Warrant for levy of fine",
      "new_title": "Warrant for levy of fine",
      "type": "direct",
      "source": "KER(line 1477)+UP; GAZ BNSS 461 'Warrant for levy of fine'"
    },
    "422": {
      "new": "462",
      "old_title": "Effect of such warrant",
      "new_title": "Effect of such warrant",
      "type": "direct",
      "source": "KER(line 1479)+UP; GAZ BNSS 462 'Effect of such warrant'"
    },
    "423": {
      "new": "463",
      "old_title": "Warrant for levy of fine issued by court in any territory to which this Code does not extend",
      "new_title": "Warrant for levy of fine issued by a Court in any territory to which this Sanhita does not extend",
      "type": "direct",
      "source": "KER(line 1480)+UP; GAZ BNSS 463 'Warrant for levy of fine issued by a Court in any territory to which this Sanhita does not extend'"
    },
    "424": {
      "new": "464",
      "old_title": "Suspension of execution of sentence of imprisonment",
      "new_title": "Suspension of execution of sentence of imprisonment",
      "type": "direct",
      "source": "KER(line 1484)+UP; GAZ BNSS 464 'Suspension of execution of sentence of imprisonment'"
    },
    "425": {
      "new": "465",
      "old_title": "Who may issue warrant",
      "new_title": "Who may issue warrant",
      "type": "direct",
      "source": "KER(line 1486)+UP; GAZ BNSS 465 'Who may issue warrant'"
    },
    "426": {
      "new": "466",
      "old_title": "Sentence on escaped convict when to take effect",
      "new_title": "Sentence on escaped convict when to take effect",
      "type": "direct",
      "source": "KER(line 1487)+UP; GAZ BNSS 466 'Sentence on escaped convict when to take effect'"
    },
    "427": {
      "new": "467",
      "old_title": "Sentence on offender already sentenced for another offence",
      "new_title": "Sentence on offender already sentenced for another offence",
      "type": "direct",
      "source": "KER(line 1489)+UP; GAZ BNSS 467 'Sentence on offender already sentenced for another offence'"
    },
    "428": {
      "new": "468",
      "old_title": "Period of detention undergone by accused to be set off against sentence of imprisonment",
      "new_title": "Period of detention undergone by accused to be set off against sentence of imprisonment",
      "type": "direct",
      "source": "KER(line 1492)+UP; GAZ BNSS 468 'Period of detention undergone by accused to be set off against sentence of imprisonment'"
    },
    "429": {
      "new": "469",
      "old_title": "Saving — sentences of imprisonment",
      "new_title": "Saving",
      "type": "direct",
      "source": "KER(line 1496)+UP; GAZ BNSS 469 'Saving'"
    },
    "430": {
      "new": "470",
      "old_title": "Return of warrant on execution of sentence",
      "new_title": "Return of warrant on execution of sentence",
      "type": "direct",
      "source": "KER(line 1497)+UP; GAZ BNSS 470 'Return of warrant on execution of sentence'"
    },
    "431": {
      "new": "471",
      "old_title": "Money ordered to be paid recoverable as fine",
      "new_title": "Money ordered to be paid recoverable as a fine",
      "type": "direct",
      "source": "KER(line 1499)+UP; GAZ BNSS 471 'Money ordered to be paid recoverable as a fine'"
    },
    "432": {
      "new": "473",
      "old_title": "Power to suspend or remit sentences",
      "new_title": "Power to suspend or remit sentences",
      "type": "direct",
      "source": "KER(line 1505)+UP; GAZ BNSS 473 'Power to suspend or remit sentences'"
    },
    "433": {
      "new": "474",
      "old_title": "Power to commute sentence",
      "new_title": "Power to commute sentence",
      "type": "direct",
      "source": "KER(line 1507)+UP; GAZ BNSS 474 'Power to commute sentence'"
    },
    "433A": {
      "new": "475",
      "old_title": "Restriction on powers of remission or commutation in certain cases",
      "new_title": "Restriction on powers of remission or commutation in certain cases",
      "type": "direct",
      "source": "KER(line 1509)+UP; GAZ BNSS 475 'Restriction on powers of remission or commutation in certain cases'"
    },
    "434": {
      "new": "476",
      "old_title": "Concurrent power of Central Government in case of death sentences",
      "new_title": "Concurrent power of Central Government in case of death sentences",
      "type": "direct",
      "source": "KER(line 1512)+UP; GAZ BNSS 476 'Concurrent power of Central Government in case of death sentences'"
    },
    "435": {
      "new": "477",
      "old_title": "State Government to act after consultation with Central Government in certain cases",
      "new_title": "State Government to act after concurrence with Central Government in certain cases",
      "type": "direct",
      "source": "KER(line 1515)+UP; GAZ BNSS 477 'State Government to act after concurrence with Central Government in certain cases'"
    },
    "436": {
      "new": "478",
      "old_title": "In what cases bail to be taken (bailable offences)",
      "new_title": "In what cases bail to be taken",
      "type": "direct",
      "source": "KER(line 1519)+UP; GAZ BNSS 478 'In what cases bail to be taken'"
    },
    "436A": {
      "new": "479",
      "old_title": "Maximum period for which undertrial prisoner can be detained",
      "new_title": "Maximum period for which undertrial prisoner can be detained",
      "type": "direct",
      "source": "KER(line 1522)+UP; GAZ BNSS 479 'Maximum period for which undertrial prisoner can be detained'"
    },
    "437": {
      "new": "480",
      "old_title": "When bail may be taken in case of non-bailable offence",
      "new_title": "When bail may be taken in case of non-bailable offence",
      "type": "direct",
      "source": "KER(line 1532)+UP; GAZ BNSS 480 'When bail may be taken in case of non-bailable offence'"
    },
    "437A": {
      "new": "481",
      "old_title": "Bail to require accused to appear before next Appellate Court",
      "new_title": "Bail to require accused to appear before next Appellate Court",
      "type": "direct",
      "source": "KER(line 1536)+UP; GAZ BNSS 481 'Bail to require accused to appear before next Appellate Court'"
    },
    "438": {
      "new": "482",
      "old_title": "Direction for grant of bail to person apprehending arrest (Anticipatory bail)",
      "new_title": "Direction for grant of bail to person apprehending arrest",
      "type": "direct",
      "source": "KER(line 1539)+UP; GAZ BNSS 482 'Direction for grant of bail to person apprehending arrest'"
    },
    "439": {
      "new": "483",
      "old_title": "Special powers of High Court or Court of Session regarding bail",
      "new_title": "Special powers of High Court or Court of Session regarding bail",
      "type": "direct",
      "source": "KER(line 1541)+UP; GAZ BNSS 483 'Special powers of High Court or Court of Session regarding bail'"
    },
    "440": {
      "new": "484",
      "old_title": "Amount of bond and reduction thereof",
      "new_title": "Amount of bond and reduction thereof",
      "type": "direct",
      "source": "KER(line 1544)+UP; GAZ BNSS 484 'Amount of bond and reduction thereof'"
    },
    "441": {
      "new": "485",
      "old_title": "Bond of accused and sureties",
      "new_title": "Bond of accused and sureties",
      "type": "direct",
      "source": "KER(line 1546)+UP; GAZ BNSS 485 'Bond of accused and sureties'"
    },
    "441A": {
      "new": "486",
      "old_title": "Declaration by sureties",
      "new_title": "Declaration by sureties",
      "type": "direct",
      "source": "KER(line 1551)+UP; GAZ BNSS 486 'Declaration by sureties'"
    },
    "442": {
      "new": "487",
      "old_title": "Discharge from custody",
      "new_title": "Discharge from custody",
      "type": "direct",
      "source": "KER(line 1552)+UP; GAZ BNSS 487 'Discharge from custody'"
    },
    "443": {
      "new": "488",
      "old_title": "Power to order sufficient bail when that first taken is insufficient",
      "new_title": "Power to order sufficient bail when that first taken is insufficient",
      "type": "direct",
      "source": "KER(line 1553)+UP; GAZ BNSS 488 'Power to order sufficient bail when that first taken is insufficient'"
    },
    "444": {
      "new": "489",
      "old_title": "Discharge of sureties",
      "new_title": "Discharge of sureties",
      "type": "direct",
      "source": "KER(line 1556)+UP; GAZ BNSS 489 'Discharge of sureties'"
    },
    "445": {
      "new": "490",
      "old_title": "Deposit instead of recognizance",
      "new_title": "Deposit instead of recognizance",
      "type": "direct",
      "source": "KER(line 1557)+UP; GAZ BNSS 490 'Deposit instead of recognizance'"
    },
    "446": {
      "new": "491",
      "old_title": "Procedure when bond has been forfeited",
      "new_title": "Procedure when bond has been forfeited",
      "type": "direct",
      "source": "KER(line 1559)+UP; GAZ BNSS 491 'Procedure when bond has been forfeited'"
    },
    "446A": {
      "new": "492",
      "old_title": "Cancellation of bond and bail bond",
      "new_title": "Cancellation of bond and bail bond",
      "type": "direct",
      "source": "KER(line 1561)+UP; GAZ BNSS 492 'Cancellation of bond and bail bond'"
    },
    "447": {
      "new": "493",
      "old_title": "Procedure in case of insolvency or death of surety or when a bond is forfeited",
      "new_title": "Procedure in case of insolvency or death of surety or when a bond is forfeited",
      "type": "direct",
      "source": "KER(line 1563)+UP; GAZ BNSS 493 'Procedure in case of insolvency or death of surety or when a bond is forfeited'"
    },
    "448": {
      "new": "494",
      "old_title": "Bond required from minor",
      "new_title": "Bond required from child",
      "type": "direct",
      "source": "KER(line 1566)+UP; GAZ BNSS 494 'Bond required from child'"
    },
    "449": {
      "new": "495",
      "old_title": "Appeal from orders under section 446",
      "new_title": "Appeal from orders under section 491",
      "type": "direct",
      "source": "KER(line 1567)+UP; GAZ BNSS 495 'Appeal from orders under section 491'"
    },
    "450": {
      "new": "496",
      "old_title": "Power to direct levy of amount due on certain recognizance",
      "new_title": "Power to direct levy of amount due on certain recognizances",
      "type": "direct",
      "source": "KER(line 1569)+UP; GAZ BNSS 496 'Power to direct levy of amount due on certain recognizances'"
    },
    "451": {
      "new": "497",
      "old_title": "Order for custody and disposal of property pending trial in certain cases",
      "new_title": "Order for custody and disposal of property pending trial in certain cases",
      "type": "direct",
      "source": "KER(line 1572)+UP; GAZ BNSS 497 'Order for custody and disposal of property pending trial in certain cases'"
    },
    "452": {
      "new": "498",
      "old_title": "Order for disposal of property at conclusion of trial",
      "new_title": "Order for disposal of property at conclusion of trial",
      "type": "direct",
      "source": "KER(line 1578)+UP; GAZ BNSS 498 'Order for disposal of property at conclusion of trial'"
    },
    "453": {
      "new": "499",
      "old_title": "Payment to innocent purchaser of money found on accused",
      "new_title": "Payment to innocent purchaser of money found on accused",
      "type": "direct",
      "source": "KER(line 1581)+UP; GAZ BNSS 499 'Payment to innocent purchaser of money found on accused'"
    },
    "454": {
      "new": "500",
      "old_title": "Appeal against orders under section 452 or section 453",
      "new_title": "Appeal against orders under section 498 or section 499",
      "type": "direct",
      "source": "KER(line 1584)+UP; GAZ BNSS 500 'Appeal against orders under section 498 or section 499'"
    },
    "455": {
      "new": "501",
      "old_title": "Destruction of libellous and other matter",
      "new_title": "Destruction of libellous and other matter",
      "type": "direct",
      "source": "KER(line 1586)+UP; GAZ BNSS 501 'Destruction of libellous and other matter'"
    },
    "456": {
      "new": "502",
      "old_title": "Power to restore possession of immovable property",
      "new_title": "Power to restore possession of immovable property",
      "type": "direct",
      "source": "KER(line 1588)+UP; GAZ BNSS 502 'Power to restore possession of immovable property'"
    },
    "457": {
      "new": "503",
      "old_title": "Procedure by police upon seizure of property",
      "new_title": "Procedure by police upon seizure of property",
      "type": "direct",
      "source": "KER(line 1593)+UP; GAZ BNSS 503 'Procedure by police upon seizure of property'"
    },
    "458": {
      "new": "504",
      "old_title": "Procedure when no claimant appears within six months",
      "new_title": "Procedure where no claimant appears within six months",
      "type": "direct",
      "source": "KER(line 1595)+UP; GAZ BNSS 504 'Procedure where no claimant appears within six months'"
    },
    "459": {
      "new": "505",
      "old_title": "Power to sell perishable property",
      "new_title": "Power to sell perishable property",
      "type": "direct",
      "source": "KER(line 1597)+UP; GAZ BNSS 505 'Power to sell perishable property'"
    },
    "460": {
      "new": "506",
      "old_title": "Irregularities which do not vitiate proceedings",
      "new_title": "Irregularities which do not vitiate proceedings",
      "type": "direct",
      "source": "KER(line 1599)+UP; GAZ BNSS 506 'Irregularities which do not vitiate proceedings'"
    },
    "461": {
      "new": "507",
      "old_title": "Irregularities which vitiate proceedings",
      "new_title": "Irregularities which vitiate proceedings",
      "type": "direct",
      "source": "KER(line 1601)+UP; GAZ BNSS 507 'Irregularities which vitiate proceedings'"
    },
    "462": {
      "new": "508",
      "old_title": "Proceedings in wrong place",
      "new_title": "Proceedings in wrong place",
      "type": "direct",
      "source": "KER(line 1603)+UP; GAZ BNSS 508 'Proceedings in wrong place'"
    },
    "463": {
      "new": "509",
      "old_title": "Non-compliance with provisions of section 164 or section 281",
      "new_title": "Non-compliance with provisions of section 183 or section 316",
      "type": "direct",
      "source": "KER(line 1604)+UP; GAZ BNSS 509 'Non-compliance with provisions of section 183 or section 316'"
    },
    "464": {
      "new": "510",
      "old_title": "Effect of omission to frame, or absence of, or error in, charge",
      "new_title": "Effect of omission to frame, or absence of, or error in, charge",
      "type": "direct",
      "source": "KER(line 1607)+UP; GAZ BNSS 510 'Effect of omission to frame, or absence of, or error in, charge'"
    },
    "465": {
      "new": "511",
      "old_title": "Finding or sentence when reversible by reason of error, omission or irregularity",
      "new_title": "Finding or sentence when reversible by reason of error, omission or irregularity",
      "type": "direct",
      "source": "KER(line 1610)+UP; GAZ BNSS 511 'Finding or sentence when reversible by reason of error, omission or irregularity'"
    },
    "466": {
      "new": "512",
      "old_title": "Defect or error not to make attachment unlawful",
      "new_title": "Defect or error not to make attachment unlawful",
      "type": "direct",
      "source": "KER(line 1613)+UP; GAZ BNSS 512 'Defect or error not to make attachment unlawful'"
    },
    "467": {
      "new": "513",
      "old_title": "Definitions — limitation",
      "new_title": "Definitions",
      "type": "direct",
      "source": "KER(line 1615)+UP; GAZ BNSS 513 'Definitions'"
    },
    "468": {
      "new": "514",
      "old_title": "Bar to taking cognizance after lapse of period of limitation",
      "new_title": "Bar to taking cognizance after lapse of period of limitation",
      "type": "direct",
      "source": "KER(line 1616)+UP; GAZ BNSS 514 'Bar to taking cognizance after lapse of period of limitation'"
    },
    "469": {
      "new": "515",
      "old_title": "Commencement of period of limitation",
      "new_title": "Commencement of period of limitation",
      "type": "direct",
      "source": "KER(line 1622)+UP; GAZ BNSS 515 'Commencement of period of limitation'"
    },
    "470": {
      "new": "516",
      "old_title": "Exclusion of time in certain cases",
      "new_title": "Exclusion of time in certain cases",
      "type": "direct",
      "source": "KER(line 1624)+UP; GAZ BNSS 516 'Exclusion of time in certain cases'"
    },
    "471": {
      "new": "517",
      "old_title": "Exclusion of date on which Court is closed",
      "new_title": "Exclusion of date on which Court is closed",
      "type": "direct",
      "source": "KER(line 1626)+UP; GAZ BNSS 517 'Exclusion of date on which Court is closed'"
    },
    "472": {
      "new": "518",
      "old_title": "Continuing offence",
      "new_title": "Continuing offence",
      "type": "direct",
      "source": "KER(line 1628)+UP; GAZ BNSS 518 'Continuing offence'"
    },
    "473": {
      "new": "519",
      "old_title": "Extension of period of limitation in certain cases",
      "new_title": "Extension of period of limitation in certain cases",
      "type": "direct",
      "source": "KER(line 1629)+UP; GAZ BNSS 519 'Extension of period of limitation in certain cases'"
    },
    "474": {
      "new": "520",
      "old_title": "Trials before High Courts",
      "new_title": "Trials before High Courts",
      "type": "direct",
      "source": "KER(line 1631)+UP; GAZ BNSS 520 'Trials before High Courts'"
    },
    "475": {
      "new": "521",
      "old_title": "Delivery to military authorities of persons liable to be tried by Court-martial",
      "new_title": "Delivery to commanding officers of persons liable to be tried by Court-martial",
      "type": "direct",
      "source": "KER(line 1636)+UP; GAZ BNSS 521 'Delivery to commanding officers of persons liable to be tried by Court-martial'"
    },
    "476": {
      "new": "522",
      "old_title": "Forms",
      "new_title": "Forms",
      "type": "direct",
      "source": "KER(line 1639)+UP; GAZ BNSS 522 'Forms'"
    },
    "477": {
      "new": "523",
      "old_title": "Power of High Court to make rules",
      "new_title": "Power of High Court to make rules",
      "type": "direct",
      "source": "KER(line 1640)+UP; GAZ BNSS 523 'Power of High Court to make rules'"
    },
    "478": {
      "new": "524",
      "old_title": "Power to alter functions allocated to Executive Magistrate in certain cases",
      "new_title": "Power to alter functions allocated to Executive Magistrate in certain cases",
      "type": "direct",
      "source": "KER(line 1642)+UP; GAZ BNSS 524 'Power to alter functions allocated to Executive Magistrate in certain cases'"
    },
    "479": {
      "new": "525",
      "old_title": "Cases in which Judge or Magistrate is personally interested",
      "new_title": "Cases in which Judge or Magistrate is personally interested",
      "type": "direct",
      "source": "KER(line 1645)+UP; GAZ BNSS 525 'Cases in which Judge or Magistrate is personally interested'"
    },
    "480": {
      "new": "526",
      "old_title": "Practising pleader not to sit as Magistrate in certain courts",
      "new_title": "Practising advocate not to sit as Magistrate in certain Courts",
      "type": "direct",
      "source": "KER(line 1648)+UP; GAZ BNSS 526 'Practising advocate not to sit as Magistrate in certain Courts'"
    },
    "481": {
      "new": "527",
      "old_title": "Public servant concerned in sale not to purchase or bid for property",
      "new_title": "Public servant concerned in sale not to purchase or bid for property",
      "type": "direct",
      "source": "KER(line 1651)+UP; GAZ BNSS 527 'Public servant concerned in sale not to purchase or bid for property'"
    },
    "482": {
      "new": "528",
      "old_title": "Saving of inherent powers of High Court",
      "new_title": "Saving of inherent powers of High Court",
      "type": "direct",
      "source": "KER(line 1654)+UP; GAZ BNSS 528 'Saving of inherent powers of High Court'"
    },
    "483": {
      "new": "529",
      "old_title": "Duty of High Court to exercise continuous superintendence over Courts of Judicial Magistrates",
      "new_title": "Duty of High Court to exercise continuous superintendence over Courts",
      "type": "direct",
      "source": "KER(line 1656)+UP; GAZ BNSS 529 'Duty of High Court to exercise continuous superintendence over Courts'"
    },
    "484": {
      "new": "531",
      "old_title": "Repeal and savings",
      "new_title": "Repeal and savings",
      "type": "direct",
      "source": "KER(line 1661)+UP; GAZ BNSS 531 'Repeal and savings'"
    }
  },
  "new_provisions": {
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
  },
  "_meta": {
    "description": "CrPC 1973 → BNSS 2023 section mapping — supports section converter free tool (SCRUM-46) and AI prompt context for advocates citing old CrPC numbers",
    "owner": "Ajay (CLO)",
    "validated_by": "Ajay (CLO) - 2026-10-12 - corrected table (T-255); every row checked against the Gazette headings of the BNSS and two comparison tables",
    "last_updated": "2026-10-12",
    "source": "CrPC->BNSS mapping rechecked row by row (T-255): CAPT Bhopal/Kerala Prisons correspondence table + UP Police corresponding-section table, headings checked against the Gazette BNSS (Act 46 of 2023)",
    "change_protocol": "CLO sign-off required; no AI-authored entries"
  }
}
```

## The diff (for review)

# T-255: CrPC to BNSS mapping recheck, diff against current crpc-to-bnss.json

Rule applied: a row is accepted only when the CAPT Bhopal/Kerala Prisons table and the UP Police table agree on the BNSS section AND the Gazette BNSS heading of that section is the same provision as the CrPC heading.

## 1. Rows whose `new` changed

| CrPC | CrPC heading (current old_title) | old `new` | corrected `new` | BNSS Gazette heading | Evidence |
|---|---|---|---|---|---|
| 10 | Assistant Sessions Judges | 9 | None | (no BNSS section; deleted) | UP Police table lists CrPC 10 against 'Deleted'; absent from CAPT/Kerala BNSS->CrPC table; no BNSS Gazette heading corresponds |
| 11 | Courts of Judicial Magistrates | 10 | 9 | Courts of Judicial Magistrates | KER s.9 line 77; UP s.9; heading sim 1.0 |
| 12 | Chief Judicial Magistrate and Additional Chief Judicial Magi | 11 | 10 | Chief Judicial Magistrate and Additional Chief Judicial Magistrate, etc | KER s.10 line 79; UP s.10; heading sim 1.0 |
| 13 | Special Judicial Magistrates | 12 | 11 | Special Judicial Magistrates | KER s.11 line 82; UP s.11; heading sim 1.0 |
| 14 | Local jurisdiction of Judicial Magistrates | 13 | 12 | Local Jurisdiction of Judicial Magistrates | KER s.12 line 83; UP s.12; heading sim 1.0 |
| 15 | Subordination of Judicial Magistrates | 14 | 13 | Subordination of Judicial Magistrates | KER s.13 line 88; UP s.13; heading sim 1.0 |
| 20 | Executive Magistrates | 15 | 14 | Executive Magistrates | KER s.14 line 90; UP s.14; heading sim 1.0 |
| 21 | Special Executive Magistrates | 16 | 15 | Special Executive Magistrates | KER s.15 line 92; UP s.15; heading sim 1.0 |
| 22 | Local jurisdiction of Executive Magistrates | 17 | 16 | Local Jurisdiction of Executive Magistrates | KER s.16 line 95; UP s.16; heading sim 1.0 |
| 23 | Subordination of Executive Magistrates | 18 | 17 | Subordination of Executive Magistrates | KER s.17 line 97; UP s.17; heading sim 1.0 |
| 24 | Public Prosecutors | 19 | 18 | Public Prosecutors | KER s.18 line 99; UP s.18; heading sim 1.0 |
| 25 | Assistant Public Prosecutors | 20 | 19 | Assistant Public Prosecutors | KER s.19 line 100; UP s.19; heading sim 1.0 |
| 25A | Directorate of Prosecution | 21 | 20 | Directorate of Prosecution | KER s.20 line 104; UP s.20; heading sim 1.0 |
| 26 | Courts by which offences are triable | 22 | 21 | Courts by which offences are triable | KER s.21 line 107; UP s.21; heading sim 1.0 |
| 27 | Jurisdiction in case of juveniles | 23 | None | (no BNSS section; deleted) | UP Police table lists CrPC 27 against 'Deleted'; absent from CAPT/Kerala BNSS->CrPC table; no BNSS Gazette heading corresponds |
| 28 | Sentences which High Courts and Sessions Judges may pass | 24 | 22 | Sentences which High Courts and Sessions Judges may pass | KER s.22 line 109; UP s.22; heading sim 1.0 |
| 29 | Sentences which Magistrates may pass | 25 | 23 | Sentences which Magistrates may pass | KER s.23 line 112; UP s.23; heading sim 1.0 |
| 30 | Sentence of imprisonment in default of fine | 26 | 24 | Sentence of imprisonment in default of fine | KER s.24 line 116; UP s.24; heading sim 1.0 |
| 31 | Sentence in cases of conviction of several offences at one t | 27 | 25 | Sentence in cases of conviction of several offences at one trial | KER s.25 line 118; UP s.25; heading sim 1.0 |
| 32 | Mode of conferring powers | 28 | 26 | Mode of conferring powers | KER s.26 line 121; UP s.26; heading sim 1.0 |
| 33 | Powers of officers appointed | 29 | 27 | Powers of officers appointed | KER s.27 line 122; UP s.27; heading sim 1.0 |
| 34 | Withdrawal of powers | 30 | 28 | Withdrawal of powers | KER s.28 line 123; UP s.28; heading sim 1.0 |
| 35 | Powers of Judges and Magistrates exercisable by their succes | 31 | 29 | Powers of Judges and Magistrates exercisable by their successors-in-office | KER s.29 line 124; UP s.29; heading sim 1.0 |
| 36 | Powers of superior officers of police | 32 | 30 | Powers of superior officers of police | KER s.30 line 127; UP s.30; heading sim 1.0 |
| 37 | Public when to assist Magistrates and police | 33 | 31 | Public when to assist Magistrates and police | KER s.31 line 132; UP s.31; heading sim 1.0 |
| 38 | Aid to person other than police officer executing warrant | 34 | 32 | Aid to person, other than police officer, executing warrant | KER s.32 line 134; UP s.32; heading sim 1.0 |
| 39 | Public to give information of certain offences | None | 33 | Public to give information of certain offences | KER s.33 line 137; UP s.33; heading sim 1.0 |
| 40 | Duty of officers employed in connection with affairs of a vi | None | 34 | Duty of officers employed in connection with affairs of a village to make certain report | KER s.34 line 139; UP s.34; heading sim 1.0 |
| 41B | Procedure of arrest and duties of officer making arrest | 37 | 36 | Procedure of arrest and duties of officer making arrest | KER s.36 line 149; UP s.36; heading sim 1.0 |
| 41C | Control room at districts | 37(2) | 37 | Designated police officer | KER s.37 line 152; UP s.37; heading sim 0.24; BNSS 37(a) text read: police control room in every district (CrPC 41C(1)); heading renamed to Designated police officer |
| 41D | Right of arrested person to meet an advocate of his choice d | 36 | 38 | Right of arrested person to meet an advocate of his choice during interrogation | KER s.38 line 156; UP s.38; heading sim 1.0 |
| 84 | Claims and objections to attachment | 86 | 87 | Claims and objections to attachment | KER s.87 line 295; UP s.87; heading sim 1.0 |
| 85 | Release, sale and restoration of attached property | 87 | 88 | Release, sale and restoration of attached property | KER s.88 line 297; UP s.88; heading sim 1.0 |
| 86 | Appeal from order rejecting application for restoration of a | 88 | 89 | Appeal from order rejecting application for restoration of attached property | KER s.89 line 299; UP s.89; heading sim 1.0 |
| 87 | Issue of warrant in lieu of, or in addition to, summons | 89 | 90 | Issue of warrant in lieu of, or in addition to, summons | KER s.90 line 302; UP s.90; heading sim 1.0 |
| 88 | Power to take bond for appearance | 90 | 91 | Power to take bond or bail bond for appearance | KER s.91 line 304; UP s.91; heading sim 0.84 |
| 89 | Arrest on breach of bond for appearance | 91 | 92 | Arrest on breach of bond or bail bond for appearance | KER s.92 line 310; UP s.92; heading sim 0.86 |
| 90 | Provisions of this Chapter generally applicable to summons a | 92 | 93 | Provisions of this Chapter generally applicable to summons and warrants of arrest | KER s.93 line 312; UP s.93; heading sim 1.0 |
| 103 | Magistrate may direct search in his presence | 107 | 108 | Magistrate may direct search in his presence | KER s.108 line 369; UP s.108; heading sim 1.0 |
| 104 | Power to impound document etc. produced | 108 | 109 | Power to impound document, etc., produced | KER s.109 line 371; UP s.109; heading sim 1.0 |
| 105 | Reciprocal arrangements regarding processes | 109 | 110 | Reciprocal arrangements regarding processes | KER s.110 line 373; UP s.110; heading sim 1.0 |
| 105A | Definitions — letters of request | 110 | 111 | Definitions | KER s.111 line 375; UP s.111; heading sim 1.0 |
| 105B | Assistance in securing transfer of persons | 111 | 114 | Assistance in securing transfer of persons | KER s.114 line 385; UP s.114; heading sim 1.0 |
| 105C | Assistance in relation to orders of attachment or forfeiture | 112 | 115 | Assistance in relation to orders of attachment or forfeiture of property | KER s.115 line 387; UP s.115; heading sim 1.0 |
| 105D | Identifying unlawfully acquired property | 113 | 116 | Identifying unlawfully acquired property | KER s.116 line 390; UP s.116; heading sim 1.0 |
| 105E | Seizure or attachment of unlawfully acquired property | 114 | 117 | Seizure or attachment of property | KER s.117 line 392; UP s.117; heading sim 1.0 |
| 105F | Management of properties seized or forfeited | 115 | 118 | Management of properties seized or forfeited under this Chapter | KER s.118 line 394; UP s.118; heading sim 1.0 |
| 105G | Notice of forfeiture of property | 116 | 119 | Notice of forfeiture of property | KER s.119 line 400; UP s.119; heading sim 1.0 |
| 105H | Forfeiture of property in certain cases | 117 | 120 | Forfeiture of property in certain cases | KER s.120 line 402; UP s.120; heading sim 1.0 |
| 105I | Fine in lieu of forfeiture | 118 | 121 | Fine of in lieu forfeiture | KER s.121 line 404; UP s.121; heading sim 0.88 |
| 105J | Certain transfers to be null and void | 119 | 122 | Certain transfers to be null and void | KER s.122 line 405; UP s.122; heading sim 1.0 |
| 105K | Procedure in respect of letter of request | 120 | 123 | Procedure in respect of letter of request | KER s.123 line 407; UP s.123; heading sim 1.0 |
| 105L | Application of this Chapter | 121 | 124 | Application of this Chapter | KER s.124 line 409; UP s.124; heading sim 1.0 |
| 144A | Power to prohibit carrying arms in procession or mass drill | 164 | None | (no BNSS section; deleted) | UP Police table lists CrPC 144A against 'Deleted'; absent from CAPT/Kerala BNSS->CrPC table; no BNSS Gazette heading corresponds |
| 153 | Inspection of weights and measures | 172 | None | (no BNSS section; deleted) | UP Police table lists CrPC 153 against 'Deleted'; absent from CAPT/Kerala BNSS->CrPC table; no BNSS Gazette heading corresponds |
| 166A | Letter of request to competent authority for investigation i | 186(2) | 112 | Letter of request to competent authority for investigation in a country or place outside India | KER s.112 line 376; UP s.112; heading sim 1.0 |
| 166B | Letter of request from country outside India to court or aut | 186(3) | 113 | Letter of request from a country or place outside India to a Court or an authority for investigation in India | KER s.113 line 380; UP s.113; heading sim 1.0 |
| 318 | Procedure where accused does not understand proceedings | 356 | 357 | Procedure where accused does not understand proceedings | KER s.357 line 1186; UP s.357; heading sim 1.0 |
| 355 | Metropolitan Magistrate's judgment | 394 | None | (no BNSS section; deleted) | UP Police table lists CrPC 355 against 'Deleted'; absent from CAPT/Kerala BNSS->CrPC table; no BNSS Gazette heading corresponds |
| 356 | Order for notifying address of previously convicted offender | 395 | 394 | Order for notifying address of previously convicted offender | KER s.394 line 1307; UP s.394; heading sim 1.0 |
| 357B | Compensation to be in addition to fine under section 326A or | 397 | 396(7) | Victim compensation scheme | KER s.396 line 1311; UP s.396; heading sim 0.3; BNSS 396(7) text read: compensation in addition to fine (CrPC 357B) |
| 358 | Compensation to persons groundlessly arrested | 398 | 399 | Compensation to persons groundlessly arrested | KER s.399 line 1327; UP s.399; heading sim 1.0 |
| 359 | Order to pay costs in non-cognizable cases | 399 | 400 | Order to pay costs in non-cognizable cases | KER s.400 line 1329; UP s.400; heading sim 1.0 |
| 360 | Order to release on probation of good conduct or after admon | 400 | 401 | Order to release on probation of good conduct or after admonition | KER s.401 line 1332; UP s.401; heading sim 1.0 |
| 361 | Special reasons to be recorded in certain cases | 401 | 402 | Special reasons to be recorded in certain cases | KER s.402 line 1336; UP s.402; heading sim 1.0 |
| 362 | Court not to alter judgment | 402 | 403 | Court not to alter judgment | KER s.403 line 1339; UP s.403; heading sim 1.0 |
| 363 | Copy of judgment to be given to the accused | 403 | 404 | Copy of judgment to be given to accused and other persons | KER s.404 line 1340; UP s.404; heading sim 0.97 |
| 364 | Judgment when to be translated | 404 | 405 | Judgment when to be translated | KER s.405 line 1345; UP s.405; heading sim 1.0 |
| 365 | Court of Session to send copy of finding and sentence to Dis | 405 | 406 | Court of Session to send copy of finding and sentence to District Magistrate | KER s.406 line 1347; UP s.406; heading sim 1.0 |
| 366 | Sentence of death to be submitted to High Court for confirma | 406 | 407 | Sentence of death to be submitted by Court of Session for confirmation | KER s.407 line 1350; UP s.407; heading sim 1.0 |
| 367 | Power to direct further inquiry or additional evidence | 407 | 408 | Power to direct further inquiry to be made or additional evidence to be taken | KER s.408 line 1353; UP s.408; heading sim 1.0 |
| 368 | Power of High Court to confirm sentence or annul conviction | 408 | 409 | Power of High Court to confirm sentence or annul conviction | KER s.409 line 1357; UP s.409; heading sim 1.0 |
| 369 | Confirmation or new sentence to be signed by two Judges | 409 | 410 | Confirmation or new sentence to be signed by two Judges | KER s.410 line 1360; UP s.410; heading sim 1.0 |
| 370 | Procedure in case of difference of opinion | 410 | 411 | Procedure in case of difference of opinion | KER s.411 line 1363; UP s.411; heading sim 1.0 |
| 371 | Procedure in cases submitted to High Court for confirmation | 411 | 412 | Procedure in cases submitted to High Court for confirmation | KER s.412 line 1365; UP s.412; heading sim 1.0 |
| 404 | Statement by Metropolitan Magistrate of grounds of his decis | 445 | None | (no BNSS section; deleted) | UP Police table lists CrPC 404 against 'Deleted'; absent from CAPT/Kerala BNSS->CrPC table; no BNSS Gazette heading corresponds |
| 405 | High Court's order to be certified to lower court | 446 | 445 | High Court's order to be certified to lower Court | KER s.445 line 1439; UP s.445; heading sim 1.0 |
| 406 | Power of Supreme Court to transfer cases and appeals | 447 | 446 | Power of Supreme Court to transfer cases and appeals | KER s.446 line 1441; UP s.446; heading sim 1.0 |
| 407 | Power of High Court to transfer cases and appeals | 448 | 447 | Power of High Court to transfer cases and appeals | KER s.447 line 1443; UP s.447; heading sim 1.0 |
| 408 | Power of Sessions Judge to transfer cases and appeals | 449 | 448 | Power of Sessions Judge to transfer cases and appeals | KER s.448 line 1446; UP s.448; heading sim 1.0 |
| 409 | Withdrawal of cases and appeals by Sessions Judges | 450 | 449 | Withdrawal of cases and appeals by Sessions Judges | KER s.449 line 1449; UP s.449; heading sim 1.0 |
| 410 | Withdrawal of cases by Judicial Magistrates | 451 | 450 | Withdrawal of cases by Judicial Magistrates | KER s.450 line 1451; UP s.450; heading sim 1.0 |
| 411 | Making over or withdrawal of cases by Executive Magistrates | 452 | 451 | Making over or withdrawal of cases by Executive Magistrates | KER s.451 line 1453; UP s.451; heading sim 1.0 |
| 412 | Reasons to be recorded | 453 | 452 | Reasons to be recorded | KER s.452 line 1456; UP s.452; heading sim 1.0 |
| 413 | Execution of order passed under section 368 | 454 | 453 | Execution of order passed under section 409 | KER s.453 line 1457; UP s.453; heading sim 0.93 |
| 414 | Execution of sentence of death passed by High Court | 455 | 454 | Execution of sentence of death passed by High Court | KER s.454 line 1459; UP s.454; heading sim 1.0 |
| 415 | Postponement of execution of sentence of death in case of ap | 456 | 455 | Postponement of execution of sentence of death in case of appeal to Supreme Court | KER s.455 line 1462; UP s.455; heading sim 1.0 |
| 416 | Postponement of capital sentence on pregnant woman | 457 | 456 | Commutation of sentence of death on pregnant woman | KER s.456 line 1465; UP s.456; heading sim 0.68; BNSS 456 text read: commutation/postponement for pregnant woman (CrPC 416) |
| 417 | Power to appoint place of imprisonment | 458 | 457 | Power to appoint place of imprisonment | KER s.457 line 1468; UP s.457; heading sim 1.0 |
| 418 | Execution of sentence of imprisonment | 459 | 458 | Execution of sentence of imprisonment | KER s.458 line 1471; UP s.458; heading sim 1.0 |
| 419 | Direction of warrant for execution | 460 | 459 | Direction of warrant for execution | KER s.459 line 1473; UP s.459; heading sim 1.0 |
| 420 | Warrant with whom to be lodged | 461 | 460 | Warrant with whom to be lodged | KER s.460 line 1475; UP s.460; heading sim 1.0 |
| 421 | Warrant for levy of fine | 462 | 461 | Warrant for levy of fine | KER s.461 line 1477; UP s.461; heading sim 1.0 |
| 422 | Effect of such warrant | 463 | 462 | Effect of such warrant | KER s.462 line 1479; UP s.462; heading sim 1.0 |
| 423 | Warrant for levy of fine issued by court in any territory to | 464 | 463 | Warrant for levy of fine issued by a Court in any territory to which this Sanhita does not extend | KER s.463 line 1480; UP s.463; heading sim 1.0 |
| 424 | Suspension of execution of sentence of imprisonment | 465 | 464 | Suspension of execution of sentence of imprisonment | KER s.464 line 1484; UP s.464; heading sim 1.0 |
| 425 | Who may issue warrant | 466 | 465 | Who may issue warrant | KER s.465 line 1486; UP s.465; heading sim 1.0 |
| 426 | Sentence on escaped convict when to take effect | 467 | 466 | Sentence on escaped convict when to take effect | KER s.466 line 1487; UP s.466; heading sim 1.0 |
| 427 | Sentence on offender already sentenced for another offence | 468 | 467 | Sentence on offender already sentenced for another offence | KER s.467 line 1489; UP s.467; heading sim 1.0 |
| 428 | Period of detention undergone by accused to be set off again | 469 | 468 | Period of detention undergone by accused to be set off against sentence of imprisonment | KER s.468 line 1492; UP s.468; heading sim 1.0 |
| 429 | Saving — sentences of imprisonment | 470 | 469 | Saving | KER s.469 line 1496; UP s.469; heading sim 1.0 |
| 430 | Return of warrant on execution of sentence | 471 | 470 | Return of warrant on execution of sentence | KER s.470 line 1497; UP s.470; heading sim 1.0 |
| 431 | Money ordered to be paid recoverable as fine | 472 | 471 | Money ordered to be paid recoverable as a fine | KER s.471 line 1499; UP s.471; heading sim 0.98 |

## 2. Rows set to verify

None. Every row was accepted (520 plus the 4 sub-section/lettered cases after manual reading, plus 11 deleted rows).

## 3. Counts

- Rows checked: 535 (484 numbered plus 51 lettered CrPC sections)
- `new` changed: 103 (6 to null/repealed, 2 from null to a section, 95 section to section)
- Unchanged and confirmed: 432
- verify: 0
- type changed: 10, 27, 39, 40, 144A, 153, 166A, 166B, 355, 404
- new_title replaced by the Gazette heading: 126 rows
- `new_provisions` replaced with T-250 section B (9 entries)
- BNSS sections with no CrPC row pointing at them: 86, 105, 107, 172, 336, 356, 398, 472, 530 (these are the BNSS-new sections or sub-section-only targets)
- Spot-check: 28 of 29 as listed; CrPC 362 comes out as BNSS 403, not 402 (see sources.md)

## 4. Manual heading reads (similarity below 0.70)

- CrPC 41A: BNSS 35(3): "The police officer shall, in all cases where the arrest of a person is not required under sub-section (1) issue a notice directing the person ... to appear before him" = CrPC 41A notice of appearance. UP lists 35(3)-(6) against 41A; Kerala lists "41 & 41A" against BNSS 35.
- CrPC 41C: BNSS 37: "(a) establish a police control room in every district and at State level; (b) designate a police officer ..." = CrPC 41C(1). Heading renamed in BNSS to "Designated police officer". Current `37(2)` was wrong; whole section 37 is the target.
- CrPC 136: BNSS 155: penalty "specified in section 223 of the BNS" for not performing the act under the section 154 order = CrPC 136 (order under 133). Gazette margin heading differs.
- CrPC 162: BNSS 181 "Statements to police and use thereof" = CrPC 162 "Statements to police not to be signed; use of statements in evidence".
- CrPC 182: BNSS 202 "Offences committed by means of electronic communications, letters, etc." = CrPC 182 "Offences committed by letters, etc.".
- CrPC 357B: BNSS 396(7): "The compensation payable by the State Government under this section shall be in addition to the payment of fine to the victim under section 65, section 70 ..." = CrPC 357B. UP lists 396(7) against 357B; Kerala lists "357A & 357B" against 396.
- CrPC 416: BNSS 456 "Commutation of sentence of death on pregnant woman" = CrPC 416 "Postponement of capital sentence on pregnant woman".


Signed: Ajay (CLO), 12 Oct 2026 IST. Any other change comes back to me.
