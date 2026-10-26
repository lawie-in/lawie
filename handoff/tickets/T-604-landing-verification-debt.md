# T-604: Landing page verification debt (from Rajesh's acceptance run on ec2a6ec9)

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Growth (verification; no code unless a check fails) |
| Owner  | Rajesh (checks), a lead (runs the tools) |
| Mode   | Verification, small fix only if a check fails |
| Status | To do. Raised 26 Oct 2026 from Rajesh's acceptance report on the merged landing (T-601, ec2a6ec9). Priya |
| Source | Rajesh: checks 1, 2, 3, 4, 6, 7 pass from code; the rest were not run |

## To run
1. Playwright at 390/768/1280, both themes, for check 2 (the Inkwell holds its state) and check 3 (drawer keyboard order, aria-expanded flips) as behaviour. Kunal's t601 spec ran green on the three projects; confirm it covers both themes, or extend it.
2. Check 5 (sample folios) when the T-602 PDFs exist and Ajay has signed them.
3. Check 8: Lighthouse mobile >= 85, LCP < 2.5 s, CLS < 0.1 on the deployed develop page (Lighthouse is not installed anywhere today; run it from a machine that has it). CLS on the dev server was 0.014 to 0.022. Landing-owned JS about 8.5 KB gzipped (Arjun's measure).
4. Anushka's pass on develop covers the eye test (she is skipped for v1; the founder waived the gate).

## Notes
Rajesh's verdict: READY as built; these are verification debt, not defects.
