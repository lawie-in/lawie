# T-388 — The Ink cost is shown before every charge, and always equals the charge

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) + Ajay (public line) |
| Mode   | Small fix |
| Status | To do. Kunal, after T-379. Ajay's conditions for the public line (3c535be), 13 Oct 2026 |
| Source | Ajay's review of T-372 |

## Acceptance criteria

1. Every path that charges Ink shows the cost before the charge, including regenerate and add-section, not only Confirm.
2. The shown N equals the charged N, pinned by a test per path that reads both from the same price function.
3. If the cost can't be known, the action either blocks or shows a clear notice. It never proceeds silently; today it shows nothing.
4. Kunal sends Ajay screenshots for 1 and 3. Only after Ajay's OK may public copy say "You see the Ink cost before you generate a draft." Until then the signed T-238 FAQ line stays.
