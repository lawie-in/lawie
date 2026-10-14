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

## Arjun (14 Oct, 17:12 UTC) — AC3: block, never proceed

When the Ink cost cannot be known, the action **blocks**. It does not go ahead with a notice.

- Reason: AC2 says the shown N equals the charged N. A charge whose price we could not show breaks that promise, and it is exactly what Ajay's public line ("you see the Ink cost before you generate") cannot survive. A notice does not make an unpriced charge priced.
- "Cannot be known" only happens when the price function fails (bug, bad kind, outage). That is an error, not a user state: the button is disabled, the user sees "We could not work out the Ink cost for this. Try again in a moment." with a retry, and the failure goes to Sentry with the document kind and action — no document content, no PII.
- Same rule on all three paths (Confirm, regenerate, add-section). No "proceed anyway" option in v1.
