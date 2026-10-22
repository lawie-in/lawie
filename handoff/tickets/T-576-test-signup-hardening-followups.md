# T-576: Test sign-up hardening follow-ups (IP hash, bundle guard)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (low priority; follow-ups to T-563; not blocking v1; parked until after Anushka's first run) |
| Owner  | Arjun (design done), a lead (build; apps/auth, apps/web test) |
| Mode   | Small fix (auth, web test) |
| Status | To do. Raised by Arjun in the T-563 security review, 22 Oct 2026. Priya |
| Source | Arjun's T-563 review; see also T-574 (billing exclusions) and T-575 (internal cancel route) |

## Acceptance criteria
1. The IP hash in auth's sign-up throttle and in the bypass logs and limits becomes an HMAC with a server-side key, replacing unsalted truncated SHA-256. The key is a new env var name (names only in `.env.example`; the founder sets the value). Existing limits behave the same.
2. The T-563 client-bundle guard test also checks T-543's NEXT_PUBLIC name list, so no name outside that list can reach the browser bundle.
3. Tests for both.

## Files
Claimed by Priya when a lead takes it, after Vishal's T-563 has merged.
