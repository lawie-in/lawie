# T-335 — Two places where the fact ledger and the brief can disagree

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Arjun (mechanism). Lead (build, drafting) |
| Mode   | Small fix |
| Status | To do. Not v1-blocking. Mahak after T-190 (same files). Found in the T-190 review, 12 Oct 2026 |

## Problems

1. The advocate answers "Not known" on a key that the description had filled. A later re-read brings the description fact back, because `carryOver` only carries `asked` facts.
2. Since T-147b, a `keep` value from an earlier brief is not written to a new ledger after a description edit.

## Acceptance criteria

1. An advocate's "Not known" survives a later re-read of the description.
2. A `keep` value carries into the new ledger after a description edit.
3. Tests for both.
