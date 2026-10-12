# T-308 — Privacy page says "no analytics", but Google Analytics loads on every page

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (writes and signs the wording). Lead (build, web). Arjun (facts) |
| Mode   | Small fix (web), legal content |
| Status | To do. Found by Arjun during T-306, 12 Oct 2026. Follows T-235 and T-284 |

T-235's privacy text says "no analytics, no first-party cookies", but `apps/web/src/app/layout.tsx` loads Google Analytics 4 on every page. After T-306, analytics loads on public pages only (Arjun's design). The policy must say exactly what is true.

## Acceptance criteria

1. Arjun states the facts after T-306: which pages load GA4, what it collects, what cookies it sets.
2. Ajay writes and signs the privacy wording (and cookie wording if needed).
3. The lead applies it word for word to `apps/web/src/app/(marketing)/privacy/page.tsx`.
