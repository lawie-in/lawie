# T-237: earlier bail applications and undertakings in the other bail packs (signed)

Ajay (CLO), 12 Oct 2026 IST. Base read: `origin/develop_staging` e14cffd.

Read: T-237; T-200 (rule R0 to R3, the 11 Oct cue table, the 12 Oct per-pack cue map); `handoff/design/T-136-drafter-rules-signed.md` (B4, B5); `mandatoryClauses` and `promptInstructions` of `bail_regular`, `bail_anticipatory`, `interim_bail`, `bail_before_magistrate`. Nothing in code or packs was changed by me.

The lead applies this text **word for word**. JSON keys are as in the packs today. Any other wording, or any change to the text below, comes back to me.

No case law or section number is added by this sign-off. The Supreme Court authority on disclosing earlier bail applications noted in T-136 B4 is still **verify** and stays out of every pack.

## AC1: `earlier_applications` clause

Insert each object into `mandatoryClauses`, directly before the `prayer` clause. Do not touch `mandatory_clauses` (snake case) in `interim_bail` or `bail_before_magistrate`; the reader uses `mandatoryClauses` when both are present.

### `bail_anticipatory.json`

```json
{"id": "earlier_applications", "name": "Earlier Bail Applications", "required": true, "description": "Every earlier application for anticipatory bail or bail in this matter, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."}
```

### `interim_bail.json`

```json
{"id": "earlier_applications", "name": "Earlier Bail Applications", "required": true, "description": "Every earlier application for interim bail, bail or anticipatory bail in this matter, other than the pending main application, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."}
```

### `bail_before_magistrate.json`

```json
{"id": "earlier_applications", "name": "Earlier Bail Applications", "required": true, "description": "Every earlier bail application in this matter, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."}
```

### Drafter instruction (one new `promptInstructions` entry per pack)

Insert directly before the pack's last entry (the "Do NOT generate the verification clause ..." line).

| Pack | New entry, exact text |
|---|---|
| `bail_anticipatory` | `State every earlier application for anticipatory bail or bail in this matter that the BRIEF mentions: the court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no earlier application, do not say that this is the first application or that none is pending; write [To be confirmed: whether any earlier application for anticipatory bail or bail was made in this matter, to which court, and with what result].` |
| `interim_bail` | `Apart from the pending main application, state every earlier application for interim bail, bail or anticipatory bail in this matter that the BRIEF mentions: the court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no such earlier application, do not say that there was none; write [To be confirmed: whether any earlier application for interim bail, bail or anticipatory bail, other than the pending main application, was made in this matter, to which court, and with what result].` |
| `bail_before_magistrate` | `State every earlier bail application in this matter that the BRIEF mentions: the court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no earlier bail application, do not say that this is the first application or that none is pending; write [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result].` |

### Cue map entries (T-200 `(pack, clauseId) → cueSet`)

Two cue sets. `bail_regular` keeps its 11 Oct set unchanged.

- **EA-standard**: all: [any: `bail`, `जमानत`, `ज़मानत`], [any: `earlier`, `previous`, `prior`, `pending`, `rejected`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `लंबित`, `खारिज`, `ख़ारिज`, `निरस्त`, `अस्वीकृत`, `वापस`]
- **EA-interim**: all: [any: `bail`, `जमानत`, `ज़मानत`], [any: `earlier`, `previous`, `prior`, `rejected`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `खारिज`, `ख़ारिज`, `निरस्त`, `अस्वीकृत`, `वापस`]

Why they differ from the 11 Oct set: `before` is dropped (every bail paragraph says "before this Hon'ble Court"). EA-interim also drops `pending` and `लंबित`, because the `main_application_reference` paragraph of every interim draft says the main application is pending and would pass the cue.

| Pack | Clause id | Cue set | Mark |
|---|---|---|---|
| `bail_anticipatory` | `earlier_applications` | EA-standard | Approved |
| `bail_before_magistrate` | `earlier_applications` | EA-standard | Approved |
| `interim_bail` | `earlier_applications` | EA-interim | Approved |
| `bail_anticipatory` | `no_flight_risk` | undertaking cue (any `undertak`, `वचन`, `आश्वासन`). Replaces "none, R2b" of 12 Oct, because AC2 below gives it the undertaking meaning | Approved |
| `interim_bail` | `no_flight_risk` | none (not required after AC2, so not checked) | Approved |

## AC2: `no_flight_risk` descriptions (T-136 B5: never a statement of fact)

Keep the clause ids as they are (the cue map keys on them).

### `bail_anticipatory.json`: `no_flight_risk`

```json
{"id": "no_flight_risk", "name": "Undertakings", "required": true, "description": "Undertakings by the applicant for the future, if granted anticipatory bail: to make himself or herself available for interrogation by the police as and when required, not to make any inducement, threat or promise to any witness or other person acquainted with the facts of the case, not to leave India without the Court's permission, and to abide by the conditions imposed. Never a statement of fact."}
```

Same pack, `promptInstructions` entry 5 ("Include standard conditions the applicant is willing to comply with: ..."), replaced by:

`Give the undertakings as undertakings by the applicant for the future, never as facts and never as undertakings by the advocate: the applicant undertakes that, if granted anticipatory bail, the applicant will make himself or herself available for interrogation by the police as and when required, will not make any inducement, threat or promise to any witness or other person acquainted with the facts of the case, will not leave India without this Hon'ble Court's permission, and will abide by every condition this Hon'ble Court imposes.`

This is in AC2's scope: the clause and the instruction must say the same thing.

### `interim_bail.json`: `no_flight_risk`

```json
{"id": "no_flight_risk", "name": "Roots of the Applicant", "required": false, "description": "The applicant's residence, family, occupation and conduct, only as the brief states them. Where the brief states none, leave this out. Never a statement of fact the brief does not give."}
```

`required` goes to `false` on purpose. The future undertaking not to abscond is already in this pack's required `undertakings` clause. A required "roots" clause would push the Drafter to invent roots when the brief has none.

## AC3 to AC5

| Item | Mark |
|---|---|
| AC3: lead applies only the text above | Condition |
| AC4: one test per pack, a draft without the disclosure → `earlier_applications` missing; plus one `interim_bail` test where only the main-application paragraph is reported for it → `clause_not_in_paragraph` | Condition |
| AC5: list every moved golden snapshot in the merge note; I sign that list before merge | Condition |
| `display` name changes (`No Flight Risk` → `Undertakings` / `Roots of the Applicant`) may move snapshots; that is expected | Acceptable |

## Found while reading (outside T-237; for Priya to ticket)

| # | Pack | Finding | Mark |
|---|---|---|---|
| 1 | `bail_anticipatory` | `promptInstructions` entry 2 tells the Drafter to state grounds (clean antecedents, cooperation, malafide) whatever the brief says. Same defect T-136 fixed in `bail_regular` entry 3 | Blocker for `feature.fact_ledger` real users, not for this ticket |
| 2 | `bail_before_magistrate` | Entry 4 ("flight risk (no — give antecedents and roots) ...") asks for facts the brief may not give; `triple_test` description same | Blocker, as #1 |
| 3 | `bail_regular` | 11 Oct `earlier_applications` cue accepts `before`; move it to EA-standard | Risk, low (cues read only the reported paragraph) |

Signed: Ajay (CLO), 12 Oct 2026 IST. AC1 and AC2 text and the cue entries above, on the AC3 to AC5 conditions. Any later change needs a fresh sign-off.
