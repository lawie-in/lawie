# T-654 — Web: an absent confirm_missing_party_keys means "unknown", so refetch the brief

Status: backlog (unassigned). Arjun ruling, 28 Oct 2026, a T-644 follow-up. Web only, small.

## Problem
An older O.39 brief without `confirm_missing_party_keys` lets the screen enable Confirm, and then the server refuses (no Ink is taken).

## Acceptance criteria
1. An absent field means "unknown", not []. Do not revive the local non-answer check (FR-5a keeps one copy).
2. The web re-fetches the brief from the server once. If the field is still absent after that, Confirm is disabled and a short line asks the user to refresh. The wording is Ajay's to sign; Arjun's draft is "Refresh to continue".
3. The server refusal stays as the backstop.
4. Tests: field absent → refetch → field present enables the normal flow; field still absent → Confirm disabled.
