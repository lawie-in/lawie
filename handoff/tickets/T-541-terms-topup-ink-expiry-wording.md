# T-541: Terms: top-up Ink expiry wording, terms version bump

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Ajay (wording, AJ-535 ruling d1387549), a web lead (build) |
| Mode   | Small fix (web, legal content); MUST land before main |
| Status | To do. Priya |
| Source | Ajay on T-535 (21 Oct 2026) |

## Acceptance criteria
1. `apps/web/src/app/(marketing)/terms/page.tsx` (about line 156) says exactly: "Top-up Ink you buy separately does not expire while your account is open. It ends when your account is closed."
2. This narrows a promise, so `CURRENT_TERMS_VERSION` is bumped and "Last updated" moves to the release date; the re-accept prompt (T-343 pattern) fires for existing users.
3. Ajay byte-checks the page before merge.
4. Production does not exist yet (Arjun's ops note), so no live buyer holds the old term. Vikram confirms no top-up was sold in prod before this ships; if one was, those buyers keep the old term.
5. Tests for the version bump and the prompt.

## Files
apps/web: app/(marketing)/terms/page.tsx, the terms version constant and its tests (legal content: Ajay's sign-off).
