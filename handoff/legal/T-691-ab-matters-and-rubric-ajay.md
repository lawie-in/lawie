# T-691: drafter A/B, matters and rubric (Ajay, CLO)

29 Oct 2026. The A/B runs after T-686.

## (1) Four argued-pack matters (fictional facts only)

| # | Matter | Source |
|---|---|---|
| 1 | Regular bail, grounds argued (parity, custody length, no antecedents) | `scripts/golden-set/fixtures/23-run3-regular-bail-patna.json` |
| 2 | Anticipatory bail, grounds argued | `24-run3-anticipatory-bail-gaya.json` |
| 3 | O.39 R.1 & 2 temporary injunction: prima facie case, balance of convenience, irreparable injury | **New fixture**: there is no O.39 golden today |
| 4 | Quashing under s.528 BNSS (the old s.482 CrPC) | **New fixture**: there is no quashing golden today |

- Spare, if a new fixture is not ready: `26-certiorari-civil-court-order-art-227.json`.
- The two new fixtures are drafted by the dev from fictional facts, using placeholders (`Sample Person 1/2`, `Plot 000, Sample Nagar`). I sign their facts (`"ajay"` field) before the run.

## (2) Rubric

Anushka's rubric is confirmed: blockers, majors, minors, and "would I file it". These legal items are **blockers** in it:
- a wrong or invented citation, section or case;
- a repealed code cited where BNSS/BNS/BSA applies (the old IPC/CrPC/IEA equivalent alongside is fine);
- any fact not in the input (T-675);
- any change to signed text (skeletons, averments, disclaimers);
- a wrong court or cause title.

## Blind conditions

- Same facts, ledger, prompts and gates for both models. Only the drafter model differs.
- Outputs are labelled A/B at random per matter. The key is held by Arjun until all scoring is in.
- Anushka scores independently. I check citations and legal accuracy separately on the same blind outputs and send my findings before the key is opened.
- A draft that the gates withhold counts as withheld and is scored as such, never as a re-run.
- No real client data, and no outputs or document content in logs beyond ids.

## Fixtures 39–46 signed (Ajay, 30 Oct 2026; feature/t-691-ab @ commit SHA ba9a2828)

I read all eight myself. Facts: fictional placeholders throughout. BNS/BNSS sections checked: 318(4) and 351(2) (cheating; intimidation), 303(2) (theft), 115(2) and 352 (hurt; insult). Dates are consistent and after 1 Jul 2024. No case law. The bail and quashing provision strings match the signed forms (T-245 table and Addendum 1; T-239 bail files). The O.39 prayer (a) is byte for byte as in T-613 (b).

**Signed, with these edits** (the `"ajay"` field is set to `"Ajay, 30 Oct 2026, T-691 (handoff/legal/T-691-ab-matters-and-rubric-ajay.md)"`):

- **41, 43, 44, court:** the catalogue has no Civil Judge court for Lucknow, Ludhiana or Mysuru, so these run before "District Judge". Under s.15 CPC a suit lies in the lowest competent court, so that heading is a **known T-674 catalogue gap**, the same in both arms. Scorers exclude the cause-title court line on 41/43/44 from the A/B comparison and note it once. The facts stay.
- **45, police station:** also accept `Police Station Thana Govindpura` (transliterated).

**The four questions:**

1. **The 45/46 non-answers in v2:** keep the expectations. Mark them `known pipeline gap until T-683c (AJ-683-M2 in v2)`, scored the same in both arms and not a model difference.
2. **45 custody:** the T-665b closed list governs the code, and T-676 states the intent. They agree, with one extension, signed: after trimming, the back-reference span may also end with a **custody-state tail**: `jail mein hai`, `jail mein`, `जेल में है`, `जेल में`, `in jail`, `in custody`, `in judicial custody`. So `tab se jail mein hai` counts as `tab se`. This is safe by the same construction, and all the R1/B1/B5 gates still apply. It goes into T-665b's build.
3. **41–43 valuation:** keep. It is not just a permission. Order VII Rule 1(i) CPC requires the plaint to state the value of the subject-matter for jurisdiction and court fees, so the given value must appear. Change each `why` to cite `O.VII R.1(i) CPC; T-675 (valuation from the given value)`.
4. **Expectations vs scoring:** noted. The expectations document each matter, Anushka's blind score decides the A/B, and my citation check runs blind before the key is opened.

Edits are limited to the `ajay` field, the 41/43/44 scoring note, the 45 police-station option, the 45/46 gap tags and the 41–43 `why` text. A delta limited to those I approve on sight.
