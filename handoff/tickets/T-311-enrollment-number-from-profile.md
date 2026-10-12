# T-311 — Drafting reads the advocate's enrollment number from the profile

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (mechanism: JWT claim or auth lookup). Ajay signs the drafting diff. Lead (build, auth + drafting) |
| Mode   | Full chain (auth + drafting, legal content) |
| Status | To do. Unassigned. Waits on Arjun's mechanism call. Auth part goes after Kunal's T-234/T-299 chain (same files). Found by Mahak in T-300, 12 Oct 2026 |

Only auth's `User.enrollmentNumber` holds the enrollment number. Drafting's JWT carries `{sub, email, name, role, plan}`, so drafting can't read it. T-300 therefore left the typed `advocate_enrollment` input (52 packs) and the legacy `advocateEnrollment` body field printing as typed (Ajay agreed; Arjun cc'd).

## Acceptance criteria

1. Drafting gets the signed-in advocate's enrollment number from auth, either as a JWT claim or by a server-side lookup. Arjun picks which.
2. The enrollment number printed in a draft comes from the profile. A typed `advocate_enrollment` field or a body `advocateEnrollment` value is ignored, as T-300 does for the advocate name.
3. With no enrollment number on the profile, the draft prints the existing blank or placeholder and does not fail.
4. Tests cover AC2 and AC3. Ajay signs the drafting diff.

Out of scope: editing the enrollment number on the profile page, and changing the 52 packs' form fields (they can stay; they're just ignored).
