# Remaining work at the 15 Oct 2026 pause (Priya)

Founder paused the session at 56% of the weekly limit (stop at 60%). Everything below resumes from here.

## In flight (leads paused mid-ticket)

| Ticket | Lead | State |
| --- | --- | --- |
| T-451 judgment names in labels and clauses | Kunal | Built, one review pass; re-read of new route lines, branch CI, then READY. Ajay refs: db89fdd, 847ef1f, fdca4aa. |
| T-450 deeds and company packs | Shashank | Building. Ajay's rulings in 50dc3c1 (T-245 file). |
| T-448 writ packs | Mahak | Building (7 packs). Ajay byte-checks. |
| T-229 Sentry scrub | Tanvi | Developer done, tester running; errorHandler.ts added; worker.ts template gap from T-455 to include. |
| T-447 CI | Vishal | Merged 808647ff; CI result not yet seen. |
| Kunal format-only 19bff76f | Kunal | Landed as 591a3f74 (done). |

## Next in queue (not started)

- Vishal: T-453 (model switch verification; unblocked, founder did the settings), T-303 (spike script ready on feature/t-303-fir-spike; needs an Anthropic API key with a USD 5 limit), then T-301 and T-304 (uploads; need Rajesh's one-screen handoff and Arjun's re-scope).
- Shashank: after T-450, nothing queued. Mahak: after T-448, nothing. Kunal: after T-451, nothing. Tanvi: after T-229, T-455's worker.ts follow-up if not in T-229.
- Unassigned: T-456 (itat_appeal, Income-tax Act 2025; Ajay maps first), T-454 (upgrade-to-pro claims; Madhuri writes, Ajay signs), T-457 (post-v1 alias cleanup).
- T-229 AC4 and INTERNAL_SECRET rotation: founder.

## Waiting on others

- Ajay: T-456 section map; byte-checks for T-448, T-450; T-245b launch-catalogue list; T-441 groups.
- Arjun: T-382 alias confirm for T-457; cleanup date.
- Rajesh: T-301 one-screen handoff.
- Lawyer or founder: T-302 policy wording (Ajay sections 6 and 7).
- Madhuri and Ajay: T-454 text.

## Records not yet written to repo files

leads.md claim-record updates and "last done" entries for: T-398, T-431, T-441, T-438, T-444, T-444b, T-444c, T-361, T-378, T-455, T-236, T-449, T-447, T-452; row extensions for T-451, T-450, T-448, T-229, T-378. anushka-run.md entries for the same merges. parked.md: T-455 safe-log partial-PII note, T-378 ci.yml auth filter and .git-file guard case, T-236 two parked lines, T-444 V1.1 edge cases. multi-lead.md: the "build next ticket while waiting for the slot" rule. Board cards are current as of 11:12 UTC except T-229 and the uploads group.

## Founder-only steps (login needed)

GST_* environment values and signature image; registered address; nginx step; branch protection and branch cleanup; CODECOV_TOKEN; T-437 AC4; spike API key (T-303); T-302 policy wording; T-229 AC4 and INTERNAL_SECRET rotation; weekly hours for the organic launch (Meera assumes 8 to 10). Model settings are done.

## After the code

Anushka's end-to-end run on develop (needs everything merged and the develop deploy including the T-452 redeploy), her PASS, then the founder's release to main (T-403).

## Pause reports (11:12 UTC)

- Shashank: all merges green. T-450 stopped mid-developer; the pack edits are stashed locally in his worktree on branch feature/t-450-deeds-no-judgments (clean at 601ff134), nothing pushed. Risk: a stash lives only in his container. If the container is reclaimed, the edits are lost and T-450 restarts from Ajay's table (50dc3c1).
- Ajay: all sign-offs pushed (last 50dc3c1). Still owed: T-450 and T-451 byte checks, model-switch golden-run diffs, any moved goldens, itat mapping (T-456).
- Vishal: T-447 merged 808647ff, CI run 686 green. Branch clean, nothing in flight. T-453 and T-414 not started (T-414 also needs Ajay's ref; he asked me to put T-414 on his row).
