# T-687: The form route has no date-conflict check

Status: backlog (not assigned), raised 29 Oct 2026 by Vishal during T-678
Priority: P2. Needs Ajay.

## Problem
POST /generate-from-template (the form route) runs no date-conflict cross-check. A date put in the wrong field is delivered unchecked. The guided and pack routes do run the check (T-611/T-678). This gap predates T-678 and is outside its scope.

## Acceptance criteria (draft, to be confirmed with Ajay and Arjun)
1. Form-route drafts go through the same date cross-check as the guided route, after T-678's fix (each date matched to its own field).
2. A conflict is handled the same way as on the guided route: the draft is withheld and the user sees the same signed line.
3. Ajay rules on whether form fields, which the user has already labelled, need the check at all, or only the free-text fields.

Blocked on: T-678 merged; Ajay's ruling.
