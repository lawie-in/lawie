# T-114 — List Helicone in the privacy policy

| Field      | Value                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                                                     |
| Owner      | Madhuri (text), Ajay signs, Vishal (page)                                                    |
| Mode       | Small web change                                                                             |
| Status     | Closed 4 Oct 2026, not built. Helicone is being removed (T-118), so there is nothing to list |
| Depends on | None                                                                                         |
| Branch     | fix/t-114-privacy-processors                                                                 |
| Created    | 2026-10-04                                                                                   |

## Goal

The privacy policy names every outside service that handles case details today.

## Context

- Found in T-302: production sends every draft through Helicone, and the privacy policy does not list it. The policy lists Razorpay, Anthropic, MongoDB Atlas, AWS and Google Workspace.
- This is true today and has nothing to do with uploads.
- The page is `apps/web/src/app/(marketing)/privacy/page.tsx`. `apps/web` has no tests.

## Acceptance criteria

- Section 5 of the policy lists Helicone and says some processors handle data outside India, using the text in the T-302 Result, section 6.
- Arjun records how long Anthropic and Helicone keep request data, whether it is used for training, and where it is stored.
- Helicone is set not to store request bodies, if the plan allows it.
- A screenshot of the changed page is in the PR.

## In scope

- `apps/web/src/app/(marketing)/privacy/page.tsx`

## Out of scope

- The upload wording (that ships with T-301)
- The terms page

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Ajay, T-302, 4 Oct 2026

## Closed, 4 Oct 2026

- The founder decided on 4 Oct 2026 to call Anthropic directly. T-118 removes Helicone.
- The privacy policy already lists Anthropic, so no policy change is needed for this.
- The record of how long Anthropic keeps request data moved to T-118.
- Ajay's note: until T-118 step 1 is deployed, production still sends drafts through Helicone and the policy does not say so. There are no users today. Do step 1 before any user is invited.
