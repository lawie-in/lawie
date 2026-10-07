# T-001 — Dev lead accepts local ticket files

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Phase      | 0 — Prep                              |
| Owner      | Vishal (agent files), Arjun reviews   |
| Mode       | Config change, outside the crew chain |
| Status     | Done                                  |
| Depends on | None                                  |
| Branch     | chore/t-001-local-ticket-gate         |
| Created    | 2026-10-03                            |

## Goal

The dev lead can start work from a ticket file in `handoff/tickets/` instead of a Jira key.

## Context

- Founder decided on 3 Oct 2026: no Jira or Notion tickets until v1 is released. Tickets are local files, one per ticket.
- `.claude/agents/vishal.md` section 1 refuses any work without a `SCRUM-n` key. Every ticket in this folder would be refused today.
- `CLAUDE.md` names branches `feature/scrum-<n>-<slug>`.
- `.claude/DEV_TEAM_SPEC.md` section 5 (gate table) and section 10 ("A ticket with no SCRUM key is refused by the lead") say the same.
- The lead cannot run a ticket that changes its own gate, so this one is done by hand.

## Acceptance criteria

- The entry gate accepts a ticket ID `T-nnn` when its file exists in `handoff/tickets/` and has acceptance criteria.
- The gate still refuses when there is neither a `T-nnn` file nor a `SCRUM-n` key.
- The `SCRUM-n` path keeps working, because Jira resumes after v1.
- Branch names for local tickets are `feature/t-<nnn>-<slug>` or `fix/t-<nnn>-<slug>`, written into `CLAUDE.md`.
- The flow says who updates the Status line in a ticket file. The lead has Edit and Write disallowed, so it cannot be the lead.
- `DEV_TEAM_SPEC.md` sections 5 and 10 match the new gate.
- The other three gates are unchanged: Figma link for UI, ADR for architecture, Ajay sign-off for legal content.

## In scope

- `.claude/agents/vishal.md`
- `CLAUDE.md` (Branches section)
- `.claude/DEV_TEAM_SPEC.md` sections 5 and 10

## Out of scope

- Any change to the four crew agents or the hooks
- Any Jira or Notion change

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict | Note                                                                                                                          |
| -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Arjun    | Closed  | Merged to `develop` in PR #29. The gate text in `.claude/agents/vishal.md` accepts `T-nnn` files and still accepts `SCRUM-n`. |
