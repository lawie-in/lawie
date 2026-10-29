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
