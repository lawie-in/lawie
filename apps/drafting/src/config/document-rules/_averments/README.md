# Averment allowlists and banned-assertion lists (T-147c, ADR-022 section 2B)

LEGAL CONTENT. Every file here is Ajay's to sign. The files were drafted as
proposals in T-147c; each carries `"signed_by": null` until he signs it.

These lists are used only when `feature.fact_ledger` is on for the user and the
draft request carries the advocate's own fact ledger. With the switch off,
nothing here is read.

This folder is not a rule pack. The rule-pack loader and every other reader of
`document-rules/` list only `*.json` files directly in that folder, so a
subfolder is never read as a pack. Do not add a `.json` file for a pack
anywhere but here.

## Default-deny

The definition, word for word (lead, 10 Oct 2026; Ajay signs against it):

> `_default.json` holds generic risky factual-assertion phrases common across packs, plus a prompt rule that every factual averment must be backed by a ledger fact or written as `{{MISSING: label}}`.

The prompt rule is rule 1 and rule 4 of `DRAFTER_LEDGER_SYSTEM_PROMPT` in
`src/services/drafter.prompts.ts`.

## Which file a pack uses

- A pack with a file here (`<pack id>.json`) uses that file, laid over
  `_default.json`. An entry with the same `id` as a default entry replaces it.
- A file may say `"inherits": "<pack id>"`. It then takes that pack's entries
  too (the child's own entries win on the same `id`), with `key_map` renaming
  the parent's keys to the child's (`{"address": "applicant_address"}`). One
  level only: a file cannot inherit a file that inherits.
- A pack with no file here is default-deny: `_default.json` alone. No code
  change is needed to add or remove a pack's file.

Seeded (T-147c): `bail_regular`, `legal_notice_s138`, `bail_anticipatory`
(inherits `bail_regular`), `maintenance_bnss_144`, `default_bail`. Also
`interim_bail` and `bail_before_magistrate`, which inherit `bail_regular` so
that a bail pack is not all-banned.

## Shape of a file

```json
{
  "pack": "bail_regular",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned":  [{ "id": "...", "kind": "averment", "what": "...", "phrases": ["..."], "unlocked_by": <condition or null> }],
  "allowed": [{ "id": "...", "kind": "submission", "averment": "text with {{key}}", "requires": <condition> }]
}
```

- `signed_by`: the name of the person who signed the list (Ajay, CLO), and
  `signed_on` the date (`YYYY-MM-DD`). Null means proposed, not signed. A
  signature is not release on its own: a practising advocate still checks the
  list before the pack goes live.
- `kind`: `averment` is a statement of fact the deponent verifies.
  `submission` is an opinion argued for the client (for example "no flight
  risk"). The Drafter writes a submission only as "It is submitted that ...",
  among the grounds, never among the facts and never in an affidavit.
- `phrases`: ways the assertion is commonly written, English and Hinglish.
  The Drafter is told not to make the assertion in these or any other words.
  An undertaking for the future (not to abscond, not to tamper) is not a
  banned assertion.
- `unlocked_by` (banned) and `requires` (allowed): a condition on the
  ledger's facts. `null` means nothing unlocks it.
- Pairing rule (Ajay, T-147c review): a banned entry whose `unlocked_by` is
  not null must have an allowed entry with the same `id` (in the pack's
  merged list: its own, inherited and default entries). The loader throws
  otherwise, naming the pack and the id, and the draft request answers 503.
  While a banned entry stays banned, its allowed twin is not offered.
- `averment`: the words the Drafter may use. `{{<key>}}` is replaced by code
  with that ledger fact's `display`. An allowed entry whose text names a fact
  the ledger does not hold is not offered.

## Conditions

A condition names a ledger fact by its **key** (the brief item key, the same
as `LedgerFact.key`: `<name>` or `<group>.<name>`). Keys are stable; labels can
be reworded, so matching is by key only. Each key condition also carries the
fact's `label`, for the reader and for the sign-off table.

```json
{ "key": "applicant_occupation", "label": "Applicant occupation", "not_in": ["unemployed", "none"] }
{ "key": "antecedents", "label": "Criminal antecedents", "equals": ["none", "nil"] }
{ "key": "address", "label": "Residential Address", "present": true }
{ "all_of": [ <condition>, <condition> ] }
```

- `present`: the fact is in the ledger with a non-empty display.
- `equals`: the fact's value or display is one of the list, with case,
  spacing and punctuation folded. Use it for a negative: "no criminal
  antecedents" unlocks only on an explicit `antecedents = none`.
- `not_in`: the fact is present and is none of the list. This is how
  `applicant_occupation = unemployed` does not unlock "gainfully employed".
- `all_of`: every inner condition holds.
- A key that is not a fact never unlocks anything: missing, or still
  `unresolved` in the ledger.
- No chaining: a condition reads ledger facts only, never another averment.

Many keys named here are not yet facts of their pack (the table generated by
`scripts/averments-table.ts` marks them). Until the pack asks for that fact,
its entries stay banned. That is the default-deny working as intended.

## Sign-off table

```
yarn workspace @lawie/drafting report:averments [--out <file.md>]
```

prints one Markdown table per file, with the SHA-256 of the file in the
header, so a signature can name the exact version it signs.
