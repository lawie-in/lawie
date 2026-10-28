# T-644 — O.39 cause title shows {plaintiff}/{defendant} unfilled on prod

Status: assigned to vishal, 28 Oct 2026. Seen in the prod drafting error log after the v1.2.0 deploy (Arjun, 27 Oct 2026).

## Problem
The drafting log shows `System placeholder "{plaintiff}"/"{defendant}" unfilled (temporary_injunction_o39, cause_title)`. An advocate can see an O.39 draft whose cause title still has raw placeholders.

## Acceptance criteria
1. The O.39 cause title fills the plaintiff and defendant from the held facts.
2. If either fact is missing, the T-611/T-637 gate asks for it. A raw `{plaintiff}` or `{defendant}` never reaches the draft or the editor.
3. A test reproduces the logged case using fictional data only.
4. This touches legal content (an O.39 template or renderer), so Ajay signs off.
