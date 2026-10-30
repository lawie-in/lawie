# T-695: Stop the web build failing on the Google font fetch

Status: MERGED into develop_staging 3068ae5b (30 Oct 2026, CI 1594 green). Was: backlog (small). Raised 30 Oct 2026 by Priya. CI runs 1540 and 1549 both went red on "Web build" because `next build` could not fetch the Google font Lora (module-not-found in lora_*.module.css); both passed on re-run. Earlier flakes too.

Arjun ruling (30 Oct 2026, option 2): keep next/font/google and make CI resilient. Self-hosting is parked: unmodified TTFs come to 951 KB on first load, which fails T-584 (gate 350 KB; Tanvi also measured 462 KB in her report to Arjun). Parked branch: fix/t-695-self-host-fonts @ 81947995, unmerged. Tanvi's branch is kept with its measurements, and the follow-up is T-695b. The old AC 1 and 4 ("never fetches") were never the requirement and are removed.

## Acceptance criteria
1. CI prefetches the next/font/google fonts before `next build`, and retries the web build once, only when it failed on a font-fetch error (any other error fails at once).
2. No change to the fonts users see (same families, weights and styles); app code is unchanged.
3. Proof: run the web build in CI with the font fetch failing on the first try; it must recover by itself.
