# T-417: NCDRC pecuniary limit follows the 2021 Rules

| Field  | Value                                                                        |
| ------ | ---------------------------------------------------------------------------- |
| Status | Todo. Tanvi, after T-410 (or folded in if it fits). HIGH. Priya, 13 Oct 2026 |
| Owner  | Tanvi (build), Ajay (signs)                                                  |
| Mode   | Small fix (court-rules, legal content)                                       |

## Why

Ajay (2a8b722, handoff/legal/T-406-T-410-case-line-signed.md): apps/drafting/src/config/court-rules/ncdrc.json :13 and :52 say NCDRC hears complaints "exceeding Rs. 10 Crore". That's wrong under the 2021 Rules, which put it above Rs. 2 crore. A consumer complaint could be pointed at the wrong forum.

## Acceptance criteria

1. ncdrc.json :13 and :52 carry Ajay's signed replacement text, byte for byte.
2. The state commission court-rules records, including consumer_commission_generic.json, are audited for the old bands. Each hit is listed for Ajay, and his signed text is applied.
3. The golden is updated where the change shows, and Ajay signs the diff.
