# T-634: T-613 follow-ups

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Polish |
| Owner  | a lead (drafting + web) |
| Mode   | Small fix |
| Status | To do. Raised 27 Oct 2026 from Shashank's T-613 merge (e4c22eec). Priya |

## Items
1. Comment-only nits: the stale "expected red" comment in t613-o39-route.test.ts:92-93; the isScopedCourtTemplate docstring (bailCourts.ts:34-35) should mention O.39.
2. SAVED_TYPE_NAMES lacks civil_court_junior (the raw id shows for a saved but unoffered type).
3. The Court.model.ts courtType enum is outdated (lacks civil_court_junior, supreme_court, tribunal, high_court_bench).
4. "Munsif" label: Ajay to verify.
5. Ajay's call: should indian-courts.json and courts.routes.ts be listed in legal-content-paths?
6. Anushka re-tests F3 (sale-deed date) and F6 (false "Missing part") on develop now that T-611 P2 is in.
