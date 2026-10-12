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

## Arjun (12 Oct 2026): server-side lookup, not a JWT claim

**Decision: a server-side lookup.** The full design is the "Follow-up ticket" section at the end of `T-300-template-engine-form-keys-overwrite-server-values.md` (copy it here when building; the points are below).
- Add `enrollmentNumber` to drafting's own `User` model (`apps/drafting/src/models/User.model.ts`) as a read-only field on the same `users` collection, and read it by the JWT `sub`, once per request that builds a draft. Do not write it from drafting.
- **Why not a JWT claim:** a claim is frozen at sign-in and lives up to 7 days (refresh), so a corrected number would keep printing the old one; it also rides in every request and every log line that carries the token, for a value only draft-building needs. A lookup is one indexed read by `_id`, only where it is used.
- Pass it as `extra.enrollmentNumber` to the placeholder context, the annexures and the legacy `/generate` route, through one helper (like `resolveAdvocateName` in T-300). **Profile wins** when present; a typed `advocate_enrollment` is used only when the profile is empty (Ajay decides whether that fallback stays; if not, the form field becomes read-only and prefilled from the profile, a web change).
- A lookup failure (database error) is treated as "profile empty": the typed value stands; log at warn, never fail the draft.
- Tests: profile present beats a typed value and a legacy body value in all three places; profile empty falls back; lookup throws → typed value used, no crash; a user with no number prints a visible blank, never another user's.
- Files: drafting `User.model.ts`, the helper, `template-engine.service.ts` call site, `annexures.service.ts`, `documents.routes.ts` (the legacy path), tests. After T-300 merges (same files).
