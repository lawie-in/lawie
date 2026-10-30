# T-696: Dashboard mobile LCP is over 2.5 s

Status: backlog. Raised 30 Oct 2026 by Priya from Arjun (found in Tanvi's T-695 data). The dashboard's mobile LCP is already above 2.5 s before any font change, which is a T-584 regression in its own right.

## Acceptance criteria

1. Measure first: mobile Lighthouse on the dashboard, 3 runs, median LCP, with the commit SHA. Run it locally or on develop; CI has no offline Lighthouse (that is T-604).
2. Name the cause from the trace (largest element, blocking resources).
3. Fix it so the median mobile LCP is ≤2.5 s, without changing the design (Rajesh needs to see any visual change).
4. Report the before and after numbers.
