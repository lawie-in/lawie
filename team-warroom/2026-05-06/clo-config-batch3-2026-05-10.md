# CLO Config Completion — Batch 3 Audit

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Scope:** 6 document-rules JSON files in `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/`

---

## Job 1 — Consumer Pecuniary Blocker (FIXED)

**File:** `consumer_complaint.json`
**Field:** `promptInstructions[6]`

### Diff

**OLD (line 113):**
```
"Establish pecuniary jurisdiction: District Commission (up to Rs.1 crore), State Commission (Rs.1-10 crore), National Commission (above Rs.10 crore)."
```

**NEW:**
```
"Establish pecuniary jurisdiction per the Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021 (Notification dated 30 December 2021): District Commission (up to Rs. 50 lakh), State Commission (above Rs. 50 lakh up to Rs. 2 crore), National Commission (above Rs. 2 crore)."
```

### Authority

Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021 — Notification dated 30 December 2021, Ministry of Consumer Affairs.

- District Commission: up to Rs. 50 lakh
- State Commission: above Rs. 50 lakh up to Rs. 2 crore
- National Commission: above Rs. 2 crore

### Verification

- `grep "crore"` on `consumer_complaint.json`: 1 reference (the corrected "Rs. 2 crore" thresholds in the new line). No remaining "1 crore" or "10 crore" references anywhere in the file.
- `mandatoryClauses[5]` (`pecuniary_jurisdiction`) has no hardcoded limit — description is generic, so no change needed.
- `prayerTemplate` uses `{amount}` placeholder — no hardcoded limit.
- No `form_schema` block in this file.

**Status:** Blocker cleared. Approved.

---

## Job 2 — `_meta` Block Added (6/6)

Identical `_meta` schema added at the top of each file (immediately after opening `{`):

```json
"_meta": {
  "description": "Document-rules config for <docType> — drives prompt, validation, mandatory clauses",
  "owner": "Ajay (CLO)",
  "validated_by": "Ajay (CLO) — audited 2026-05-10 in Batch 3 config completion pass",
  "last_updated": "2026-05-10",
  "change_protocol": "All edits require CLO sign-off. Vishal may flag missing fields by Jira ticket; he must not author legal content unilaterally."
}
```

| File | `_meta` added | Status |
|---|---|---|
| `bail_anticipatory.json` | Yes | Approved |
| `bail_regular.json` | Yes | Approved |
| `consumer_complaint.json` | Yes | Approved |
| `legal_notice_s138.json` | Yes | Approved |
| `legal_notice_s80.json` | Yes | Approved |
| `rent_agreement.json` | Yes | Approved |

---

## Additional Audit Findings

### Sanhita stack check (BNS/BNSS/BSA)

- `bail_anticipatory.json` — already references **BNSS 2023 (S.482, 483)** and instructs to use **BNS section numbers**, not IPC. Clean.
- `bail_regular.json` — already references **BNSS 2023 (S.480–484)** and **BNS 2023 (S.85, 86, 103)** with explicit IPC→BNS mapping callouts in `promptInstructions`. Clean.
- `legal_notice_s138.json` — references NI Act 1881 only. NI Act is not replaced by the Sanhita stack and remains the correct statute. No CrPC/IPC references. Clean.
- `legal_notice_s80.json` — references **CPC 1908 S.80** only. CPC is **not** replaced by the Sanhita stack (BNSS replaces only the *criminal* procedure code, i.e. CrPC; CPC governs civil procedure and is still in force). The S.80 notice requirement for suits against government is intact. Clean.
- `rent_agreement.json` — references TP Act 1882 and Registration Act 1908, both still in force. No Sanhita-stack relevance. Clean.

### Pecuniary / threshold check

- `consumer_complaint.json` — corrected above.
- `legal_notice_s138.json` — no hardcoded NI Act monetary limits (only `{amount}` placeholder). The statutory timelines (15-day demand, 30-day complaint window, 30-day notice window from dishonour knowledge) are all correctly stated per current NI Act. Clean.
- `legal_notice_s80.json` — S.80 CPC has no monetary threshold; only the 2-month notice period, which is correctly stated. Clean.
- `rent_agreement.json` — references the 11-month threshold for compulsory registration under S.17 Registration Act. Correct. Clean.

### "Pending CLO review" markers

None found in any of the 6 files. Nothing to clear.

### Other factual errors

None detected on this pass.

---

## JSON Validity Confirmation

All 6 files validated via `python3 -m json.tool`:

```
=== bail_anticipatory === VALID
=== bail_regular === VALID
=== consumer_complaint === VALID
=== legal_notice_s138 === VALID
=== legal_notice_s80 === VALID
=== rent_agreement === VALID
```

---

## Risks / Notes for Founder

- **Risk (Acceptable):** `bail_regular.json` mentions BNS 103 (Murder) as a relevant act — accurate, but for district-court advocates handling routine bail, the BNS mapping is intentionally minimal here. Full BNS coverage lives in the offences config (Batch 2 scope).
- **Risk (Acceptable):** `consumer_complaint.json` `promptInstructions` still references "Section 2(7), 2(11), 2(12), 34, 35, 38, 39, 69" of CPA 2019 — all current and correct.
- **Open item (not this batch):** None of these files have a `form_schema` block. If Batch 4/5 introduces dynamic form generation, the pecuniary-jurisdiction field will need a hard validator (`amount > 5000000 → block District Commission filing`). Flag for Priya.

**Batch 3 status:** Complete. Approved.

Ready for next task.
