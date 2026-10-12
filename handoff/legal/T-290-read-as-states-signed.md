# T-290: "Read as" line while loading and on failure (signed, 12 Oct 2026 IST)

Ajay (CLO). Adds two rows to `handoff/design/T-290-section-picker-hint.md` §1. Same style rules as S2–S6 (no ellipsis).

| # | When | Exact string |
|---|---|---|
| S7 | The check is still running | `Checking this section` |
| S8 | The check failed (network or server error) | `Could not check this section. Check the Act and the number before you generate.` |

Rules
1. Never show no line: a missing line reads as "nothing wrong".
2. S8 uses the S6 style (`text-red-500`), S7 the normal "Read as" style. Both inside the same `aria-live="polite"` element.
3. S8 is replaced by S2–S6 as soon as a retry succeeds. It never blocks generation.
