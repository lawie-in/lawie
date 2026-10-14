# T-423: T-381 follow-ups, brief party seal

| Field  | Value                                                                     |
| ------ | ------------------------------------------------------------------------- |
| Status | Todo. Mahak, right after T-381. From T-381's reviewer, 13 Oct 2026. Priya |
| Owner  | Mahak (build), Ajay (State name text)                                     |
| Mode   | Small fix (drafting)                                                      |

## Acceptance criteria

1. The brief seal writes the State's display name from courtData.state (e.g. "Bihar"), not the court-picker id ("bihar"). The Memo then prints "State of Bihar".
2. The brief seal takes only values the brief accepted (buildBrief output), never raw request values.
3. Tests cover both points.

## Not here

- The form-path id→name fix goes to Kunal's T-396, with Ajay's State-line change.
- The card staying hidden on ambiguous, caveat or no-row packs goes to T-421, where the client-role question makes it reachable.
- Whether brief-party-fields.ts belongs in legal-content-paths.md is Ajay's call.
