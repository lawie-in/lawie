# T-441: remove judgment names from drafting prompts

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Status | Todo. Vishal, right after T-245a (same files). Priya, 14 Oct 2026      |
| Owner  | Vishal (build), Ajay (signs)                                           |
| Mode   | Full chain (legal content: drafting prompts)                           |

Source: Ajay, d5a3005 (T-245 file Addendum 2, #8). Must-fix: a prompt that names a judgment can make the model cite a case it cannot verify.

## Acceptance criteria

1. Remove the judgment names from these prompts: bail_cancellation entry 5, the bail_anticipatory twin, interim_bail prompt_context, and criminal_revision :219.
2. Add Ajay's signed sentence to each of those four: "Do not name any judgment… [Authority — add if relied upon]." (exact text in his Addendum 2 #8, byte for byte).
3. Run a catalogue-wide grep for other case names in document-rules, docs/templates and prompts. List every hit for Ajay; fix the ones he rules on.
4. Tests pin the removal and the new sentence. Golden snapshot changes are signed by Ajay.

## Out of scope

T-245a's old-law citations (a separate ticket on the same files; do T-245a first and merge it in).
