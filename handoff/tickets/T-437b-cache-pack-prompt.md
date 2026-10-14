# T-437b: cache the pack prompt behind a switch

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Status | Hold. Post-Anushka; after T-437 merges. Priya, 14 Oct 2026             |
| Owner  | Unassigned (build), Arjun (design), Ajay (prompt reorder sign-off)     |
| Mode   | Full chain (drafting prompts are legal content)                        |

Source: Arjun, `handoff/design/prompt-caching-arjun-14-oct.md` (revision section). T-437 ships option A only.

## Acceptance criteria

1. Pack blocks and the D1 skeleton move into a cached system block, behind AppSetting `ai.cache_pack_prompt` (default off).
2. With the setting off, prompts are byte-identical to today.
3. Ajay signs the prompt reorder before merge.
4. The golden check passes with the setting on.
5. Switch on per pack only at 3 or more drafts per hour (Arjun).

## Out of scope

Anything T-437 already ships (option A, preflight usage, cache cost path).
