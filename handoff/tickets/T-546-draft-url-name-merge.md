# T-546: One name for the drafting URL variable

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build), Arjun reviews |
| Mode   | Small fix (gateway, billing, compose, `.env.example`) |
| Status | To do. After the v1 batch. Priya, 21 Oct 2026 |
| Source | Vishal's T-543 report |

## Problem
`DRAFTING_INTERNAL_URL` and `DRAFTING_SERVICE_URL` name the same thing. Two names means the founder sets two values and one gets missed.

## Acceptance criteria
One name in code, compose files and `.env.example`; the old name still read for one release with a warning; tests; the new name announced to the founder before deploy.
