# T-407 — The s.138 model prompt never cites s.141 for an individual, HUF or unknown drawer

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Vishal (holds ai.service.ts and brief-drafter.ts) + Ajay; template-engine.service.ts in turn after Kunal's T-395 and Shashank's T-404 part 1 |
| Mode   | Full chain (legal content) |
| Status | To do. Vishal, after T-373 and T-397, before T-392. Ajay's ruling 2 on the T-363 fix. Split off by Shashank, 13 Oct 2026 |
| Source | Shashank's T-363 proprietor fix (ff08db3) did the twin side (s.141 header guard for company and partnership only) |

## Problem

The model prompt can still say "141" (company or firm liability) when the drawer is an individual, a HUF or unknown. Ajay says it must not.

## Where

- (a) template-engine.service.ts `buildAISystemPrompt` (~:1937/:1974) runs `related_acts` through `replacePlaceholders` with ctx, and ai.service.ts (~:676) passes ctx. A twin data change follows; Shashank does it.
- (b) brief-drafter.ts `actLines` (~:239) filters the pack's `relevantActs`. It needs a structured `show_if` (rule-pack.service.ts `readSections`/`RulePackAct` ~:113), plus a pack change Ajay signs.
- (c) the legacy prompt-assembler.ts (~:454), if s.138 still goes through it.

## Acceptance criteria

1. For drawer type individual, HUF or unknown, no prompt path (D1, brief, legacy) mentions s.141. For a company or partnership, it does.
2. Tests on each path.
3. Ajay signs the pack and twin changes.
