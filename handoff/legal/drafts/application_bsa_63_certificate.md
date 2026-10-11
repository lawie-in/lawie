# T-239 b1 #17 application_bsa_63_certificate (draft for Ajay)

Status: DRAFT, not signed. Mapping checked against `config/sections/iea-to-bsa.json`: IEA 65A -> BSA 62, IEA 65B -> BSA 63, and the note "BSA 63(4) carries the certificate requirement" (also `new_provisions["63(4)"]`). IEA 65B(4) as the certificate sub-section is from certain knowledge. Nothing else cited.

| Field | Value |
|---|---|
| id | `application_bsa_63_certificate` |
| displayName | Application to Place Electronic Record and Certificate on Record (BSA 63 / IEA 65B) |
| category | Criminal: complaints, police, trial applications |
| court_levels | `["magistrate", "cjm", "sessions"]` |
| Ink | S = 1 |
| Anushka tier | B (court filing) |
| averments file | `_averments/application_bsa_63_certificate.json`, `inherits: null` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Sakshya Adhiniyam (BSA), 2023",
    "sections": [
      { "number": "62", "description": "Special provisions as to evidence relating to electronic record" },
      { "number": "63", "description": "Admissibility of electronic records; sub-section (4): certificate for an electronic record" }
    ]
  },
  {
    "act": "Indian Evidence Act, 1872 (IEA) — only where PROCEDURE CODE is CrPC and Evidence Act (T-245)",
    "sections": [
      { "number": "65A", "description": "Special provisions as to evidence relating to electronic record" },
      { "number": "65B", "description": "Admissibility of electronic records; sub-section (4): certificate for an electronic record" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\n\n{caseNomenclature}\n\n{complainantOrState} ... {prosecutionLabel}\nVERSUS\n{accused} ... Accused\n\nAPPLICATION ON BEHALF OF: {applicant} ... {applicantLabel}",
  "partyDesignations": [
    { "role": "prosecution", "label": "Complainant / Prosecution" },
    { "role": "accused", "label": "Accused" },
    { "role": "applicant", "label": "Applicant (complainant or accused, as the brief gives)" }
  ],
  "caseNomenclature": "{caseType} No. {caseNumber}\nAPPLICATION TO PLACE ON RECORD ELECTRONIC RECORD(S) WITH CERTIFICATE UNDER {governing_provision}"
}
```

`{governing_provision}` is filled by code from `procedure_code` (T-245; pair IEA 65B → BSA 63):
- BNSS and BSA: `Section 63 of the Bharatiya Sakshya Adhiniyam, 2023`
- CrPC and Evidence Act: `Section 65B of the Indian Evidence Act, 1872`
- no choice: `[To be confirmed: Section 65B IEA or Section 63 BSA]`

## mandatoryClauses

```json
[
  { "id": "case_particulars", "name": "Case Particulars", "required": true, "description": "Case number, the parties, and the present stage, as the brief gives them." },
  { "id": "record_description", "name": "Description of the Electronic Record", "required": true, "description": "Each electronic record (for example a video, call recording, message, e-mail, CCTV footage), the device or system it was produced from, the medium on which it is filed, and its relevance, only as the brief gives them." },
  { "id": "certificate", "name": "Certificate", "required": true, "description": "That a certificate under the provision cited in the heading is filed with the application, or will be filed, and who signed or will sign it, as the brief gives it; the blank where it does not. Never a statement that the certificate meets the statutory conditions." },
  { "id": "custody_of_device", "name": "Custody of the Original Device", "required": false, "description": "Where the original device or medium is and who holds it, as the brief gives it." },
  { "id": "relief_sought", "name": "Relief Sought", "required": true, "description": "That the record and the certificate be taken on record, and any further direction the brief asks for." },
  { "id": "prayer", "name": "Prayer", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." },
  { "id": "advocate_details", "name": "Advocate Details", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Take on record the electronic record(s) described in this application, filed on {filingMedium}, together with the certificate under {governing_provision};
b) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, {relation} {parentName}, aged about {age} years, resident of {address}, the {applicantLabel} in the above case, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to the best of my knowledge and belief. No part of it is false and nothing material has been concealed therein.

Verified at {place} on this {date}.

(Signature)
{applicant}
```

## filingChecklist

```json
[
  "Application, with copies as the court's practice requires",
  "Electronic record(s) on the medium the court accepts (pen drive / CD / DVD), sealed and labelled as the court's practice requires",
  "Certificate for each electronic record, signed as the statute requires (check the form and the signatories against the BSA before filing)",
  "Hash value of each file, if the certificate states one",
  "Transcript / printout of the electronic record, if relied on",
  "Copy of the application served on the other side",
  "Court fee / stamp as per local rules, if any (cue only)"
]
```

## promptInstructions

```json
[
  "Draft an application asking the court to take on record one or more electronic records together with the certificate for them. Cite as the provision the one given in ACTS: Section 63 of the Bharatiya Sakshya Adhiniyam, 2023, and Section 63(4) for the certificate.",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Describe each electronic record, the device or system it came from, the medium on which it is filed, and why it is relevant, only as the BRIEF gives them. Do not add a date, time, duration, file name, hash value or device detail the BRIEF does not give.",
  "Say who signed, or will sign, the certificate, and in what capacity, only as the BRIEF gives it; otherwise write [To be confirmed: who has signed the certificate and in what capacity]. Do not state that the certificate satisfies the conditions of Section 63, that the device was in regular use or operating properly, that the record is genuine, unaltered or untampered, or that it is admissible. Those are for the certificate and for the court.",
  "Do not set out the contents of the certificate in the application; the certificate is a separate document filed with it. Refer to it as the certificate in the form prescribed under section 63(4) of the BSA. Do not draft the Schedule.",
  "Do not say that the application is made at the proper stage or within time, and do not say why it was not filed earlier, unless the BRIEF says so.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Use formal, respectful legal language appropriate for Indian courts.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `case_type`, `case_number` | Case type and number | text | yes | Nomenclature |
| `court_name`, `state` | Court | as bail_regular | yes | Cause title |
| `complainant_or_state`, `accused_name` | Parties | text | yes | Cause title |
| `applicant_side` | Applicant is | select: complainant / prosecution / accused | yes | Labels |
| `fir_date` | Date the case began (FIR, complaint or suit) | date | no | Procedure switch (T-245): IEA 65B → BSA 63 |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of offence | date | no | Shown if given |
| `records` | Electronic records (one line each: what, source device, medium) | repeater (text) | yes | record_description |
| `filing_medium` | Medium filed on | text | yes | Prayer |
| `certificate_signatory` | Who signed / will sign the certificate, and capacity | text | no | certificate; unlocks |
| `certificate_status` | Certificate filed with this application? | select: filed / to be filed / not instructed | yes | certificate |
| `hash_values` | Hash values (as stated in the certificate) | textarea | no | Unlocks |
| `device_custody` | Where the original device is, and with whom | text | no | custody_of_device; unlocks |
| applicant identity keys | Applicant name, parentage, age, address | text | yes | Verification |

## _averments (`_averments/application_bsa_63_certificate.json`)

```json
{
  "pack": "application_bsa_63_certificate",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "certificate_compliant",
      "kind": "submission",
      "what": "The certificate satisfies the statutory conditions / the record is admissible",
      "phrases": ["the certificate is in compliance with section 63", "satisfies all the conditions of section 65B", "the electronic record is admissible", "duly certified as required by law"],
      "unlocked_by": null
    },
    {
      "id": "record_genuine",
      "kind": "averment",
      "what": "The record is genuine, unaltered or untampered",
      "phrases": ["the recording is genuine", "has not been tampered with", "no alteration has been made", "original and unedited", "asli recording hai"],
      "unlocked_by": null
    },
    {
      "id": "device_regular_use",
      "kind": "averment",
      "what": "The device was in regular use and operating properly",
      "phrases": ["the device was regularly used", "was operating properly at all material times", "the computer was in lawful control"],
      "unlocked_by": null
    },
    {
      "id": "certificate_signatory",
      "kind": "averment",
      "what": "Who signed the certificate and in what capacity",
      "phrases": ["the certificate has been signed by the person in charge", "signed by a person occupying a responsible official position", "signed by the expert"],
      "unlocked_by": { "key": "certificate_signatory", "label": "Who signed / will sign the certificate, and capacity", "present": true }
    },
    {
      "id": "hash_value",
      "kind": "averment",
      "what": "The hash value of a file",
      "phrases": ["the hash value is", "SHA-256 value", "MD5 hash"],
      "unlocked_by": { "key": "hash_values", "label": "Hash values", "present": true }
    },
    {
      "id": "device_custody",
      "kind": "averment",
      "what": "Where the original device is kept",
      "phrases": ["the original device is in the possession of", "the original phone is preserved", "the DVR is in safe custody"],
      "unlocked_by": { "key": "device_custody", "label": "Where the original device is, and with whom", "present": true }
    }
  ],
  "allowed": [
    { "id": "certificate_signatory", "kind": "averment", "averment": "the certificate is signed, or is to be signed, by {{certificate_signatory}}", "requires": { "key": "certificate_signatory", "label": "Who signed / will sign the certificate, and capacity", "present": true } },
    { "id": "hash_value", "kind": "averment", "averment": "the hash value(s) stated in the certificate are {{hash_values}}", "requires": { "key": "hash_values", "label": "Hash values", "present": true } },
    { "id": "device_custody", "kind": "averment", "averment": "the original device or medium is with {{device_custody}}", "requires": { "key": "device_custody", "label": "Where the original device is, and with whom", "present": true } }
  ]
}
```

Pairing check: certificate_signatory, hash_value, device_custody have twins; certificate_compliant, record_genuine, device_regular_use are null.

## T-200 cue map entries

None. Not a bail template; no `earlier_applications` clause. Proposed cue for `certificate` only if you want one: all: [any: `certificate`, `प्रमाण-पत्र`, `प्रमाणपत्र`], [any: `63`, `65B`, `to be confirmed: who has signed`].

## Verify (not in signed text)

- BSA 63(2) conditions and 63(1) deeming: not cited.
- BSA repeal and savings provision (section number and whether pending proceedings continue under the IEA). Repo `iea-to-bsa.json` maps IEA 167 -> BSA 170 ("No new trial ..."), which I believe is wrong (BSA 170 is, from knowledge, repeal and savings). Not cited anywhere.
- Procedural route for filing documents in a criminal trial (stage at which the prosecution / accused may file; BNSS provisions) and in civil suits (CPC Order VII r.14, Order VIII r.1A, Order XIII) if a civil variant is built.
- Whether a certificate can be filed later than the record (court practice; a timing ground some advocates rely on).

## Notes for Ajay

- Blocker outside this template (for the section tables): `iea-to-bsa.json` appears off by one around BSA 57-61. From knowledge: IEA 62 -> BSA 57, 63 -> 58, 64 -> 59, 65 -> 60, and BSA 61 is a new provision on electronic or digital records. The table says 62 -> 58, 63 -> 59, 64 -> 60, 65 -> 61. Same doubt on IEA 167 -> BSA 170. 65A -> 62 and 65B -> 63 agree. This spec cites only 62, 63, 63(4). Needs a bare-act check and a Priya ticket.
- Switch key (Ajay ruling): T-245 `fir_date`, labelled "Date the case began (FIR, complaint or suit)", with `procedure_code`; the pair IEA 65B → BSA 63 follows `procedure_code`.
- Risk: category. The same application is common in civil suits. A civil variant needs CPC routes (Verify) and a separate id or a court-rules overlay.
- Acceptable: short (S = 1).
