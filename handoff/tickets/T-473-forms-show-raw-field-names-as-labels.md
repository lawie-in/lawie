# T-473: Forms still show raw field names as labels

| Field  | Value                                                                |
| ------ | -------------------------------------------------------------------- |
| Status | To do. V1 (Anushka run 4 FAIL, 16 Oct 2026). Priya                    |
| Owner  | Kunal (he built T-451's labels), Ajay (wording if any label is new)  |
| Mode   | Full chain                                                           |

## Source

Anushka, quality run 4: the forms still show raw labels such as "known_state_custody" instead of a plain description.

## What

Find every form field that shows its internal name and give it a plain label. Start with an Explore across all form configs for fields with no label, then fix them. Labels in legal packs: Ajay approves any new wording; no judgment names (T-451 rules).

## Acceptance criteria

- No form shows an internal field name (snake_case) as a label or hint, across all templates.
- A test fails if a field has no label.
- Ajay's ref if label wording is new.
