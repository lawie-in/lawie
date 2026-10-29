# T-681 — Run 5 minors and draft latency (7-8 min)

Status: backlog. Source: Anushka run 5, prod v1.2.2, 29 Oct 2026 (handoff/tickets/anushka-run5-prod-v1.2.2.md). FAIL verdict.

## Acceptance criteria
1. Latency: about 7-8 minutes from first word to draft, every time. Arjun profiles where the time goes and proposes cuts.
2. The dashboard search for "injunction" or "partition" finds the TI and partition templates.
3. A TI date can be marked as something other than "Date of the title document" or "Not needed".
4. Remove the WS brief claim "extendable to 120 in non-commercial" (Ajay).
5. Custody-since isn't asked again when an arrest date is given. Exemption heading and body agree (CJM vs JMFC).
6. Bail "medical condition" accepted a court name as the answer: catch it as declaration does.

## Mode
Split as needed. Legal content for 4 and 5 (Ajay).


## P1 correction (Arjun, 29 Oct 2026)
The 7-minute wait comes AFTER "Confirm brief" (440–452 s on five runs, very constant), not during intake. generations.durationMs (~10 s) measures only the model stream. A constant ~7.3 min suggests a timeout or a buffered stream, not model latency. Nikhil is pulling the prod request timeline and the nginx proxy settings, and a read-only Explore is tracing the confirm-to-ready path. T-681a and T-681b are on HOLD until Arjun sends the cause note. T-681 becomes a small P1 fix for the next loop.

## P1 WITHDRAWN (Arjun, 29 Oct 2026)
Anushka's test script had a fixed 400 s wait after Confirm, so the 440–452 s totals came from the script, not the app. T-681 goes back to measurement. T-681a (duration_ms + runId) and T-681b (match caching) proceed as small tickets. Anushka is timing one real draft (Confirm, first text, ready). Nothing jumps the queue.
